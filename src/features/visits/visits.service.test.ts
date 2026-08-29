import { describe, expect, it } from 'vitest';
import { buildHash } from '../../utils/deeplink';
import { buildVisitEvidencePath } from './visits.service';

describe('visit deep link', () => {
  it('builds a stable authenticated visits route', () => {
    expect(buildHash('visits')).toBe('#/visits');
  });
});

describe('visit evidence path', () => {
  it('matches the tenant/user/visit storage policy convention', () => {
    expect(buildVisitEvidencePath({
      organizationId: 'org-1',
      employeeId: 'user-2',
      id: 'visit-3',
    }, 'file-4')).toBe('org-1/user-2/visit-3/completion-file-4.webp');
  });
});
