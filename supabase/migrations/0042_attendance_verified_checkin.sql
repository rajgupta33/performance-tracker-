-- Verified, idempotent employee attendance check-in.

alter table public.attendance
  add column client_event_id uuid,
  add column location_accuracy_m numeric check (location_accuracy_m is null or location_accuracy_m >= 0),
  add column location_captured_at timestamptz;

alter table public.attendance
  add constraint attendance_client_event_unique unique (organization_id, client_event_id);

create or replace function public.submit_attendance_check_in(
  p_client_event_id uuid,
  p_captured_at timestamptz,
  p_work_date date,
  p_status text,
  p_location text,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy_m numeric,
  p_location_captured_at timestamptz,
  p_duty_type text,
  p_remarks text default null
)
returns public.attendance
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := public.auth_org_id();
  v_profile public.profiles;
  v_config jsonb := '{}'::jsonb;
  v_timezone text := 'UTC';
  v_max_accuracy numeric := 250;
  v_expected_date date;
  v_row public.attendance;
begin
  if auth.uid() is null or v_org_id is null then
    raise exception 'authenticated organization member required';
  end if;
  if p_client_event_id is null or p_captured_at is null then
    raise exception 'idempotency key and capture time are required';
  end if;
  if p_latitude is null or p_longitude is null
    or p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
    raise exception 'valid attendance coordinates are required';
  end if;
  if p_accuracy_m is null or p_accuracy_m < 0 or p_location_captured_at is null then
    raise exception 'valid GPS accuracy is required';
  end if;
  if upper(coalesce(p_duty_type, '')) not in ('OFFICE', 'FACTORY') then
    raise exception 'duty type must be OFFICE or FACTORY';
  end if;
  if upper(coalesce(p_status, '')) not in ('PRESENT', 'LATE', 'REMOTE') then
    raise exception 'invalid employee check-in status';
  end if;

  select * into v_profile
  from public.profiles
  where id = auth.uid() and organization_id = v_org_id and status = 'ACTIVE';
  if not found then
    raise exception 'active employee profile required';
  end if;

  begin
    select value::jsonb into v_config
    from public.settings
    where organization_id = v_org_id and key = 'app_config';
  exception when others then
    v_config := '{}'::jsonb;
  end;

  v_timezone := coalesce(nullif(v_config->>'timezone', ''), 'UTC');
  begin
    v_expected_date := (p_captured_at at time zone v_timezone)::date;
  exception when invalid_parameter_value then
    v_timezone := 'UTC';
    v_expected_date := (p_captured_at at time zone v_timezone)::date;
  end;

  begin
    v_max_accuracy := coalesce((v_config->>'attendanceMaxGpsAccuracyM')::numeric, 250);
  exception when others then
    v_max_accuracy := 250;
  end;
  if v_max_accuracy <= 0 then v_max_accuracy := 250; end if;
  if p_accuracy_m > v_max_accuracy then
    raise exception 'GPS accuracy exceeds the configured % metre limit', v_max_accuracy;
  end if;
  if p_work_date is distinct from v_expected_date then
    raise exception 'work date does not match organization timezone';
  end if;
  if p_captured_at > now() + interval '5 minutes'
    or p_captured_at < now() - interval '14 days' then
    raise exception 'attendance capture time is outside the accepted window';
  end if;
  if p_location_captured_at > p_captured_at + interval '1 minute'
    or p_location_captured_at < p_captured_at - interval '5 minutes' then
    raise exception 'attendance location is stale';
  end if;

  select * into v_row
  from public.attendance
  where organization_id = v_org_id and client_event_id = p_client_event_id;
  if found then
    if v_row.employee_id <> auth.uid()::text then
      raise exception 'idempotency key belongs to another employee';
    end if;
    return v_row;
  end if;

  insert into public.attendance(
    organization_id, employee_id, employee_name, date, check_in, status,
    duty_type, location, latitude, longitude, location_accuracy_m,
    location_captured_at, remarks, client_event_id
  ) values (
    v_org_id, auth.uid()::text, v_profile.name, p_work_date, p_captured_at,
    upper(p_status), upper(p_duty_type), nullif(trim(coalesce(p_location, '')), ''),
    p_latitude, p_longitude, p_accuracy_m, p_location_captured_at,
    nullif(trim(coalesce(p_remarks, '')), ''), p_client_event_id
  )
  on conflict (organization_id, client_event_id) do nothing
  returning * into v_row;

  if v_row.id is null then
    select * into v_row from public.attendance
    where organization_id = v_org_id and client_event_id = p_client_event_id;
  end if;
  if v_row.id is null or v_row.employee_id <> auth.uid()::text then
    raise exception 'attendance idempotency conflict';
  end if;
  return v_row;
end;
$$;

revoke all on function public.submit_attendance_check_in(uuid,timestamptz,date,text,text,double precision,double precision,numeric,timestamptz,text,text) from public;
grant execute on function public.submit_attendance_check_in(uuid,timestamptz,date,text,text,double precision,double precision,numeric,timestamptz,text,text) to authenticated;

-- Employees must use the verified RPC. The narrow legacy branch exists only
-- for offline entries created by older clients; those rows are visibly routed
-- to manager review instead of being treated as verified attendance.
drop policy if exists "attendance_insert" on public.attendance;
create policy "attendance_insert" on public.attendance for insert with check (
  public.is_super_admin()
  or (
    organization_id = public.auth_org_id()
    and (
      public.auth_role() in ('ADMIN', 'HR', 'MANAGER')
      or (
        employee_id = auth.uid()::text
        and client_event_id is null
        and location_accuracy_m is null
        and requires_review
        and review_status = 'PENDING'
        and change_reason = 'LEGACY_OFFLINE_CHECKIN_NO_GPS'
      )
    )
  )
);
