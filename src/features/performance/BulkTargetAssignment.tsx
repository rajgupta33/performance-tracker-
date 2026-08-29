import React, { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, ChevronDown, Eye, Loader2, Upload, UsersRound } from 'lucide-react';
import { parseEmployeeCodesCsv, resolveEmployeeCodes } from './bulk-target-csv';
import { metricConfig } from './performance-config';
import { performanceService } from './performance.service';
import { OUTCOME_METRIC_KEYS, type BulkTargetPreviewRow, type EmployeeOption, type OutcomeMetricKey, type TargetMetricInput } from './performance.types';

const localDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const initialTargets = () => Object.fromEntries(OUTCOME_METRIC_KEYS.map((key) => [key, String(metricConfig[key].defaultTarget)])) as Record<OutcomeMetricKey, string>;

const BulkTargetAssignment: React.FC<{ employees: EmployeeOption[]; onCreated: () => void }> = ({ employees, onCreated }) => {
  const today = new Date();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [periodStart, setPeriodStart] = useState(localDate(new Date(today.getFullYear(), today.getMonth(), 1)));
  const [periodEnd, setPeriodEnd] = useState(localDate(new Date(today.getFullYear(), today.getMonth() + 1, 0)));
  const [targets, setTargets] = useState<Record<OutcomeMetricKey, string>>(initialTargets);
  const [activate, setActivate] = useState(false);
  const [preview, setPreview] = useState<BulkTargetPreviewRow[] | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const visibleEmployees = useMemo(() => {
    const term = search.trim().toLowerCase();
    return employees.filter((employee) => !term || employee.name.toLowerCase().includes(term) || employee.employeeId?.toLowerCase().includes(term));
  }, [employees, search]);
  const readyCount = preview?.filter((row) => row.readiness === 'READY').length || 0;
  const conflictCount = preview?.filter((row) => row.readiness === 'CONFLICT').length || 0;

  const invalidate = () => { setPreview(null); setError(''); setNotice(''); };
  const toggle = (id: string) => {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
    invalidate();
  };
  const toggleVisible = () => {
    const visibleIds = visibleEmployees.map((employee) => employee.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
    setSelectedIds((current) => allSelected ? current.filter((id) => !visibleIds.includes(id)) : [...new Set([...current, ...visibleIds])]);
    invalidate();
  };
  const metrics = (): TargetMetricInput[] => OUTCOME_METRIC_KEYS.map((key) => ({
    metricKey: key, targetValue: Number(targets[key]), weight: metricConfig[key].weight, unit: metricConfig[key].unit,
  }));

  const previewBatch = async () => {
    if (selectedIds.length === 0) return setError('Select at least one employee.');
    if (selectedIds.length > 250) return setError('A batch can contain at most 250 employees.');
    if (!periodStart || !periodEnd || periodEnd < periodStart) return setError('Choose a valid target period.');
    if (metrics().some((metric) => !Number.isFinite(metric.targetValue) || metric.targetValue <= 0)) return setError('Enter a positive target for every KPI.');
    setIsWorking(true); setError(''); setNotice('');
    try { setPreview(await performanceService.previewBulkTargets(selectedIds, periodStart, periodEnd)); }
    catch (err: any) { setError(err.message || 'Could not preview bulk targets.'); }
    finally { setIsWorking(false); }
  };

  const createBatch = async () => {
    if (!preview || readyCount === 0) return;
    setIsWorking(true); setError(''); setNotice('');
    try {
      const result = await performanceService.createBulkTargets(selectedIds, periodStart, periodEnd, metrics(), activate);
      setNotice(`${result.createdCount} ${activate ? 'active targets' : 'draft targets'} created${result.conflictCount ? `; ${result.conflictCount} existing targets skipped` : ''}.`);
      setSelectedIds([]); setPreview(null); onCreated();
    } catch (err: any) { setError(err.message || 'Could not create bulk targets.'); }
    finally { setIsWorking(false); }
  };

  const importCsv = async (file?: File) => {
    if (!file) return;
    setError(''); setNotice(''); setPreview(null);
    try {
      const codes = parseEmployeeCodesCsv(await file.text());
      const resolved = resolveEmployeeCodes(codes, employees);
      if (resolved.unknownCodes.length) throw new Error(`Unknown employee codes: ${resolved.unknownCodes.slice(0, 8).join(', ')}${resolved.unknownCodes.length > 8 ? '…' : ''}`);
      setSelectedIds(resolved.employeeIds);
      setNotice(`${resolved.employeeIds.length} employees selected from CSV.`);
    } catch (err: any) { setError(err.message || 'Could not read the CSV file.'); }
  };

  return <section className="rounded-3xl border border-slate-100 bg-white shadow-sm">
    <button onClick={() => setIsOpen((value) => !value)} className="flex w-full items-center gap-3 p-5 text-left"><span className="rounded-2xl bg-violet-50 p-3 text-violet-700"><UsersRound size={20} /></span><span className="min-w-0 flex-1"><span className="block text-[9px] font-bold uppercase tracking-wider text-violet-600">Manager setup</span><span className="block font-semibold text-slate-900">Bulk target assignment</span><span className="block text-[10px] text-slate-400">Preview conflicts before creating shared monthly targets.</span></span><ChevronDown size={18} className={`text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} /></button>
    {isOpen && <div className="space-y-4 border-t border-slate-100 p-5">
      <div className="grid grid-cols-2 gap-3"><label className="space-y-1 text-xs font-semibold text-slate-600">Period start<input type="date" value={periodStart} onChange={(event) => { setPeriodStart(event.target.value); invalidate(); }} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-normal" /></label><label className="space-y-1 text-xs font-semibold text-slate-600">Period end<input type="date" value={periodEnd} onChange={(event) => { setPeriodEnd(event.target.value); invalidate(); }} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-normal" /></label></div>
      <div className="space-y-2"><div className="flex items-center justify-between"><p className="text-xs font-semibold text-slate-700">Employees <span className="text-slate-400">({selectedIds.length} selected)</span></p><label className="flex cursor-pointer items-center gap-1 rounded-xl bg-slate-50 px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-slate-600"><Upload size={12} />Import CSV<input type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => { importCsv(event.target.files?.[0]); event.currentTarget.value = ''; }} /></label></div><p className="text-[9px] text-slate-400">CSV header: <code>employee_id</code> or <code>employee_code</code>. Unknown codes stop the import.</p><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or employee ID" className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs outline-none" /><button onClick={toggleVisible} className="text-[9px] font-bold uppercase tracking-wider text-primary">Select or clear visible employees</button><div className="max-h-48 space-y-1 overflow-y-auto rounded-2xl border border-slate-100 p-2">{visibleEmployees.map((employee) => <label key={employee.id} className="flex cursor-pointer items-center gap-3 rounded-xl p-2 hover:bg-slate-50"><input type="checkbox" checked={selectedIds.includes(employee.id)} onChange={() => toggle(employee.id)} className="h-4 w-4 accent-primary" /><span className="min-w-0 flex-1 text-xs font-semibold text-slate-700">{employee.name}<span className="block text-[9px] font-normal text-slate-400">{employee.employeeId || 'No employee code'}</span></span></label>)}</div></div>
      <div className="space-y-2"><p className="text-xs font-semibold text-slate-700">Shared outcome targets</p>{OUTCOME_METRIC_KEYS.map((key) => <label key={key} className="flex items-center gap-3 rounded-xl bg-slate-50 p-3"><span className="min-w-0 flex-1 text-xs font-semibold text-slate-700">{metricConfig[key].label}<span className="block text-[9px] font-normal text-slate-400">{metricConfig[key].weight}% · {metricConfig[key].unit}</span></span><input type="number" min="1" value={targets[key]} onChange={(event) => { setTargets((current) => ({ ...current, [key]: event.target.value })); invalidate(); }} className="w-28 rounded-lg border border-slate-200 bg-white p-2 text-right text-xs" /></label>)}</div>
      <label className="flex items-start gap-3 rounded-2xl border border-amber-100 bg-amber-50 p-4"><input type="checkbox" checked={activate} onChange={(event) => { setActivate(event.target.checked); invalidate(); }} className="mt-0.5 h-4 w-4 accent-primary" /><span className="text-xs text-amber-800"><strong>Activate immediately</strong><span className="mt-1 block text-[10px] text-amber-700">Leave off to create reviewable drafts. Active targets immediately enter scorecards and rankings.</span></span></label>
      {error && <div role="alert" className="flex gap-2 rounded-xl bg-rose-50 p-3 text-xs text-rose-700"><AlertCircle size={15} className="shrink-0" />{error}</div>}
      {notice && <div role="status" className="flex gap-2 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-700"><CheckCircle2 size={15} className="shrink-0" />{notice}</div>}
      {preview && <div className="rounded-2xl border border-slate-100 p-4"><div className="flex gap-3"><span className="rounded-full bg-emerald-50 px-3 py-1 text-[9px] font-bold text-emerald-700">{readyCount} ready</span><span className="rounded-full bg-amber-50 px-3 py-1 text-[9px] font-bold text-amber-700">{conflictCount} conflicts</span></div>{conflictCount > 0 && <div className="mt-3 space-y-1">{preview.filter((row) => row.readiness === 'CONFLICT').map((row) => <p key={row.employeeId} className="text-[10px] text-amber-700">{row.employeeName} already has a {row.existingStatus?.toLowerCase()} target.</p>)}</div>}</div>}
      <div className="grid grid-cols-2 gap-2"><button disabled={isWorking} onClick={previewBatch} className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 py-3 text-[9px] font-bold uppercase tracking-wider text-slate-600 disabled:opacity-40">{isWorking ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}Preview</button><button disabled={isWorking || !preview || readyCount === 0} onClick={createBatch} className="flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-[9px] font-bold uppercase tracking-wider text-white disabled:opacity-40"><CheckCircle2 size={14} />Create {readyCount || ''}</button></div>
    </div>}
  </section>;
};

export default BulkTargetAssignment;
