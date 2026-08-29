-- Audited target history and controlled month-to-month lifecycle.

create table public.performance_target_events (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  target_id uuid not null references public.performance_targets(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  action text not null check (action in ('CREATED','COPIED','ACTIVATED','CLOSED')),
  from_status text check (from_status is null or from_status in ('DRAFT','ACTIVE','CLOSED')),
  to_status text check (to_status is null or to_status in ('DRAFT','ACTIVE','CLOSED')),
  metadata jsonb not null default '{}',
  created timestamptz not null default now()
);

create index performance_target_events_target on public.performance_target_events(target_id, created desc);
alter table public.performance_target_events enable row level security;

create policy "performance_target_events_select" on public.performance_target_events for select using (
  public.is_super_admin()
  or (
    organization_id = public.auth_org_id()
    and exists (
      select 1 from public.performance_targets t
      where t.id = performance_target_events.target_id
        and (public.auth_role() in ('ADMIN','HR','MANAGER') or t.employee_id = auth.uid())
    )
  )
);

insert into public.performance_target_events(
  organization_id, target_id, actor_id, action, from_status, to_status, metadata, created
)
select t.organization_id, t.id, t.created_by, 'CREATED', null, t.status,
  jsonb_build_object('backfilled', true), t.created
from public.performance_targets t;

create or replace function public.audit_performance_target_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.performance_target_events(
      organization_id, target_id, actor_id, action, from_status, to_status
    ) values (
      new.organization_id, new.id, coalesce(auth.uid(), new.created_by), 'CREATED', null, new.status
    );
  elsif old.status is distinct from new.status then
    insert into public.performance_target_events(
      organization_id, target_id, actor_id, action, from_status, to_status
    ) values (
      new.organization_id, new.id, coalesce(auth.uid(), new.created_by),
      case new.status when 'ACTIVE' then 'ACTIVATED' when 'CLOSED' then 'CLOSED' else 'ACTIVATED' end,
      old.status, new.status
    );
  end if;
  return new;
end;
$$;

create trigger performance_target_lifecycle_audit
  after insert or update of status on public.performance_targets
  for each row execute function public.audit_performance_target_lifecycle();

create or replace function public.copy_employee_performance_target(
  p_source_target_id uuid,
  p_period_start date,
  p_period_end date
)
returns public.performance_targets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := public.auth_org_id();
  v_source public.performance_targets;
  v_target public.performance_targets;
  v_weight numeric;
begin
  if not (public.is_super_admin() or public.auth_role() in ('ADMIN','HR','MANAGER')) then
    raise exception 'manager access required';
  end if;
  if p_period_start is null or p_period_end is null or p_period_end < p_period_start then
    raise exception 'valid target period is required';
  end if;
  if p_period_end - p_period_start > 366 then raise exception 'target period cannot exceed 367 days'; end if;

  select * into v_source from public.performance_targets t
  where t.id = p_source_target_id and t.organization_id = v_org_id and t.assignee_type = 'EMPLOYEE';
  if not found then raise exception 'source employee target not found'; end if;

  select sum(m.weight) into v_weight
  from public.performance_target_metrics m
  where m.target_id = v_source.id and m.metric_key <> 'attendance_discipline';
  if v_weight <> 100 then
    raise exception 'legacy target cannot be copied; create a new outcome-only target';
  end if;

  insert into public.performance_targets(
    organization_id, assignee_type, employee_id, period_start, period_end, status, created_by
  ) values (
    v_org_id, 'EMPLOYEE', v_source.employee_id, p_period_start, p_period_end, 'DRAFT', auth.uid()
  ) returning * into v_target;

  insert into public.performance_target_metrics(target_id, metric_key, target_value, weight, unit)
  select v_target.id, m.metric_key, m.target_value, m.weight, m.unit
  from public.performance_target_metrics m
  where m.target_id = v_source.id and m.metric_key <> 'attendance_discipline';

  insert into public.performance_target_events(
    organization_id, target_id, actor_id, action, from_status, to_status, metadata
  ) values (
    v_org_id, v_target.id, auth.uid(), 'COPIED', null, 'DRAFT',
    jsonb_build_object('source_target_id', v_source.id)
  );

  return v_target;
end;
$$;

create or replace function public.change_performance_target_status(
  p_target_id uuid,
  p_status text
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
  if not (public.is_super_admin() or public.auth_role() in ('ADMIN','HR','MANAGER')) then
    raise exception 'manager access required';
  end if;
  select * into v_target from public.performance_targets t
  where t.id = p_target_id and t.organization_id = v_org_id for update;
  if not found then raise exception 'target not found'; end if;

  if p_status = 'ACTIVE' and v_target.status = 'DRAFT' then
    select sum(m.weight) into v_weight from public.performance_target_metrics m
    where m.target_id = v_target.id and m.metric_key <> 'attendance_discipline';
    if v_weight <> 100 or exists (
      select 1 from public.performance_target_metrics m
      where m.target_id = v_target.id and m.metric_key = 'attendance_discipline'
    ) then raise exception 'only a complete outcome-only target can be activated'; end if;
  elsif p_status = 'CLOSED' and v_target.status = 'ACTIVE' then
    null;
  else
    raise exception 'invalid or irreversible target status transition';
  end if;

  update public.performance_targets
  set status = p_status, updated = now()
  where id = v_target.id
  returning * into v_target;
  return v_target;
end;
$$;

create or replace function public.get_employee_performance_history(
  p_employee_id uuid default null,
  p_limit integer default 12
)
returns table (
  target_id uuid,
  employee_id uuid,
  period_start date,
  period_end date,
  target_status text,
  outcome_score numeric,
  metric_count bigint,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org_id uuid := public.auth_org_id();
  v_employee_id uuid := coalesce(p_employee_id, auth.uid());
  v_privileged boolean := public.is_super_admin() or public.auth_role() in ('ADMIN','HR','MANAGER');
begin
  if auth.uid() is null or v_org_id is null then raise exception 'authenticated organization member required'; end if;
  if not exists (select 1 from public.profiles p where p.id = v_employee_id and p.organization_id = v_org_id) then
    raise exception 'employee not found';
  end if;
  if v_employee_id <> auth.uid() and not v_privileged then raise exception 'manager access required'; end if;

  return query
  with selected_targets as (
    select t.* from public.performance_targets t
    where t.organization_id = v_org_id and t.assignee_type = 'EMPLOYEE' and t.employee_id = v_employee_id
      and (v_privileged or t.status <> 'DRAFT')
    order by t.period_end desc, t.created desc
    limit greatest(1, least(coalesce(p_limit, 12), 36))
  ), metric_values as (
    select t.id target_id, m.weight,
      case m.metric_key
        when 'sales_amount' then coalesce((select sum(d.amount) from public.crm_deals d where d.owner_id = t.employee_id and d.stage = 'WON' and d.won_at::date between t.period_start and t.period_end), 0)
        when 'collection_amount' then coalesce((select sum(c.amount) from public.field_collections c where c.employee_id = t.employee_id and c.status = 'RECONCILED' and c.reconciled_at::date between t.period_start and t.period_end), 0)
        when 'productive_visits' then (select count(*)::numeric from public.field_visits v where v.employee_id = t.employee_id and v.status = 'COMPLETED' and nullif(trim(v.outcome), '') is not null and v.completed_at::date between t.period_start and t.period_end)
        when 'new_dealers' then (select count(*)::numeric from public.customers c where c.registered_by = t.employee_id and c.approval_status = 'APPROVED' and c.created::date between t.period_start and t.period_end)
        when 'lead_conversion' then coalesce((select round(100.0 * count(*) filter (where l.stage = 'WON') / nullif(count(*), 0), 2) from public.crm_leads l where l.owner_id = t.employee_id and l.created::date between t.period_start and t.period_end), 0)
        else 0
      end::numeric actual_value,
      m.target_value
    from selected_targets t
    join public.performance_target_metrics m on m.target_id = t.id
    where m.metric_key <> 'attendance_discipline'
  ), scores as (
    select m.target_id,
      round(sum(m.weight * least(120, 100 * m.actual_value / m.target_value)) / nullif(sum(m.weight), 0), 2) score,
      count(*) metric_count
    from metric_values m group by m.target_id
  )
  select t.id, t.employee_id, t.period_start, t.period_end, t.status,
    coalesce(s.score, 0), coalesce(s.metric_count, 0), t.updated
  from selected_targets t left join scores s on s.target_id = t.id
  order by t.period_end desc, t.created desc;
end;
$$;

revoke all on function public.copy_employee_performance_target(uuid, date, date) from public;
revoke all on function public.change_performance_target_status(uuid, text) from public;
revoke all on function public.get_employee_performance_history(uuid, integer) from public;
grant execute on function public.copy_employee_performance_target(uuid, date, date) to authenticated;
grant execute on function public.change_performance_target_status(uuid, text) to authenticated;
grant execute on function public.get_employee_performance_history(uuid, integer) to authenticated;
