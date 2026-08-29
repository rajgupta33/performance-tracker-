import { describe, expect, it } from 'vitest';
import { parseEmployeeCodesCsv, resolveEmployeeCodes } from './bulk-target-csv';

describe('bulk target CSV selection', () => {
  it('parses and deduplicates employee codes', () => {
    expect(parseEmployeeCodesCsv('\uFEFFemployee_id,name\nEMP-1,Asha\nemp-1,Asha\nEMP-2,Ravi')).toEqual(['emp-1', 'EMP-2']);
  });

  it('requires an employee code column', () => {
    expect(() => parseEmployeeCodesCsv('name,email\nAsha,a@example.test')).toThrow('employee_id or employee_code');
  });

  it('resolves known codes without silently dropping unknown codes', () => {
    expect(resolveEmployeeCodes(['EMP-1', 'MISSING'], [{ id: 'uuid-1', name: 'Asha', employeeId: 'emp-1' }])).toEqual({
      employeeIds: ['uuid-1'], unknownCodes: ['MISSING'],
    });
  });
});
