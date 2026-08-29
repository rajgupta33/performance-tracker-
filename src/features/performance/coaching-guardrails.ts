import type { CoachingActionStatus } from './performance.types';

export const validateCoachingAction = (
  employeeId: string,
  title: string,
  actionPlan: string,
  dueDate: string,
  today: string,
) => {
  if (!employeeId) return 'Select an employee.';
  if (title.trim().length < 3 || title.trim().length > 120) return 'Title must contain 3 to 120 characters.';
  if (actionPlan.trim().length < 20 || actionPlan.trim().length > 2000) return 'Action plan must contain 20 to 2,000 characters.';
  if (!dueDate || dueDate < today) return 'Due date cannot be in the past.';
  const maximum = new Date(`${today}T00:00:00Z`);
  maximum.setUTCDate(maximum.getUTCDate() + 180);
  if (dueDate > maximum.toISOString().slice(0, 10)) return 'Due date must be within the next 180 days.';
  return '';
};

export const validateCoachingStatusChange = (status: CoachingActionStatus, note: string) => {
  if (status === 'OPEN') return 'Choose a new status.';
  if (note.trim().length < 10) return 'Status note must contain at least 10 characters.';
  return '';
};
