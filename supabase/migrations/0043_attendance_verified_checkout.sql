-- Verified, idempotent employee attendance check-out with separate evidence.

alter table public.attendance
  add column check_out_event_id uuid,
  add column check_out_location text,
  add column check_out_latitude double precision,
  add column check_out_longitude double precision,
  add column check_out_accuracy_m numeric check (check_out_accuracy_m is null or check_out_accuracy_m >= 0),
  add column check_out_captured_at timestamptz,
  add column check_out_selfie text,
  add column check_out_remarks text;

alter table public.attendance
  add constraint attendance_check_out_event_unique unique (organization_id, check_out_event_id);

create or replace function public.submit_attendance_check_out(
  p_attendance_id uuid,
  p_client_event_id uuid,
  p_captured_at timestamptz,
  p_location text,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy_m numeric,
  p_location_captured_at timestamptz,
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
  v_max_accuracy numeric := 250;
  v_row public.attendance;
begin
  if auth.uid() is null or v_org_id is null then
    raise exception 'authenticated organization member required';
  end if;
  if p_attendance_id is null or p_client_event_id is null or p_captured_at is null then
    raise exception 'attendance id, idempotency key and capture time are required';
  end if;
  if p_latitude is null or p_longitude is null
    or p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
    raise exception 'valid attendance coordinates are required';
  end if;
  if p_accuracy_m is null or p_accuracy_m < 0 or p_location_captured_at is null then
    raise exception 'valid GPS accuracy is required';
  end if;

  select * into v_profile
  from public.profiles
  where id = auth.uid() and organization_id = v_org_id and status = 'ACTIVE';
  if not found then raise exception 'active employee profile required'; end if;

  begin
    select value::jsonb into v_config
    from public.settings
    where organization_id = v_org_id and key = 'app_config';
  exception when others then
    v_config := '{}'::jsonb;
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
  where id = p_attendance_id and organization_id = v_org_id
  for update;
  if not found or v_row.employee_id <> auth.uid()::text then
    raise exception 'open attendance session not found';
  end if;
  if v_row.check_out_event_id = p_client_event_id then return v_row; end if;
  if v_row.check_out is not null then raise exception 'attendance session is already closed'; end if;
  if p_captured_at < v_row.check_in then raise exception 'check-out cannot precede check-in'; end if;

  perform set_config('app.attendance_verified_checkout', '1', true);
  update public.attendance
  set check_out = p_captured_at,
      check_out_event_id = p_client_event_id,
      check_out_location = nullif(trim(coalesce(p_location, '')), ''),
      check_out_latitude = p_latitude,
      check_out_longitude = p_longitude,
      check_out_accuracy_m = p_accuracy_m,
      check_out_captured_at = p_location_captured_at,
      check_out_selfie = p_attendance_id::text || '/checkout.webp',
      check_out_remarks = nullif(trim(coalesce(p_remarks, '')), ''),
      change_reason = 'EMPLOYEE_VERIFIED_CHECK_OUT'
  where id = p_attendance_id
  returning * into v_row;
  return v_row;
end;
$$;

revoke all on function public.submit_attendance_check_out(uuid,uuid,timestamptz,text,double precision,double precision,numeric,timestamptz,text) from public;
grant execute on function public.submit_attendance_check_out(uuid,uuid,timestamptz,text,double precision,double precision,numeric,timestamptz,text) to authenticated;

create or replace function public.guard_attendance_employee_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.auth_role();
  v_verified_checkout boolean := coalesce(current_setting('app.attendance_verified_checkout', true), '') = '1';
  v_client_fallback boolean;
  v_selfie_link boolean;
begin
  if auth.uid() is null or public.is_super_admin() or v_role in ('ADMIN', 'HR', 'MANAGER') then
    return new;
  end if;
  if old.employee_id <> auth.uid()::text or old.organization_id <> public.auth_org_id() then
    raise exception 'attendance update is outside employee scope';
  end if;
  if v_verified_checkout then return new; end if;

  v_client_fallback :=
    old.date <= current_date
    and old.check_out is null
    and new.check_out is not null
    and coalesce(new.remarks, '') like '%[System: Auto-closed — no check-out recorded]'
    and (to_jsonb(new) - array['check_out','remarks']::text[])
      = (to_jsonb(old) - array['check_out','remarks']::text[]);

  v_selfie_link :=
    old.selfie is null
    and new.selfie = old.id::text || '/selfie.webp'
    and (to_jsonb(new) - 'selfie') = (to_jsonb(old) - 'selfie');

  if v_client_fallback or v_selfie_link then return new; end if;
  raise exception 'employee attendance updates must use a verified attendance function';
end;
$$;

drop trigger if exists attendance_00_guard_employee_update on public.attendance;
create trigger attendance_00_guard_employee_update
before update on public.attendance
for each row execute function public.guard_attendance_employee_update();
