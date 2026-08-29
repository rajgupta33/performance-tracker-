-- Versioned point rules, immutable badge awards, and signed audited adjustments.

create table public.point_rules (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_type text not null check (event_type in ('LEAD_CREATED','PRODUCTIVE_VISIT','DEAL_WON','COLLECTION_RECONCILED','DEALER_ACTIVATED')),
  points integer not null check (points between 1 and 100),
  rule_version text not null,
  status text not null default 'DRAFT' check (status in ('DRAFT','ACTIVE','RETIRED')),
  effective_from timestamptz not null,
  effective_to timestamptz,
  change_note text not null,
  created_by uuid references public.profiles(id) on delete restrict,
  approved_by uuid references public.profiles(id) on delete restrict,
  approved_at timestamptz,
  approval_note text,
  created timestamptz not null default now(),
  unique (organization_id, event_type, rule_version),
  check (effective_to is null or effective_to > effective_from),
  check ((status = 'DRAFT' and approved_at is null) or status <> 'DRAFT')
);
create unique index point_rules_one_active on public.point_rules(organization_id, event_type) where status = 'ACTIVE';
create index point_rules_effective on public.point_rules(organization_id, event_type, effective_from desc);

create table public.performance_badges (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  description text not null,
  threshold_points integer not null check (threshold_points between 1 and 10000),
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete restrict,
  created timestamptz not null default now(),
  updated timestamptz not null default now(),
  unique (organization_id, code)
);

create table public.employee_badges (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.profiles(id) on delete cascade,
  badge_id uuid not null references public.performance_badges(id) on delete restrict,
  period_start date not null,
  points_at_award integer not null,
  threshold_points_at_award integer not null,
  awarded_at timestamptz not null default now(),
  unique (employee_id, badge_id, period_start)
);
create index employee_badges_employee on public.employee_badges(organization_id, employee_id, awarded_at desc);

create table public.point_adjustments (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.profiles(id) on delete restrict,
  points_delta integer not null check (points_delta between -100 and 100 and points_delta <> 0),
  reason text not null check (length(trim(reason)) >= 10),
  reference text not null check (length(trim(reference)) >= 3),
  occurred_at timestamptz not null,
  adjusted_by uuid not null references public.profiles(id) on delete restrict,
  client_event_id uuid not null,
  created timestamptz not null default now(),
  unique (organization_id, client_event_id)
);
create index point_adjustments_employee on public.point_adjustments(organization_id, employee_id, occurred_at desc);

create table public.performance_config_events (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  entity_type text not null check (entity_type in ('POINT_RULE','BADGE')),
  entity_id uuid not null,
  action text not null check (action in ('DRAFT_CREATED','ACTIVATED','BADGE_CREATED','BADGE_UPDATED')),
  metadata jsonb not null default '{}',
  created timestamptz not null default now()
);
create index performance_config_events_org on public.performance_config_events(organization_id, created desc);

alter table public.point_rules enable row level security;
alter table public.performance_badges enable row level security;
alter table public.employee_badges enable row level security;
alter table public.point_adjustments enable row level security;
alter table public.performance_config_events enable row level security;

create policy "point_rules_select" on public.point_rules for select using (
  public.is_super_admin() or (organization_id = public.auth_org_id() and public.auth_role() in ('ADMIN','HR','MANAGER'))
);
create policy "performance_badges_select" on public.performance_badges for select using (
  public.is_super_admin() or organization_id = public.auth_org_id()
);
create policy "employee_badges_select" on public.employee_badges for select using (
  public.is_super_admin() or (organization_id = public.auth_org_id() and (employee_id = auth.uid() or public.auth_role() in ('ADMIN','HR','MANAGER')))
);
create policy "point_adjustments_select" on public.point_adjustments for select using (
  public.is_super_admin() or (organization_id = public.auth_org_id() and (employee_id = auth.uid() or public.auth_role() in ('ADMIN','HR','MANAGER')))
);
create policy "performance_config_events_select" on public.performance_config_events for select using (
  public.is_super_admin() or (organization_id = public.auth_org_id() and public.auth_role() in ('ADMIN','HR'))
);

create or replace function public.seed_performance_rules(p_organization_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.point_rules(organization_id, event_type, points, rule_version, status, effective_from, change_note)
  values
    (p_organization_id, 'LEAD_CREATED', 2, 'v1', 'ACTIVE', '1970-01-01', 'System starter rule'),
    (p_organization_id, 'PRODUCTIVE_VISIT', 10, 'v1', 'ACTIVE', '1970-01-01', 'System starter rule'),
    (p_organization_id, 'DEAL_WON', 25, 'v1', 'ACTIVE', '1970-01-01', 'System starter rule'),
    (p_organization_id, 'COLLECTION_RECONCILED', 15, 'v1', 'ACTIVE', '1970-01-01', 'System starter rule'),
    (p_organization_id, 'DEALER_ACTIVATED', 20, 'v1', 'ACTIVE', '1970-01-01', 'System starter rule')
  on conflict do nothing;
  insert into public.performance_badges(organization_id, code, name, description, threshold_points)
  values
    (p_organization_id, 'FIELD_STARTER', 'Field Starter', 'Earn 25 points in one calendar month.', 25),
    (p_organization_id, 'MOMENTUM', 'Momentum', 'Earn 75 points in one calendar month.', 75),
    (p_organization_id, 'CHAMPION', 'Champion', 'Earn 150 points in one calendar month.', 150)
  on conflict do nothing;
end;
$$;

select public.seed_performance_rules(o.id) from public.organizations o;

create or replace function public.seed_new_organization_performance_rules()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.seed_performance_rules(new.id);
  return new;
end;
$$;
create trigger organizations_seed_performance_rules after insert on public.organizations
  for each row execute function public.seed_new_organization_performance_rules();

create or replace function public.refresh_employee_badges(p_organization_id uuid, p_employee_id uuid, p_occurred_at timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_month date := date_trunc('month', p_occurred_at)::date;
  v_points integer;
begin
  select coalesce(sum(x.points), 0)::integer into v_points from (
    select e.points from public.point_events e where e.organization_id = p_organization_id and e.employee_id = p_employee_id and e.occurred_at::date between v_month and (v_month + interval '1 month - 1 day')::date
    union all
    select a.points_delta from public.point_adjustments a where a.organization_id = p_organization_id and a.employee_id = p_employee_id and a.occurred_at::date between v_month and (v_month + interval '1 month - 1 day')::date
  ) x;
  insert into public.employee_badges(organization_id, employee_id, badge_id, period_start, points_at_award, threshold_points_at_award)
  select p_organization_id, p_employee_id, b.id, v_month, v_points, b.threshold_points
  from public.performance_badges b
  where b.organization_id = p_organization_id and b.active and v_points >= b.threshold_points
  on conflict (employee_id, badge_id, period_start) do nothing;
end;
$$;

create or replace function public.award_configured_point_event(
  p_organization_id uuid, p_employee_id uuid, p_event_type text,
  p_source_table text, p_source_id uuid, p_occurred_at timestamptz
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_rule public.point_rules;
  v_event_id uuid;
  v_occurred_at timestamptz := coalesce(p_occurred_at, now());
begin
  if p_employee_id is null then return; end if;
  if not exists (select 1 from public.profiles p where p.id = p_employee_id and p.organization_id = p_organization_id) then
    raise exception 'point recipient must belong to the source organization';
  end if;
  select * into v_rule from public.point_rules r
  where r.organization_id = p_organization_id and r.event_type = p_event_type
    and r.status in ('ACTIVE','RETIRED') and r.effective_from <= v_occurred_at
    and (r.effective_to is null or v_occurred_at < r.effective_to)
  order by r.effective_from desc limit 1;
  if not found then raise exception 'no effective point rule configured'; end if;
  insert into public.point_events(organization_id, employee_id, event_type, points, source_table, source_id, rule_version, occurred_at)
  values (p_organization_id, p_employee_id, p_event_type, v_rule.points, p_source_table, p_source_id, v_rule.rule_version, v_occurred_at)
  on conflict (employee_id, event_type, source_table, source_id) do nothing returning id into v_event_id;
  if v_event_id is not null then perform public.refresh_employee_badges(p_organization_id, p_employee_id, v_occurred_at); end if;
end;
$$;

create or replace function public.award_visit_points()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'COMPLETED' and new.location_status = 'VERIFIED' and nullif(trim(new.outcome), '') is not null and (tg_op = 'INSERT' or old.status <> 'COMPLETED') then
    perform public.award_configured_point_event(new.organization_id, new.employee_id, 'PRODUCTIVE_VISIT', 'field_visits', new.id, new.completed_at);
  end if;
  return new;
end;
$$;
create or replace function public.award_lead_points()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.award_configured_point_event(new.organization_id, new.owner_id, 'LEAD_CREATED', 'crm_leads', new.id, new.created); return new;
end;
$$;
create or replace function public.award_deal_points()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.stage = 'WON' and (tg_op = 'INSERT' or old.stage <> 'WON') then perform public.award_configured_point_event(new.organization_id, new.owner_id, 'DEAL_WON', 'crm_deals', new.id, new.won_at); end if; return new;
end;
$$;
create or replace function public.award_collection_points()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'RECONCILED' and (tg_op = 'INSERT' or old.status <> 'RECONCILED') then perform public.award_configured_point_event(new.organization_id, new.employee_id, 'COLLECTION_RECONCILED', 'field_collections', new.id, new.reconciled_at); end if; return new;
end;
$$;
create or replace function public.award_dealer_points()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.approval_status = 'APPROVED' and new.registered_by is not null and (tg_op = 'INSERT' or old.approval_status <> 'APPROVED') then perform public.award_configured_point_event(new.organization_id, new.registered_by, 'DEALER_ACTIVATED', 'customers', new.id, coalesce(new.verified_at, new.created)); end if; return new;
end;
$$;

create or replace function public.configure_point_rule(p_event_type text, p_points integer, p_effective_from timestamptz, p_change_note text)
returns public.point_rules language plpgsql security definer set search_path = public as $$
declare v_org_id uuid := public.auth_org_id(); v_rule public.point_rules;
begin
  if not (public.is_super_admin() or public.auth_role() in ('ADMIN','HR')) then raise exception 'admin or HR access required'; end if;
  if p_event_type not in ('LEAD_CREATED','PRODUCTIVE_VISIT','DEAL_WON','COLLECTION_RECONCILED','DEALER_ACTIVATED') or p_points not between 1 and 100 then raise exception 'valid event and points from 1 to 100 are required'; end if;
  if p_effective_from < now() then raise exception 'point rule changes cannot be backdated'; end if;
  if length(trim(coalesce(p_change_note, ''))) < 10 then raise exception 'change note must contain at least 10 characters'; end if;
  if exists (select 1 from public.point_rules r where r.organization_id = v_org_id and r.event_type = p_event_type and r.effective_from >= p_effective_from) then raise exception 'effective date must follow existing rule versions'; end if;
  insert into public.point_rules(organization_id,event_type,points,rule_version,status,effective_from,change_note,created_by)
  values(v_org_id,p_event_type,p_points,'v-' || to_char(p_effective_from,'YYYYMMDDHH24MISS') || '-' || left(uuid_generate_v4()::text,8),'DRAFT',p_effective_from,trim(p_change_note),auth.uid()) returning * into v_rule;
  insert into public.performance_config_events(organization_id,actor_id,entity_type,entity_id,action,metadata)
  values(v_org_id,auth.uid(),'POINT_RULE',v_rule.id,'DRAFT_CREATED',jsonb_build_object('event_type',p_event_type,'points',p_points,'effective_from',p_effective_from));
  return v_rule;
end;
$$;

create or replace function public.activate_point_rule(p_rule_id uuid, p_approval_note text)
returns public.point_rules language plpgsql security definer set search_path = public as $$
declare v_org_id uuid := public.auth_org_id(); v_rule public.point_rules;
begin
  if not (public.is_super_admin() or public.auth_role() in ('ADMIN','HR')) then raise exception 'admin or HR access required'; end if;
  if length(trim(coalesce(p_approval_note, ''))) < 10 then raise exception 'approval note must contain at least 10 characters'; end if;
  select * into v_rule from public.point_rules r where r.id=p_rule_id and r.organization_id=v_org_id for update;
  if not found or v_rule.status <> 'DRAFT' then raise exception 'draft rule not found'; end if;
  update public.point_rules set status='RETIRED', effective_to=v_rule.effective_from
  where organization_id=v_org_id and event_type=v_rule.event_type and status='ACTIVE';
  update public.point_rules set status='ACTIVE',approved_by=auth.uid(),approved_at=now(),approval_note=trim(p_approval_note)
  where id=v_rule.id returning * into v_rule;
  insert into public.performance_config_events(organization_id,actor_id,entity_type,entity_id,action,metadata)
  values(v_org_id,auth.uid(),'POINT_RULE',v_rule.id,'ACTIVATED',jsonb_build_object('approval_note',trim(p_approval_note)));
  return v_rule;
end;
$$;

create or replace function public.upsert_performance_badge(p_code text,p_name text,p_description text,p_threshold_points integer,p_active boolean default true)
returns public.performance_badges language plpgsql security definer set search_path = public as $$
declare v_org_id uuid := public.auth_org_id(); v_badge public.performance_badges; v_existing boolean; v_employee_id uuid;
begin
  if not (public.is_super_admin() or public.auth_role() in ('ADMIN','HR')) then raise exception 'admin or HR access required'; end if;
  if upper(trim(p_code)) !~ '^[A-Z0-9_]{2,30}$' or length(trim(coalesce(p_name,''))) < 2 or length(trim(coalesce(p_description,''))) < 10 or p_threshold_points not between 1 and 10000 then raise exception 'valid badge code, name, description, and threshold are required'; end if;
  select exists(select 1 from public.performance_badges b where b.organization_id=v_org_id and b.code=upper(trim(p_code))) into v_existing;
  insert into public.performance_badges(organization_id,code,name,description,threshold_points,active,created_by)
  values(v_org_id,upper(trim(p_code)),trim(p_name),trim(p_description),p_threshold_points,coalesce(p_active,true),auth.uid())
  on conflict(organization_id,code) do update set name=excluded.name,description=excluded.description,threshold_points=excluded.threshold_points,active=excluded.active,updated=now()
  returning * into v_badge;
  insert into public.performance_config_events(organization_id,actor_id,entity_type,entity_id,action,metadata)
  values(v_org_id,auth.uid(),'BADGE',v_badge.id,case when v_existing then 'BADGE_UPDATED' else 'BADGE_CREATED' end,jsonb_build_object('threshold_points',p_threshold_points,'active',p_active));
  if v_badge.active then
    for v_employee_id in
      select distinct x.employee_id from (
        select e.employee_id from public.point_events e where e.organization_id=v_org_id and e.occurred_at>=date_trunc('month',now())
        union select a.employee_id from public.point_adjustments a where a.organization_id=v_org_id and a.occurred_at>=date_trunc('month',now())
      ) x
    loop perform public.refresh_employee_badges(v_org_id,v_employee_id,now()); end loop;
  end if;
  return v_badge;
end;
$$;

create or replace function public.create_point_adjustment(p_employee_id uuid,p_points_delta integer,p_reason text,p_reference text,p_occurred_at timestamptz,p_client_event_id uuid)
returns public.point_adjustments language plpgsql security definer set search_path = public as $$
declare v_org_id uuid := public.auth_org_id(); v_adjustment public.point_adjustments;
begin
  if not (public.is_super_admin() or public.auth_role() in ('ADMIN','HR')) then raise exception 'admin or HR access required'; end if;
  if not exists(select 1 from public.profiles p where p.id=p_employee_id and p.organization_id=v_org_id and p.role<>'SUPER_ADMIN') then raise exception 'employee not found'; end if;
  if p_points_delta not between -100 and 100 or p_points_delta=0 then raise exception 'adjustment must be between -100 and 100 and not zero'; end if;
  if length(trim(coalesce(p_reason,'')))<10 or length(trim(coalesce(p_reference,'')))<3 then raise exception 'reason and reference are required'; end if;
  if p_occurred_at is null or p_occurred_at > now() + interval '5 minutes' or p_occurred_at < now() - interval '90 days' then raise exception 'adjustment date must be within the last 90 days'; end if;
  if p_client_event_id is null then raise exception 'idempotency key is required'; end if;
  insert into public.point_adjustments(organization_id,employee_id,points_delta,reason,reference,occurred_at,adjusted_by,client_event_id)
  values(v_org_id,p_employee_id,p_points_delta,trim(p_reason),trim(p_reference),p_occurred_at,auth.uid(),p_client_event_id)
  on conflict(organization_id,client_event_id) do update set client_event_id=excluded.client_event_id returning * into v_adjustment;
  if v_adjustment.employee_id<>p_employee_id or v_adjustment.points_delta<>p_points_delta then raise exception 'idempotency key belongs to another adjustment'; end if;
  if p_points_delta>0 then perform public.refresh_employee_badges(v_org_id,p_employee_id,p_occurred_at); end if;
  return v_adjustment;
end;
$$;

create or replace function public.get_my_points_summary()
returns table(current_month_points bigint,personal_best_points bigint,personal_best_month date,current_month_events bigint)
language sql stable security definer set search_path=public as $$
  with ledger as (
    select e.occurred_at,e.points::bigint points from public.point_events e where e.organization_id=public.auth_org_id() and e.employee_id=auth.uid()
    union all select a.occurred_at,a.points_delta::bigint from public.point_adjustments a where a.organization_id=public.auth_org_id() and a.employee_id=auth.uid()
  ), monthly as (select date_trunc('month',occurred_at)::date as month_start,sum(points)::bigint points,count(*)::bigint events from ledger group by 1),
  best as (select month_start,points from monthly order by points desc,month_start desc limit 1)
  select coalesce((select points from monthly where month_start=date_trunc('month',now())::date),0),coalesce((select greatest(points,0) from best),0),(select month_start from best),coalesce((select events from monthly where month_start=date_trunc('month',now())::date),0);
$$;

create or replace function public.get_points_leaderboard(p_period_start date default date_trunc('month',now())::date,p_period_end date default (date_trunc('month',now())+interval '1 month - 1 day')::date,p_limit integer default 20)
returns table(rank bigint,employee_id uuid,employee_name text,points bigint,event_count bigint)
language sql stable security definer set search_path=public as $$
  with ledger as (
    select e.employee_id,e.points::bigint points from public.point_events e where e.organization_id=public.auth_org_id() and e.occurred_at::date between p_period_start and p_period_end
    union all select a.employee_id,a.points_delta::bigint from public.point_adjustments a where a.organization_id=public.auth_org_id() and a.occurred_at::date between p_period_start and p_period_end
  ), totals as (select l.employee_id,coalesce(p.name,p.employee_id,'Unnamed employee') employee_name,sum(l.points)::bigint points,count(*)::bigint event_count from ledger l join public.profiles p on p.id=l.employee_id group by l.employee_id,p.name,p.employee_id)
  select rank() over(order by t.points desc,t.event_count desc),t.employee_id,t.employee_name,t.points,t.event_count from totals t order by t.points desc,t.event_count desc,t.employee_name limit greatest(1,least(coalesce(p_limit,20),100));
$$;

create or replace function public.get_my_performance_badges()
returns table(code text,name text,description text,threshold_points integer,earned boolean,earned_at timestamptz)
language sql stable security definer set search_path=public as $$
  select b.code,b.name,b.description,b.threshold_points,(eb.id is not null),eb.awarded_at
  from public.performance_badges b left join public.employee_badges eb on eb.badge_id=b.id and eb.employee_id=auth.uid() and eb.period_start=date_trunc('month',now())::date
  where b.organization_id=public.auth_org_id() and b.active order by b.threshold_points,b.name;
$$;

create or replace function public.list_point_rules()
returns setof public.point_rules language plpgsql stable security definer set search_path=public as $$
begin
  if not (public.is_super_admin() or public.auth_role() in ('ADMIN','HR')) then
    raise exception 'admin or HR access required';
  end if;
  return query
    select r.* from public.point_rules r
    where r.organization_id=public.auth_org_id()
    order by r.event_type,r.effective_from desc;
end;
$$;

do $$
declare v_row record;
begin
  for v_row in
    select distinct e.organization_id,e.employee_id,date_trunc('month',e.occurred_at) month_start from public.point_events e
  loop
    perform public.refresh_employee_badges(v_row.organization_id,v_row.employee_id,v_row.month_start);
  end loop;
end;
$$;

revoke all on function public.seed_performance_rules(uuid) from public;
revoke all on function public.refresh_employee_badges(uuid,uuid,timestamptz) from public;
revoke all on function public.award_configured_point_event(uuid,uuid,text,text,uuid,timestamptz) from public;
revoke all on function public.configure_point_rule(text,integer,timestamptz,text) from public;
revoke all on function public.activate_point_rule(uuid,text) from public;
revoke all on function public.upsert_performance_badge(text,text,text,integer,boolean) from public;
revoke all on function public.create_point_adjustment(uuid,integer,text,text,timestamptz,uuid) from public;
revoke all on function public.get_my_performance_badges() from public;
revoke all on function public.list_point_rules() from public;
grant execute on function public.configure_point_rule(text,integer,timestamptz,text) to authenticated;
grant execute on function public.activate_point_rule(uuid,text) to authenticated;
grant execute on function public.upsert_performance_badge(text,text,text,integer,boolean) to authenticated;
grant execute on function public.create_point_adjustment(uuid,integer,text,text,timestamptz,uuid) to authenticated;
grant execute on function public.get_my_performance_badges() to authenticated;
grant execute on function public.list_point_rules() to authenticated;
