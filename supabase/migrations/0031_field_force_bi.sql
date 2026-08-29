-- Management-facing Field Force KPI snapshot and actionable exception queue.

create or replace function public.get_field_force_dashboard(
  p_period_start date,
  p_period_end date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org_id uuid := public.auth_org_id();
  v_result jsonb;
begin
  if not (public.is_super_admin() or public.auth_role() in ('ADMIN','HR','MANAGER')) then raise exception 'management access required'; end if;
  if p_period_start is null or p_period_end is null or p_period_end < p_period_start or p_period_end - p_period_start > 366 then
    raise exception 'dashboard period must be between 1 and 367 days';
  end if;

  select jsonb_build_object(
    'period_start', p_period_start,
    'period_end', p_period_end,
    'generated_at', now(),
    'workforce', jsonb_build_object(
      'employees', (select count(*) from public.profiles p where p.organization_id = v_org_id and p.role <> 'SUPER_ADMIN')
    ),
    'attendance', jsonb_build_object(
      'records', (select count(*) from public.attendance a where a.organization_id = v_org_id and a.date between p_period_start and p_period_end),
      'present', (select count(*) from public.attendance a where a.organization_id = v_org_id and a.date between p_period_start and p_period_end and a.status in ('PRESENT','REMOTE')),
      'exceptions', (select count(*) from public.attendance a where a.organization_id = v_org_id and a.date between p_period_start and p_period_end and a.status in ('ABSENT','LATE','HALF_DAY'))
    ),
    'visits', jsonb_build_object(
      'completed', (select count(*) from public.field_visits v where v.organization_id = v_org_id and v.completed_at::date between p_period_start and p_period_end and v.status = 'COMPLETED'),
      'verified', (select count(*) from public.field_visits v where v.organization_id = v_org_id and v.completed_at::date between p_period_start and p_period_end and v.status = 'COMPLETED' and v.location_status = 'VERIFIED'),
      'exceptions', (select count(*) from public.field_visits v where v.organization_id = v_org_id and v.completed_at::date between p_period_start and p_period_end and v.status = 'COMPLETED' and v.location_status in ('REVIEW','OUTSIDE','UNAVAILABLE'))
    ),
    'crm', jsonb_build_object(
      'active_leads', (select count(*) from public.crm_leads l where l.organization_id = v_org_id and l.stage not in ('WON','LOST')),
      'overdue_followups', (select count(*) from public.crm_follow_ups f where f.organization_id = v_org_id and f.status = 'OPEN' and f.due_at < now()),
      'open_pipeline_amount', (select coalesce(sum(d.amount), 0) from public.crm_deals d where d.organization_id = v_org_id and d.stage not in ('WON','LOST')),
      'won_amount', (select coalesce(sum(d.amount), 0) from public.crm_deals d where d.organization_id = v_org_id and d.stage = 'WON' and d.won_at::date between p_period_start and p_period_end)
    ),
    'collections', jsonb_build_object(
      'field_reported_amount', (select coalesce(sum(c.amount), 0) from public.field_collections c where c.organization_id = v_org_id and c.status <> 'REJECTED' and c.submitted_at::date between p_period_start and p_period_end),
      'reconciled_amount', (select coalesce(sum(c.amount), 0) from public.field_collections c where c.organization_id = v_org_id and c.status = 'RECONCILED' and c.reconciled_at::date between p_period_start and p_period_end),
      'pending_count', (select count(*) from public.field_collections c where c.organization_id = v_org_id and c.status in ('SUBMITTED','VERIFIED')),
      'duplicate_count', (select count(*) from public.field_collections c where c.organization_id = v_org_id and c.duplicate_suspected and c.status <> 'REJECTED')
    ),
    'targets', jsonb_build_object(
      'covered_employees', (select count(distinct t.employee_id) from public.performance_targets t where t.organization_id = v_org_id and t.status = 'ACTIVE' and t.assignee_type = 'EMPLOYEE' and t.period_start <= p_period_end and t.period_end >= p_period_start)
    )
  ) into v_result;
  return v_result;
end;
$$;

create or replace function public.get_field_force_exceptions(
  p_period_start date,
  p_period_end date,
  p_limit integer default 100
)
returns table (
  source_type text, source_id uuid, employee_name text, title text,
  detail text, severity text, occurred_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org_id uuid := public.auth_org_id();
begin
  if not (public.is_super_admin() or public.auth_role() in ('ADMIN','HR','MANAGER')) then raise exception 'management access required'; end if;
  if p_period_start is null or p_period_end is null or p_period_end < p_period_start then raise exception 'valid dashboard period is required'; end if;
  return query
  select q.source_type, q.source_id, q.employee_name, q.title, q.detail, q.severity, q.occurred_at
  from (
    select 'ATTENDANCE'::text source_type, a.id source_id, coalesce(p.name, a.employee_name, a.employee_id) employee_name,
      ('Attendance ' || lower(a.status))::text title, ('Recorded for ' || a.date::text)::text detail,
      case when a.status = 'ABSENT' then 'HIGH' else 'MEDIUM' end::text severity,
      coalesce(a.check_in, a.created) occurred_at
    from public.attendance a left join public.profiles p on p.organization_id = a.organization_id and p.employee_id = a.employee_id
    where a.organization_id = v_org_id and a.date between p_period_start and p_period_end and a.status in ('ABSENT','LATE','HALF_DAY')
    union all
    select 'VISIT', v.id, coalesce(p.name, p.employee_id, 'Unknown employee'),
      ('Visit location ' || lower(v.location_status)), coalesce(c.name, 'Unknown customer'),
      case when v.location_status = 'OUTSIDE' then 'HIGH' else 'MEDIUM' end,
      coalesce(v.completed_at, v.started_at)
    from public.field_visits v join public.profiles p on p.id = v.employee_id left join public.customers c on c.id = v.customer_id
    where v.organization_id = v_org_id and coalesce(v.completed_at, v.started_at)::date between p_period_start and p_period_end
      and v.location_status in ('REVIEW','OUTSIDE','UNAVAILABLE')
    union all
    select 'FOLLOW_UP', f.id, coalesce(p.name, p.employee_id, 'Unknown employee'),
      'Overdue follow-up', coalesce(l.prospect_name, c.name, 'Lead follow-up'),
      case when f.due_at < now() - interval '7 days' then 'HIGH' else 'MEDIUM' end, f.due_at
    from public.crm_follow_ups f join public.profiles p on p.id = f.owner_id
      join public.crm_leads l on l.id = f.lead_id left join public.customers c on c.id = l.customer_id
    where f.organization_id = v_org_id and f.status = 'OPEN' and f.due_at < now() and f.due_at::date <= p_period_end
    union all
    select 'COLLECTION', fc.id, coalesce(p.name, p.employee_id, 'Unknown employee'),
      case when fc.duplicate_suspected then 'Possible duplicate collection' else 'Collection awaiting review' end,
      (coalesce(c.name, 'Unknown customer') || ' · INR ' || fc.amount::text),
      case when fc.duplicate_suspected then 'HIGH' else 'MEDIUM' end, fc.submitted_at
    from public.field_collections fc join public.profiles p on p.id = fc.employee_id left join public.customers c on c.id = fc.customer_id
    where fc.organization_id = v_org_id and fc.submitted_at::date between p_period_start and p_period_end
      and (fc.duplicate_suspected or (fc.status = 'SUBMITTED' and fc.submitted_at < now() - interval '2 days'))
  ) q order by case q.severity when 'HIGH' then 1 else 2 end, q.occurred_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
end;
$$;

revoke all on function public.get_field_force_dashboard(date, date) from public;
revoke all on function public.get_field_force_exceptions(date, date, integer) from public;
grant execute on function public.get_field_force_dashboard(date, date) to authenticated;
grant execute on function public.get_field_force_exceptions(date, date, integer) to authenticated;
