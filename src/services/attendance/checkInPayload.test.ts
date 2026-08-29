import { describe, expect, it } from 'vitest';
import type { Attendance } from '../../types';
import {
  buildAttendanceCheckInParams,
  createAttendanceEventId,
  ensureAttendanceEventId,
} from './checkInPayload';

const attendance: Attendance = {
  id: '',
  clientEventId: '41000000-0000-4000-8000-000000000001',
  employeeId: 'employee-1',
  date: '2026-08-31',
  checkIn: '2026-08-30T20:15:00.000Z',
  status: 'PRESENT',
  dutyType: 'FACTORY',
  remarks: '[FACTORY] Dealer visit',
  location: {
    lat: 28.6139,
    lng: 77.209,
    address: 'New Delhi',
    accuracyM: 18,
    capturedAt: '2026-08-30T20:14:45.000Z',
  },
};

describe('attendance check-in payload', () => {
  it('carries one stable idempotency key and GPS evidence to the RPC', () => {
    expect(buildAttendanceCheckInParams(attendance)).toMatchObject({
      p_client_event_id: attendance.clientEventId,
      p_captured_at: attendance.checkIn,
      p_work_date: attendance.date,
      p_accuracy_m: 18,
      p_location_captured_at: attendance.location?.capturedAt,
      p_duty_type: 'FACTORY',
    });
  });

  it('preserves an existing event id across retries', () => {
    expect(ensureAttendanceEventId(attendance).clientEventId).toBe(attendance.clientEventId);
  });

  it('creates UUID-shaped event ids and rejects missing GPS evidence', () => {
    expect(createAttendanceEventId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(() => buildAttendanceCheckInParams({ ...attendance, location: undefined })).toThrow('Fresh GPS accuracy');
  });
});

