import { supabase } from '../../services/supabase';
import type { CollectionStatus, FieldCollection, SubmitCollectionInput } from './collections.types';

const mapCollection = (row: any): FieldCollection => {
  const customer = Array.isArray(row.customers) ? row.customers[0] : row.customers;
  return {
    id: row.id,
    organizationId: row.organization_id,
    employeeId: row.employee_id,
    customerId: row.customer_id,
    customer: customer ? {
      id: customer.id,
      name: customer.name,
      customerType: customer.customer_type,
      address: customer.address || undefined,
      territoryId: customer.territory_id || undefined,
    } : undefined,
    amount: Number(row.amount),
    paymentMode: row.payment_mode,
    reference: row.reference || undefined,
    notes: row.notes || undefined,
    status: row.status,
    duplicateSuspected: Boolean(row.duplicate_suspected),
    accuracyM: Number(row.accuracy_m),
    submittedAt: row.submitted_at,
    reviewNote: row.review_note || undefined,
  };
};

const selection = '*,customers(id,name,customer_type,address,territory_id)';

export const collectionsService = {
  async list(): Promise<FieldCollection[]> {
    const { data, error } = await supabase.from('field_collections').select(selection)
      .order('submitted_at', { ascending: false }).limit(250);
    if (error) throw error;
    return (data || []).map(mapCollection);
  },

  async submit(input: SubmitCollectionInput): Promise<FieldCollection> {
    const collectionId = crypto.randomUUID();
    const { data, error } = await supabase.rpc('submit_field_collection', {
      p_collection_id: collectionId,
      p_client_event_id: crypto.randomUUID(),
      p_customer_id: input.customerId,
      p_amount: input.amount,
      p_payment_mode: input.paymentMode,
      p_reference: input.reference || null,
      p_notes: input.notes || null,
      p_latitude: input.position.latitude,
      p_longitude: input.position.longitude,
      p_accuracy_m: input.position.accuracyM,
      p_captured_at: input.position.capturedAt,
      p_proof_path: null,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error('Collection submission returned no data');
    const { data: hydrated, error: hydrateError } = await supabase.from('field_collections')
      .select(selection).eq('id', row.id).single();
    if (hydrateError) throw hydrateError;
    return mapCollection(hydrated);
  },

  async review(id: string, status: Extract<CollectionStatus, 'VERIFIED' | 'RECONCILED' | 'REJECTED'>, note?: string): Promise<FieldCollection> {
    const { data, error } = await supabase.rpc('review_field_collection', {
      p_collection_id: id,
      p_status: status,
      p_review_note: note || null,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error('Collection review returned no data');
    const { data: hydrated, error: hydrateError } = await supabase.from('field_collections')
      .select(selection).eq('id', row.id).single();
    if (hydrateError) throw hydrateError;
    return mapCollection(hydrated);
  },
};
