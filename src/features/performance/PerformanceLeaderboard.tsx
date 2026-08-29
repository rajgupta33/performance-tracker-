import React, { useEffect, useState } from 'react';
import { AlertCircle, CalendarRange, Loader2, Medal, RefreshCw } from 'lucide-react';
import type { User } from '../../types';
import { formatPerformanceValue, leaderboardOptions } from './performance-config';
import { performanceService } from './performance.service';
import type { PerformanceLeaderboardMetric, PerformanceLeaderboardRow } from './performance.types';

const localDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const PerformanceLeaderboard: React.FC<{ user: User }> = ({ user }) => {
  const today = new Date();
  const [periodStart, setPeriodStart] = useState(localDate(new Date(today.getFullYear(), today.getMonth(), 1)));
  const [periodEnd, setPeriodEnd] = useState(localDate(new Date(today.getFullYear(), today.getMonth() + 1, 0)));
  const [metric, setMetric] = useState<PerformanceLeaderboardMetric>('SCORE');
  const [rows, setRows] = useState<PerformanceLeaderboardRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async (nextMetric = metric) => {
    if (!periodStart || !periodEnd || periodEnd < periodStart) return setError('Choose a valid ranking period.');
    setIsLoading(true); setError('');
    try { setRows(await performanceService.getPerformanceLeaderboard(periodStart, periodEnd, nextMetric)); }
    catch (err: any) { setError(err.message || 'Could not load performance rankings.'); }
    finally { setIsLoading(false); }
  };

  useEffect(() => { load('SCORE'); }, []);

  const selectMetric = (nextMetric: PerformanceLeaderboardMetric) => {
    setMetric(nextMetric);
    load(nextMetric);
  };

  return <section className="space-y-4 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
    <div className="flex items-start justify-between gap-3"><div><p className="text-[9px] font-bold uppercase tracking-wider text-primary">Target-normalized</p><h2 className="font-semibold text-slate-900">Performance leaderboard</h2><p className="text-[10px] text-slate-400">Ranked by target achievement, capped at 120% per KPI.</p></div><Medal size={21} className="text-amber-500" /></div>
    <div className="grid grid-cols-2 gap-2"><label className="space-y-1 text-[10px] font-semibold text-slate-500"><span className="flex items-center gap-1"><CalendarRange size={11} />From</span><input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs font-normal" /></label><label className="space-y-1 text-[10px] font-semibold text-slate-500"><span className="flex items-center gap-1"><CalendarRange size={11} />To</span><input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs font-normal" /></label></div>
    <div className="flex gap-2 overflow-x-auto pb-1">{leaderboardOptions.map((option) => <button key={option.key} onClick={() => selectMetric(option.key)} className={`shrink-0 rounded-full px-3 py-2 text-[9px] font-bold uppercase tracking-wider ${metric === option.key ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-500'}`}>{option.label}</button>)}</div>
    <button onClick={() => load()} disabled={isLoading || !periodStart || !periodEnd || periodEnd < periodStart} className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 py-2.5 text-[9px] font-bold uppercase tracking-wider text-slate-600 disabled:opacity-40"><RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />Apply period</button>
    {error && <div role="alert" className="flex gap-2 rounded-xl bg-rose-50 p-3 text-xs text-rose-700"><AlertCircle size={15} className="shrink-0" />{error}</div>}
    {isLoading ? <div className="flex min-h-36 items-center justify-center"><Loader2 className="animate-spin text-primary" size={26} /></div> : rows.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-200 p-7 text-center text-xs text-slate-400">No employees have an eligible target for this period.</div> : <div className="space-y-2">{rows.map((row) => <article key={row.employeeId} className={`flex items-center gap-3 rounded-2xl p-3 ${row.employeeId === user.id ? 'bg-primary-light ring-1 ring-primary/15' : 'bg-slate-50'}`}><span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${row.rank <= 3 ? 'bg-amber-100 text-amber-700' : 'bg-white text-slate-400'}`}>#{row.rank}</span><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-slate-800">{row.employeeName}{row.employeeId === user.id ? ' · You' : ''}</p><p className="text-[9px] text-slate-400">{row.employeeCode || 'No employee code'} · target {formatPerformanceValue(row.targetValue, metric)}</p></div><div className="text-right"><p className="text-xs font-bold text-slate-800">{formatPerformanceValue(row.metricValue, metric)}</p><p className={`text-[9px] font-bold ${row.achievementPct >= 100 ? 'text-emerald-600' : 'text-slate-400'}`}>{row.achievementPct.toFixed(1)}% achieved</p></div></article>)}</div>}
  </section>;
};

export default PerformanceLeaderboard;
