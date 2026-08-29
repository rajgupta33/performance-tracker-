import { describe, expect, it } from 'vitest';
import { buildHash } from '../../../utils/deeplink';
import { canFieldUserMoveLead, leadStageLabel, nextLeadStage } from './lead-stage';

describe('lead stage workflow', () => {
  it('follows the approved forward pipeline', () => {
    expect(nextLeadStage('NEW')).toBe('CONTACTED');
    expect(nextLeadStage('CONTACTED')).toBe('INTERESTED');
    expect(nextLeadStage('INTERESTED')).toBe('NEGOTIATION');
    expect(nextLeadStage('NEGOTIATION')).toBe('WON');
    expect(nextLeadStage('WON')).toBeNull();
  });

  it('allows losses only after first contact', () => {
    expect(canFieldUserMoveLead('NEW', 'LOST')).toBe(false);
    expect(canFieldUserMoveLead('CONTACTED', 'LOST')).toBe(true);
    expect(canFieldUserMoveLead('NEGOTIATION', 'LOST')).toBe(true);
  });

  it('rejects skipping forward stages', () => {
    expect(canFieldUserMoveLead('NEW', 'INTERESTED')).toBe(false);
    expect(canFieldUserMoveLead('CONTACTED', 'WON')).toBe(false);
  });

  it('provides readable labels and a stable deep link', () => {
    expect(leadStageLabel('NEGOTIATION')).toBe('Negotiation');
    expect(buildHash('leads')).toBe('#/leads');
  });
});
