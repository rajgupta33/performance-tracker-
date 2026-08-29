import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Banknote, CheckCircle2, IndianRupee, Loader2, MapPin, Plus, Search, ShieldCheck, X } from 'lucide-react';
import type { User } from '../../types';
import { captureVisitPosition } from '../visits/visit-location';
import { visitsService } from '../visits/visits.service';
import type { CustomerSummary } from '../visits/visits.types';
import { collectionStatusLabel, nextCollectionAction } from './collection-status';
import { collectionsService } from './collections.service';
import { COLLECTION_STATUSES, type CollectionStatus, type FieldCollection, type PaymentMode } from './collections.types';

const statusTone: Record<CollectionStatus, string> = {
  SUBMITTED: 'bg-amber-100 text-amber-700',
  VERIFIED: 'bg-blue-100 text-blue-700',
  RECONCILED: 'bg-emerald-100 text-emerald-700',
  REJECTED: 'bg-rose-100 text-rose-700',
};

const CollectionsPage: React.FC<{ user: User }> = ({ user }) => {
  const [items, setItems] = useState<FieldCollection[]>([]);
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [status, setStatus] = useState<CollectionStatus>('SUBMITTED');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('UPI');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [rejecting, setRejecting] = useState<FieldCollection | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const canReview = ['ADMIN', 'HR', 'MANAGER'].includes(user.role);

  const load = async () => {
    setIsLoading(true); setError('');
    try {
      const [collectionRows, customerRows] = await Promise.all([collectionsService.list(), visitsService.listCustomers()]);
      setItems(collectionRows); setCustomers(customerRows);
    } catch (err: any) { setError(err.message || 'Could not load collections.'); }
    finally { setIsLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const counts = useMemo(() => Object.fromEntries(COLLECTION_STATUSES.map((item) => [item, items.filter((entry) => entry.status === item).length])) as Record<CollectionStatus, number>, [items]);
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((entry) => entry.status === status).filter((entry) => !term || `${entry.customer?.name || ''} ${entry.reference || ''}`.toLowerCase().includes(term));
  }, [items, search, status]);
  const submittedTotal = items.filter((entry) => entry.status !== 'REJECTED').reduce((sum, entry) => sum + entry.amount, 0);
  const reconciledTotal = items.filter((entry) => entry.status === 'RECONCILED').reduce((sum, entry) => sum + entry.amount, 0);

  const submit = async () => {
    if (!customerId || Number(amount) <= 0) return setError('Choose a customer and enter a positive amount.');
    if (paymentMode !== 'CASH' && !reference.trim()) return setError('Payment reference is required for non-cash collections.');
    setIsSaving(true); setError(''); setNotice('Capturing current location…');
    try {
      const position = await captureVisitPosition();
      setNotice('Submitting collection…');
      const entry = await collectionsService.submit({
        customerId, amount: Number(amount), paymentMode,
        reference: reference.trim() || undefined, notes: notes.trim() || undefined, position,
      });
      setItems((current) => [entry, ...current]); setStatus('SUBMITTED'); setShowCreate(false);
      setCustomerId(''); setAmount(''); setPaymentMode('UPI'); setReference(''); setNotes('');
      setNotice(entry.duplicateSuspected ? 'Submitted for review. A possible duplicate was flagged.' : 'Collection submitted for verification.');
    } catch (err: any) { setNotice(''); setError(err.message || 'Could not submit the collection.'); }
    finally { setIsSaving(false); }
  };

  const review = async (entry: FieldCollection, target: 'VERIFIED' | 'RECONCILED' | 'REJECTED', note?: string) => {
    setIsSaving(true); setError(''); setNotice('');
    try {
      const updated = await collectionsService.review(entry.id, target, note);
      setItems((current) => current.map((item) => item.id === entry.id ? updated : item));
      setRejecting(null); setRejectionReason(''); setNotice(`Collection marked ${target.toLowerCase()}.`);
    } catch (err: any) { setError(err.message || 'Could not review the collection.'); }
    finally { setIsSaving(false); }
  };

  if (isLoading) return <div className="flex min-h-80 items-center justify-center"><Loader2 className="animate-spin text-primary" size={36} /></div>;

  return <div className="space-y-5 animate-in fade-in duration-500">
    <header className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary">Field finance</p><h1 className="text-2xl font-semibold text-slate-900">Collections</h1><p className="text-sm text-slate-500">Field reported ₹{submittedTotal.toLocaleString('en-IN')} · Reconciled ₹{reconciledTotal.toLocaleString('en-IN')}</p></div><button onClick={() => setShowCreate(true)} className="flex items-center gap-2 rounded-2xl bg-primary px-4 py-3 text-xs font-bold text-white"><Plus size={16} /> Report collection</button></header>
    {error && <div role="alert" className="flex gap-3 rounded-2xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-700"><AlertCircle size={18} className="shrink-0" />{error}</div>}
    {notice && <div role="status" className="flex gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-700"><CheckCircle2 size={18} className="shrink-0" />{notice}</div>}
    <div className="flex gap-2 overflow-x-auto pb-1">{COLLECTION_STATUSES.map((item) => <button key={item} onClick={() => setStatus(item)} className={`shrink-0 rounded-full px-3 py-2 text-[10px] font-bold uppercase tracking-wider ${status === item ? statusTone[item] : 'bg-white text-slate-400 ring-1 ring-slate-100'}`}>{collectionStatusLabel(item)} · {counts[item]}</button>)}</div>
    <label className="relative block"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search customer or reference" className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-3 text-sm outline-none focus:border-primary" /></label>
    <div className="space-y-3">{visible.length === 0 ? <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-400">No {collectionStatusLabel(status).toLowerCase()} collections.</div> : visible.map((entry) => {
      const next = nextCollectionAction(entry.status);
      return <article key={entry.id} className="space-y-3 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><span className={`rounded-full px-2 py-1 text-[8px] font-bold uppercase ${statusTone[entry.status]}`}>{collectionStatusLabel(entry.status)}</span><h2 className="mt-2 font-semibold text-slate-900">{entry.customer?.name}</h2><p className="text-xs text-slate-400">{entry.paymentMode}{entry.reference ? ` · ${entry.reference}` : ''} · {new Date(entry.submittedAt).toLocaleString()}</p></div><p className="flex items-center text-base font-semibold text-slate-800"><IndianRupee size={15} />{entry.amount.toLocaleString('en-IN')}</p></div>
      <p className="flex items-center gap-2 text-xs text-slate-500"><MapPin size={14} />GPS accuracy ±{Math.round(entry.accuracyM)} m</p>{entry.notes && <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">{entry.notes}</p>}{entry.duplicateSuspected && <p className="flex gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-800"><AlertCircle size={15} className="shrink-0" />Possible duplicate: check customer, amount, date, and reference.</p>}{entry.reviewNote && <p className="rounded-xl bg-rose-50 p-3 text-xs text-rose-700">Review note: {entry.reviewNote}</p>}
      {canReview && next && <div className="flex gap-2"><button disabled={isSaving} onClick={() => review(entry, next as 'VERIFIED' | 'RECONCILED')} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-3 py-3 text-xs font-bold text-white disabled:opacity-40"><ShieldCheck size={15} /> Mark {next.toLowerCase()}</button><button onClick={() => setRejecting(entry)} className="rounded-xl border border-rose-100 px-4 text-xs font-semibold text-rose-600">Reject</button></div>}
      </article>;
    })}</div>

    {showCreate && <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/60 backdrop-blur-sm sm:items-center sm:p-4"><section className="w-full max-w-xl space-y-4 rounded-t-3xl bg-white p-5 sm:rounded-3xl"><div className="flex items-center justify-between"><div><p className="text-[9px] font-bold uppercase tracking-wider text-primary">Field reported</p><h2 className="text-xl font-semibold text-slate-900">Report collection</h2></div><button onClick={() => setShowCreate(false)} className="rounded-xl bg-slate-100 p-2 text-slate-500"><X size={18} /></button></div>
      <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">This is an operational claim until a manager verifies it and accounting reconciliation is complete.</p>
      <label className="space-y-1 text-xs font-semibold text-slate-600">Customer *<select value={customerId} onChange={(event) => setCustomerId(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-normal"><option value="">Select customer</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label>
      <div className="grid grid-cols-2 gap-3"><label className="space-y-1 text-xs font-semibold text-slate-600">Amount (INR) *<input type="number" min="1" value={amount} onChange={(event) => setAmount(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-normal" /></label><label className="space-y-1 text-xs font-semibold text-slate-600">Payment mode *<select value={paymentMode} onChange={(event) => setPaymentMode(event.target.value as PaymentMode)} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-normal">{(['BANK','UPI','CHEQUE','CASH'] as PaymentMode[]).map((mode) => <option key={mode}>{mode}</option>)}</select></label></div>
      <label className="space-y-1 text-xs font-semibold text-slate-600">Reference {paymentMode === 'CASH' ? '(optional)' : '*'}<input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Transaction, UTR, or cheque number" className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-normal" /></label>
      <label className="space-y-1 text-xs font-semibold text-slate-600">Notes<textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-normal" /></label>
      <button disabled={isSaving || !customerId || Number(amount) <= 0 || (paymentMode !== 'CASH' && !reference.trim())} onClick={submit} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-xs font-bold uppercase tracking-wider text-white disabled:opacity-40">{isSaving ? <Loader2 className="animate-spin" size={17} /> : <Banknote size={17} />} Capture GPS & submit</button>
    </section></div>}

    {rejecting && <div className="fixed inset-0 z-[110] flex items-end justify-center bg-slate-950/60 backdrop-blur-sm sm:items-center sm:p-4"><section className="w-full max-w-md space-y-4 rounded-t-3xl bg-white p-5 sm:rounded-3xl"><div className="flex items-center justify-between"><h2 className="text-xl font-semibold text-slate-900">Reject collection</h2><button onClick={() => { setRejecting(null); setRejectionReason(''); }} className="rounded-xl bg-slate-100 p-2 text-slate-500"><X size={18} /></button></div><label className="space-y-1 text-xs font-semibold text-slate-600">Rejection reason *<textarea rows={3} value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-normal" /></label><button disabled={isSaving || !rejectionReason.trim()} onClick={() => review(rejecting, 'REJECTED', rejectionReason.trim())} className="w-full rounded-2xl bg-rose-600 py-4 text-xs font-bold uppercase tracking-wider text-white disabled:opacity-40">Confirm rejection</button></section></div>}
  </div>;
};

export default CollectionsPage;
