import { describe, expect, it } from 'vitest';
import { isAttendanceLocationFresh } from '../utils/attendanceLocation';

describe('attendance location freshness', () => {
  const now = new Date('2026-08-30T12:05:00.000Z');

  it('accepts a recent GPS capture', () => {
    expect(isAttendanceLocationFresh({ accuracyM: 25, capturedAt: '2026-08-30T12:01:00.000Z' }, now)).toBe(true);
  });

  it('rejects stale, future, and malformed captures', () => {
    expect(isAttendanceLocationFresh({ accuracyM: 25, capturedAt: '2026-08-30T11:59:59.000Z' }, now)).toBe(false);
    expect(isAttendanceLocationFresh({ accuracyM: 25, capturedAt: '2026-08-30T12:06:01.000Z' }, now)).toBe(false);
    expect(isAttendanceLocationFresh({ accuracyM: 25, capturedAt: 'not-a-date' }, now)).toBe(false);
  });
});

