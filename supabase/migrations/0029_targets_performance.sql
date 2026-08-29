-- Flexible target headers, weighted metrics, and server-calculated achievement.

create table public.performance_targets (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  assignee_type text not null default 'EMPLOYEE' check (assignee_type in ('EMPLOYEE','TEAM','TERRITORY')),
  employee_id uuid references public.profiles(id) on delete cascade,
  team_id uuid references public.teams(id) on delete cascade,
  territory_id uuid references public.territories(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  status text not null default 'DRAFT' check (status in ('DRAFT','ACTIVE','CLOSED')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created timestamptz not null default now(),
  updated timestamptz not null default now(),
  check (period_end >= period_start),
  check (
    (assignee_type = 'EMPLOYEE' and employee_id is not null and team_id is null and territory_id is null)
    or (assignee_type = 'TEAM' and employee_id is null and team_id is not null and territory_id is null)
    or (assignee_type = 'TERRITORY' and employee_id is null and team_id is null and territory_id is not null)
  )
);

create unique index performance_targets_employee_period on public.performance_targets(organization_id, employee_id, period_start, period_end)
  where assignee_type = 'EMPLOYEE';
create index performance_targets_lookup on public.performance_targets(organization_id, status, period_start, period_end);

create table public.performance_target_metrics (
  id uuid primary key default uuid_generate_v4(),
  target_id uuid not null references public.performance_targets(id) on delete cascade,
  metric_key text not null check (metric_key in (
    'sales_amount','collection_amount','productive_visits','new_dealers','lead_conversion','attendance_discipline'
  )),
  target_value numeric not null check (target_value > 0),
  weight numeric not null check (weight > 0 and weight <= 100),
  unit text not null check (unit in ('INR','COUNT','PERCENT')),
  created timestamptz not null default now(),
  unique (target_id, metric_key)
);

alter table public.performance_targets enable row level security;
alter table public.performance_target_metrics enable row level security;

create policy "performance_targets_select" on public.performance_targets for select using (
  public.is_super_admin()
  or (
    organization_id = public.auth_org_id()
    and (
      public.auth_role() in ('ADMIN','HR','MANAGER')
      or employee_id = auth.uid()
      or (assignee_type = 'TEAM' and team_id = (select p.team_id from public.profiles p where p.id = auth.uid()))
      or (assignee_type = 'TERRITORY' and territory_id = (select p.territory_id from public.profiles p where p.id = auth.uid()))
    )
  )
);
create policy "performance_target_metrics_select" on public.performance_target_metrics for select using (
  exists (select 1 from public.performance_targets t where t.id = performance_target_metrics.target_id)
);

create or replace function public.create_employee_performance_target(
  p_employee_id uuid,
  p_period_start date,
  p_period_end date,
  p_metrics jsonb
)
returns public.performance_targets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := public.auth_org_id();
  v_target public.performance_targets;
  v_weight numeric;
begin
  if not (public.is_super_admin() or public.auth_role() in ('ADMIN','HR','MANAGER')) then raise exception 'manager access required'; end if;
  if p_period_start is null or p_period_end is null or p_period_end < p_period_start then raise exception 'valid target period is required'; end if;
  if not exists (select 1 from public.profiles p where p.id = p_employee_id and p.organization_id = v_org_id and p.role <> 'SUPER_ADMIN') then
    raise exception 'employee not found';
  end if;
  if jsonb_typeof(p_metrics) <> 'array' or jsonb_array_length(p_metrics) = 0 then raise exception 'at least one target metric is required'; end if;
  select sum((item->>'weight')::numeric) into v_weight from jsonb_array_elements(p_metrics) item;
  if v_weight <> 100 then raise exception 'target metric weights must total 100'; end if;

  insert into public.performance_targets(organization_id, assignee_type, employee_id, period_start, period_end, status, created_by)
  values (v_org_id, 'EMPLOYEE', p_employee_id, p_period_start, p_period_end, 'ACTIVE', auth.uid())
  returning * into v_target;

  insert into public.performance_target_metrics(target_id, metric_key, target_value, weight, unit)
  select v_target.id, item->>'metric_key', (item->>'target_value')::numeric,
    (item->>'weight')::numeric, item->>'unit'
  from jsonb_array_elements(p_metrics) item;
  return v_target;
end;
$$;

create or replace function public.get_employee_target_performance(p_employee_id uuid default null)
returns table (
  target_id uuid, employee_id uuid, period_start date, period_end date, target_status text,
  metric_key text, target_value numeric, weight numeric, unit text,
  actual_value numeric, achievement_pct numeric, weighted_score numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := public.auth_org_id();
  v_employee_id uuid := coalesce(p_employee_id, auth.uid());
  v_profile public.profiles;
begin
  select * into v_profile from public.profiles p where p.id = v_employee_id and p.organization_id = v_org_id;
  if not found then raise exception 'employee not found'; end if;
  if v_employee_id <> auth.uid() and not (public.is_super_admin() or public.auth_role() in ('ADMIN','HR','MANAGER')) then
    raise exception 'manager access required';
  end if;

  return query
  with selected_target as (
    select t.* from public.performance_targets t
    where t.organization_id = v_org_id and t.status in ('ACTIVE','CLOSED')
      and (
        (t.assignee_type = 'EMPLOYEE' and t.employee_id = v_employee_id)
        or (t.assignee_type = 'TEAM' and t.team_id = v_profile.team_id)
        or (t.assignee_type = 'TERRITORY' and t.territory_id = v_profile.territory_id)
      )
    order by (t.assignee_type = 'EMPLOYEE') desc, t.period_end desc, t.created desc limit 1
  ), calculated as (
    select t.id target_id, v_employee_id employee_id, t.period_start, t.period_end, t.status target_status,
      m.metric_key, m.target_value, m.weight, m.unit,
      case m.metric_key
        when 'sales_amount' then coalesce((select sum(d.amount) from public.crm_deals d where d.owner_id = v_employee_id and d.stage = 'WON' and d.won_at::date between t.period_start and t.period_end), 0)
        when 'collection_amount' then coalesce((select sum(c.amount) from public.field_collections c where c.employee_id = v_employee_id and c.status = 'RECONCILED' and c.reconciled_at::date between t.period_start and t.period_end), 0)
        when 'productive_visits' then (select count(*)::numeric from public.field_visits v where v.employee_id = v_employee_id and v.status = 'COMPLETED' and nullif(trim(v.outcome), '') is not null and v.completed_at::date between t.period_start and t.period_end)
        when 'new_dealers' then (select count(*)::numeric from public.customers c where c.registered_by = v_employee_id and c.approval_status = 'APPROVED' and c.created::date between t.period_start and t.period_end)
        when 'lead_conversion' then coalesce((select round(100.0 * count(*) filter (where l.stage = 'WON') / nullif(count(*), 0), 2) from public.crm_leads l where l.owner_id = v_employee_id and l.created::date between t.period_start and t.period_end), 0)
        when 'attendance_discipline' then coalesce((select round(100.0 * count(*) filter (where a.status in ('PRESENT','REMOTE')) / nullif(count(*) filter (where a.status not in ('HOLIDAY','LEAVE')), 0), 2) from public.attendance a where a.organization_id = v_org_id and a.employee_id = v_profile.employee_id and a.date between t.period_start and t.period_end), 0)
        else 0
      end::numeric actual_value
    from selected_target t join public.performance_target_metrics m on m.target_id = t.id
  )
  select c.target_id, c.employee_id, c.period_start, c.period_end, c.target_status,
    c.metric_key, c.target_value, c.weight, c.unit, c.actual_value,
    round(100 * c.actual_value / c.target_value, 2) achievement_pct,
    round(c.weight * least(120, 100 * c.actual_value / c.target_value) / 100, 2) weighted_score
  from calculated c order by c.weight desc, c.metric_key;
end;
$$;

revoke all on function public.create_employee_performance_target(uuid, date, date, jsonb) from public;
revoke all on function public.get_employee_target_performance(uuid) from public;
grant execute on function public.create_employee_performance_target(uuid, date, date, jsonb) to authenticated;
grant execute on function public.get_employee_target_performance(uuid) to authenticated;
