import { supabase } from '../../services/supabase';
import type { VisitException } from './visit-exceptions.types';

export const visitExceptionsService = {
  async list(): Promise<VisitException[]> {
    const { data, error } = await supabase.from('field_visits')
      .select('id,location_status,outcome,notes,end_accuracy_m,end_distance_m,completed_at,profiles!field_visits_employee_id_fkey(name,employee_id),customers(name),field_visit_reviews(id)')
      .eq('status', 'COMPLETED').in('location_status', ['REVIEW', 'OUTSIDE', 'UNAVAILABLE'])
      .is('field_visit_reviews.id', null).order('completed_at', { ascending: false }).limit(250);
    if (error) throw error;
    return (data || []).map((row: any) => {
      const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      const customer = Array.isArray(row.customers) ? row.customers[0] : row.customers;
      return {
        id: row.id, employeeName: profile?.name || profile?.employee_id || 'Unknown employee',
        customerName: customer?.name || 'Unknown customer', locationStatus: row.location_status,
        outcome: row.outcome || undefined, notes: row.notes || undefined,
        accuracyM: row.end_accuracy_m == null ? undefined : Number(row.end_accuracy_m),
        distanceM: row.end_distance_m == null ? undefined : Number(row.end_distance_m), completedAt: row.completed_at,
      };
    });
  },

  async review(visitId: string, decision: 'APPROVED' | 'REJECTED', note: string): Promise<void> {
    const { error } = await supabase.rpc('review_visit_exception', { p_visit_id: visitId, p_decision: decision, p_note: note });
    if (error) throw error;
  },
};
