import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Download, Loader2, TrendingDown, TrendingUp } from 'lucide-react';
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { buildGroupScorecardCsv, safeScorecardFilename, trendDelta } from './performance-export';
import { performanceService } from './performance.service';
import type { PerformanceGroupScorecard, PerformanceGroupTrendPoint } from './performance.types';

const Delta: React.FC<{ value?: number; label: string }> = ({ value, label }) => {
  if (value == null) return <span className="text-[9px] text-slate-400">No prior month</span>;
  const positive = value >= 0;
  return <span className={`inline-flex items-center gap-1 text-[9px] font-bold ${positive ? 'text-blue-700' : 'text-amber-700'}`}>{positive ? <TrendingUp size={11} /> : <TrendingDown size={11} />}{value > 0 ? '+' : ''}{value.toFixed(1)} {label}</span>;
};

const PerformanceGroupTrend: React.FC<{ scorecard: PerformanceGroupScorecard; selectedPeriodStart: string; selectedPeriodEnd: string }> = ({ scorecard, selectedPeriodStart, selectedPeriodEnd }) => {
  const [trend, setTrend] = useState<PerformanceGroupTrendPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setIsLoading(true); setError('');
    performanceService.getGroupTrend(scorecard.groupType, scorecard.groupId, selectedPeriodEnd, 12)
      .then((rows) => { if (active) setTrend(rows); })
      .catch((err: any) => { if (active) setError(err.message || 'Could not load monthly trend.'); })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [scorecard.groupId, scorecard.groupType, selectedPeriodEnd]);

  const chartRows = useMemo(() => trend.map((point) => ({
    ...point,
    month: new Date(`${point.monthStart}T00:00:00`).toLocaleDateString(undefined, { month: 'short', year: '2-digit' }),
  })), [trend]);
  const scoreDelta = trendDelta(trend, 'averageScore');
  const coverageDelta = trendDelta(trend, 'coveragePct');

  const download = () => {
    const csv = buildGroupScorecardCsv(scorecard, trend, selectedPeriodStart, selectedPeriodEnd);
    const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url; link.download = safeScorecardFilename(scorecard.groupName, selectedPeriodEnd); link.click();
    URL.revokeObjectURL(url);
  };

  return <section className="space-y-3 rounded-2xl border border-slate-100 p-4">
    <div className="flex items-start justify-between gap-3"><div><p className="text-[9px] font-bold uppercase tracking-wider text-primary">12 calendar months</p><h3 className="text-sm font-semibold text-slate-800">Score and target coverage trend</h3><p className="text-[9px] text-slate-400">Score uses targeted employees; coverage uses all currently assigned eligible employees.</p></div><button onClick={download} disabled={isLoading || trend.length === 0} className="flex shrink-0 items-center gap-1 rounded-xl bg-slate-50 px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-slate-600 disabled:opacity-40"><Download size={12} />CSV</button></div>
    <div className="flex flex-wrap gap-3"><Delta value={scoreDelta} label="score vs prior month" /><Delta value={coverageDelta} label="coverage pts vs prior month" /></div>
    {error && <div role="alert" className="flex gap-2 rounded-xl bg-rose-50 p-3 text-xs text-rose-700"><AlertCircle size={15} className="shrink-0" />{error}</div>}
    {isLoading ? <div className="flex h-56 items-center justify-center"><Loader2 size={26} className="animate-spin text-primary" /></div> : trend.length < 2 ? <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-slate-200 text-xs text-slate-400">Not enough monthly history for a trend.</div> : <div className="h-64 w-full" aria-label={`Monthly outcome score and target coverage for ${scorecard.groupName}`}><ResponsiveContainer width="100%" height="100%"><LineChart data={chartRows} margin={{ top: 10, right: 8, left: -18, bottom: 4 }}><CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="month" tick={{ fontSize: 9, fill: '#64748b' }} interval="preserveStartEnd" /><YAxis domain={[0, 120]} ticks={[0, 30, 60, 90, 120]} tick={{ fontSize: 9, fill: '#64748b' }} /><Tooltip formatter={(value: number | string, name: string) => [`${Number(value).toFixed(1)}%`, name]} labelStyle={{ fontSize: 11 }} contentStyle={{ borderRadius: 12, borderColor: '#e2e8f0', fontSize: 10 }} /><Legend wrapperStyle={{ fontSize: 10 }} /><ReferenceLine y={100} stroke="#475569" strokeDasharray="4 4" label={{ value: 'Target', position: 'insideTopRight', fontSize: 9, fill: '#475569' }} /><Line type="monotone" dataKey="averageScore" name="Outcome score" stroke="#2563eb" strokeWidth={2.5} dot={{ r: 2, fill: '#2563eb' }} activeDot={{ r: 4 }} /><Line type="monotone" dataKey="coveragePct" name="Target coverage" stroke="#d97706" strokeWidth={2} strokeDasharray="6 4" dot={{ r: 2, fill: '#fff', stroke: '#d97706' }} /></LineChart></ResponsiveContainer></div>}
  </section>;
};

export default PerformanceGroupTrend;
