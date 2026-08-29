select jsonb_build_object(
  'organizations', (select count(*) from public.organizations),
  'profiles', (select count(*) from public.profiles),
  'territories', (select count(*) from public.territories),
  'customers', (select count(*) from public.customers),
  'field_visits', (select count(*) from public.field_visits),
  'crm_leads', (select count(*) from public.crm_leads),
  'crm_follow_ups', (select count(*) from public.crm_follow_ups),
  'crm_deals', (select count(*) from public.crm_deals),
  'field_collections', (select count(*) from public.field_collections),
  'performance_targets', (select count(*) from public.performance_targets),
  'point_events', (select count(*) from public.point_events),
  'visit_reviews', (select count(*) from public.field_visit_reviews),
  'evidence_retention_policies', (select count(*) from public.evidence_retention_policies),
  'evidence_cleanup_items', (select count(*) from public.evidence_cleanup_items),
  'integrity_errors',
    (select count(*) from public.field_visits v left join public.profiles p on p.id = v.employee_id left join public.customers c on c.id = v.customer_id where p.id is null or c.id is null)
    + (select count(*) from public.crm_deals d left join public.crm_leads l on l.id = d.lead_id where l.id is null)
    + (select count(*) from public.field_collections fc left join public.profiles p on p.id = fc.employee_id left join public.customers c on c.id = fc.customer_id where p.id is null or c.id is null),
  'rls_missing', coalesce((
    select jsonb_agg(t.tablename order by t.tablename)
    from pg_catalog.pg_tables t join pg_catalog.pg_class c on c.relname = t.tablename
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace and n.nspname = t.schemaname
    where t.schemaname = 'public' and t.tablename in (
      'profiles','territories','customers','field_visits','crm_leads','crm_follow_ups','crm_activities',
      'crm_deals','crm_deal_activities','field_collections','collection_activities','performance_targets',
      'performance_target_metrics','point_events','field_visit_reviews','evidence_retention_policies',
      'evidence_cleanup_runs','evidence_cleanup_items'
    ) and not c.relrowsecurity
  ), '[]'::jsonb)
);
