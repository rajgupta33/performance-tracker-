import { describe, expect, it } from 'vitest';
import { buildAttendanceCorrectionParams, validateAttendanceCorrection } from './correctionPayload';

const today = new Date('2026-08-30T12:00:00');

describe('attendance correction payload', () => {
  it('accepts a single-punch correction for an existing attendance row', () => {
    const input = {
      attendanceId: '44000000-0000-4000-8000-000000000001',
      workDate: '2026-08-29',
      proposedCheckOut: '18:15',
      reason: 'Forgot to check out after the customer visit.',
      hasExistingAttendance: true,
    };
    expect(validateAttendanceCorrection(input, today)).toBe('');
    expect(buildAttendanceCorrectionParams(input)).toMatchObject({
      p_attendance_id: input.attendanceId,
      p_work_date: '2026-08-29',
      p_proposed_check_in: null,
      p_proposed_check_out: '18:15',
    });
  });

  it('requires both punches when the whole attendance day is missing', () => {
    expect(validateAttendanceCorrection({
      workDate: '2026-08-29',
      proposedCheckIn: '09:00',
      reason: 'The complete attendance day was not recorded.',
      hasExistingAttendance: false,
    }, today)).toContain('both check-in and check-out');
  });

  it('rejects future, stale, empty, and poorly explained requests', () => {
    const base = {
      workDate: '2026-08-29',
      proposedCheckIn: '09:00',
      proposedCheckOut: '18:00',
      reason: 'A sufficiently detailed correction reason.',
      hasExistingAttendance: false,
    };
    expect(validateAttendanceCorrection({ ...base, workDate: '2026-08-31' }, today)).toContain('Future');
    expect(validateAttendanceCorrection({ ...base, workDate: '2026-05-01' }, today)).toContain('90 days');
    expect(validateAttendanceCorrection({ ...base, proposedCheckIn: '', proposedCheckOut: '' }, today)).toContain('at least one');
    expect(validateAttendanceCorrection({ ...base, reason: 'short' }, today)).toContain('10 characters');
  });

  it('uses the organization work date instead of the device date near midnight', () => {
    expect(validateAttendanceCorrection({
      workDate: '2026-08-31',
      proposedCheckIn: '09:00',
      proposedCheckOut: '18:00',
      reason: 'The device is behind the organization timezone.',
      hasExistingAttendance: false,
      currentWorkDate: '2026-08-31',
    }, today)).toBe('');
  });

  it('rejects requests inside a finalized payroll period', () => {
    expect(validateAttendanceCorrection({
      workDate: '2026-08-28',
      proposedCheckOut: '18:00',
      reason: 'Forgot to record checkout before payroll finalization.',
      hasExistingAttendance: true,
      currentWorkDate: '2026-08-30',
      payrollLockedThrough: '2026-08-28',
    }, today)).toContain('finalized through 2026-08-28');
  });
});
