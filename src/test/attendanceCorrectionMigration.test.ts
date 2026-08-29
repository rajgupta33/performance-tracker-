import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/0044_attendance_correction_requests.sql'),
  'utf8',
);

describe('attendance correction request migration contract', () => {
  it('allows only one pending request for an employee and date', () => {
    expect(migration).toContain('attendance_correction_one_pending_day');
    expect(migration).toContain("where status = 'PENDING'");
  });

  it('enforces employee identity, tenant scope, date limits, and complete missing days', () => {
    expect(migration).toContain('employee_id = auth.uid()::text');
    expect(migration).toContain('organization_id = v_org_id');
    expect(migration).toContain('attendance corrections are limited to 90 days');
    expect(migration).toContain('a missing attendance day requires both check-in and check-out times');
  });

  it('restricts manager decisions to reporting scope and writes audited attendance', () => {
    expect(migration).toContain('(employee.line_manager_id = auth.uid() or team.leader_id = auth.uid())');
    expect(migration).toContain("change_reason = 'MISSED_PUNCH_CORRECTION_APPROVED'");
    expect(migration).toContain("v_decision not in ('APPROVED','REJECTED')");
  });

  it('notifies reviewers on submission and the employee on resolution', () => {
    expect(migration).toContain("'Attendance correction requested'");
    expect(migration).toContain("'Attendance correction ' || lower(v_decision)");
  });
});
