import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/0045_attendance_payroll_lock.sql'),
  'utf8',
);

describe('attendance payroll lock migration contract', () => {
  it('stores a current boundary and immutable advance events', () => {
    expect(migration).toContain('create table public.attendance_payroll_locks');
    expect(migration).toContain('create table public.attendance_payroll_lock_events');
    expect(migration).toContain('previous_locked_through');
  });

  it('allows only completed dates and monotonic advancement', () => {
    expect(migration).toContain('if p_locked_through >= v_today');
    expect(migration).toContain('payroll lock cannot move backward from %');
    expect(migration).toContain('if p_locked_through = v_existing.locked_through then return v_existing; end if;');
  });

  it('refuses to strand open sessions or pending correction requests', () => {
    expect(migration).toContain('open attendance sessions must be resolved before payroll can lock through %');
    expect(migration).toContain('pending attendance corrections must be resolved before payroll can lock through %');
  });

  it('serializes lock advancement with every attendance mutation', () => {
    expect(migration.match(/pg_advisory_xact_lock/g)?.length).toBeGreaterThanOrEqual(3);
    expect(migration).toContain('before insert or update or delete on public.attendance');
    expect(migration).toContain('attendance is locked through % for finalized payroll');
  });

  it('blocks new or approved corrections while allowing rejection cleanup', () => {
    expect(migration).toContain("tg_op = 'INSERT'");
    expect(migration).toContain("new.status = 'APPROVED'");
    expect(migration).not.toContain("new.status = 'REJECTED'");
  });
});
