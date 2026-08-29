import React from 'react';
import {
  Banknote,
  BriefcaseBusiness,
  MapPin,
  Target,
  UserPlus,
} from 'lucide-react';
import { featureFlags, FieldFeature } from '../../config/features';

interface Props {
  onNavigate: (path: string, params?: unknown) => void;
}

const actions: Array<{
  feature: FieldFeature;
  path: string;
  label: string;
  helper: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}> = [
  { feature: 'visits', path: 'visits', label: 'Start visit', helper: 'Customer check-in', icon: MapPin },
  { feature: 'leads', path: 'leads', label: 'New lead', helper: 'Capture an opportunity', icon: UserPlus },
  { feature: 'deals', path: 'deals', label: 'Deals', helper: 'Move the pipeline', icon: BriefcaseBusiness },
  { feature: 'collections', path: 'collections', label: 'Collection', helper: 'Report a recovery', icon: Banknote },
  { feature: 'targetPerformance', path: 'field-performance', label: 'My progress', helper: 'Targets and score', icon: Target },
];

export const FieldActionGrid: React.FC<Props> = ({ onNavigate }) => (
  <section aria-labelledby="field-actions-heading" className="space-y-3">
    <div className="flex items-end justify-between gap-3">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Field work</p>
        <h2 id="field-actions-heading" className="text-lg font-semibold text-slate-900">What are you doing next?</h2>
      </div>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Two taps or less</span>
    </div>

    <div className="grid grid-cols-2 gap-3">
      {actions.map(({ feature, path, label, helper, icon: Icon }, index) => {
        const enabled = featureFlags[feature];
        return (
          <button
            key={feature}
            type="button"
            disabled={!enabled}
            onClick={() => enabled && onNavigate(path)}
            className={`relative min-h-28 rounded-2xl border p-4 text-left transition-all ${
              enabled
                ? 'border-primary/15 bg-white shadow-sm hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md active:translate-y-0'
                : 'cursor-not-allowed border-slate-100 bg-slate-50/70 text-slate-400'
            } ${index === actions.length - 1 ? 'col-span-2' : ''}`}
          >
            <div className={`mb-3 inline-flex rounded-xl p-2 ${enabled ? 'bg-primary-light text-primary' : 'bg-white text-slate-300'}`}>
              <Icon size={18} />
            </div>
            <p className={`text-sm font-semibold ${enabled ? 'text-slate-900' : 'text-slate-500'}`}>{label}</p>
            <p className="mt-0.5 text-[10px] font-medium text-slate-400">{helper}</p>
            {!enabled && (
              <span className="absolute right-3 top-3 rounded-full bg-white px-2 py-1 text-[8px] font-bold uppercase tracking-wider text-slate-400 shadow-sm">
                Coming soon
              </span>
            )}
          </button>
        );
      })}
    </div>
  </section>
);
