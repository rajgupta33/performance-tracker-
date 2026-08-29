export const validatePointRuleDraft = (
  points: number,
  effectiveFrom: string,
  changeNote: string,
  now = new Date(),
) => {
  if (!Number.isInteger(points) || points < 1 || points > 100) return 'Points must be a whole number from 1 to 100.';
  if (!effectiveFrom) return 'Choose an effective time.';
  const effectiveDate = new Date(effectiveFrom);
  if (Number.isNaN(effectiveDate.getTime()) || effectiveDate <= now) return 'Effective time must be in the future.';
  if (changeNote.trim().length < 10) return 'Change note must contain at least 10 characters.';
  return '';
};

export const validatePointAdjustment = (
  employeeId: string,
  pointsDelta: number,
  reason: string,
  reference: string,
  occurredAt: string,
  now = new Date(),
) => {
  if (!employeeId) return 'Select an employee.';
  if (!Number.isInteger(pointsDelta) || pointsDelta === 0 || Math.abs(pointsDelta) > 100) {
    return 'Adjustment must be a non-zero whole number from -100 to 100.';
  }
  if (reason.trim().length < 10) return 'Reason must contain at least 10 characters.';
  if (reference.trim().length < 3) return 'Reference must contain at least 3 characters.';
  const occurredDate = new Date(occurredAt);
  const oldestAllowed = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const latestAllowed = new Date(now.getTime() + 5 * 60 * 1000);
  if (Number.isNaN(occurredDate.getTime()) || occurredDate < oldestAllowed || occurredDate > latestAllowed) {
    return 'Adjustment date must be within the last 90 days.';
  }
  return '';
};
