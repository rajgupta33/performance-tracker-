# CRM deals rollout

The deal pipeline is implemented behind `VITE_FEATURE_DEALS` and depends on the lead CRM foundation.

## Enable in an environment

1. Apply Supabase migrations through `0027_crm_deals.sql`.
2. Set both `VITE_FEATURE_LEADS=true` and `VITE_FEATURE_DEALS=true`.
3. Rebuild and deploy the PWA.

## Business rules

- A deal can be created only from a lead in `INTERESTED`, `NEGOTIATION`, or `WON`.
- V1 permits one active deal per lead; terminal deals retain their audit history.
- Employee stage flow is `OPEN -> PROPOSAL -> NEGOTIATION -> WON`, with `LOST` available from every active stage.
- Both won and lost deals require a reason. Managers may correct or reopen a stage through the audited RPC.
- Winning a deal also marks its source lead won. Deal value remains a forecast until external order or invoice reconciliation exists.
- Deal creation and every stage change are appended to `crm_deal_activities`.

## Acceptance checks

- Confirm an employee cannot create or update a deal belonging to another employee.
- Retry deal creation with the same idempotency key and confirm only one row exists.
- Confirm a second active deal for the same lead is rejected.
- Confirm invalid stage skips and terminal changes by employees are rejected server-side.
- Confirm won/lost cannot be saved without a reason.
- Confirm the source lead becomes `WON` when its deal is won.
