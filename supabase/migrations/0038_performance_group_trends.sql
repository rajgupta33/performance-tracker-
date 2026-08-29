-- Calendar-month team/territory trends, backed by the group scorecard RPC.

create or replace function public.get_performance_group_trend(
  p_group_type text,
  p_group_id uuid,
  p_end_month date default current_date,
  p_months integer default 12
)
returns table (
  month_start date,
  month_end date,
  eligible_employees bigint,
  targeted_employees bigint,
  coverage_pct numeric,
  average_score numeric,
  achieved_count bigint,
  needs_attention_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org_id uuid := public.auth_org_id();
  v_role text := public.auth_role();
  v_group_type text := upper(coalesce(p_group_type, ''));
  v_months integer := greatest(2, least(coalesce(p_months, 12), 24));
  v_base_month date := date_trunc('month', coalesce(p_end_month, current_date))::date;
  v_month_start date;
  v_month_end date;
  v_offset integer;
  v_allowed boolean := false;
begin
  if auth.uid() is null or v_org_id is null then raise exception 'authenticated organization member required'; end if;
  if not (public.is_super_admin() or v_role in ('ADMIN','HR','MANAGER')) then raise exception 'manager access required'; end if;
  if v_group_type not in ('TEAM','TERRITORY') or p_group_id is null then raise exception 'valid group is required'; end if;

  if v_group_type = 'TEAM' then
    select exists (
      select 1 from public.teams t left join public.profiles p on p.id = auth.uid()
      where t.id = p_group_id and t.organization_id = v_org_id
        and (v_role in ('ADMIN','HR') or public.is_super_admin() or t.leader_id = auth.uid() or t.id = p.team_id)
    ) into v_allowed;
  else
    select exists (
      select 1 from public.territories t left join public.profiles p on p.id = auth.uid()
      where t.id = p_group_id and t.organization_id = v_org_id and t.active
        and (v_role in ('ADMIN','HR') or public.is_super_admin() or t.manager_id = auth.uid() or t.id = p.territory_id)
    ) into v_allowed;
  end if;
  if not v_allowed then raise exception 'group not found'; end if;

  for v_offset in reverse (v_months - 1)..0 loop
    v_month_start := (v_base_month - make_interval(months => v_offset))::date;
    v_month_end := (v_month_start + interval '1 month - 1 day')::date;
    return query
    select v_month_start, v_month_end, s.eligible_employees, s.targeted_employees,
      s.coverage_pct, s.average_score, s.achieved_count, s.needs_attention_count
    from public.get_performance_group_scorecards(v_month_start, v_month_end, v_group_type) s
    where s.group_id = p_group_id;
  end loop;
end;
$$;

revoke all on function public.get_performance_group_trend(text, uuid, date, integer) from public;
grant execute on function public.get_performance_group_trend(text, uuid, date, integer) to authenticated;
