import { supabase } from '../../../services/supabase';
import type { CreateLeadInput, CrmLead, LeadStage } from './leads.types';

export const mapLead = (row: any): CrmLead => {
  const customerRow = Array.isArray(row.customers) ? row.customers[0] : row.customers;
  return {
    id: row.id,
    organizationId: row.organization_id,
    ownerId: row.owner_id,
    customerId: row.customer_id || undefined,
    customer: customerRow ? {
      id: customerRow.id,
      name: customerRow.name,
      customerType: customerRow.customer_type,
      address: customerRow.address || undefined,
      territoryId: customerRow.territory_id || undefined,
    } : undefined,
    prospectName: row.prospect_name || undefined,
    contactName: row.contact_name || undefined,
    mobile: row.mobile || undefined,
    source: row.source,
    stage: row.stage,
    estimatedValue: row.estimated_value == null ? undefined : Number(row.estimated_value),
    products: row.products || [],
    nextFollowUpAt: row.next_follow_up_at || undefined,
    lossReason: row.loss_reason || undefined,
    createdAt: row.created,
    updatedAt: row.updated,
  };
};

export const leadsService = {
  async list(): Promise<CrmLead[]> {
    const { data, error } = await supabase
      .from('crm_leads')
      .select('*,customers(id,name,customer_type,address,territory_id)')
      .order('updated', { ascending: false })
      .limit(250);
    if (error) throw error;
    return (data || []).map(mapLead);
  },

  async create(input: CreateLeadInput): Promise<CrmLead> {
    const leadId = crypto.randomUUID();
    const { data, error } = await supabase.rpc('create_crm_lead', {
      p_lead_id: leadId,
      p_client_event_id: crypto.randomUUID(),
      p_customer_id: input.customerId || null,
      p_prospect_name: input.prospectName || null,
      p_contact_name: input.contactName || null,
      p_mobile: input.mobile || null,
      p_source: input.source,
      p_estimated_value: input.estimatedValue ?? null,
      p_products: input.products,
      p_follow_up_at: input.followUpAt,
      p_follow_up_type: input.followUpType,
      p_follow_up_note: input.followUpNote || null,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error('Lead creation returned no data');
    return mapLead(row);
  },

  async moveStage(leadId: string, stage: LeadStage, lossReason?: string): Promise<CrmLead> {
    const { data, error } = await supabase.rpc('move_crm_lead_stage', {
      p_lead_id: leadId,
      p_stage: stage,
      p_loss_reason: lossReason || null,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error('Lead stage update returned no data');
    return mapLead(row);
  },
};
