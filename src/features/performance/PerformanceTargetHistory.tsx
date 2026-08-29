import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Copy, History, Loader2, LockKeyhole } from 'lucide-react';
import { nextTargetPeriod, progressWidth } from './performance-score';
import { performanceService } from './performance.service';
import type { PerformanceTargetHistoryRow } from './performance.types';

interface Props {
  employeeId: string;
  canManage: boolean;
  onChanged: () => void;
}

const statusTone: Record<PerformanceTargetHistoryRow['targetStatus'], string> = {
  DRAFT: 'bg-amber-50 text-amber-700',
  ACTIVE: 'bg-emerald-50 text-emerald-700',
  CLOSED: 'bg-slate-100 text-slate-500',
};

const PerformanceTargetHistory: React.FC<Props> = ({ employeeId, canManage, onChanged }) => {
  const [rows, setRows] = useState<PerformanceTargetHistoryRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [workingId, setWorkingId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = async () => {
    setIsLoading(true); setError('');
    try { setRows(await performanceService.getTargetHistory(employeeId)); }
    catch (err: any) { setError(err.message || 'Could not load target history.'); }
    finally { setIsLoading(false); }
  };

  useEffect(() => { load(); }, [employeeId]);

  const run = async (targetId: string, action: () => Promise<void>, success: string) => {
    setWorkingId(targetId); setError(''); setNotice('');
    try { await action(); setNotice(success); await load(); onChanged(); }
    catch (err: any) { setError(err.message || 'Could not update the target.'); }
    finally { setWorkingId(''); }
  };

  const copyNext = (row: PerformanceTargetHistoryRow) => {
    const next = nextTargetPeriod(row.periodStart, row.periodEnd);
    return run(row.targetId, () => performanceService.copyTarget(row.targetId, next.periodStart, next.periodEnd), `Draft copied for ${next.periodStart} to ${next.periodEnd}.`);
  };

  const close = (row: PerformanceTargetHistoryRow) => {
    if (!window.confirm('Close and permanently lock this target period? It cannot be reopened.')) return;
    run(row.targetId, () => performanceService.changeTargetStatus(row.targetId, 'CLOSED'), 'Target period closed and locked.');
  };

  return <section className="space-y-4 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
    <div className="flex items-start justify-between gap-3"><div><p className="text-[9px] font-bold uppercase tracking-wider text-primary">Period history</p><h2 className="font-semibold text-slate-900">Target lifecycle</h2><p className="text-[10px] text-slate-400">Draft, activate, compare, and permanently close periods.</p></div><History size={20} className="text-slate-400" /></div>
    {error && <div role="alert" className="flex gap-2 rounded-xl bg-rose-50 p-3 text-xs text-rose-700"><AlertCircle size={15} className="shrink-0" />{error}</div>}
    {notice && <div role="status" className="rounded-xl bg-emerald-50 p-3 text-xs text-emerald-700">{notice}</div>}
    {isLoading ? <div className="flex min-h-32 items-center justify-center"><Loader2 className="animate-spin text-primary" size={26} /></div> : rows.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-200 p-7 text-center text-xs text-slate-400">No target history yet.</div> : <div className="space-y-3">{rows.map((row) => <article key={row.targetId} className="rounded-2xl border border-slate-100 p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold text-slate-800">{new Date(`${row.periodStart}T00:00:00`).toLocaleDateString()} – {new Date(`${row.periodEnd}T00:00:00`).toLocaleDateString()}</p><p className="mt-1 text-[9px] text-slate-400">{row.metricCount} outcome KPIs · updated {new Date(row.updatedAt).toLocaleDateString()}</p></div><span className={`rounded-full px-2 py-1 text-[8px] font-bold ${statusTone[row.targetStatus]}`}>{row.targetStatus}</span></div><div className="mt-3 flex items-center gap-3"><div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-primary" style={{ width: `${progressWidth(row.outcomeScore)}%` }} /></div><span className="w-14 text-right text-xs font-bold text-slate-700">{row.outcomeScore.toFixed(1)}</span></div>{canManage && <div className="mt-3 flex flex-wrap gap-2">{row.targetStatus !== 'DRAFT' && <button disabled={Boolean(workingId)} onClick={() => copyNext(row)} className="flex items-center gap-1 rounded-xl bg-slate-50 px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-slate-600 disabled:opacity-40"><Copy size={12} />Copy next</button>}{row.targetStatus === 'DRAFT' && <button disabled={Boolean(workingId)} onClick={() => run(row.targetId, () => performanceService.changeTargetStatus(row.targetId, 'ACTIVE'), 'Draft target activated.')} className="flex items-center gap-1 rounded-xl bg-emerald-50 px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-emerald-700 disabled:opacity-40"><CheckCircle2 size={12} />Activate</button>}{row.targetStatus === 'ACTIVE' && <button disabled={Boolean(workingId)} onClick={() => close(row)} className="flex items-center gap-1 rounded-xl bg-rose-50 px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-rose-700 disabled:opacity-40"><LockKeyhole size={12} />Close & lock</button>}</div>}</article>)}</div>}
  </section>;
};

export default PerformanceTargetHistory;
