import { describe, expect, it } from 'vitest';
import { buildPayrollLockParams, validatePayrollLockAdvance } from './payrollLock';

const base = {
  lockedThrough: '2026-08-29',
  currentWorkDate: '2026-08-30',
  note: 'August payroll has been reviewed and exported.',
};

describe('attendance payroll lock validation', () => {
  it('accepts an advancing completed-date lock and trims its audit note', () => {
    expect(validatePayrollLockAdvance(base)).toBe('');
    expect(buildPayrollLockParams({ ...base, note: `  ${base.note}  ` })).toEqual({
      p_locked_through: '2026-08-29',
      p_note: base.note,
    });
  });

  it('rejects current/future dates and attempts to move the lock backward', () => {
    expect(validatePayrollLockAdvance({ ...base, lockedThrough: '2026-08-30' })).toContain('completed');
    expect(validatePayrollLockAdvance({ ...base, lockedThrough: '2026-08-31' })).toContain('completed');
    expect(validatePayrollLockAdvance({
      ...base,
      currentLockedThrough: '2026-08-29',
      lockedThrough: '2026-08-28',
    })).toContain('after the current payroll lock');
  });

  it('requires a durable audit explanation', () => {
    expect(validatePayrollLockAdvance({ ...base, note: 'Exported' })).toContain('10 characters');
  });
});
