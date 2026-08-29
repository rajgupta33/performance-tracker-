# Points, rules, and badges rollout

The source-backed point ledger is installed by `0030_point_events.sql`. Apply migrations through `0039_configurable_points_badges.sql` before enabling the target-performance module.

## Starter rules

| Event | Points | Eligibility |
| --- | ---: | --- |
| Lead created | 2 | Authenticated CRM lead creation |
| Productive visit | 10 | Completed, location-verified visit with an outcome |
| Deal won | 25 | Deal enters `WON` |
| Collection reconciled | 15 | Collection enters `RECONCILED` after verification |
| Dealer activated | 20 | Customer/dealer becomes approved |

The starter rules are seeded as active `v1` rules for every organization. Attendance exceptions, overdue work, rejected claims, and weak GPS never automatically subtract points.

Admin and HR users can create a future-dated draft rule and activate it with an approval note. Activation retires the preceding rule at the new rule's effective time. Source events always retain the points and rule version awarded at the time, so configuration changes never rewrite history.

## Monthly badges

New organizations receive three starter definitions: Field Starter at 25 points, Momentum at 75, and Champion at 150. Admin and HR users can create or update badge definitions. Each award stores both the employee's points and the threshold at award time.

Awards are immutable. Later negative adjustments, badge deactivation, or threshold changes do not revoke badges already earned. This is intentional audit behavior; a future revocation workflow should use a separate signed record rather than deleting an award.

## Manual adjustments

Admin and HR users can post a signed correction of `-100` to `+100` points for an employee. Every adjustment requires:

- a detailed reason of at least 10 characters;
- a ticket or approval reference of at least 3 characters;
- an event time no more than 90 days old and no more than five minutes in the future;
- a unique client event ID for retry safety.

Adjustments are stored separately from source-backed point events. Monthly totals and leaderboards combine both ledgers, while event history remains untouched.

## Integrity controls

- Every event references its source table and source UUID.
- The unique employee/event/source key prevents duplicate awards when requests or triggers retry.
- Users cannot insert or edit ledger rows directly.
- Historical eligible records are backfilled idempotently when the migration is applied.
- Leaderboards are scoped to the authenticated organization and default to the current month.
- The UI shows monthly points, number of contributing events, personal best, and a top-ten leaderboard.
- Employees can read their own awards and adjustments; managers can read their organization; rule history and mutation stay restricted to Admin/HR.
- Rule and badge changes write `performance_config_events` audit rows.

Run `npm run test:rls` against a disposable local Supabase stack before release. The pgTAP suite checks the privileged configuration boundary, immutable badge behavior, audit events, adjustment permissions, and tenant-isolated totals.
