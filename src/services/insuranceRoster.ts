import {
  compareEmployeesByLastName,
  employeeDisplayName,
  employeeWorkEmail,
  isInHouseFteEmployee,
  type EmployeeLike,
} from './employeeUtils';

export const INSURANCE_ROSTER_HEADERS = [
  'Employee ID', 'Employee Name', 'Department', 'Position', 'Hire Date',
  'Employment Status', 'Pay Type', 'Standard Weekly Hours', 'Work Email',
];

export function buildInsuranceRosterRows(employees: EmployeeLike[]): string[][] {
  return employees
    .filter((employee) => {
      const status = String(employee.status || employee.displayStatus || '').trim().toUpperCase();
      const weeklyHours = Number(employee.standard_hours ?? employee.standardHours ?? 0);
      const belowFullTimeHours = Number.isFinite(weeklyHours) && weeklyHours > 0 && weeklyHours < 30;
      return status !== 'TERMINATED' && !belowFullTimeHours && isInHouseFteEmployee(employee);
    })
    .sort(compareEmployeesByLastName)
    .map((employee) => [
      String(employee.employee_id || employee.displayId || employee.id || employee.dbId || '').trim(),
      employeeDisplayName(employee),
      String(employee.department || employee.dept || '').trim(),
      String(employee.position || '').trim(),
      String(employee.hire_date || employee.hireDate || '').slice(0, 10),
      String(employee.status || employee.displayStatus || 'Active').trim(),
      String(employee.pay_type || employee.payType || '').trim(),
      String(employee.standard_hours || employee.standardHours || '').trim(),
      employeeWorkEmail(employee),
    ]);
}
