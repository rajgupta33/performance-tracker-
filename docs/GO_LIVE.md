# Go-Live Checklist

Status as of 2026-09-01, branch `feat/vardhnam-foundation`.

## Current state

| Area | State |
|---|---|
| Typecheck (`npm run typecheck`) | clean |
| Frontend tests (`npm run test:run`) | 446/446 across 48 files |
| Database tests (`npm run test:rls`) | 95/95 across 5 suites |
| CI | `.github/workflows/ci.yml`, green |
| Edge Functions | all 24 deployed, ACTIVE |
| Migrations applied to production | 0001–0041 |
| Migrations NOT yet applied | **0042, 0043, 0044, 0045, 0046** |
| Production data | effectively empty — 1 org, 3 profiles, **0 attendance rows** |

## 1. Push the outstanding migrations

```bash
npx supabase db push --linked
```

Confirm the dry run lists exactly 0042–0046 first (`--dry-run`).

These are additive: new nullable columns on `attendance`, two new tables
(`attendance_correction_requests`, `attendance_payroll_locks` +
its events table), new functions and triggers. The unique constraints are on
nullable columns, and Postgres treats NULLs as distinct, so existing rows
cannot collide.

### Ordering hazard — currently moot, but it will matter later

Migration 0042 replaces the `attendance_insert` RLS policy so employees can no
longer INSERT attendance directly; they must call `submit_attendance_check_in`.
That means the migrations and the frontend deploy are coupled:

- migrations without the new frontend → old clients INSERT directly, get rejected
- new frontend without the migrations → the RPC does not exist

**Right now this does not bite**, because `public.attendance` has zero rows and
there is no field force in the system. Push and deploy in either order.

Once real users exist, this coupling returns with an extra wrinkle:
`vite.config.ts` sets `registerType: 'prompt'`, so `useServiceWorker.ts` polls
every 60s but only shows a banner — a worker who ignores it keeps running the
old bundle, and their next punch fails. For any future change that tightens an
RLS policy the app depends on, either deploy outside punch hours, or split the
tightening into a follow-up migration applied after clients have updated.

## 2. Deploy the frontend

Vercel, per `vercel.json`. Ensure `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` are set in the deploy environment — they are not
read from `.env` at build time on CI.

## 3. Set organization config before the first punch

`DEFAULT_CONFIG` in `src/constants.tsx` is inherited from upstream OpenHR and is
wrong for an Indian deployment:

- `timezone: "UTC"` → **Asia/Kolkata**
- `currency: "USD"` → INR
- `companyName: "OpenHRApp Solutions Ltd."`
- `workingDays` excludes Friday/Saturday and includes Sunday (a Bangladesh week)

Timezone is not cosmetic. Attendance work-date rollover and
`advance_attendance_payroll_lock` both derive "today" from the org timezone and
fall back to UTC. Left at UTC, punches between 00:00 and 05:30 IST are filed to
the previous day.

These are per-org settings in the database, so this is a setup step, not a code
change — but it must happen before real attendance is recorded.

## Outstanding, not blocking

- **Public marketing pages still carry upstream copy.** The landing page, blog,
  features, about, pricing, tutorials and legal pages still describe
  "OpenHRApp ... a free, open-source HR management platform". Registration is
  staying open, so these are a real storefront and need a copywriting pass, not
  a find-and-replace. ~23 files.

  Done already: the authenticated app and everything it emits — PDF/CSV export
  footers and filenames, the attendance summary emails, the five superadmin
  bulk-email templates, the push broadcast preview — now route through
  `APP_NAME` / `APP_FILE_PREFIX` in `src/constants.tsx`.

- **SEO points at the wrong domain.** `robots.txt`, canonical tags, `og:url`,
  `feed.xml`, `llms.txt`, `sitemap.xml` and `SITE_URL` in
  `scripts/generate-sitemap.mjs` all hardcode `https://openhrapp.com`.
- **Post-build generators silently no-op.** `npm run build` chains
  `generate-sitemap` / `generate-feed` / `generate-llms`; all three read
  `process.env`, which Node does not populate from `.env`, so they print a
  warning and `exit(0)`. The files in `dist/` are stale copies from `public/`.
- **Bundle size.** Main chunk 1,064 kB (298 kB gzip); `PerformanceGroupTrend`
  398 kB. Worth `manualChunks` / lazy-loading recharts for field staff on mobile
  data.
- **Feature flags.** `.env` enables VISITS, LEADS, DEALS, COLLECTIONS and
  TARGET_PERFORMANCE; `.env.example` says to keep these off until offline and
  device acceptance testing is done. Confirm that testing happened.
- **`.nvmrc` says 22.11.0**, local dev is on 22.12.0. Pin the deploy runtime.
- **`superadmin.service.ts:432`** — org user emails render empty because email
  lives in `auth.users`, not `profiles`.

- **`src/pages/Setup.tsx` is now the misconfiguration screen.** It previously
  rendered a PocketBase connection form that let visitors click past a missing
  backend; it now names the missing environment variables and offers no bypass.
  Covered by `Setup.test.tsx`.

## Still unverified — needs real hardware

Per the project's own pre-commit checklist:

- Camera and geolocation on real iOS Safari and Android Chrome, in PWA
  standalone mode
- Lighthouse PWA score > 90
- Frozen-module manual checks: a flaky network must NOT log the user out, a hard
  401 MUST, and a forgotten check-out must auto-close on next login
