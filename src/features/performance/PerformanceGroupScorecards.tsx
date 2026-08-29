import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CalendarRange, CircleAlert, Crown, Loader2, RefreshCw, ShieldCheck, UsersRound } from 'lucide-react';
import { progressWidth } from './performance-score';
import { performanceService } from './performance.service';
import type { PerformanceGroupScorecard, PerformanceGroupType } from './performance.types';

const PerformanceGroupTrend = React.lazy(() => import('./PerformanceGroupTrend'));

const localDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const PerformanceGroupScorecards: React.FC = () => {
  const today = new Date();
  const [periodStart, setPeriodStart] = useState(localDate(new Date(today.getFullYear(), today.getMonth(), 1)));
  const [periodEnd, setPeriodEnd] = useState(localDate(new Date(today.getFullYear(), today.getMonth() + 1, 0)));
  const [groupType, setGroupType] = useState<PerformanceGroupType>('TEAM');
  const [rows, setRows] = useState<PerformanceGroupScorecard[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const selected = useMemo(() => rows.find((row) => row.groupId === selectedId) || rows[0], [rows, selectedId]);

  const load = async (nextType = groupType) => {
    if (!periodStart || !periodEnd || periodEnd < periodStart) return setError('Choose a valid scorecard period.');
    setIsLoading(true); setError('');
    try {
      const data = await performanceService.getGroupScorecards(periodStart, periodEnd, nextType);
      setRows(data); setSelectedId((current) => data.some((row) => row.groupId === current) ? current : data[0]?.groupId || '');
    } catch (err: any) { setError(err.message || 'Could not load group scorecards.'); }
    finally { setIsLoading(false); }
  };

  useEffect(() => { load('TEAM'); }, []);

  const changeType = (nextType: PerformanceGroupType) => {
    setGroupType(nextType); setSelectedId(''); load(nextType);
  };

  const cards = selected ? [
    { label: 'Target coverage', value: `${selected.coveragePct.toFixed(1)}%`, helper: `${selected.targetedEmployees} of ${selected.eligibleEmployees}`, tone: 'bg-blue-50 text-blue-700' },
    { label: 'Average score', value: selected.averageScore.toFixed(1), helper: 'Targeted employees', tone: 'bg-violet-50 text-violet-700' },
    { label: 'At target', value: String(selected.achievedCount), helper: 'Score of 100+', tone: 'bg-emerald-50 text-emerald-700' },
    { label: 'Needs attention', value: String(selected.needsAttentionCount), helper: 'Score below 60', tone: 'bg-amber-50 text-amber-700' },
  ] : [];

  return <section className="space-y-4 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
    <div className="flex items-start justify-between gap-3"><div><p className="text-[9px] font-bold uppercase tracking-wider text-primary">Management scorecards</p><h2 className="font-semibold text-slate-900">Team and territory performance</h2><p className="text-[10px] text-slate-400">Coverage, outcome score, and coaching signals for authorized groups.</p></div><UsersRound size={21} className="text-primary" /></div>
    <div className="grid grid-cols-2 gap-2"><button onClick={() => changeType('TEAM')} className={`rounded-xl py-2.5 text-[9px] font-bold uppercase tracking-wider ${groupType === 'TEAM' ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-500'}`}>Teams</button><button onClick={() => changeType('TERRITORY')} className={`rounded-xl py-2.5 text-[9px] font-bold uppercase tracking-wider ${groupType === 'TERRITORY' ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-500'}`}>Territories</button></div>
    <div className="grid grid-cols-2 gap-2"><label className="space-y-1 text-[10px] font-semibold text-slate-500"><span className="flex items-center gap-1"><CalendarRange size={11} />From</span><input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs font-normal" /></label><label className="space-y-1 text-[10px] font-semibold text-slate-500"><span className="flex items-center gap-1"><CalendarRange size={11} />To</span><input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs font-normal" /></label></div>
    <button onClick={() => load()} disabled={isLoading || !periodStart || !periodEnd || periodEnd < periodStart} className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 py-2.5 text-[9px] font-bold uppercase tracking-wider text-slate-600 disabled:opacity-40"><RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />Apply period</button>
    {error && <div role="alert" className="flex gap-2 rounded-xl bg-rose-50 p-3 text-xs text-rose-700"><AlertCircle size={15} className="shrink-0" />{error}</div>}
    {isLoading ? <div className="flex min-h-48 items-center justify-center"><Loader2 className="animate-spin text-primary" size={28} /></div> : !selected ? <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-xs text-slate-400">No authorized {groupType.toLowerCase()} scorecards have eligible employees.</div> : <>
      <div className="flex gap-2 overflow-x-auto pb-1">{rows.map((row) => <button key={row.groupId} onClick={() => setSelectedId(row.groupId)} className={`shrink-0 rounded-full px-3 py-2 text-[9px] font-bold ${selected.groupId === row.groupId ? 'bg-primary text-white' : 'bg-slate-50 text-slate-500'}`}>{row.groupName} · {row.averageScore.toFixed(0)}</button>)}</div>
      <div className="grid grid-cols-2 gap-3">{cards.map((card) => <article key={card.label} className={`rounded-2xl p-4 ${card.tone}`}><p className="text-[8px] font-bold uppercase tracking-wider opacity-70">{card.label}</p><p className="mt-1 text-2xl font-bold">{card.value}</p><p className="text-[9px] opacity-70">{card.helper}</p></article>)}</div>
      <div><div className="mb-1 flex justify-between text-[10px] font-semibold text-slate-500"><span>Average outcome achievement</span><span>{selected.averageScore.toFixed(1)} / 100</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-primary" style={{ width: `${progressWidth(selected.averageScore)}%` }} /></div></div>
      <React.Suspense fallback={<div className="flex h-56 items-center justify-center rounded-2xl border border-slate-100"><Loader2 className="animate-spin text-primary" size={26} /></div>}><PerformanceGroupTrend scorecard={selected} selectedPeriodStart={periodStart} selectedPeriodEnd={periodEnd} /></React.Suspense>
      <div className="grid gap-3 sm:grid-cols-2">{selected.topEmployeeName ? <article className="rounded-2xl border border-amber-100 bg-amber-50 p-4"><div className="flex items-center gap-2 text-amber-700"><Crown size={16} /><p className="text-[9px] font-bold uppercase tracking-wider">Top performer</p></div><p className="mt-2 text-sm font-semibold text-amber-900">{selected.topEmployeeName}</p><p className="text-[10px] text-amber-700">Outcome score {selected.topEmployeeScore?.toFixed(1)}</p></article> : <article className="rounded-2xl border border-dashed border-slate-200 p-4 text-xs text-slate-400">No targeted employees yet.</article>}
        <article className={`rounded-2xl border p-4 ${selected.eligibleEmployees === selected.targetedEmployees ? 'border-emerald-100 bg-emerald-50' : 'border-blue-100 bg-blue-50'}`}><div className={`flex items-center gap-2 ${selected.eligibleEmployees === selected.targetedEmployees ? 'text-emerald-700' : 'text-blue-700'}`}>{selected.eligibleEmployees === selected.targetedEmployees ? <ShieldCheck size={16} /> : <CircleAlert size={16} />}<p className="text-[9px] font-bold uppercase tracking-wider">Coverage status</p></div><p className="mt-2 text-sm font-semibold text-slate-800">{selected.eligibleEmployees - selected.targetedEmployees} employees without targets</p></article></div>
      {selected.attentionEmployeeNames.length > 0 && <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4"><div className="flex items-center gap-2 text-amber-700"><CircleAlert size={15} /><p className="text-[9px] font-bold uppercase tracking-wider">Coaching attention</p></div><p className="mt-2 text-xs text-amber-900">{selected.attentionEmployeeNames.join(' · ')}</p><p className="mt-1 text-[9px] text-amber-700">Lowest targeted scores below 60; review KPI drivers before action.</p></div>}
    </>}
  </section>;
};

export default PerformanceGroupScorecards;
