-- Outcome-focused coaching actions that turn scorecard signals into auditable follow-up.

create table public.performance_coaching_actions (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.profiles(id) on delete restrict,
  target_id uuid references public.performance_targets(id) on delete set null,
  metric_key text not null check (metric_key in ('sales_amount','collection_amount','productive_visits','new_dealers','lead_conversion')),
  title text not null check (length(trim(title)) between 3 and 120),
  action_plan text not null check (length(trim(action_plan)) between 20 and 2000),
  due_date date not null,
  status text not null default 'OPEN' check (status in ('OPEN','IN_PROGRESS','COMPLETED','CANCELLED')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  completed_by uuid references public.profiles(id) on delete restrict,
  completed_at timestamptz,
  created timestamptz not null default now(),
  updated timestamptz not null default now(),
  check ((status = 'COMPLETED' and completed_at is not null and completed_by is not null) or status <> 'COMPLETED')
);
create index performance_coaching_actions_employee
  on public.performance_coaching_actions(organization_id, employee_id, status, due_date);

create table public.performance_coaching_events (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  action_id uuid not null references public.performance_coaching_actions(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  from_status text,
  to_status text not null check (to_status in ('OPEN','IN_PROGRESS','COMPLETED','CANCELLED')),
  note text not null,
  created timestamptz not null default now()
);
create index performance_coaching_events_action
  on public.performance_coaching_events(organization_id, action_id, created);

alter table public.performance_coaching_actions enable row level security;
alter table public.performance_coaching_events enable row level security;

create policy "performance_coaching_actions_select" on public.performance_coaching_actions
for select using (
  public.is_super_admin() or (
    organization_id = public.auth_org_id()
    and (employee_id = auth.uid() or public.auth_role() in ('ADMIN','HR','MANAGER'))
  )
);

create policy "performance_coaching_events_select" on public.performance_coaching_events
for select using (
  public.is_super_admin() or (
    organization_id = public.auth_org_id()
    and exists (
      select 1 from public.performance_coaching_actions a
      where a.id = action_id
        and (a.employee_id = auth.uid() or public.auth_role() in ('ADMIN','HR','MANAGER'))
    )
  )
);

create or replace function public.list_performance_coaching_actions(
  p_employee_id uuid default null,
  p_status text default null
)
returns table (
  action_id uuid,
  employee_id uuid,
  employee_name text,
  target_id uuid,
  metric_key text,
  title text,
  action_plan text,
  due_date date,
  status text,
  created_by_name text,
  completed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org_id uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_employee_id uuid := coalesce(p_employee_id, auth.uid());
begin
  if auth.uid() is null or v_org_id is null then raise exception 'authenticated organization member required'; end if;
  if v_role not in ('ADMIN','HR','MANAGER') and v_employee_id <> auth.uid() then
    raise exception 'employee access restricted to own coaching actions';
  end if;
  if p_status is not null and upper(p_status) not in ('OPEN','IN_PROGRESS','COMPLETED','CANCELLED') then
    raise exception 'valid coaching status required';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_employee_id and p.organization_id = v_org_id) then
    raise exception 'employee not found';
  end if;

  return query
  select a.id, a.employee_id, coalesce(p.name,p.employee_id,'Unnamed employee'), a.target_id,
    a.metric_key, a.title, a.action_plan, a.due_date, a.status,
    coalesce(c.name,c.employee_id,'Unknown manager'), a.completed_at, a.created, a.updated
  from public.performance_coaching_actions a
  join public.profiles p on p.id = a.employee_id
  join public.profiles c on c.id = a.created_by
  where a.organization_id = v_org_id
    and a.employee_id = v_employee_id
    and (p_status is null or a.status = upper(p_status))
  order by case a.status when 'IN_PROGRESS' then 1 when 'OPEN' then 2 else 3 end,
    a.due_date, a.created desc;
end;
$$;

create or replace function public.create_performance_coaching_action(
  p_employee_id uuid,
  p_target_id uuid,
  p_metric_key text,
  p_title text,
  p_action_plan text,
  p_due_date date
)
returns public.performance_coaching_actions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := public.auth_org_id();
  v_action public.performance_coaching_actions;
begin
  if not (public.is_super_admin() or public.auth_role() in ('ADMIN','HR','MANAGER')) then
    raise exception 'manager access required';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_employee_id and p.organization_id = v_org_id and p.role <> 'SUPER_ADMIN') then
    raise exception 'employee not found';
  end if;
  if p_target_id is not null and not exists (
    select 1 from public.performance_targets t
    where t.id = p_target_id and t.organization_id = v_org_id and t.employee_id = p_employee_id
  ) then raise exception 'performance target not found'; end if;
  if p_metric_key not in ('sales_amount','collection_amount','productive_visits','new_dealers','lead_conversion') then
    raise exception 'valid outcome metric required';
  end if;
  if length(trim(coalesce(p_title,''))) not between 3 and 120
    or length(trim(coalesce(p_action_plan,''))) not between 20 and 2000 then
    raise exception 'coaching title and detailed action plan are required';
  end if;
  if p_due_date is null or p_due_date < current_date or p_due_date > current_date + 180 then
    raise exception 'due date must be within the next 180 days';
  end if;

  insert into public.performance_coaching_actions(
    organization_id,employee_id,target_id,metric_key,title,action_plan,due_date,created_by
  ) values (
    v_org_id,p_employee_id,p_target_id,p_metric_key,trim(p_title),trim(p_action_plan),p_due_date,auth.uid()
  ) returning * into v_action;

  insert into public.performance_coaching_events(organization_id,action_id,actor_id,from_status,to_status,note)
  values(v_org_id,v_action.id,auth.uid(),null,'OPEN','Coaching action created');
  return v_action;
end;
$$;

create or replace function public.change_performance_coaching_status(
  p_action_id uuid,
  p_status text,
  p_note text
)
returns public.performance_coaching_actions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := public.auth_org_id();
  v_action public.performance_coaching_actions;
  v_status text := upper(coalesce(p_status,''));
  v_from_status text;
begin
  if not (public.is_super_admin() or public.auth_role() in ('ADMIN','HR','MANAGER')) then
    raise exception 'manager access required';
  end if;
  if v_status not in ('IN_PROGRESS','COMPLETED','CANCELLED') then raise exception 'valid next coaching status required'; end if;
  if length(trim(coalesce(p_note,''))) < 10 then raise exception 'status note must contain at least 10 characters'; end if;

  select * into v_action from public.performance_coaching_actions a
  where a.id = p_action_id and a.organization_id = v_org_id for update;
  if not found then raise exception 'coaching action not found'; end if;
  if v_action.status in ('COMPLETED','CANCELLED') or v_action.status = v_status
    or (v_action.status = 'IN_PROGRESS' and v_status = 'IN_PROGRESS') then
    raise exception 'invalid coaching status transition';
  end if;
  v_from_status := v_action.status;

  update public.performance_coaching_actions
  set status = v_status,
    completed_by = case when v_status = 'COMPLETED' then auth.uid() else null end,
    completed_at = case when v_status = 'COMPLETED' then now() else null end,
    updated = now()
  where id = v_action.id
  returning * into v_action;

  insert into public.performance_coaching_events(organization_id,action_id,actor_id,from_status,to_status,note)
  values(v_org_id,v_action.id,auth.uid(),v_from_status,v_status,trim(p_note));
  return v_action;
end;
$$;

revoke all on function public.list_performance_coaching_actions(uuid,text) from public;
revoke all on function public.create_performance_coaching_action(uuid,uuid,text,text,text,date) from public;
revoke all on function public.change_performance_coaching_status(uuid,text,text) from public;
grant execute on function public.list_performance_coaching_actions(uuid,text) to authenticated;
grant execute on function public.create_performance_coaching_action(uuid,uuid,text,text,text,date) to authenticated;
grant execute on function public.change_performance_coaching_status(uuid,text,text) to authenticated;
