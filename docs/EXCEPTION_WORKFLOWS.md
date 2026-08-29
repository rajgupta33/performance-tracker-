# Management exception workflows

The Field Force BI queue routes managers to the system of record for each exception:

- Attendance exceptions open Attendance Audit.
- Visit-location exceptions open the audited Visit Reviews queue.
- Overdue CRM tasks open Follow-ups.
- Collection exceptions open Collections for verification, reconciliation, or rejection.

## Visit review rules

Migration `0032_visit_exception_reviews.sql` adds a single immutable manager decision per completed visit exception.

- Only `REVIEW`, `OUTSIDE`, and `UNAVAILABLE` visits can be reviewed.
- Managers, HR, and admins may approve or reject evidence.
- A meaningful review note is mandatory.
- The decision does not overwrite captured coordinates, GPS accuracy, customer distance, or the original location status.
- Reviewed visits leave the active BI exception queue but remain available through the database audit record.
- Approving weak-location evidence does not retroactively award verified-visit points.

Apply migrations through `0032` and enable both `VITE_FEATURE_VISITS` and `VITE_FEATURE_FIELD_BI`.
