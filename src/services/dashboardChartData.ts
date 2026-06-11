import {
  isActiveDashboardEmployee,
  isStayInterviewDueSoon,
  isStayInterviewEligibleEmployee,
  isStayInterviewOverdue,
} from './employeeUtils';

export type ChartSegment = {
  label: string;
  value: number;
  color: string;
};

export const DASHBOARD_CHART_COLORS = [
  '#38bdf8',
  '#22c55e',
  '#f59e0b',
  '#a78bfa',
  '#f472b6',
  '#2dd4bf',
  '#fb7185',
  '#60a5fa',
  '#94a3b8',
] as const;

type EmployeeRow = Record<string, unknown>;

function employeeStatus(employee: EmployeeRow): string {
  return String(employee.status || employee.displayStatus || employee.employee_status || '')
    .trim()
    .toUpperCase();
}

function isOnLeave(employee: EmployeeRow): boolean {
  const status = employeeStatus(employee);
  return status === 'LEAVE' || status === 'ON LEAVE';
}

function isTerminatedTracked(employee: EmployeeRow): boolean {
  return (
    employeeStatus(employee) === 'TERMINATED' &&
    Boolean(String(employee.termination_date || employee.terminationDate || '').trim())
  );
}

function tenureMonths(employee: EmployeeRow): number {
  const stored = Number(employee.tenureMonths || employee.tenure_months || 0);
  if (stored > 0) return stored;

  const hireDate = employee.hireDate || employee.hire_date;
  if (!hireDate) return 0;

  const hiredAt = new Date(String(hireDate));
  if (Number.isNaN(hiredAt.getTime())) return 0;

  const now = new Date();
  return Math.max(
    0,
    (now.getFullYear() - hiredAt.getFullYear()) * 12 + (now.getMonth() - hiredAt.getMonth())
  );
}

function colorAt(index: number): string {
  return DASHBOARD_CHART_COLORS[index % DASHBOARD_CHART_COLORS.length];
}

function topDepartmentSegments(counts: Map<string, number>, maxSlices = 8): ChartSegment[] {
  const entries = [...counts.entries()].sort((left, right) => right[1] - left[1]);
  if (!entries.length) return [];

  const top = entries.slice(0, maxSlices);
  const rest = entries.slice(maxSlices);
  const segments = top.map(([label, value], index) => ({
    label,
    value,
    color: colorAt(index),
  }));

  if (rest.length) {
    segments.push({
      label: 'Other',
      value: rest.reduce((sum, [, value]) => sum + value, 0),
      color: DASHBOARD_CHART_COLORS[DASHBOARD_CHART_COLORS.length - 1],
    });
  }

  return segments.filter((segment) => segment.value > 0);
}

export function buildDepartmentHeadcountSegments(employees: EmployeeRow[]): ChartSegment[] {
  const counts = new Map<string, number>();

  employees
    .filter((employee) => employeeStatus(employee) === 'ACTIVE')
    .forEach((employee) => {
      const dept =
        String(employee.department || employee.dept || 'Unassigned').trim() || 'Unassigned';
      counts.set(dept, (counts.get(dept) || 0) + 1);
    });

  return topDepartmentSegments(counts);
}

export function buildWorkforceStatusSegments(employees: EmployeeRow[]): ChartSegment[] {
  let active = 0;
  let onLeave = 0;
  let terminated = 0;
  let other = 0;

  employees.forEach((employee) => {
    if (isOnLeave(employee)) {
      onLeave += 1;
      return;
    }

    if (isTerminatedTracked(employee)) {
      terminated += 1;
      return;
    }

    if (employeeStatus(employee) === 'ACTIVE' || isActiveDashboardEmployee(employee)) {
      active += 1;
      return;
    }

    other += 1;
  });

  return [
    { label: 'Active', value: active, color: '#22c55e' },
    { label: 'On leave', value: onLeave, color: '#f59e0b' },
    { label: 'Terminated (tracked)', value: terminated, color: '#94a3b8' },
    { label: 'Other', value: other, color: '#64748b' },
  ].filter((segment) => segment.value > 0);
}

export function buildTenureSegments(employees: EmployeeRow[]): ChartSegment[] {
  const buckets = {
    '< 1 year': 0,
    '1–3 years': 0,
    '3–5 years': 0,
    '5+ years': 0,
  };

  employees
    .filter((employee) => employeeStatus(employee) === 'ACTIVE')
    .forEach((employee) => {
      const months = tenureMonths(employee);
      if (months < 12) buckets['< 1 year'] += 1;
      else if (months < 36) buckets['1–3 years'] += 1;
      else if (months < 60) buckets['3–5 years'] += 1;
      else buckets['5+ years'] += 1;
    });

  return Object.entries(buckets).map(([label, value], index) => ({
    label,
    value,
    color: colorAt(index),
  }));
}

export function buildStayInterviewSegments(employees: EmployeeRow[]): ChartSegment[] {
  let overdue = 0;
  let dueSoon = 0;
  let onTrack = 0;

  employees
    .filter((employee) => isStayInterviewEligibleEmployee(employee))
    .forEach((employee) => {
      if (isStayInterviewOverdue(employee)) {
        overdue += 1;
        return;
      }
      if (isStayInterviewDueSoon(employee)) {
        dueSoon += 1;
        return;
      }
      onTrack += 1;
    });

  return [
    { label: 'Overdue', value: overdue, color: '#ef4444' },
    { label: 'Due soon', value: dueSoon, color: '#f59e0b' },
    { label: 'On track', value: onTrack, color: '#22c55e' },
  ].filter((segment) => segment.value > 0);
}

export function buildManagerTeamStatusSegments(snapshot: {
  activeCount: number;
  onLeaveStatusCount: number;
  teamCount: number;
}): ChartSegment[] {
  const other = Math.max(0, snapshot.teamCount - snapshot.activeCount - snapshot.onLeaveStatusCount);

  return [
    { label: 'Active', value: snapshot.activeCount, color: '#22c55e' },
    { label: 'On leave', value: snapshot.onLeaveStatusCount, color: '#f59e0b' },
    { label: 'Other', value: other, color: '#94a3b8' },
  ].filter((segment) => segment.value > 0);
}

export function buildManagerStayInterviewSegments(team: EmployeeRow[]): ChartSegment[] {
  const eligible = team.filter((employee) => isStayInterviewEligibleEmployee(employee));
  let overdue = 0;
  let dueSoon = 0;
  let onTrack = 0;

  eligible.forEach((employee) => {
    if (isStayInterviewOverdue(employee)) overdue += 1;
    else if (isStayInterviewDueSoon(employee)) dueSoon += 1;
    else onTrack += 1;
  });

  return [
    { label: 'Overdue', value: overdue, color: '#ef4444' },
    { label: 'Due soon', value: dueSoon, color: '#f59e0b' },
    { label: 'On track', value: onTrack, color: '#22c55e' },
  ].filter((segment) => segment.value > 0);
}
