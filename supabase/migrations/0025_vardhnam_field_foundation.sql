-- Vardhnam field foundation: territories, customers, visits and private evidence.
-- Apply only after the OpenHRApp baseline migrations through 0024.

create extension if not exists postgis with schema extensions;

create table public.territories (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  code text,
  manager_id uuid references public.profiles(id) on delete set null,
  boundary extensions.geography(multipolygon, 4326),
  active boolean not null default true,
  created timestamptz not null default now(),
  updated timestamptz not null default now(),
  unique (organization_id, name),
  unique (organization_id, code)
);

create index idx_territories_org on public.territories(organization_id);
create index idx_territories_boundary on public.territories using gist(boundary);

alter table public.profiles
  add column territory_id uuid references public.territories(id) on delete set null;
create index idx_profiles_territory on public.profiles(organization_id, territory_id);

create table public.customers (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  territory_id uuid references public.territories(id) on delete set null,
  external_code text,
  customer_type text not null default 'DEALER'
    check (customer_type in ('DEALER','DISTRIBUTOR','FARMER','RETAILER','OTHER')),
  name text not null,
  contact_name text,
  mobile text,
  address text,
  location extensions.geography(point, 4326),
  location_accuracy_m numeric check (location_accuracy_m is null or location_accuracy_m >= 0),
  approval_status text not null default 'APPROVED'
    check (approval_status in ('PENDING','APPROVED','REJECTED')),
  registered_by uuid references public.profiles(id) on delete set null,
  verified_by uuid references public.profiles(id) on delete set null,
  verified_at timestamptz,
  active boolean not null default true,
  created timestamptz not null default now(),
  updated timestamptz not null default now(),
  unique (organization_id, external_code)
);

create index idx_customers_org_territory on public.customers(organization_id, territory_id);
create index idx_customers_name on public.customers using gin(name gin_trgm_ops);
create index idx_customers_location on public.customers using gist(location);

create table public.field_visits (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.profiles(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  client_event_id uuid not null,
  status text not null default 'IN_PROGRESS'
    check (status in ('IN_PROGRESS','COMPLETED','CANCELLED')),
  purpose text,
  outcome text,
  products text[] not null default '{}',
  potential_value numeric check (potential_value is null or potential_value >= 0),
  follow_up_on date,
  started_at timestamptz not null default now(),
  start_captured_at timestamptz not null,
  completed_at timestamptz,
  completed_captured_at timestamptz,
  start_location extensions.geography(point, 4326) not null,
  start_accuracy_m numeric not null check (start_accuracy_m >= 0),
  end_location extensions.geography(point, 4326),
  end_accuracy_m numeric check (end_accuracy_m is null or end_accuracy_m >= 0),
  start_distance_m numeric check (start_distance_m is null or start_distance_m >= 0),
  end_distance_m numeric check (end_distance_m is null or end_distance_m >= 0),
  location_status text not null default 'PENDING'
    check (location_status in ('PENDING','VERIFIED','REVIEW','OUTSIDE','UNAVAILABLE')),
  evidence_path text,
  notes text,
  created timestamptz not null default now(),
  updated timestamptz not null default now(),
  unique (organization_id, client_event_id),
  check ((status = 'COMPLETED' and completed_at is not null) or status <> 'COMPLETED'),
  check (
    evidence_path is null
    or evidence_path like organization_id::text || '/' || employee_id::text || '/' || id::text || '/%'
  )
);

create index idx_field_visits_employee_started on public.field_visits(organization_id, employee_id, started_at desc);
create index idx_field_visits_customer_started on public.field_visits(organization_id, customer_id, started_at desc);
create index idx_field_visits_status on public.field_visits(organization_id, status);
create index idx_field_visits_start_location on public.field_visits using gist(start_location);

-- UUID foreign keys alone do not prove tenant ownership. Enforce the
-- organization relationship before RLS evaluates the resulting row.
create or replace function public.validate_territory_tenant_link()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.territory_id is not null and not exists (
    select 1 from public.territories t
    where t.id = new.territory_id and t.organization_id = new.organization_id
  ) then
    raise exception 'territory must belong to the row organization';
  end if;

  return new;
end;
$$;

create or replace function public.validate_visit_tenant_links()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = new.employee_id and p.organization_id = new.organization_id
  ) then
    raise exception 'employee must belong to the visit organization';
  end if;
  if not exists (
    select 1 from public.customers c
    where c.id = new.customer_id and c.organization_id = new.organization_id
  ) then
    raise exception 'customer must belong to the visit organization';
  end if;

  return new;
end;
$$;

create trigger profiles_validate_territory
  before insert or update of organization_id, territory_id on public.profiles
  for each row execute function public.validate_territory_tenant_link();
create trigger customers_validate_territory
  before insert or update of organization_id, territory_id on public.customers
  for each row execute function public.validate_territory_tenant_link();
create trigger field_visits_validate_links
  before insert or update of organization_id, employee_id, customer_id on public.field_visits
  for each row execute function public.validate_visit_tenant_links();

alter table public.territories enable row level security;
alter table public.customers enable row level security;
alter table public.field_visits enable row level security;

create policy "territories_select" on public.territories for select using (
  public.is_super_admin() or organization_id = public.auth_org_id()
);
create policy "territories_admin_insert" on public.territories for insert with check (
  public.is_super_admin() or (organization_id = public.auth_org_id() and public.auth_role() in ('ADMIN','HR'))
);
create policy "territories_admin_update" on public.territories for update using (
  public.is_super_admin() or (organization_id = public.auth_org_id() and public.auth_role() in ('ADMIN','HR'))
) with check (
  public.is_super_admin() or (organization_id = public.auth_org_id() and public.auth_role() in ('ADMIN','HR'))
);
create policy "territories_admin_delete" on public.territories for delete using (
  public.is_super_admin() or (organization_id = public.auth_org_id() and public.auth_role() = 'ADMIN')
);

create policy "customers_select" on public.customers for select using (
  public.is_super_admin() or organization_id = public.auth_org_id()
);
create policy "customers_create" on public.customers for insert with check (
  public.is_super_admin()
  or (
    organization_id = public.auth_org_id()
    and registered_by = auth.uid()
    and (public.auth_role() in ('ADMIN','HR','MANAGER') or approval_status = 'PENDING')
  )
);
create policy "customers_manage" on public.customers for update using (
  public.is_super_admin()
  or (organization_id = public.auth_org_id() and public.auth_role() in ('ADMIN','HR','MANAGER'))
) with check (
  public.is_super_admin()
  or (organization_id = public.auth_org_id() and public.auth_role() in ('ADMIN','HR','MANAGER'))
);
create policy "customers_delete" on public.customers for delete using (
  public.is_super_admin()
  or (organization_id = public.auth_org_id() and public.auth_role() in ('ADMIN','HR'))
);

create policy "field_visits_select" on public.field_visits for select using (
  public.is_super_admin()
  or (
    organization_id = public.auth_org_id()
    and (employee_id = auth.uid() or public.auth_role() in ('ADMIN','HR','MANAGER'))
  )
);
create policy "field_visits_insert_own" on public.field_visits for insert with check (
  organization_id = public.auth_org_id() and employee_id = auth.uid()
);
create policy "field_visits_update_own" on public.field_visits for update using (
  organization_id = public.auth_org_id()
  and (employee_id = auth.uid() or public.auth_role() in ('ADMIN','HR','MANAGER'))
) with check (
  organization_id = public.auth_org_id()
  and (employee_id = auth.uid() or public.auth_role() in ('ADMIN','HR','MANAGER'))
);
create policy "field_visits_delete_admin" on public.field_visits for delete using (
  public.is_super_admin()
  or (organization_id = public.auth_org_id() and public.auth_role() in ('ADMIN','HR'))
);

-- Server-authoritative visit workflows. Thresholds are the phase-1 defaults;
-- move them to organization settings when the administration UI is built.
create or replace function public.visit_verification_status(
  distance_m numeric,
  accuracy_m numeric
)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select case
    when distance_m is null then 'UNAVAILABLE'
    when accuracy_m > 250 then 'REVIEW'
    when distance_m <= 150 then 'VERIFIED'
    when distance_m <= 500 then 'REVIEW'
    else 'OUTSIDE'
  end
$$;

create or replace function public.start_field_visit(
  p_visit_id uuid,
  p_customer_id uuid,
  p_client_event_id uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy_m numeric,
  p_captured_at timestamptz,
  p_purpose text default null
)
returns public.field_visits
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_org_id uuid := public.auth_org_id();
  v_location extensions.geography(point, 4326);
  v_customer_location extensions.geography(point, 4326);
  v_distance numeric;
  v_visit public.field_visits;
begin
  if auth.uid() is null or v_org_id is null then
    raise exception 'authenticated organization member required';
  end if;
  if p_accuracy_m is null or p_accuracy_m < 0 then
    raise exception 'valid GPS accuracy is required';
  end if;
  if p_visit_id is null or p_client_event_id is null or p_captured_at is null then
    raise exception 'visit id, idempotency key and capture time are required';
  end if;
  if p_latitude is null or p_longitude is null
    or p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
    raise exception 'invalid coordinates';
  end if;

  select c.location into v_customer_location
  from public.customers c
  where c.id = p_customer_id
    and c.organization_id = v_org_id
    and c.active
    and c.approval_status = 'APPROVED';
  if not found then
    raise exception 'approved active customer not found';
  end if;

  v_location := st_setsrid(st_makepoint(p_longitude, p_latitude), 4326)::extensions.geography;
  if v_customer_location is not null then
    v_distance := st_distance(v_location, v_customer_location);
  end if;

  insert into public.field_visits (
    id, organization_id, employee_id, customer_id, client_event_id, purpose,
    start_location, start_accuracy_m, start_distance_m, start_captured_at, location_status
  ) values (
    p_visit_id, v_org_id, auth.uid(), p_customer_id, p_client_event_id, nullif(trim(p_purpose), ''),
    v_location, p_accuracy_m, v_distance, p_captured_at,
    public.visit_verification_status(v_distance, p_accuracy_m)
  )
  on conflict (organization_id, client_event_id) do update
    set client_event_id = excluded.client_event_id
  returning * into v_visit;

  if v_visit.employee_id <> auth.uid() then
    raise exception 'idempotency key belongs to another employee';
  end if;
  if v_visit.id <> p_visit_id then
    raise exception 'idempotency key belongs to another visit';
  end if;
  return v_visit;
end;
$$;

create or replace function public.complete_field_visit(
  p_visit_id uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy_m numeric,
  p_captured_at timestamptz,
  p_outcome text,
  p_products text[] default '{}',
  p_potential_value numeric default null,
  p_follow_up_on date default null,
  p_notes text default null,
  p_evidence_path text default null
)
returns public.field_visits
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_org_id uuid := public.auth_org_id();
  v_visit public.field_visits;
  v_location extensions.geography(point, 4326);
  v_customer_location extensions.geography(point, 4326);
  v_distance numeric;
begin
  if auth.uid() is null or v_org_id is null then
    raise exception 'authenticated organization member required';
  end if;
  if p_accuracy_m is null or p_accuracy_m < 0 or p_captured_at is null then
    raise exception 'valid GPS accuracy is required';
  end if;
  if p_latitude is null or p_longitude is null
    or p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
    raise exception 'invalid coordinates';
  end if;
  if nullif(trim(p_outcome), '') is null then
    raise exception 'visit outcome is required';
  end if;
  if nullif(trim(p_evidence_path), '') is null then
    raise exception 'live visit evidence is required';
  end if;

  select * into v_visit
  from public.field_visits
  where id = p_visit_id and organization_id = v_org_id
  for update;
  if not found then
    raise exception 'visit not found';
  end if;
  if v_visit.employee_id <> auth.uid() and public.auth_role() not in ('ADMIN','HR','MANAGER') then
    raise exception 'visit does not belong to the current employee';
  end if;
  if v_visit.status = 'COMPLETED' then
    return v_visit;
  end if;
  if v_visit.status <> 'IN_PROGRESS' then
    raise exception 'only an in-progress visit can be completed';
  end if;
  if p_evidence_path not like v_org_id::text || '/' || v_visit.employee_id::text || '/' || v_visit.id::text || '/%' then
    raise exception 'invalid visit evidence path';
  end if;
  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'visit-evidence' and o.name = p_evidence_path
  ) then
    raise exception 'visit evidence upload not found';
  end if;

  select c.location into v_customer_location
  from public.customers c
  where c.id = v_visit.customer_id and c.organization_id = v_org_id;
  v_location := st_setsrid(st_makepoint(p_longitude, p_latitude), 4326)::extensions.geography;
  if v_customer_location is not null then
    v_distance := st_distance(v_location, v_customer_location);
  end if;

  update public.field_visits set
    status = 'COMPLETED',
    completed_at = now(),
    completed_captured_at = p_captured_at,
    end_location = v_location,
    end_accuracy_m = p_accuracy_m,
    end_distance_m = v_distance,
    location_status = public.visit_verification_status(v_distance, p_accuracy_m),
    outcome = trim(p_outcome),
    products = coalesce(p_products, '{}'),
    potential_value = p_potential_value,
    follow_up_on = p_follow_up_on,
    notes = nullif(trim(p_notes), ''),
    evidence_path = p_evidence_path,
    updated = now()
  where id = p_visit_id
  returning * into v_visit;

  return v_visit;
end;
$$;

revoke all on function public.start_field_visit(uuid, uuid, uuid, double precision, double precision, numeric, timestamptz, text) from public;
revoke all on function public.complete_field_visit(uuid, double precision, double precision, numeric, timestamptz, text, text[], numeric, date, text, text) from public;
grant execute on function public.start_field_visit(uuid, uuid, uuid, double precision, double precision, numeric, timestamptz, text) to authenticated;
grant execute on function public.complete_field_visit(uuid, double precision, double precision, numeric, timestamptz, text, text[], numeric, date, text, text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('visit-evidence', 'visit-evidence', false, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false;

create policy "visit_evidence_select" on storage.objects for select using (
  bucket_id = 'visit-evidence'
  and (storage.foldername(name))[1] = public.auth_org_id()::text
  and (
    (storage.foldername(name))[2] = auth.uid()::text
    or public.auth_role() in ('ADMIN','HR','MANAGER')
  )
);
create policy "visit_evidence_insert" on storage.objects for insert with check (
  bucket_id = 'visit-evidence'
  and (storage.foldername(name))[1] = public.auth_org_id()::text
  and (storage.foldername(name))[2] = auth.uid()::text
);
create policy "visit_evidence_update" on storage.objects for update using (
  bucket_id = 'visit-evidence'
  and (storage.foldername(name))[1] = public.auth_org_id()::text
  and (storage.foldername(name))[2] = auth.uid()::text
);
create policy "visit_evidence_delete" on storage.objects for delete using (
  bucket_id = 'visit-evidence'
  and (storage.foldername(name))[1] = public.auth_org_id()::text
  and public.auth_role() in ('ADMIN','HR')
);
create policy "visit_evidence_delete_own_orphan" on storage.objects for delete using (
  bucket_id = 'visit-evidence'
  and (storage.foldername(name))[1] = public.auth_org_id()::text
  and (storage.foldername(name))[2] = auth.uid()::text
  and not exists (
    select 1 from public.field_visits v where v.evidence_path = storage.objects.name
  )
);
