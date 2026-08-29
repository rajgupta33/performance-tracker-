import { describe, expect, it } from 'vitest';
import { collectionStatusLabel, nextCollectionAction } from './collection-status';

describe('collection status flow', () => {
  it('requires verification before reconciliation', () => {
    expect(nextCollectionAction('SUBMITTED')).toBe('VERIFIED');
    expect(nextCollectionAction('VERIFIED')).toBe('RECONCILED');
    expect(nextCollectionAction('RECONCILED')).toBeUndefined();
    expect(nextCollectionAction('REJECTED')).toBeUndefined();
  });

  it('formats status labels', () => expect(collectionStatusLabel('RECONCILED')).toBe('Reconciled'));
});
