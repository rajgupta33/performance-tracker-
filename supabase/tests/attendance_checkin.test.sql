begin;

create extension if not exists pgtap with schema extensions;
select plan(6);

insert into public.organizations(id, name, country, subscription_status)
values ('a1000000-0000-0000-0000-000000000001', 'Attendance Test Org', 'IN', 'ACTIVE');

insert into auth.users(
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  'a2000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'attendance@test.invalid', '', now(),
  '{}', '{}', now(), now()
);

update public.profiles
set organization_id = 'a1000000-0000-0000-0000-000000000001',
    role = 'EMPLOYEE', name = 'Attendance Employee', status = 'ACTIVE'
where id = 'a2000000-0000-0000-0000-000000000001';

insert into public.settings(organization_id, key, value)
values (
  'a1000000-0000-0000-0000-000000000001',
  'app_config',
  '{"timezone":"Asia/Kolkata","attendanceMaxGpsAccuracyM":250}'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a2000000-0000-0000-0000-000000000001', true);

select lives_ok(
  $$select public.submit_attendance_check_in(
    'a3000000-0000-4000-8000-000000000001', now(),
    (now() at time zone 'Asia/Kolkata')::date, 'PRESENT', 'Test location',
    28.6139, 77.2090, 20, now(), 'FACTORY', 'Dealer visit'
  )$$,
  'active employee can submit verified attendance'
);

select is(
  (select count(*) from public.attendance where client_event_id = 'a3000000-0000-4000-8000-000000000001'),
  1::bigint,
  'first event creates one attendance row'
);

select lives_ok(
  $$select public.submit_attendance_check_in(
    'a3000000-0000-4000-8000-000000000001', now(),
    (now() at time zone 'Asia/Kolkata')::date, 'PRESENT', 'Test location',
    28.6139, 77.2090, 20, now(), 'FACTORY', 'Dealer visit'
  )$$,
  'replaying the same event is accepted'
);

select is(
  (select count(*) from public.attendance where client_event_id = 'a3000000-0000-4000-8000-000000000001'),
  1::bigint,
  'replaying the same event does not duplicate attendance'
);

select throws_ok(
  $$select public.submit_attendance_check_in(
    'a3000000-0000-4000-8000-000000000002', now(),
    (now() at time zone 'Asia/Kolkata')::date, 'PRESENT', 'Weak GPS',
    28.6139, 77.2090, 251, now(), 'OFFICE', null
  )$$,
  'P0001',
  'GPS accuracy exceeds the configured 250 metre limit',
  'server rejects GPS evidence outside the organization limit'
);

select throws_ok(
  $$insert into public.attendance(
    organization_id, employee_id, date, check_in, status, latitude, longitude
  ) values (
    'a1000000-0000-0000-0000-000000000001',
    'a2000000-0000-0000-0000-000000000001', current_date, now(), 'PRESENT', 28.6, 77.2
  )$$,
  '42501',
  'new row violates row-level security policy for table "attendance"',
  'employee cannot bypass the verified check-in function with a direct insert'
);

select * from finish();
rollback;
