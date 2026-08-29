export interface FieldBiSnapshot {
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  workforce: { employees: number };
  attendance: { records: number; present: number; exceptions: number };
  visits: { completed: number; verified: number; exceptions: number };
  crm: { activeLeads: number; overdueFollowups: number; openPipelineAmount: number; wonAmount: number };
  collections: { fieldReportedAmount: number; reconciledAmount: number; pendingCount: number; duplicateCount: number };
  targets: { coveredEmployees: number };
}

export interface FieldBiException {
  sourceType: 'ATTENDANCE' | 'VISIT' | 'FOLLOW_UP' | 'COLLECTION';
  sourceId: string;
  employeeName: string;
  title: string;
  detail: string;
  severity: 'HIGH' | 'MEDIUM';
  occurredAt: string;
}
