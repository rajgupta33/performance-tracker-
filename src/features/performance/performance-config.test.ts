import { describe, expect, it } from 'vitest';
import { formatPerformanceValue, leaderboardOptions, metricConfig, outcomeTargetWeight } from './performance-config';
import { OUTCOME_METRIC_KEYS } from './performance.types';

describe('performance tracker configuration', () => {
  it('assigns exactly 100% to active outcome metrics', () => {
    expect(outcomeTargetWeight(OUTCOME_METRIC_KEYS)).toBe(100);
    expect(metricConfig.attendance_discipline.weight).toBe(0);
  });

  it('offers outcome rankings without attendance', () => {
    expect(leaderboardOptions.map((option) => option.key)).toEqual([
      'SCORE', 'SALES_AMOUNT', 'COLLECTION_AMOUNT', 'PRODUCTIVE_VISITS', 'NEW_DEALERS', 'LEAD_CONVERSION',
    ]);
  });

  it('formats monetary and percentage rankings', () => {
    expect(formatPerformanceValue(125000, 'SALES_AMOUNT')).toContain('1,25,000');
    expect(formatPerformanceValue(91.25, 'SCORE')).toBe('91.3%');
  });
});
