import type { EmployeeOption } from './performance.types';

const normalize = (value: string) => value.trim().replace(/^"|"$/g, '').toLowerCase();

export const parseEmployeeCodesCsv = (text: string): string[] => {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) throw new Error('CSV must contain a header and at least one employee row.');
  const headers = lines[0].split(',').map(normalize);
  const codeIndex = headers.findIndex((header) => header === 'employee_id' || header === 'employee_code');
  if (codeIndex < 0) throw new Error('CSV requires an employee_id or employee_code column.');
  const codes = lines.slice(1).map((line) => line.split(',')[codeIndex]?.trim().replace(/^"|"$/g, '') || '').filter(Boolean);
  if (codes.length === 0) throw new Error('CSV contains no employee codes.');
  return [...new Map(codes.map((code) => [code.toLowerCase(), code])).values()];
};

export const resolveEmployeeCodes = (codes: string[], employees: EmployeeOption[]) => {
  const byCode = new Map(employees.filter((employee) => employee.employeeId).map((employee) => [employee.employeeId!.trim().toLowerCase(), employee.id]));
  const employeeIds: string[] = [];
  const unknownCodes: string[] = [];
  for (const code of codes) {
    const id = byCode.get(code.trim().toLowerCase());
    if (id) employeeIds.push(id); else unknownCodes.push(code);
  }
  return { employeeIds: [...new Set(employeeIds)], unknownCodes };
};
