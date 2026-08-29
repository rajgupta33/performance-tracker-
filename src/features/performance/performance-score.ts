import type { PerformanceMetric } from './performance.types';

export const totalPerformanceScore = (metrics: Pick<PerformanceMetric, 'weightedScore'>[]) =>
  Math.round(metrics.reduce((sum, metric) => sum + metric.weightedScore, 0) * 100) / 100;

export const progressWidth = (achievementPct: number) => Math.min(100, Math.max(0, achievementPct));

const isoDate = (date: Date) => date.toISOString().slice(0, 10);

export const nextTargetPeriod = (periodStart: string, periodEnd: string) => {
  const start = new Date(`${periodStart}T00:00:00Z`);
  const end = new Date(`${periodEnd}T00:00:00Z`);
  const isWholeMonth = start.getUTCDate() === 1
    && end.getUTCDate() === new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();

  if (isWholeMonth) {
    const nextStart = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
    const nextEnd = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 2, 0));
    return { periodStart: isoDate(nextStart), periodEnd: isoDate(nextEnd) };
  }

  const durationDays = Math.round((end.getTime() - start.getTime()) / 86400000);
  const nextStart = new Date(end.getTime() + 86400000);
  const nextEnd = new Date(nextStart.getTime() + durationDays * 86400000);
  return { periodStart: isoDate(nextStart), periodEnd: isoDate(nextEnd) };
};
