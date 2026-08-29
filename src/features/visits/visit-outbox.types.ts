import type { CustomerSummary, PreparedCompleteVisitInput, StartVisitInput } from './visits.types';

export type VisitOutboxStatus = 'PENDING' | 'IN_FLIGHT' | 'FAILED';

export interface VisitStartOutboxPayload extends StartVisitInput {
  customer: CustomerSummary;
}

export type VisitOutboxPayload =
  | { kind: 'START'; data: VisitStartOutboxPayload }
  | { kind: 'COMPLETE'; data: PreparedCompleteVisitInput };

export interface VisitOutboxEntry {
  id: string;
  userId: string;
  organizationId: string;
  visitId: string;
  payload: VisitOutboxPayload;
  status: VisitOutboxStatus;
  attempts: number;
  maxAttempts: number;
  occurredAt: number;
  queuedAt: number;
  lastAttemptAt?: number;
  nextAttemptAt: number;
  lastError?: string;
  schemaVersion: 1;
}

export interface VisitOutboxSummary {
  entries: VisitOutboxEntry[];
  pending: number;
  failed: number;
  syncing: number;
}
