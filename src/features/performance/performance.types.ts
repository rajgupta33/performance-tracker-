export const METRIC_KEYS = ['sales_amount', 'collection_amount', 'productive_visits', 'new_dealers', 'lead_conversion', 'attendance_discipline'] as const;
export type MetricKey = typeof METRIC_KEYS[number];
export const OUTCOME_METRIC_KEYS = ['sales_amount', 'collection_amount', 'productive_visits', 'new_dealers', 'lead_conversion'] as const;
export type OutcomeMetricKey = typeof OUTCOME_METRIC_KEYS[number];
export type MetricUnit = 'INR' | 'COUNT' | 'PERCENT';
export type PerformanceLeaderboardMetric = 'SCORE' | Uppercase<OutcomeMetricKey>;

export interface PerformanceMetric {
  targetId: string;
  employeeId: string;
  periodStart: string;
  periodEnd: string;
  targetStatus: 'ACTIVE' | 'CLOSED';
  metricKey: MetricKey;
  targetValue: number;
  weight: number;
  unit: MetricUnit;
  actualValue: number;
  achievementPct: number;
  weightedScore: number;
}

export interface EmployeeOption { id: string; name: string; employeeId?: string; }
export interface TargetMetricInput { metricKey: MetricKey; targetValue: number; weight: number; unit: MetricUnit; }

export interface PointsSummary {
  currentMonthPoints: number;
  personalBestPoints: number;
  personalBestMonth?: string;
  currentMonthEvents: number;
}

export interface LeaderboardRow {
  rank: number;
  employeeId: string;
  employeeName: string;
  points: number;
  eventCount: number;
}

export interface PerformanceLeaderboardRow {
  rank: number;
  employeeId: string;
  employeeName: string;
  employeeCode?: string;
  metricValue: number;
  targetValue: number;
  achievementPct: number;
}

export interface PerformanceTargetHistoryRow {
  targetId: string;
  employeeId: string;
  periodStart: string;
  periodEnd: string;
  targetStatus: 'DRAFT' | 'ACTIVE' | 'CLOSED';
  outcomeScore: number;
  metricCount: number;
  updatedAt: string;
}

export interface BulkTargetPreviewRow {
  employeeId: string;
  employeeName: string;
  employeeCode?: string;
  readiness: 'READY' | 'CONFLICT';
  existingTargetId?: string;
  existingStatus?: 'DRAFT' | 'ACTIVE' | 'CLOSED';
}

export interface BulkTargetResult {
  requestedCount: number;
  createdCount: number;
  conflictCount: number;
}

export type PerformanceGroupType = 'TEAM' | 'TERRITORY';

export interface PerformanceGroupScorecard {
  groupType: PerformanceGroupType;
  groupId: string;
  groupName: string;
  eligibleEmployees: number;
  targetedEmployees: number;
  coveragePct: number;
  averageScore: number;
  achievedCount: number;
  needsAttentionCount: number;
  topEmployeeId?: string;
  topEmployeeName?: string;
  topEmployeeScore?: number;
  attentionEmployeeNames: string[];
}

export interface PerformanceGroupTrendPoint {
  monthStart: string;
  monthEnd: string;
  eligibleEmployees: number;
  targetedEmployees: number;
  coveragePct: number;
  averageScore: number;
  achievedCount: number;
  needsAttentionCount: number;
}

export type PointEventType = 'LEAD_CREATED' | 'PRODUCTIVE_VISIT' | 'DEAL_WON' | 'COLLECTION_RECONCILED' | 'DEALER_ACTIVATED';

export interface PointRule {
  id: string;
  eventType: PointEventType;
  points: number;
  ruleVersion: string;
  status: 'DRAFT' | 'ACTIVE' | 'RETIRED';
  effectiveFrom: string;
  effectiveTo?: string;
  changeNote: string;
  approvalNote?: string;
}

export interface PerformanceBadge {
  id: string;
  code: string;
  name: string;
  description: string;
  thresholdPoints: number;
  active: boolean;
}

export interface EmployeePerformanceBadge extends Omit<PerformanceBadge, 'id' | 'active'> {
  earned: boolean;
  earnedAt?: string;
}

export type CoachingActionStatus = 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface PerformanceCoachingAction {
  id: string;
  employeeId: string;
  employeeName: string;
  targetId?: string;
  metricKey: OutcomeMetricKey;
  title: string;
  actionPlan: string;
  dueDate: string;
  status: CoachingActionStatus;
  createdByName: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}
