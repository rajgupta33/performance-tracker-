-- Monotonic payroll-period locking for finalized attendance.

create table public.attendance_payroll_locks (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  locked_through date not null,
  locked_by uuid not null references public.profiles(id) on delete restrict,
  note text not null,
  created timestamptz not null default now(),
  updated timestamptz not null default now()
);

create table public.attendance_payroll_lock_events (
  id uuid primary key default uuid_generate_v4(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  previous_locked_through date,
  locked_through date not null,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  note text not null,
  created timestamptz not null default now()
);

create index attendance_payroll_lock_events_org
  on public.attendance_payroll_lock_events(organization_id, created desc);

alter table public.attendance_payroll_locks enable row level security;
alter table public.attendance_payroll_lock_events enable row level security;

create policy "attendance_payroll_locks_select" on public.attendance_payroll_locks
for select using (
  public.is_super_admin() or organization_id = public.auth_org_id()
);

create policy "attendance_payroll_lock_events_select" on public.attendance_payroll_lock_events
for select using (
  public.is_super_admin()
  or (organization_id = public.auth_org_id() and public.auth_role() in ('ADMIN','HR'))
);

revoke insert, update, delete on public.attendance_payroll_locks from authenticated;
revoke insert, update, delete on public.attendance_payroll_lock_events from authenticated;
grant select on public.attendance_payroll_locks to authenticated;
grant select on public.attendance_payroll_lock_events to authenticated;

create or replace function public.advance_attendance_payroll_lock(
  p_locked_through date,
  p_note text
)
returns public.attendance_payroll_locks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_existing public.attendance_payroll_locks;
  v_result public.attendance_payroll_locks;
  v_config jsonb := '{}'::jsonb;
  v_timezone text := 'UTC';
  v_today date;
begin
  if auth.uid() is null or v_org_id is null
    or not (public.is_super_admin() or v_role in ('ADMIN','HR')) then
    raise exception 'admin or HR access required';
  end if;
  if p_locked_through is null then raise exception 'payroll lock date is required'; end if;
  if length(trim(coalesce(p_note, ''))) < 10 then
    raise exception 'payroll lock note must contain at least 10 characters';
  end if;
  if length(trim(p_note)) > 1000 then raise exception 'payroll lock note is too long'; end if;

  begin
    select value::jsonb into v_config
    from public.settings
    where organization_id = v_org_id and key = 'app_config';
  exception when others then
    v_config := '{}'::jsonb;
  end;
  v_timezone := coalesce(nullif(v_config->>'timezone', ''), 'UTC');
  begin
    v_today := (now() at time zone v_timezone)::date;
  exception when invalid_parameter_value then
    v_timezone := 'UTC';
    v_today := (now() at time zone v_timezone)::date;
  end;
  if p_locked_through >= v_today then
    raise exception 'payroll can only lock completed attendance dates';
  end if;

  -- Every attendance mutation takes the same organization advisory lock.
  -- This makes advancing the payroll boundary atomic with concurrent edits.
  perform pg_advisory_xact_lock(hashtextextended(v_org_id::text, 0));

  select * into v_existing
  from public.attendance_payroll_locks
  where organization_id = v_org_id
  for update;

  if v_existing.locked_through is not null then
    if p_locked_through = v_existing.locked_through then return v_existing; end if;
    if p_locked_through < v_existing.locked_through then
      raise exception 'payroll lock cannot move backward from %', v_existing.locked_through;
    end if;
  end if;

  if exists (
    select 1 from public.attendance
    where organization_id = v_org_id
      and date <= p_locked_through
      and check_out is null
      and status not in ('ABSENT','LEAVE','HOLIDAY')
  ) then
    raise exception 'open attendance sessions must be resolved before payroll can lock through %', p_locked_through;
  end if;

  if exists (
    select 1 from public.attendance_correction_requests
    where organization_id = v_org_id
      and work_date <= p_locked_through
      and status = 'PENDING'
  ) then
    raise exception 'pending attendance corrections must be resolved before payroll can lock through %', p_locked_through;
  end if;

  insert into public.attendance_payroll_locks(
    organization_id, locked_through, locked_by, note
  ) values (
    v_org_id, p_locked_through, auth.uid(), trim(p_note)
  )
  on conflict (organization_id) do update
  set locked_through = excluded.locked_through,
      locked_by = excluded.locked_by,
      note = excluded.note,
      updated = now()
  returning * into v_result;

  insert into public.attendance_payroll_lock_events(
    organization_id, previous_locked_through, locked_through, actor_id, note
  ) values (
    v_org_id, v_existing.locked_through, p_locked_through, auth.uid(), trim(p_note)
  );

  return v_result;
end;
$$;

revoke all on function public.advance_attendance_payroll_lock(date,text) from public;
grant execute on function public.advance_attendance_payroll_lock(date,text) to authenticated;

create or replace function public.guard_attendance_payroll_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_old_date date;
  v_new_date date;
  v_locked_through date;
begin
  if tg_op = 'INSERT' then
    v_org_id := new.organization_id;
    v_new_date := new.date;
  elsif tg_op = 'DELETE' then
    v_org_id := old.organization_id;
    v_old_date := old.date;
  else
    v_org_id := old.organization_id;
    v_old_date := old.date;
    v_new_date := new.date;
    if new.organization_id is distinct from old.organization_id then
      raise exception 'attendance organization cannot be changed';
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_org_id::text, 0));
  select locked_through into v_locked_through
  from public.attendance_payroll_locks
  where organization_id = v_org_id;

  if v_locked_through is not null
    and (v_old_date <= v_locked_through or v_new_date <= v_locked_through) then
    raise exception 'attendance is locked through % for finalized payroll', v_locked_through;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists attendance_01_guard_payroll_lock on public.attendance;
create trigger attendance_01_guard_payroll_lock
before insert or update or delete on public.attendance
for each row execute function public.guard_attendance_payroll_lock();

create or replace function public.guard_attendance_correction_payroll_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_locked_through date;
begin
  if tg_op = 'INSERT'
    or (tg_op = 'UPDATE' and new.status = 'APPROVED' and old.status is distinct from new.status) then
    perform pg_advisory_xact_lock(hashtextextended(new.organization_id::text, 0));
    select locked_through into v_locked_through
    from public.attendance_payroll_locks
    where organization_id = new.organization_id;
    if v_locked_through is not null and new.work_date <= v_locked_through then
      raise exception 'attendance is locked through % for finalized payroll', v_locked_through;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists attendance_correction_guard_payroll_lock on public.attendance_correction_requests;
create trigger attendance_correction_guard_payroll_lock
before insert or update on public.attendance_correction_requests
for each row execute function public.guard_attendance_correction_payroll_lock();
