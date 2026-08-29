import { describe, expect, it } from 'vitest';
import { getAttendanceClock } from '../utils/attendanceTime';

describe('attendance work clock', () => {
  it('uses the organization timezone for the work date around UTC midnight', () => {
    const instant = new Date('2026-08-30T20:15:00.000Z');

    expect(getAttendanceClock(instant, 'Asia/Kolkata')).toEqual({
      date: '2026-08-31',
      time: '01:45',
      capturedAt: '2026-08-30T20:15:00.000Z',
    });
  });

  it('preserves the exact instant across different organization timezones', () => {
    const instant = new Date('2026-08-30T03:30:00.000Z');
    const newYork = getAttendanceClock(instant, 'America/New_York');

    expect(newYork.date).toBe('2026-08-29');
    expect(newYork.time).toBe('23:30');
    expect(newYork.capturedAt).toBe(instant.toISOString());
  });

  it('rejects invalid dates and timezone names', () => {
    expect(() => getAttendanceClock(new Date('invalid'), 'UTC')).toThrow('Invalid attendance timestamp');
    expect(() => getAttendanceClock(new Date(), 'Not/AZone')).toThrow();
  });
});
