import React, { useMemo, useState } from 'react';
import { CheckCircle2, Clock3, FilePenLine, ShieldCheck, X, XCircle } from 'lucide-react';
import type { Attendance, AttendanceCorrectionRequest } from '../../types';
import { validateAttendanceCorrection } from '../../services/attendance/correctionPayload';
import { useToast } from '../../context/ToastContext';

interface AttendanceCorrectionPanelProps {
  requests: AttendanceCorrectionRequest[];
  attendance: Attendance[];
  isAuditMode: boolean;
  currentWorkDate: string;
  onSubmit: (input: {
    attendanceId?: string;
    workDate: string;
    proposedCheckIn?: string;
    proposedCheckOut?: string;
    reason: string;
    hasExistingAttendance: boolean;
    currentWorkDate?: string;
  }) => Promise<void>;
  onReview: (requestId: string, decision: 'APPROVED' | 'REJECTED', note: string) => Promise<void>;
}

const earliestYmd = (currentWorkDate: string) => {
  const date = new Date(`${currentWorkDate}T12:00:00`);
  date.setDate(date.getDate() - 90);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
};

const statusClass: Record<AttendanceCorrectionRequest['status'], string> = {
  PENDING: 'bg-amber-100 text-amber-700',
  APPROVED: 'bg-emerald-100 text-emerald-700',
  REJECTED: 'bg-rose-100 text-rose-700',
};

const AttendanceCorrectionPanel: React.FC<AttendanceCorrectionPanelProps> = ({
  requests,
  attendance,
  isAuditMode,
  currentWorkDate,
  onSubmit,
  onReview,
}) => {
  const { showToast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [reviewing, setReviewing] = useState<AttendanceCorrectionRequest | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [form, setForm] = useState({
    workDate: currentWorkDate,
    proposedCheckIn: '',
    proposedCheckOut: '',
    reason: '',
  });

  const sortedRequests = useMemo(() => [...requests].sort((a, b) => {
    if (a.status === 'PENDING' && b.status !== 'PENDING') return -1;
    if (a.status !== 'PENDING' && b.status === 'PENDING') return 1;
    return b.created.localeCompare(a.created);
  }), [requests]);
  const visibleRequests = isAuditMode
    ? sortedRequests.filter((request, index) => request.status === 'PENDING' || index < 8)
    : sortedRequests.slice(0, 8);
  const matchingAttendance = attendance.find((record) => record.date === form.workDate);

  const submit = async () => {
    const input = {
      attendanceId: matchingAttendance?.id,
      workDate: form.workDate,
      proposedCheckIn: form.proposedCheckIn || undefined,
      proposedCheckOut: form.proposedCheckOut || undefined,
      reason: form.reason,
      hasExistingAttendance: Boolean(matchingAttendance),
      currentWorkDate,
    };
    const error = validateAttendanceCorrection(input);
    if (error) {
      showToast(error, 'error');
      return;
    }
    setIsSaving(true);
    try {
      await onSubmit(input);
      setShowForm(false);
      setForm({ workDate: currentWorkDate, proposedCheckIn: '', proposedCheckOut: '', reason: '' });
      showToast('Attendance correction sent for review.', 'success');
    } catch (submissionError: any) {
      showToast(submissionError?.message || 'Could not submit attendance correction.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const review = async (decision: 'APPROVED' | 'REJECTED') => {
    if (!reviewing) return;
    if (reviewNote.trim().length < 5) {
      showToast('Add a review note of at least 5 characters.', 'error');
      return;
    }
    setIsSaving(true);
    try {
      await onReview(reviewing.id, decision, reviewNote);
      setReviewing(null);
      setReviewNote('');
      showToast(decision === 'APPROVED' ? 'Attendance correction approved.' : 'Attendance correction rejected.', 'success');
    } catch (reviewError: any) {
      showToast(reviewError?.message || 'Could not review attendance correction.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold text-primary uppercase tracking-widest flex items-center gap-2">
            {isAuditMode ? <ShieldCheck size={14} /> : <FilePenLine size={14} />}
            {isAuditMode ? 'Correction review queue' : 'Missed-punch corrections'}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {isAuditMode
              ? `${requests.filter((request) => request.status === 'PENDING').length} request(s) awaiting a decision.`
              : 'Request a correction without changing the attendance record directly.'}
          </p>
        </div>
        {!isAuditMode && (
          <button onClick={() => setShowForm(true)} className="px-4 py-3 bg-primary text-white rounded-xl text-[10px] font-semibold uppercase tracking-widest">
            Request correction
          </button>
        )}
      </div>

      {visibleRequests.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {visibleRequests.map((request) => (
            <article key={request.id} className="p-4 bg-slate-50 border border-slate-100 rounded-xl space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  {isAuditMode && <p className="text-xs font-semibold text-slate-900">{request.employeeName}</p>}
                  <p className="text-[10px] font-semibold text-slate-500 uppercase">{request.workDate} · {request.requestType.replace('_', ' ')}</p>
                </div>
                <span className={`px-2 py-1 rounded-lg text-[8px] font-semibold uppercase tracking-wider ${statusClass[request.status]}`}>{request.status}</span>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-slate-600">
                <Clock3 size={13} className="text-primary" />
                <span>{request.originalCheckIn || '--:--'}–{request.originalCheckOut || '--:--'}</span>
                <span className="text-slate-300">→</span>
                <span className="font-semibold">{request.proposedCheckIn || 'unchanged'}–{request.proposedCheckOut || 'unchanged'}</span>
              </div>
              <p className="text-xs text-slate-600">{request.reason}</p>
              {request.reviewerNote && <p className="text-[10px] text-slate-500 border-t border-slate-200 pt-2">Review: {request.reviewerNote}</p>}
              {isAuditMode && request.status === 'PENDING' && (
                <button onClick={() => setReviewing(request)} className="w-full py-2.5 bg-slate-900 text-white rounded-lg text-[9px] font-semibold uppercase tracking-widest">Review request</button>
              )}
            </article>
          ))}
        </div>
      ) : (
        <p className="text-xs text-slate-400 py-2">No correction requests yet.</p>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[120] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl overflow-hidden">
            <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
              <h3 className="text-sm font-semibold uppercase tracking-widest">Request attendance correction</h3>
              <button onClick={() => setShowForm(false)} aria-label="Close correction form"><X size={20} /></button>
            </div>
            <div className="p-7 space-y-5">
              <div>
                <label className="text-[10px] font-semibold text-slate-400 uppercase">Attendance date</label>
                <input type="date" min={earliestYmd(currentWorkDate)} max={currentWorkDate} value={form.workDate} onChange={(event) => setForm({ ...form, workDate: event.target.value })} className="w-full mt-1 px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-semibold" />
                <p className="text-[9px] text-slate-400 mt-1">
                  {matchingAttendance ? `Recorded: ${matchingAttendance.checkIn || '--:--'}–${matchingAttendance.checkOut || 'missing'}` : 'No attendance record exists; both times are required.'}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-semibold text-slate-400 uppercase">Correct check-in</label>
                  <input type="time" value={form.proposedCheckIn} onChange={(event) => setForm({ ...form, proposedCheckIn: event.target.value })} className="w-full mt-1 px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-semibold" />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-slate-400 uppercase">Correct check-out</label>
                  <input type="time" value={form.proposedCheckOut} onChange={(event) => setForm({ ...form, proposedCheckOut: event.target.value })} className="w-full mt-1 px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-semibold" />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-400 uppercase">What happened?</label>
                <textarea maxLength={1000} value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} placeholder="Explain why the recorded punches are missing or incorrect." className="w-full mt-1 p-4 bg-slate-50 border border-slate-100 rounded-xl text-sm min-h-[100px]" />
              </div>
              <button disabled={isSaving} onClick={submit} className="w-full py-4 bg-primary text-white rounded-xl text-[10px] font-semibold uppercase tracking-widest disabled:opacity-50">{isSaving ? 'Submitting…' : 'Send for review'}</button>
            </div>
          </div>
        </div>
      )}

      {reviewing && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[120] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl overflow-hidden">
            <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
              <h3 className="text-sm font-semibold uppercase tracking-widest">Review correction</h3>
              <button onClick={() => setReviewing(null)} aria-label="Close correction review"><X size={20} /></button>
            </div>
            <div className="p-7 space-y-5">
              <div className="p-4 bg-slate-50 rounded-xl text-xs text-slate-600 space-y-2">
                <p className="font-semibold text-slate-900">{reviewing.employeeName} · {reviewing.workDate}</p>
                <p>Requested: {reviewing.proposedCheckIn || 'unchanged'}–{reviewing.proposedCheckOut || 'unchanged'}</p>
                <p>{reviewing.reason}</p>
              </div>
              <textarea value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} placeholder="Required review note" className="w-full p-4 bg-slate-50 border border-slate-100 rounded-xl text-sm min-h-[90px]" />
              <div className="grid grid-cols-2 gap-3">
                <button disabled={isSaving} onClick={() => review('REJECTED')} className="py-3 bg-rose-50 text-rose-700 rounded-xl text-[9px] font-semibold uppercase tracking-widest flex items-center justify-center gap-2"><XCircle size={15} /> Reject</button>
                <button disabled={isSaving} onClick={() => review('APPROVED')} className="py-3 bg-emerald-600 text-white rounded-xl text-[9px] font-semibold uppercase tracking-widest flex items-center justify-center gap-2"><CheckCircle2 size={15} /> Approve</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default AttendanceCorrectionPanel;
