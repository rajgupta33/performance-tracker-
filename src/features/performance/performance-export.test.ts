import { describe, expect, it } from 'vitest';
import { buildGroupScorecardCsv, safeScorecardFilename, trendDelta } from './performance-export';
import type { PerformanceGroupScorecard, PerformanceGroupTrendPoint } from './performance.types';

const point = (monthStart: string, averageScore: number, coveragePct: number): PerformanceGroupTrendPoint => ({
  monthStart, monthEnd: monthStart, eligibleEmployees: 10, targetedEmployees: 8,
  coveragePct, averageScore, achievedCount: 3, needsAttentionCount: 1,
});

describe('performance scorecard export', () => {
  it('calculates prior-month score and coverage deltas', () => {
    const trend = [point('2026-01-01', 72.25, 80), point('2026-02-01', 76.5, 90)];
    expect(trendDelta(trend, 'averageScore')).toBe(4.25);
    expect(trendDelta(trend, 'coveragePct')).toBe(10);
    expect(trendDelta([trend[0]], 'averageScore')).toBeUndefined();
  });

  it('exports summary and reviewed trend rows', () => {
    const scorecard: PerformanceGroupScorecard = {
      groupType: 'TEAM', groupId: '1', groupName: 'North Team', eligibleEmployees: 10, targetedEmployees: 8,
      coveragePct: 80, averageScore: 72.25, achievedCount: 3, needsAttentionCount: 1,
      topEmployeeName: '=Unsafe Name', topEmployeeScore: 110, attentionEmployeeNames: ['Ravi'],
    };
    const csv = buildGroupScorecardCsv(scorecard, [point('2026-01-01', 72.25, 80)], '2026-01-01', '2026-01-31');
    expect(csv).toContain('"North Team"');
    expect(csv).toContain('"\'=Unsafe Name"');
    expect(csv).toContain('"Month start","Month end"');
  });

  it('builds a filesystem-safe filename', () => {
    expect(safeScorecardFilename('North / Zone', '2026-02-28')).toBe('performance-north-zone-2026-02-28.csv');
  });
});
