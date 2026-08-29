
import React from 'react';
import { AlertCircle, RefreshCw, Fingerprint } from 'lucide-react';
import { Attendance } from '../../types';

interface Props {
  dutyType: 'OFFICE' | 'FACTORY';
  dutyLabel?: string;
  remarks: string;
  setRemarks: (val: string) => void;
  onDutyTypeChange: (value: 'OFFICE' | 'FACTORY') => void;
  onSubmit: () => void;
  status: 'idle' | 'loading' | 'success' | 'queued';
  isDisabled: boolean;
  activeRecord?: Attendance;
}

export const AttendanceActions: React.FC<Props> = ({
  dutyType, dutyLabel, remarks, setRemarks, onDutyTypeChange, onSubmit, status, isDisabled, activeRecord
}) => {
  const displayLabel = dutyLabel || (dutyType === 'FACTORY' ? 'Factory' : 'Office');

  return (
    <div className="px-8 pt-4 pb-12 flex flex-col items-center gap-4">
      <div className="w-full max-w-[320px] space-y-2">
        {!activeRecord && (
          <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1" aria-label="Attendance duty type">
            {(['OFFICE', 'FACTORY'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => onDutyTypeChange(value)}
                aria-pressed={dutyType === value}
                className={`rounded-xl px-3 py-2 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                  dutyType === value ? 'bg-white text-primary shadow-sm' : 'text-slate-500'
                }`}
              >
                {value === 'OFFICE' ? 'Office' : 'Field / Factory'}
              </button>
            ))}
          </div>
        )}
        <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest px-2 flex items-center gap-1.5">
          {dutyType === 'FACTORY' && <AlertCircle size={10} className="text-emerald-500" />}
          {displayLabel} {dutyType === 'FACTORY' && "(Mandatory)"}
        </p>
        <input
          type="text"
          placeholder={dutyType === 'FACTORY' ? `${displayLabel} Name & Details...` : "Optional remarks..."}
          className={`w-full px-6 py-3.5 bg-white border rounded-2xl text-slate-700 text-xs font-bold placeholder:text-slate-300 outline-none shadow-sm transition-all ${dutyType === 'FACTORY' && !remarks ? 'border-emerald-200 bg-emerald-50/10' : 'border-slate-100'}`}
          value={remarks}
          onChange={e => setRemarks(e.target.value)}
        />
      </div>

      <div className="w-full max-w-[320px]">
        <button 
          onClick={onSubmit}
          disabled={isDisabled}
          className={`w-full py-4 rounded-2xl font-semibold uppercase tracking-[0.1em] text-[20px] shadow-xl shadow-primary-light transition-all active:scale-95 flex items-center justify-center gap-3 text-white disabled:opacity-20 bg-primary hover:bg-primary-hover`}
        >
          {status === 'loading' ? (
            <RefreshCw className="animate-spin" size={18}/> 
          ) : status === 'queued' ? (
            'Saved for Sync'
          ) : (
            <>
              <Fingerprint size={18} /> 
              {activeRecord ? 'Check Out' : 'Check In'}
            </>
          )}
        </button>
      </div>
    </div>
  );
};
