import type { Attendance } from '../../types';
import { createAttendanceEventId } from './checkInPayload';

export interface AttendanceCheckOutRpcParams {
  p_attendance_id: string;
  p_client_event_id: string;
  p_captured_at: string;
  p_location: string;
  p_latitude: number;
  p_longitude: number;
  p_accuracy_m: number;
  p_location_captured_at: string;
  p_remarks: string;
}

export const ensureCheckOutEventId = (attendance: Attendance): Attendance => ({
  ...attendance,
  checkOutEventId: attendance.checkOutEventId || createAttendanceEventId(),
});

export const buildAttendanceCheckOutParams = (attendance: Attendance): AttendanceCheckOutRpcParams => {
  if (!attendance.targetAttendanceId) throw new Error('Attendance session id is required');
  if (!attendance.checkOutEventId) throw new Error('Check-out idempotency key is required');
  if (!attendance.checkOut) throw new Error('Check-out capture time is required');
  if (!attendance.checkOutLocation?.capturedAt || attendance.checkOutLocation.accuracyM == null) {
    throw new Error('Fresh check-out GPS accuracy is required');
  }
  return {
    p_attendance_id: attendance.targetAttendanceId,
    p_client_event_id: attendance.checkOutEventId,
    p_captured_at: attendance.checkOut,
    p_location: attendance.checkOutLocation.address || '',
    p_latitude: attendance.checkOutLocation.lat,
    p_longitude: attendance.checkOutLocation.lng,
    p_accuracy_m: attendance.checkOutLocation.accuracyM,
    p_location_captured_at: attendance.checkOutLocation.capturedAt,
    p_remarks: attendance.checkOutRemarks || '',
  };
};
