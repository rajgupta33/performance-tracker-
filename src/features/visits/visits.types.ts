export type CustomerType = 'DEALER' | 'DISTRIBUTOR' | 'FARMER' | 'RETAILER' | 'OTHER';
export type VisitStatus = 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type VisitLocationStatus = 'PENDING' | 'VERIFIED' | 'REVIEW' | 'OUTSIDE' | 'UNAVAILABLE';

export interface CustomerSummary {
  id: string;
  name: string;
  customerType: CustomerType;
  address?: string;
  territoryId?: string;
}

export interface CapturedPosition {
  latitude: number;
  longitude: number;
  accuracyM: number;
  capturedAt: string;
}

export interface FieldVisit {
  id: string;
  organizationId: string;
  employeeId: string;
  customerId: string;
  customer?: CustomerSummary;
  clientEventId: string;
  status: VisitStatus;
  locationStatus: VisitLocationStatus;
  purpose?: string;
  outcome?: string;
  products: string[];
  potentialValue?: number;
  followUpOn?: string;
  startAccuracyM: number;
  endAccuracyM?: number;
  startDistanceM?: number;
  endDistanceM?: number;
  startedAt: string;
  completedAt?: string;
  notes?: string;
  evidencePath?: string;
}

export interface CompleteVisitInput {
  visitId: string;
  position: CapturedPosition;
  outcome: string;
  products: string[];
  potentialValue?: number;
  followUpOn?: string;
  notes?: string;
  evidenceDataUrl: string;
}

export interface PreparedCompleteVisitInput extends Omit<CompleteVisitInput, 'evidenceDataUrl'> {
  evidenceBlob: Blob;
  evidenceFileId: string;
}

export interface StartVisitInput {
  visitId: string;
  clientEventId: string;
  customerId: string;
  purpose: string;
  position: CapturedPosition;
}
