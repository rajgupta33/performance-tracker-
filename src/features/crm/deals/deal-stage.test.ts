import { describe, expect, it } from 'vitest';
import { dealStageLabel, nextDealStage } from './deal-stage';

describe('deal stage flow', () => {
  it('moves through the supported happy path', () => {
    expect(nextDealStage('OPEN')).toBe('PROPOSAL');
    expect(nextDealStage('PROPOSAL')).toBe('NEGOTIATION');
    expect(nextDealStage('NEGOTIATION')).toBe('WON');
    expect(nextDealStage('WON')).toBeUndefined();
  });

  it('formats labels for the UI', () => expect(dealStageLabel('NEGOTIATION')).toBe('Negotiation'));
});
