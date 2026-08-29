import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Clock3, Loader2, RefreshCw, Trash2, Wifi, WifiOff } from 'lucide-react';
import type { User } from '../../types';
import {
  discardFailedVisitOutboxEntry,
  drainVisitOutbox,
  getVisitOutboxSummary,
  retryFailedVisitOutbox,
  VISIT_OUTBOX_CHANGED,
} from '../visits/visit-outbox';
import type { VisitOutboxSummary } from '../visits/visit-outbox.types';

const SyncCenterPage: React.FC<{ user: User }> = ({ user }) => {
  const [summary, setSummary] = useState<VisitOutboxSummary>({ entries: [], pending: 0, failed: 0, syncing: 0 });
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => setSummary(await getVisitOutboxSummary(user.id)), [user.id]);
  const sync = useCallback(async () => {
    if (!navigator.onLine) return;
    setIsWorking(true); setError(''); setNotice('');
    try {
      const result = await drainVisitOutbox(user.id);
      await refresh();
      setNotice(result.syncedEntryIds.length > 0 ? `${result.syncedEntryIds.length} action${result.syncedEntryIds.length === 1 ? '' : 's'} synchronized.` : 'Nothing is ready to synchronize yet.');
    } catch (err: any) { setError(err.message || 'Could not synchronize pending work.'); }
    finally { setIsWorking(false); }
  }, [refresh, user.id]);

  useEffect(() => { refresh().catch((err) => setError(err.message)); }, [refresh]);
  useEffect(() => {
    const online = () => { setIsOnline(true); sync(); };
    const offline = () => setIsOnline(false);
    const changed = () => { refresh(); };
    window.addEventListener('online', online); window.addEventListener('offline', offline); window.addEventListener(VISIT_OUTBOX_CHANGED, changed);
    return () => { window.removeEventListener('online', online); window.removeEventListener('offline', offline); window.removeEventListener(VISIT_OUTBOX_CHANGED, changed); };
  }, [refresh, sync]);

  const retry = async () => {
    setIsWorking(true); setError(''); setNotice('');
    try { await retryFailedVisitOutbox(user.id); await sync(); }
    catch (err: any) { setError(err.message || 'Could not retry failed actions.'); setIsWorking(false); }
  };

  const discard = async (entryId: string) => {
    if (!window.confirm('Discard this failed action from this device? This cannot be undone.')) return;
    setError(''); setNotice('');
    try { await discardFailedVisitOutboxEntry(user.id, entryId); await refresh(); setNotice('Failed action discarded from this device.'); }
    catch (err: any) { setError(err.message || 'Could not discard the action.'); }
  };

  return <div className="mx-auto max-w-2xl space-y-5 animate-in fade-in duration-500">
    <header><p className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary">Offline work</p><h1 className="text-2xl font-semibold text-slate-900">Sync Center</h1><p className="text-sm text-slate-500">Review work stored on this device and retry it safely in order.</p></header>
    <section className={`flex items-center gap-3 rounded-3xl border p-5 ${isOnline ? 'border-emerald-100 bg-emerald-50' : 'border-amber-100 bg-amber-50'}`}><div className={`rounded-2xl bg-white p-3 ${isOnline ? 'text-emerald-600' : 'text-amber-600'}`}>{isOnline ? <Wifi size={22} /> : <WifiOff size={22} />}</div><div className="min-w-0 flex-1"><p className="font-semibold text-slate-900">{isOnline ? 'Online' : 'Working offline'}</p><p className="text-xs text-slate-500">{isOnline ? 'Pending actions can synchronize now.' : 'New visit work remains stored on this device.'}</p></div><button disabled={!isOnline || isWorking || summary.pending + summary.failed === 0} onClick={summary.failed > 0 ? retry : sync} className="rounded-xl bg-white p-3 text-primary shadow-sm disabled:opacity-40" aria-label="Synchronize now"><RefreshCw size={18} className={isWorking ? 'animate-spin' : ''} /></button></section>
    <div className="grid grid-cols-3 gap-3">{[
      { label: 'Waiting', value: summary.pending, tone: 'text-amber-700 bg-amber-50' },
      { label: 'Syncing', value: summary.syncing, tone: 'text-blue-700 bg-blue-50' },
      { label: 'Failed', value: summary.failed, tone: 'text-rose-700 bg-rose-50' },
    ].map((item) => <div key={item.label} className={`rounded-2xl p-4 text-center ${item.tone}`}><p className="text-2xl font-bold">{item.value}</p><p className="text-[9px] font-bold uppercase tracking-wider opacity-70">{item.label}</p></div>)}</div>
    {error && <div role="alert" className="flex gap-3 rounded-2xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-700"><AlertCircle size={18} className="shrink-0" />{error}</div>}
    {notice && <div role="status" className="flex gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-700"><CheckCircle2 size={18} className="shrink-0" />{notice}</div>}
    <section className="space-y-3"><div><p className="text-[9px] font-bold uppercase tracking-wider text-primary">Device queue</p><h2 className="font-semibold text-slate-900">Visit actions</h2></div>{summary.entries.length === 0 ? <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-10 text-center"><CheckCircle2 size={30} className="mx-auto mb-3 text-emerald-400" /><p className="text-sm font-semibold text-slate-600">Everything is synchronized</p></div> : summary.entries.map((entry, index) => <article key={entry.id} className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm"><div className="flex items-start gap-3"><div className={`rounded-xl p-2 ${entry.status === 'FAILED' ? 'bg-rose-50 text-rose-600' : entry.status === 'IN_FLIGHT' ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'}`}>{entry.status === 'IN_FLIGHT' ? <Loader2 size={17} className="animate-spin" /> : <Clock3 size={17} />}</div><div className="min-w-0 flex-1"><div className="flex justify-between gap-2"><div><p className="text-xs font-semibold text-slate-800">{index + 1}. {entry.payload.kind === 'START' ? 'Start customer visit' : 'Complete customer visit'}</p><p className="text-[10px] text-slate-400">Queued {new Date(entry.queuedAt).toLocaleString()} · Attempt {entry.attempts}/{entry.maxAttempts}</p></div><span className={`rounded-full px-2 py-1 text-[8px] font-bold ${entry.status === 'FAILED' ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-500'}`}>{entry.status.replace('_', ' ')}</span></div>{entry.lastError && <p className="mt-3 rounded-xl bg-rose-50 p-3 text-xs text-rose-700">{entry.lastError}</p>}{entry.status === 'FAILED' && <button onClick={() => discard(entry.id)} className="mt-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-rose-600"><Trash2 size={13} />Discard failed action</button>}</div></div></article>)}</section>
    <p className="rounded-2xl bg-slate-50 p-4 text-xs text-slate-500">Actions synchronize first-in, first-out so a visit cannot complete before its start reaches the server. Only visit actions are currently certified for offline capture.</p>
  </div>;
};

export default SyncCenterPage;
