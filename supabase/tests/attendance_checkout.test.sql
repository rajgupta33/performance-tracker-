begin;

create extension if not exists pgtap with schema extensions;
select plan(8);

insert into public.organizations(id, name, country, subscription_status)
values ('b1000000-0000-0000-0000-000000000001', 'Check-out Test Org', 'IN', 'ACTIVE');

insert into auth.users(
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  'b2000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'checkout@test.invalid', '', now(),
  '{}', '{}', now(), now()
);

update public.profiles
set organization_id = 'b1000000-0000-0000-0000-000000000001',
    role = 'EMPLOYEE', name = 'Check-out Employee', status = 'ACTIVE'
where id = 'b2000000-0000-0000-0000-000000000001';

insert into public.settings(organization_id, key, value)
values (
  'b1000000-0000-0000-0000-000000000001',
  'app_config',
  '{"timezone":"Asia/Kolkata","attendanceMaxGpsAccuracyM":250}'
);

insert into public.attendance(
  id, organization_id, employee_id, employee_name, date, check_in, status,
  duty_type, location, latitude, longitude
) values (
  'b3000000-0000-4000-8000-000000000001',
  'b1000000-0000-0000-0000-000000000001',
  'b2000000-0000-0000-0000-000000000001', 'Check-out Employee', current_date,
  now() - interval '8 hours', 'PRESENT', 'OFFICE', 'Test office', 28.6139, 77.2090
);

insert into public.attendance(
  id, organization_id, employee_id, employee_name, date, check_in, status,
  duty_type, location, latitude, longitude
) values (
  'b3000000-0000-4000-8000-000000000002',
  'b1000000-0000-0000-0000-000000000001',
  'b2000000-0000-0000-0000-000000000001', 'Check-out Employee', current_date - 1,
  now() - interval '32 hours', 'PRESENT', 'OFFICE', 'Test office', 28.6139, 77.2090
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b2000000-0000-0000-0000-000000000001', true);

select lives_ok(
  $$select public.submit_attendance_check_out(
    'b3000000-0000-4000-8000-000000000001',
    'b4000000-0000-4000-8000-000000000001', now(), 'Test office exit',
    28.6139, 77.2090, 20, now(), 'Shift complete'
  )$$,
  'employee can submit a verified check-out for their open session'
);

select is(
  (select check_out_event_id from public.attendance where id = 'b3000000-0000-4000-8000-000000000001'),
  'b4000000-0000-4000-8000-000000000001'::uuid,
  'check-out stores its event key'
);

select is(
  (select check_out_selfie from public.attendance where id = 'b3000000-0000-4000-8000-000000000001'),
  'b3000000-0000-4000-8000-000000000001/checkout.webp',
  'check-out reserves a distinct selfie evidence path'
);

select lives_ok(
  $$select public.submit_attendance_check_out(
    'b3000000-0000-4000-8000-000000000001',
    'b4000000-0000-4000-8000-000000000001', now(), 'Replay ignored',
    28.6139, 77.2090, 20, now(), 'Replay ignored'
  )$$,
  'replaying the same check-out event returns the original row'
);

select is(
  (select check_out_remarks from public.attendance where id = 'b3000000-0000-4000-8000-000000000001'),
  'Shift complete',
  'a replay cannot overwrite the original evidence'
);

select throws_ok(
  $$update public.attendance
    set check_out_remarks = 'Employee edited audit evidence'
    where id = 'b3000000-0000-4000-8000-000000000001'$$,
  'P0001',
  'employee attendance updates must use a verified attendance function',
  'employee cannot directly rewrite attendance evidence'
);

select throws_ok(
  $$select public.submit_attendance_check_out(
    'b3000000-0000-4000-8000-000000000001',
    'b4000000-0000-4000-8000-000000000002', now(), 'Weak GPS',
    28.6139, 77.2090, 251, now(), null
  )$$,
  'P0001',
  'GPS accuracy exceeds the configured 250 metre limit',
  'server rejects check-out GPS outside the organization limit'
);

select lives_ok(
  $$update public.attendance
    set check_out = now() - interval '24 hours',
        remarks = '[System: Auto-closed — no check-out recorded]'
    where id = 'b3000000-0000-4000-8000-000000000002'$$,
  'the frozen past-day client fallback remains compatible with the employee guard'
);

select * from finish();
rollback;
