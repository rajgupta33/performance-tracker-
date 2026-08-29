import { supabase } from '../../../services/supabase';
import type { CompleteFollowUpInput, CrmFollowUp } from './followups.types';

const mapFollowUp = (row: any): CrmFollowUp => {
  const lead = Array.isArray(row.crm_leads) ? row.crm_leads[0] : row.crm_leads;
  const customer = Array.isArray(lead?.customers) ? lead.customers[0] : lead?.customers;
  return {
    id: row.id,
    organizationId: row.organization_id,
    leadId: row.lead_id,
    ownerId: row.owner_id,
    type: row.follow_up_type,
    note: row.note || undefined,
    dueAt: row.due_at,
    status: row.status,
    completedAt: row.completed_at || undefined,
    completionNote: row.completion_note || undefined,
    lead: {
      id: lead.id,
      stage: lead.stage,
      prospectName: lead.prospect_name || undefined,
      contactName: lead.contact_name || undefined,
      mobile: lead.mobile || undefined,
      customer: customer ? { id: customer.id, name: customer.name } : undefined,
    },
  };
};

export const followUpsService = {
  async list(): Promise<CrmFollowUp[]> {
    const { data, error } = await supabase
      .from('crm_follow_ups')
      .select('*,crm_leads(id,stage,prospect_name,contact_name,mobile,customers(id,name))')
      .order('due_at', { ascending: true })
      .limit(500);
    if (error) throw error;
    return (data || []).map(mapFollowUp);
  },

  async complete(followUpId: string, input: CompleteFollowUpInput): Promise<void> {
    const { error } = await supabase.rpc('complete_crm_follow_up', {
      p_follow_up_id: followUpId,
      p_completion_note: input.completionNote,
      p_next_due_at: input.nextDueAt || null,
      p_next_follow_up_type: input.nextType,
      p_next_note: input.nextNote || null,
    });
    if (error) throw error;
  },
};
