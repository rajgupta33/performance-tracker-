import type { Attendance } from '../../types';

export interface AttendanceCheckInRpcParams {
  p_client_event_id: string;
  p_captured_at: string;
  p_work_date: string;
  p_status: string;
  p_location: string;
  p_latitude: number;
  p_longitude: number;
  p_accuracy_m: number;
  p_location_captured_at: string;
  p_duty_type: string;
  p_remarks: string;
}

export const createAttendanceEventId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (token) => {
    const random = Math.floor(Math.random() * 16);
    const value = token === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
};

export const ensureAttendanceEventId = (attendance: Attendance): Attendance => ({
  ...attendance,
  clientEventId: attendance.clientEventId || createAttendanceEventId(),
});

export const buildAttendanceCheckInParams = (attendance: Attendance): AttendanceCheckInRpcParams => {
  if (!attendance.clientEventId) throw new Error('Attendance idempotency key is required');
  if (!attendance.checkIn || !attendance.date) throw new Error('Attendance capture time is required');
  if (!attendance.location?.capturedAt || attendance.location.accuracyM == null) {
    throw new Error('Fresh GPS accuracy is required');
  }
  if (!attendance.dutyType) throw new Error('Attendance duty type is required');

  return {
    p_client_event_id: attendance.clientEventId,
    p_captured_at: attendance.checkIn,
    p_work_date: attendance.date,
    p_status: attendance.status,
    p_location: attendance.location.address || '',
    p_latitude: attendance.location.lat,
    p_longitude: attendance.location.lng,
    p_accuracy_m: attendance.location.accuracyM,
    p_location_captured_at: attendance.location.capturedAt,
    p_duty_type: attendance.dutyType,
    p_remarks: attendance.remarks || '',
  };
};

