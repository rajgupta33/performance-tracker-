import { describe, expect, it } from 'vitest';
import { zonedDateTimeToUtcIso } from '../../supabase/functions/_shared/timezone';

describe('attendance auto-close timezone conversion', () => {
  it('converts an India wall-clock cutoff to UTC', () => {
    expect(zonedDateTimeToUtcIso('2026-08-27', '18:30', 'Asia/Kolkata'))
      .toBe('2026-08-27T13:00:00.000Z');
  });

  it('honors daylight saving time in New York', () => {
    expect(zonedDateTimeToUtcIso('2026-07-15', '18:30', 'America/New_York'))
      .toBe('2026-07-15T22:30:00.000Z');
    expect(zonedDateTimeToUtcIso('2026-01-15', '18:30', 'America/New_York'))
      .toBe('2026-01-15T23:30:00.000Z');
  });

  it('rejects malformed values and unknown timezones', () => {
    expect(() => zonedDateTimeToUtcIso('27-08-2026', '18:30', 'Asia/Kolkata')).toThrow();
    expect(() => zonedDateTimeToUtcIso('2026-08-27', '18:30', 'Not/AZone')).toThrow();
  });
});

