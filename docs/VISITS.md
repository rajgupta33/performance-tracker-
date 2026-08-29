# Customer visits rollout

The visit UI is implemented but deliberately disabled by default.

## Enable in an environment

1. Apply Supabase migrations through `0025_vardhnam_field_foundation.sql`.
2. Create approved, active customer rows with registered PostGIS locations.
3. Set `VITE_FEATURE_VISITS=true` for that deployment.
4. Rebuild and deploy the PWA.

Do not enable the flag before the migration is applied: the page queries `customers` and `field_visits` and calls the `start_field_visit` and `complete_field_visit` RPCs.

## Device acceptance

- Confirm location permission messaging on installed Android Chrome and iOS Safari.
- Start at distances inside 150 m, between 150–500 m, and beyond 500 m from a customer.
- Confirm accuracy above 250 m routes to `REVIEW` regardless of distance.
- Retry the same start request and confirm only one visit exists for the idempotency key.
- Refresh during an active visit and confirm the completion form is restored.
- Confirm completion is blocked until a live camera photo is captured.
- Deny camera permission and verify the device-camera fallback remains usable without exposing the gallery.
- Interrupt the network after evidence upload and confirm the unreferenced object is removed on retry/failure.
- Start and complete a visit while offline, restart the PWA, reconnect, and confirm START syncs before COMPLETE.
- Confirm a transient failure backs off and a business-rule failure enters the visible failed state.
- Confirm offline evidence is rejected after the per-user 100 MB safety ceiling.
- Confirm another employee cannot read, modify, or upload evidence for the visit.

The IndexedDB outbox stores ordered start/completion actions and compressed evidence blobs, retries automatically on reconnect, and preserves stable visit, event and evidence identifiers. The module remains behind its feature flag until this behavior is exercised on real Android and iOS devices against staging.
