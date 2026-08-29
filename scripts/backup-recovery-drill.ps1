[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$SourceDatabaseUrl,
  [Parameter(Mandatory = $true)][string]$RestoreDatabaseUrl,
  [Parameter(Mandatory = $true)][switch]$ConfirmDisposableTarget,
  [string]$EvidenceDirectory
)

$ErrorActionPreference = 'Stop'
$requiredConfirmation = 'ERASE DISPOSABLE RESTORE TARGET'
if (-not $ConfirmDisposableTarget -or $env:VAR_FIELD_RESTORE_CONFIRMATION -ne $requiredConfirmation) {
  throw "Set VAR_FIELD_RESTORE_CONFIRMATION='$requiredConfirmation' and pass -ConfirmDisposableTarget."
}
if ($SourceDatabaseUrl -eq $RestoreDatabaseUrl) { throw 'Source and restore database URLs must be different.' }

foreach ($command in @('supabase', 'psql')) {
  if (-not (Get-Command $command -ErrorAction SilentlyContinue)) { throw "Required command '$command' is not installed." }
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
if (-not $EvidenceDirectory) { $EvidenceDirectory = Join-Path $repoRoot "artifacts\recovery-drill\$stamp" }
$evidenceFullPath = [System.IO.Path]::GetFullPath($EvidenceDirectory)
if (-not $evidenceFullPath.StartsWith($repoRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'EvidenceDirectory must remain inside the repository.'
}
New-Item -ItemType Directory -Path $evidenceFullPath -Force | Out-Null

function Get-SafeEndpoint([string]$databaseUrl) {
  $uri = [Uri]$databaseUrl
  return @{ host = $uri.Host; port = $uri.Port; database = $uri.AbsolutePath.TrimStart('/') }
}

function Invoke-Checked([string]$label, [scriptblock]$operation) {
  & $operation
  if ($LASTEXITCODE -ne 0) { throw "$label failed with exit code $LASTEXITCODE." }
}

$targetTableCount = & psql $RestoreDatabaseUrl -X -v ON_ERROR_STOP=1 -Atc "select count(*) from pg_catalog.pg_tables where schemaname = 'public';"
if ($LASTEXITCODE -ne 0) { throw 'Could not inspect the restore target.' }
if ([int]($targetTableCount.Trim()) -ne 0) {
  throw 'Restore target is not empty. Create a new disposable Supabase project/database for this drill.'
}

$rolesFile = Join-Path $evidenceFullPath 'roles.sql'
$schemaFile = Join-Path $evidenceFullPath 'schema.sql'
$dataFile = Join-Path $evidenceFullPath 'data.sql'
$sourceSnapshotFile = Join-Path $evidenceFullPath 'source-snapshot.json'
$targetSnapshotFile = Join-Path $evidenceFullPath 'target-snapshot.json'
$verificationSql = Join-Path $PSScriptRoot 'recovery-verification.sql'
$startedAt = Get-Date

$sourceSnapshot = & psql $SourceDatabaseUrl -X -v ON_ERROR_STOP=1 -At -f $verificationSql
if ($LASTEXITCODE -ne 0) { throw 'Source verification snapshot failed.' }
$sourceSnapshot.Trim() | Set-Content -LiteralPath $sourceSnapshotFile -Encoding utf8

Invoke-Checked 'Role dump' { & supabase db dump --db-url $SourceDatabaseUrl -f $rolesFile --role-only }
Invoke-Checked 'Schema dump' { & supabase db dump --db-url $SourceDatabaseUrl -f $schemaFile }
Invoke-Checked 'Data dump' { & supabase db dump --db-url $SourceDatabaseUrl -f $dataFile --use-copy --data-only -x 'storage.buckets_vectors' -x 'storage.vector_indexes' }

Invoke-Checked 'Database restore' {
  & psql $RestoreDatabaseUrl -X --single-transaction --variable ON_ERROR_STOP=1 `
    --file $rolesFile --file $schemaFile --command 'SET session_replication_role = replica' --file $dataFile
}

$targetSnapshot = & psql $RestoreDatabaseUrl -X -v ON_ERROR_STOP=1 -At -f $verificationSql
if ($LASTEXITCODE -ne 0) { throw 'Target verification snapshot failed.' }
$targetSnapshot.Trim() | Set-Content -LiteralPath $targetSnapshotFile -Encoding utf8

$sourceObject = $sourceSnapshot.Trim() | ConvertFrom-Json
$targetObject = $targetSnapshot.Trim() | ConvertFrom-Json
if ($targetObject.integrity_errors -ne 0) { throw "Restored target has $($targetObject.integrity_errors) referential integrity errors." }
if ($targetObject.rls_missing.Count -ne 0) { throw "Restored target has tables without RLS: $($targetObject.rls_missing -join ', ')." }
if ($sourceSnapshot.Trim() -ne $targetSnapshot.Trim()) { throw 'Source and restored public-data verification snapshots do not match.' }

$completedAt = Get-Date
$files = @($rolesFile, $schemaFile, $dataFile, $sourceSnapshotFile, $targetSnapshotFile) | ForEach-Object {
  $item = Get-Item -LiteralPath $_
  $hash = Get-FileHash -LiteralPath $_ -Algorithm SHA256
  @{ name = $item.Name; bytes = $item.Length; sha256 = $hash.Hash.ToLowerInvariant() }
}
$manifest = @{
  outcome = 'PASS'
  started_at = $startedAt.ToUniversalTime().ToString('o')
  completed_at = $completedAt.ToUniversalTime().ToString('o')
  duration_seconds = [math]::Round(($completedAt - $startedAt).TotalSeconds, 2)
  source = Get-SafeEndpoint $SourceDatabaseUrl
  disposable_target = Get-SafeEndpoint $RestoreDatabaseUrl
  public_data_snapshot = $targetObject
  files = $files
  limitations = @('Auth and Storage managed schemas require the platform recovery path.', 'Storage object bytes are not contained in database backups.')
}
$manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $evidenceFullPath 'manifest.json') -Encoding utf8
Write-Output "Recovery drill passed. Evidence: $evidenceFullPath"
