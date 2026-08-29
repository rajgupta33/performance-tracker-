import type { CrmFollowUp, FollowUpBucket } from './followups.types';

export const followUpBucket = (followUp: Pick<CrmFollowUp, 'status' | 'dueAt'>, now = new Date()): FollowUpBucket => {
  if (followUp.status !== 'OPEN') return 'DONE';
  const due = new Date(followUp.dueAt);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  if (due < startOfToday) return 'OVERDUE';
  if (due < startOfTomorrow) return 'TODAY';
  return 'UPCOMING';
};
