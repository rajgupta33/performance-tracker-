import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../context/ToastContext';
import type { AttendanceCorrectionRequest } from '../../types';
import AttendanceCorrectionPanel from './AttendanceCorrectionPanel';

const pendingRequest: AttendanceCorrectionRequest = {
  id: 'request-1',
  attendanceId: 'attendance-1',
  employeeId: 'employee-1',
  employeeName: 'Asha Singh',
  workDate: '2026-08-29',
  requestType: 'CHECK_OUT',
  originalCheckIn: '09:00',
  proposedCheckOut: '18:15',
  reason: 'Forgot to check out after completing the customer visit.',
  status: 'PENDING',
  created: '2026-08-30T10:00:00.000Z',
};

const renderPanel = (isAuditMode: boolean, requests = [pendingRequest], onReview = vi.fn()) => render(
  <ToastProvider>
    <AttendanceCorrectionPanel
      requests={requests}
      attendance={[]}
      isAuditMode={isAuditMode}
      currentWorkDate="2026-08-30"
      onSubmit={vi.fn()}
      onReview={onReview}
    />
  </ToastProvider>,
);

describe('AttendanceCorrectionPanel', () => {
  it('shows employees their request history and a correction action', () => {
    renderPanel(false);
    expect(screen.getByRole('button', { name: /request correction/i })).toBeInTheDocument();
    expect(screen.getByText('Forgot to check out after completing the customer visit.')).toBeInTheDocument();
    expect(screen.getByText('PENDING')).toBeInTheDocument();
  });

  it('lets an authorized reviewer approve a pending request with a note', async () => {
    const onReview = vi.fn().mockResolvedValue(undefined);
    renderPanel(true, [pendingRequest], onReview);

    fireEvent.click(screen.getByRole('button', { name: /review request/i }));
    fireEvent.change(screen.getByPlaceholderText('Required review note'), {
      target: { value: 'Verified against the shift record.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /approve/i }));

    await waitFor(() => expect(onReview).toHaveBeenCalledWith(
      'request-1',
      'APPROVED',
      'Verified against the shift record.',
    ));
  });
});
