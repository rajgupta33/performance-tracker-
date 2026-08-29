import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AttendanceActions } from './AttendanceActions';

const baseProps = {
  dutyType: 'OFFICE' as const,
  remarks: '',
  setRemarks: vi.fn(),
  onDutyTypeChange: vi.fn(),
  onSubmit: vi.fn(),
  status: 'idle' as const,
  isDisabled: false,
};

describe('AttendanceActions', () => {
  it('lets an employee select field duty before check-in', () => {
    const onDutyTypeChange = vi.fn();
    render(<AttendanceActions {...baseProps} onDutyTypeChange={onDutyTypeChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Field / Factory' }));

    expect(onDutyTypeChange).toHaveBeenCalledWith('FACTORY');
  });

  it('locks the duty type once a session is active', () => {
    render(
      <AttendanceActions
        {...baseProps}
        activeRecord={{
          id: 'attendance-1',
          employeeId: 'employee-1',
          date: '2026-08-30',
          status: 'PRESENT',
          dutyType: 'OFFICE',
        }}
      />,
    );

    expect(screen.queryByLabelText('Attendance duty type')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /check out/i })).toBeInTheDocument();
  });

  it('labels a safely queued offline punch without implying server verification', () => {
    render(<AttendanceActions {...baseProps} status="queued" isDisabled />);

    expect(screen.getByRole('button', { name: /saved for sync/i })).toBeDisabled();
  });
});
