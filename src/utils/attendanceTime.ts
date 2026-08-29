export interface AttendanceClock {
  date: string;
  time: string;
  capturedAt: string;
}

const readPart = (parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string => {
  const value = parts.find((part) => part.type === type)?.value;
  if (!value) throw new Error(`Could not resolve attendance ${type}`);
  return value;
};

/**
 * Returns the work date and wall-clock time in the organization's configured
 * timezone while preserving the exact captured instant for persistence.
 */
export const getAttendanceClock = (
  capturedAt: Date = new Date(),
  timeZone = 'UTC',
): AttendanceClock => {
  if (Number.isNaN(capturedAt.getTime())) throw new Error('Invalid attendance timestamp');

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(capturedAt);

  const year = readPart(parts, 'year');
  const month = readPart(parts, 'month');
  const day = readPart(parts, 'day');
  const hour = readPart(parts, 'hour');
  const minute = readPart(parts, 'minute');

  return {
    date: `${year}-${month}-${day}`,
    time: `${hour}:${minute}`,
    capturedAt: capturedAt.toISOString(),
  };
};
