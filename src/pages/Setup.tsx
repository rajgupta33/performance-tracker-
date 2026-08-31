import React from 'react';
import { AlertCircle, Database } from 'lucide-react';
import { APP_NAME } from '../constants';

/**
 * Rendered by App.tsx when `isConfigured` is false, i.e. when
 * isSupabaseConfigured() reports a missing VITE_SUPABASE_URL or
 * VITE_SUPABASE_ANON_KEY at build time.
 *
 * This used to be a PocketBase connection form left over from the pre-Supabase
 * stack. It defaulted to a third-party host and its save handler called
 * onComplete() unconditionally, which flipped `isConfigured` to true and let
 * the user into an app with no backend at all. A misconfigured deploy is a
 * configuration error, not something a visitor can resolve, so this screen now
 * just reports the fault accurately and offers no way past it.
 */

interface SetupProps {
  /** Retained for App.tsx's call signature; intentionally unused. */
  onComplete?: () => void;
}

const Setup: React.FC<SetupProps> = () => {
  // Read at render rather than module scope: the values are fixed at build time
  // in a real deploy, but evaluating here keeps the component testable.
  const vars = [
    { name: 'VITE_SUPABASE_URL', present: Boolean(import.meta.env.VITE_SUPABASE_URL) },
    { name: 'VITE_SUPABASE_ANON_KEY', present: Boolean(import.meta.env.VITE_SUPABASE_ANON_KEY) },
  ];

  return (
  <div className="min-h-screen flex items-center justify-center p-6 bg-slate-950 relative overflow-hidden">
    <div className="absolute top-[-10%] left-[-10%] w-1/2 h-1/2 bg-primary-light blur-[120px] rounded-full opacity-20" />

    <div className="w-full max-w-lg relative z-10">
      <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
        <div className="bg-slate-900 p-10 text-white text-center">
          <div className="inline-flex items-center justify-center p-4 bg-white/10 rounded-3xl mb-6">
            <Database size={40} />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight mb-2">Backend not configured</h1>
          <p className="text-white/70 text-sm">
            {APP_NAME} cannot reach its database because required build-time
            configuration is missing.
          </p>
        </div>

        <div className="p-8 space-y-5">
          <ul className="space-y-2">
            {vars.map((v) => (
              <li
                key={v.name}
                className="flex items-center gap-3 px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl"
              >
                <AlertCircle
                  size={16}
                  className={v.present ? 'text-emerald-500' : 'text-rose-500'}
                />
                <code className="text-xs font-semibold text-slate-700">{v.name}</code>
                <span
                  className={`ml-auto text-[10px] font-semibold uppercase tracking-widest ${
                    v.present ? 'text-emerald-600' : 'text-rose-600'
                  }`}
                >
                  {v.present ? 'set' : 'missing'}
                </span>
              </li>
            ))}
          </ul>

          <p className="text-xs text-slate-500 leading-relaxed">
            These are read at build time, so setting them requires a rebuild and
            redeploy — not a page refresh. If you are an administrator, add them
            to the deployment environment. If you are not, please contact your
            administrator.
          </p>
        </div>
      </div>
      </div>
    </div>
  );
};

export default Setup;
