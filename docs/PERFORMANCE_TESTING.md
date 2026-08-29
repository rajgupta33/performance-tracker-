# Performance testing (50–200 concurrent users)

This runbook validates authenticated Fieldforce API behavior under 50, 100, and 200 concurrent virtual users. It is intentionally staging-only. Never point it at production.

## What the workload covers

Each virtual user owns a distinct staging account and signs in through Supabase Auth. Iterations reproduce the main mobile read mix:

- approved customers: 35%
- recent field visits: 25%
- CRM leads: 25%
- personal points summary RPC: 15%

The default `load` profile ramps to 50, 100, and 200 VUs, holds each level for five minutes, then ramps down. Users pause for one to three seconds between actions. Optional mixed mode creates no more than one tagged lead per VU.

Project acceptance targets are encoded as k6 thresholds:

- HTTP failure rate below 1%
- overall p95 below 1.2 seconds and p99 below 2.5 seconds
- customers p95 below 900 ms
- visits and leads p95 below 1.2 seconds
- points RPC p95 below 1 second
- business checks above 99%; zero authentication failures

These are release gates for this project, not claims about universal platform performance.

## Prerequisites

1. Install k6 and confirm `k6 version` works.
2. Use a dedicated staging Supabase project with migrations matching the release candidate and representative data volume.
3. Provision 200 active, organization-linked staging users. Include the intended role distribution (for example 180 employees, 15 managers, and 5 admins). Do not reuse human or production credentials.
4. Copy `performance/accounts.example.json` to `performance/accounts.json` and populate it. The real file is gitignored. Account order maps one-to-one to VU IDs.
5. Record both staging and production project refs. The harness rejects a staging/production ref match and requires the URL host to exactly match the declared staging ref.
6. Confirm the staging Auth rate limits and database capacity are appropriate for this planned test window. Notify anyone sharing staging.

## PowerShell execution

Set secrets only in the current shell; do not add them to tracked files:

```powershell
$env:SUPABASE_URL = 'https://YOUR_STAGING_REF.supabase.co'
$env:SUPABASE_PUBLISHABLE_KEY = 'YOUR_STAGING_PUBLISHABLE_KEY'
$env:STAGING_PROJECT_REF = 'YOUR_STAGING_REF'
$env:PRODUCTION_PROJECT_REF = 'YOUR_PRODUCTION_REF'
$env:LOAD_TEST_CONFIRMATION = 'STAGING_LOAD_TEST_APPROVED'
$env:ACCOUNTS_FILE = './accounts.json'
$env:PROFILE = 'smoke'
npm run test:performance
```

The accounts path is resolved relative to `performance/fieldforce.k6.js`. Run the two-user smoke profile first. Confirm correct RLS-visible data, no 401/403 responses, and a passing summary before running the full profile:

```powershell
$env:PROFILE = 'load'
npm run test:performance
```

JSON summaries are written under `artifacts/performance/`, which is gitignored. Preserve the release-candidate summary in the approved operational evidence store with the commit SHA, migration version, staging project ref, start/end time, data volumes, and observer name.

## Optional mixed read/write run

Mixed mode adds up to 200 synthetic leads tagged by all of these markers: `K6-PERF-` name prefix, `OTHER` source, and `LOAD_TEST` product. Use only when write-path evidence is required.

```powershell
$env:WRITE_MODE = 'true'
$env:WRITE_CONFIRMATION = 'CREATE_TAGGED_STAGING_LEADS'
npm run test:performance
```

Review the tagged rows first, then remove only those rows with the guarded cleanup script:

```powershell
psql $env:STAGING_DATABASE_URL -v confirmation=DELETE_K6_TAGGED_STAGING_LEADS -f performance/cleanup-tagged-leads.sql
```

The lead foreign keys cascade to its synthetic follow-up/activity rows. The script does not match ordinary records unless all three test markers are present.

## Release decision

Pass only when all thresholds succeed at 200 VUs and application/database monitoring shows no sustained saturation, lock buildup, connection exhaustion, or cross-organization data exposure. Any threshold breach requires an owner, diagnosis, corrective change, and a clean rerun; do not average a failed run with later results.

Grafana documents `ramping-vus` as a variable-concurrency executor and thresholds as test pass/fail criteria. Supabase Auth JWTs authorize REST requests through RLS, which is why this harness uses distinct user sessions instead of a service-role key.
