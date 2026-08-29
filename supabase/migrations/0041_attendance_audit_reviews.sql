-- Structured attendance corrections and manager review workflow.

alter table public.attendance
  add column change_reason text,
  add column modified_by uuid references public.profiles(id) on delete set null,
  add column modified_via text not null default 'USER'
    check (modified_via in ('USER','MANAGER','SYSTEM')),
  add column requires_review boolean not null default false,
  add column review_status text not null default 'NOT_REQUIRED'
    check (review_status in ('NOT_REQUIRED','PENDING','APPROVED','CORRECTED')),
  add column auto_closed_at timestamptz,
  add column reviewed_by uuid references public.profiles(id) on delete set null,
  add column reviewed_at timestamptz,
  add column review_note text;

alter table public.attendance drop constraint if exists attendance_status_check;
alter table public.attendance add constraint attendance_status_check
  check (status in ('PRESENT','ABSENT','LATE','HALF_DAY','HOLIDAY','LEAVE','REMOTE','EARLY_OUT'));

create index attendance_pending_review
  on public.attendance(organization_id, date desc)
  where review_status = 'PENDING';

create table public.attendance_change_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  attendance_id uuid not null,
  employee_id text not null,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_type text not null check (actor_type in ('USER','MANAGER','SYSTEM')),
  change_type text not null check (change_type in ('CREATED','UPDATED','DELETED','REVIEWED')),
  reason_code text not null,
  note text,
  before_state jsonb,
  after_state jsonb,
  created timestamptz not null default now()
);

create index attendance_change_events_record
  on public.attendance_change_events(organization_id, attendance_id, created desc);
create index attendance_change_events_employee
  on public.attendance_change_events(organization_id, employee_id, created desc);

alter table public.attendance_change_events enable row level security;

create policy "attendance_change_events_select" on public.attendance_change_events
for select using (
  public.is_super_admin()
  or (
    organization_id = public.auth_org_id()
    and (
      public.auth_role() in ('ADMIN','HR','MANAGER')
      or employee_id = auth.uid()::text
    )
  )
);

create or replace function public.prepare_attendance_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_role text := public.auth_role();
begin
  new.updated := now();

  if v_actor is not null then
    new.modified_by := v_actor;
    new.modified_via := case when v_role in ('ADMIN','HR','MANAGER') then 'MANAGER' else 'USER' end;
    if tg_op = 'UPDATE' and new.change_reason is not distinct from old.change_reason then
      new.change_reason := case when new.modified_via = 'MANAGER' then 'MANUAL_CORRECTION' else 'USER_UPDATE' end;
    elsif tg_op = 'INSERT' and nullif(trim(coalesce(new.change_reason, '')), '') is null then
      new.change_reason := 'ATTENDANCE_CREATED';
    end if;
  else
    new.modified_via := coalesce(new.modified_via, 'SYSTEM');
    new.change_reason := coalesce(nullif(trim(new.change_reason), ''), 'SYSTEM_UPDATE');
  end if;

  return new;
end;
$$;

create or replace function public.record_attendance_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.attendance;
  v_actor_type text;
  v_change_type text;
  v_reason text;
begin
  v_row := case when tg_op = 'DELETE' then old else new end;
  v_actor_type := case
    when auth.uid() is null then 'SYSTEM'
    when public.auth_role() in ('ADMIN','HR','MANAGER') then 'MANAGER'
    else 'USER'
  end;
  v_change_type := case
    when tg_op = 'INSERT' then 'CREATED'
    when tg_op = 'DELETE' then 'DELETED'
    when old.review_status is distinct from new.review_status then 'REVIEWED'
    else 'UPDATED'
  end;
  v_reason := case when tg_op = 'DELETE' then 'ATTENDANCE_DELETED'
    else coalesce(nullif(trim(v_row.change_reason), ''), v_change_type) end;

  insert into public.attendance_change_events(
    organization_id, attendance_id, employee_id, actor_id, actor_type,
    change_type, reason_code, note, before_state, after_state
  ) values (
    v_row.organization_id, v_row.id, v_row.employee_id, auth.uid(), v_actor_type,
    v_change_type, v_reason,
    case when tg_op = 'DELETE' then old.remarks else new.review_note end,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end
  );
  return v_row;
end;
$$;

create trigger attendance_prepare_change
before insert or update on public.attendance
for each row execute function public.prepare_attendance_change();

create trigger attendance_record_change
after insert or update or delete on public.attendance
for each row execute function public.record_attendance_change();

create or replace function public.review_attendance_exception(
  p_attendance_id uuid,
  p_decision text,
  p_note text,
  p_check_out timestamptz default null
)
returns public.attendance
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_decision text := upper(trim(coalesce(p_decision, '')));
  v_row public.attendance;
begin
  if auth.uid() is null or v_org_id is null
    or not (public.is_super_admin() or v_role in ('ADMIN','HR','MANAGER')) then
    raise exception 'manager access required';
  end if;
  if v_decision not in ('APPROVED','CORRECTED') then
    raise exception 'decision must be APPROVED or CORRECTED';
  end if;
  if length(trim(coalesce(p_note, ''))) < 5 then
    raise exception 'review note must contain at least 5 characters';
  end if;
  if v_decision = 'CORRECTED' and p_check_out is null then
    raise exception 'corrected check-out time is required';
  end if;

  select * into v_row from public.attendance a
  where a.id = p_attendance_id and a.organization_id = v_org_id
  for update;
  if not found then raise exception 'attendance record not found'; end if;
  if v_row.review_status <> 'PENDING' then raise exception 'attendance record is not pending review'; end if;

  if v_role = 'MANAGER' and not exists (
    select 1 from public.profiles employee
    left join public.teams team on team.id = employee.team_id
    where employee.organization_id = v_org_id
      and employee.id::text = v_row.employee_id
      and (employee.line_manager_id = auth.uid() or team.leader_id = auth.uid())
  ) then
    raise exception 'attendance record is outside manager scope';
  end if;

  update public.attendance
  set check_out = case when v_decision = 'CORRECTED' then p_check_out else check_out end,
      review_status = v_decision,
      requires_review = false,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_note = trim(p_note),
      change_reason = case when v_decision = 'CORRECTED' then 'AUTO_CLOSE_CORRECTED' else 'AUTO_CLOSE_APPROVED' end
  where id = v_row.id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.review_attendance_exception(uuid,text,text,timestamptz) from public;
grant execute on function public.review_attendance_exception(uuid,text,text,timestamptz) to authenticated;
