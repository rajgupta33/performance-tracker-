import type { CapturedPosition, CustomerSummary } from '../visits/visits.types';

export const COLLECTION_STATUSES = ['SUBMITTED', 'VERIFIED', 'RECONCILED', 'REJECTED'] as const;
export type CollectionStatus = typeof COLLECTION_STATUSES[number];
export type PaymentMode = 'BANK' | 'UPI' | 'CHEQUE' | 'CASH';

export interface FieldCollection {
  id: string;
  organizationId: string;
  employeeId: string;
  customerId: string;
  customer?: CustomerSummary;
  amount: number;
  paymentMode: PaymentMode;
  reference?: string;
  notes?: string;
  status: CollectionStatus;
  duplicateSuspected: boolean;
  accuracyM: number;
  submittedAt: string;
  reviewNote?: string;
}

export interface SubmitCollectionInput {
  customerId: string;
  amount: number;
  paymentMode: PaymentMode;
  reference?: string;
  notes?: string;
  position: CapturedPosition;
}
