# Evidence retention and deletion

Migration `0033_evidence_retention.sql` introduces policy-gated retention for attendance selfies, visit evidence, and optional collection proof.

## Safety posture

- Every organization starts with deletion disabled.
- An admin or HR user must record retention periods and an approved policy reference.
- Retention periods must be between 30 and 3,650 days; the application does not choose a legal period automatically.
- The worker defaults to dry-run unless `EVIDENCE_RETENTION_EXECUTE=true` is configured.
- Candidate rows are written to the audit log before any deletion begins.
- A database evidence reference is cleared only after deletion of its exact Storage path succeeds.
- Compare-and-clear semantics prevent a cleanup race from clearing a newly replaced path.
- Failed and interrupted items remain visible as `FAILED` or `PENDING` audit entries.

## Configure a draft policy

Run as an authenticated organization admin or HR user:

```sql
select public.set_evidence_retention_policy(
  p_attendance_days := 730,
  p_visit_days := 730,
  p_collection_days := 2555,
  p_policy_reference := 'LEGAL-APPROVAL-REFERENCE',
  p_activate := false
);
```

The numbers above are examples, not policy recommendations. Replace them with periods approved for the applicable employment, tax, accounting, privacy, and litigation-hold requirements.

## Activation sequence

1. Obtain written policy approval and confirm no legal hold affects the evidence.
2. Save the approved periods with `p_activate := false`.
3. Deploy `cron-selfie-storage-cleanup`; the legacy name now handles all evidence categories.
4. Invoke it with `{ "dryRun": true, "limit": 500 }` and review every `evidence_cleanup_items` candidate.
5. Activate the organization policy using the same RPC with `p_activate := true`.
6. Set Edge Function secret `EVIDENCE_RETENTION_EXECUTE=true`.
7. Invoke one bounded execution and verify Storage deletion, cleared database references, and audit outcomes.
8. Enable the existing daily schedule only after sign-off.

## Rollback and incident handling

Deletion of Storage evidence is irreversible through the application. Recovery depends on the separately tested backup/object-retention process. If failures occur, disable `EVIDENCE_RETENTION_EXECUTE` immediately, preserve the cleanup run ID, and investigate all `PENDING` and `FAILED` items before retrying.

The database backup alone does not contain deleted Storage object bytes. Evidence object inventories and recoverable copies must be handled by the backup procedure in `BACKUP_RECOVERY.md`.
