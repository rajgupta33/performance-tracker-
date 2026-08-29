-- Run only against the disposable staging project used for performance tests.
-- Usage: psql "$STAGING_DATABASE_URL" -v confirmation=DELETE_K6_TAGGED_STAGING_LEADS -f performance/cleanup-tagged-leads.sql

select :'confirmation' = 'DELETE_K6_TAGGED_STAGING_LEADS' as confirmed \gset
\if :confirmed
\else
  \echo 'Refusing cleanup: confirmation phrase is missing or incorrect.'
  \quit
\endif

begin;

select count(*) as tagged_leads_to_delete
from public.crm_leads
where prospect_name like 'K6-PERF-%'
  and source = 'OTHER'
  and products @> array['LOAD_TEST']::text[];

delete from public.crm_leads
where prospect_name like 'K6-PERF-%'
  and source = 'OTHER'
  and products @> array['LOAD_TEST']::text[];

commit;
