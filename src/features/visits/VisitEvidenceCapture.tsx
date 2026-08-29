import React, { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, Check, Loader2, RefreshCw, SwitchCamera, X } from 'lucide-react';
import { useCamera } from '../../hooks/attendance/useCamera';

interface Props {
  value: string;
  onChange: (dataUrl: string) => void;
  disabled?: boolean;
}

export const VisitEvidenceCapture: React.FC<Props> = ({ value, onChange, disabled }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const {
    videoRef,
    stream,
    error,
    facingMode,
    loading,
    startCamera,
    stopCamera,
    toggleCamera,
    takeSelfie,
    takePhoto,
  } = useCamera();

  useEffect(() => {
    if (isOpen && !value) startCamera('environment');
    return () => { if (isOpen) stopCamera(); };
  }, [isOpen, value, startCamera, stopCamera]);

  const close = () => {
    stopCamera();
    setIsOpen(false);
  };

  const capture = async () => {
    setIsCapturing(true);
    try {
      const photo = stream && canvasRef.current
        ? takeSelfie(canvasRef.current)
        : await takePhoto('environment');
      if (photo) {
        onChange(photo);
        stopCamera();
      }
    } finally {
      setIsCapturing(false);
    }
  };

  const retake = () => {
    onChange('');
    startCamera('environment');
  };

  if (!isOpen) {
    return (
      <button type="button" disabled={disabled} onClick={() => setIsOpen(true)} className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition ${value ? 'border-emerald-200 bg-emerald-50' : 'border-dashed border-slate-300 bg-slate-50 hover:border-primary'} disabled:opacity-50`}>
        <div className={`rounded-xl p-2 ${value ? 'bg-emerald-500 text-white' : 'bg-white text-primary'}`}>{value ? <Check size={18} /> : <Camera size={18} />}</div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-slate-900">{value ? 'Live photo captured' : 'Add live visit photo'}</p>
          <p className="text-[10px] text-slate-500">Camera capture only; gallery selection is unavailable.</p>
        </div>
        {value && <img src={value} alt="Visit evidence preview" className="h-14 w-14 rounded-xl object-cover" />}
      </button>
    );
  }

  return (
    <div className="space-y-3 rounded-3xl bg-slate-950 p-3 text-white">
      <div className="flex items-center justify-between px-1">
        <div>
          <p className="text-xs font-semibold">Live visit evidence</p>
          <p className="text-[9px] text-white/50">Photograph the customer location or discussion.</p>
        </div>
        <button type="button" onClick={close} aria-label="Close camera" className="rounded-xl bg-white/10 p-2"><X size={16} /></button>
      </div>

      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-black">
        {value ? (
          <img src={value} alt="Captured visit evidence" className="h-full w-full object-cover" />
        ) : stream ? (
          <video ref={videoRef} autoPlay playsInline muted className={`h-full w-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-white/50">
            {loading ? <Loader2 className="animate-spin" size={32} /> : <CameraOff size={32} />}
            <p className="max-w-xs px-6 text-center text-xs">{error || 'Preparing camera…'}</p>
          </div>
        )}
        {!value && stream && (
          <button type="button" onClick={toggleCamera} aria-label="Switch camera" className="absolute right-3 top-3 rounded-xl bg-black/45 p-2.5 text-white backdrop-blur"><SwitchCamera size={18} /></button>
        )}
      </div>

      <canvas ref={canvasRef} className="hidden" />
      {value ? (
        <button type="button" onClick={retake} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white/10 py-3 text-xs font-semibold"><RefreshCw size={15} /> Retake photo</button>
      ) : (
        <button type="button" disabled={isCapturing || loading} onClick={capture} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white py-3 text-xs font-bold text-slate-900 disabled:opacity-50">
          {isCapturing ? <Loader2 className="animate-spin" size={16} /> : <Camera size={16} />} Capture live photo
        </button>
      )}
    </div>
  );
};
