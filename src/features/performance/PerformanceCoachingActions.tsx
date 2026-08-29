import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CalendarClock, CheckCircle2, ChevronDown, ClipboardCheck, Loader2, Plus } from 'lucide-react';
import { validateCoachingAction, validateCoachingStatusChange } from './coaching-guardrails';
import { metricConfig } from './performance-config';
import { performanceService } from './performance.service';
import { OUTCOME_METRIC_KEYS, type CoachingActionStatus, type OutcomeMetricKey, type PerformanceCoachingAction } from './performance.types';

const localDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const statusLabel: Record<CoachingActionStatus, string> = {
  OPEN: 'Open', IN_PROGRESS: 'In progress', COMPLETED: 'Completed', CANCELLED: 'Cancelled',
};
const statusTone: Record<CoachingActionStatus, string> = {
  OPEN: 'bg-blue-50 text-blue-700', IN_PROGRESS: 'bg-amber-50 text-amber-700',
  COMPLETED: 'bg-emerald-50 text-emerald-700', CANCELLED: 'bg-slate-100 text-slate-500',
};

interface Props {
  employeeId: string;
  employeeName: string;
  targetId?: string;
  suggestedMetric?: OutcomeMetricKey;
  canManage: boolean;
}

const PerformanceCoachingActions: React.FC<Props> = ({ employeeId, employeeName, targetId, suggestedMetric, canManage }) => {
  const today = localDate(new Date());
  const defaultDueDate = localDate(new Date(Date.now() + 7 * 86400000));
  const [isOpen, setIsOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [rows, setRows] = useState<PerformanceCoachingAction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [metricKey, setMetricKey] = useState<OutcomeMetricKey>(suggestedMetric || 'sales_amount');
  const [title, setTitle] = useState('');
  const [actionPlan, setActionPlan] = useState('');
  const [dueDate, setDueDate] = useState(defaultDueDate);
  const [nextStatuses, setNextStatuses] = useState<Record<string, Exclude<CoachingActionStatus, 'OPEN'>>>({});
  const [statusNotes, setStatusNotes] = useState<Record<string, string>>({});

  const activeCount = useMemo(() => rows.filter((row) => row.status === 'OPEN' || row.status === 'IN_PROGRESS').length, [rows]);

  const load = async () => {
    if (!employeeId) return;
    setIsLoading(true); setError('');
    try { setRows(await performanceService.listCoachingActions(employeeId)); }
    catch (err: any) { setError(err.message || 'Could not load coaching actions.'); }
    finally { setIsLoading(false); }
  };

  useEffect(() => {
    setRows([]); setNotice(''); setError(''); setShowCreate(false);
    setMetricKey(suggestedMetric || 'sales_amount');
    if (isOpen) load();
  }, [employeeId, suggestedMetric]);

  const toggle = () => {
    const next = !isOpen;
    setIsOpen(next);
    if (next && rows.length === 0) load();
  };

  const create = async () => {
    const validationError = validateCoachingAction(employeeId, title, actionPlan, dueDate, today);
    if (validationError) return setError(validationError);
    setIsSaving(true); setError(''); setNotice('');
    try {
      await performanceService.createCoachingAction(employeeId, targetId, metricKey, title, actionPlan, dueDate);
      setTitle(''); setActionPlan(''); setDueDate(defaultDueDate); setShowCreate(false);
      setNotice('Coaching action created and added to the audit trail.'); await load();
    } catch (err: any) { setError(err.message || 'Could not create coaching action.'); }
    finally { setIsSaving(false); }
  };

  const changeStatus = async (row: PerformanceCoachingAction) => {
    const status = nextStatuses[row.id] || (row.status === 'OPEN' ? 'IN_PROGRESS' : 'COMPLETED');
    const note = statusNotes[row.id] || '';
    const validationError = validateCoachingStatusChange(status, note);
    if (validationError) return setError(validationError);
    if ((status === 'COMPLETED' || status === 'CANCELLED') && !window.confirm(`Mark this coaching action ${statusLabel[status].toLowerCase()}? This transition cannot be reversed.`)) return;
    setIsSaving(true); setError(''); setNotice('');
    try {
      await performanceService.changeCoachingStatus(row.id, status, note);
      setNotice(`Coaching action marked ${statusLabel[status].toLowerCase()}.`);
      setStatusNotes((current) => ({ ...current, [row.id]: '' })); await load();
    } catch (err: any) { setError(err.message || 'Could not update coaching action.'); }
    finally { setIsSaving(false); }
  };

  return <section className="rounded-3xl border border-slate-100 bg-white shadow-sm">
    <button onClick={toggle} className="flex w-full items-center gap-3 p-5 text-left">
      <span className="rounded-2xl bg-emerald-50 p-3 text-emerald-700"><ClipboardCheck size={20} /></span>
      <span className="min-w-0 flex-1"><span className="block text-[9px] font-bold uppercase tracking-wider text-emerald-700">Outcome coaching</span><span className="block font-semibold text-slate-900">Actions for {employeeName}</span><span className="block text-[10px] text-slate-400">{isOpen ? `${activeCount} active actions` : 'Track agreed follow-up against outcome KPIs.'}</span></span>
      <ChevronDown size={18} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
    </button>
    {isOpen && <div className="space-y-4 border-t border-slate-100 p-5">
      {error && <div role="alert" className="flex gap-2 rounded-xl bg-rose-50 p-3 text-xs text-rose-700"><AlertCircle size={15} className="shrink-0" />{error}</div>}
      {notice && <div role="status" className="flex gap-2 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-700"><CheckCircle2 size={15} className="shrink-0" />{notice}</div>}
      {canManage && <button onClick={() => setShowCreate((value) => !value)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-[9px] font-bold uppercase tracking-wider text-white"><Plus size={13} />{showCreate ? 'Close form' : 'Create coaching action'}</button>}
      {showCreate && canManage && <div className="space-y-2 rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4">
        <select value={metricKey} onChange={(event) => setMetricKey(event.target.value as OutcomeMetricKey)} className="w-full rounded-xl border border-slate-200 bg-white p-2 text-xs">{OUTCOME_METRIC_KEYS.map((key) => <option key={key} value={key}>{metricConfig[key].label}</option>)}</select>
        <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} placeholder="Action title" className="w-full rounded-xl border border-slate-200 bg-white p-2 text-xs" />
        <textarea value={actionPlan} onChange={(event) => setActionPlan(event.target.value)} maxLength={2000} rows={3} placeholder="Specific action, owner, and expected outcome" className="w-full rounded-xl border border-slate-200 bg-white p-2 text-xs" />
        <label className="block text-[9px] font-semibold text-slate-500">Due date<input type="date" min={today} value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white p-2 text-xs font-normal" /></label>
        <button disabled={isSaving} onClick={create} className="w-full rounded-xl bg-slate-900 py-3 text-[9px] font-bold uppercase tracking-wider text-white disabled:opacity-40">Save action</button>
      </div>}
      {isLoading ? <div className="flex h-28 items-center justify-center"><Loader2 className="animate-spin text-primary" size={26} /></div> : rows.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-200 p-7 text-center text-xs text-slate-400">No coaching actions recorded.</div> : <div className="space-y-3">{rows.map((row) => {
        const isActive = row.status === 'OPEN' || row.status === 'IN_PROGRESS';
        const overdue = isActive && row.dueDate < today;
        const options: Array<Exclude<CoachingActionStatus, 'OPEN'>> = row.status === 'OPEN' ? ['IN_PROGRESS','COMPLETED','CANCELLED'] : ['COMPLETED','CANCELLED'];
        return <article key={row.id} className="rounded-2xl border border-slate-100 p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs font-semibold text-slate-800">{row.title}</p><p className="mt-1 text-[9px] font-semibold text-primary">{metricConfig[row.metricKey].label}</p></div><span className={`shrink-0 rounded-full px-2 py-1 text-[8px] font-bold ${statusTone[row.status]}`}>{statusLabel[row.status]}</span></div><p className="mt-3 whitespace-pre-wrap text-[11px] leading-5 text-slate-600">{row.actionPlan}</p><div className={`mt-3 flex items-center gap-1 text-[9px] ${overdue ? 'font-bold text-rose-600' : 'text-slate-400'}`}><CalendarClock size={12} />Due {new Date(`${row.dueDate}T00:00:00`).toLocaleDateString()}{overdue ? ' · overdue' : ''} · created by {row.createdByName}</div>{canManage && isActive && <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3"><select value={nextStatuses[row.id] || (row.status === 'OPEN' ? 'IN_PROGRESS' : 'COMPLETED')} onChange={(event) => setNextStatuses((current) => ({ ...current, [row.id]: event.target.value as Exclude<CoachingActionStatus, 'OPEN'> }))} className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-[10px]">{options.map((status) => <option key={status} value={status}>{statusLabel[status]}</option>)}</select><button disabled={isSaving} onClick={() => changeStatus(row)} className="rounded-xl bg-slate-900 px-3 text-[9px] font-bold uppercase text-white disabled:opacity-40">Update</button><input value={statusNotes[row.id] || ''} onChange={(event) => setStatusNotes((current) => ({ ...current, [row.id]: event.target.value }))} placeholder="Status note (required)" className="col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs" /></div>}</article>;
      })}</div>}
    </div>}
  </section>;
};

export default PerformanceCoachingActions;
