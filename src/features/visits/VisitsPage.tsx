import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  LocateFixed,
  Loader2,
  MapPin,
  Search,
  Store,
  RefreshCw,
  Wifi,
  WifiOff,
} from 'lucide-react';
import type { User } from '../../types';
import { captureVisitPosition } from './visit-location';
import { visitsService } from './visits.service';
import type { CustomerSummary, FieldVisit } from './visits.types';
import { VisitEvidenceCapture } from './VisitEvidenceCapture';
import {
  drainVisitOutbox,
  enqueueVisitCompletion,
  enqueueVisitStart,
  getVisitOutboxSummary,
  localActiveVisit,
  retryFailedVisitOutbox,
  VISIT_OUTBOX_CHANGED,
} from './visit-outbox';
import type { VisitOutboxSummary } from './visit-outbox.types';

interface Props {
  user: User;
}

const accuracyTone = (accuracy?: number) => {
  if (accuracy == null) return 'text-slate-400';
  if (accuracy <= 50) return 'text-emerald-600';
  if (accuracy <= 250) return 'text-amber-600';
  return 'text-rose-600';
};

const VisitsPage: React.FC<Props> = ({ user }) => {
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [activeVisit, setActiveVisit] = useState<FieldVisit | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [search, setSearch] = useState('');
  const [purpose, setPurpose] = useState('');
  const [outcome, setOutcome] = useState('');
  const [products, setProducts] = useState('');
  const [potentialValue, setPotentialValue] = useState('');
  const [followUpOn, setFollowUpOn] = useState('');
  const [notes, setNotes] = useState('');
  const [evidenceDataUrl, setEvidenceDataUrl] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [gpsMessage, setGpsMessage] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [outbox, setOutbox] = useState<VisitOutboxSummary>({ entries: [], pending: 0, failed: 0, syncing: 0 });

  const refreshOutbox = useCallback(async () => {
    const summary = await getVisitOutboxSummary(user.id);
    setOutbox(summary);
    return summary;
  }, [user.id]);

  const hydrate = useCallback(async (shouldDrain: boolean) => {
    try {
      if (shouldDrain && navigator.onLine) await drainVisitOutbox(user.id);
      const summary = await refreshOutbox();
      const [customerResult, visitResult] = await Promise.allSettled([
        visitsService.listCustomers(),
        visitsService.getActiveVisit(user.id),
      ]);
      if (customerResult.status === 'fulfilled') setCustomers(customerResult.value);
      let visit = visitResult.status === 'fulfilled' ? visitResult.value : null;
      const completionVisitIds = new Set(summary.entries
        .filter((entry) => entry.payload.kind === 'COMPLETE')
        .map((entry) => entry.visitId));
      if (visit && completionVisitIds.has(visit.id)) visit = null;
      setActiveVisit(visit || localActiveVisit(summary.entries));
      if (customerResult.status === 'rejected' && summary.entries.length === 0) {
        setError(customerResult.reason?.message || 'Could not load customers.');
      }
    } catch (err: any) {
      setError(err.message || 'Could not restore offline visits.');
    } finally {
      setIsLoading(false);
    }
  }, [refreshOutbox, user.id]);

  useEffect(() => { hydrate(true); }, [hydrate]);

  useEffect(() => {
    const handleOnline = () => { setIsOnline(true); hydrate(true); };
    const handleOffline = () => setIsOnline(false);
    const handleOutboxChange = () => { refreshOutbox(); };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener(VISIT_OUTBOX_CHANGED, handleOutboxChange);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener(VISIT_OUTBOX_CHANGED, handleOutboxChange);
    };
  }, [hydrate, refreshOutbox]);

  useEffect(() => {
    if (!isOnline || outbox.pending === 0) return;
    const retryTimer = window.setTimeout(() => hydrate(true), 30_000);
    return () => window.clearTimeout(retryTimer);
  }, [hydrate, isOnline, outbox.pending]);

  const filteredCustomers = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return customers;
    return customers.filter((customer) =>
      `${customer.name} ${customer.address || ''} ${customer.customerType}`.toLowerCase().includes(term)
    );
  }, [customers, search]);

  const selectedCustomer = customers.find((customer) => customer.id === selectedCustomerId);

  const handleStart = async () => {
    if (!selectedCustomerId) return setError('Choose a customer before starting the visit.');
    setError('');
    setSuccess('');
    setIsSaving(true);
    setGpsMessage('Capturing current GPS position…');
    try {
      const position = await captureVisitPosition();
      setGpsMessage(`GPS captured within ±${Math.round(position.accuracyM)} m`);
      if (!user.organizationId || !selectedCustomer) throw new Error('Your organization or customer could not be resolved.');
      const entry = await enqueueVisitStart(user.id, user.organizationId, {
        visitId: crypto.randomUUID(),
        clientEventId: crypto.randomUUID(),
        customerId: selectedCustomerId,
        customer: selectedCustomer,
        purpose,
        position,
      });
      const drainResult = await drainVisitOutbox(user.id);
      const visit = drainResult.results.get(entry.id) || localActiveVisit((await refreshOutbox()).entries);
      if (!visit) throw new Error('Visit was saved but could not be restored from the outbox.');
      setActiveVisit({ ...visit, customer: selectedCustomer });
      setSuccess(drainResult.results.has(entry.id)
        ? 'Visit started. Complete the outcome before leaving the customer.'
        : 'Visit saved offline. It will sync automatically when connectivity returns.');
    } catch (err: any) {
      setError(err.message || 'Could not start the visit.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleComplete = async () => {
    if (!activeVisit) return;
    if (!outcome.trim()) return setError('Add the visit outcome before completing.');
    if (!evidenceDataUrl) return setError('Capture a live visit photo before completing.');
    setError('');
    setSuccess('');
    setIsSaving(true);
    setGpsMessage('Capturing completion GPS position…');
    try {
      const position = await captureVisitPosition();
      setGpsMessage(`GPS captured within ±${Math.round(position.accuracyM)} m`);
      if (!user.organizationId) throw new Error('Your organization could not be resolved.');
      const entry = await enqueueVisitCompletion(user.id, user.organizationId, {
        visitId: activeVisit.id,
        position,
        outcome: outcome.trim(),
        products: products.split(',').map((item) => item.trim()).filter(Boolean),
        potentialValue: potentialValue ? Number(potentialValue) : undefined,
        followUpOn: followUpOn || undefined,
        notes: notes.trim() || undefined,
        evidenceDataUrl,
      });
      const drainResult = await drainVisitOutbox(user.id);
      const completed = drainResult.results.get(entry.id);
      await refreshOutbox();
      setActiveVisit(null);
      setSelectedCustomerId('');
      setPurpose('');
      setOutcome('');
      setProducts('');
      setPotentialValue('');
      setFollowUpOn('');
      setNotes('');
      setEvidenceDataUrl('');
      setSuccess(completed
        ? `Visit completed with ${completed.locationStatus.toLowerCase()} location status.`
        : 'Visit completion saved offline. Evidence and outcome will sync automatically.');
    } catch (err: any) {
      setError(err.message || 'Could not complete the visit.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRetrySync = async () => {
    setIsSaving(true);
    setError('');
    try {
      await retryFailedVisitOutbox(user.id);
      await hydrate(true);
    } catch (err: any) {
      setError(err.message || 'Could not retry pending visits.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <div className="flex min-h-80 items-center justify-center"><Loader2 className="animate-spin text-primary" size={36} /></div>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5 animate-in fade-in duration-500">
      <header>
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary">Field activity</p>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Customer visit</h1>
        <p className="mt-1 text-sm text-slate-500">GPS is captured only when you start and complete a visit.</p>
      </header>

      {(outbox.entries.length > 0 || !isOnline) && (
        <section className={`flex items-center gap-3 rounded-2xl border p-3 ${outbox.failed ? 'border-rose-200 bg-rose-50' : 'border-amber-200 bg-amber-50'}`} aria-label="Visit synchronization status">
          <div className={`rounded-xl p-2 ${outbox.failed ? 'bg-rose-100 text-rose-600' : 'bg-white text-amber-600'}`}>
            {isOnline ? <Wifi size={17} /> : <WifiOff size={17} />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-slate-900">
              {outbox.failed
                ? `${outbox.failed} visit action${outbox.failed === 1 ? '' : 's'} need attention`
                : `${outbox.pending + outbox.syncing} action${outbox.pending + outbox.syncing === 1 ? '' : 's'} waiting to sync`}
            </p>
            <p className="truncate text-[10px] text-slate-500">{isOnline ? 'FieldForce retries in order without creating duplicates.' : 'Your work is safely stored on this device.'}</p>
          </div>
          {outbox.failed > 0 && (
            <button type="button" disabled={isSaving || !isOnline} onClick={handleRetrySync} className="rounded-xl bg-white p-2 text-rose-600 shadow-sm disabled:opacity-40" aria-label="Retry failed visit actions">
              <RefreshCw size={17} className={isSaving ? 'animate-spin' : ''} />
            </button>
          )}
        </section>
      )}

      {error && (
        <div role="alert" className="flex gap-3 rounded-2xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-700">
          <AlertCircle className="mt-0.5 shrink-0" size={18} /><span>{error}</span>
        </div>
      )}
      {success && (
        <div role="status" className="flex gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-700">
          <CheckCircle2 className="mt-0.5 shrink-0" size={18} /><span>{success}</span>
        </div>
      )}

      {activeVisit ? (
        <section className="space-y-5 rounded-3xl border border-primary/15 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="flex gap-3">
              <div className="rounded-2xl bg-primary-light p-3 text-primary"><Store size={20} /></div>
              <div>
                <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-600">Visit in progress</p>
                <h2 className="font-semibold text-slate-900">{activeVisit.customer?.name || 'Customer'}</h2>
                <p className="text-xs text-slate-400">Started {new Date(activeVisit.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
              </div>
            </div>
            <span className={`text-xs font-semibold ${accuracyTone(activeVisit.startAccuracyM)}`}>±{Math.round(activeVisit.startAccuracyM)} m</span>
          </div>

          <div className="grid gap-4">
            <label className="space-y-1.5 text-xs font-semibold text-slate-600">
              Outcome <span className="text-rose-500">*</span>
              <textarea value={outcome} onChange={(e) => setOutcome(e.target.value)} rows={3} placeholder="Discussion and agreed next action" className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm font-normal text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary-light" />
            </label>
            <label className="space-y-1.5 text-xs font-semibold text-slate-600">
              Products discussed
              <input value={products} onChange={(e) => setProducts(e.target.value)} placeholder="Product A, Product B" className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm font-normal text-slate-900 outline-none focus:border-primary" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1.5 text-xs font-semibold text-slate-600">
                Potential value
                <input type="number" min="0" value={potentialValue} onChange={(e) => setPotentialValue(e.target.value)} placeholder="0" className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm font-normal text-slate-900 outline-none focus:border-primary" />
              </label>
              <label className="space-y-1.5 text-xs font-semibold text-slate-600">
                Follow-up
                <input type="date" value={followUpOn} onChange={(e) => setFollowUpOn(e.target.value)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm font-normal text-slate-900 outline-none focus:border-primary" />
              </label>
            </div>
            <label className="space-y-1.5 text-xs font-semibold text-slate-600">
              Notes
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm font-normal text-slate-900 outline-none focus:border-primary" />
            </label>
            <VisitEvidenceCapture value={evidenceDataUrl} onChange={setEvidenceDataUrl} disabled={isSaving} />
          </div>

          {gpsMessage && <p className="flex items-center gap-2 text-xs font-medium text-slate-500"><LocateFixed size={14} className="text-primary" />{gpsMessage}</p>}
          <button disabled={isSaving || !outcome.trim() || !evidenceDataUrl} onClick={handleComplete} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-4 text-xs font-bold uppercase tracking-wider text-white shadow-lg shadow-primary-light transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50">
            {isSaving ? <Loader2 className="animate-spin" size={17} /> : <CheckCircle2 size={17} />} Complete visit
          </button>
        </section>
      ) : (
        <section className="space-y-4 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
          <label className="relative block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search customer or location" className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary-light" />
          </label>

          <div className="max-h-72 space-y-2 overflow-y-auto">
            {filteredCustomers.length === 0 ? (
              <div className="rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-400">No approved customers found.</div>
            ) : filteredCustomers.map((customer) => (
              <button key={customer.id} onClick={() => setSelectedCustomerId(customer.id)} className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${selectedCustomerId === customer.id ? 'border-primary bg-primary-light/40' : 'border-slate-100 hover:border-slate-200'}`}>
                <div className="rounded-xl bg-slate-50 p-2 text-slate-500"><Store size={17} /></div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">{customer.name}</p>
                  <p className="truncate text-[10px] uppercase tracking-wider text-slate-400">{customer.customerType} · {customer.address || 'No address'}</p>
                </div>
                <ChevronRight size={16} className={selectedCustomerId === customer.id ? 'text-primary' : 'text-slate-300'} />
              </button>
            ))}
          </div>

          <label className="space-y-1.5 text-xs font-semibold text-slate-600">
            Visit purpose
            <input value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Order discussion, follow-up…" className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm font-normal text-slate-900 outline-none focus:border-primary" />
          </label>
          {gpsMessage && <p className="flex items-center gap-2 text-xs font-medium text-slate-500"><LocateFixed size={14} className="text-primary" />{gpsMessage}</p>}
          <button disabled={isSaving || !selectedCustomerId} onClick={handleStart} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-4 text-xs font-bold uppercase tracking-wider text-white shadow-lg shadow-primary-light transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50">
            {isSaving ? <Loader2 className="animate-spin" size={17} /> : <MapPin size={17} />} Capture GPS and start
          </button>
        </section>
      )}
    </div>
  );
};

export default VisitsPage;
