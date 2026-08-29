import { supabase } from '../../services/supabase';
import type { BulkTargetPreviewRow, BulkTargetResult, CoachingActionStatus, EmployeeOption, EmployeePerformanceBadge, LeaderboardRow, OutcomeMetricKey, PerformanceBadge, PerformanceCoachingAction, PerformanceGroupScorecard, PerformanceGroupTrendPoint, PerformanceGroupType, PerformanceLeaderboardMetric, PerformanceLeaderboardRow, PerformanceMetric, PerformanceTargetHistoryRow, PointEventType, PointRule, PointsSummary, TargetMetricInput } from './performance.types';

const mapMetric = (row: any): PerformanceMetric => ({
  targetId: row.target_id,
  employeeId: row.employee_id,
  periodStart: row.period_start,
  periodEnd: row.period_end,
  targetStatus: row.target_status,
  metricKey: row.metric_key,
  targetValue: Number(row.target_value),
  weight: Number(row.weight),
  unit: row.unit,
  actualValue: Number(row.actual_value),
  achievementPct: Number(row.achievement_pct),
  weightedScore: Number(row.weighted_score),
});

export const performanceService = {
  async get(employeeId?: string): Promise<PerformanceMetric[]> {
    const { data, error } = await supabase.rpc('get_employee_target_performance', { p_employee_id: employeeId || null });
    if (error) throw error;
    return (data || []).map(mapMetric);
  },

  async listEmployees(): Promise<EmployeeOption[]> {
    const { data, error } = await supabase.from('profiles').select('id,name,employee_id')
      .neq('role', 'SUPER_ADMIN').order('name').limit(500);
    if (error) throw error;
    return (data || []).map((row: any) => ({ id: row.id, name: row.name || row.employee_id || 'Unnamed employee', employeeId: row.employee_id || undefined }));
  },

  async createEmployeeTarget(employeeId: string, periodStart: string, periodEnd: string, metrics: TargetMetricInput[]): Promise<void> {
    const { error } = await supabase.rpc('create_employee_performance_target', {
      p_employee_id: employeeId,
      p_period_start: periodStart,
      p_period_end: periodEnd,
      p_metrics: metrics.map((metric) => ({ metric_key: metric.metricKey, target_value: metric.targetValue, weight: metric.weight, unit: metric.unit })),
    });
    if (error) throw error;
  },

  async getPointsSummary(): Promise<PointsSummary> {
    const { data, error } = await supabase.rpc('get_my_points_summary');
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return {
      currentMonthPoints: Number(row?.current_month_points || 0),
      personalBestPoints: Number(row?.personal_best_points || 0),
      personalBestMonth: row?.personal_best_month || undefined,
      currentMonthEvents: Number(row?.current_month_events || 0),
    };
  },

  async getLeaderboard(): Promise<LeaderboardRow[]> {
    const { data, error } = await supabase.rpc('get_points_leaderboard', { p_limit: 10 });
    if (error) throw error;
    return (data || []).map((row: any) => ({
      rank: Number(row.rank), employeeId: row.employee_id, employeeName: row.employee_name,
      points: Number(row.points), eventCount: Number(row.event_count),
    }));
  },

  async getPerformanceLeaderboard(periodStart: string, periodEnd: string, metric: PerformanceLeaderboardMetric): Promise<PerformanceLeaderboardRow[]> {
    const { data, error } = await supabase.rpc('get_performance_leaderboard', {
      p_period_start: periodStart,
      p_period_end: periodEnd,
      p_metric: metric,
      p_limit: 20,
    });
    if (error) throw error;
    return (data || []).map((row: any) => ({
      rank: Number(row.rank),
      employeeId: row.employee_id,
      employeeName: row.employee_name,
      employeeCode: row.employee_code || undefined,
      metricValue: Number(row.metric_value),
      targetValue: Number(row.target_value),
      achievementPct: Number(row.achievement_pct),
    }));
  },

  async getTargetHistory(employeeId?: string): Promise<PerformanceTargetHistoryRow[]> {
    const { data, error } = await supabase.rpc('get_employee_performance_history', {
      p_employee_id: employeeId || null,
      p_limit: 12,
    });
    if (error) throw error;
    return (data || []).map((row: any) => ({
      targetId: row.target_id,
      employeeId: row.employee_id,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      targetStatus: row.target_status,
      outcomeScore: Number(row.outcome_score),
      metricCount: Number(row.metric_count),
      updatedAt: row.updated_at,
    }));
  },

  async copyTarget(sourceTargetId: string, periodStart: string, periodEnd: string): Promise<void> {
    const { error } = await supabase.rpc('copy_employee_performance_target', {
      p_source_target_id: sourceTargetId,
      p_period_start: periodStart,
      p_period_end: periodEnd,
    });
    if (error) throw error;
  },

  async changeTargetStatus(targetId: string, status: 'ACTIVE' | 'CLOSED'): Promise<void> {
    const { error } = await supabase.rpc('change_performance_target_status', {
      p_target_id: targetId,
      p_status: status,
    });
    if (error) throw error;
  },

  async previewBulkTargets(employeeIds: string[], periodStart: string, periodEnd: string): Promise<BulkTargetPreviewRow[]> {
    const { data, error } = await supabase.rpc('preview_bulk_performance_targets', {
      p_employee_ids: employeeIds,
      p_period_start: periodStart,
      p_period_end: periodEnd,
    });
    if (error) throw error;
    return (data || []).map((row: any) => ({
      employeeId: row.employee_id,
      employeeName: row.employee_name,
      employeeCode: row.employee_code || undefined,
      readiness: row.readiness,
      existingTargetId: row.existing_target_id || undefined,
      existingStatus: row.existing_status || undefined,
    }));
  },

  async createBulkTargets(employeeIds: string[], periodStart: string, periodEnd: string, metrics: TargetMetricInput[], activate: boolean): Promise<BulkTargetResult> {
    const { data, error } = await supabase.rpc('bulk_create_employee_performance_targets', {
      p_employee_ids: employeeIds,
      p_period_start: periodStart,
      p_period_end: periodEnd,
      p_metrics: metrics.map((metric) => ({ metric_key: metric.metricKey, target_value: metric.targetValue, weight: metric.weight, unit: metric.unit })),
      p_activate: activate,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return {
      requestedCount: Number(row?.requested_count || 0),
      createdCount: Number(row?.created_count || 0),
      conflictCount: Number(row?.conflict_count || 0),
    };
  },

  async getGroupScorecards(periodStart: string, periodEnd: string, groupType: PerformanceGroupType): Promise<PerformanceGroupScorecard[]> {
    const { data, error } = await supabase.rpc('get_performance_group_scorecards', {
      p_period_start: periodStart,
      p_period_end: periodEnd,
      p_group_type: groupType,
    });
    if (error) throw error;
    return (data || []).map((row: any) => ({
      groupType: row.group_type,
      groupId: row.group_id,
      groupName: row.group_name,
      eligibleEmployees: Number(row.eligible_employees),
      targetedEmployees: Number(row.targeted_employees),
      coveragePct: Number(row.coverage_pct),
      averageScore: Number(row.average_score),
      achievedCount: Number(row.achieved_count),
      needsAttentionCount: Number(row.needs_attention_count),
      topEmployeeId: row.top_employee_id || undefined,
      topEmployeeName: row.top_employee_name || undefined,
      topEmployeeScore: row.top_employee_score == null ? undefined : Number(row.top_employee_score),
      attentionEmployeeNames: row.attention_employee_names || [],
    }));
  },

  async getGroupTrend(groupType: PerformanceGroupType, groupId: string, endMonth: string, months = 12): Promise<PerformanceGroupTrendPoint[]> {
    const { data, error } = await supabase.rpc('get_performance_group_trend', {
      p_group_type: groupType,
      p_group_id: groupId,
      p_end_month: endMonth,
      p_months: months,
    });
    if (error) throw error;
    return (data || []).map((row: any) => ({
      monthStart: row.month_start,
      monthEnd: row.month_end,
      eligibleEmployees: Number(row.eligible_employees),
      targetedEmployees: Number(row.targeted_employees),
      coveragePct: Number(row.coverage_pct),
      averageScore: Number(row.average_score),
      achievedCount: Number(row.achieved_count),
      needsAttentionCount: Number(row.needs_attention_count),
    }));
  },

  async getMyBadges(): Promise<EmployeePerformanceBadge[]> {
    const { data, error } = await supabase.rpc('get_my_performance_badges');
    if (error) throw error;
    return (data || []).map((row: any) => ({
      code: row.code, name: row.name, description: row.description,
      thresholdPoints: Number(row.threshold_points), earned: Boolean(row.earned), earnedAt: row.earned_at || undefined,
    }));
  },

  async listPointRules(): Promise<PointRule[]> {
    const { data, error } = await supabase.rpc('list_point_rules');
    if (error) throw error;
    return (data || []).map((row: any) => ({
      id: row.id, eventType: row.event_type, points: Number(row.points), ruleVersion: row.rule_version,
      status: row.status, effectiveFrom: row.effective_from, effectiveTo: row.effective_to || undefined,
      changeNote: row.change_note, approvalNote: row.approval_note || undefined,
    }));
  },

  async listBadges(): Promise<PerformanceBadge[]> {
    const { data, error } = await supabase.from('performance_badges').select('id,code,name,description,threshold_points,active').order('threshold_points');
    if (error) throw error;
    return (data || []).map((row: any) => ({ id: row.id, code: row.code, name: row.name, description: row.description, thresholdPoints: Number(row.threshold_points), active: Boolean(row.active) }));
  },

  async configurePointRule(eventType: PointEventType, points: number, effectiveFrom: string, changeNote: string): Promise<void> {
    const { error } = await supabase.rpc('configure_point_rule', { p_event_type: eventType, p_points: points, p_effective_from: effectiveFrom, p_change_note: changeNote });
    if (error) throw error;
  },

  async activatePointRule(ruleId: string, approvalNote: string): Promise<void> {
    const { error } = await supabase.rpc('activate_point_rule', { p_rule_id: ruleId, p_approval_note: approvalNote });
    if (error) throw error;
  },

  async upsertBadge(code: string, name: string, description: string, thresholdPoints: number, active = true): Promise<void> {
    const { error } = await supabase.rpc('upsert_performance_badge', { p_code: code, p_name: name, p_description: description, p_threshold_points: thresholdPoints, p_active: active });
    if (error) throw error;
  },

  async createPointAdjustment(employeeId: string, pointsDelta: number, reason: string, reference: string, occurredAt: string): Promise<void> {
    const { error } = await supabase.rpc('create_point_adjustment', {
      p_employee_id: employeeId, p_points_delta: pointsDelta, p_reason: reason, p_reference: reference,
      p_occurred_at: occurredAt, p_client_event_id: crypto.randomUUID(),
    });
    if (error) throw error;
  },

  async listCoachingActions(employeeId?: string, status?: CoachingActionStatus): Promise<PerformanceCoachingAction[]> {
    const { data, error } = await supabase.rpc('list_performance_coaching_actions', {
      p_employee_id: employeeId || null,
      p_status: status || null,
    });
    if (error) throw error;
    return (data || []).map((row: any) => ({
      id: row.action_id,
      employeeId: row.employee_id,
      employeeName: row.employee_name,
      targetId: row.target_id || undefined,
      metricKey: row.metric_key,
      title: row.title,
      actionPlan: row.action_plan,
      dueDate: row.due_date,
      status: row.status,
      createdByName: row.created_by_name,
      completedAt: row.completed_at || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  },

  async createCoachingAction(
    employeeId: string,
    targetId: string | undefined,
    metricKey: OutcomeMetricKey,
    title: string,
    actionPlan: string,
    dueDate: string,
  ): Promise<void> {
    const { error } = await supabase.rpc('create_performance_coaching_action', {
      p_employee_id: employeeId,
      p_target_id: targetId || null,
      p_metric_key: metricKey,
      p_title: title,
      p_action_plan: actionPlan,
      p_due_date: dueDate,
    });
    if (error) throw error;
  },

  async changeCoachingStatus(actionId: string, status: Exclude<CoachingActionStatus, 'OPEN'>, note: string): Promise<void> {
    const { error } = await supabase.rpc('change_performance_coaching_status', {
      p_action_id: actionId,
      p_status: status,
      p_note: note,
    });
    if (error) throw error;
  },
};
