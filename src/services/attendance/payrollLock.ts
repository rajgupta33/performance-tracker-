export interface PayrollLockAdvanceInput {
  lockedThrough: string;
  currentLockedThrough?: string;
  currentWorkDate: string;
  note: string;
}

export const validatePayrollLockAdvance = (input: PayrollLockAdvanceInput): string => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.lockedThrough)) return 'Choose a valid payroll lock date.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.currentWorkDate)) return 'Organization work date is unavailable.';
  if (input.lockedThrough >= input.currentWorkDate) return 'Payroll can only lock completed attendance dates.';
  if (input.currentLockedThrough && input.lockedThrough <= input.currentLockedThrough) {
    return `Choose a date after the current payroll lock (${input.currentLockedThrough}).`;
  }
  if (input.note.trim().length < 10) return 'Explain the payroll finalization in at least 10 characters.';
  if (input.note.trim().length > 1000) return 'Payroll lock note must be 1,000 characters or fewer.';
  return '';
};

export const buildPayrollLockParams = (input: PayrollLockAdvanceInput) => ({
  p_locked_through: input.lockedThrough,
  p_note: input.note.trim(),
});

export const shiftYmd = (dateYmd: string, days: number) => {
  const date = new Date(`${dateYmd}T12:00:00`);
  date.setDate(date.getDate() + days);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
};
