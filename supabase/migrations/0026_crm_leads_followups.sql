-- Vardhnam CRM foundation: lead pipeline, follow-ups and auditable activities.

create table public.crm_leads (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete restrict,
  customer_id uuid references public.customers(id) on delete restrict,
  client_event_id uuid not null,
  prospect_name text,
  contact_name text,
  mobile text,
  source text not null default 'FIELD'
    check (source in ('FIELD','VISIT','REFERRAL','INBOUND','OTHER')),
  stage text not null default 'NEW'
    check (stage in ('NEW','CONTACTED','INTERESTED','NEGOTIATION','WON','LOST')),
  estimated_value numeric check (estimated_value is null or estimated_value >= 0),
  products text[] not null default '{}',
  next_follow_up_at timestamptz,
  loss_reason text,
  won_at timestamptz,
  lost_at timestamptz,
  created timestamptz not null default now(),
  updated timestamptz not null default now(),
  unique (organization_id, client_event_id),
  check (customer_id is not null or nullif(trim(prospect_name), '') is not null),
  check (stage <> 'LOST' or nullif(trim(loss_reason), '') is not null)
);

create index idx_crm_leads_owner_stage on public.crm_leads(organization_id, owner_id, stage);
create index idx_crm_leads_follow_up on public.crm_leads(organization_id, next_follow_up_at)
  where stage not in ('WON','LOST');
create index idx_crm_leads_customer on public.crm_leads(organization_id, customer_id);

create table public.crm_follow_ups (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.crm_leads(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete restrict,
  follow_up_type text not null default 'CALL'
    check (follow_up_type in ('CALL','VISIT','EMAIL','MESSAGE','OTHER')),
  note text,
  due_at timestamptz not null,
  status text not null default 'OPEN'
    check (status in ('OPEN','DONE','CANCELLED')),
  completed_at timestamptz,
  completion_note text,
  created timestamptz not null default now(),
  updated timestamptz not null default now(),
  check ((status = 'DONE' and completed_at is not null) or status <> 'DONE')
);

create index idx_crm_followups_owner_due on public.crm_follow_ups(organization_id, owner_id, status, due_at);
create index idx_crm_followups_lead on public.crm_follow_ups(lead_id, created desc);

create table public.crm_activities (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.crm_leads(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  event_type text not null
    check (event_type in ('LEAD_CREATED','STAGE_CHANGED','FOLLOW_UP_CREATED','FOLLOW_UP_COMPLETED','NOTE_ADDED')),
  metadata jsonb not null default '{}',
  created timestamptz not null default now()
);

create index idx_crm_activities_lead_created on public.crm_activities(lead_id, created desc);
create index idx_crm_activities_org_created on public.crm_activities(organization_id, created desc);

create or replace function public.validate_crm_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = new.owner_id and p.organization_id = new.organization_id
  ) then
    raise exception 'CRM owner must belong to the row organization';
  end if;
  return new;
end;
$$;

create or replace function public.validate_crm_lead_customer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.customer_id is not null and not exists (
    select 1 from public.customers c
    where c.id = new.customer_id and c.organization_id = new.organization_id
  ) then
    raise exception 'CRM customer must belong to the row organization';
  end if;
  return new;
end;
$$;

create or replace function public.validate_crm_followup_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.crm_leads l
    where l.id = new.lead_id and l.organization_id = new.organization_id
  ) then
    raise exception 'follow-up lead must belong to the row organization';
  end if;
  return new;
end;
$$;

create trigger crm_leads_validate_links
  before insert or update of organization_id, owner_id on public.crm_leads
  for each row execute function public.validate_crm_owner();
create trigger crm_leads_validate_customer
  before insert or update of organization_id, customer_id on public.crm_leads
  for each row execute function public.validate_crm_lead_customer();
create trigger crm_followups_validate_links
  before insert or update of organization_id, owner_id on public.crm_follow_ups
  for each row execute function public.validate_crm_owner();
create trigger crm_followups_validate_lead
  before insert or update of organization_id, lead_id on public.crm_follow_ups
  for each row execute function public.validate_crm_followup_lead();

alter table public.crm_leads enable row level security;
alter table public.crm_follow_ups enable row level security;
alter table public.crm_activities enable row level security;

create policy "crm_leads_select" on public.crm_leads for select using (
  public.is_super_admin()
  or (organization_id = public.auth_org_id() and (owner_id = auth.uid() or public.auth_role() in ('ADMIN','HR','MANAGER')))
);
create policy "crm_leads_insert_own" on public.crm_leads for insert with check (
  organization_id = public.auth_org_id() and owner_id = auth.uid()
);
create policy "crm_leads_manage" on public.crm_leads for update using (
  public.is_super_admin()
  or (organization_id = public.auth_org_id() and public.auth_role() in ('ADMIN','HR','MANAGER'))
) with check (
  public.is_super_admin()
  or (organization_id = public.auth_org_id() and public.auth_role() in ('ADMIN','HR','MANAGER'))
);
create policy "crm_leads_delete" on public.crm_leads for delete using (
  public.is_super_admin()
  or (organization_id = public.auth_org_id() and public.auth_role() in ('ADMIN','HR'))
);

create policy "crm_followups_select" on public.crm_follow_ups for select using (
  public.is_super_admin()
  or (organization_id = public.auth_org_id() and (owner_id = auth.uid() or public.auth_role() in ('ADMIN','HR','MANAGER')))
);
create policy "crm_followups_manage_privileged" on public.crm_follow_ups for all using (
  public.is_super_admin()
  or (organization_id = public.auth_org_id() and public.auth_role() in ('ADMIN','HR','MANAGER'))
) with check (
  public.is_super_admin()
  or (organization_id = public.auth_org_id() and public.auth_role() in ('ADMIN','HR','MANAGER'))
);

create policy "crm_activities_select" on public.crm_activities for select using (
  public.is_super_admin()
  or (
    organization_id = public.auth_org_id()
    and (
      public.auth_role() in ('ADMIN','HR','MANAGER')
      or exists (select 1 from public.crm_leads l where l.id = crm_activities.lead_id and l.owner_id = auth.uid())
    )
  )
);

create or replace function public.create_crm_lead(
  p_lead_id uuid,
  p_client_event_id uuid,
  p_customer_id uuid default null,
  p_prospect_name text default null,
  p_contact_name text default null,
  p_mobile text default null,
  p_source text default 'FIELD',
  p_estimated_value numeric default null,
  p_products text[] default '{}',
  p_follow_up_at timestamptz default null,
  p_follow_up_type text default 'CALL',
  p_follow_up_note text default null
)
returns public.crm_leads
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := public.auth_org_id();
  v_lead public.crm_leads;
begin
  if auth.uid() is null or v_org_id is null then
    raise exception 'authenticated organization member required';
  end if;
  if p_lead_id is null or p_client_event_id is null then
    raise exception 'lead id and idempotency key are required';
  end if;
  if p_customer_id is null and nullif(trim(p_prospect_name), '') is null then
    raise exception 'customer or prospect name is required';
  end if;
  if p_customer_id is not null and not exists (
    select 1 from public.customers c
    where c.id = p_customer_id and c.organization_id = v_org_id and c.active and c.approval_status = 'APPROVED'
  ) then
    raise exception 'active customer not found';
  end if;

  insert into public.crm_leads (
    id, organization_id, owner_id, customer_id, client_event_id,
    prospect_name, contact_name, mobile, source, estimated_value,
    products, next_follow_up_at
  ) values (
    p_lead_id, v_org_id, auth.uid(), p_customer_id, p_client_event_id,
    nullif(trim(p_prospect_name), ''), nullif(trim(p_contact_name), ''), nullif(trim(p_mobile), ''),
    p_source, p_estimated_value, coalesce(p_products, '{}'), p_follow_up_at
  )
  on conflict (organization_id, client_event_id) do update
    set client_event_id = excluded.client_event_id
  returning * into v_lead;

  if v_lead.owner_id <> auth.uid() or v_lead.id <> p_lead_id then
    raise exception 'idempotency key belongs to another lead';
  end if;

  if not exists (select 1 from public.crm_activities a where a.lead_id = v_lead.id and a.event_type = 'LEAD_CREATED') then
    insert into public.crm_activities(organization_id, lead_id, actor_id, event_type)
    values (v_org_id, v_lead.id, auth.uid(), 'LEAD_CREATED');
  end if;

  if p_follow_up_at is not null and not exists (
    select 1 from public.crm_follow_ups f where f.lead_id = v_lead.id and f.due_at = p_follow_up_at and f.status = 'OPEN'
  ) then
    insert into public.crm_follow_ups(organization_id, lead_id, owner_id, follow_up_type, note, due_at)
    values (v_org_id, v_lead.id, auth.uid(), p_follow_up_type, nullif(trim(p_follow_up_note), ''), p_follow_up_at);
    insert into public.crm_activities(organization_id, lead_id, actor_id, event_type, metadata)
    values (v_org_id, v_lead.id, auth.uid(), 'FOLLOW_UP_CREATED', jsonb_build_object('due_at', p_follow_up_at, 'type', p_follow_up_type));
  end if;

  return v_lead;
end;
$$;

create or replace function public.move_crm_lead_stage(
  p_lead_id uuid,
  p_stage text,
  p_loss_reason text default null
)
returns public.crm_leads
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := public.auth_org_id();
  v_lead public.crm_leads;
  v_old_stage text;
  v_privileged boolean := public.auth_role() in ('ADMIN','HR','MANAGER');
begin
  select * into v_lead from public.crm_leads
  where id = p_lead_id and organization_id = v_org_id for update;
  if not found then raise exception 'lead not found'; end if;
  if v_lead.owner_id <> auth.uid() and not v_privileged then raise exception 'lead does not belong to current user'; end if;
  if p_stage not in ('NEW','CONTACTED','INTERESTED','NEGOTIATION','WON','LOST') then raise exception 'invalid lead stage'; end if;
  if p_stage = 'LOST' and nullif(trim(p_loss_reason), '') is null then raise exception 'loss reason is required'; end if;
  if not v_privileged and p_stage <> v_lead.stage and not (
    (v_lead.stage = 'NEW' and p_stage = 'CONTACTED')
    or (v_lead.stage = 'CONTACTED' and p_stage in ('INTERESTED','LOST'))
    or (v_lead.stage = 'INTERESTED' and p_stage in ('NEGOTIATION','LOST'))
    or (v_lead.stage = 'NEGOTIATION' and p_stage in ('WON','LOST'))
  ) then
    raise exception 'invalid stage transition';
  end if;

  v_old_stage := v_lead.stage;
  update public.crm_leads set
    stage = p_stage,
    loss_reason = case when p_stage = 'LOST' then trim(p_loss_reason) else null end,
    won_at = case when p_stage = 'WON' then now() when v_old_stage = 'WON' then null else won_at end,
    lost_at = case when p_stage = 'LOST' then now() when v_old_stage = 'LOST' then null else lost_at end,
    updated = now()
  where id = p_lead_id returning * into v_lead;

  if v_old_stage <> p_stage then
    insert into public.crm_activities(organization_id, lead_id, actor_id, event_type, metadata)
    values (v_org_id, p_lead_id, auth.uid(), 'STAGE_CHANGED', jsonb_build_object('from', v_old_stage, 'to', p_stage));
  end if;
  return v_lead;
end;
$$;

create or replace function public.create_crm_follow_up(
  p_lead_id uuid,
  p_due_at timestamptz,
  p_follow_up_type text default 'CALL',
  p_note text default null
)
returns public.crm_follow_ups
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := public.auth_org_id();
  v_lead public.crm_leads;
  v_follow_up public.crm_follow_ups;
  v_privileged boolean := coalesce(public.auth_role() in ('ADMIN','HR','MANAGER'), false);
begin
  if auth.uid() is null or v_org_id is null then
    raise exception 'authenticated organization member required';
  end if;
  if p_due_at is null then raise exception 'follow-up date is required'; end if;

  select * into v_lead from public.crm_leads
  where id = p_lead_id and organization_id = v_org_id for update;
  if not found then raise exception 'lead not found'; end if;
  if v_lead.owner_id <> auth.uid() and not v_privileged then
    raise exception 'lead does not belong to current user';
  end if;
  if v_lead.stage in ('WON','LOST') then
    raise exception 'terminal leads cannot receive a new follow-up';
  end if;

  insert into public.crm_follow_ups(
    organization_id, lead_id, owner_id, follow_up_type, note, due_at
  ) values (
    v_org_id, v_lead.id, v_lead.owner_id, p_follow_up_type,
    nullif(trim(p_note), ''), p_due_at
  ) returning * into v_follow_up;

  update public.crm_leads
  set next_follow_up_at = (
    select min(f.due_at) from public.crm_follow_ups f
    where f.lead_id = v_lead.id and f.status = 'OPEN'
  ), updated = now()
  where id = v_lead.id;

  insert into public.crm_activities(organization_id, lead_id, actor_id, event_type, metadata)
  values (
    v_org_id, v_lead.id, auth.uid(), 'FOLLOW_UP_CREATED',
    jsonb_build_object('follow_up_id', v_follow_up.id, 'due_at', p_due_at, 'type', p_follow_up_type)
  );
  return v_follow_up;
end;
$$;

create or replace function public.complete_crm_follow_up(
  p_follow_up_id uuid,
  p_completion_note text,
  p_next_due_at timestamptz default null,
  p_next_follow_up_type text default 'CALL',
  p_next_note text default null
)
returns public.crm_follow_ups
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := public.auth_org_id();
  v_follow_up public.crm_follow_ups;
  v_lead public.crm_leads;
  v_next public.crm_follow_ups;
  v_privileged boolean := coalesce(public.auth_role() in ('ADMIN','HR','MANAGER'), false);
begin
  if auth.uid() is null or v_org_id is null then
    raise exception 'authenticated organization member required';
  end if;

  select * into v_follow_up from public.crm_follow_ups
  where id = p_follow_up_id and organization_id = v_org_id for update;
  if not found then raise exception 'follow-up not found'; end if;
  if v_follow_up.owner_id <> auth.uid() and not v_privileged then
    raise exception 'follow-up does not belong to current user';
  end if;
  if v_follow_up.status = 'DONE' then return v_follow_up; end if;
  if v_follow_up.status <> 'OPEN' then raise exception 'only open follow-ups can be completed'; end if;
  if nullif(trim(p_completion_note), '') is null then raise exception 'completion note is required'; end if;

  select * into v_lead from public.crm_leads
  where id = v_follow_up.lead_id and organization_id = v_org_id for update;
  if not found then raise exception 'lead not found'; end if;
  if v_lead.stage not in ('WON','LOST') and p_next_due_at is null then
    raise exception 'next follow-up date is required for an active lead';
  end if;

  update public.crm_follow_ups set
    status = 'DONE', completed_at = now(), completion_note = trim(p_completion_note), updated = now()
  where id = v_follow_up.id returning * into v_follow_up;

  insert into public.crm_activities(organization_id, lead_id, actor_id, event_type, metadata)
  values (
    v_org_id, v_lead.id, auth.uid(), 'FOLLOW_UP_COMPLETED',
    jsonb_build_object('follow_up_id', v_follow_up.id, 'completion_note', trim(p_completion_note))
  );

  if v_lead.stage not in ('WON','LOST') then
    insert into public.crm_follow_ups(
      organization_id, lead_id, owner_id, follow_up_type, note, due_at
    ) values (
      v_org_id, v_lead.id, v_lead.owner_id, p_next_follow_up_type,
      nullif(trim(p_next_note), ''), p_next_due_at
    ) returning * into v_next;
    insert into public.crm_activities(organization_id, lead_id, actor_id, event_type, metadata)
    values (
      v_org_id, v_lead.id, auth.uid(), 'FOLLOW_UP_CREATED',
      jsonb_build_object('follow_up_id', v_next.id, 'due_at', p_next_due_at, 'type', p_next_follow_up_type)
    );
  end if;

  update public.crm_leads
  set next_follow_up_at = (
    select min(f.due_at) from public.crm_follow_ups f
    where f.lead_id = v_lead.id and f.status = 'OPEN'
  ), updated = now()
  where id = v_lead.id;

  return v_follow_up;
end;
$$;

revoke all on function public.create_crm_lead(uuid, uuid, uuid, text, text, text, text, numeric, text[], timestamptz, text, text) from public;
revoke all on function public.move_crm_lead_stage(uuid, text, text) from public;
revoke all on function public.create_crm_follow_up(uuid, timestamptz, text, text) from public;
revoke all on function public.complete_crm_follow_up(uuid, text, timestamptz, text, text) from public;
grant execute on function public.create_crm_lead(uuid, uuid, uuid, text, text, text, text, numeric, text[], timestamptz, text, text) to authenticated;
grant execute on function public.move_crm_lead_stage(uuid, text, text) to authenticated;
grant execute on function public.create_crm_follow_up(uuid, timestamptz, text, text) to authenticated;
grant execute on function public.complete_crm_follow_up(uuid, text, timestamptz, text, text) to authenticated;
