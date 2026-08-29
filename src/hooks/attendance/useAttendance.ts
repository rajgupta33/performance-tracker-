
import { useState, useEffect, useCallback } from 'react';
import { hrService } from '../../services/hrService';
import { Attendance, AppConfig, Shift } from '../../types';
import { useToast } from '../../context/ToastContext';
import { getAttendanceClock } from '../../utils/attendanceTime';

export const useAttendance = (user: any, onFinish?: () => void) => {
  const { showToast } = useToast();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [activeRecord, setActiveRecord] = useState<Attendance | undefined>(undefined);
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);
  const [employeeShift, setEmployeeShift] = useState<Shift | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hasPendingCheckIn, setHasPendingCheckIn] = useState(false);
  const [hasPendingCheckOut, setHasPendingCheckOut] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'queued'>('idle');

  // Clock Timer
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const refreshData = useCallback(async () => {
    setIsRefreshing(true);
    try {
      // Drain any selfie uploads that were queued after a previous failure
      // (see RC#4 in Others/SCALING_IMPLEMENTATION_LOG.md). Fire-and-forget —
      // this runs in the background and doesn't block the UI.
      hrService.retryPendingSelfies?.().catch(() => { /* handled inside */ });

      // Drain the core check-in sync queue (offline/5xx check-ins that
      // never created a record). See Others/CHECKIN_SYNC_QUEUE_RECORD.md.
      // Await before querying the active row so a successful replay cannot
      // race the UI into offering a second check-in.
      await hrService.drainCheckInQueue?.().catch(() => { /* handled inside */ });

      const [reconciled, config, shift] = await Promise.all([
        hrService.getActiveAttendanceWithReconciliation(user.id),
        hrService.getConfig(),
        hrService.resolveShiftForEmployee(user.id, user.shiftId),
      ]);

      const { active, closedPast } = reconciled;
      const today = getAttendanceClock(new Date(), config.timezone || 'UTC').date;
      setHasPendingCheckIn(hrService.hasPendingCheckIn(user.id, today));
      setHasPendingCheckOut(hrService.hasPendingCheckOut(user.id, today));

      if (active && active.date !== today) {
        setActiveRecord(undefined);
      } else {
        setActiveRecord(active);
      }
      setAppConfig(config);
      setEmployeeShift(shift);
      setLoadError(null);

      // If the workday session manager just closed any past-date sessions
      // as a client-side fallback, surface a one-time, human-readable toast.
      if (closedPast.length > 0) {
        const dates = closedPast.map(s => s.date).join(', ');
        showToast(
          `We auto-closed your forgotten check-out from ${dates}. Please remember to check out at end of day.`,
          'info'
        );
      }
    } catch (e) {
      console.error('Data sync failed', e);
      setLoadError('Attendance could not be synchronized. Retry before punching to avoid a duplicate record.');
      throw e;
    } finally {
      setIsRefreshing(false);
    }
  }, [user.id, user.shiftId, showToast]);

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      try {
        await refreshData();
      } catch {
        // refreshData exposes a readable error for the attendance screen.
      } finally {
        setIsLoading(false);
      }
    };
    init();
  }, [refreshData]);

  const submitPunch = async (
    dutyType: 'OFFICE' | 'FACTORY',
    remarks: string,
    location: { lat: number; lng: number; address: string; accuracyM: number; capturedAt: string },
    selfieData: string
  ) => {
    setStatus('loading');
    try {
      if (loadError) throw new Error('Attendance state is not synchronized');
      const clock = getAttendanceClock(new Date(), appConfig?.timezone || 'UTC');
      const punchTime = clock.time;
      const today = clock.date;

      if (activeRecord && !activeRecord.checkOut) {
        // Clock Out
        const result = await hrService.saveCheckOut({
          ...activeRecord,
          targetAttendanceId: activeRecord.id,
          checkOut: clock.capturedAt,
          checkOutLocation: location,
          checkOutSelfie: selfieData,
          checkOutRemarks: remarks,
        });
        if (result?.queued) {
          setHasPendingCheckOut(true);
          setStatus('queued');
          showToast('Check-out saved offline. It will sync automatically; do not punch again.', 'info');
          setTimeout(() => {
            if (onFinish) onFinish();
          }, 1800);
          return;
        }
      } else {
        // Clock In
        let punchStatus: Attendance['status'] = 'PRESENT';
        
        // Late Calculation Logic (Strict Mode Enforced)
        // Priority: employee shift > global appConfig
        const shiftStart = employeeShift?.startTime || appConfig?.officeStartTime;
        const shiftGrace = employeeShift?.lateGracePeriod ?? appConfig?.lateGracePeriod ?? 0;

        if (dutyType === 'OFFICE' && shiftStart) {
          const [pH, pM] = punchTime.split(':').map(Number);
          const [sH, sM] = shiftStart.split(':').map(Number);

          const punchMins = pH * 60 + pM;
          const startMins = sH * 60 + sM + shiftGrace;

          if (punchMins > startMins) {
            punchStatus = 'LATE';
          }
        }
        
        const result = await hrService.saveAttendance({
          id: '', 
          employeeId: user.id, 
          employeeName: user.name, 
          date: today,
          checkIn: clock.capturedAt,
          status: punchStatus, 
          location, 
          selfie: selfieData, 
          remarks: dutyType === 'FACTORY' ? `[FACTORY] ${remarks}` : remarks,
          dutyType: dutyType
        });
        if (result?.queued) {
          setHasPendingCheckIn(true);
          setStatus('queued');
          showToast('Check-in saved offline. It will sync automatically; do not punch again.', 'info');
          setTimeout(() => {
            if (onFinish) onFinish();
          }, 1800);
          return;
        }
      }
      
      setStatus('success');
      try {
        await refreshData();
      } catch {
        // The punch is already durable. Do not tell the employee it failed or
        // encourage a duplicate; the next screen load will reconcile it.
        showToast('Attendance was saved, but the latest status could not be refreshed.', 'warning');
      }
      
      // Auto-close after success
      setTimeout(() => {
        if (onFinish) onFinish();
      }, 1500);

    } catch (err) {
      console.error(err);
      setStatus('idle');
      showToast("Failed to submit attendance. Please try again.", "error");
    }
  };

  return {
    currentTime,
    activeRecord,
    appConfig,
    isLoading,
    isRefreshing,
    loadError,
    hasPendingCheckIn,
    hasPendingCheckOut,
    status,
    submitPunch,
    retryLoad: refreshData,
  };
};
