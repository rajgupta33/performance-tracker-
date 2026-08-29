import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowRight, BriefcaseBusiness, CalendarDays, History, IndianRupee, Loader2, Plus, Search, Trophy, X } from 'lucide-react';
import { leadsService } from '../leads/leads.service';
import type { CrmLead } from '../leads/leads.types';
import { dealStageLabel, nextDealStage } from './deal-stage';
import { dealsService } from './deals.service';
import { DEAL_STAGES, type CrmDeal, type DealActivity, type DealStage } from './deals.types';

const stageTone: Record<DealStage, string> = {
  OPEN: 'bg-slate-100 text-slate-600',
  PROPOSAL: 'bg-blue-100 text-blue-700',
  NEGOTIATION: 'bg-amber-100 text-amber-700',
  WON: 'bg-emerald-100 text-emerald-700',
  LOST: 'bg-rose-100 text-rose-700',
};

const DealsPage: React.FC = () => {
  const [deals, setDeals] = useState<CrmDeal[]>([]);
  const [leads, setLeads] = useState<CrmLead[]>([]);
  const [stage, setStage] = useState<DealStage>('OPEN');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [leadId, setLeadId] = useState('');
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [expectedCloseDate, setExpectedCloseDate] = useState('');
  const [closing, setClosing] = useState<{ deal: CrmDeal; stage: 'WON' | 'LOST' } | null>(null);
  const [reason, setReason] = useState('');
  const [activityDealId, setActivityDealId] = useState('');
  const [activities, setActivities] = useState<DealActivity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setIsLoading(true); setError('');
    try {
      const [dealRows, leadRows] = await Promise.all([dealsService.list(), leadsService.list()]);
      setDeals(dealRows); setLeads(leadRows);
    } catch (err: any) { setError(err.message || 'Could not load deals.'); }
    finally { setIsLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const activeLeadIds = useMemo(() => new Set(deals.filter((deal) => !['WON', 'LOST'].includes(deal.stage)).map((deal) => deal.leadId)), [deals]);
  const eligibleLeads = useMemo(() => leads.filter((lead) => ['INTERESTED', 'NEGOTIATION', 'WON'].includes(lead.stage) && !activeLeadIds.has(lead.id)), [activeLeadIds, leads]);
  const counts = useMemo(() => Object.fromEntries(DEAL_STAGES.map((item) => [item, deals.filter((deal) => deal.stage === item).length])) as Record<DealStage, number>, [deals]);
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return deals.filter((deal) => deal.stage === stage).filter((deal) => !term || `${deal.title} ${deal.lead.customer?.name || deal.lead.prospectName || ''}`.toLowerCase().includes(term));
  }, [deals, search, stage]);
  const pipelineValue = deals.filter((deal) => !['WON', 'LOST'].includes(deal.stage)).reduce((total, deal) => total + deal.amount, 0);

  const create = async () => {
    if (!leadId || !title.trim() || Number(amount) <= 0) return setError('Choose a lead and enter a title and positive amount.');
    setIsSaving(true); setError('');
    try {
      const deal = await dealsService.create({ leadId, title: title.trim(), amount: Number(amount), expectedCloseDate: expectedCloseDate || undefined });
      setDeals((current) => [deal, ...current]); setStage('OPEN'); setShowCreate(false);
      setLeadId(''); setTitle(''); setAmount(''); setExpectedCloseDate('');
    } catch (err: any) { setError(err.message || 'Could not create the deal.'); }
    finally { setIsSaving(false); }
  };

  const move = async (deal: CrmDeal, target: DealStage, terminalReason?: string) => {
    setIsSaving(true); setError('');
    try {
      const updated = await dealsService.moveStage(deal.id, target, terminalReason);
      setDeals((current) => current.map((item) => item.id === deal.id ? updated : item));
      setClosing(null); setReason('');
    } catch (err: any) { setError(err.message || 'Could not update the deal.'); }
    finally { setIsSaving(false); }
  };

  const toggleActivities = async (dealId: string) => {
    if (activityDealId === dealId) { setActivityDealId(''); return; }
    setActivityDealId(dealId); setActivities([]); setError('');
    try { setActivities(await dealsService.listActivities(dealId)); }
    catch (err: any) { setError(err.message || 'Could not load deal history.'); }
  };

  if (isLoading) return <div className="flex min-h-80 items-center justify-center"><Loader2 className="animate-spin text-primary" size={36} /></div>;

  return <div className="space-y-5 animate-in fade-in duration-500">
    <header className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary">CRM</p><h1 className="text-2xl font-semibold text-slate-900">Deals</h1><p className="text-sm text-slate-500">Active pipeline: ₹{pipelineValue.toLocaleString('en-IN')}</p></div><button onClick={() => setShowCreate(true)} className="flex items-center gap-2 rounded-2xl bg-primary px-4 py-3 text-xs font-bold text-white"><Plus size={16} /> New deal</button></header>
    {error && <div role="alert" className="flex gap-3 rounded-2xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-700"><AlertCircle size={18} className="shrink-0" />{error}</div>}
    <div className="flex gap-2 overflow-x-auto pb-1">{DEAL_STAGES.map((item) => <button key={item} onClick={() => setStage(item)} className={`shrink-0 rounded-full px-3 py-2 text-[10px] font-bold uppercase tracking-wider ${stage === item ? stageTone[item] : 'bg-white text-slate-400 ring-1 ring-slate-100'}`}>{dealStageLabel(item)} · {counts[item]}</button>)}</div>
    <label className="relative block"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search this stage" className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-3 text-sm outline-none focus:border-primary" /></label>
    <div className="space-y-3">{visible.length === 0 ? <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-400">No {dealStageLabel(stage).toLowerCase()} deals.</div> : visible.map((deal) => {
      const next = nextDealStage(deal.stage);
      return <article key={deal.id} className="space-y-3 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><span className={`rounded-full px-2 py-1 text-[8px] font-bold uppercase ${stageTone[deal.stage]}`}>{dealStageLabel(deal.stage)}</span><h2 className="mt-2 font-semibold text-slate-900">{deal.title}</h2><p className="text-xs text-slate-400">{deal.lead.customer?.name || deal.lead.prospectName}</p></div><p className="flex items-center text-sm font-semibold text-slate-700"><IndianRupee size={14} />{deal.amount.toLocaleString('en-IN')}</p></div>
      {deal.expectedCloseDate && <p className="flex items-center gap-2 text-xs text-slate-500"><CalendarDays size={14} />Expected close {new Date(`${deal.expectedCloseDate}T00:00:00`).toLocaleDateString()}</p>}
      {deal.wonReason && <p className="rounded-xl bg-emerald-50 p-3 text-xs text-emerald-700">Won: {deal.wonReason}</p>}{deal.lossReason && <p className="rounded-xl bg-rose-50 p-3 text-xs text-rose-700">Lost: {deal.lossReason}</p>}
      <button onClick={() => toggleActivities(deal.id)} className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400"><History size={14} />{activityDealId === deal.id ? 'Hide history' : 'View history'}</button>
      {activityDealId === deal.id && <div className="space-y-2 border-l-2 border-slate-100 pl-3">{activities.length === 0 ? <p className="text-xs text-slate-400">Loading history…</p> : activities.map((activity) => <div key={activity.id}><p className="text-xs font-semibold text-slate-600">{activity.eventType === 'DEAL_CREATED' ? 'Deal created' : activity.eventType === 'STAGE_CHANGED' ? `${String(activity.metadata.from)} → ${String(activity.metadata.to)}` : 'Value changed'}</p><p className="text-[10px] text-slate-400">{new Date(activity.createdAt).toLocaleString()}</p></div>)}</div>}
      {!['WON', 'LOST'].includes(deal.stage) && <div className="flex gap-2">{next && next !== 'WON' && <button disabled={isSaving} onClick={() => move(deal, next)} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2.5 text-xs font-bold text-white disabled:opacity-40">Move to {dealStageLabel(next)} <ArrowRight size={14} /></button>}{next === 'WON' && <button onClick={() => setClosing({ deal, stage: 'WON' })} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2.5 text-xs font-bold text-white"><Trophy size={14} /> Mark won</button>}<button onClick={() => setClosing({ deal, stage: 'LOST' })} className="rounded-xl border border-rose-100 px-3 text-xs font-semibold text-rose-600">Lost</button></div>}
      </article>;
    })}</div>

    {showCreate && <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/60 backdrop-blur-sm sm:items-center sm:p-4"><section className="w-full max-w-xl space-y-4 rounded-t-3xl bg-white p-5 sm:rounded-3xl"><div className="flex items-center justify-between"><div><p className="text-[9px] font-bold uppercase tracking-wider text-primary">Qualified opportunity</p><h2 className="text-xl font-semibold text-slate-900">Create deal</h2></div><button onClick={() => setShowCreate(false)} className="rounded-xl bg-slate-100 p-2 text-slate-500"><X size={18} /></button></div>
      <label className="space-y-1 text-xs font-semibold text-slate-600">Lead *<select value={leadId} onChange={(event) => { const id = event.target.value; setLeadId(id); const lead = leads.find((item) => item.id === id); if (lead && !title) setTitle(`${lead.customer?.name || lead.prospectName} opportunity`); }} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-normal"><option value="">Select qualified lead</option>{eligibleLeads.map((lead) => <option key={lead.id} value={lead.id}>{lead.customer?.name || lead.prospectName} · {lead.stage}</option>)}</select></label>
      {eligibleLeads.length === 0 && <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">Move a lead to Interested or Negotiation before creating a deal.</p>}
      <label className="space-y-1 text-xs font-semibold text-slate-600">Deal title *<input value={title} onChange={(event) => setTitle(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-normal" /></label>
      <div className="grid grid-cols-2 gap-3"><label className="space-y-1 text-xs font-semibold text-slate-600">Amount *<input type="number" min="1" value={amount} onChange={(event) => setAmount(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-normal" /></label><label className="space-y-1 text-xs font-semibold text-slate-600">Expected close<input type="date" value={expectedCloseDate} onChange={(event) => setExpectedCloseDate(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-normal" /></label></div>
      <button disabled={isSaving || !leadId || !title.trim() || Number(amount) <= 0} onClick={create} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-xs font-bold uppercase tracking-wider text-white disabled:opacity-40">{isSaving ? <Loader2 className="animate-spin" size={17} /> : <BriefcaseBusiness size={17} />} Save deal</button>
    </section></div>}

    {closing && <div className="fixed inset-0 z-[110] flex items-end justify-center bg-slate-950/60 backdrop-blur-sm sm:items-center sm:p-4"><section className="w-full max-w-md space-y-4 rounded-t-3xl bg-white p-5 sm:rounded-3xl"><div className="flex items-center justify-between"><h2 className="text-xl font-semibold text-slate-900">Mark deal {closing.stage.toLowerCase()}</h2><button onClick={() => { setClosing(null); setReason(''); }} className="rounded-xl bg-slate-100 p-2 text-slate-500"><X size={18} /></button></div><label className="space-y-1 text-xs font-semibold text-slate-600">{closing.stage === 'WON' ? 'Win reason' : 'Loss reason'} *<textarea rows={3} value={reason} onChange={(event) => setReason(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-normal" /></label><button disabled={isSaving || !reason.trim()} onClick={() => move(closing.deal, closing.stage, reason.trim())} className={`w-full rounded-2xl py-4 text-xs font-bold uppercase tracking-wider text-white disabled:opacity-40 ${closing.stage === 'WON' ? 'bg-emerald-600' : 'bg-rose-600'}`}>Confirm {closing.stage.toLowerCase()}</button></section></div>}
  </div>;
};

export default DealsPage;
