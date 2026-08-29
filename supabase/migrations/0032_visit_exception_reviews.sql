-- Audited manager decisions for visit-location exceptions.

create table public.field_visit_reviews (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  visit_id uuid not null references public.field_visits(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete restrict,
  decision text not null check (decision in ('APPROVED','REJECTED')),
  note text not null check (nullif(trim(note), '') is not null),
  created timestamptz not null default now(),
  unique (visit_id)
);
create index field_visit_reviews_org_date on public.field_visit_reviews(organization_id, created desc);

alter table public.field_visit_reviews enable row level security;
create policy "field_visit_reviews_select" on public.field_visit_reviews for select using (
  public.is_super_admin()
  or (
    organization_id = public.auth_org_id()
    and (
      public.auth_role() in ('ADMIN','HR','MANAGER')
      or exists (select 1 from public.field_visits v where v.id = field_visit_reviews.visit_id and v.employee_id = auth.uid())
    )
  )
);

create or replace function public.review_visit_exception(
  p_visit_id uuid,
  p_decision text,
  p_note text
)
returns public.field_visit_reviews
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := public.auth_org_id();
  v_visit public.field_visits;
  v_review public.field_visit_reviews;
begin
  if not (public.is_super_admin() or public.auth_role() in ('ADMIN','HR','MANAGER')) then raise exception 'management access required'; end if;
  if p_decision not in ('APPROVED','REJECTED') then raise exception 'invalid review decision'; end if;
  if nullif(trim(p_note), '') is null then raise exception 'review note is required'; end if;
  select * into v_visit from public.field_visits
  where id = p_visit_id and organization_id = v_org_id and status = 'COMPLETED'
    and location_status in ('REVIEW','OUTSIDE','UNAVAILABLE') for update;
  if not found then raise exception 'visit exception not found'; end if;

  insert into public.field_visit_reviews(organization_id, visit_id, reviewer_id, decision, note)
  values (v_org_id, p_visit_id, auth.uid(), p_decision, trim(p_note))
  returning * into v_review;
  return v_review;
end;
$$;

revoke all on function public.review_visit_exception(uuid, text, text) from public;
grant execute on function public.review_visit_exception(uuid, text, text) to authenticated;
