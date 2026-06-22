type PayTypeEmployee = {
  pay_type?: string;
  payType?: string;
};

export type AttendanceRollCallSection = 'hourly' | 'salary' | 'contract';

export const ATTENDANCE_ROLL_CALL_SECTIONS: ReadonlyArray<{
  id: AttendanceRollCallSection;
  label: string;
}> = [
  { id: 'hourly', label: 'Hourly' },
  { id: 'salary', label: 'Salary' },
  { id: 'contract', label: 'Contract' },
];

export function getEmployeePayTypeLabel(employee: PayTypeEmployee | null | undefined): string {
  return String(employee?.pay_type || employee?.payType || '')
    .trim()
    .toLowerCase();
}

/** Roll call grouping: Hourly, Salary, then Contract (uses employee pay type). */
export function getAttendanceRollCallSection(
  employee: PayTypeEmployee | null | undefined
): AttendanceRollCallSection {
  const payType = getEmployeePayTypeLabel(employee);
  if (payType.includes('contract')) return 'contract';
  if (payType.includes('salary')) return 'salary';
  return 'hourly';
}

export function isContractEmployee(employee: PayTypeEmployee | null | undefined): boolean {
  return getEmployeePayTypeLabel(employee).includes('contract');
}
