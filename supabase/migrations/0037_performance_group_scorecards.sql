-- Team and territory performance scorecards using the outcome-only score model.

create or replace function public.calculate_outcome_performance_scores(
  p_period_start date,
  p_period_end date
)
returns table (employee_id uuid, outcome_score numeric)
language sql
stable
security definer
set search_path = public
as $$
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
    where t.organization_id = public.auth_org_id()
      and t.assignee_type = 'EMPLOYEE'
      and t.status in ('ACTIVE','CLOSED')
      and t.period_start <= p_period_end
      and t.period_end >= p_period_start
  ), selected_targets as (
    select t.* from ranked_targets t where t.selection_rank = 1
  ), metric_values as (
    select t.employee_id, m.weight, m.target_value,
      case m.metric_key
        when 'sales_amount' then coalesce((select sum(d.amount) from public.crm_deals d where d.owner_id = t.employee_id and d.stage = 'WON' and d.won_at::date between p_period_start and p_period_end), 0)
        when 'collection_amount' then coalesce((select sum(c.amount) from public.field_collections c where c.employee_id = t.employee_id and c.status = 'RECONCILED' and c.reconciled_at::date between p_period_start and p_period_end), 0)
        when 'productive_visits' then (select count(*)::numeric from public.field_visits v where v.employee_id = t.employee_id and v.status = 'COMPLETED' and nullif(trim(v.outcome), '') is not null and v.completed_at::date between p_period_start and p_period_end)
        when 'new_dealers' then (select count(*)::numeric from public.customers c where c.registered_by = t.employee_id and c.approval_status = 'APPROVED' and c.created::date between p_period_start and p_period_end)
        when 'lead_conversion' then coalesce((select round(100.0 * count(*) filter (where l.stage = 'WON') / nullif(count(*), 0), 2) from public.crm_leads l where l.owner_id = t.employee_id and l.created::date between p_period_start and p_period_end), 0)
        else 0
      end::numeric actual_value
    from selected_targets t
    join public.performance_target_metrics m on m.target_id = t.id
    where m.metric_key <> 'attendance_discipline'
  )
  select m.employee_id,
    round(sum(m.weight * least(120, 100 * m.actual_value / m.target_value)) / nullif(sum(m.weight), 0), 2)
  from metric_values m
  group by m.employee_id;
$$;

create or replace function public.get_performance_group_scorecards(
  p_period_start date,
  p_period_end date,
  p_group_type text default 'TEAM'
)
returns table (
  group_type text,
  group_id uuid,
  group_name text,
  eligible_employees bigint,
  targeted_employees bigint,
  coverage_pct numeric,
  average_score numeric,
  achieved_count bigint,
  needs_attention_count bigint,
  top_employee_id uuid,
  top_employee_name text,
  top_employee_score numeric,
  attention_employee_names text[]
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org_id uuid := public.auth_org_id();
  v_group_type text := upper(coalesce(p_group_type, 'TEAM'));
  v_role text := public.auth_role();
  v_team_id uuid;
  v_territory_id uuid;
begin
  if auth.uid() is null or v_org_id is null then raise exception 'authenticated organization member required'; end if;
  if not (public.is_super_admin() or v_role in ('ADMIN','HR','MANAGER')) then raise exception 'manager access required'; end if;
  if p_period_start is null or p_period_end is null or p_period_end < p_period_start then
    raise exception 'valid scorecard period is required';
  end if;
  if p_period_end - p_period_start > 366 then raise exception 'scorecard period cannot exceed 367 days'; end if;
  if v_group_type not in ('TEAM','TERRITORY') then raise exception 'group type must be TEAM or TERRITORY'; end if;

  select p.team_id, p.territory_id into v_team_id, v_territory_id
  from public.profiles p where p.id = auth.uid() and p.organization_id = v_org_id;

  return query
  with groups as (
    select 'TEAM'::text kind, t.id, t.name
    from public.teams t
    where v_group_type = 'TEAM' and t.organization_id = v_org_id
      and (v_role in ('ADMIN','HR') or public.is_super_admin() or t.leader_id = auth.uid() or t.id = v_team_id)
    union all
    select 'TERRITORY'::text, t.id, t.name
    from public.territories t
    where v_group_type = 'TERRITORY' and t.organization_id = v_org_id and t.active
      and (v_role in ('ADMIN','HR') or public.is_super_admin() or t.manager_id = auth.uid() or t.id = v_territory_id)
  ), members as (
    select g.kind, g.id group_id, g.name group_name, p.id employee_id,
      coalesce(p.name, p.employee_id, 'Unnamed employee') employee_name
    from groups g
    join public.profiles p on p.organization_id = v_org_id
      and p.role in ('EMPLOYEE','MANAGER')
      and ((g.kind = 'TEAM' and p.team_id = g.id) or (g.kind = 'TERRITORY' and p.territory_id = g.id))
  ), scores as (
    select * from public.calculate_outcome_performance_scores(p_period_start, p_period_end)
  ), rollup as (
    select m.kind, m.group_id, min(m.group_name) group_name,
      count(*) eligible_employees,
      count(s.employee_id) targeted_employees,
      round(100.0 * count(s.employee_id) / nullif(count(*), 0), 2) coverage_pct,
      coalesce(round(avg(s.outcome_score), 2), 0) average_score,
      count(*) filter (where s.outcome_score >= 100) achieved_count,
      count(*) filter (where s.outcome_score < 60) needs_attention_count
    from members m left join scores s on s.employee_id = m.employee_id
    group by m.kind, m.group_id
  )
  select r.kind, r.group_id, r.group_name, r.eligible_employees, r.targeted_employees,
    r.coverage_pct, r.average_score, r.achieved_count, r.needs_attention_count,
    top_row.employee_id, top_row.employee_name, top_row.outcome_score,
    coalesce(attention.names, '{}')
  from rollup r
  left join lateral (
    select m.employee_id, m.employee_name, s.outcome_score
    from members m join scores s on s.employee_id = m.employee_id
    where m.group_id = r.group_id and m.kind = r.kind
    order by s.outcome_score desc, m.employee_name
    limit 1
  ) top_row on true
  left join lateral (
    select array_agg(a.employee_name order by a.outcome_score, a.employee_name) names
    from (
      select m.employee_name, s.outcome_score
      from members m join scores s on s.employee_id = m.employee_id
      where m.group_id = r.group_id and m.kind = r.kind and s.outcome_score < 60
      order by s.outcome_score, m.employee_name
      limit 3
    ) a
  ) attention on true
  order by r.average_score desc, r.group_name;
end;
$$;

revoke all on function public.calculate_outcome_performance_scores(date, date) from public;
revoke all on function public.calculate_outcome_performance_scores(date, date) from authenticated;
revoke all on function public.get_performance_group_scorecards(date, date, text) from public;
grant execute on function public.get_performance_group_scorecards(date, date, text) to authenticated;
