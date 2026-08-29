import type { MetricKey, MetricUnit, OutcomeMetricKey, PerformanceLeaderboardMetric } from './performance.types';

export interface MetricConfig {
  label: string;
  unit: MetricUnit;
  weight: number;
  defaultTarget: number;
}

export const metricConfig: Record<MetricKey, MetricConfig> = {
  sales_amount: { label: 'Won deal value', unit: 'INR', weight: 40, defaultTarget: 500000 },
  collection_amount: { label: 'Reconciled collections', unit: 'INR', weight: 25, defaultTarget: 300000 },
  productive_visits: { label: 'Productive visits', unit: 'COUNT', weight: 15, defaultTarget: 40 },
  new_dealers: { label: 'New dealers', unit: 'COUNT', weight: 10, defaultTarget: 5 },
  lead_conversion: { label: 'Lead conversion', unit: 'PERCENT', weight: 10, defaultTarget: 25 },
  attendance_discipline: { label: 'Attendance discipline (paused)', unit: 'PERCENT', weight: 0, defaultTarget: 95 },
};

export const outcomeTargetWeight = (keys: readonly OutcomeMetricKey[]) =>
  keys.reduce((sum, key) => sum + metricConfig[key].weight, 0);

export const leaderboardOptions: Array<{ key: PerformanceLeaderboardMetric; label: string }> = [
  { key: 'SCORE', label: 'Overall' },
  { key: 'SALES_AMOUNT', label: 'Sales' },
  { key: 'COLLECTION_AMOUNT', label: 'Collections' },
  { key: 'PRODUCTIVE_VISITS', label: 'Visits' },
  { key: 'NEW_DEALERS', label: 'Dealers' },
  { key: 'LEAD_CONVERSION', label: 'Conversion' },
];

export const formatPerformanceValue = (value: number, metric: PerformanceLeaderboardMetric) => {
  if (metric === 'SALES_AMOUNT' || metric === 'COLLECTION_AMOUNT') return `₹${value.toLocaleString('en-IN')}`;
  if (metric === 'SCORE' || metric === 'LEAD_CONVERSION') return `${value.toLocaleString('en-IN', { maximumFractionDigits: 1 })}%`;
  return value.toLocaleString('en-IN', { maximumFractionDigits: 1 });
};
