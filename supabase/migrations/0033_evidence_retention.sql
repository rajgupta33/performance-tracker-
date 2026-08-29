-- Policy-gated evidence retention with dry-run and per-object audit records.

create table public.evidence_retention_policies (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  status text not null default 'DISABLED' check (status in ('DISABLED','ACTIVE')),
  attendance_days integer check (attendance_days between 30 and 3650),
  visit_days integer check (visit_days between 30 and 3650),
  collection_days integer check (collection_days between 30 and 3650),
  policy_reference text,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  updated_at timestamptz not null default now(),
  check (
    status = 'DISABLED'
    or (
      attendance_days is not null and visit_days is not null and collection_days is not null
      and nullif(trim(policy_reference), '') is not null and approved_by is not null and approved_at is not null
    )
  )
);

create table public.evidence_cleanup_runs (
  id uuid primary key default uuid_generate_v4(),
  dry_run boolean not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  candidate_count integer not null default 0,
  deleted_count integer not null default 0,
  failed_count integer not null default 0,
  status text not null default 'RUNNING' check (status in ('RUNNING','COMPLETED','FAILED')),
  error text
);

create table public.evidence_cleanup_items (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.evidence_cleanup_runs(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_type text not null check (source_type in ('ATTENDANCE','VISIT','COLLECTION')),
  record_id uuid not null,
  bucket_id text not null check (bucket_id in ('selfies','visit-evidence','collection-proof')),
  object_path text not null,
  outcome text not null check (outcome in ('PENDING','DRY_RUN','DELETED','FAILED')),
  error text,
  created_at timestamptz not null default now(),
  unique (run_id, source_type, record_id)
);
create index evidence_cleanup_items_org_date on public.evidence_cleanup_items(organization_id, created_at desc);

alter table public.evidence_retention_policies enable row level security;
alter table public.evidence_cleanup_runs enable row level security;
alter table public.evidence_cleanup_items enable row level security;

create policy "evidence_retention_policy_select" on public.evidence_retention_policies for select using (
  public.is_super_admin() or (organization_id = public.auth_org_id() and public.auth_role() in ('ADMIN','HR'))
);
create policy "evidence_cleanup_runs_select" on public.evidence_cleanup_runs for select using (
  public.is_super_admin()
);
create policy "evidence_cleanup_items_select" on public.evidence_cleanup_items for select using (
  public.is_super_admin() or (organization_id = public.auth_org_id() and public.auth_role() in ('ADMIN','HR'))
);

create or replace function public.set_evidence_retention_policy(
  p_attendance_days integer,
  p_visit_days integer,
  p_collection_days integer,
  p_policy_reference text,
  p_activate boolean default false
)
returns public.evidence_retention_policies
language plpgsql security definer set search_path = public as $$
declare
  v_org_id uuid := public.auth_org_id();
  v_policy public.evidence_retention_policies;
begin
  if public.auth_role() not in ('ADMIN','HR') then raise exception 'admin or HR access required'; end if;
  if p_attendance_days not between 30 and 3650 or p_visit_days not between 30 and 3650 or p_collection_days not between 30 and 3650 then
    raise exception 'retention periods must be between 30 and 3650 days';
  end if;
  if nullif(trim(p_policy_reference), '') is null then raise exception 'approved policy reference is required'; end if;
  insert into public.evidence_retention_policies(
    organization_id, status, attendance_days, visit_days, collection_days, policy_reference,
    approved_by, approved_at, updated_by, updated_at
  ) values (
    v_org_id, case when p_activate then 'ACTIVE' else 'DISABLED' end,
    p_attendance_days, p_visit_days, p_collection_days, trim(p_policy_reference),
    case when p_activate then auth.uid() else null end, case when p_activate then now() else null end,
    auth.uid(), now()
  ) on conflict (organization_id) do update set
    status = excluded.status, attendance_days = excluded.attendance_days, visit_days = excluded.visit_days,
    collection_days = excluded.collection_days, policy_reference = excluded.policy_reference,
    approved_by = excluded.approved_by, approved_at = excluded.approved_at,
    updated_by = excluded.updated_by, updated_at = now()
  returning * into v_policy;
  return v_policy;
end;
$$;

create or replace function public.list_expired_evidence(p_limit integer default 500)
returns table (organization_id uuid, source_type text, record_id uuid, bucket_id text, object_path text)
language sql security definer set search_path = public as $$
  with candidates as (
    select a.organization_id, 'ATTENDANCE'::text source_type, a.id record_id, 'selfies'::text bucket_id, a.selfie object_path,
      a.date::timestamptz occurred_at
    from public.attendance a join public.evidence_retention_policies p on p.organization_id = a.organization_id and p.status = 'ACTIVE'
    where a.selfie is not null and a.date < current_date - p.attendance_days
    union all
    select v.organization_id, 'VISIT', v.id, 'visit-evidence', v.evidence_path, v.completed_at
    from public.field_visits v join public.evidence_retention_policies p on p.organization_id = v.organization_id and p.status = 'ACTIVE'
    where v.evidence_path is not null and v.completed_at < now() - make_interval(days => p.visit_days)
    union all
    select c.organization_id, 'COLLECTION', c.id, 'collection-proof', c.proof_path, c.submitted_at
    from public.field_collections c join public.evidence_retention_policies p on p.organization_id = c.organization_id and p.status = 'ACTIVE'
    where c.proof_path is not null and c.submitted_at < now() - make_interval(days => p.collection_days)
  )
  select c.organization_id, c.source_type, c.record_id, c.bucket_id, c.object_path
  from candidates c order by c.occurred_at, c.source_type, c.record_id
  limit greatest(1, least(coalesce(p_limit, 500), 1000));
$$;

create or replace function public.mark_evidence_deleted(
  p_source_type text,
  p_record_id uuid,
  p_expected_path text
)
returns boolean
language plpgsql security definer set search_path = public as $$
declare v_updated integer;
begin
  if p_source_type = 'ATTENDANCE' then
    update public.attendance set selfie = null, updated = now() where id = p_record_id and selfie = p_expected_path;
  elsif p_source_type = 'VISIT' then
    update public.field_visits set evidence_path = null, updated = now() where id = p_record_id and evidence_path = p_expected_path;
  elsif p_source_type = 'COLLECTION' then
    update public.field_collections set proof_path = null, updated = now() where id = p_record_id and proof_path = p_expected_path;
  else
    raise exception 'invalid evidence source type';
  end if;
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('collection-proof', 'collection-proof', false, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "collection_proof_select" on storage.objects for select using (
  bucket_id = 'collection-proof' and (
    (storage.foldername(name))[1] = public.auth_org_id()::text
    and ((storage.foldername(name))[2] = auth.uid()::text or public.auth_role() in ('ADMIN','HR','MANAGER'))
  )
);
create policy "collection_proof_insert" on storage.objects for insert with check (
  bucket_id = 'collection-proof' and (storage.foldername(name))[1] = public.auth_org_id()::text
  and (storage.foldername(name))[2] = auth.uid()::text
);
create policy "collection_proof_delete_orphan" on storage.objects for delete using (
  bucket_id = 'collection-proof' and (storage.foldername(name))[1] = public.auth_org_id()::text
  and (storage.foldername(name))[2] = auth.uid()::text
  and not exists (select 1 from public.field_collections c where c.proof_path = storage.objects.name)
);

revoke all on function public.set_evidence_retention_policy(integer, integer, integer, text, boolean) from public;
revoke all on function public.list_expired_evidence(integer) from public;
revoke all on function public.mark_evidence_deleted(text, uuid, text) from public;
grant execute on function public.set_evidence_retention_policy(integer, integer, integer, text, boolean) to authenticated;
grant execute on function public.list_expired_evidence(integer) to service_role;
grant execute on function public.mark_evidence_deleted(text, uuid, text) to service_role;
