# Backup and recovery

## Recovery strategy

Use two complementary paths:

1. **Supabase-managed recovery** for the complete project database, including managed schemas. Select daily backup or Point-in-Time Recovery according to the production plan and approved RPO.
2. **Portable logical export** using `supabase db dump` for the application schema and public data. This is the path exercised by the repository drill.

Supabase recommends its CLI dump rather than raw `pg_dump` because it filters managed schemas and reserved roles. Database backups contain Storage metadata, not the underlying stored objects, so evidence buckets require a separate object-copy and inventory process.

## Guarded logical restore drill

Prerequisites: Supabase CLI, Docker, `psql`, a source connection string, and a newly created disposable restore target with no public tables.

PowerShell example:

```powershell
$env:VAR_FIELD_RESTORE_CONFIRMATION = 'ERASE DISPOSABLE RESTORE TARGET'
npm run recovery:drill -- `
  -SourceDatabaseUrl $env:VAR_FIELD_SOURCE_DB_URL `
  -RestoreDatabaseUrl $env:VAR_FIELD_RESTORE_DB_URL `
  -ConfirmDisposableTarget
```

The runner refuses identical source/target URLs, refuses a target containing public tables, and requires the explicit confirmation phrase. It creates role, schema, and data exports; restores them transactionally; compares source and target row-count snapshots; verifies key relationships and RLS; and writes SHA-256 evidence under `artifacts/recovery-drill/`.

Do not paste connection strings into tickets, chat, shell history, or committed files. Run from a secured operator workstation and clear the temporary environment after the drill.

## Managed recovery drill

At least quarterly:

1. Record the configured backup/PITR window and the earliest/latest available restore points.
2. Choose a restore point before a synthetic staging mutation.
3. Restore or duplicate into an isolated project; never test by rolling production backward.
4. Apply missing environment secrets, Auth configuration, redirects, Edge Functions, schedules, and Realtime settings.
5. Run migrations/status checks, `npm run test:rls`, application smoke tests, and record measured RPO/RTO.
6. Inventory private Storage buckets and copy object bytes using the approved encrypted off-site process.
7. Sample-download attendance and visit evidence and compare object counts/checksums with the inventory.
8. Destroy the disposable recovery project only after evidence review and sign-off.

## Release evidence

- Backup timestamp and chosen recovery point.
- Source and disposable project references—not credentials.
- Restore start/end timestamps and measured RTO.
- Maximum observed data gap and measured RPO.
- Drill manifest and checksums.
- RLS and smoke-test outputs.
- Database counts plus Storage object inventory/checksum results.
- Exceptions, owners, remediation deadlines, and approval from the release owner.

Current provider behavior and plan-specific retention must be rechecked before every production launch against the official Supabase backup documentation.
