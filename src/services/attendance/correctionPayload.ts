export interface AttendanceCorrectionInput {
  attendanceId?: string;
  workDate: string;
  proposedCheckIn?: string;
  proposedCheckOut?: string;
  reason: string;
  hasExistingAttendance: boolean;
  currentWorkDate?: string;
}

export const validateAttendanceCorrection = (
  input: AttendanceCorrectionInput,
  today = new Date(),
): string => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.workDate)) return 'Choose a valid attendance date.';
  const workDate = new Date(`${input.workDate}T12:00:00`);
  if (Number.isNaN(workDate.getTime())) return 'Choose a valid attendance date.';
  const localToday = input.currentWorkDate
    ? new Date(`${input.currentWorkDate}T12:00:00`)
    : new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
  const earliest = new Date(localToday);
  earliest.setDate(earliest.getDate() - 90);
  if (workDate > localToday) return 'Future attendance cannot be corrected.';
  if (workDate < earliest) return 'Attendance corrections are limited to the last 90 days.';
  if (!input.proposedCheckIn && !input.proposedCheckOut) return 'Enter at least one corrected punch time.';
  if (!input.hasExistingAttendance && (!input.proposedCheckIn || !input.proposedCheckOut)) {
    return 'A missing attendance day requires both check-in and check-out times.';
  }
  if (input.reason.trim().length < 10) return 'Explain the correction in at least 10 characters.';
  if (input.reason.trim().length > 1000) return 'Correction reason must be 1,000 characters or fewer.';
  return '';
};

export const buildAttendanceCorrectionParams = (input: AttendanceCorrectionInput) => ({
  p_attendance_id: input.attendanceId || null,
  p_work_date: input.workDate,
  p_proposed_check_in: input.proposedCheckIn || null,
  p_proposed_check_out: input.proposedCheckOut || null,
  p_reason: input.reason.trim(),
});
