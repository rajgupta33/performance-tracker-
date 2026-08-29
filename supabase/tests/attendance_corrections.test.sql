begin;

create extension if not exists pgtap with schema extensions;
select plan(11);

insert into public.organizations(id, name, country, subscription_status)
values ('c1000000-0000-0000-0000-000000000001', 'Correction Test Org', 'IN', 'ACTIVE');

insert into auth.users(
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    'c2000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'correction-employee@test.invalid', '', now(),
    '{}', '{}', now(), now()
  ),
  (
    'c2000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'correction-admin@test.invalid', '', now(),
    '{}', '{}', now(), now()
  );

update public.profiles
set organization_id = 'c1000000-0000-0000-0000-000000000001',
    role = 'EMPLOYEE', name = 'Correction Employee', status = 'ACTIVE',
    line_manager_id = 'c2000000-0000-0000-0000-000000000002'
where id = 'c2000000-0000-0000-0000-000000000001';

update public.profiles
set organization_id = 'c1000000-0000-0000-0000-000000000001',
    role = 'ADMIN', name = 'Correction Admin', status = 'ACTIVE'
where id = 'c2000000-0000-0000-0000-000000000002';

insert into public.settings(organization_id, key, value)
values ('c1000000-0000-0000-0000-000000000001', 'app_config', '{"timezone":"UTC"}');

insert into public.attendance(
  id, organization_id, employee_id, employee_name, date, check_in,
  status, duty_type, location, latitude, longitude
) values (
  'c3000000-0000-4000-8000-000000000001',
  'c1000000-0000-0000-0000-000000000001',
  'c2000000-0000-0000-0000-000000000001', 'Correction Employee', current_date,
  now() - interval '8 hours', 'PRESENT', 'OFFICE', 'Test office', 28.6139, 77.2090
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c2000000-0000-0000-0000-000000000001', true);

select lives_ok(
  $$select public.submit_attendance_correction_request(
    'c3000000-0000-4000-8000-000000000001', current_date,
    null, (now() at time zone 'UTC')::time, 'Forgot to check out after completing the shift.'
  )$$,
  'employee can request a correction for their attendance row'
);

select is(
  (select count(*) from public.attendance_correction_requests
   where employee_id = 'c2000000-0000-0000-0000-000000000001' and status = 'PENDING'),
  1::bigint,
  'submission creates one pending request'
);

select throws_ok(
  $$select public.submit_attendance_correction_request(
    'c3000000-0000-4000-8000-000000000001', current_date,
    null, (now() at time zone 'UTC')::time, 'Duplicate correction request for the same date.'
  )$$,
  'P0001',
  'a correction request is already pending for this date',
  'a second pending request for the same date is rejected'
);

select throws_ok(
  $$insert into public.attendance_correction_requests(
    organization_id, employee_id, employee_name, work_date, request_type,
    proposed_check_in, reason
  ) values (
    'c1000000-0000-0000-0000-000000000001',
    'c2000000-0000-0000-0000-000000000001', 'Correction Employee', current_date,
    'CHECK_IN', '09:00', 'Direct employee insert'
  )$$,
  '42501',
  'permission denied for table attendance_correction_requests',
  'employee cannot bypass the submission function with a direct insert'
);

select set_config('request.jwt.claim.sub', 'c2000000-0000-0000-0000-000000000002', true);

select lives_ok(
  format(
    'select public.review_attendance_correction_request(%L, %L, %L)',
    (select id from public.attendance_correction_requests where status = 'PENDING'),
    'APPROVED', 'Verified against the employee shift record.'
  ),
  'authorized administrator can approve the request'
);

select is(
  (select status from public.attendance_correction_requests limit 1),
  'APPROVED',
  'approved request is final'
);

select ok(
  (select check_out is not null from public.attendance where id = 'c3000000-0000-4000-8000-000000000001'),
  'approval applies the corrected punch to attendance'
);

select is(
  (select count(*) from public.attendance_change_events
   where attendance_id = 'c3000000-0000-4000-8000-000000000001'
     and reason_code = 'MISSED_PUNCH_CORRECTION_APPROVED'),
  1::bigint,
  'approval is recorded in immutable attendance history'
);

select set_config('request.jwt.claim.sub', 'c2000000-0000-0000-0000-000000000001', true);

select lives_ok(
  $$select public.submit_attendance_correction_request(
    null, current_date - 1, '09:00', '18:00',
    'The complete attendance day was missing after an offline shift.'
  )$$,
  'employee can request reconstruction of a wholly missing day'
);

select set_config('request.jwt.claim.sub', 'c2000000-0000-0000-0000-000000000002', true);

select lives_ok(
  format(
    'select public.review_attendance_correction_request(%L, %L, %L)',
    (select id from public.attendance_correction_requests
     where work_date = current_date - 1 and status = 'PENDING'),
    'APPROVED', 'Confirmed the complete shift with the line manager.'
  ),
  'administrator can approve reconstruction of a missing day'
);

select ok(
  (select count(*) = 1 and min(check_in) is not null and min(check_out) is not null
   from public.attendance
   where employee_id = 'c2000000-0000-0000-0000-000000000001'
     and date = current_date - 1),
  'missing-day approval creates exactly one complete attendance row'
);

select * from finish();
rollback;
