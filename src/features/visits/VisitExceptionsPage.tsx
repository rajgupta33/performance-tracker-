import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, MapPin, ShieldCheck, ShieldX, X } from 'lucide-react';
import { visitExceptionsService } from './visit-exceptions.service';
import type { VisitException } from './visit-exceptions.types';

const tone = {
  REVIEW: 'bg-amber-100 text-amber-700',
  OUTSIDE: 'bg-rose-100 text-rose-700',
  UNAVAILABLE: 'bg-slate-100 text-slate-600',
};

const VisitExceptionsPage: React.FC = () => {
  const [items, setItems] = useState<VisitException[]>([]);
  const [reviewing, setReviewing] = useState<{ item: VisitException; decision: 'APPROVED' | 'REJECTED' } | null>(null);
  const [note, setNote] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = async () => {
    setIsLoading(true); setError('');
    try { setItems(await visitExceptionsService.list()); }
    catch (err: any) { setError(err.message || 'Could not load visit exceptions.'); }
    finally { setIsLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const submit = async () => {
    if (!reviewing || !note.trim()) return setError('Add a review note.');
    setIsSaving(true); setError(''); setNotice('');
    try {
      await visitExceptionsService.review(reviewing.item.id, reviewing.decision, note.trim());
      setItems((current) => current.filter((item) => item.id !== reviewing.item.id));
      setNotice(`Visit exception ${reviewing.decision.toLowerCase()}. The original GPS status remains in the audit record.`);
      setReviewing(null); setNote('');
    } catch (err: any) { setError(err.message || 'Could not save the review.'); }
    finally { setIsSaving(false); }
  };

  if (isLoading) return <div className="flex min-h-80 items-center justify-center"><Loader2 className="animate-spin text-primary" size={36} /></div>;

  return <div className="space-y-5 animate-in fade-in duration-500">
    <header><p className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary">Management review</p><h1 className="text-2xl font-semibold text-slate-900">Visit exceptions</h1><p className="text-sm text-slate-500">Review GPS exceptions without rewriting the captured evidence.</p></header>
    {error && <div role="alert" className="flex gap-3 rounded-2xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-700"><AlertCircle size={18} className="shrink-0" />{error}</div>}
    {notice && <div role="status" className="flex gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-700"><CheckCircle2 size={18} className="shrink-0" />{notice}</div>}
    <div className="space-y-3">{items.length === 0 ? <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-400">No unreviewed visit exceptions.</div> : items.map((item) => <article key={item.id} className="space-y-3 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><span className={`rounded-full px-2 py-1 text-[8px] font-bold uppercase ${tone[item.locationStatus]}`}>{item.locationStatus}</span><h2 className="mt-2 font-semibold text-slate-900">{item.customerName}</h2><p className="text-xs text-slate-400">{item.employeeName} · {new Date(item.completedAt).toLocaleString()}</p></div><MapPin size={20} className="text-slate-400" /></div>
      <div className="grid grid-cols-2 gap-2 text-xs"><div className="rounded-xl bg-slate-50 p-3"><p className="text-[9px] font-bold uppercase text-slate-400">GPS accuracy</p><p className="mt-1 font-semibold text-slate-700">{item.accuracyM == null ? 'Unavailable' : `±${Math.round(item.accuracyM)} m`}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-[9px] font-bold uppercase text-slate-400">Customer distance</p><p className="mt-1 font-semibold text-slate-700">{item.distanceM == null ? 'Unavailable' : `${Math.round(item.distanceM)} m`}</p></div></div>
      {item.outcome && <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600"><strong>Outcome:</strong> {item.outcome}</p>}{item.notes && <p className="text-xs text-slate-500">{item.notes}</p>}
      <div className="flex gap-2"><button onClick={() => setReviewing({ item, decision: 'APPROVED' })} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-3 text-xs font-bold text-white"><ShieldCheck size={15} /> Approve evidence</button><button onClick={() => setReviewing({ item, decision: 'REJECTED' })} className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-rose-100 px-3 py-3 text-xs font-bold text-rose-600"><ShieldX size={15} /> Reject evidence</button></div>
    </article>)}</div>
    {reviewing && <div className="fixed inset-0 z-[110] flex items-end justify-center bg-slate-950/60 backdrop-blur-sm sm:items-center sm:p-4"><section className="w-full max-w-md space-y-4 rounded-t-3xl bg-white p-5 sm:rounded-3xl"><div className="flex items-center justify-between"><div><p className="text-[9px] font-bold uppercase tracking-wider text-primary">Audited decision</p><h2 className="text-xl font-semibold text-slate-900">{reviewing.decision === 'APPROVED' ? 'Approve' : 'Reject'} visit evidence</h2></div><button onClick={() => { setReviewing(null); setNote(''); }} className="rounded-xl bg-slate-100 p-2 text-slate-500"><X size={18} /></button></div><p className="text-xs text-slate-500">The captured coordinates, distance, and original verification status will not be changed.</p><label className="space-y-1 text-xs font-semibold text-slate-600">Review note *<textarea rows={4} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Explain the evidence and decision" className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-normal" /></label><button disabled={isSaving || !note.trim()} onClick={submit} className={`flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-xs font-bold uppercase tracking-wider text-white disabled:opacity-40 ${reviewing.decision === 'APPROVED' ? 'bg-emerald-600' : 'bg-rose-600'}`}>{isSaving && <Loader2 className="animate-spin" size={16} />}Confirm decision</button></section></div>}
  </div>;
};

export default VisitExceptionsPage;
