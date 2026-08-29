import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, CalendarCheck2, CheckCircle2, Clock3, Loader2, Phone, X } from 'lucide-react';
import type { FollowUpType } from '../leads/leads.types';
import { followUpBucket } from './followup-bucket';
import { followUpsService } from './followups.service';
import type { CrmFollowUp, FollowUpBucket } from './followups.types';

const buckets: { id: FollowUpBucket; label: string }[] = [
  { id: 'OVERDUE', label: 'Overdue' },
  { id: 'TODAY', label: 'Today' },
  { id: 'UPCOMING', label: 'Upcoming' },
  { id: 'DONE', label: 'Done' },
];

const bucketTone: Record<FollowUpBucket, string> = {
  OVERDUE: 'bg-rose-100 text-rose-700',
  TODAY: 'bg-amber-100 text-amber-700',
  UPCOMING: 'bg-blue-100 text-blue-700',
  DONE: 'bg-emerald-100 text-emerald-700',
};

const FollowUpsPage: React.FC = () => {
  const [items, setItems] = useState<CrmFollowUp[]>([]);
  const [bucket, setBucket] = useState<FollowUpBucket>('TODAY');
  const [completing, setCompleting] = useState<CrmFollowUp | null>(null);
  const [completionNote, setCompletionNote] = useState('');
  const [nextDueAt, setNextDueAt] = useState('');
  const [nextType, setNextType] = useState<FollowUpType>('CALL');
  const [nextNote, setNextNote] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setIsLoading(true); setError('');
    try { setItems(await followUpsService.list()); }
    catch (err: any) { setError(err.message || 'Could not load follow-ups.'); }
    finally { setIsLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const counts = useMemo(() => Object.fromEntries(buckets.map(({ id }) => [id, items.filter((item) => followUpBucket(item) === id).length])) as Record<FollowUpBucket, number>, [items]);
  const visible = useMemo(() => items.filter((item) => followUpBucket(item) === bucket), [items, bucket]);
  const isTerminal = completing?.lead.stage === 'WON' || completing?.lead.stage === 'LOST';

  const close = () => {
    setCompleting(null); setCompletionNote(''); setNextDueAt(''); setNextType('CALL'); setNextNote('');
  };

  const complete = async () => {
    if (!completing || !completionNote.trim()) return setError('Add a completion note.');
    if (!isTerminal && !nextDueAt) return setError('Schedule the next action for this active lead.');
    setIsSaving(true); setError('');
    try {
      await followUpsService.complete(completing.id, {
        completionNote: completionNote.trim(),
        nextDueAt: nextDueAt ? new Date(nextDueAt).toISOString() : undefined,
        nextType,
        nextNote: nextNote.trim() || undefined,
      });
      close();
      await load();
    } catch (err: any) { setError(err.message || 'Could not complete the follow-up.'); }
    finally { setIsSaving(false); }
  };

  if (isLoading) return <div className="flex min-h-80 items-center justify-center"><Loader2 className="animate-spin text-primary" size={36} /></div>;

  return <div className="space-y-5 animate-in fade-in duration-500">
    <header><p className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary">CRM</p><h1 className="text-2xl font-semibold text-slate-900">Follow-ups</h1><p className="text-sm text-slate-500">Work the next action before the lead goes cold.</p></header>

    {error && <div role="alert" className="flex gap-3 rounded-2xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-700"><AlertCircle size={18} className="shrink-0" />{error}</div>}

    <div className="flex gap-2 overflow-x-auto pb-1">
      {buckets.map((item) => <button key={item.id} onClick={() => setBucket(item.id)} className={`shrink-0 rounded-full px-3 py-2 text-[10px] font-bold uppercase tracking-wider ${bucket === item.id ? bucketTone[item.id] : 'bg-white text-slate-400 ring-1 ring-slate-100'}`}>{item.label} · {counts[item.id]}</button>)}
    </div>

    <div className="space-y-3">
      {visible.length === 0 ? <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-400">No {bucket.toLowerCase()} follow-ups.</div> : visible.map((item) => {
        const itemBucket = followUpBucket(item);
        return <article key={item.id} className="space-y-3 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3"><div><span className={`rounded-full px-2 py-1 text-[8px] font-bold uppercase ${bucketTone[itemBucket]}`}>{item.type}</span><h2 className="mt-2 font-semibold text-slate-900">{item.lead.customer?.name || item.lead.prospectName}</h2><p className="text-xs text-slate-400">{item.lead.contactName || 'No contact'}{item.lead.mobile ? ` · ${item.lead.mobile}` : ''}</p></div><p className="flex items-center gap-1 text-right text-xs font-medium text-slate-500"><Clock3 size={14} />{new Date(item.dueAt).toLocaleString()}</p></div>
          {item.note && <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">{item.note}</p>}
          {item.completionNote && <p className="flex gap-2 text-xs text-emerald-700"><CheckCircle2 size={15} className="shrink-0" />{item.completionNote}</p>}
          {item.status === 'OPEN' && <div className="flex gap-2">{item.lead.mobile && <a href={`tel:${item.lead.mobile}`} className="flex items-center justify-center rounded-xl border border-slate-200 px-4 text-slate-600"><Phone size={16} /></a>}<button onClick={() => setCompleting(item)} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-3 py-3 text-xs font-bold text-white"><CalendarCheck2 size={16} /> Complete & plan next</button></div>}
        </article>;
      })}
    </div>

    {completing && <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/60 backdrop-blur-sm sm:items-center sm:p-4"><section className="w-full max-w-xl space-y-4 rounded-t-3xl bg-white p-5 sm:rounded-3xl"><div className="flex items-center justify-between"><div><p className="text-[9px] font-bold uppercase tracking-wider text-primary">Close the loop</p><h2 className="text-xl font-semibold text-slate-900">Complete follow-up</h2></div><button onClick={close} className="rounded-xl bg-slate-100 p-2 text-slate-500"><X size={18} /></button></div>
      <label className="space-y-1 text-xs font-semibold text-slate-600">Completion note *<textarea rows={3} value={completionNote} onChange={(e) => setCompletionNote(e.target.value)} placeholder="What happened?" className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-normal" /></label>
      {!isTerminal && <><div className="rounded-2xl bg-amber-50 p-3 text-xs text-amber-800">This lead is still active, so its next action is required.</div><div className="grid grid-cols-2 gap-3"><label className="space-y-1 text-xs font-semibold text-slate-600">Next date *<input type="datetime-local" value={nextDueAt} onChange={(e) => setNextDueAt(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-normal" /></label><label className="space-y-1 text-xs font-semibold text-slate-600">Type<select value={nextType} onChange={(e) => setNextType(e.target.value as FollowUpType)} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-normal">{(['CALL','VISIT','EMAIL','MESSAGE','OTHER'] as FollowUpType[]).map((type) => <option key={type}>{type}</option>)}</select></label></div><label className="space-y-1 text-xs font-semibold text-slate-600">Next action note<textarea rows={2} value={nextNote} onChange={(e) => setNextNote(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-normal" /></label></>}
      <button disabled={isSaving || !completionNote.trim() || (!isTerminal && !nextDueAt)} onClick={complete} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-xs font-bold uppercase tracking-wider text-white disabled:opacity-40">{isSaving ? <Loader2 className="animate-spin" size={17} /> : <CheckCircle2 size={17} />} Complete follow-up</button>
    </section></div>}
  </div>;
};

export default FollowUpsPage;
