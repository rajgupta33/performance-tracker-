# Module reuse matrix

| Upstream area | Decision | Phase-1 treatment |
| --- | --- | --- |
| Supabase Auth and profiles | Keep | Preserve user IDs and session behavior; tighten roles and RLS incrementally. |
| Attendance, GPS and selfie flow | Keep and harden | Do not change until device baseline is proven; add accuracy, confidence, exceptions and idempotency later. |
| PWA shell and service worker | Keep and test | Retain installability; add explicit IndexedDB business-action queue. |
| Organization isolation | Keep and simplify | Retain `organization_id`; remove public SaaS commercialization paths. |
| Notifications and attendance cron | Keep selectively | Deploy only field-operational functions. |
| Leave and holidays | Defer | Not part of the field execution MVP; keep isolated until business confirms removal. |
| Performance reviews | Replace | Replace formal HR review cycles with targets and calculated field scorecards. |
| Trial, subscription, ads, donations and showcase | Remove | Internal Vardhnam deployment does not need commercialization surfaces. |
| Super-admin multi-tenant surfaces | Simplify | Retain only operational organization administration if required. |
| Atomic CRM patterns | Selective port | Reuse task, activity and Kanban concepts without merging its application shell or auth model. |

Feature flags in `src/config/features.ts` keep unfinished field modules inaccessible while schema, RLS, offline behavior and device acceptance are incomplete.
