import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/0043_attendance_verified_checkout.sql'),
  'utf8',
);

describe('verified attendance check-out migration contract', () => {
  it('stores separate check-out evidence behind a tenant-scoped event key', () => {
    expect(migration).toContain('unique (organization_id, check_out_event_id)');
    expect(migration).toContain("check_out_selfie = p_attendance_id::text || '/checkout.webp'");
    expect(migration).toContain("change_reason = 'EMPLOYEE_VERIFIED_CHECK_OUT'");
  });

  it('enforces employee ownership, GPS quality, freshness, and replay safety', () => {
    expect(migration).toContain('v_row.employee_id <> auth.uid()::text');
    expect(migration).toContain('GPS accuracy exceeds the configured % metre limit');
    expect(migration).toContain('attendance location is stale');
    expect(migration).toContain('if v_row.check_out_event_id = p_client_event_id then return v_row; end if;');
  });

  it('blocks arbitrary employee updates while retaining the two frozen compatibility paths', () => {
    expect(migration).toContain('employee attendance updates must use a verified attendance function');
    expect(migration).toContain("[System: Auto-closed — no check-out recorded]");
    expect(migration).toContain("new.selfie = old.id::text || '/selfie.webp'");
  });
});
