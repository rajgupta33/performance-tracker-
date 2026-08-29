export interface VisitException {
  id: string;
  employeeName: string;
  customerName: string;
  locationStatus: 'REVIEW' | 'OUTSIDE' | 'UNAVAILABLE';
  outcome?: string;
  notes?: string;
  accuracyM?: number;
  distanceM?: number;
  completedAt: string;
}
