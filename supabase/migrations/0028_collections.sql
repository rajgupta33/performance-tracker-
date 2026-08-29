-- Field-reported collections with location evidence and audited verification.

create table public.field_collections (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.profiles(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  client_event_id uuid not null,
  amount numeric not null check (amount > 0),
  currency text not null default 'INR' check (currency = 'INR'),
  payment_mode text not null check (payment_mode in ('BANK','UPI','CHEQUE','CASH')),
  reference text,
  notes text,
  submitted_at timestamptz not null default now(),
  captured_at timestamptz not null,
  location extensions.geography(point, 4326) not null,
  accuracy_m numeric not null check (accuracy_m >= 0),
  proof_path text,
  status text not null default 'SUBMITTED'
    check (status in ('SUBMITTED','VERIFIED','RECONCILED','REJECTED')),
  duplicate_suspected boolean not null default false,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  reconciled_at timestamptz,
  created timestamptz not null default now(),
  updated timestamptz not null default now(),
  unique (organization_id, client_event_id),
  check (payment_mode = 'CASH' or nullif(trim(reference), '') is not null),
  check (status <> 'REJECTED' or nullif(trim(review_note), '') is not null),
  check (proof_path is null or proof_path like organization_id::text || '/' || employee_id::text || '/' || id::text || '/%')
);

create index field_collections_employee_date on public.field_collections(organization_id, employee_id, submitted_at desc);
create index field_collections_customer_date on public.field_collections(organization_id, customer_id, submitted_at desc);
create index field_collections_review_queue on public.field_collections(organization_id, status, submitted_at);
create index field_collections_location on public.field_collections using gist(location);

create table public.collection_activities (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  collection_id uuid not null references public.field_collections(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  event_type text not null check (event_type in ('SUBMITTED','VERIFIED','RECONCILED','REJECTED')),
  metadata jsonb not null default '{}',
  created timestamptz not null default now()
);
create index collection_activities_timeline on public.collection_activities(collection_id, created desc);

alter table public.field_collections enable row level security;
alter table public.collection_activities enable row level security;

create policy "field_collections_select" on public.field_collections for select using (
  public.is_super_admin()
  or (organization_id = public.auth_org_id() and (employee_id = auth.uid() or public.auth_role() in ('ADMIN','HR','MANAGER')))
);
create policy "collection_activities_select" on public.collection_activities for select using (
  public.is_super_admin()
  or (
    organization_id = public.auth_org_id()
    and exists (
      select 1 from public.field_collections c
      where c.id = collection_activities.collection_id
        and (c.employee_id = auth.uid() or public.auth_role() in ('ADMIN','HR','MANAGER'))
    )
  )
);

create or replace function public.submit_field_collection(
  p_collection_id uuid,
  p_client_event_id uuid,
  p_customer_id uuid,
  p_amount numeric,
  p_payment_mode text,
  p_reference text,
  p_notes text,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy_m numeric,
  p_captured_at timestamptz,
  p_proof_path text default null
)
returns public.field_collections
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := public.auth_org_id();
  v_collection public.field_collections;
  v_duplicate boolean;
begin
  if auth.uid() is null or v_org_id is null then raise exception 'authenticated organization member required'; end if;
  if p_collection_id is null or p_client_event_id is null then raise exception 'collection id and idempotency key are required'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'collection amount must be positive'; end if;
  if p_payment_mode not in ('BANK','UPI','CHEQUE','CASH') then raise exception 'invalid payment mode'; end if;
  if p_payment_mode <> 'CASH' and nullif(trim(p_reference), '') is null then raise exception 'payment reference is required'; end if;
  if p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then raise exception 'invalid collection coordinates'; end if;
  if p_accuracy_m is null or p_accuracy_m < 0 then raise exception 'location accuracy is required'; end if;
  if not exists (
    select 1 from public.customers c where c.id = p_customer_id and c.organization_id = v_org_id
      and c.active and c.approval_status = 'APPROVED'
  ) then raise exception 'active customer not found'; end if;
  if p_proof_path is not null and p_proof_path not like v_org_id::text || '/' || auth.uid()::text || '/' || p_collection_id::text || '/%' then
    raise exception 'invalid collection proof path';
  end if;

  select exists (
    select 1 from public.field_collections c
    where c.organization_id = v_org_id and c.customer_id = p_customer_id
      and c.amount = p_amount and c.submitted_at::date = now()::date
      and (nullif(lower(trim(c.reference)), '') is not distinct from nullif(lower(trim(p_reference)), ''))
      and c.status <> 'REJECTED'
  ) into v_duplicate;

  insert into public.field_collections(
    id, organization_id, employee_id, customer_id, client_event_id, amount,
    payment_mode, reference, notes, captured_at, location, accuracy_m,
    proof_path, duplicate_suspected
  ) values (
    p_collection_id, v_org_id, auth.uid(), p_customer_id, p_client_event_id, p_amount,
    p_payment_mode, nullif(trim(p_reference), ''), nullif(trim(p_notes), ''), p_captured_at,
    extensions.st_point(p_longitude, p_latitude)::extensions.geography, p_accuracy_m,
    p_proof_path, v_duplicate
  )
  on conflict (organization_id, client_event_id) do update set client_event_id = excluded.client_event_id
  returning * into v_collection;

  if v_collection.id <> p_collection_id or v_collection.employee_id <> auth.uid() then
    raise exception 'idempotency key belongs to another collection';
  end if;
  if not exists (select 1 from public.collection_activities a where a.collection_id = v_collection.id and a.event_type = 'SUBMITTED') then
    insert into public.collection_activities(organization_id, collection_id, actor_id, event_type, metadata)
    values (v_org_id, v_collection.id, auth.uid(), 'SUBMITTED', jsonb_build_object('amount', v_collection.amount, 'mode', v_collection.payment_mode));
  end if;
  return v_collection;
end;
$$;

create or replace function public.review_field_collection(
  p_collection_id uuid,
  p_status text,
  p_review_note text default null
)
returns public.field_collections
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := public.auth_org_id();
  v_collection public.field_collections;
begin
  if not (public.is_super_admin() or public.auth_role() in ('ADMIN','HR','MANAGER')) then
    raise exception 'manager access required';
  end if;
  select * into v_collection from public.field_collections
  where id = p_collection_id and organization_id = v_org_id for update;
  if not found then raise exception 'collection not found'; end if;
  if p_status not in ('VERIFIED','RECONCILED','REJECTED') then raise exception 'invalid collection status'; end if;
  if p_status = 'VERIFIED' and v_collection.status <> 'SUBMITTED' then raise exception 'only submitted collections can be verified'; end if;
  if p_status = 'RECONCILED' and v_collection.status <> 'VERIFIED' then raise exception 'only verified collections can be reconciled'; end if;
  if p_status = 'REJECTED' and v_collection.status not in ('SUBMITTED','VERIFIED') then raise exception 'collection cannot be rejected from its current status'; end if;
  if p_status = 'REJECTED' and nullif(trim(p_review_note), '') is null then raise exception 'rejection reason is required'; end if;

  update public.field_collections set status = p_status, reviewed_by = auth.uid(), reviewed_at = now(),
    review_note = nullif(trim(p_review_note), ''),
    reconciled_at = case when p_status = 'RECONCILED' then now() else reconciled_at end,
    updated = now()
  where id = p_collection_id returning * into v_collection;
  insert into public.collection_activities(organization_id, collection_id, actor_id, event_type, metadata)
  values (v_org_id, v_collection.id, auth.uid(), p_status, jsonb_build_object('note', nullif(trim(p_review_note), '')));
  return v_collection;
end;
$$;

revoke all on function public.submit_field_collection(uuid, uuid, uuid, numeric, text, text, text, double precision, double precision, numeric, timestamptz, text) from public;
revoke all on function public.review_field_collection(uuid, text, text) from public;
grant execute on function public.submit_field_collection(uuid, uuid, uuid, numeric, text, text, text, double precision, double precision, numeric, timestamptz, text) to authenticated;
grant execute on function public.review_field_collection(uuid, text, text) to authenticated;
