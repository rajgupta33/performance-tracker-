import type { PerformanceGroupScorecard, PerformanceGroupTrendPoint } from './performance.types';

const csvCell = (value: string | number) => {
  let text = String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};

export const trendDelta = (points: PerformanceGroupTrendPoint[], key: 'averageScore' | 'coveragePct') => {
  if (points.length < 2) return undefined;
  return Math.round((points[points.length - 1][key] - points[points.length - 2][key]) * 100) / 100;
};

export const buildGroupScorecardCsv = (
  scorecard: PerformanceGroupScorecard,
  trend: PerformanceGroupTrendPoint[],
  selectedPeriodStart: string,
  selectedPeriodEnd: string,
) => {
  const summary = [
    ['Group type', scorecard.groupType],
    ['Group name', scorecard.groupName],
    ['Selected period start', selectedPeriodStart],
    ['Selected period end', selectedPeriodEnd],
    ['Eligible employees', scorecard.eligibleEmployees],
    ['Targeted employees', scorecard.targetedEmployees],
    ['Coverage percent', scorecard.coveragePct],
    ['Average outcome score', scorecard.averageScore],
    ['At target', scorecard.achievedCount],
    ['Needs attention', scorecard.needsAttentionCount],
    ['Top performer', scorecard.topEmployeeName || ''],
    ['Top performer score', scorecard.topEmployeeScore ?? ''],
  ].map((row) => row.map(csvCell).join(','));
  const history = [
    ['Month start', 'Month end', 'Eligible', 'Targeted', 'Coverage percent', 'Average score', 'At target', 'Needs attention'].map(csvCell).join(','),
    ...trend.map((point) => [point.monthStart, point.monthEnd, point.eligibleEmployees, point.targetedEmployees, point.coveragePct, point.averageScore, point.achievedCount, point.needsAttentionCount].map(csvCell).join(',')),
  ];
  return ['Vardhnam performance group scorecard', ...summary, '', '12-month calendar trend', ...history].join('\r\n');
};

export const safeScorecardFilename = (groupName: string, periodEnd: string) =>
  `performance-${groupName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'group'}-${periodEnd}.csv`;
