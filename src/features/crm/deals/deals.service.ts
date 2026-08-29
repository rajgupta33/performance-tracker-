import { supabase } from '../../../services/supabase';
import { mapLead } from '../leads/leads.service';
import type { CreateDealInput, CrmDeal, DealActivity, DealStage } from './deals.types';

const mapDeal = (row: any): CrmDeal => {
  const leadRow = Array.isArray(row.crm_leads) ? row.crm_leads[0] : row.crm_leads;
  return {
    id: row.id,
    organizationId: row.organization_id,
    leadId: row.lead_id,
    ownerId: row.owner_id,
    lead: mapLead(leadRow),
    title: row.title,
    amount: Number(row.amount),
    stage: row.stage,
    expectedCloseDate: row.expected_close_date || undefined,
    wonReason: row.won_reason || undefined,
    lossReason: row.loss_reason || undefined,
    createdAt: row.created,
    updatedAt: row.updated,
  };
};

const selection = '*,crm_leads(*,customers(id,name,customer_type,address,territory_id))';

export const dealsService = {
  async list(): Promise<CrmDeal[]> {
    const { data, error } = await supabase
      .from('crm_deals')
      .select(selection)
      .order('updated', { ascending: false })
      .limit(250);
    if (error) throw error;
    return (data || []).map(mapDeal);
  },

  async create(input: CreateDealInput): Promise<CrmDeal> {
    const dealId = crypto.randomUUID();
    const { data, error } = await supabase.rpc('create_crm_deal', {
      p_deal_id: dealId,
      p_client_event_id: crypto.randomUUID(),
      p_lead_id: input.leadId,
      p_title: input.title,
      p_amount: input.amount,
      p_expected_close_date: input.expectedCloseDate || null,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error('Deal creation returned no data');
    const { data: hydrated, error: hydrateError } = await supabase
      .from('crm_deals').select(selection).eq('id', row.id).single();
    if (hydrateError) throw hydrateError;
    return mapDeal(hydrated);
  },

  async moveStage(dealId: string, stage: DealStage, reason?: string): Promise<CrmDeal> {
    const { data, error } = await supabase.rpc('move_crm_deal_stage', {
      p_deal_id: dealId,
      p_stage: stage,
      p_reason: reason || null,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error('Deal stage update returned no data');
    const { data: hydrated, error: hydrateError } = await supabase
      .from('crm_deals').select(selection).eq('id', row.id).single();
    if (hydrateError) throw hydrateError;
    return mapDeal(hydrated);
  },

  async listActivities(dealId: string): Promise<DealActivity[]> {
    const { data, error } = await supabase
      .from('crm_deal_activities')
      .select('id,event_type,metadata,created')
      .eq('deal_id', dealId)
      .order('created', { ascending: false });
    if (error) throw error;
    return (data || []).map((row: any) => ({
      id: row.id,
      eventType: row.event_type,
      metadata: row.metadata || {},
      createdAt: row.created,
    }));
  },
};
