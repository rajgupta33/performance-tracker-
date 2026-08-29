import { describe, expect, it } from 'vitest';
import { followUpBucket } from './followup-bucket';
import { buildHash } from '../../../utils/deeplink';

const now = new Date(2026, 7, 26, 12, 0, 0);
const item = (dueAt: Date, status: 'OPEN' | 'DONE' = 'OPEN') => ({ dueAt: dueAt.toISOString(), status });

describe('followUpBucket', () => {
  it('groups open actions using local calendar boundaries', () => {
    expect(followUpBucket(item(new Date(2026, 7, 25, 23, 59)), now)).toBe('OVERDUE');
    expect(followUpBucket(item(new Date(2026, 7, 26, 0, 0)), now)).toBe('TODAY');
    expect(followUpBucket(item(new Date(2026, 7, 26, 23, 59)), now)).toBe('TODAY');
    expect(followUpBucket(item(new Date(2026, 7, 27, 0, 0)), now)).toBe('UPCOMING');
  });

  it('puts completed actions in done regardless of due date', () => {
    expect(followUpBucket(item(new Date(2026, 7, 20), 'DONE'), now)).toBe('DONE');
  });

  it('has a stable authenticated deep link', () => {
    expect(buildHash('follow-ups')).toBe('#/follow-ups');
  });
});
