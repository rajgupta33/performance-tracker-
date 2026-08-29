import { describe, expect, it } from 'vitest';
import { consolidateAttendance } from '../utils/attendanceUtils';
import type { Attendance } from '../types';

describe('attendance exception consolidation', () => {
  it('preserves a pending auto-close when a workday has multiple punches', () => {
    const base: Attendance = {
      id: 'first', employeeId: 'employee', date: '2026-08-27',
      checkIn: '09:00', status: 'PRESENT', reviewStatus: 'NOT_REQUIRED',
    };
    const pending: Attendance = {
      ...base,
      id: 'auto-close', checkIn: '13:00', checkOut: '18:30',
      requiresReview: true, reviewStatus: 'PENDING',
      changeReason: 'AUTO_CLOSE_MAX_TIME_REACHED',
    };

    const [result] = consolidateAttendance([base, pending]);
    expect(result.id).toBe('auto-close');
    expect(result.reviewStatus).toBe('PENDING');
    expect(result.changeReason).toBe('AUTO_CLOSE_MAX_TIME_REACHED');
  });
});

