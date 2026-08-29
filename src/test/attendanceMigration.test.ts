import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/0042_attendance_verified_checkin.sql'),
  'utf8',
);

describe('verified attendance migration contract', () => {
  it('persists a tenant-scoped unique client event key', () => {
    expect(migration).toContain('unique (organization_id, client_event_id)');
    expect(migration).toContain('on conflict (organization_id, client_event_id) do nothing');
  });

  it('enforces identity, timezone, GPS quality, and freshness on the server', () => {
    expect(migration).toContain('where id = auth.uid() and organization_id = v_org_id and status = \'ACTIVE\'');
    expect(migration).toContain('work date does not match organization timezone');
    expect(migration).toContain('GPS accuracy exceeds the configured % metre limit');
    expect(migration).toContain('attendance location is stale');
  });

  it('blocks ordinary employee inserts outside the verified function', () => {
    expect(migration).toContain('drop policy if exists "attendance_insert"');
    expect(migration).toContain("change_reason = 'LEGACY_OFFLINE_CHECKIN_NO_GPS'");
  });
});

