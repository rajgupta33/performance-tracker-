-- Organization-scoped bulk target preview and creation.

create or replace function public.preview_bulk_performance_targets(
  p_employee_ids uuid[],
  p_period_start date,
  p_period_end date
)
returns table (
  employee_id uuid,
  employee_name text,
  employee_code text,
  readiness text,
  existing_target_id uuid,
  existing_status text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org_id uuid := public.auth_org_id();
  v_requested integer;
  v_valid integer;
begin
  if not (public.is_super_admin() or public.auth_role() in ('ADMIN','HR','MANAGER')) then
    raise exception 'manager access required';
  end if;
  if p_period_start is null or p_period_end is null or p_period_end < p_period_start then
    raise exception 'valid target period is required';
  end if;
  if p_period_end - p_period_start > 366 then raise exception 'target period cannot exceed 367 days'; end if;

  select count(distinct id) into v_requested from unnest(coalesce(p_employee_ids, '{}')) id where id is not null;
  if v_requested < 1 or v_requested > 250 then raise exception 'select between 1 and 250 employees'; end if;
  select count(*) into v_valid from public.profiles p
  where p.id = any(p_employee_ids) and p.organization_id = v_org_id and p.role <> 'SUPER_ADMIN';
  if v_valid <> v_requested then raise exception 'one or more selected employees are invalid'; end if;

  return query
  select p.id, coalesce(p.name, p.employee_id, 'Unnamed employee'), p.employee_id,
    case when t.id is null then 'READY' else 'CONFLICT' end,
    t.id, t.status
  from public.profiles p
  left join public.performance_targets t
    on t.organization_id = v_org_id
    and t.assignee_type = 'EMPLOYEE'
    and t.employee_id = p.id
    and t.period_start = p_period_start
    and t.period_end = p_period_end
  where p.id = any(p_employee_ids) and p.organization_id = v_org_id and p.role <> 'SUPER_ADMIN'
  order by (t.id is not null), coalesce(p.name, p.employee_id, 'Unnamed employee');
end;
$$;

create or replace function public.bulk_create_employee_performance_targets(
  p_employee_ids uuid[],
  p_period_start date,
  p_period_end date,
  p_metrics jsonb,
  p_activate boolean default false
)
returns table (requested_count integer, created_count integer, conflict_count integer, created_target_ids uuid[])
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := public.auth_org_id();
  v_requested integer;
  v_valid integer;
  v_weight numeric;
  v_employee_id uuid;
  v_target_id uuid;
  v_created_ids uuid[] := '{}';
  v_created integer := 0;
  v_conflicts integer := 0;
begin
  if not (public.is_super_admin() or public.auth_role() in ('ADMIN','HR','MANAGER')) then
    raise exception 'manager access required';
  end if;
  if p_period_start is null or p_period_end is null or p_period_end < p_period_start then
    raise exception 'valid target period is required';
  end if;
  if p_period_end - p_period_start > 366 then raise exception 'target period cannot exceed 367 days'; end if;

  select count(distinct id) into v_requested from unnest(coalesce(p_employee_ids, '{}')) id where id is not null;
  if v_requested < 1 or v_requested > 250 then raise exception 'select between 1 and 250 employees'; end if;
  select count(*) into v_valid from public.profiles p
  where p.id = any(p_employee_ids) and p.organization_id = v_org_id and p.role <> 'SUPER_ADMIN';
  if v_valid <> v_requested then raise exception 'one or more selected employees are invalid'; end if;

  if jsonb_typeof(p_metrics) <> 'array' or jsonb_array_length(p_metrics) <> 5 then
    raise exception 'all five outcome metrics are required';
  end if;
  if (
    select count(distinct item->>'metric_key') from jsonb_array_elements(p_metrics) item
  ) <> 5 or exists (
    select 1 from jsonb_array_elements(p_metrics) item
    where item->>'metric_key' not in ('sales_amount','collection_amount','productive_visits','new_dealers','lead_conversion')
      or coalesce((item->>'target_value')::numeric, 0) <= 0
      or coalesce((item->>'weight')::numeric, 0) <= 0
      or item->>'unit' not in ('INR','COUNT','PERCENT')
      or (item->>'metric_key' in ('sales_amount','collection_amount') and item->>'unit' <> 'INR')
      or (item->>'metric_key' in ('productive_visits','new_dealers') and item->>'unit' <> 'COUNT')
      or (item->>'metric_key' = 'lead_conversion' and item->>'unit' <> 'PERCENT')
  ) then raise exception 'invalid outcome metric configuration'; end if;
  select sum((item->>'weight')::numeric) into v_weight from jsonb_array_elements(p_metrics) item;
  if v_weight <> 100 then raise exception 'target metric weights must total 100'; end if;

  for v_employee_id in select distinct id from unnest(p_employee_ids) id where id is not null loop
    v_target_id := null;
    insert into public.performance_targets(
      organization_id, assignee_type, employee_id, period_start, period_end, status, created_by
    ) values (
      v_org_id, 'EMPLOYEE', v_employee_id, p_period_start, p_period_end,
      case when p_activate then 'ACTIVE' else 'DRAFT' end, auth.uid()
    ) on conflict do nothing returning id into v_target_id;

    if v_target_id is null then
      v_conflicts := v_conflicts + 1;
    else
      insert into public.performance_target_metrics(target_id, metric_key, target_value, weight, unit)
      select v_target_id, item->>'metric_key', (item->>'target_value')::numeric,
        (item->>'weight')::numeric, item->>'unit'
      from jsonb_array_elements(p_metrics) item;
      v_created := v_created + 1;
      v_created_ids := array_append(v_created_ids, v_target_id);
    end if;
  end loop;

  update public.performance_target_events e
  set metadata = e.metadata || jsonb_build_object('bulk_assignment', true, 'requested_count', v_requested)
  where e.target_id = any(v_created_ids) and e.action = 'CREATED';

  return query select v_requested, v_created, v_conflicts, v_created_ids;
end;
$$;

revoke all on function public.preview_bulk_performance_targets(uuid[], date, date) from public;
revoke all on function public.bulk_create_employee_performance_targets(uuid[], date, date, jsonb, boolean) from public;
grant execute on function public.preview_bulk_performance_targets(uuid[], date, date) to authenticated;
grant execute on function public.bulk_create_employee_performance_targets(uuid[], date, date, jsonb, boolean) to authenticated;
