# Collections rollout

Field collections are implemented behind `VITE_FEATURE_COLLECTIONS`.

## Enable in an environment

1. Apply Supabase migrations through `0028_collections.sql`.
2. Confirm active, approved customers exist.
3. Set `VITE_FEATURE_COLLECTIONS=true`.
4. Rebuild and deploy the PWA.

## Status model

`SUBMITTED -> VERIFIED -> RECONCILED`

Managers may reject a submitted or verified collection with a mandatory reason. Employees can see their own records; managers, HR, and admins can see the organization review queue.

Field-reported amounts are deliberately shown separately from reconciled amounts. Reconciliation means the record has been checked against the accounting, receivable, or bank source—not merely accepted by the field manager.

## Controls

- Server-generated submission time and captured device time are stored separately.
- GPS coordinates and accuracy are required.
- Non-cash modes require a payment reference.
- Client event IDs make retries idempotent.
- Same customer, amount, day, and normalized reference are flagged as possible duplicates.
- Every status transition is appended to `collection_activities`.
- The schema reserves a private `proof_path`; proof capture remains disabled until the retention and acceptable-evidence policy is approved.

## Acceptance checks

- Submit on each payment mode and confirm references are required except for cash.
- Retry with the same event ID and confirm only one row exists.
- Submit matching collection details twice and confirm the second row is flagged.
- Confirm employees cannot view or review another employee's records.
- Confirm reconciliation cannot bypass verification.
- Confirm rejection requires a reason and terminal records cannot transition again.
