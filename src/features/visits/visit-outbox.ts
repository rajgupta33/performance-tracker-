import { convertToWebP } from '../../utils/imageConvert';
import { visitsService } from './visits.service';
import type { CompleteVisitInput, FieldVisit, StartVisitInput } from './visits.types';
import type {
  VisitOutboxEntry,
  VisitOutboxPayload,
  VisitOutboxSummary,
  VisitStartOutboxPayload,
} from './visit-outbox.types';

const DB_NAME = 'vardhnam-fieldforce';
const DB_VERSION = 1;
const STORE_NAME = 'visit_outbox';
const MAX_ATTEMPTS = 12;
const MAX_ENTRIES_PER_USER = 100;
const MAX_EVIDENCE_BYTES_PER_USER = 100 * 1024 * 1024;
const STALE_IN_FLIGHT_MS = 2 * 60 * 1000;
const BACKOFF_MS = [1_000, 5_000, 15_000, 60_000, 5 * 60_000, 15 * 60_000] as const;
export const VISIT_OUTBOX_CHANGED = 'vardhnam:visit-outbox-change';

let databasePromise: Promise<IDBDatabase> | null = null;
const drainPromises = new Map<string, Promise<VisitDrainResult>>();

const notifyChanged = () => {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(VISIT_OUTBOX_CHANGED));
};

const requestResult = <T>(request: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
});

const openDatabase = (): Promise<IDBDatabase> => {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('Offline storage is unavailable on this device.'));
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('userId', 'userId', { unique: false });
        store.createIndex('occurredAt', 'occurredAt', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      databasePromise = null;
      reject(request.error || new Error('Could not open offline storage.'));
    };
  });
  return databasePromise;
};

const runTransaction = async <T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => Promise<T>): Promise<T> => {
  const db = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    let value: T;
    let operationError: unknown;
    operation(store).then((result) => { value = result; }).catch((error) => {
      operationError = error;
      transaction.abort();
    });
    transaction.oncomplete = () => resolve(value);
    transaction.onerror = () => reject(operationError || transaction.error || new Error('Offline storage transaction failed'));
    transaction.onabort = () => reject(operationError || transaction.error || new Error('Offline storage transaction aborted'));
  });
};

const putEntry = async (entry: VisitOutboxEntry) => {
  await runTransaction('readwrite', async (store) => { await requestResult(store.put(entry)); });
  notifyChanged();
  return entry;
};

export const listVisitOutbox = async (userId: string): Promise<VisitOutboxEntry[]> => {
  const entries = await runTransaction('readonly', async (store) => requestResult(store.getAll()) as Promise<VisitOutboxEntry[]>);
  return entries.filter((entry) => entry.userId === userId && entry.schemaVersion === 1)
    .sort((a, b) => a.occurredAt - b.occurredAt || a.queuedAt - b.queuedAt);
};

export const getVisitOutboxSummary = async (userId: string): Promise<VisitOutboxSummary> => {
  const entries = await listVisitOutbox(userId);
  return {
    entries,
    pending: entries.filter((entry) => entry.status === 'PENDING').length,
    failed: entries.filter((entry) => entry.status === 'FAILED').length,
    syncing: entries.filter((entry) => entry.status === 'IN_FLIGHT').length,
  };
};

const makeEntry = (
  userId: string,
  organizationId: string,
  visitId: string,
  payload: VisitOutboxPayload,
  occurredAt: number,
): VisitOutboxEntry => {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    userId,
    organizationId,
    visitId,
    payload,
    status: 'PENDING',
    attempts: 0,
    maxAttempts: MAX_ATTEMPTS,
    occurredAt,
    queuedAt: now,
    nextAttemptAt: now,
    schemaVersion: 1,
  };
};

const ensureCapacity = async (userId: string, additionalEvidenceBytes = 0) => {
  const entries = await listVisitOutbox(userId);
  if (entries.length >= MAX_ENTRIES_PER_USER) {
    throw new Error('The visit sync queue is full. Reconnect and sync before recording more visits.');
  }
  const evidenceBytes = entries.reduce((total, entry) => {
    if (entry.payload.kind !== 'COMPLETE') return total;
    return total + entry.payload.data.evidenceBlob.size;
  }, 0);
  if (evidenceBytes + additionalEvidenceBytes > MAX_EVIDENCE_BYTES_PER_USER) {
    throw new Error('Offline visit photos reached the 100 MB safety limit. Reconnect and sync before continuing.');
  }
};

export const enqueueVisitStart = async (
  userId: string,
  organizationId: string,
  input: VisitStartOutboxPayload,
): Promise<VisitOutboxEntry> => {
  await ensureCapacity(userId);
  return putEntry(makeEntry(
    userId,
    organizationId,
    input.visitId,
    { kind: 'START', data: input },
    Date.parse(input.position.capturedAt),
  ));
};

export const enqueueVisitCompletion = async (
  userId: string,
  organizationId: string,
  input: CompleteVisitInput,
): Promise<VisitOutboxEntry> => {
  const evidenceBlob = await convertToWebP(input.evidenceDataUrl, 0.72, 1280);
  if (evidenceBlob.type !== 'image/webp') throw new Error('This browser could not prepare the visit photo. Please retake it.');
  await ensureCapacity(userId, evidenceBlob.size);
  const { evidenceDataUrl: _evidenceDataUrl, ...completion } = input;
  return putEntry(makeEntry(
    userId,
    organizationId,
    input.visitId,
    {
      kind: 'COMPLETE',
      data: {
        ...completion,
        evidenceBlob,
        evidenceFileId: crypto.randomUUID(),
      },
    },
    Date.parse(input.position.capturedAt),
  ));
};

const pickNext = async (userId: string): Promise<VisitOutboxEntry | null> => runTransaction('readwrite', async (store) => {
  const all = await requestResult(store.getAll()) as VisitOutboxEntry[];
  const ordered = all.filter((entry) => entry.userId === userId)
    .sort((a, b) => a.occurredAt - b.occurredAt || a.queuedAt - b.queuedAt);
  if (!ordered.length) return null;

  const now = Date.now();
  const first = ordered[0];
  if (first.status === 'IN_FLIGHT' && now - (first.lastAttemptAt || 0) > STALE_IN_FLIGHT_MS) {
    first.status = 'PENDING';
  }
  // Strict FIFO protects START -> COMPLETE dependencies. A failed or backed-off
  // head entry intentionally blocks later actions for the same user.
  if (first.status !== 'PENDING' || first.nextAttemptAt > now) {
    if (first.status === 'PENDING') await requestResult(store.put(first));
    return null;
  }
  first.status = 'IN_FLIGHT';
  first.attempts += 1;
  first.lastAttemptAt = now;
  await requestResult(store.put(first));
  return first;
});

const markSuccess = async (id: string) => {
  await runTransaction('readwrite', async (store) => { await requestResult(store.delete(id)); });
  notifyChanged();
};

export const isRetryableVisitError = (error: any): boolean => {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  const status = Number(error?.status ?? error?.statusCode ?? error?.context?.status ?? 0);
  const code = String(error?.code || '');
  if (code) {
    if (code.startsWith('08') || code.startsWith('53') || code === '57P01' || code === '40001' || code === '40P01') return true;
    if (/^PGRST00[0-3]$/.test(code)) return true;
    return false;
  }
  if (!status) return true;
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
};

const markFailure = async (entry: VisitOutboxEntry, error: any) => {
  const retryable = isRetryableVisitError(error);
  entry.lastError = error?.message || 'Unknown synchronization error';
  if (!retryable || entry.attempts >= entry.maxAttempts) {
    entry.status = 'FAILED';
  } else {
    entry.status = 'PENDING';
    const index = Math.min(entry.attempts - 1, BACKOFF_MS.length - 1);
    entry.nextAttemptAt = Date.now() + BACKOFF_MS[Math.max(0, index)];
  }
  await putEntry(entry);
};

const executeEntry = async (entry: VisitOutboxEntry): Promise<FieldVisit> => {
  if (entry.payload.kind === 'START') return visitsService.startVisit(entry.payload.data as StartVisitInput);
  return visitsService.completePreparedVisit(entry.payload.data);
};

export interface VisitDrainResult {
  syncedEntryIds: string[];
  results: Map<string, FieldVisit>;
}

export const drainVisitOutbox = async (userId: string): Promise<VisitDrainResult> => {
  const activeDrain = drainPromises.get(userId);
  if (activeDrain) return activeDrain;
  const drainPromise = (async () => {
    const result: VisitDrainResult = { syncedEntryIds: [], results: new Map() };
    if (typeof navigator !== 'undefined' && !navigator.onLine) return result;
    for (let processed = 0; processed < 10; processed += 1) {
      const entry = await pickNext(userId);
      if (!entry) break;
      try {
        const visit = await executeEntry(entry);
        await markSuccess(entry.id);
        result.syncedEntryIds.push(entry.id);
        result.results.set(entry.id, visit);
      } catch (error) {
        await markFailure(entry, error);
        break;
      }
    }
    return result;
  })().finally(() => { drainPromises.delete(userId); });
  drainPromises.set(userId, drainPromise);
  return drainPromise;
};

export const retryFailedVisitOutbox = async (userId: string): Promise<void> => {
  const entries = await listVisitOutbox(userId);
  const failed = entries.filter((entry) => entry.status === 'FAILED');
  for (const entry of failed) {
    entry.status = 'PENDING';
    entry.attempts = 0;
    entry.nextAttemptAt = Date.now();
    entry.lastError = undefined;
    await putEntry(entry);
  }
};

export const discardFailedVisitOutboxEntry = async (userId: string, entryId: string): Promise<void> => {
  const entries = await listVisitOutbox(userId);
  const entry = entries.find((candidate) => candidate.id === entryId);
  if (!entry) return;
  if (entry.status !== 'FAILED') throw new Error('Only failed visit actions can be discarded.');
  await runTransaction('readwrite', async (store) => { await requestResult(store.delete(entry.id)); });
  notifyChanged();
};

export const localActiveVisit = (entries: VisitOutboxEntry[]): FieldVisit | null => {
  const starts = entries.filter((entry) => entry.payload.kind === 'START');
  const completions = new Set(entries.filter((entry) => entry.payload.kind === 'COMPLETE').map((entry) => entry.visitId));
  const entry = [...starts].reverse().find((candidate) => !completions.has(candidate.visitId));
  if (!entry || entry.payload.kind !== 'START') return null;
  const data = entry.payload.data;
  return {
    id: data.visitId,
    organizationId: entry.organizationId,
    employeeId: entry.userId,
    customerId: data.customerId,
    customer: data.customer,
    clientEventId: data.clientEventId,
    status: 'IN_PROGRESS',
    locationStatus: 'PENDING',
    purpose: data.purpose || undefined,
    products: [],
    startAccuracyM: data.position.accuracyM,
    startedAt: data.position.capturedAt,
  };
};
