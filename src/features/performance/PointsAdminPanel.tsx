import React, { useEffect, useState } from 'react';
import { AlertCircle, Award, CheckCircle2, ChevronDown, Loader2, Scale, Settings2 } from 'lucide-react';
import { performanceService } from './performance.service';
import type { EmployeeOption, PerformanceBadge, PointEventType, PointRule } from './performance.types';
import { validatePointAdjustment, validatePointRuleDraft } from './point-guardrails';

const eventLabels: Record<PointEventType, string> = {
  LEAD_CREATED: 'Lead created', PRODUCTIVE_VISIT: 'Productive visit', DEAL_WON: 'Deal won',
  COLLECTION_RECONCILED: 'Collection reconciled', DEALER_ACTIVATED: 'Dealer activated',
};
const eventTypes = Object.keys(eventLabels) as PointEventType[];
const localDateTime = (date: Date) => {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

const PointsAdminPanel: React.FC<{ employees: EmployeeOption[]; onChanged: () => void }> = ({ employees, onChanged }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [rules, setRules] = useState<PointRule[]>([]);
  const [badges, setBadges] = useState<PerformanceBadge[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [eventType, setEventType] = useState<PointEventType>('LEAD_CREATED');
  const [rulePoints, setRulePoints] = useState('2');
  const [effectiveFrom, setEffectiveFrom] = useState(localDateTime(new Date(Date.now() + 86400000)));
  const [changeNote, setChangeNote] = useState('');
  const [approvalNote, setApprovalNote] = useState('');
  const [badgeCode, setBadgeCode] = useState('');
  const [badgeName, setBadgeName] = useState('');
  const [badgeDescription, setBadgeDescription] = useState('');
  const [badgeThreshold, setBadgeThreshold] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [pointsDelta, setPointsDelta] = useState('');
  const [adjustmentReason, setAdjustmentReason] = useState('');
  const [adjustmentReference, setAdjustmentReference] = useState('');
  const [adjustmentAt, setAdjustmentAt] = useState(localDateTime(new Date()));

  const load = async () => {
    setIsLoading(true); setError('');
    try { const [nextRules, nextBadges] = await Promise.all([performanceService.listPointRules(), performanceService.listBadges()]); setRules(nextRules); setBadges(nextBadges); }
    catch (err: any) { setError(err.message || 'Could not load performance configuration.'); }
    finally { setIsLoading(false); }
  };
  useEffect(() => { if (isOpen && rules.length === 0) load(); }, [isOpen]);

  const run = async (action: () => Promise<void>, success: string) => {
    setIsSaving(true); setError(''); setNotice('');
    try { await action(); setNotice(success); await load(); onChanged(); }
    catch (err: any) { setError(err.message || 'Could not save performance configuration.'); }
    finally { setIsSaving(false); }
  };

  const saveRule = () => {
    const points = Number(rulePoints);
    const validationError = validatePointRuleDraft(points, effectiveFrom, changeNote);
    if (validationError) return setError(validationError);
    run(() => performanceService.configurePointRule(eventType, points, new Date(effectiveFrom).toISOString(), changeNote), 'Draft point rule created. Review and activate it below.');
  };
  const activate = (rule: PointRule) => {
    if (approvalNote.trim().length < 10) return setError('Enter an approval note of at least 10 characters.');
    if (!window.confirm(`Activate ${eventLabels[rule.eventType]} at ${rule.points} points from ${new Date(rule.effectiveFrom).toLocaleString()}?`)) return;
    run(() => performanceService.activatePointRule(rule.id, approvalNote), 'Point rule activated without changing historical events.');
  };
  const saveBadge = () => {
    const threshold = Number(badgeThreshold);
    if (!badgeCode || badgeName.trim().length < 2 || badgeDescription.trim().length < 10 || !Number.isInteger(threshold) || threshold < 1) return setError('Enter a badge code, name, 10-character description, and positive threshold.');
    run(() => performanceService.upsertBadge(badgeCode, badgeName, badgeDescription, threshold), 'Badge definition saved.');
  };
  const adjust = () => {
    const delta = Number(pointsDelta);
    const validationError = validatePointAdjustment(employeeId, delta, adjustmentReason, adjustmentReference, adjustmentAt);
    if (validationError) return setError(validationError);
    if (!window.confirm(`Post a ${delta > 0 ? '+' : ''}${delta}-point adjustment? This creates a permanent audit row.`)) return;
    run(() => performanceService.createPointAdjustment(employeeId, delta, adjustmentReason, adjustmentReference, new Date(adjustmentAt).toISOString()), 'Audited point adjustment posted.');
  };

  return <section className="rounded-3xl border border-slate-100 bg-white shadow-sm">
    <button onClick={() => setIsOpen((value) => !value)} className="flex w-full items-center gap-3 p-5 text-left"><span className="rounded-2xl bg-cyan-50 p-3 text-cyan-700"><Settings2 size={20} /></span><span className="min-w-0 flex-1"><span className="block text-[9px] font-bold uppercase tracking-wider text-cyan-700">Admin controls</span><span className="block font-semibold text-slate-900">Points, badges, and adjustments</span><span className="block text-[10px] text-slate-400">Prospective rules and auditable corrections.</span></span><ChevronDown size={18} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} /></button>
    {isOpen && <div className="space-y-5 border-t border-slate-100 p-5">
      {error && <div role="alert" className="flex gap-2 rounded-xl bg-rose-50 p-3 text-xs text-rose-700"><AlertCircle size={15} className="shrink-0" />{error}</div>}
      {notice && <div role="status" className="flex gap-2 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-700"><CheckCircle2 size={15} className="shrink-0" />{notice}</div>}
      {isLoading ? <div className="flex h-32 items-center justify-center"><Loader2 className="animate-spin text-primary" size={26} /></div> : <>
        <section className="space-y-3"><div className="flex items-center gap-2"><Settings2 size={16} className="text-blue-600" /><div><h3 className="text-sm font-semibold text-slate-800">Versioned point rules</h3><p className="text-[9px] text-slate-400">Draft first; activation applies only from its effective time.</p></div></div><div className="grid grid-cols-2 gap-2"><select value={eventType} onChange={(event) => setEventType(event.target.value as PointEventType)} className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs">{eventTypes.map((type) => <option key={type} value={type}>{eventLabels[type]}</option>)}</select><input type="number" min="1" max="100" value={rulePoints} onChange={(event) => setRulePoints(event.target.value)} placeholder="Points" className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs" /><input type="datetime-local" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} className="col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs" /><input value={changeNote} onChange={(event) => setChangeNote(event.target.value)} placeholder="Why is this rule changing?" className="col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs" /></div><button disabled={isSaving} onClick={saveRule} className="w-full rounded-xl bg-blue-600 py-3 text-[9px] font-bold uppercase tracking-wider text-white disabled:opacity-40">Create draft rule</button><input value={approvalNote} onChange={(event) => setApprovalNote(event.target.value)} placeholder="Approval note for draft activation" className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs" /><div className="space-y-2">{rules.filter((rule) => rule.status !== 'RETIRED').map((rule) => <article key={rule.id} className="flex items-center gap-3 rounded-xl bg-slate-50 p-3"><div className="min-w-0 flex-1"><p className="text-xs font-semibold text-slate-700">{eventLabels[rule.eventType]} · {rule.points} points</p><p className="text-[9px] text-slate-400">{rule.status} · from {new Date(rule.effectiveFrom).toLocaleString()}</p></div>{rule.status === 'DRAFT' && <button disabled={isSaving} onClick={() => activate(rule)} className="rounded-lg bg-emerald-50 px-3 py-2 text-[9px] font-bold text-emerald-700">Activate</button>}</article>)}</div></section>
        <section className="space-y-3 border-t border-slate-100 pt-5"><div className="flex items-center gap-2"><Award size={16} className="text-violet-600" /><div><h3 className="text-sm font-semibold text-slate-800">Monthly badges</h3><p className="text-[9px] text-slate-400">Threshold changes never rewrite an award already earned.</p></div></div><div className="grid grid-cols-2 gap-2"><input value={badgeCode} onChange={(event) => setBadgeCode(event.target.value.toUpperCase())} placeholder="BADGE_CODE" className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs" /><input value={badgeName} onChange={(event) => setBadgeName(event.target.value)} placeholder="Badge name" className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs" /><input value={badgeDescription} onChange={(event) => setBadgeDescription(event.target.value)} placeholder="Badge description" className="col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs" /><input type="number" min="1" value={badgeThreshold} onChange={(event) => setBadgeThreshold(event.target.value)} placeholder="Monthly points threshold" className="col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs" /></div><button disabled={isSaving} onClick={saveBadge} className="w-full rounded-xl bg-violet-600 py-3 text-[9px] font-bold uppercase tracking-wider text-white disabled:opacity-40">Save badge</button><div className="flex flex-wrap gap-2">{badges.map((badge) => <span key={badge.id} className={`rounded-full px-3 py-1 text-[9px] font-bold ${badge.active ? 'bg-violet-50 text-violet-700' : 'bg-slate-100 text-slate-400'}`}>{badge.name} · {badge.thresholdPoints}</span>)}</div></section>
        <section className="space-y-3 border-t border-slate-100 pt-5"><div className="flex items-center gap-2"><Scale size={16} className="text-amber-600" /><div><h3 className="text-sm font-semibold text-slate-800">Manual point adjustment</h3><p className="text-[9px] text-slate-400">Signed correction, ±100 maximum, within the last 90 days.</p></div></div><select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs"><option value="">Select employee</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name} · {employee.employeeId || 'No code'}</option>)}</select><div className="grid grid-cols-2 gap-2"><input type="number" min="-100" max="100" value={pointsDelta} onChange={(event) => setPointsDelta(event.target.value)} placeholder="Points, e.g. -10" className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs" /><input type="datetime-local" value={adjustmentAt} onChange={(event) => setAdjustmentAt(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs" /><input value={adjustmentReason} onChange={(event) => setAdjustmentReason(event.target.value)} placeholder="Detailed reason" className="col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs" /><input value={adjustmentReference} onChange={(event) => setAdjustmentReference(event.target.value)} placeholder="Ticket or approval reference" className="col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs" /></div><button disabled={isSaving} onClick={adjust} className="w-full rounded-xl bg-amber-600 py-3 text-[9px] font-bold uppercase tracking-wider text-white disabled:opacity-40">Post adjustment</button></section>
      </>}
    </div>}
  </section>;
};

export default PointsAdminPanel;
