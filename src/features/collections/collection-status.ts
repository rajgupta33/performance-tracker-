import type { CollectionStatus } from './collections.types';

export const collectionStatusLabel = (status: CollectionStatus) => status.charAt(0) + status.slice(1).toLowerCase();

export const nextCollectionAction = (status: CollectionStatus): CollectionStatus | undefined => {
  if (status === 'SUBMITTED') return 'VERIFIED';
  if (status === 'VERIFIED') return 'RECONCILED';
  return undefined;
};
