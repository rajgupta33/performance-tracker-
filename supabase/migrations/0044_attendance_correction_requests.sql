-- Employee missed-punch correction requests with scoped manager approval.

create table public.attendance_correction_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  attendance_id uuid references public.attendance(id) on delete set null,
  employee_id text not null,
  employee_name text not null,
  work_date date not null,
  request_type text not null check (request_type in ('CHECK_IN','CHECK_OUT','BOTH')),
  original_check_in timestamptz,
  original_check_out timestamptz,
  proposed_check_in time,
  proposed_check_out time,
  reason text not null,
  status text not null default 'PENDING' check (status in ('PENDING','APPROVED','REJECTED')),
  reviewer_id uuid references public.profiles(id) on delete set null,
  reviewer_note text,
  reviewed_at timestamptz,
  created timestamptz not null default now(),
  updated timestamptz not null default now()
);

create unique index attendance_correction_one_pending_day
  on public.attendance_correction_requests(organization_id, employee_id, work_date)
  where status = 'PENDING';
create index attendance_correction_review_queue
  on public.attendance_correction_requests(organization_id, status, created desc);

alter table public.attendance_correction_requests enable row level security;

create policy "attendance_corrections_select" on public.attendance_correction_requests
for select using (
  public.is_super_admin()
  or (
    organization_id = public.auth_org_id()
    and (
      employee_id = auth.uid()::text
      or public.auth_role() in ('ADMIN','HR')
      or (
        public.auth_role() = 'MANAGER'
        and exists (
          select 1
          from public.profiles employee
          left join public.teams team on team.id = employee.team_id
          where employee.id::text = attendance_correction_requests.employee_id
            and employee.organization_id = attendance_correction_requests.organization_id
            and (employee.line_manager_id = auth.uid() or team.leader_id = auth.uid())
        )
      )
    )
  )
);

revoke insert, update, delete on public.attendance_correction_requests from authenticated;
grant select on public.attendance_correction_requests to authenticated;

create or replace function public.submit_attendance_correction_request(
  p_attendance_id uuid,
  p_work_date date,
  p_proposed_check_in time,
  p_proposed_check_out time,
  p_reason text
)
returns public.attendance_correction_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := public.auth_org_id();
  v_profile public.profiles;
  v_attendance public.attendance;
  v_request public.attendance_correction_requests;
  v_config jsonb := '{}'::jsonb;
  v_timezone text := 'UTC';
  v_today date;
  v_type text;
begin
  if auth.uid() is null or v_org_id is null then
    raise exception 'authenticated organization member required';
  end if;
  if p_work_date is null then raise exception 'attendance date is required'; end if;
  if p_proposed_check_in is null and p_proposed_check_out is null then
    raise exception 'at least one proposed punch time is required';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 10 then
    raise exception 'correction reason must contain at least 10 characters';
  end if;
  if length(trim(p_reason)) > 1000 then raise exception 'correction reason is too long'; end if;

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
  v_timezone := coalesce(nullif(v_config->>'timezone', ''), 'UTC');
  begin
    v_today := (now() at time zone v_timezone)::date;
  exception when invalid_parameter_value then
    v_timezone := 'UTC';
    v_today := (now() at time zone v_timezone)::date;
  end;
  if p_work_date > v_today then raise exception 'future attendance cannot be corrected'; end if;
  if p_work_date < v_today - 90 then raise exception 'attendance corrections are limited to 90 days'; end if;

  if p_attendance_id is not null then
    select * into v_attendance
    from public.attendance
    where id = p_attendance_id
      and organization_id = v_org_id
      and employee_id = auth.uid()::text
      and date = p_work_date;
    if not found then raise exception 'attendance record is outside employee scope'; end if;
  else
    select * into v_attendance
    from public.attendance
    where organization_id = v_org_id
      and employee_id = auth.uid()::text
      and date = p_work_date
    order by created
    limit 1;
  end if;

  if v_attendance.id is null and (p_proposed_check_in is null or p_proposed_check_out is null) then
    raise exception 'a missing attendance day requires both check-in and check-out times';
  end if;

  v_type := case
    when p_proposed_check_in is not null and p_proposed_check_out is not null then 'BOTH'
    when p_proposed_check_in is not null then 'CHECK_IN'
    else 'CHECK_OUT'
  end;

  insert into public.attendance_correction_requests(
    organization_id, attendance_id, employee_id, employee_name, work_date,
    request_type, original_check_in, original_check_out,
    proposed_check_in, proposed_check_out, reason
  ) values (
    v_org_id, v_attendance.id, auth.uid()::text, v_profile.name, p_work_date,
    v_type, v_attendance.check_in, v_attendance.check_out,
    p_proposed_check_in, p_proposed_check_out, trim(p_reason)
  )
  returning * into v_request;

  insert into public.notifications(
    organization_id, user_id, type, title, message, priority,
    reference_id, reference_type, action_url
  )
  select distinct v_org_id, recipient.id, 'ATTENDANCE',
    'Attendance correction requested',
    v_profile.name || ' requested a correction for ' || p_work_date::text,
    'HIGH', v_request.id::text, 'attendance_correction', 'attendance-audit'
  from public.profiles recipient
  left join public.teams team on team.id = v_profile.team_id
  where recipient.organization_id = v_org_id
    and recipient.status = 'ACTIVE'
    and (
      recipient.id = v_profile.line_manager_id
      or recipient.id = team.leader_id
      or recipient.role in ('ADMIN','HR')
    );

  return v_request;
exception
  when unique_violation then
    raise exception 'a correction request is already pending for this date';
end;
$$;

revoke all on function public.submit_attendance_correction_request(uuid,date,time,time,text) from public;
grant execute on function public.submit_attendance_correction_request(uuid,date,time,time,text) to authenticated;

create or replace function public.review_attendance_correction_request(
  p_request_id uuid,
  p_decision text,
  p_note text
)
returns public.attendance_correction_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_decision text := upper(trim(coalesce(p_decision, '')));
  v_request public.attendance_correction_requests;
  v_attendance public.attendance;
  v_timezone text := 'UTC';
  v_config jsonb := '{}'::jsonb;
  v_check_in timestamptz;
  v_check_out timestamptz;
begin
  if auth.uid() is null or v_org_id is null
    or not (public.is_super_admin() or v_role in ('ADMIN','HR','MANAGER')) then
    raise exception 'manager access required';
  end if;
  if v_decision not in ('APPROVED','REJECTED') then
    raise exception 'decision must be APPROVED or REJECTED';
  end if;
  if length(trim(coalesce(p_note, ''))) < 5 then
    raise exception 'review note must contain at least 5 characters';
  end if;

  select * into v_request
  from public.attendance_correction_requests
  where id = p_request_id and organization_id = v_org_id
  for update;
  if not found then raise exception 'correction request not found'; end if;
  if v_request.status <> 'PENDING' then raise exception 'correction request is already resolved'; end if;

  if v_role = 'MANAGER' and not exists (
    select 1
    from public.profiles employee
    left join public.teams team on team.id = employee.team_id
    where employee.id::text = v_request.employee_id
      and employee.organization_id = v_org_id
      and (employee.line_manager_id = auth.uid() or team.leader_id = auth.uid())
  ) then
    raise exception 'correction request is outside manager scope';
  end if;

  if v_decision = 'APPROVED' then
    begin
      select value::jsonb into v_config
      from public.settings
      where organization_id = v_org_id and key = 'app_config';
    exception when others then
      v_config := '{}'::jsonb;
    end;
    v_timezone := coalesce(nullif(v_config->>'timezone', ''), 'UTC');
    begin
      perform now() at time zone v_timezone;
    exception when invalid_parameter_value then
      v_timezone := 'UTC';
    end;

    if v_request.attendance_id is not null then
      select * into v_attendance
      from public.attendance
      where id = v_request.attendance_id and organization_id = v_org_id
      for update;
      if not found then raise exception 'linked attendance record not found'; end if;
    else
      select * into v_attendance
      from public.attendance
      where organization_id = v_org_id
        and employee_id = v_request.employee_id
        and date = v_request.work_date
      order by created
      limit 1
      for update;
      if found then v_request.attendance_id := v_attendance.id; end if;
    end if;

    v_check_in := case when v_request.proposed_check_in is not null
      then (v_request.work_date + v_request.proposed_check_in) at time zone v_timezone
      else v_attendance.check_in end;
    v_check_out := case when v_request.proposed_check_out is not null
      then (v_request.work_date + v_request.proposed_check_out) at time zone v_timezone
      else v_attendance.check_out end;
    if v_check_in is null or v_check_out is null then
      raise exception 'approved attendance must contain both punch times';
    end if;
    if v_check_out <= v_check_in then v_check_out := v_check_out + interval '1 day'; end if;
    if v_check_out > v_check_in + interval '24 hours' then
      raise exception 'corrected attendance cannot exceed 24 hours';
    end if;

    if v_request.attendance_id is null then
      insert into public.attendance(
        organization_id, employee_id, employee_name, date, check_in, check_out,
        status, duty_type, location, remarks, change_reason, modified_via,
        requires_review, review_status, reviewed_by, reviewed_at, review_note
      ) values (
        v_org_id, v_request.employee_id, v_request.employee_name, v_request.work_date,
        v_check_in, v_check_out, 'PRESENT', 'OFFICE', 'Approved correction request',
        '[Correction request] ' || v_request.reason,
        'MISSED_PUNCH_CORRECTION_APPROVED', 'MANAGER', false, 'CORRECTED',
        auth.uid(), now(), trim(p_note)
      ) returning * into v_attendance;
      v_request.attendance_id := v_attendance.id;
    else
      update public.attendance
      set check_in = v_check_in,
          check_out = v_check_out,
          status = case when v_attendance.status = 'ABSENT' then 'PRESENT' else status end,
          requires_review = false,
          review_status = 'CORRECTED',
          reviewed_by = auth.uid(),
          reviewed_at = now(),
          review_note = trim(p_note),
          change_reason = 'MISSED_PUNCH_CORRECTION_APPROVED'
      where id = v_request.attendance_id
      returning * into v_attendance;
    end if;
  end if;

  update public.attendance_correction_requests
  set attendance_id = v_request.attendance_id,
      status = v_decision,
      reviewer_id = auth.uid(),
      reviewer_note = trim(p_note),
      reviewed_at = now(),
      updated = now()
  where id = v_request.id
  returning * into v_request;

  insert into public.notifications(
    organization_id, user_id, type, title, message, priority,
    reference_id, reference_type, action_url
  ) values (
    v_org_id, v_request.employee_id::uuid, 'ATTENDANCE',
    'Attendance correction ' || lower(v_decision),
    'Your correction request for ' || v_request.work_date::text || ' was ' || lower(v_decision) || '.',
    'NORMAL', v_request.id::text, 'attendance_correction', 'attendance-logs'
  );

  return v_request;
end;
$$;

revoke all on function public.review_attendance_correction_request(uuid,text,text) from public;
grant execute on function public.review_attendance_correction_request(uuid,text,text) to authenticated;
