export const featureFlags = {
  attendance: true,
  visits: import.meta.env.VITE_FEATURE_VISITS === 'true',
  leads: import.meta.env.VITE_FEATURE_LEADS === 'true',
  deals: import.meta.env.VITE_FEATURE_DEALS === 'true',
  collections: import.meta.env.VITE_FEATURE_COLLECTIONS === 'true',
  targetPerformance: import.meta.env.VITE_FEATURE_TARGET_PERFORMANCE === 'true',
  fieldBI: import.meta.env.VITE_FEATURE_FIELD_BI === 'true',
  syncCenter: import.meta.env.VITE_FEATURE_SYNC_CENTER === 'true',
} as const;

export type FieldFeature = keyof typeof featureFlags;
