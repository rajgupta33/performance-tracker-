# Field Force management BI

The management dashboard is implemented behind `VITE_FEATURE_FIELD_BI` and requires migration `0031_field_force_bi.sql`.

## Audience and purpose

The default view is designed for managers, HR, and administrators conducting an operating review. It answers three questions:

1. Are field outcomes progressing?
2. Are verification and reconciliation controls healthy?
3. Which exceptions need action now?

Employees cannot call the dashboard RPCs or open the route.

## Metric definitions

| Metric | Definition and source |
| --- | --- |
| Attendance reliability | Present or remote attendance rows divided by attendance rows in the selected period |
| Verified visits | Completed visits with `location_status = VERIFIED` divided by completed visits |
| Open pipeline | Current amount of non-terminal CRM deals; this is a point-in-time metric |
| Won value | Amount of deals won during the selected period; provisional until invoice integration |
| Collection reconciliation | Reconciled amount divided by non-rejected field-reported amount in the period |
| Target coverage | Employees with an overlapping active direct target divided by organization employees |

The exception queue combines absent/late/half-day attendance, weak or outside visit verification, overdue follow-ups, possible duplicate collections, and submissions awaiting review for more than two days.

## Filters and freshness

- Date filters apply to period metrics and bounded exceptions.
- Current active leads, overdue follow-ups, open pipeline, and pending collection counts are intentionally point-in-time operational metrics.
- The dashboard displays its query timestamp. Refresh performs a live RPC query against Supabase.
- Reporting windows are limited to 367 days to constrain operational query cost.

## Enable

```env
VITE_FEATURE_FIELD_BI=true
```

Apply migrations through `0031`, rebuild, and confirm manager-only access before enabling in production.
