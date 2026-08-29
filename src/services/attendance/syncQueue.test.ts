import { describe, expect, it } from 'vitest';
import { classifySyncError } from './syncQueue';

describe('attendance sync error classification', () => {
  it('retries network and stale function-cache failures', () => {
    expect(classifySyncError(new TypeError('Failed to fetch')).retryable).toBe(true);
    expect(classifySyncError({ code: 'PGRST202', message: 'Function not in schema cache' }).retryable).toBe(true);
  });

  it('does not queue database validation and constraint failures', () => {
    expect(classifySyncError({ code: 'P0001', message: 'GPS accuracy exceeds limit' }).retryable).toBe(false);
    expect(classifySyncError({ code: '23505', message: 'duplicate key' }).retryable).toBe(false);
  });
});

