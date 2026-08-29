import { describe, expect, it } from 'vitest';
import { safeRate } from './field-bi-metrics';

describe('BI rates', () => {
  it('returns a one-decimal percentage', () => expect(safeRate(7, 9)).toBe(77.8));
  it('does not divide by zero', () => expect(safeRate(3, 0)).toBe(0));
});
