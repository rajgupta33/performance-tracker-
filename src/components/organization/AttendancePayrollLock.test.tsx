import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../context/ToastContext';
import { AttendancePayrollLock } from './AttendancePayrollLock';

const getLock = vi.fn();
const getEvents = vi.fn();

vi.mock('../../services/hrService', () => ({
  hrService: {
    getAttendancePayrollLock: (...args: unknown[]) => getLock(...args),
    getAttendancePayrollLockEvents: (...args: unknown[]) => getEvents(...args),
    advanceAttendancePayrollLock: vi.fn(),
  },
}));

vi.mock('../../context/SubscriptionContext', () => ({
  useSubscription: () => ({ canPerformAction: () => true }),
}));

describe('AttendancePayrollLock', () => {
  beforeEach(() => {
    getLock.mockResolvedValue({
      organizationId: 'org-1',
      lockedThrough: '2026-08-01',
      lockedBy: 'admin-1',
      note: 'July payroll finalized.',
      updated: '2026-08-02T10:00:00.000Z',
    });
    getEvents.mockResolvedValue([{
      id: 'event-1',
      organizationId: 'org-1',
      lockedThrough: '2026-08-01',
      actorId: 'admin-1',
      note: 'July payroll reviewed and exported.',
      created: '2026-08-02T10:00:00.000Z',
    }]);
  });

  it('shows the finalized boundary and immutable lock history', async () => {
    render(<ToastProvider><AttendancePayrollLock timezone="UTC" /></ToastProvider>);

    expect(screen.getByText('Attendance Payroll Lock')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/Current finalized boundary: 2026-08-01/)).toBeInTheDocument());
    expect(screen.getByText('July payroll reviewed and exported.')).toBeInTheDocument();
    expect(screen.getByText(/cannot be edited, deleted, auto-closed/i)).toBeInTheDocument();
  });
});
