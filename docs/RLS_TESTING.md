# RLS penetration testing

The executable pgTAP suite lives at `supabase/tests/rls_fieldforce.test.sql`. It exercises same-organization peer isolation, cross-tenant isolation, manager visibility, privileged RPC authorization, source-backed point visibility, BI access, and visit-review boundaries.

## Safety requirement

Run the suite only against the disposable local Supabase database created by the CLI. The test seeds fixed synthetic users and organizations inside a transaction and rolls everything back. Do not point test tooling at staging or production.

## Run

1. Install the Supabase CLI and Docker.
2. Start or reset the local stack so migrations through `0040` are applied.
3. Run:

```bash
npm run test:rls
```

The command delegates to `supabase test db`, which discovers SQL tests under `supabase/tests`.

## Required production-readiness evidence

- Preserve the full TAP output in the release evidence bundle.
- Record the migration SHA and Supabase CLI version.
- Treat any failed or skipped authorization assertion as release-blocking.
- Re-run after every RLS policy, security-definer function, storage policy, or role change.
- Keep service-role credentials out of the test process: these tests intentionally execute as `authenticated` users.

Storage-object penetration tests require the local Storage API and signed-in client sessions; they belong in the subsequent integration/chaos test layer rather than this database-only suite.
