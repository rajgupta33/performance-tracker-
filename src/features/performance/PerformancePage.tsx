import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Award, CalendarRange, IndianRupee, Loader2, Medal, Plus, Save, Sparkles, Target, TrendingUp, Users, X } from 'lucide-react';
import type { User } from '../../types';
import BulkTargetAssignment from './BulkTargetAssignment';
import PerformanceCoachingActions from './PerformanceCoachingActions';
import PerformanceGroupScorecards from './PerformanceGroupScorecards';
import PerformanceLeaderboard from './PerformanceLeaderboard';
import PerformanceTargetHistory from './PerformanceTargetHistory';
import PointsAdminPanel from './PointsAdminPanel';
import { metricConfig, outcomeTargetWeight } from './performance-config';
import { progressWidth, totalPerformanceScore } from './performance-score';
import { performanceService } from './performance.service';
import { OUTCOME_METRIC_KEYS, type EmployeeOption, type EmployeePerformanceBadge, type LeaderboardRow, type MetricUnit, type OutcomeMetricKey, type PerformanceMetric, type PointsSummary, type TargetMetricInput } from './performance.types';

const localDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const initialTargets = () => Object.fromEntries(OUTCOME_METRIC_KEYS.map((key) => [key, String(metricConfig[key].defaultTarget)])) as Record<OutcomeMetricKey, string>;
const formatValue = (value: number, unit: MetricUnit) => unit === 'INR' ? `₹${value.toLocaleString('en-IN')}` : unit === 'PERCENT' ? `${value.toLocaleString('en-IN')}%` : value.toLocaleString('en-IN');

const PerformancePage: React.FC<{ user: User }> = ({ user }) => {
  const today = new Date();
  const [metrics, setMetrics] = useState<PerformanceMetric[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([{ id: user.id, name: user.name, employeeId: user.employeeId }]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(user.id);
  const [showCreate, setShowCreate] = useState(false);
  const [periodStart, setPeriodStart] = useState(localDate(new Date(today.getFullYear(), today.getMonth(), 1)));
  const [periodEnd, setPeriodEnd] = useState(localDate(new Date(today.getFullYear(), today.getMonth() + 1, 0)));
  const [targets, setTargets] = useState<Record<OutcomeMetricKey, string>>(initialTargets);
  const [points, setPoints] = useState<PointsSummary>({ currentMonthPoints: 0, personalBestPoints: 0, currentMonthEvents: 0 });
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [badges, setBadges] = useState<EmployeePerformanceBadge[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const canManage = ['ADMIN', 'HR', 'MANAGER'].includes(user.role);

  const loadPerformance = async (employeeId: string) => {
    setIsLoading(true); setError('');
    try { setMetrics(await performanceService.get(employeeId)); }
    catch (err: any) { setError(err.message || 'Could not load performance targets.'); }
    finally { setIsLoading(false); }
  };

  useEffect(() => {
    loadPerformance(user.id);
    Promise.all([performanceService.getPointsSummary(), performanceService.getLeaderboard(), performanceService.getMyBadges()])
      .then(([summary, rows, badgeRows]) => { setPoints(summary); setLeaderboard(rows); setBadges(badgeRows); })
      .catch(() => undefined);
    if (canManage) performanceService.listEmployees().then(setEmployees).catch(() => undefined);
  }, []);

  const selectedEmployee = employees.find((employee) => employee.id === selectedEmployeeId);
  const score = totalPerformanceScore(metrics);
  const targetWeight = outcomeTargetWeight(OUTCOME_METRIC_KEYS);
  const needsAttention = useMemo(() => [...metrics].filter((metric) => metric.achievementPct < 100).sort((a, b) => a.achievementPct - b.achievementPct)[0], [metrics]);
  const earnedBadges = badges.filter((badge) => badge.earned);
  const reloadRewards = () => Promise.all([performanceService.getPointsSummary(), performanceService.getLeaderboard(), performanceService.getMyBadges()])
    .then(([summary, rows, badgeRows]) => { setPoints(summary); setLeaderboard(rows); setBadges(badgeRows); });

  const selectEmployee = (employeeId: string) => {
    setSelectedEmployeeId(employeeId); setNotice(''); loadPerformance(employeeId);
  };

  const createTarget = async () => {
    const targetMetrics: TargetMetricInput[] = OUTCOME_METRIC_KEYS.map((key) => ({ metricKey: key, targetValue: Number(targets[key]), weight: metricConfig[key].weight, unit: metricConfig[key].unit }));
    if (!selectedEmployeeId || !periodStart || !periodEnd || periodEnd < periodStart || targetMetrics.some((metric) => metric.targetValue <= 0) || targetWeight !== 100) return setError('Enter a valid period and positive metric targets.');
    setIsSaving(true); setError(''); setNotice('');
    try {
      await performanceService.createEmployeeTarget(selectedEmployeeId, periodStart, periodEnd, targetMetrics);
      setShowCreate(false); setNotice('Performance target activated.'); await loadPerformance(selectedEmployeeId);
    } catch (err: any) { setError(err.message || 'Could not create the target.'); }
    finally { setIsSaving(false); }
  };

  return <div className="space-y-5 animate-in fade-in duration-500">
    <header className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.22em] text-primary">Targets</p><h1 className="text-2xl font-semibold text-slate-900">My performance</h1><p className="text-sm text-slate-500">Weighted progress with each metric capped at 120% contribution.</p></div>{canManage && <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 rounded-2xl bg-primary px-4 py-3 text-xs font-bold text-white"><Plus size={16} /> Assign target</button>}</header>
    {canManage && <label className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3"><Users size={18} className="text-primary" /><select value={selectedEmployeeId} onChange={(event) => selectEmployee(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-700 outline-none">{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}{employee.employeeId ? ` · ${employee.employeeId}` : ''}</option>)}</select></label>}
    {canManage && <BulkTargetAssignment employees={employees} onCreated={() => loadPerformance(selectedEmployeeId)} />}
    {['ADMIN', 'HR'].includes(user.role) && <PointsAdminPanel employees={employees} onChanged={() => { reloadRewards().catch(() => undefined); }} />}
    {canManage && <PerformanceGroupScorecards />}
    {error && <div role="alert" className="flex gap-3 rounded-2xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-700"><AlertCircle size={18} className="shrink-0" />{error}</div>}
    {notice && <div role="status" className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-700">{notice}</div>}
    <section className="grid grid-cols-2 gap-3"><div className="rounded-3xl border border-violet-100 bg-violet-50 p-4"><div className="flex items-center justify-between"><p className="text-[9px] font-bold uppercase tracking-wider text-violet-600">Your points this month</p><Sparkles size={17} className="text-violet-500" /></div><p className="mt-2 text-3xl font-bold text-violet-900">{points.currentMonthPoints}</p><p className="text-[10px] text-violet-500">{points.currentMonthEvents} ledger entries</p></div><div className="rounded-3xl border border-amber-100 bg-amber-50 p-4"><div className="flex items-center justify-between"><p className="text-[9px] font-bold uppercase tracking-wider text-amber-700">Personal best</p><Medal size={17} className="text-amber-600" /></div><p className="mt-2 text-3xl font-bold text-amber-900">{points.personalBestPoints}</p><p className="text-[10px] text-amber-600">{points.personalBestMonth ? new Date(`${points.personalBestMonth}T00:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : 'No scored month yet'}</p></div></section>
    {badges.length > 0 && <section className="rounded-3xl border border-violet-100 bg-white p-5 shadow-sm"><div className="mb-3 flex items-center gap-2"><Award size={18} className="text-violet-600" /><div><p className="text-[9px] font-bold uppercase tracking-wider text-violet-600">Monthly achievements</p><h2 className="text-sm font-semibold text-slate-800">{earnedBadges.length} of {badges.length} badges earned</h2></div></div><div className="grid gap-2 sm:grid-cols-3">{badges.map((badge) => <article key={badge.code} className={`rounded-2xl p-3 ${badge.earned ? 'bg-violet-50 text-violet-800' : 'bg-slate-50 text-slate-400'}`}><p className="text-xs font-bold">{badge.name}</p><p className="mt-1 text-[9px]">{badge.earned ? `Earned at ${badge.thresholdPoints} points` : `${badge.thresholdPoints} points required`}</p></article>)}</div></section>}
    {leaderboard.length > 0 && <section className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm"><div className="mb-3 flex items-center justify-between"><div><p className="text-[9px] font-bold uppercase tracking-wider text-primary">This month</p><h2 className="font-semibold text-slate-900">Leaderboard</h2></div><Medal size={20} className="text-amber-500" /></div><div className="space-y-2">{leaderboard.map((row) => <div key={row.employeeId} className={`flex items-center gap-3 rounded-xl p-2 ${row.employeeId === user.id ? 'bg-primary-light' : 'bg-slate-50'}`}><span className="w-6 text-center text-xs font-bold text-slate-400">#{row.rank}</span><span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-700">{row.employeeName}</span><span className="text-xs font-bold text-primary">{row.points} pts</span></div>)}</div></section>}
    <PerformanceLeaderboard user={user} />
    <PerformanceTargetHistory employeeId={selectedEmployeeId} canManage={canManage} onChanged={() => loadPerformance(selectedEmployeeId)} />
    <PerformanceCoachingActions employeeId={selectedEmployeeId} employeeName={selectedEmployee?.name || user.name} targetId={metrics[0]?.targetId} suggestedMetric={needsAttention?.metricKey as OutcomeMetricKey | undefined} canManage={canManage} />
    {isLoading ? <div className="flex min-h-80 items-center justify-center"><Loader2 className="animate-spin text-primary" size={36} /></div> : metrics.length === 0 ? <div className="rounded-3xl border border-dashed border-slate-200 bg-white p-10 text-center"><Target size={32} className="mx-auto mb-3 text-slate-300" /><p className="font-semibold text-slate-600">No active target</p><p className="mt-1 text-sm text-slate-400">A manager needs to assign a target for {selectedEmployee?.name || 'this employee'}.</p></div> : <>
      <section className="rounded-3xl bg-gradient-to-br from-primary to-primary-dark p-5 text-white shadow-lg shadow-primary/20"><div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/70">Weighted score</p><p className="mt-1 text-4xl font-bold">{score.toFixed(1)}<span className="text-lg text-white/60"> / 100</span></p></div><TrendingUp size={30} className="text-white/70" /></div><p className="mt-4 flex items-center gap-2 text-xs text-white/75"><CalendarRange size={14} />{new Date(`${metrics[0].periodStart}T00:00:00`).toLocaleDateString()} – {new Date(`${metrics[0].periodEnd}T00:00:00`).toLocaleDateString()}</p></section>
      {needsAttention && <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-800"><strong>How to improve:</strong> focus next on {metricConfig[needsAttention.metricKey].label.toLowerCase()} ({needsAttention.achievementPct.toFixed(0)}% achieved).</div>}
      <div className="space-y-3">{metrics.map((metric) => <article key={metric.metricKey} className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-slate-900">{metricConfig[metric.metricKey].label}</p><p className="text-xs text-slate-400">Weight {metric.weight}% · contributes {metric.weightedScore.toFixed(1)} points</p></div><p className="text-right text-sm font-bold text-slate-700">{formatValue(metric.actualValue, metric.unit)}<span className="block text-[10px] font-medium text-slate-400">of {formatValue(metric.targetValue, metric.unit)}</span></p></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${metric.achievementPct >= 100 ? 'bg-emerald-500' : metric.achievementPct >= 60 ? 'bg-primary' : 'bg-amber-500'}`} style={{ width: `${progressWidth(metric.achievementPct)}%` }} /></div><p className="mt-2 text-right text-[10px] font-bold text-slate-400">{metric.achievementPct.toFixed(1)}%</p></article>)}</div>
    </>}

    {showCreate && <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/60 backdrop-blur-sm sm:items-center sm:p-4"><section className="max-h-[92vh] w-full max-w-xl space-y-4 overflow-y-auto rounded-t-3xl bg-white p-5 sm:rounded-3xl"><div className="flex items-center justify-between"><div><p className="text-[9px] font-bold uppercase tracking-wider text-primary">Weighted scorecard</p><h2 className="text-xl font-semibold text-slate-900">Assign target</h2></div><button onClick={() => setShowCreate(false)} className="rounded-xl bg-slate-100 p-2 text-slate-500"><X size={18} /></button></div>
      <p className="rounded-xl bg-blue-50 p-3 text-xs text-blue-800">Assigning to <strong>{selectedEmployee?.name}</strong>. The active outcome model uses sales 40%, collections 25%, productive visits 15%, new dealers 10%, and conversion 10%. Attendance is paused.</p>
      <div className="grid grid-cols-2 gap-3"><label className="space-y-1 text-xs font-semibold text-slate-600">Period start *<input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-normal" /></label><label className="space-y-1 text-xs font-semibold text-slate-600">Period end *<input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-normal" /></label></div>
      <div className="space-y-2">{OUTCOME_METRIC_KEYS.map((key) => <label key={key} className="flex items-center gap-3 rounded-2xl border border-slate-100 p-3"><span className="min-w-0 flex-1 text-xs font-semibold text-slate-700">{metricConfig[key].label}<span className="block text-[10px] font-medium text-slate-400">{metricConfig[key].weight}% weight · {metricConfig[key].unit}</span></span><div className="relative w-32">{metricConfig[key].unit === 'INR' && <IndianRupee size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />}<input type="number" min="1" value={targets[key]} onChange={(event) => setTargets((current) => ({ ...current, [key]: event.target.value }))} className={`w-full rounded-xl border border-slate-200 bg-slate-50 p-2 text-right text-sm outline-none ${metricConfig[key].unit === 'INR' ? 'pl-6' : ''}`} /></div></label>)}</div>
      <button disabled={isSaving || OUTCOME_METRIC_KEYS.some((key) => Number(targets[key]) <= 0)} onClick={createTarget} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-xs font-bold uppercase tracking-wider text-white disabled:opacity-40">{isSaving ? <Loader2 className="animate-spin" size={17} /> : <Save size={17} />} Activate target</button>
    </section></div>}
  </div>;
};

export default PerformancePage;
