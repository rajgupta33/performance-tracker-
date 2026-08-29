import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Banknote, BriefcaseBusiness, CalendarRange, CheckCircle2, ClipboardList, ExternalLink, Loader2, MapPin, RefreshCw, ShieldAlert, Target, Users } from 'lucide-react';
import { safeRate } from './field-bi-metrics';
import { fieldBiService } from './field-bi.service';
import type { FieldBiException, FieldBiSnapshot } from './field-bi.types';

const localDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const money = (value: number) => `₹${value.toLocaleString('en-IN')}`;

const FieldBiPage: React.FC<{ onNavigate: (path: string, params?: unknown) => void }> = ({ onNavigate }) => {
  const now = new Date();
  const [periodStart, setPeriodStart] = useState(localDate(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [periodEnd, setPeriodEnd] = useState(localDate(now));
  const [snapshot, setSnapshot] = useState<FieldBiSnapshot | null>(null);
  const [exceptions, setExceptions] = useState<FieldBiException[]>([]);
  const [exceptionFilter, setExceptionFilter] = useState<'ALL' | FieldBiException['sourceType']>('ALL');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    if (!periodStart || !periodEnd || periodEnd < periodStart) return setError('Choose a valid reporting period.');
    setIsLoading(true); setError('');
    try {
      const result = await fieldBiService.load(periodStart, periodEnd);
      setSnapshot(result.snapshot); setExceptions(result.exceptions);
    } catch (err: any) { setError(err.message || 'Could not load the Field Force dashboard.'); }
    finally { setIsLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const visibleExceptions = useMemo(() => exceptions.filter((item) => exceptionFilter === 'ALL' || item.sourceType === exceptionFilter), [exceptionFilter, exceptions]);
  const highRisk = exceptions.filter((item) => item.severity === 'HIGH').length;
  const reviewRoute = (item: FieldBiException) => {
    if (item.sourceType === 'ATTENDANCE') return onNavigate('attendance-audit');
    if (item.sourceType === 'VISIT') return onNavigate('visit-exceptions');
    if (item.sourceType === 'FOLLOW_UP') return onNavigate('follow-ups');
    return onNavigate('collections');
  };
  const cards = snapshot ? [
    { label: 'Attendance reliability', value: `${safeRate(snapshot.attendance.present, snapshot.attendance.records)}%`, helper: `${snapshot.attendance.exceptions} exception records`, icon: CheckCircle2, tone: 'text-emerald-700 bg-emerald-50' },
    { label: 'Verified visits', value: `${safeRate(snapshot.visits.verified, snapshot.visits.completed)}%`, helper: `${snapshot.visits.completed} completed visits`, icon: MapPin, tone: 'text-blue-700 bg-blue-50' },
    { label: 'Open pipeline', value: money(snapshot.crm.openPipelineAmount), helper: `${snapshot.crm.activeLeads} active leads`, icon: BriefcaseBusiness, tone: 'text-violet-700 bg-violet-50' },
    { label: 'Won value', value: money(snapshot.crm.wonAmount), helper: 'Won during selected period', icon: Target, tone: 'text-cyan-700 bg-cyan-50' },
    { label: 'Collection reconciliation', value: `${safeRate(snapshot.collections.reconciledAmount, snapshot.collections.fieldReportedAmount)}%`, helper: `${money(snapshot.collections.reconciledAmount)} reconciled`, icon: Banknote, tone: 'text-amber-700 bg-amber-50' },
    { label: 'Target coverage', value: `${safeRate(snapshot.targets.coveredEmployees, snapshot.workforce.employees)}%`, helper: `${snapshot.targets.coveredEmployees} of ${snapshot.workforce.employees} employees`, icon: Users, tone: 'text-indigo-700 bg-indigo-50' },
  ] : [];

  return <div className="space-y-5 animate-in fade-in duration-500">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary">Management BI</p><h1 className="text-2xl font-semibold text-slate-900">Field Force overview</h1><p className="text-sm text-slate-500">Monitor outcomes, operational quality, and exceptions requiring action.</p></div><button disabled={isLoading} onClick={load} className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-600 disabled:opacity-40"><RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} /> Refresh</button></header>
    <section className="grid grid-cols-2 gap-3 rounded-3xl border border-slate-100 bg-white p-4"><label className="space-y-1 text-xs font-semibold text-slate-600"><span className="flex items-center gap-1"><CalendarRange size={13} />From</span><input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-normal" /></label><label className="space-y-1 text-xs font-semibold text-slate-600"><span className="flex items-center gap-1"><CalendarRange size={13} />To</span><input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-normal" /></label><button onClick={load} disabled={isLoading || !periodStart || !periodEnd || periodEnd < periodStart} className="col-span-2 rounded-xl bg-primary py-3 text-xs font-bold uppercase tracking-wider text-white disabled:opacity-40">Apply period</button></section>
    {error && <div role="alert" className="flex gap-3 rounded-2xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-700"><AlertCircle size={18} className="shrink-0" />{error}</div>}
    {isLoading && !snapshot ? <div className="flex min-h-80 items-center justify-center"><Loader2 className="animate-spin text-primary" size={36} /></div> : snapshot && <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">{cards.map(({ label, value, helper, icon: Icon, tone }) => <article key={label} className="rounded-3xl border border-slate-100 bg-white p-4 shadow-sm"><div className={`mb-3 inline-flex rounded-xl p-2 ${tone}`}><Icon size={18} /></div><p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{label}</p><p className="mt-1 text-xl font-bold text-slate-900">{value}</p><p className="mt-1 text-[10px] text-slate-400">{helper}</p></article>)}</div>
      <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><p className="text-[9px] font-bold uppercase tracking-wider text-primary">Operational flow</p><h2 className="font-semibold text-slate-900">Verification and reconciliation</h2></div><ClipboardList size={20} className="text-slate-400" /></div><div className="mt-5 space-y-4">{[
        { label: 'Visits verified', value: snapshot.visits.verified, total: snapshot.visits.completed, color: 'bg-blue-500' },
        { label: 'Collections reconciled', value: snapshot.collections.reconciledAmount, total: snapshot.collections.fieldReportedAmount, color: 'bg-emerald-500' },
        { label: 'Employees with targets', value: snapshot.targets.coveredEmployees, total: snapshot.workforce.employees, color: 'bg-violet-500' },
      ].map((row) => { const rate = safeRate(row.value, row.total); return <div key={row.label}><div className="mb-1 flex justify-between text-xs"><span className="font-semibold text-slate-600">{row.label}</span><span className="font-bold text-slate-500">{rate}%</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${row.color}`} style={{ width: `${Math.min(100, rate)}%` }} /></div></div>; })}</div></section>
      <section className="space-y-3"><div className="flex items-end justify-between"><div><p className="text-[9px] font-bold uppercase tracking-wider text-rose-600">Action queue</p><h2 className="font-semibold text-slate-900">Exceptions requiring review</h2></div><span className="rounded-full bg-rose-50 px-3 py-1 text-[10px] font-bold text-rose-700">{highRisk} high risk</span></div><div className="flex gap-2 overflow-x-auto pb-1">{(['ALL','ATTENDANCE','VISIT','FOLLOW_UP','COLLECTION'] as const).map((item) => <button key={item} onClick={() => setExceptionFilter(item)} className={`shrink-0 rounded-full px-3 py-2 text-[9px] font-bold uppercase tracking-wider ${exceptionFilter === item ? 'bg-slate-900 text-white' : 'bg-white text-slate-400 ring-1 ring-slate-100'}`}>{item.replace('_', ' ')}</button>)}</div>
        <div className="space-y-2">{visibleExceptions.length === 0 ? <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-400">No exceptions in this view.</div> : visibleExceptions.map((item) => <article key={`${item.sourceType}-${item.sourceId}`} className="flex gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm"><div className={`mt-0.5 rounded-xl p-2 ${item.severity === 'HIGH' ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'}`}><ShieldAlert size={16} /></div><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><div><p className="text-xs font-semibold text-slate-800">{item.title}</p><p className="text-[10px] text-slate-500">{item.employeeName} · {item.detail}</p></div><span className={`rounded-full px-2 py-1 text-[8px] font-bold ${item.severity === 'HIGH' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>{item.severity}</span></div><div className="mt-2 flex items-center justify-between gap-2"><p className="text-[9px] text-slate-400">{new Date(item.occurredAt).toLocaleString()} · {item.sourceType.replace('_', ' ')}</p><button onClick={() => reviewRoute(item)} className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-primary">Review <ExternalLink size={11} /></button></div></div></article>)}</div>
      </section>
      <p className="text-center text-[9px] text-slate-400">Snapshot generated {new Date(snapshot.generatedAt).toLocaleString()}. Refresh to query current operational records.</p>
    </>}
  </div>;
};

export default FieldBiPage;
