-- Outcome-only performance tracker: fair target achievement leaderboards.
-- Attendance remains historical/readable but is not accepted in new targets.

create or replace function public.create_employee_performance_target(
  p_employee_id uuid,
  p_period_start date,
  p_period_end date,
  p_metrics jsonb
)
returns public.performance_targets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid := public.auth_org_id();
  v_target public.performance_targets;
  v_weight numeric;
begin
  if not (public.is_super_admin() or public.auth_role() in ('ADMIN','HR','MANAGER')) then
    raise exception 'manager access required';
  end if;
  if p_period_start is null or p_period_end is null or p_period_end < p_period_start then
    raise exception 'valid target period is required';
  end if;
  if p_period_end - p_period_start > 366 then
    raise exception 'target period cannot exceed 367 days';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.id = p_employee_id and p.organization_id = v_org_id and p.role <> 'SUPER_ADMIN'
  ) then
    raise exception 'employee not found';
  end if;
  if jsonb_typeof(p_metrics) <> 'array' or jsonb_array_length(p_metrics) = 0 then
    raise exception 'at least one target metric is required';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_metrics) item
    where item->>'metric_key' not in (
      'sales_amount','collection_amount','productive_visits','new_dealers','lead_conversion'
    )
  ) then
    raise exception 'only active outcome metrics are allowed';
  end if;
  if (
    select count(distinct item->>'metric_key') from jsonb_array_elements(p_metrics) item
  ) <> jsonb_array_length(p_metrics) then
    raise exception 'target metrics must be unique';
  end if;
  select sum((item->>'weight')::numeric) into v_weight from jsonb_array_elements(p_metrics) item;
  if v_weight <> 100 then raise exception 'target metric weights must total 100'; end if;

  insert into public.performance_targets(
    organization_id, assignee_type, employee_id, period_start, period_end, status, created_by
  ) values (
    v_org_id, 'EMPLOYEE', p_employee_id, p_period_start, p_period_end, 'ACTIVE', auth.uid()
  ) returning * into v_target;

  insert into public.performance_target_metrics(target_id, metric_key, target_value, weight, unit)
  select v_target.id, item->>'metric_key', (item->>'target_value')::numeric,
    (item->>'weight')::numeric, item->>'unit'
  from jsonb_array_elements(p_metrics) item;

  return v_target;
end;
$$;

create or replace function public.get_performance_leaderboard(
  p_period_start date,
  p_period_end date,
  p_metric text default 'SCORE',
  p_limit integer default 20
)
returns table (
  rank bigint,
  employee_id uuid,
  employee_name text,
  employee_code text,
  metric_value numeric,
  target_value numeric,
  achievement_pct numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org_id uuid := public.auth_org_id();
  v_metric text := upper(coalesce(p_metric, 'SCORE'));
begin
  if auth.uid() is null or v_org_id is null then raise exception 'authenticated organization member required'; end if;
  if p_period_start is null or p_period_end is null or p_period_end < p_period_start then
    raise exception 'valid leaderboard period is required';
  end if;
  if p_period_end - p_period_start > 366 then raise exception 'leaderboard period cannot exceed 367 days'; end if;
  if v_metric not in ('SCORE','SALES_AMOUNT','COLLECTION_AMOUNT','PRODUCTIVE_VISITS','NEW_DEALERS','LEAD_CONVERSION') then
    raise exception 'invalid leaderboard metric';
  end if;

  return query
  with ranked_targets as (
    select t.*,
      row_number() over (
        partition by t.employee_id
        order by
          (t.period_start = p_period_start and t.period_end = p_period_end) desc,
          (t.status = 'ACTIVE') desc,
          t.period_end desc,
          t.created desc
      ) selection_rank
    from public.performance_targets t
    where t.organization_id = v_org_id
      and t.assignee_type = 'EMPLOYEE'
      and t.status in ('ACTIVE','CLOSED')
      and t.period_start <= p_period_end
      and t.period_end >= p_period_start
  ), selected_targets as (
    select t.* from ranked_targets t where t.selection_rank = 1
  ), facts as (
    select p.id employee_id,
      coalesce(p.name, p.employee_id, 'Unnamed employee') employee_name,
      p.employee_id employee_code,
      coalesce((select sum(d.amount) from public.crm_deals d
        where d.owner_id = p.id and d.stage = 'WON' and d.won_at::date between p_period_start and p_period_end), 0)::numeric sales_amount,
      coalesce((select sum(c.amount) from public.field_collections c
        where c.employee_id = p.id and c.status = 'RECONCILED' and c.reconciled_at::date between p_period_start and p_period_end), 0)::numeric collection_amount,
      (select count(*) from public.field_visits v
        where v.employee_id = p.id and v.status = 'COMPLETED' and nullif(trim(v.outcome), '') is not null
          and v.completed_at::date between p_period_start and p_period_end)::numeric productive_visits,
      (select count(*) from public.customers c
        where c.registered_by = p.id and c.approval_status = 'APPROVED'
          and c.created::date between p_period_start and p_period_end)::numeric new_dealers,
      coalesce((select round(100.0 * count(*) filter (where l.stage = 'WON') / nullif(count(*), 0), 2)
        from public.crm_leads l where l.owner_id = p.id and l.created::date between p_period_start and p_period_end), 0)::numeric lead_conversion
    from public.profiles p
    join selected_targets t on t.employee_id = p.id
    where p.organization_id = v_org_id
  ), metric_values as (
    select f.employee_id, f.employee_name, f.employee_code, m.metric_key, m.target_value, m.weight,
      case m.metric_key
        when 'sales_amount' then f.sales_amount
        when 'collection_amount' then f.collection_amount
        when 'productive_visits' then f.productive_visits
        when 'new_dealers' then f.new_dealers
        when 'lead_conversion' then f.lead_conversion
        else 0
      end::numeric metric_value
    from facts f
    join selected_targets t on t.employee_id = f.employee_id
    join public.performance_target_metrics m on m.target_id = t.id
    where m.metric_key <> 'attendance_discipline'
  ), score_rows as (
    select m.employee_id, min(m.employee_name) employee_name, min(m.employee_code) employee_code,
      round(sum(m.weight * least(120, 100 * m.metric_value / m.target_value)) / nullif(sum(m.weight), 0), 2) score
    from metric_values m
    group by m.employee_id
  ), selected_metric as (
    select s.employee_id, s.employee_name, s.employee_code,
      s.score metric_value, 100::numeric target_value, s.score achievement_pct
    from score_rows s where v_metric = 'SCORE'
    union all
    select m.employee_id, m.employee_name, m.employee_code,
      m.metric_value, m.target_value, round(100 * m.metric_value / m.target_value, 2)
    from metric_values m where upper(m.metric_key) = v_metric
  )
  select rank() over (order by s.achievement_pct desc, s.metric_value desc, s.employee_name),
    s.employee_id, s.employee_name, s.employee_code,
    s.metric_value, s.target_value, s.achievement_pct
  from selected_metric s
  order by s.achievement_pct desc, s.metric_value desc, s.employee_name
  limit greatest(1, least(coalesce(p_limit, 20), 100));
end;
$$;

revoke all on function public.get_performance_leaderboard(date, date, text, integer) from public;
grant execute on function public.get_performance_leaderboard(date, date, text, integer) to authenticated;
