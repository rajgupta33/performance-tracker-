import { describe, expect, it } from 'vitest';
import { validatePointAdjustment, validatePointRuleDraft } from './point-guardrails';

const now = new Date('2026-08-27T10:00:00.000Z');

describe('point configuration guardrails', () => {
  it('accepts only prospective rule drafts with bounded whole-number points', () => {
    expect(validatePointRuleDraft(25, '2026-08-28T10:00:00.000Z', 'Approved pilot rule', now)).toBe('');
    expect(validatePointRuleDraft(0, '2026-08-28T10:00:00.000Z', 'Approved pilot rule', now)).toContain('1 to 100');
    expect(validatePointRuleDraft(25, '2026-08-26T10:00:00.000Z', 'Approved pilot rule', now)).toContain('future');
  });

  it('requires a documented, bounded, recent manual adjustment', () => {
    expect(validatePointAdjustment('employee-1', -10, 'Duplicate award correction', 'OPS-42', now.toISOString(), now)).toBe('');
    expect(validatePointAdjustment('employee-1', 101, 'Duplicate award correction', 'OPS-42', now.toISOString(), now)).toContain('-100 to 100');
    expect(validatePointAdjustment('employee-1', 10, 'Too short', 'OPS-42', now.toISOString(), now)).toContain('10 characters');
  });

  it('rejects missing recipients and stale adjustment dates', () => {
    expect(validatePointAdjustment('', 10, 'Approved correction', 'OPS-42', now.toISOString(), now)).toContain('employee');
    expect(validatePointAdjustment('employee-1', 10, 'Approved correction', 'OPS-42', '2026-05-01T10:00:00.000Z', now)).toContain('90 days');
  });
});
