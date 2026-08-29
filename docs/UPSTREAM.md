# Upstream baseline

- Source: `https://github.com/mimnets/OpenHRApp.git`
- License: MIT (preserved in the repository root)
- Pinned baseline commit: `03e2553adad6577d1140d3f8321fe872f96408ab`
- Baseline date: 2026-08-26
- Integration branch: `feat/vardhnam-foundation`

## Baseline verification

`npm ci` completed from the committed lockfile with 566 packages installed. npm reported two high-severity audit findings; no automatic or forced dependency rewrite was applied during baseline verification.

`npm run build` passed. Vite reported a large main bundle (approximately 1.04 MB minified) and the static generators reported missing Supabase environment variables, as expected in an unconfigured local checkout.

The untouched `npm run test:run` result was 305 passing and 34 failing tests, plus one failed suite. The failures were traced to:

1. `daylightTokens.test.ts` matching LF-only source text in a Windows CRLF checkout.
2. `adPolicyGates.test.ts` importing a Supabase client before inert test environment variables were defined.

The foundation branch normalizes line endings in the test reader and supplies non-network test values. These are baseline portability fixes, not product behavior changes.

## Upstream sync policy

Review upstream changes on a dedicated `chore/upstream-sync` branch. Never merge upstream directly into production. Preserve this SHA as the audit point for the original fork and record each later sync here.
