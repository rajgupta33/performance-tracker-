begin;

create extension if not exists pgtap with schema extensions;
select plan(14);

insert into public.organizations(id, name, country, subscription_status)
values ('d1000000-0000-0000-0000-000000000001', 'Payroll Lock Test Org', 'IN', 'ACTIVE');

insert into auth.users(
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    'd2000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'lock-employee@test.invalid', '', now(),
    '{}', '{}', now(), now()
  ),
  (
    'd2000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'lock-admin@test.invalid', '', now(),
    '{}', '{}', now(), now()
  );

update public.profiles
set organization_id = 'd1000000-0000-0000-0000-000000000001',
    role = 'EMPLOYEE', name = 'Lock Employee', status = 'ACTIVE',
    line_manager_id = 'd2000000-0000-0000-0000-000000000002'
where id = 'd2000000-0000-0000-0000-000000000001';

update public.profiles
set organization_id = 'd1000000-0000-0000-0000-000000000001',
    role = 'ADMIN', name = 'Lock Admin', status = 'ACTIVE'
where id = 'd2000000-0000-0000-0000-000000000002';

insert into public.settings(organization_id, key, value)
values ('d1000000-0000-0000-0000-000000000001', 'app_config', '{"timezone":"UTC"}');

insert into public.attendance(
  id, organization_id, employee_id, employee_name, date, check_in, check_out,
  status, duty_type, location, latitude, longitude
) values (
  'd3000000-0000-4000-8000-000000000001',
  'd1000000-0000-0000-0000-000000000001',
  'd2000000-0000-0000-0000-000000000001', 'Lock Employee', current_date - 2,
  (current_date - 2) + time '09:00', (current_date - 2) + time '17:00',
  'PRESENT', 'OFFICE', 'Test office', 28.6139, 77.2090
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd2000000-0000-0000-0000-000000000001', true);

select lives_ok(
  $$select public.submit_attendance_correction_request(
    'd3000000-0000-4000-8000-000000000001', current_date - 2,
    null, '18:00', 'The recorded checkout missed the final working hour.'
  )$$,
  'employee can submit a correction before payroll is locked'
);

select set_config('request.jwt.claim.sub', 'd2000000-0000-0000-0000-000000000002', true);

select throws_ok(
  $$select public.advance_attendance_payroll_lock(
    current_date - 2, 'Payroll was reviewed, exported, and finalized.'
  )$$,
  'P0001',
  format('pending attendance corrections must be resolved before payroll can lock through %s', current_date - 2),
  'payroll cannot strand a pending correction request'
);

select lives_ok(
  format(
    'select public.review_attendance_correction_request(%L, %L, %L)',
    (select id from public.attendance_correction_requests where status = 'PENDING'),
    'REJECTED', 'Resolved before attendance payroll finalization.'
  ),
  'pending correction can be resolved before payroll finalization'
);

select lives_ok(
  $$select public.advance_attendance_payroll_lock(
    current_date - 2, 'Payroll was reviewed, exported, and finalized.'
  )$$,
  'administrator can lock a completed payroll period'
);

select is(
  (select locked_through from public.attendance_payroll_locks
   where organization_id = 'd1000000-0000-0000-0000-000000000001'),
  current_date - 2,
  'organization lock stores the finalized boundary'
);

select is(
  (select count(*) from public.attendance_payroll_lock_events
   where organization_id = 'd1000000-0000-0000-0000-000000000001'),
  1::bigint,
  'lock advancement creates one immutable event'
);

select lives_ok(
  $$select public.advance_attendance_payroll_lock(
    current_date - 2, 'Idempotent retry after a lost response is safe.'
  )$$,
  'replaying the current boundary is idempotent'
);

select throws_ok(
  $$select public.advance_attendance_payroll_lock(
    current_date - 3, 'Attempt to move finalized payroll backward.'
  )$$,
  'P0001',
  format('payroll lock cannot move backward from %s', current_date - 2),
  'payroll lock cannot move backward'
);

select throws_ok(
  $$select public.advance_attendance_payroll_lock(
    current_date, 'Attempt to lock an incomplete attendance date.'
  )$$,
  'P0001',
  'payroll can only lock completed attendance dates',
  'current work date cannot be finalized'
);

select throws_ok(
  $$update public.attendance set remarks = 'Post-payroll edit'
    where id = 'd3000000-0000-4000-8000-000000000001'$$,
  'P0001',
  format('attendance is locked through %s for finalized payroll', current_date - 2),
  'locked attendance cannot be updated'
);

select throws_ok(
  $$delete from public.attendance
    where id = 'd3000000-0000-4000-8000-000000000001'$$,
  'P0001',
  format('attendance is locked through %s for finalized payroll', current_date - 2),
  'locked attendance cannot be deleted'
);

select throws_ok(
  $$insert into public.attendance(
    organization_id, employee_id, employee_name, date, check_in, status
  ) values (
    'd1000000-0000-0000-0000-000000000001',
    'd2000000-0000-0000-0000-000000000001', 'Lock Employee',
    current_date - 2, now(), 'PRESENT'
  )$$,
  'P0001',
  format('attendance is locked through %s for finalized payroll', current_date - 2),
  'new attendance cannot be inserted into a locked period'
);

select set_config('request.jwt.claim.sub', 'd2000000-0000-0000-0000-000000000001', true);

select throws_ok(
  $$select public.submit_attendance_correction_request(
    'd3000000-0000-4000-8000-000000000001', current_date - 2,
    null, '18:30', 'Another correction after payroll was finalized.'
  )$$,
  'P0001',
  format('attendance is locked through %s for finalized payroll', current_date - 2),
  'new corrections cannot target a locked period'
);

select set_config('request.jwt.claim.sub', 'd2000000-0000-0000-0000-000000000002', true);

insert into public.attendance(
  organization_id, employee_id, employee_name, date, check_in,
  status, duty_type, location
) values (
  'd1000000-0000-0000-0000-000000000001',
  'd2000000-0000-0000-0000-000000000001', 'Lock Employee', current_date - 1,
  (current_date - 1) + time '09:00', 'PRESENT', 'OFFICE', 'Test office'
);

select throws_ok(
  $$select public.advance_attendance_payroll_lock(
    current_date - 1, 'Attempt to finalize with an open attendance session.'
  )$$,
  'P0001',
  format('open attendance sessions must be resolved before payroll can lock through %s', current_date - 1),
  'payroll cannot strand an open attendance session'
);

select * from finish();
rollback;
