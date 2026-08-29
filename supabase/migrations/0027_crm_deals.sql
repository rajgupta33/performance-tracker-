-- Audited CRM deal pipeline. V1 permits one non-terminal deal per lead.

create table public.crm_deals (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.crm_leads(id) on delete restrict,
  owner_id uuid not null references public.profiles(id) on delete restrict,
  client_event_id uuid not null,
  title text not null check (nullif(trim(title), '') is not null),
  amount numeric not null check (amount > 0),
  stage text not null default 'OPEN'
    check (stage in ('OPEN','PROPOSAL','NEGOTIATION','WON','LOST')),
  expected_close_date date,
  won_reason text,
  loss_reason text,
  won_at timestamptz,
  lost_at timestamptz,
  created timestamptz not null default now(),
  updated timestamptz not null default now(),
  unique (organization_id, client_event_id),
  check (stage <> 'WON' or nullif(trim(won_reason), '') is not null),
  check (stage <> 'LOST' or nullif(trim(loss_reason), '') is not null)
);

create unique index crm_deals_one_active_per_lead
  on public.crm_deals(lead_id) where stage not in ('WON','LOST');
create index crm_deals_owner_stage on public.crm_deals(organization_id, owner_id, stage);
create index crm_deals_close_date on public.crm_deals(organization_id, expected_close_date)
  where stage not in ('WON','LOST');

create table public.crm_deal_activities (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  deal_id uuid not null references public.crm_deals(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  event_type text not null check (event_type in ('DEAL_CREATED','STAGE_CHANGED','VALUE_CHANGED')),
  metadata jsonb not null default '{}',
  created timestamptz not null default now()
);

create index crm_deal_activities_timeline on public.crm_deal_activities(deal_id, created desc);

alter table public.crm_deals enable row level security;
alter table public.crm_deal_activities enable row level security;

create policy "crm_deals_select" on public.crm_deals for select using (
  public.is_super_admin()
  or (organization_id = public.auth_org_id() and (owner_id = auth.uid() or public.auth_role() in ('ADMIN','HR','MANAGER')))
);
create policy "crm_deal_activities_select" on public.crm_deal_activities for select using (
  public.is_super_admin()
  or (
    organization_id = public.auth_org_id()
    and exists (
      select 1 from public.crm_deals d
      where d.id = crm_deal_activities.deal_id
        and (d.owner_id = auth.uid() or public.auth_role() in ('ADMIN','HR','MANAGER'))
    )
  )
);

create or replace function public.create_crm_deal(
  p_deal_id uuid,
  p_client_event_id uuid,
  p_lead_id uuid,
  p_title text,
  p_amount numeric,
  p_expected_close_date date default null
)
returns public.crm_deals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := public.auth_org_id();
  v_lead public.crm_leads;
  v_deal public.crm_deals;
  v_privileged boolean := coalesce(public.auth_role() in ('ADMIN','HR','MANAGER'), false);
begin
  if auth.uid() is null or v_org_id is null then raise exception 'authenticated organization member required'; end if;
  if p_deal_id is null or p_client_event_id is null then raise exception 'deal id and idempotency key are required'; end if;
  if nullif(trim(p_title), '') is null then raise exception 'deal title is required'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'deal amount must be positive'; end if;

  select * into v_lead from public.crm_leads
  where id = p_lead_id and organization_id = v_org_id for update;
  if not found then raise exception 'lead not found'; end if;
  if v_lead.owner_id <> auth.uid() and not v_privileged then raise exception 'lead does not belong to current user'; end if;
  if v_lead.stage not in ('INTERESTED','NEGOTIATION','WON') then
    raise exception 'deal requires an interested, negotiating, or won lead';
  end if;

  insert into public.crm_deals(
    id, organization_id, lead_id, owner_id, client_event_id, title, amount, expected_close_date
  ) values (
    p_deal_id, v_org_id, v_lead.id, v_lead.owner_id, p_client_event_id,
    trim(p_title), p_amount, p_expected_close_date
  )
  on conflict (organization_id, client_event_id) do update
    set client_event_id = excluded.client_event_id
  returning * into v_deal;

  if v_deal.id <> p_deal_id or v_deal.owner_id <> v_lead.owner_id then
    raise exception 'idempotency key belongs to another deal';
  end if;
  if not exists (select 1 from public.crm_deal_activities a where a.deal_id = v_deal.id and a.event_type = 'DEAL_CREATED') then
    insert into public.crm_deal_activities(organization_id, deal_id, actor_id, event_type, metadata)
    values (v_org_id, v_deal.id, auth.uid(), 'DEAL_CREATED', jsonb_build_object('amount', v_deal.amount));
  end if;
  return v_deal;
end;
$$;

create or replace function public.move_crm_deal_stage(
  p_deal_id uuid,
  p_stage text,
  p_reason text default null
)
returns public.crm_deals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := public.auth_org_id();
  v_deal public.crm_deals;
  v_old_stage text;
  v_privileged boolean := coalesce(public.auth_role() in ('ADMIN','HR','MANAGER'), false);
begin
  select * into v_deal from public.crm_deals
  where id = p_deal_id and organization_id = v_org_id for update;
  if not found then raise exception 'deal not found'; end if;
  if v_deal.owner_id <> auth.uid() and not v_privileged then raise exception 'deal does not belong to current user'; end if;
  if p_stage not in ('OPEN','PROPOSAL','NEGOTIATION','WON','LOST') then raise exception 'invalid deal stage'; end if;
  if p_stage in ('WON','LOST') and nullif(trim(p_reason), '') is null then raise exception 'terminal reason is required'; end if;
  if v_deal.stage in ('WON','LOST') and not v_privileged and p_stage <> v_deal.stage then raise exception 'terminal deals can only be reopened by a manager'; end if;
  if not v_privileged and p_stage <> v_deal.stage and not (
    (v_deal.stage = 'OPEN' and p_stage in ('PROPOSAL','LOST'))
    or (v_deal.stage = 'PROPOSAL' and p_stage in ('NEGOTIATION','LOST'))
    or (v_deal.stage = 'NEGOTIATION' and p_stage in ('WON','LOST'))
  ) then raise exception 'invalid deal stage transition'; end if;

  v_old_stage := v_deal.stage;
  update public.crm_deals set
    stage = p_stage,
    won_reason = case when p_stage = 'WON' then trim(p_reason) else null end,
    loss_reason = case when p_stage = 'LOST' then trim(p_reason) else null end,
    won_at = case when p_stage = 'WON' then now() else null end,
    lost_at = case when p_stage = 'LOST' then now() else null end,
    updated = now()
  where id = p_deal_id returning * into v_deal;

  if v_old_stage <> p_stage then
    insert into public.crm_deal_activities(organization_id, deal_id, actor_id, event_type, metadata)
    values (v_org_id, v_deal.id, auth.uid(), 'STAGE_CHANGED',
      jsonb_build_object('from', v_old_stage, 'to', p_stage, 'reason', nullif(trim(p_reason), '')));
    if p_stage = 'WON' then
      insert into public.crm_activities(organization_id, lead_id, actor_id, event_type, metadata)
      select v_org_id, l.id, auth.uid(), 'STAGE_CHANGED',
        jsonb_build_object('from', l.stage, 'to', 'WON', 'source_deal_id', v_deal.id)
      from public.crm_leads l
      where l.id = v_deal.lead_id and l.stage <> 'WON';
      update public.crm_leads set stage = 'WON', won_at = coalesce(won_at, now()), lost_at = null,
        loss_reason = null, updated = now() where id = v_deal.lead_id;
    end if;
  end if;
  return v_deal;
end;
$$;

revoke all on function public.create_crm_deal(uuid, uuid, uuid, text, numeric, date) from public;
revoke all on function public.move_crm_deal_stage(uuid, text, text) from public;
grant execute on function public.create_crm_deal(uuid, uuid, uuid, text, numeric, date) to authenticated;
grant execute on function public.move_crm_deal_stage(uuid, text, text) to authenticated;
