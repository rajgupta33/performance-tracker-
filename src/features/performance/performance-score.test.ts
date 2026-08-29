import { describe, expect, it } from 'vitest';
import { nextTargetPeriod, progressWidth, totalPerformanceScore } from './performance-score';

describe('performance score helpers', () => {
  it('adds weighted metric contributions', () => {
    expect(totalPerformanceScore([{ weightedScore: 35 }, { weightedScore: 18.125 }])).toBe(53.13);
  });

  it('keeps visual progress inside the bar', () => {
    expect(progressWidth(135)).toBe(100);
    expect(progressWidth(-4)).toBe(0);
  });

  it('copies a full calendar month into the next calendar month', () => {
    expect(nextTargetPeriod('2026-01-01', '2026-01-31')).toEqual({ periodStart: '2026-02-01', periodEnd: '2026-02-28' });
    expect(nextTargetPeriod('2028-01-01', '2028-01-31')).toEqual({ periodStart: '2028-02-01', periodEnd: '2028-02-29' });
  });

  it('preserves custom period duration when copying', () => {
    expect(nextTargetPeriod('2026-01-10', '2026-01-19')).toEqual({ periodStart: '2026-01-20', periodEnd: '2026-01-29' });
  });
});
