-- Idempotent, positive-only point ledger backed by verified business events.

create table public.point_events (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null check (event_type in (
    'LEAD_CREATED','PRODUCTIVE_VISIT','DEAL_WON','COLLECTION_RECONCILED','DEALER_ACTIVATED'
  )),
  points integer not null check (points > 0),
  source_table text not null check (source_table in ('crm_leads','field_visits','crm_deals','field_collections','customers')),
  source_id uuid not null,
  rule_version text not null default 'v1',
  occurred_at timestamptz not null,
  created timestamptz not null default now(),
  unique (employee_id, event_type, source_table, source_id)
);

create index point_events_employee_date on public.point_events(organization_id, employee_id, occurred_at desc);
create index point_events_leaderboard on public.point_events(organization_id, occurred_at, points);

alter table public.point_events enable row level security;
create policy "point_events_select" on public.point_events for select using (
  public.is_super_admin()
  or (organization_id = public.auth_org_id() and (employee_id = auth.uid() or public.auth_role() in ('ADMIN','HR','MANAGER')))
);

create or replace function public.award_point_event(
  p_organization_id uuid,
  p_employee_id uuid,
  p_event_type text,
  p_points integer,
  p_source_table text,
  p_source_id uuid,
  p_occurred_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_employee_id is null or p_points <= 0 then return; end if;
  if not exists (
    select 1 from public.profiles p where p.id = p_employee_id and p.organization_id = p_organization_id
  ) then raise exception 'point recipient must belong to the source organization'; end if;
  insert into public.point_events(
    organization_id, employee_id, event_type, points, source_table, source_id, occurred_at
  ) values (
    p_organization_id, p_employee_id, p_event_type, p_points, p_source_table, p_source_id, coalesce(p_occurred_at, now())
  ) on conflict (employee_id, event_type, source_table, source_id) do nothing;
end;
$$;

create or replace function public.award_visit_points()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'COMPLETED' and new.location_status = 'VERIFIED'
    and nullif(trim(new.outcome), '') is not null
    and (tg_op = 'INSERT' or old.status <> 'COMPLETED') then
    perform public.award_point_event(new.organization_id, new.employee_id, 'PRODUCTIVE_VISIT', 10, 'field_visits', new.id, new.completed_at);
  end if;
  return new;
end;
$$;

create or replace function public.award_lead_points()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.award_point_event(new.organization_id, new.owner_id, 'LEAD_CREATED', 2, 'crm_leads', new.id, new.created);
  return new;
end;
$$;

create or replace function public.award_deal_points()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.stage = 'WON' and (tg_op = 'INSERT' or old.stage <> 'WON') then
    perform public.award_point_event(new.organization_id, new.owner_id, 'DEAL_WON', 25, 'crm_deals', new.id, new.won_at);
  end if;
  return new;
end;
$$;

create or replace function public.award_collection_points()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'RECONCILED' and (tg_op = 'INSERT' or old.status <> 'RECONCILED') then
    perform public.award_point_event(new.organization_id, new.employee_id, 'COLLECTION_RECONCILED', 15, 'field_collections', new.id, new.reconciled_at);
  end if;
  return new;
end;
$$;

create or replace function public.award_dealer_points()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.approval_status = 'APPROVED' and new.registered_by is not null
    and (tg_op = 'INSERT' or old.approval_status <> 'APPROVED') then
    perform public.award_point_event(new.organization_id, new.registered_by, 'DEALER_ACTIVATED', 20, 'customers', new.id, coalesce(new.verified_at, new.created));
  end if;
  return new;
end;
$$;

create trigger point_event_visit after insert or update of status on public.field_visits
  for each row execute function public.award_visit_points();
create trigger point_event_lead after insert on public.crm_leads
  for each row execute function public.award_lead_points();
create trigger point_event_deal after insert or update of stage on public.crm_deals
  for each row execute function public.award_deal_points();
create trigger point_event_collection after insert or update of status on public.field_collections
  for each row execute function public.award_collection_points();
create trigger point_event_dealer after insert or update of approval_status on public.customers
  for each row execute function public.award_dealer_points();

-- Backfill eligible historical events. The unique key makes this safe to rerun.
select public.award_point_event(v.organization_id, v.employee_id, 'PRODUCTIVE_VISIT', 10, 'field_visits', v.id, v.completed_at)
from public.field_visits v where v.status = 'COMPLETED' and v.location_status = 'VERIFIED' and nullif(trim(v.outcome), '') is not null;
select public.award_point_event(l.organization_id, l.owner_id, 'LEAD_CREATED', 2, 'crm_leads', l.id, l.created)
from public.crm_leads l;
select public.award_point_event(d.organization_id, d.owner_id, 'DEAL_WON', 25, 'crm_deals', d.id, d.won_at)
from public.crm_deals d where d.stage = 'WON';
select public.award_point_event(c.organization_id, c.employee_id, 'COLLECTION_RECONCILED', 15, 'field_collections', c.id, c.reconciled_at)
from public.field_collections c where c.status = 'RECONCILED';
select public.award_point_event(c.organization_id, c.registered_by, 'DEALER_ACTIVATED', 20, 'customers', c.id, coalesce(c.verified_at, c.created))
from public.customers c where c.approval_status = 'APPROVED' and c.registered_by is not null;

create or replace function public.get_my_points_summary()
returns table (current_month_points bigint, personal_best_points bigint, personal_best_month date, current_month_events bigint)
language sql stable security definer set search_path = public as $$
  with monthly as (
    select date_trunc('month', e.occurred_at)::date as month_start, sum(e.points)::bigint points, count(*)::bigint events
    from public.point_events e
    where e.organization_id = public.auth_org_id() and e.employee_id = auth.uid()
    group by 1
  ), best as (
    select m.month_start, m.points from monthly m order by m.points desc, m.month_start desc limit 1
  )
  select coalesce((select m.points from monthly m where m.month_start = date_trunc('month', now())::date), 0),
    coalesce((select b.points from best b), 0), (select b.month_start from best b),
    coalesce((select m.events from monthly m where m.month_start = date_trunc('month', now())::date), 0);
$$;

create or replace function public.get_points_leaderboard(
  p_period_start date default date_trunc('month', now())::date,
  p_period_end date default (date_trunc('month', now()) + interval '1 month - 1 day')::date,
  p_limit integer default 20
)
returns table (rank bigint, employee_id uuid, employee_name text, points bigint, event_count bigint)
language sql stable security definer set search_path = public as $$
  with totals as (
    select e.employee_id, coalesce(p.name, p.employee_id, 'Unnamed employee') employee_name,
      sum(e.points)::bigint points, count(*)::bigint event_count
    from public.point_events e join public.profiles p on p.id = e.employee_id
    where e.organization_id = public.auth_org_id() and e.occurred_at::date between p_period_start and p_period_end
    group by e.employee_id, p.name, p.employee_id
  )
  select rank() over (order by t.points desc, t.event_count desc), t.employee_id, t.employee_name, t.points, t.event_count
  from totals t order by t.points desc, t.event_count desc, t.employee_name limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;

revoke all on function public.award_point_event(uuid, uuid, text, integer, text, uuid, timestamptz) from public;
revoke all on function public.get_my_points_summary() from public;
revoke all on function public.get_points_leaderboard(date, date, integer) from public;
grant execute on function public.get_my_points_summary() to authenticated;
grant execute on function public.get_points_leaderboard(date, date, integer) to authenticated;
