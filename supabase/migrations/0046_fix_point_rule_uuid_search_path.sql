-- Fix: configure_point_rule() fails at runtime with
--   42883: function uuid_generate_v4() does not exist
--
-- The function is SECURITY DEFINER with `set search_path = public`, but
-- uuid-ossp is installed into the `extensions` schema. The database-level
-- search_path includes `extensions`, so the unqualified call resolves during
-- normal DDL, which is why migration 0039 applied cleanly and why the column
-- defaults still work (a column default is resolved to a function OID at DDL
-- time and never re-resolved). The call inside the function body IS re-resolved
-- on every execution, under the pinned search_path, where `extensions` is not
-- visible -- so creating a point rule has always failed in production.
--
-- Fixed by using gen_random_uuid(), which lives in pg_catalog and is therefore
-- always resolvable regardless of search_path. Body is otherwise byte-identical
-- to 0039.

create or replace function public.configure_point_rule(p_event_type text, p_points integer, p_effective_from timestamptz, p_change_note text)
returns public.point_rules language plpgsql security definer set search_path = public as $$
declare v_org_id uuid := public.auth_org_id(); v_rule public.point_rules;
begin
  if not (public.is_super_admin() or public.auth_role() in ('ADMIN','HR')) then raise exception 'admin or HR access required'; end if;
  if p_event_type not in ('LEAD_CREATED','PRODUCTIVE_VISIT','DEAL_WON','COLLECTION_RECONCILED','DEALER_ACTIVATED') or p_points not between 1 and 100 then raise exception 'valid event and points from 1 to 100 are required'; end if;
  if p_effective_from < now() then raise exception 'point rule changes cannot be backdated'; end if;
  if length(trim(coalesce(p_change_note, ''))) < 10 then raise exception 'change note must contain at least 10 characters'; end if;
  if exists (select 1 from public.point_rules r where r.organization_id = v_org_id and r.event_type = p_event_type and r.effective_from >= p_effective_from) then raise exception 'effective date must follow existing rule versions'; end if;
  insert into public.point_rules(organization_id,event_type,points,rule_version,status,effective_from,change_note,created_by)
  values(v_org_id,p_event_type,p_points,'v-' || to_char(p_effective_from,'YYYYMMDDHH24MISS') || '-' || left(gen_random_uuid()::text,8),'DRAFT',p_effective_from,trim(p_change_note),auth.uid()) returning * into v_rule;
  insert into public.performance_config_events(organization_id,actor_id,entity_type,entity_id,action,metadata)
  values(v_org_id,auth.uid(),'POINT_RULE',v_rule.id,'DRAFT_CREATED',jsonb_build_object('event_type',p_event_type,'points',p_points,'effective_from',p_effective_from));
  return v_rule;
end;
$$;
