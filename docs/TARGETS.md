# Targets and performance rollout

Weighted employee targets are implemented behind `VITE_FEATURE_TARGET_PERFORMANCE`.

## Enable in an environment

1. Apply Supabase migrations through `0040_performance_coaching_actions.sql`.
2. Enable the source modules used by the scorecard and confirm their data is populated.
3. Set `VITE_FEATURE_TARGET_PERFORMANCE=true`.
4. Rebuild and deploy the PWA.

## Active outcome score model

| Metric | Weight | Current actual source |
| --- | ---: | --- |
| Won deal value | 40% | Won CRM deals by `won_at` date |
| Reconciled collections | 25% | Reconciled field collections by `reconciled_at` date |
| Productive visits | 15% | Completed visits with an outcome |
| New dealers | 10% | Approved customers registered by the employee |
| Lead conversion | 10% | Won leads divided by leads created in the period |

Attendance is paused as a performance input. Migration `0034` prevents attendance from being assigned to new targets. Historical targets containing attendance remain readable for audit continuity and are not rewritten.

Each metric contribution is capped at 120%, so one over-performing metric cannot hide every gap. The UI identifies the lowest-achieving metric as the next improvement focus.

Won deal value is still a provisional sales source. Replace it with reconciled invoice/order data when that integration becomes available.

## Access and validation

- Employees can read their applicable employee, team, or territory target.
- Managers, HR, and admins can inspect employees and activate employee targets.
- Metric weights must total exactly 100 server-side.
- Target values must be positive and periods must be valid.
- The performance RPC calculates actuals on the server and prevents employees querying another employee.
- Existing employee targets for the same exact period are rejected rather than silently overwritten.

## Performance leaderboards

The tracker provides overall score, sales, collections, productive visits, new dealers, and lead-conversion rankings for a selected period. Every ranking is ordered by target achievement percentage first, then actual value, so employees with different territory sizes are not ranked only by absolute volume.

Only employees with an eligible active or closed target overlapping the selected period appear. Overall score excludes the paused attendance metric and normalizes the remaining outcome weights. Individual KPI contribution is capped at 120%; raw actuals and targets remain visible beside the achievement percentage.

## Period lifecycle and history

- Managers, HR, and admins can copy an outcome-only target into the immediately following period.
- A copy is created as `DRAFT`; it never affects the active scorecard or leaderboard until explicitly activated.
- Draft activation requires outcome metrics totaling exactly 100% and rejects attendance metrics.
- An `ACTIVE` target may be changed only to `CLOSED`.
- Closing permanently locks the period; closed targets cannot be reopened through the application.
- Employees see active and closed history for themselves. Managers can also see drafts for the selected employee.
- History scores recalculate from the same source records and 120% cap used by the scorecard.

Every creation, copy, activation, and closure is recorded in `performance_target_events` with the actor, transition, timestamp, and copy source where applicable. Direct client writes to this audit table are not allowed.

## Bulk assignment and CSV selection

Managers, HR, and admins can assign one shared five-KPI target to as many as 250 employees in a batch. The workflow requires a preview before creation and marks employees who already have a target for the exact period as conflicts. Conflicts are skipped rather than overwritten.

Bulk targets are drafts by default. “Activate immediately” is an explicit option because active targets immediately affect employee scorecards and rankings. Each created target still receives its own audit event, marked with `bulk_assignment` metadata.

CSV import selects employees; it does not import arbitrary metric definitions. The file must include an `employee_id` or `employee_code` header whose values match the employee master. Duplicate codes are deduplicated and any unknown code stops the import so missing employees are never silently ignored. Target dates, KPI values, weights, and activation state remain visibly controlled in the application.

## Team and territory scorecards

Managers can view teams they lead or belong to and territories they manage or belong to. Admins and HR can view every team and active territory in their organization. Employees cannot call the aggregate scorecard RPC.

| Group measure | Definition |
| --- | --- |
| Eligible employees | Employees and managers currently assigned to the team or territory |
| Targeted employees | Eligible employees with a selected active/closed employee target overlapping the period |
| Target coverage | Targeted employees divided by eligible employees |
| Average score | Mean outcome score across targeted employees only |
| At target | Targeted employees with an outcome score of at least 100 |
| Needs attention | Targeted employees with an outcome score below 60 |

The top performer and coaching-attention names use the same five source-backed KPIs, target normalization, selected period, and 120% per-KPI cap as individual scorecards. Employees without targets appear only in the coverage gap; they are not assigned a zero performance score. This prevents missing setup from being misrepresented as employee underperformance.

## Monthly trends and exports

Authorized team and territory scorecards include 12 calendar-month observations ending in the month of the selected period end. The chart shows outcome score as a solid line, target coverage as a dashed line, and a 100-point score reference on a fixed 0–120 scale. Prior-month score and coverage-point deltas are calculated from the last two returned calendar months.

Trend rows reuse `get_performance_group_scorecards` for each month, so coverage, score caps, authorization, and attention thresholds reconcile with the current scorecard definition. Team and territory membership is not effective-dated yet: historical months use the group’s current employee roster. Exports state the selected reporting period and include the exact 12 monthly rows so reviewers can see the denominator and coverage alongside the score.

CSV exports contain the selected group summary and monthly trend. Spreadsheet-formula prefixes in text fields are neutralized, filenames are sanitized, and no attendance measure is included.

## Coaching actions

Managers, HR, and admins can convert an outcome-score signal into a dated coaching action for an employee. Each action is linked to one of the five active outcome KPIs and may optionally retain the target that prompted it. A title, detailed action plan, and due date within the next 180 days are mandatory.

Actions move from `OPEN` to `IN_PROGRESS`, `COMPLETED`, or `CANCELLED`; in-progress actions may move to `COMPLETED` or `CANCELLED`. Terminal actions cannot be reopened or edited. Every creation and status change writes a separate `performance_coaching_events` audit row with the actor, transition, note, and timestamp.

Employees can read their own coaching actions but cannot create or change them. Managers can act only within their organization, and other tenants cannot see either the action or its audit history. Coaching remains tied solely to sales, collections, productive visits, new dealers, and lead conversion; attendance is not accepted as a coaching metric.
