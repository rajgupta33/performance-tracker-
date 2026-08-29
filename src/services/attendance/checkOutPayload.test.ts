import { describe, expect, it } from 'vitest';
import type { Attendance } from '../../types';
import { buildAttendanceCheckOutParams, ensureCheckOutEventId } from './checkOutPayload';

const attendance: Attendance = {
  id: '',
  targetAttendanceId: '43000000-0000-4000-8000-000000000001',
  checkOutEventId: '43000000-0000-4000-8000-000000000002',
  employeeId: 'employee-1',
  date: '2026-08-31',
  checkIn: '2026-08-30T20:15:00.000Z',
  checkOut: '2026-08-31T05:15:00.000Z',
  status: 'PRESENT',
  checkOutRemarks: 'Shift complete',
  checkOutLocation: {
    lat: 28.6139,
    lng: 77.209,
    address: 'New Delhi',
    accuracyM: 16,
    capturedAt: '2026-08-31T05:14:50.000Z',
  },
};

describe('attendance check-out payload', () => {
  it('carries the target session, stable event key, and separate GPS evidence', () => {
    expect(buildAttendanceCheckOutParams(attendance)).toEqual({
      p_attendance_id: attendance.targetAttendanceId,
      p_client_event_id: attendance.checkOutEventId,
      p_captured_at: attendance.checkOut,
      p_location: 'New Delhi',
      p_latitude: 28.6139,
      p_longitude: 77.209,
      p_accuracy_m: 16,
      p_location_captured_at: attendance.checkOutLocation?.capturedAt,
      p_remarks: 'Shift complete',
    });
  });

  it('preserves an existing idempotency key across retries', () => {
    expect(ensureCheckOutEventId(attendance).checkOutEventId).toBe(attendance.checkOutEventId);
  });

  it('creates a key once and rejects missing fresh check-out GPS evidence', () => {
    const withoutKey = { ...attendance, checkOutEventId: undefined };
    const withKey = ensureCheckOutEventId(withoutKey);
    expect(withKey.checkOutEventId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(ensureCheckOutEventId(withKey).checkOutEventId).toBe(withKey.checkOutEventId);
    expect(() => buildAttendanceCheckOutParams({ ...attendance, checkOutLocation: undefined })).toThrow('Fresh check-out GPS accuracy');
  });
});
