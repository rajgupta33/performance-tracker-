begin;

create extension if not exists pgtap with schema extensions;
select plan(56);

-- Fixed IDs make failures readable and keep every assertion deterministic.
insert into public.organizations(id, name, country, subscription_status) values
  ('10000000-0000-0000-0000-000000000001', 'RLS Org One', 'IN', 'ACTIVE'),
  ('10000000-0000-0000-0000-000000000002', 'RLS Org Two', 'IN', 'ACTIVE');

insert into auth.users(id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'employee-a@test.invalid', '', now(), '{}', '{}', now(), now()),
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'employee-b@test.invalid', '', now(), '{}', '{}', now(), now()),
  ('20000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'manager@test.invalid', '', now(), '{}', '{}', now(), now()),
  ('20000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'outsider@test.invalid', '', now(), '{}', '{}', now(), now()),
  ('20000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@test.invalid', '', now(), '{}', '{}', now(), now());

update public.profiles set organization_id = '10000000-0000-0000-0000-000000000001', role = 'EMPLOYEE', employee_id = 'EMP-A', name = 'Employee A'
where id = '20000000-0000-0000-0000-000000000001';
update public.profiles set organization_id = '10000000-0000-0000-0000-000000000001', role = 'EMPLOYEE', employee_id = 'EMP-B', name = 'Employee B'
where id = '20000000-0000-0000-0000-000000000002';
update public.profiles set organization_id = '10000000-0000-0000-0000-000000000001', role = 'MANAGER', employee_id = 'MGR-1', name = 'Manager One'
where id = '20000000-0000-0000-0000-000000000003';
update public.profiles set organization_id = '10000000-0000-0000-0000-000000000002', role = 'EMPLOYEE', employee_id = 'OUT-1', name = 'Other Org Employee'
where id = '20000000-0000-0000-0000-000000000004';
update public.profiles set organization_id = '10000000-0000-0000-0000-000000000001', role = 'ADMIN', employee_id = 'ADMIN-1', name = 'Org One Admin'
where id = '20000000-0000-0000-0000-000000000005';

insert into public.teams(id, organization_id, name, leader_id) values
  ('70000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Org One Team', '20000000-0000-0000-0000-000000000003');
insert into public.territories(id, organization_id, name, code, manager_id) values
  ('71000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Org One Territory', 'ORG1-T', '20000000-0000-0000-0000-000000000003');
update public.profiles set team_id = '70000000-0000-0000-0000-000000000001', territory_id = '71000000-0000-0000-0000-000000000001'
where id in (
  '20000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000002',
  '20000000-0000-0000-0000-000000000003'
);

insert into public.customers(id, organization_id, name, registered_by, approval_status) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Org One Dealer', '20000000-0000-0000-0000-000000000001', 'APPROVED'),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'Org Two Dealer', '20000000-0000-0000-0000-000000000004', 'APPROVED');

insert into public.field_visits(
  id, organization_id, employee_id, customer_id, client_event_id, status, outcome,
  started_at, start_captured_at, completed_at, completed_captured_at,
  start_location, end_location, start_accuracy_m, end_accuracy_m, start_distance_m, end_distance_m, location_status
) values
  ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', 'COMPLETED', 'Order discussion', now(), now(), now(), now(), extensions.st_point(77, 28)::extensions.geography, extensions.st_point(77, 28)::extensions.geography, 20, 20, 10, 10, 'VERIFIED'),
  ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000002', 'COMPLETED', 'Remote meeting', now(), now(), now(), now(), extensions.st_point(77, 28)::extensions.geography, extensions.st_point(78, 29)::extensions.geography, 80, 80, 1000, 1000, 'OUTSIDE'),
  ('40000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000003', 'COMPLETED', 'Other tenant', now(), now(), now(), now(), extensions.st_point(77, 28)::extensions.geography, extensions.st_point(77, 28)::extensions.geography, 20, 20, 10, 10, 'VERIFIED');

insert into public.field_collections(
  id, organization_id, employee_id, customer_id, client_event_id, amount, payment_mode,
  captured_at, location, accuracy_m, status
) values
  ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 1000, 'CASH', now(), extensions.st_point(77, 28)::extensions.geography, 20, 'SUBMITTED'),
  ('50000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000002', 2000, 'CASH', now(), extensions.st_point(77, 28)::extensions.geography, 20, 'SUBMITTED'),
  ('50000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000004', '30000000-0000-0000-0000-000000000002', '51000000-0000-0000-0000-000000000003', 3000, 'CASH', now(), extensions.st_point(77, 28)::extensions.geography, 20, 'SUBMITTED');

insert into public.performance_targets(
  id, organization_id, assignee_type, employee_id, period_start, period_end, status, created_by
) values (
  '60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'EMPLOYEE',
  '20000000-0000-0000-0000-000000000001', date_trunc('month', current_date)::date,
  (date_trunc('month', current_date) + interval '1 month - 1 day')::date, 'ACTIVE',
  '20000000-0000-0000-0000-000000000003'
);
insert into public.performance_target_metrics(target_id, metric_key, target_value, weight, unit) values
  ('60000000-0000-0000-0000-000000000001', 'sales_amount', 10000, 40, 'INR'),
  ('60000000-0000-0000-0000-000000000001', 'collection_amount', 5000, 25, 'INR'),
  ('60000000-0000-0000-0000-000000000001', 'productive_visits', 20, 15, 'COUNT'),
  ('60000000-0000-0000-0000-000000000001', 'new_dealers', 5, 10, 'COUNT'),
  ('60000000-0000-0000-0000-000000000001', 'lead_conversion', 20, 10, 'PERCENT');

-- Employee A: own rows only, including same-organization peer isolation.
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select is((select count(*) from public.field_visits), 1::bigint, 'employee sees only own visit');
select is((select count(*) from public.field_collections), 1::bigint, 'employee sees only own collection');
select is((select count(*) from public.customers), 1::bigint, 'employee sees customers only in own organization');
select is((select count(*) from public.point_events), 2::bigint, 'employee sees only own source-backed point events');
select throws_ok(
  $$select public.review_field_collection('50000000-0000-0000-0000-000000000001', 'VERIFIED', null)$$,
  'P0001', 'manager access required', 'employee cannot review a collection'
);
select throws_ok(
  $$select public.review_visit_exception('40000000-0000-0000-0000-000000000002', 'APPROVED', 'Looks valid')$$,
  'P0001', 'management access required', 'employee cannot review a visit exception'
);
select throws_ok(
  $$select public.get_field_force_dashboard(current_date - 7, current_date)$$,
  'P0001', 'management access required', 'employee cannot call management BI'
);
select throws_ok(
  $$select public.set_evidence_retention_policy(365, 365, 365, 'TEST-POLICY', false)$$,
  'P0001', 'admin or HR access required', 'employee cannot configure evidence retention'
);
select is(
  (select count(*) from public.get_employee_performance_history(null, 12)), 1::bigint,
  'employee can read own performance target history'
);
select throws_ok(
  $$select public.change_performance_target_status('60000000-0000-0000-0000-000000000001', 'CLOSED')$$,
  'P0001', 'manager access required', 'employee cannot close a performance target'
);
select throws_ok(
  $$select public.preview_bulk_performance_targets(array['20000000-0000-0000-0000-000000000001'::uuid], current_date, current_date)$$,
  'P0001', 'manager access required', 'employee cannot preview bulk target assignment'
);
select throws_ok(
  $$select public.get_performance_group_scorecards(current_date, current_date, 'TEAM')$$,
  'P0001', 'manager access required', 'employee cannot open management group scorecards'
);
select throws_ok(
  $$select public.get_performance_group_trend('TEAM', '70000000-0000-0000-0000-000000000001', current_date, 12)$$,
  'P0001', 'manager access required', 'employee cannot open management group trends'
);
select throws_ok(
  $$select public.list_point_rules()$$,
  'P0001', 'admin or HR access required', 'employee cannot enumerate point-rule history'
);
select throws_ok(
  $$select public.create_point_adjustment('20000000-0000-0000-0000-000000000001', 5, 'Unauthorized correction', 'OPS-1', now(), '90000000-0000-0000-0000-000000000001')$$,
  'P0001', 'admin or HR access required', 'employee cannot create a point adjustment'
);
select is(
  (select count(*) from public.get_my_performance_badges() where earned),
  1::bigint,
  'employee sees the immutable badge earned from source-backed points'
);
select throws_ok(
  $$select public.create_performance_coaching_action('20000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 'lead_conversion', 'Improve conversion', 'Review ten qualified leads every Friday.', current_date + 7)$$,
  'P0001', 'manager access required', 'employee cannot create a coaching action'
);
select throws_ok(
  $$select public.submit_field_collection('52000000-0000-0000-0000-000000000001', '53000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', 100, 'CASH', null, null, 28, 77, 20, now(), null)$$,
  'P0001', 'active customer not found', 'employee cannot submit against another tenant customer'
);
reset role;

-- Manager: organization-wide visibility and privileged workflows, never cross-tenant.
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000003', true);
select is((select count(*) from public.field_visits), 2::bigint, 'manager sees all organization visits');
select is((select count(*) from public.field_collections), 2::bigint, 'manager sees all organization collections');
select is((select count(*) from public.customers), 1::bigint, 'manager cannot see other organization customers');
select lives_ok(
  $$select public.get_field_force_dashboard(current_date - 7, current_date)$$,
  'manager can call management BI'
);
select lives_ok(
  $$select public.review_visit_exception('40000000-0000-0000-0000-000000000002', 'APPROVED', 'Customer confirmed the remote site')$$,
  'manager can review an in-tenant visit exception'
);
select throws_ok(
  $$select public.review_visit_exception('40000000-0000-0000-0000-000000000003', 'APPROVED', 'Cross tenant')$$,
  'P0001', 'visit exception not found', 'manager cannot review another tenant visit'
);
select is((select count(*) from public.field_visit_reviews), 1::bigint, 'manager sees only in-tenant visit reviews');
select lives_ok(
  $$select public.change_performance_target_status('60000000-0000-0000-0000-000000000001', 'CLOSED')$$,
  'manager can close an in-tenant performance target'
);
select is(
  (select count(*) from public.performance_target_events where target_id = '60000000-0000-0000-0000-000000000001'),
  2::bigint,
  'target lifecycle records creation and closure'
);
select is(
  (select count(*) from public.preview_bulk_performance_targets(
    array['20000000-0000-0000-0000-000000000001'::uuid],
    date_trunc('month', current_date)::date,
    (date_trunc('month', current_date) + interval '1 month - 1 day')::date
  ) where readiness = 'CONFLICT'),
  1::bigint,
  'manager preview identifies an existing exact-period target'
);
select throws_ok(
  $$select public.preview_bulk_performance_targets(array['20000000-0000-0000-0000-000000000004'::uuid], current_date, current_date)$$,
  'P0001', 'one or more selected employees are invalid', 'manager cannot preview another tenant employee'
);
select lives_ok(
  $$select public.bulk_create_employee_performance_targets(
    array['20000000-0000-0000-0000-000000000002'::uuid],
    (date_trunc('month', current_date) + interval '1 month')::date,
    (date_trunc('month', current_date) + interval '2 months - 1 day')::date,
    '[{"metric_key":"sales_amount","target_value":10000,"weight":40,"unit":"INR"},{"metric_key":"collection_amount","target_value":5000,"weight":25,"unit":"INR"},{"metric_key":"productive_visits","target_value":20,"weight":15,"unit":"COUNT"},{"metric_key":"new_dealers","target_value":5,"weight":10,"unit":"COUNT"},{"metric_key":"lead_conversion","target_value":20,"weight":10,"unit":"PERCENT"}]'::jsonb,
    false
  )$$,
  'manager can create a draft target batch for an in-tenant employee'
);
select is(
  (select count(*) from public.performance_targets t where t.employee_id = '20000000-0000-0000-0000-000000000002' and t.status = 'DRAFT'),
  1::bigint,
  'bulk assignment creates a reviewable draft target'
);
select is(
  (select count(*) from public.get_performance_group_scorecards(
    date_trunc('month', current_date)::date,
    (date_trunc('month', current_date) + interval '1 month - 1 day')::date,
    'TEAM'
  )),
  1::bigint,
  'manager sees the team scorecard they lead or belong to'
);
select is(
  (select count(*) from public.get_performance_group_scorecards(
    date_trunc('month', current_date)::date,
    (date_trunc('month', current_date) + interval '1 month - 1 day')::date,
    'TERRITORY'
  )),
  1::bigint,
  'manager sees the territory scorecard they manage or belong to'
);
select is(
  (select count(*) from public.get_performance_group_trend(
    'TEAM', '70000000-0000-0000-0000-000000000001', current_date, 12
  )),
  12::bigint,
  'manager receives a 12-month team trend'
);
select is(
  (select count(*) from public.get_performance_group_trend(
    'TERRITORY', '71000000-0000-0000-0000-000000000001', current_date, 12
  )),
  12::bigint,
  'manager receives a 12-month territory trend'
);
select throws_ok(
  $$select public.configure_point_rule('LEAD_CREATED', 3, now() + interval '1 day', 'Manager cannot approve this')$$,
  'P0001', 'admin or HR access required', 'manager cannot configure point rules'
);
select lives_ok(
  $$select public.create_performance_coaching_action('20000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 'lead_conversion', 'Improve conversion', 'Review ten qualified leads every Friday.', current_date + 7)$$,
  'manager can create an outcome coaching action'
);
select is(
  (select count(*) from public.list_performance_coaching_actions('20000000-0000-0000-0000-000000000001', null)),
  1::bigint,
  'manager can list coaching actions for an in-tenant employee'
);
select throws_ok(
  $$select public.create_performance_coaching_action('20000000-0000-0000-0000-000000000004', null, 'sales_amount', 'Cross tenant action', 'This action must never be created cross tenant.', current_date + 7)$$,
  'P0001', 'employee not found', 'manager cannot coach another tenant employee'
);
select lives_ok(
  $$select public.change_performance_coaching_status((select id from public.performance_coaching_actions where employee_id = '20000000-0000-0000-0000-000000000001'), 'COMPLETED', 'Employee completed the agreed lead review.')$$,
  'manager can complete an active coaching action'
);
select is(
  (select count(*) from public.performance_coaching_events),
  2::bigint,
  'coaching creation and completion write immutable audit events'
);
reset role;

-- Employee can read the manager-created action but cannot mutate its lifecycle.
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select is(
  (select count(*) from public.list_performance_coaching_actions(null, 'COMPLETED')),
  1::bigint,
  'employee can read their completed coaching action'
);
select throws_ok(
  $$select public.change_performance_coaching_status((select id from public.performance_coaching_actions limit 1), 'CANCELLED', 'Employee cannot change this status.')$$,
  'P0001', 'manager access required', 'employee cannot change coaching status'
);
reset role;

-- Admin: prospective configuration and signed corrections are audited and tenant-scoped.
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000005', true);
select lives_ok(
  $$select public.configure_point_rule('LEAD_CREATED', 3, now() + interval '1 day', 'Approved pilot point change')$$,
  'admin can create a prospective draft point rule'
);
select lives_ok(
  $$select public.activate_point_rule(
    (select id from public.point_rules where organization_id = '10000000-0000-0000-0000-000000000001' and event_type = 'LEAD_CREATED' and status = 'DRAFT'),
    'Approved after sales review'
  )$$,
  'admin can activate a reviewed draft point rule'
);
select lives_ok(
  $$select public.upsert_performance_badge('QUALITY_STAR', 'Quality Star', 'Earn fifty monthly performance points.', 50, true)$$,
  'admin can create a badge definition'
);
select lives_ok(
  $$select public.create_point_adjustment('20000000-0000-0000-0000-000000000001', 5, 'Approved source correction', 'OPS-42', now(), '90000000-0000-0000-0000-000000000002')$$,
  'admin can post a signed point adjustment'
);
select is(
  (select count(*) from public.performance_config_events),
  3::bigint,
  'rule and badge configuration writes an audit trail'
);
select is(
  (select points from public.get_points_leaderboard(current_date - 30, current_date, 100) where employee_id = '20000000-0000-0000-0000-000000000001'),
  35::bigint,
  'leaderboard combines immutable source events with adjustments'
);
select is(
  (select count(*) from public.employee_badges where employee_id = '20000000-0000-0000-0000-000000000001'),
  1::bigint,
  'later configuration and adjustment do not duplicate an earned badge'
);
reset role;

-- Other tenant remains isolated after privileged actions in Org One.
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000004', true);
select is((select count(*) from public.field_visits), 1::bigint, 'other tenant sees only its visit');
select is((select count(*) from public.field_collections), 1::bigint, 'other tenant sees only its collection');
select is((select count(*) from public.field_visit_reviews), 0::bigint, 'other tenant cannot see Org One review');
select is((select count(*) from public.performance_coaching_actions), 0::bigint, 'other tenant cannot see Org One coaching actions');
select is((select count(*) from public.get_points_leaderboard(current_date - 30, current_date, 100) where employee_id <> '20000000-0000-0000-0000-000000000004'), 0::bigint, 'leaderboard does not leak another tenant');
select throws_ok(
  $$select public.get_employee_performance_history('20000000-0000-0000-0000-000000000001', 12)$$,
  'P0001', 'employee not found', 'performance history does not leak another tenant'
);
reset role;

select * from finish();
rollback;
