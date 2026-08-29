import { describe, expect, it } from 'vitest';
import { geolocationErrorMessage } from './visit-location';

describe('geolocationErrorMessage', () => {
  it.each([
    [1, 'permission'],
    [2, 'unavailable'],
    [3, 'timed out'],
  ])('maps browser error code %s to actionable text', (code, expected) => {
    expect(geolocationErrorMessage({ code } as GeolocationPositionError).toLowerCase()).toContain(expected);
  });

  it('provides a safe fallback for unknown errors', () => {
    expect(geolocationErrorMessage(new Error('unknown'))).toContain('could not capture');
  });
});
