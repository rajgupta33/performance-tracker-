import React, { useEffect, useMemo, useState } from 'react';
import { History, LockKeyhole, RefreshCw, ShieldAlert } from 'lucide-react';
import type { AttendancePayrollLock as PayrollLock, AttendancePayrollLockEvent } from '../../types';
import { hrService } from '../../services/hrService';
import { getAttendanceClock } from '../../utils/attendanceTime';
import { validatePayrollLockAdvance, shiftYmd } from '../../services/attendance/payrollLock';
import { useToast } from '../../context/ToastContext';
import { useSubscription } from '../../context/SubscriptionContext';

interface AttendancePayrollLockProps {
  timezone: string;
}

export const AttendancePayrollLock: React.FC<AttendancePayrollLockProps> = ({ timezone }) => {
  const { showToast } = useToast();
  const { canPerformAction } = useSubscription();
  const canWrite = canPerformAction('write');
  const currentWorkDate = getAttendanceClock(new Date(), timezone || 'UTC').date;
  const lastCompletedDate = shiftYmd(currentWorkDate, -1);
  const [currentLock, setCurrentLock] = useState<PayrollLock | null>(null);
  const [events, setEvents] = useState<AttendancePayrollLockEvent[]>([]);
  const [lockedThrough, setLockedThrough] = useState(lastCompletedDate);
  const [note, setNote] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const minimumDate = useMemo(
    () => currentLock ? shiftYmd(currentLock.lockedThrough, 1) : undefined,
    [currentLock],
  );
  const hasAvailableDate = !minimumDate || minimumDate <= lastCompletedDate;

  const load = async () => {
    setIsLoading(true);
    try {
      const [lock, history] = await Promise.all([
        hrService.getAttendancePayrollLock(),
        hrService.getAttendancePayrollLockEvents(),
      ]);
      setCurrentLock(lock);
      setEvents(history);
      const nextDate = lock ? shiftYmd(lock.lockedThrough, 1) : lastCompletedDate;
      setLockedThrough(nextDate <= lastCompletedDate ? nextDate : '');
    } catch (error) {
      console.error('Failed to load attendance payroll lock', error);
      showToast('Payroll lock status could not be loaded.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [timezone]);

  const advance = async () => {
    const input = {
      lockedThrough,
      currentLockedThrough: currentLock?.lockedThrough,
      currentWorkDate,
      note,
    };
    const error = validatePayrollLockAdvance(input);
    if (error) {
      showToast(error, 'error');
      return;
    }
    if (!window.confirm(`Finalize attendance through ${lockedThrough}? This lock cannot be moved backward.`)) return;
    setIsSaving(true);
    try {
      await hrService.advanceAttendancePayrollLock(input);
      showToast(`Attendance finalized through ${lockedThrough}.`, 'success');
      setNote('');
      await load();
    } catch (advanceError: any) {
      showToast(advanceError?.message || 'Payroll lock could not be advanced.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="bg-white p-10 rounded-xl border border-slate-100 shadow-sm space-y-7 animate-in slide-in-from-bottom-8 duration-500">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <h3 className="text-xl font-semibold text-slate-900 flex items-center gap-3"><LockKeyhole size={24} className="text-primary" /> Attendance Payroll Lock</h3>
          <p className="text-xs text-slate-500 mt-2 max-w-2xl">Finalized dates cannot be edited, deleted, auto-closed, or changed through correction approval. The boundary can only move forward.</p>
        </div>
        <button onClick={load} disabled={isLoading} aria-label="Refresh payroll lock" className="p-3 bg-slate-50 text-slate-500 rounded-xl disabled:opacity-50"><RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} /></button>
      </div>

      <div className="p-5 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3">
        <ShieldAlert className="text-amber-700 shrink-0" size={20} />
        <div>
          <p className="text-xs font-semibold text-amber-900">Current finalized boundary: {currentLock?.lockedThrough || 'Not set'}</p>
          <p className="text-[10px] text-amber-800 mt-1">All open sessions and pending attendance corrections through the selected date must be resolved before finalization can advance.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[220px_1fr_auto] gap-4 items-end">
        <div>
          <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Lock attendance through</label>
          <input type="date" min={minimumDate} max={lastCompletedDate} value={lockedThrough} disabled={!hasAvailableDate || !canWrite} onChange={(event) => setLockedThrough(event.target.value)} className="w-full mt-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold disabled:opacity-50" />
        </div>
        <div>
          <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Required finalization note</label>
          <input maxLength={1000} value={note} disabled={!hasAvailableDate || !canWrite} onChange={(event) => setNote(event.target.value)} placeholder="Example: August payroll exported and approved by Finance" className="w-full mt-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium disabled:opacity-50" />
        </div>
        <button onClick={advance} disabled={isSaving || isLoading || !hasAvailableDate || !canWrite} className="px-6 py-3.5 bg-primary text-white rounded-xl text-[10px] font-semibold uppercase tracking-widest disabled:opacity-40">{isSaving ? 'Finalizing…' : 'Advance lock'}</button>
      </div>

      {!hasAvailableDate && <p className="text-xs text-slate-400">Attendance is already finalized through the latest completed work date.</p>}

      {events.length > 0 && (
        <div className="space-y-3 pt-2">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest flex items-center gap-2"><History size={13} /> Immutable lock history</p>
          <div className="border border-slate-100 rounded-2xl divide-y divide-slate-100 overflow-hidden">
            {events.slice(0, 8).map((event) => (
              <div key={event.id} className="p-4 bg-slate-50/50 flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-slate-800">{event.previousLockedThrough || 'Not set'} → {event.lockedThrough}</p>
                  <p className="text-[10px] text-slate-500 mt-1">{event.note}</p>
                </div>
                <time className="text-[9px] text-slate-400 whitespace-nowrap">{new Date(event.created).toLocaleString()}</time>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};
