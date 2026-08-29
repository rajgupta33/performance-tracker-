
import React, { useState, useEffect, useRef } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';

// Hooks
import { useCamera } from '../hooks/attendance/useCamera';
import { useGeoLocation } from '../hooks/attendance/useGeoLocation';
import { useAttendance } from '../hooks/attendance/useAttendance';
import { useSubscription } from '../context/SubscriptionContext';
import { useToast } from '../context/ToastContext';

// UI Components
import { AttendanceHeader } from '../components/attendance/AttendanceHeader';
import { CameraFeed } from '../components/attendance/CameraFeed';
import { LocationDisplay } from '../components/attendance/LocationDisplay';
import { AttendanceActions } from '../components/attendance/AttendanceActions';
import { isAttendanceLocationFresh } from '../utils/attendanceLocation';

interface AttendanceProps {
  user: any;
  autoStart?: 'OFFICE' | 'FACTORY' | 'FINISH';
  onFinish?: () => void;
}

const Attendance: React.FC<AttendanceProps> = ({ user, autoStart, onFinish }) => {
  const { showToast } = useToast();

  // 1. Logic Hooks
  const {
    currentTime, activeRecord, appConfig, isLoading, isRefreshing, loadError, hasPendingCheckIn, hasPendingCheckOut, status, submitPunch, retryLoad
  } = useAttendance(user, onFinish);

  const {
    videoRef, stream, error: cameraError, facingMode, isTorchOn,
    startCamera, stopCamera, toggleCamera, toggleTorch, takeSelfie,
    takePhoto, loading: cameraLoading
  } = useCamera();

  const {
    location, isLocating, error: locationError, detectLocation
  } = useGeoLocation();

  // Subscription check for write access
  const { canPerformAction, subscription } = useSubscription();
  const canPunch = canPerformAction('write');

  // 2. Local UI State
  const [remarks, setRemarks] = useState('');
  const [dutyType, setDutyType] = useState<'OFFICE' | 'FACTORY'>('OFFICE');
  const [isMobile, setIsMobile] = useState(false);
  const [fallbackPhoto, setFallbackPhoto] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cameraInitialized = useRef(false);

  // 3. Initialize hardware once when data is ready
  useEffect(() => {
    setIsMobile(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent));
  }, []);

  useEffect(() => {
    if (isLoading || cameraInitialized.current) return;
    cameraInitialized.current = true;

    detectLocation(true);
    startCamera('user');
  }, [isLoading]);

  // Update duty type when autoStart or activeRecord changes (no camera restart)
  useEffect(() => {
    if (autoStart === 'FACTORY') setDutyType('FACTORY');
    else if (activeRecord?.dutyType) setDutyType(activeRecord.dutyType);
  }, [autoStart, activeRecord?.dutyType]);

  // 4. Handlers
  const handleTakePhoto = async () => {
    const photo = await takePhoto();
    if (photo) setFallbackPhoto(photo);
  };

  const handlePunchSubmit = async () => {
    if (!canPunch) {
      if (subscription?.status === 'EXPIRED') {
        showToast('Your trial has expired. Please upgrade to continue punching attendance.', 'warning');
      } else if (subscription?.status === 'SUSPENDED') {
        showToast('Your account is suspended. Please contact support.', 'error');
      }
      return;
    }

    if (dutyType === 'FACTORY' && !remarks.trim()) {
      showToast("Mandatory: Please mention the Factory Name and details in remarks.", 'warning');
      return;
    }

    if (status !== 'idle' || !location || loadError || isRefreshing) return;

    let selfieData: string | null = null;

    // Try live stream first, then fallback photo
    if (stream && canvasRef.current) {
      selfieData = takeSelfie(canvasRef.current);
    } else if (fallbackPhoto) {
      selfieData = fallbackPhoto;
    } else {
      // No photo at all — try taking one now
      selfieData = await takePhoto();
      if (selfieData) setFallbackPhoto(selfieData);
    }

    if (!selfieData) return;

    await submitPunch(dutyType, remarks, location, selfieData);
  };

  const handleBack = () => {
    stopCamera();
    if (onFinish) onFinish();
  };

  const hasPhoto = !!stream || !!fallbackPhoto;
  const maxGpsAccuracyM = appConfig?.attendanceMaxGpsAccuracyM ?? 250;
  const hasAccurateLocation = !!location && location.accuracyM <= maxGpsAccuracyM;
  const hasFreshLocation = isAttendanceLocationFresh(location, currentTime);
  const staleLocationError = location && !hasFreshLocation
    ? 'Location is more than 5 minutes old. Retry GPS before punching.'
    : null;

  if (isLoading) return <div className="h-screen flex items-center justify-center bg-white"><Loader2 className="animate-spin text-blue-600" size={48} /></div>;

  return (
    <div className="fixed inset-0 bg-[#fcfdfe] z-[9999] flex flex-col animate-in slide-in-from-bottom-6 duration-500 overflow-hidden">

      <AttendanceHeader
        currentTime={currentTime}
        onBack={handleBack}
      />

      <div className="flex-1 flex flex-col items-center justify-center px-6 min-h-0">
        <CameraFeed
          videoRef={videoRef}
          stream={stream}
          error={cameraError}
          facingMode={facingMode}
          isMobile={isMobile}
          isTorchOn={isTorchOn}
          toggleTorch={toggleTorch}
          toggleCamera={toggleCamera}
          showSuccess={status === 'success'}
          fallbackPhoto={fallbackPhoto}
          onTakePhoto={handleTakePhoto}
          photoLoading={cameraLoading}
        >
          <LocationDisplay
            location={location}
            isLocating={isLocating}
            error={locationError || staleLocationError}
            onRetry={() => detectLocation(true)}
            maxAccuracyM={maxGpsAccuracyM}
          />
        </CameraFeed>
      </div>

      {/* Subscription Warning Banner */}
      {!canPunch && (
        <div className="px-4 py-3 bg-red-50 border-t border-red-200 flex items-center gap-2 text-red-700">
          <AlertTriangle className="w-5 h-5" />
          <span className="text-sm font-medium">
            {subscription?.status === 'EXPIRED'
              ? 'Your trial has expired. Attendance punching is disabled.'
              : 'Your account is suspended. Please contact support.'}
          </span>
        </div>
      )}

      {loadError && (
        <div className="px-4 py-3 bg-amber-50 border-t border-amber-200 flex items-center gap-3 text-amber-800">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span className="text-xs font-medium flex-1">{loadError}</span>
          <button
            type="button"
            onClick={() => retryLoad().catch(() => undefined)}
            disabled={isRefreshing}
            className="rounded-lg bg-amber-100 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider disabled:opacity-50"
          >
            {isRefreshing ? 'Retrying…' : 'Retry'}
          </button>
        </div>
      )}

      {hasPendingCheckIn && (
        <div className="px-4 py-3 bg-blue-50 border-t border-blue-200 flex items-center gap-3 text-blue-800">
          <Loader2 className="w-5 h-5 shrink-0 animate-spin" />
          <span className="text-xs font-medium">A check-in is waiting to sync. Do not punch again; reconnect and reopen attendance.</span>
        </div>
      )}

      {hasPendingCheckOut && (
        <div className="px-4 py-3 bg-blue-50 border-t border-blue-200 flex items-center gap-3 text-blue-800">
          <Loader2 className="w-5 h-5 shrink-0 animate-spin" />
          <span className="text-xs font-medium">Your check-out is waiting to sync. The session will close automatically when connectivity returns.</span>
        </div>
      )}

      <AttendanceActions
        dutyType={dutyType}
        dutyLabel={dutyType === 'FACTORY' ? (appConfig?.dutyLabel2 || 'Factory') : (appConfig?.dutyLabel1 || 'Office')}
        remarks={remarks}
        setRemarks={setRemarks}
        onDutyTypeChange={setDutyType}
        onSubmit={handlePunchSubmit}
        status={status}
        activeRecord={activeRecord}
        isDisabled={!canPunch || hasPendingCheckIn || hasPendingCheckOut || isRefreshing || !!loadError || !hasAccurateLocation || !hasFreshLocation || isLocating || status !== 'idle' || !hasPhoto || (dutyType === 'FACTORY' && !remarks.trim())}
      />

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default Attendance;
