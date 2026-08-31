
import { supabase, isSupabaseConfigured } from './supabase';
import { apiClient, dedupe } from './api.client';
import {
  Attendance,
  AttendanceChangeEvent,
  AttendanceCorrectionRequest,
  AttendancePayrollLock,
  AttendancePayrollLockEvent,
} from '../types';
import { organizationService } from './organization.service';
import { notificationService } from './notification.service';
import { workdaySessionManager } from './workday/workdaySessionManager';
import { ReconcileResult } from './workday/workdaySessionManager.types';
import { convertToWebP } from '../utils/imageConvert';
import { checkInSyncQueue, classifySyncError } from './attendance/syncQueue';
import { CheckInSyncEntry } from './attendance/syncQueue.types';
import { buildAttendanceCheckInParams, ensureAttendanceEventId } from './attendance/checkInPayload';
import { buildAttendanceCheckOutParams, ensureCheckOutEventId } from './attendance/checkOutPayload';
import { AttendanceCorrectionInput, buildAttendanceCorrectionParams, validateAttendanceCorrection } from './attendance/correctionPayload';
import { PayrollLockAdvanceInput, buildPayrollLockParams, validatePayrollLockAdvance } from './attendance/payrollLock';

const SELFIE_WEBP_QUALITY = 0.65;
const SELFIE_MAX_DIMENSION = 720;
const SELFIE_BUCKET = 'selfies';

// Cache keyed by query window: "sinceDate|untilDate|employeeId|orgId"
const attCache = new Map<string, { data: Attendance[]; ts: number }>();
const ATT_CACHE_TTL = 2 * 60 * 1000;

const DEFAULT_DAYS = 30;
const daysAgoISO = (days: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
};

export interface GetAttendanceOptions {
  since?: string;
  until?: string;
  employeeId?: string;
  maxRows?: number;
  skipSelfieUrls?: boolean;
}

// ─── Async selfie upload ──────────────────────────────────────────────────────

interface PendingSelfie {
  recordId: string;
  selfieDataUrl: string;
  queuedAt: number;
  evidenceType?: 'CHECK_IN' | 'CHECK_OUT';
}

const SELFIE_QUEUE_KEY = 'openhr_pending_selfies';
const MAX_SELFIE_RETRIES = 3;

const readSelfieQueue = (): PendingSelfie[] => {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(SELFIE_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
};

const writeSelfieQueue = (queue: PendingSelfie[]) => {
  try {
    if (typeof localStorage === 'undefined') return;
    if (queue.length === 0) localStorage.removeItem(SELFIE_QUEUE_KEY);
    else localStorage.setItem(SELFIE_QUEUE_KEY, JSON.stringify(queue));
  } catch (e) {
    console.warn('[AttendanceService] Could not persist selfie queue:', e);
  }
};

const uploadSelfieOnce = async (
  recordId: string,
  selfieDataUrl: string,
  evidenceType: 'CHECK_IN' | 'CHECK_OUT' = 'CHECK_IN',
): Promise<void> => {
  if (!isSupabaseConfigured()) throw new Error('Supabase not configured');
  const webpBlob = await convertToWebP(selfieDataUrl, SELFIE_WEBP_QUALITY, SELFIE_MAX_DIMENSION);
  const path = `${recordId}/${evidenceType === 'CHECK_OUT' ? 'checkout' : 'selfie'}.webp`;
  // upsert:false so Supabase Storage RLS only evaluates the INSERT policy.
  // selfies_update policy requires (storage.foldername)[1] = auth.uid() but
  // we use <recordId>/ as folder — upsert:true would trigger UPDATE eval
  // and 403 for regular employees. recordId is unique per check-in row.
  // On retry, a prior partial success returns 409 "already exists" — we
  // treat that as success and continue to the DB patch step (idempotent).
  const { error: uploadErr } = await supabase.storage
    .from(SELFIE_BUCKET)
    .upload(path, webpBlob, { upsert: false, contentType: 'image/webp' });
  if (uploadErr) {
    const msg = String((uploadErr as any).message || '');
    const isDuplicate =
      msg.toLowerCase().includes('already exists') ||
      (uploadErr as any).statusCode === '409' ||
      (uploadErr as any).statusCode === 409;
    if (!isDuplicate) throw uploadErr;
  }
  if (evidenceType === 'CHECK_IN') {
    // Check-in creates the row before its asynchronous evidence upload, so it
    // still needs the path linked afterward. Check-out stores its deterministic
    // path atomically inside submit_attendance_check_out.
    const { error: updateErr } = await supabase
      .from('attendance')
      .update({ selfie: path })
      .eq('id', recordId);
    if (updateErr) throw updateErr;
  }
};

const uploadSelfieWithRetry = async (
  recordId: string,
  selfieDataUrl: string,
  evidenceType: 'CHECK_IN' | 'CHECK_OUT' = 'CHECK_IN',
): Promise<void> => {
  let lastErr: any;
  for (let attempt = 1; attempt <= MAX_SELFIE_RETRIES; attempt++) {
    try {
      await uploadSelfieOnce(recordId, selfieDataUrl, evidenceType);
      attendanceService.clearCache();
      apiClient.notify();
      return;
    } catch (e) {
      lastErr = e;
      const delay = Math.pow(3, attempt - 1) * 1000;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  const queue = readSelfieQueue();
  queue.push({ recordId, selfieDataUrl, queuedAt: Date.now(), evidenceType });
  writeSelfieQueue(queue);
  throw lastErr;
};

const notifyLineManagerOfLate = async (data: Attendance): Promise<void> => {
  if (!isSupabaseConfigured()) return;
  const orgConfig = await organizationService.getNotificationConfig();
  if (!orgConfig.enabledTypes.includes('ATTENDANCE')) return;
  const { data: empRow } = await supabase
    .from('profiles')
    .select('line_manager_id')
    .eq('id', data.employeeId.trim())
    .single();
  const managerId = empRow?.line_manager_id;
  if (!managerId) return;
  await notificationService.createNotification({
    userId: managerId,
    type: 'ATTENDANCE',
    title: `${data.employeeName} checked in late`,
    message: `Checked in at ${data.checkIn} on ${data.date}`,
    referenceType: 'attendance',
  });
};

// Combine YYYY-MM-DD date + HH:mm[:ss] time into ISO timestamp for timestamptz columns.
// If value already looks like an ISO timestamp, pass through.
function hhmmToISO(hhmm: string | undefined, dateYMD?: string): string | null {
  if (!hhmm || hhmm === '-' || String(hhmm).trim() === '') return null;
  if (/T\d{2}:\d{2}/.test(hhmm)) return hhmm; // already ISO
  const date = dateYMD || new Date().toISOString().split('T')[0];
  const parts = String(hhmm).split(':');
  if (parts.length < 2) return null;
  const h = parts[0].padStart(2, '0');
  const m = parts[1].padStart(2, '0');
  const s = (parts[2] || '00').padStart(2, '0');
  const iso = new Date(`${date}T${h}:${m}:${s}`);
  return isNaN(iso.getTime()) ? null : iso.toISOString();
}

const buildAttendancePayload = (
  data: Attendance,
  orgId: string | undefined,
  legacyReview = false,
): any => ({
  employee_id: data.employeeId.trim(),
  employee_name: data.employeeName,
  date: data.date,
  check_in: hhmmToISO(data.checkIn, data.date),
  status: data.status,
  remarks: data.remarks || '',
  location: data.location?.address || '',
  latitude: parseFloat(String(data.location?.lat || 0)),
  longitude: parseFloat(String(data.location?.lng || 0)),
  duty_type: data.dutyType,
  organization_id: orgId,
  ...(legacyReview ? {
    requires_review: true,
    review_status: 'PENDING',
    change_reason: 'LEGACY_OFFLINE_CHECKIN_NO_GPS',
  } : {}),
});

const submitVerifiedCheckIn = async (data: Attendance): Promise<string> => {
  const { data: created, error } = await supabase.rpc(
    'submit_attendance_check_in',
    buildAttendanceCheckInParams(data),
  );
  if (error) throw error;
  if (!created?.id) throw new Error('Attendance check-in did not return a record');
  return created.id;
};

const submitVerifiedCheckOut = async (data: Attendance): Promise<string> => {
  const { data: updated, error } = await supabase.rpc(
    'submit_attendance_check_out',
    buildAttendanceCheckOutParams(data),
  );
  if (error) throw error;
  if (!updated?.id) throw new Error('Attendance check-out did not return a record');
  return updated.id;
};

// Supabase stores check_in/check_out as timestamptz (full ISO string).
// The rest of the app expects HH:mm. Convert only when the value looks like
// an ISO timestamp; leave bare HH:mm strings (legacy data) unchanged.
function isoToHHMM(val: string | null | undefined): string {
  if (!val) return '';
  if (/^\d{2}:\d{2}/.test(val)) return val.slice(0, 5); // already HH:mm
  const d = new Date(val);
  if (isNaN(d.getTime())) return val;
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
}

const mapAttendance = (r: any): Attendance => ({
  id: r.id,
  clientEventId: r.client_event_id || undefined,
  employeeId: r.employee_id ? r.employee_id.toString().trim() : '',
  employeeName: r.employee_name,
  date: r.date,
  checkIn: isoToHHMM(r.check_in),
  checkOut: isoToHHMM(r.check_out),
  checkOutEventId: r.check_out_event_id || undefined,
  status: r.status as any,
  location: {
    lat: Number(r.latitude) || 0,
    lng: Number(r.longitude) || 0,
    address: r.location || 'Unknown',
    accuracyM: r.location_accuracy_m == null ? undefined : Number(r.location_accuracy_m),
    capturedAt: r.location_captured_at || undefined,
  },
  checkOutLocation: r.check_out_captured_at ? {
    lat: Number(r.check_out_latitude) || 0,
    lng: Number(r.check_out_longitude) || 0,
    address: r.check_out_location || 'Unknown',
    accuracyM: r.check_out_accuracy_m == null ? undefined : Number(r.check_out_accuracy_m),
    capturedAt: r.check_out_captured_at,
  } : undefined,
  // selfie stores the storage path; signed URLs resolved after fetch (private bucket)
  selfie: r.selfie || undefined,
  checkOutSelfie: r.check_out_selfie || undefined,
  checkOutRemarks: r.check_out_remarks || undefined,
  remarks: r.remarks || '',
  dutyType: r.duty_type as any,
  organizationId: r.organization_id,
  changeReason: r.change_reason || undefined,
  modifiedVia: r.modified_via || undefined,
  requiresReview: Boolean(r.requires_review),
  reviewStatus: r.review_status || 'NOT_REQUIRED',
  autoClosedAt: r.auto_closed_at || undefined,
  reviewedAt: r.reviewed_at || undefined,
  reviewNote: r.review_note || undefined,
});

const mapAttendanceCorrection = (r: any): AttendanceCorrectionRequest => ({
  id: r.id,
  attendanceId: r.attendance_id || undefined,
  employeeId: String(r.employee_id || '').trim(),
  employeeName: r.employee_name,
  workDate: r.work_date,
  requestType: r.request_type,
  originalCheckIn: r.original_check_in ? isoToHHMM(r.original_check_in) : undefined,
  originalCheckOut: r.original_check_out ? isoToHHMM(r.original_check_out) : undefined,
  proposedCheckIn: r.proposed_check_in ? String(r.proposed_check_in).slice(0, 5) : undefined,
  proposedCheckOut: r.proposed_check_out ? String(r.proposed_check_out).slice(0, 5) : undefined,
  reason: r.reason || '',
  status: r.status,
  reviewerId: r.reviewer_id || undefined,
  reviewerNote: r.reviewer_note || undefined,
  reviewedAt: r.reviewed_at || undefined,
  created: r.created,
  organizationId: r.organization_id,
});

const mapAttendancePayrollLock = (r: any): AttendancePayrollLock => ({
  organizationId: r.organization_id,
  lockedThrough: r.locked_through,
  lockedBy: r.locked_by,
  note: r.note,
  updated: r.updated,
});

const mapAttendancePayrollLockEvent = (r: any): AttendancePayrollLockEvent => ({
  id: r.id,
  organizationId: r.organization_id,
  previousLockedThrough: r.previous_locked_through || undefined,
  lockedThrough: r.locked_through,
  actorId: r.actor_id,
  note: r.note,
  created: r.created,
});

export const attendanceService = {
  clearCache() {
    attCache.clear();
  },

  async getAttendance(options: GetAttendanceOptions = {}): Promise<Attendance[]> {
    const since = options.since !== undefined ? options.since : daysAgoISO(DEFAULT_DAYS);
    const until = options.until || '';
    const employeeId = options.employeeId || '';
    const maxRows = options.maxRows || 2000;
    const skipSelfieUrls = options.skipSelfieUrls ?? false;
    const orgId = apiClient.getOrganizationId() || '';
    const cacheKey = `${since}|${until}|${employeeId}|${orgId}`;

    const cached = attCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < ATT_CACHE_TTL) return cached.data;

    return dedupe(`attendance:${cacheKey}`, async () => {
      if (!isSupabaseConfigured()) {
        console.warn('[AttendanceService] Supabase not configured');
        return [];
      }
      try {
        const role = apiClient.getAuthRole();
        const isCrossOrg = role === 'ADMIN' || role === 'HR';
        console.log('[AttendanceService] Fetching — orgId:', orgId, 'role:', role, 'crossOrg:', isCrossOrg);

        // Paginate through Supabase (capped at 1000 rows per request)
        const PAGE_SIZE = 1000;
        const allData: any[] = [];
        let offset = 0;
        while (offset < maxRows) {
          let query = supabase
            .from('attendance')
            .select('*')
            .order('date', { ascending: false })
            .range(offset, offset + PAGE_SIZE - 1);

          if (orgId && !isCrossOrg) query = query.eq('organization_id', orgId);
          if (since)      query = query.gte('date', since);
          if (until)      query = query.lte('date', until);
          if (employeeId) query = query.eq('employee_id', employeeId);

          const { data, error } = await query;
          if (error) throw error;
          if (!data || data.length === 0) break;
          allData.push(...data);
          offset += PAGE_SIZE;
          if (data.length < PAGE_SIZE) break; // last page
        }

        const result = allData.map(mapAttendance);
        const tasyeeaRecords = result.filter(r => r.employeeName?.toLowerCase().includes('tasyeea'));
        console.log('[AttendanceService] Total records:', result.length, '(pages fetched:', Math.ceil(offset / PAGE_SIZE) + ')', '| Tasyeea records:', tasyeeaRecords.length);

        // Resolve signed URLs for selfies (private bucket — public URLs return 403).
        // Skip when caller only needs counts/metadata (e.g. dashboard stats).
        // Batch paths into chunks of 500 — Supabase Storage caps createSignedUrls
        // at 1 000 paths per request; exceeding that returns an error which the
        // old code silently ignored, leaving raw storage paths that <img> can't render.
        const SIGN_CHUNK_SIZE = 500;
        const paths = !skipSelfieUrls
          ? result.flatMap(r => [r.selfie, r.checkOutSelfie].filter(Boolean) as string[])
          : [];
        if (paths.length > 0) {
          const urlMap = new Map<string, string>();
          let signFailures = 0;

          for (let i = 0; i < paths.length; i += SIGN_CHUNK_SIZE) {
            const chunk = paths.slice(i, i + SIGN_CHUNK_SIZE);
            try {
              const { data: signed, error: signErr } = await supabase.storage
                .from(SELFIE_BUCKET)
                .createSignedUrls(chunk, 3600);
              if (signErr) {
                signFailures++;
                console.warn('[AttendanceService] createSignedUrls chunk failed:',
                  signErr.message || signErr, `(chunk ${Math.floor(i / SIGN_CHUNK_SIZE) + 1}, ${chunk.length} paths)`);
                continue;
              }
              if (signed) {
                for (const s of signed) urlMap.set(s.path!, s.signedUrl!);
              }
            } catch (e: any) {
              signFailures++;
              console.warn('[AttendanceService] createSignedUrls chunk threw:',
                e?.message || e, `(chunk ${Math.floor(i / SIGN_CHUNK_SIZE) + 1}, ${chunk.length} paths)`);
            }
          }

          if (urlMap.size > 0) {
            result.forEach(r => {
              if (r.selfie) r.selfie = urlMap.get(r.selfie) ?? r.selfie;
              if (r.checkOutSelfie) r.checkOutSelfie = urlMap.get(r.checkOutSelfie) ?? r.checkOutSelfie;
            });
          }
          if (signFailures > 0) {
            console.warn('[AttendanceService] Selfie sign failures:',
              signFailures, 'chunk(s) —', urlMap.size, 'of', paths.length, 'paths signed');
          }
        }

        attCache.set(cacheKey, { data: result, ts: Date.now() });
        return result;
      } catch (e: any) {
        console.error('[AttendanceService] Failed to fetch attendance:', e?.message || e);
        return [];
      }
    });
  },

  // FROZEN: delegates to workdaySessionManager.
  // Do not change this delegation without the plan-approval gate in CLAUDE.md.
  async getActiveAttendance(employeeId: string): Promise<Attendance | undefined> {
    const { active } = await workdaySessionManager.reconcileOpenSessions(employeeId);
    return active;
  },

  async getActiveAttendanceWithReconciliation(employeeId: string): Promise<ReconcileResult> {
    return workdaySessionManager.reconcileOpenSessions(employeeId);
  },

  async saveAttendance(data: Attendance) {
    if (!isSupabaseConfigured()) return;
    const attendanceWithEventId = ensureAttendanceEventId(data);
    let createdId: string;
    try {
      createdId = await submitVerifiedCheckIn(attendanceWithEventId);
    } catch (err: any) {
      const syncErr = classifySyncError(err);
      if (syncErr.retryable) {
        try {
          checkInSyncQueue.enqueue({
            kind: 'CHECK_IN',
            payload: attendanceWithEventId,
            occurredAt: Date.now(),
          });
          console.warn('[AttendanceService] Check-in enqueued for later sync:', syncErr.code);
          return { queued: true as const };
        } catch (enqueueErr) {
          console.error('[AttendanceService] Could not enqueue check-in:', enqueueErr);
        }
      }
      throw err;
    }
    attendanceService.clearCache();
    apiClient.notify();

    if (attendanceWithEventId.selfie) {
      uploadSelfieWithRetry(createdId, attendanceWithEventId.selfie).catch((err) => {
        console.warn('[AttendanceService] Selfie upload failed after retries, queued:', err?.message || err);
      });
    }

    if (attendanceWithEventId.status === 'LATE') {
      notifyLineManagerOfLate(attendanceWithEventId).catch((e: any) => {
        console.error('[AttendanceService] Failed to send late alert:', e?.message || e);
      });
    }
    return { queued: false as const };
  },

  hasPendingCheckIn(employeeId: string, date: string): boolean {
    return checkInSyncQueue.list().some((entry) =>
      entry.kind === 'CHECK_IN'
      && entry.status !== 'DEAD_LETTER'
      && entry.payload.employeeId === employeeId
      && entry.payload.date === date,
    );
  },

  async saveCheckOut(data: Attendance) {
    if (!isSupabaseConfigured()) return;
    const checkOutWithEventId = ensureCheckOutEventId(data);
    let recordId: string;
    try {
      recordId = await submitVerifiedCheckOut(checkOutWithEventId);
    } catch (err: any) {
      const syncErr = classifySyncError(err);
      if (syncErr.retryable) {
        try {
          checkInSyncQueue.enqueue({
            kind: 'CHECK_OUT',
            payload: checkOutWithEventId,
            occurredAt: Date.now(),
          });
          console.warn('[AttendanceService] Check-out enqueued for later sync:', syncErr.code);
          return { queued: true as const };
        } catch (enqueueErr) {
          console.error('[AttendanceService] Could not enqueue check-out:', enqueueErr);
        }
      }
      throw err;
    }
    attendanceService.clearCache();
    apiClient.notify();
    if (checkOutWithEventId.checkOutSelfie) {
      uploadSelfieWithRetry(recordId, checkOutWithEventId.checkOutSelfie, 'CHECK_OUT').catch((err) => {
        console.warn('[AttendanceService] Check-out selfie upload failed after retries, queued:', err?.message || err);
      });
    }
    return { queued: false as const };
  },

  hasPendingCheckOut(employeeId: string, date: string): boolean {
    return checkInSyncQueue.list().some((entry) =>
      entry.kind === 'CHECK_OUT'
      && entry.status !== 'DEAD_LETTER'
      && entry.payload.employeeId === employeeId
      && entry.payload.date === date,
    );
  },

  async saveManualAttendance(data: Attendance): Promise<void> {
    if (!isSupabaseConfigured()) return;
    const orgId = apiClient.getOrganizationId();
    const { error } = await supabase
      .from('attendance')
      .insert(buildAttendancePayload(data, orgId ?? undefined));
    if (error) throw error;
    attendanceService.clearCache();
    apiClient.notify();
  },

  async drainCheckInQueue(): Promise<void> {
    if (!isSupabaseConfigured()) return;
    const orgId = apiClient.getOrganizationId();
    const MAX_DRAIN_PER_TICK = 10;
    let drained = 0;

    while (drained < MAX_DRAIN_PER_TICK) {
      const entry: CheckInSyncEntry | null = checkInSyncQueue.pickNext();
      if (!entry) break;

      try {
        let createdId: string;
        if (entry.kind === 'CHECK_OUT') {
          createdId = await submitVerifiedCheckOut(entry.payload as Attendance);
        } else if (entry.payload.clientEventId && entry.payload.location?.capturedAt && entry.payload.location.accuracyM != null) {
          createdId = await submitVerifiedCheckIn(entry.payload as Attendance);
        } else {
          // Backward compatibility for entries queued before migration 0042.
          const effectiveOrgId = entry.payload.organizationId || orgId;
          const legacyPayload = buildAttendancePayload(entry.payload as Attendance, effectiveOrgId ?? undefined, true);
          const { data: existing, error: existingError } = await supabase
            .from('attendance')
            .select('id')
            .eq('employee_id', legacyPayload.employee_id)
            .eq('date', legacyPayload.date)
            .eq('check_in', legacyPayload.check_in)
            .maybeSingle();
          if (existingError) throw existingError;
          if (existing?.id) {
            createdId = existing.id;
          } else {
            const { data: created, error } = await supabase
              .from('attendance')
              .insert(legacyPayload)
              .select('id')
              .single();
            if (error) throw error;
            createdId = created.id;
          }
        }
        checkInSyncQueue.markSuccess(entry.id);
        drained += 1;

        if (entry.kind === 'CHECK_OUT' && entry.payload.checkOutSelfie) {
          uploadSelfieWithRetry(createdId, entry.payload.checkOutSelfie, 'CHECK_OUT').catch((e) => {
            console.warn('[AttendanceService] Queued check-out selfie upload failed:', e?.message || e);
          });
        } else if (entry.payload.selfie) {
          uploadSelfieWithRetry(createdId, entry.payload.selfie).catch((e) => {
            console.warn('[AttendanceService] Queued selfie upload failed:', e?.message || e);
          });
        }
      } catch (err: any) {
        const syncErr = classifySyncError(err);
        checkInSyncQueue.markFailure(entry.id, syncErr);
        break;
      }
    }

    if (drained > 0) {
      attendanceService.clearCache();
      apiClient.notify();
    }
  },

  async retryPendingSelfies(): Promise<void> {
    if (!isSupabaseConfigured()) return;
    const queue = readSelfieQueue();
    if (queue.length === 0) return;
    console.log(`[AttendanceService] Retrying ${queue.length} pending selfie upload(s)`);
    const remaining: PendingSelfie[] = [];
    for (const entry of queue) {
      try {
        await uploadSelfieOnce(entry.recordId, entry.selfieDataUrl, entry.evidenceType || 'CHECK_IN');
      } catch {
        if (Date.now() - entry.queuedAt < 7 * 24 * 60 * 60 * 1000) {
          remaining.push(entry);
        }
      }
    }
    writeSelfieQueue(remaining);
    if (remaining.length === 0) attendanceService.clearCache();
  },

  async updateAttendance(id: string, data: Partial<Attendance>) {
    if (!isSupabaseConfigured()) return;
    // Resolve target date for time→timestamp conversion: explicit data.date, then existing row.
    let targetDate = data.date;
    if (!targetDate && (data.checkIn || data.checkOut)) {
      const { data: existing } = await supabase
        .from('attendance')
        .select('date')
        .eq('id', id.trim())
        .single();
      targetDate = existing?.date;
    }
    const updates: any = {};
    if (data.date)     updates.date = data.date;
    if (data.checkIn)  updates.check_in = hhmmToISO(data.checkIn, targetDate);
    if (data.checkOut) updates.check_out = hhmmToISO(data.checkOut, targetDate);
    if (data.remarks !== undefined) updates.remarks = data.remarks;
    if (data.status)   updates.status = data.status;
    if (data.changeReason !== undefined) updates.change_reason = data.changeReason;
    const { error } = await supabase.from('attendance').update(updates).eq('id', id.trim());
    if (error) throw error;
    attendanceService.clearCache();
    apiClient.notify();
  },

  async getAttendanceAuditEvents(attendanceId: string): Promise<AttendanceChangeEvent[]> {
    if (!isSupabaseConfigured()) return [];
    const { data, error } = await supabase
      .from('attendance_change_events')
      .select('id, attendance_id, actor_type, change_type, reason_code, note, created')
      .eq('attendance_id', attendanceId.trim())
      .order('created', { ascending: false });
    if (error) throw error;
    return (data || []).map((event: any) => ({
      id: event.id,
      attendanceId: event.attendance_id,
      actorType: event.actor_type,
      changeType: event.change_type,
      reasonCode: event.reason_code,
      note: event.note || undefined,
      created: event.created,
    }));
  },

  async getAttendanceCorrectionRequests(): Promise<AttendanceCorrectionRequest[]> {
    if (!isSupabaseConfigured()) return [];
    const { data, error } = await supabase
      .from('attendance_correction_requests')
      .select('*')
      .order('created', { ascending: false })
      .limit(500);
    if (error) throw error;
    return (data || []).map(mapAttendanceCorrection);
  },

  async submitAttendanceCorrection(input: AttendanceCorrectionInput): Promise<void> {
    if (!isSupabaseConfigured()) return;
    const validationError = validateAttendanceCorrection(input);
    if (validationError) throw new Error(validationError);
    const { error } = await supabase.rpc(
      'submit_attendance_correction_request',
      buildAttendanceCorrectionParams(input),
    );
    if (error) throw error;
    apiClient.notify();
  },

  async reviewAttendanceCorrection(
    requestId: string,
    decision: 'APPROVED' | 'REJECTED',
    note: string,
  ): Promise<void> {
    if (!isSupabaseConfigured()) return;
    if (note.trim().length < 5) throw new Error('Review note must contain at least 5 characters.');
    const { error } = await supabase.rpc('review_attendance_correction_request', {
      p_request_id: requestId.trim(),
      p_decision: decision,
      p_note: note.trim(),
    });
    if (error) throw error;
    attendanceService.clearCache();
    apiClient.notify();
  },

  async getAttendancePayrollLock(): Promise<AttendancePayrollLock | null> {
    if (!isSupabaseConfigured()) return null;
    const orgId = apiClient.getOrganizationId();
    if (!orgId) return null;
    const { data, error } = await supabase
      .from('attendance_payroll_locks')
      .select('*')
      .eq('organization_id', orgId)
      .maybeSingle();
    if (error) throw error;
    return data ? mapAttendancePayrollLock(data) : null;
  },

  async getAttendancePayrollLockEvents(): Promise<AttendancePayrollLockEvent[]> {
    if (!isSupabaseConfigured()) return [];
    const orgId = apiClient.getOrganizationId();
    if (!orgId) return [];
    const { data, error } = await supabase
      .from('attendance_payroll_lock_events')
      .select('*')
      .eq('organization_id', orgId)
      .order('created', { ascending: false })
      .limit(20);
    if (error) throw error;
    return (data || []).map(mapAttendancePayrollLockEvent);
  },

  async advanceAttendancePayrollLock(input: PayrollLockAdvanceInput): Promise<void> {
    if (!isSupabaseConfigured()) return;
    const validationError = validatePayrollLockAdvance(input);
    if (validationError) throw new Error(validationError);
    const { error } = await supabase.rpc('advance_attendance_payroll_lock', buildPayrollLockParams(input));
    if (error) throw error;
    apiClient.notify();
  },

  async reviewAttendanceException(
    attendanceId: string,
    decision: 'APPROVED' | 'CORRECTED',
    note: string,
    correctedCheckOut?: string,
    attendanceDate?: string,
  ) {
    if (!isSupabaseConfigured()) return;
    const { error } = await supabase.rpc('review_attendance_exception', {
      p_attendance_id: attendanceId.trim(),
      p_decision: decision,
      p_note: note.trim(),
      p_check_out: decision === 'CORRECTED'
        ? hhmmToISO(correctedCheckOut, attendanceDate)
        : null,
    });
    if (error) throw error;
    attendanceService.clearCache();
    apiClient.notify();
  },

  async deleteAttendance(id: string) {
    if (!isSupabaseConfigured()) return;
    const { error } = await supabase.from('attendance').delete().eq('id', id.trim());
    if (error) throw error;
    attendanceService.clearCache();
    apiClient.notify();
  },
};
