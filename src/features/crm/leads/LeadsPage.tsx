import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CalendarClock,
  BriefcaseBusiness,
  ListTodo,
  IndianRupee,
  Loader2,
  Plus,
  Search,
  UserPlus,
  X,
} from 'lucide-react';
import { visitsService } from '../../visits/visits.service';
import type { CustomerSummary } from '../../visits/visits.types';
import { leadStageLabel, nextLeadStage } from './lead-stage';
import { leadsService } from './leads.service';
import { LEAD_STAGES, type CrmLead, type FollowUpType, type LeadStage } from './leads.types';

const stageTone: Record<LeadStage, string> = {
  NEW: 'bg-slate-100 text-slate-600',
  CONTACTED: 'bg-blue-100 text-blue-700',
  INTERESTED: 'bg-cyan-100 text-cyan-700',
  NEGOTIATION: 'bg-amber-100 text-amber-700',
  WON: 'bg-emerald-100 text-emerald-700',
  LOST: 'bg-rose-100 text-rose-700',
};

interface LeadsPageProps { onNavigate: (path: string) => void; }

const LeadsPage: React.FC<LeadsPageProps> = ({ onNavigate }) => {
  const [leads, setLeads] = useState<CrmLead[]>([]);
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [stage, setStage] = useState<LeadStage>('NEW');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [prospectName, setProspectName] = useState('');
  const [contactName, setContactName] = useState('');
  const [mobile, setMobile] = useState('');
  const [products, setProducts] = useState('');
  const [estimatedValue, setEstimatedValue] = useState('');
  const [followUpAt, setFollowUpAt] = useState('');
  const [followUpType, setFollowUpType] = useState<FollowUpType>('CALL');
  const [followUpNote, setFollowUpNote] = useState('');
  const [losingLeadId, setLosingLeadId] = useState('');
  const [lossReason, setLossReason] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setIsLoading(true);
    try {
      const [leadRows, customerRows] = await Promise.all([leadsService.list(), visitsService.listCustomers()]);
      setLeads(leadRows);
      setCustomers(customerRows);
    } catch (err: any) {
      setError(err.message || 'Could not load leads.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const counts = useMemo(() => Object.fromEntries(LEAD_STAGES.map((item) => [item, leads.filter((lead) => lead.stage === item).length])) as Record<LeadStage, number>, [leads]);
  const visibleLeads = useMemo(() => {
    const term = search.trim().toLowerCase();
    return leads.filter((lead) => lead.stage === stage).filter((lead) =>
      !term || `${lead.customer?.name || lead.prospectName || ''} ${lead.contactName || ''} ${lead.mobile || ''} ${lead.products.join(' ')}`.toLowerCase().includes(term)
    );
  }, [leads, search, stage]);

  const resetForm = () => {
    setCustomerId(''); setProspectName(''); setContactName(''); setMobile('');
    setProducts(''); setEstimatedValue(''); setFollowUpAt(''); setFollowUpType('CALL'); setFollowUpNote('');
  };

  const createLead = async () => {
    if (!customerId && !prospectName.trim()) return setError('Choose a customer or enter a prospect name.');
    if (!followUpAt) return setError('Set the next follow-up date and time.');
    setIsSaving(true); setError('');
    try {
      const lead = await leadsService.create({
        customerId: customerId || undefined,
        prospectName: prospectName.trim() || undefined,
        contactName: contactName.trim() || undefined,
        mobile: mobile.trim() || undefined,
        source: 'FIELD',
        estimatedValue: estimatedValue ? Number(estimatedValue) : undefined,
        products: products.split(',').map((item) => item.trim()).filter(Boolean),
        followUpAt: new Date(followUpAt).toISOString(),
        followUpType,
        followUpNote: followUpNote.trim() || undefined,
      });
      const customer = customers.find((item) => item.id === customerId);
      setLeads((current) => [{ ...lead, customer }, ...current]);
      setStage('NEW'); setShowCreate(false); resetForm();
    } catch (err: any) {
      setError(err.message || 'Could not create the lead.');
    } finally { setIsSaving(false); }
  };

  const moveLead = async (lead: CrmLead, target: LeadStage, reason?: string) => {
    setIsSaving(true); setError('');
    try {
      const updated = await leadsService.moveStage(lead.id, target, reason);
      setLeads((current) => current.map((item) => item.id === lead.id ? { ...item, ...updated, customer: item.customer } : item));
      setLosingLeadId(''); setLossReason('');
    } catch (err: any) {
      setError(err.message || 'Could not update the lead stage.');
    } finally { setIsSaving(false); }
  };

  if (isLoading) return <div className="flex min-h-80 items-center justify-center"><Loader2 className="animate-spin text-primary" size={36} /></div>;

  return (
    <div className="space-y-5 animate-in fade-in duration-500">
      <header className="flex items-start justify-between gap-3">
        <div><p className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary">CRM</p><h1 className="text-2xl font-semibold text-slate-900">Lead pipeline</h1><p className="text-sm text-slate-500">Every lead needs a clear next action.</p></div>
        <div className="flex flex-wrap justify-end gap-2"><button onClick={() => onNavigate('deals')} className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-600"><BriefcaseBusiness size={16} /> Deals</button><button onClick={() => onNavigate('follow-ups')} className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-600"><ListTodo size={16} /> Follow-ups</button><button onClick={() => setShowCreate(true)} className="flex items-center gap-2 rounded-2xl bg-primary px-4 py-3 text-xs font-bold text-white shadow-lg shadow-primary-light"><Plus size={16} /> New lead</button></div>
      </header>

      {error && <div role="alert" className="flex gap-3 rounded-2xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-700"><AlertCircle size={18} className="shrink-0" />{error}</div>}

      <div className="flex gap-2 overflow-x-auto pb-1">
        {LEAD_STAGES.map((item) => <button key={item} onClick={() => setStage(item)} className={`shrink-0 rounded-full px-3 py-2 text-[10px] font-bold uppercase tracking-wider ${stage === item ? stageTone[item] : 'bg-white text-slate-400 ring-1 ring-slate-100'}`}>{leadStageLabel(item)} · {counts[item]}</button>)}
      </div>
      <label className="relative block"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search this stage" className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-10 pr-3 text-sm outline-none focus:border-primary" /></label>

      <div className="space-y-3">
        {visibleLeads.length === 0 ? <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-400">No {leadStageLabel(stage).toLowerCase()} leads.</div> : visibleLeads.map((lead) => {
          const next = nextLeadStage(lead.stage);
          return <article key={lead.id} className="space-y-3 rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3"><div><span className={`rounded-full px-2 py-1 text-[8px] font-bold uppercase ${stageTone[lead.stage]}`}>{leadStageLabel(lead.stage)}</span><h2 className="mt-2 font-semibold text-slate-900">{lead.customer?.name || lead.prospectName}</h2><p className="text-xs text-slate-400">{lead.contactName || 'No contact'}{lead.mobile ? ` · ${lead.mobile}` : ''}</p></div>{lead.estimatedValue != null && <p className="flex items-center text-sm font-semibold text-slate-700"><IndianRupee size={14} />{lead.estimatedValue.toLocaleString('en-IN')}</p>}</div>
            {lead.products.length > 0 && <p className="text-xs text-slate-500">{lead.products.join(' · ')}</p>}
            {lead.nextFollowUpAt && <p className="flex items-center gap-2 text-xs font-medium text-amber-700"><CalendarClock size={14} />{new Date(lead.nextFollowUpAt).toLocaleString()}</p>}
            {losingLeadId === lead.id ? <div className="flex gap-2"><input value={lossReason} onChange={(e) => setLossReason(e.target.value)} placeholder="Required loss reason" className="min-w-0 flex-1 rounded-xl border border-rose-200 px-3 py-2 text-xs outline-none" /><button disabled={!lossReason.trim() || isSaving} onClick={() => moveLead(lead, 'LOST', lossReason)} className="rounded-xl bg-rose-600 px-3 text-xs font-bold text-white disabled:opacity-40">Confirm</button><button onClick={() => setLosingLeadId('')} className="p-2 text-slate-400"><X size={16} /></button></div> : lead.stage !== 'WON' && lead.stage !== 'LOST' && <div className="flex gap-2">{next && <button disabled={isSaving} onClick={() => moveLead(lead, next)} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2.5 text-xs font-bold text-white disabled:opacity-40">Move to {leadStageLabel(next)} <ArrowRight size={14} /></button>}{lead.stage !== 'NEW' && <button disabled={isSaving} onClick={() => setLosingLeadId(lead.id)} className="rounded-xl border border-rose-100 px-3 text-xs font-semibold text-rose-600">Lost</button>}</div>}
          </article>;
        })}
      </div>

      {showCreate && <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"><section className="max-h-[92vh] w-full max-w-xl space-y-4 overflow-y-auto rounded-t-3xl bg-white p-5 sm:rounded-3xl"><div className="flex items-center justify-between"><div><p className="text-[9px] font-bold uppercase tracking-wider text-primary">Field opportunity</p><h2 className="text-xl font-semibold text-slate-900">Create lead</h2></div><button onClick={() => setShowCreate(false)} className="rounded-xl bg-slate-100 p-2 text-slate-500"><X size={18} /></button></div>
        <label className="space-y-1 text-xs font-semibold text-slate-600">Existing customer<select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-normal"><option value="">New prospect</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label>
        {!customerId && <label className="space-y-1 text-xs font-semibold text-slate-600">Prospect name *<input value={prospectName} onChange={(e) => setProspectName(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-normal" /></label>}
        <div className="grid grid-cols-2 gap-3"><label className="space-y-1 text-xs font-semibold text-slate-600">Contact<input value={contactName} onChange={(e) => setContactName(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-normal" /></label><label className="space-y-1 text-xs font-semibold text-slate-600">Mobile<input inputMode="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-normal" /></label></div>
        <label className="space-y-1 text-xs font-semibold text-slate-600">Products<input value={products} onChange={(e) => setProducts(e.target.value)} placeholder="Product A, Product B" className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-normal" /></label>
        <label className="space-y-1 text-xs font-semibold text-slate-600">Estimated value<input type="number" min="0" value={estimatedValue} onChange={(e) => setEstimatedValue(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-normal" /></label>
        <div className="grid grid-cols-2 gap-3"><label className="space-y-1 text-xs font-semibold text-slate-600">Next follow-up *<input type="datetime-local" value={followUpAt} onChange={(e) => setFollowUpAt(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-normal" /></label><label className="space-y-1 text-xs font-semibold text-slate-600">Type<select value={followUpType} onChange={(e) => setFollowUpType(e.target.value as FollowUpType)} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-normal">{(['CALL','VISIT','EMAIL','MESSAGE','OTHER'] as FollowUpType[]).map((type) => <option key={type}>{type}</option>)}</select></label></div>
        <label className="space-y-1 text-xs font-semibold text-slate-600">Follow-up note<textarea rows={2} value={followUpNote} onChange={(e) => setFollowUpNote(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-normal" /></label>
        <button disabled={isSaving || (!customerId && !prospectName.trim()) || !followUpAt} onClick={createLead} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-xs font-bold uppercase tracking-wider text-white disabled:opacity-40">{isSaving ? <Loader2 className="animate-spin" size={17} /> : <UserPlus size={17} />} Save lead</button>
      </section></div>}
    </div>
  );
};

export default LeadsPage;
