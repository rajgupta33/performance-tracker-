import { supabase } from '../../services/supabase';
import type { FieldBiException, FieldBiSnapshot } from './field-bi.types';

const mapSnapshot = (row: any): FieldBiSnapshot => ({
  periodStart: row.period_start,
  periodEnd: row.period_end,
  generatedAt: row.generated_at,
  workforce: { employees: Number(row.workforce?.employees || 0) },
  attendance: {
    records: Number(row.attendance?.records || 0), present: Number(row.attendance?.present || 0),
    exceptions: Number(row.attendance?.exceptions || 0),
  },
  visits: {
    completed: Number(row.visits?.completed || 0), verified: Number(row.visits?.verified || 0),
    exceptions: Number(row.visits?.exceptions || 0),
  },
  crm: {
    activeLeads: Number(row.crm?.active_leads || 0), overdueFollowups: Number(row.crm?.overdue_followups || 0),
    openPipelineAmount: Number(row.crm?.open_pipeline_amount || 0), wonAmount: Number(row.crm?.won_amount || 0),
  },
  collections: {
    fieldReportedAmount: Number(row.collections?.field_reported_amount || 0),
    reconciledAmount: Number(row.collections?.reconciled_amount || 0),
    pendingCount: Number(row.collections?.pending_count || 0), duplicateCount: Number(row.collections?.duplicate_count || 0),
  },
  targets: { coveredEmployees: Number(row.targets?.covered_employees || 0) },
});

export const fieldBiService = {
  async load(periodStart: string, periodEnd: string): Promise<{ snapshot: FieldBiSnapshot; exceptions: FieldBiException[] }> {
    const [snapshotResult, exceptionResult] = await Promise.all([
      supabase.rpc('get_field_force_dashboard', { p_period_start: periodStart, p_period_end: periodEnd }),
      supabase.rpc('get_field_force_exceptions', { p_period_start: periodStart, p_period_end: periodEnd, p_limit: 100 }),
    ]);
    if (snapshotResult.error) throw snapshotResult.error;
    if (exceptionResult.error) throw exceptionResult.error;
    const visitIds = (exceptionResult.data || []).filter((row: any) => row.source_type === 'VISIT').map((row: any) => row.source_id);
    let reviewedVisitIds = new Set<string>();
    if (visitIds.length > 0) {
      const { data: reviews, error: reviewError } = await supabase.from('field_visit_reviews').select('visit_id').in('visit_id', visitIds);
      if (reviewError) throw reviewError;
      reviewedVisitIds = new Set((reviews || []).map((row: any) => row.visit_id));
    }
    return {
      snapshot: mapSnapshot(snapshotResult.data),
      exceptions: (exceptionResult.data || []).filter((row: any) => row.source_type !== 'VISIT' || !reviewedVisitIds.has(row.source_id)).map((row: any) => ({
        sourceType: row.source_type, sourceId: row.source_id, employeeName: row.employee_name,
        title: row.title, detail: row.detail, severity: row.severity, occurredAt: row.occurred_at,
      })),
    };
  },
};
