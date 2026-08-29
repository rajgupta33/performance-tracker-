import { supabase } from '../../services/supabase';
import { convertToWebP } from '../../utils/imageConvert';
import type { CompleteVisitInput, CustomerSummary, FieldVisit, PreparedCompleteVisitInput, StartVisitInput } from './visits.types';

const VISIT_EVIDENCE_BUCKET = 'visit-evidence';

export const buildVisitEvidencePath = (visit: Pick<FieldVisit, 'id' | 'organizationId' | 'employeeId'>, fileId: string): string =>
  `${visit.organizationId}/${visit.employeeId}/${visit.id}/completion-${fileId}.webp`;

const mapCustomer = (row: any): CustomerSummary => ({
  id: row.id,
  name: row.name,
  customerType: row.customer_type,
  address: row.address || undefined,
  territoryId: row.territory_id || undefined,
});

const mapVisit = (row: any): FieldVisit => {
  const customerRow = Array.isArray(row.customers) ? row.customers[0] : row.customers;
  return {
    id: row.id,
    organizationId: row.organization_id,
    employeeId: row.employee_id,
    customerId: row.customer_id,
    customer: customerRow ? mapCustomer(customerRow) : undefined,
    clientEventId: row.client_event_id,
    status: row.status,
    locationStatus: row.location_status,
    purpose: row.purpose || undefined,
    outcome: row.outcome || undefined,
    products: row.products || [],
    potentialValue: row.potential_value == null ? undefined : Number(row.potential_value),
    followUpOn: row.follow_up_on || undefined,
    startAccuracyM: Number(row.start_accuracy_m),
    endAccuracyM: row.end_accuracy_m == null ? undefined : Number(row.end_accuracy_m),
    startDistanceM: row.start_distance_m == null ? undefined : Number(row.start_distance_m),
    endDistanceM: row.end_distance_m == null ? undefined : Number(row.end_distance_m),
    startedAt: row.started_at,
    completedAt: row.completed_at || undefined,
    notes: row.notes || undefined,
    evidencePath: row.evidence_path || undefined,
  };
};

const requireData = <T>(data: T | null, error: any): T => {
  if (error) throw error;
  if (!data) throw new Error('Visit request returned no data');
  return data;
};

export const visitsService = {
  async listCustomers(search = ''): Promise<CustomerSummary[]> {
    let query = supabase
      .from('customers')
      .select('id,name,customer_type,address,territory_id')
      .eq('active', true)
      .eq('approval_status', 'APPROVED')
      .order('name')
      .limit(50);
    const normalized = search.trim().replace(/[%_,()]/g, ' ');
    if (normalized) query = query.ilike('name', `%${normalized}%`);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data || []).map(mapCustomer);
  },

  async getActiveVisit(employeeId: string): Promise<FieldVisit | null> {
    const { data, error } = await supabase
      .from('field_visits')
      .select('*,customers(id,name,customer_type,address,territory_id)')
      .eq('employee_id', employeeId)
      .eq('status', 'IN_PROGRESS')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ? mapVisit(data) : null;
  },

  async startVisit(input: StartVisitInput): Promise<FieldVisit> {
    const { data, error } = await supabase.rpc('start_field_visit', {
      p_visit_id: input.visitId,
      p_customer_id: input.customerId,
      p_client_event_id: input.clientEventId,
      p_latitude: input.position.latitude,
      p_longitude: input.position.longitude,
      p_accuracy_m: input.position.accuracyM,
      p_captured_at: input.position.capturedAt,
      p_purpose: input.purpose || null,
    });
    return mapVisit(requireData(Array.isArray(data) ? data[0] : data, error));
  },

  async completeVisit(input: CompleteVisitInput): Promise<FieldVisit> {
    const evidenceBlob = await convertToWebP(input.evidenceDataUrl, 0.72, 1280);
    if (evidenceBlob.type !== 'image/webp') throw new Error('This browser could not prepare the visit photo. Please retake it.');
    return this.completePreparedVisit({
      ...input,
      evidenceBlob,
      evidenceFileId: crypto.randomUUID(),
    });
  },

  async completePreparedVisit(input: PreparedCompleteVisitInput): Promise<FieldVisit> {
    const { data: visitRow, error: visitError } = await supabase
      .from('field_visits')
      .select('id,organization_id,employee_id')
      .eq('id', input.visitId)
      .single();
    if (visitError) throw visitError;
    if (!visitRow) throw new Error('Visit not found');

    const evidencePath = buildVisitEvidencePath({
      id: visitRow.id,
      organizationId: visitRow.organization_id,
      employeeId: visitRow.employee_id,
    }, input.evidenceFileId);
    if (input.evidenceBlob.type !== 'image/webp') throw new Error('Visit evidence must be WebP.');

    const { error: uploadError } = await supabase.storage
      .from(VISIT_EVIDENCE_BUCKET)
      .upload(evidencePath, input.evidenceBlob, { upsert: false, contentType: 'image/webp' });
    if (uploadError) {
      const duplicate = String(uploadError.message || '').toLowerCase().includes('already exists')
        || (uploadError as any).statusCode === 409 || (uploadError as any).statusCode === '409';
      if (!duplicate) throw uploadError;
    }

    const { data, error } = await supabase.rpc('complete_field_visit', {
      p_visit_id: input.visitId,
      p_latitude: input.position.latitude,
      p_longitude: input.position.longitude,
      p_accuracy_m: input.position.accuracyM,
      p_captured_at: input.position.capturedAt,
      p_outcome: input.outcome,
      p_products: input.products,
      p_potential_value: input.potentialValue ?? null,
      p_follow_up_on: input.followUpOn || null,
      p_notes: input.notes || null,
      p_evidence_path: evidencePath,
    });
    if (error || !data) {
      // The user may delete only evidence not referenced by a completed visit.
      // Best-effort cleanup prevents failed completion attempts leaking storage.
      const { error: cleanupError } = await supabase.storage.from(VISIT_EVIDENCE_BUCKET).remove([evidencePath]);
      if (cleanupError) console.warn('[Visits] Orphan evidence cleanup failed:', evidencePath, cleanupError.message);
      if (error) throw error;
      throw new Error('Visit completion returned no data');
    }
    const completed = mapVisit(Array.isArray(data) ? data[0] : data);
    if (completed.evidencePath && completed.evidencePath !== evidencePath) {
      const { error: cleanupError } = await supabase.storage.from(VISIT_EVIDENCE_BUCKET).remove([evidencePath]);
      if (cleanupError) console.warn('[Visits] Duplicate evidence cleanup failed:', evidencePath, cleanupError.message);
    }
    return completed;
  },
};
