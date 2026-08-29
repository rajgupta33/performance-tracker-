# Offline chaos and device testing

The automated outbox tests cover persistence, offline no-op behavior, FIFO ordering, concurrent-drain coalescing, retry backoff, deterministic dead-lettering, explicit discard, and per-user device isolation.

Run them with the regular suite:

```bash
npm run test:run
```

The Sync Center is behind `VITE_FEATURE_SYNC_CENTER`. It exposes pending, in-flight, and failed visit actions stored in IndexedDB, supports ordered retry after reconnect, and permits explicit deletion only for failed actions.

## Staging device matrix

Automated browser tests do not replace the following real-device checks:

| Device/browser | Required scenarios |
| --- | --- |
| Current Android Chrome, installed PWA | Start offline, complete offline with camera evidence, kill/relaunch, reconnect, verify exactly-once ordered sync |
| Current iOS Safari and home-screen PWA | Repeat offline visit flow, camera permission denial/recovery, low-storage behavior, app suspension during upload |
| Android Chrome with constrained network | 2G/high latency, request timeout, server 503, retry backoff, no duplicate visit or evidence |
| Both platforms | Sign out with queued work, sign in as another employee, confirm queues remain isolated and undisclosed |
| Both platforms | Deploy a new service worker while actions are pending; confirm update does not erase IndexedDB |

## Chaos sequence

1. Confirm the test account and customer belong to the staging organization.
2. Disable connectivity before starting a visit.
3. Start and complete the visit, including live evidence.
4. Force-close the PWA and relaunch while still offline.
5. Confirm two ordered actions appear in Sync Center.
6. Restore connectivity, interrupt it during the first retry, then restore it again.
7. Confirm START synchronizes before COMPLETE and only one server visit exists.
8. Confirm the evidence object path is referenced once and no orphan object remains.
9. Capture screenshots, device/browser versions, timestamps, and database IDs in the release evidence bundle.

Only customer visits are currently certified for offline transactional capture. Leads, deals, collections, and target changes must remain online-only until they gain their own idempotent outbox commands and chaos coverage.
