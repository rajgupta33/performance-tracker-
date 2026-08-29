import { describe, expect, it } from 'vitest';
import { validateCoachingAction, validateCoachingStatusChange } from './coaching-guardrails';

describe('performance coaching guardrails', () => {
  it('accepts a documented action with a bounded future due date', () => {
    expect(validateCoachingAction('employee-1', 'Improve conversion', 'Review ten qualified leads each Friday.', '2026-09-10', '2026-08-27')).toBe('');
  });

  it('rejects short plans and past or distant due dates', () => {
    expect(validateCoachingAction('employee-1', 'Improve conversion', 'Call leads', '2026-09-10', '2026-08-27')).toContain('20');
    expect(validateCoachingAction('employee-1', 'Improve conversion', 'Review ten qualified leads each Friday.', '2026-08-26', '2026-08-27')).toContain('past');
    expect(validateCoachingAction('employee-1', 'Improve conversion', 'Review ten qualified leads each Friday.', '2027-03-01', '2026-08-27')).toContain('180');
  });

  it('requires a meaningful note for a terminal or progress transition', () => {
    expect(validateCoachingStatusChange('IN_PROGRESS', 'Manager and employee agreed next steps.')).toBe('');
    expect(validateCoachingStatusChange('COMPLETED', 'Done')).toContain('10');
    expect(validateCoachingStatusChange('OPEN', 'Reopen this action after review')).toContain('new status');
  });
});
