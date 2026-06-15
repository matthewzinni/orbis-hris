import {
  employeeMatchesSupervisorAccess,
  isAdminUser,
  isSupervisorUser,
} from './access';
import {
  daysUntilDate,
  employeeDisplayName,
  formatDueDateLabel,
  isActiveDashboardEmployee,
  parseDueDate,
  type EmployeeLike,
} from './employeeUtils';
import { getActiveEmployees, getEmployees, loadEmployees } from '../modules/employees';
import { supabaseClient } from './supabaseClient';

export type PerformanceReviewDueKind = '90_day' | 'annual';

export type PerformanceReviewRecord = {
  employee_id?: string;
  review_date?: string | null;
  review_type?: string | null;
};

export type PerformanceReviewDueCandidate = {
  employeeId: string;
  employeeName: string;
  department: string;
  supervisor: string;
  reviewTypeLabel: '90-Day Review' | 'Annual Review';
  periodKind: PerformanceReviewDueKind;
  dueDate: string;
  severity: 'overdue' | 'due_soon';
  daysUntilDue: number;
};

export const PERFORMANCE_REVIEW_DUE_SOON_DAYS = 7;

const NINETY_DAY_REVIEW_GRACE_DAYS = 120;
const ANNUAL_REVIEW_GRACE_DAYS = 90;

function drawerEmployeeId(employee: EmployeeLike): string {
  return String(employee.id || employee.dbId || employee.employee_id || '').trim();
}

function readHireDate(employee: EmployeeLike): Date | null {
  return parseDueDate(employee.hire_date || employee.hireDate);
}

function isoDate(date: Date): string {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy.toISOString().slice(0, 10);
}

function addCalendarDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addCalendarYears(hireDate: Date, years: number): Date {
  const copy = new Date(hireDate);
  copy.setHours(0, 0, 0, 0);
  const targetYear = hireDate.getFullYear() + years;
  const month = hireDate.getMonth();
  const day = hireDate.getDate();
  copy.setFullYear(targetYear, month, day);
  if (copy.getMonth() !== month) {
    copy.setDate(0);
  }
  return copy;
}

export function normalizePerformanceReviewType(
  reviewType: unknown
): PerformanceReviewDueKind | 'other' {
  const normalized = String(reviewType || '')
    .trim()
    .toLowerCase()
    .replace(/review/g, '')
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return 'other';

  if (
    normalized === '90 day' ||
    normalized === '90-day' ||
    normalized === '90day' ||
    normalized.startsWith('90 day')
  ) {
    return '90_day';
  }

  if (normalized === 'annual' || normalized.startsWith('annual')) {
    return 'annual';
  }

  return 'other';
}

function employeeIdKeys(employee: EmployeeLike): string[] {
  return [employee.id, employee.dbId, employee.employee_id, employee.displayId]
    .filter(Boolean)
    .map((value) => String(value).trim())
    .filter(Boolean);
}

function indexReviewsByEmployeeId(
  reviews: PerformanceReviewRecord[]
): Map<string, PerformanceReviewRecord[]> {
  const map = new Map<string, PerformanceReviewRecord[]>();

  reviews.forEach((review) => {
    const key = String(review.employee_id || '').trim();
    if (!key) return;
    const bucket = map.get(key) || [];
    bucket.push(review);
    map.set(key, bucket);
  });

  return map;
}

function reviewsForEmployee(
  employee: EmployeeLike,
  reviewIndex: Map<string, PerformanceReviewRecord[]>
): PerformanceReviewRecord[] {
  const merged = new Map<string, PerformanceReviewRecord>();

  employeeIdKeys(employee).forEach((key) => {
    (reviewIndex.get(key) || []).forEach((review) => {
      const id = String(review.review_date || '') + String(review.review_type || '');
      merged.set(id, review);
    });
  });

  return Array.from(merged.values());
}

function is90DayReviewComplete(
  reviews: PerformanceReviewRecord[],
  hireDate: Date
): boolean {
  const graceEnd = addCalendarDays(hireDate, NINETY_DAY_REVIEW_GRACE_DAYS);

  return reviews.some((review) => {
    if (normalizePerformanceReviewType(review.review_type) !== '90_day') return false;
    const reviewDate = parseDueDate(review.review_date);
    if (!reviewDate) return false;
    return reviewDate >= hireDate && reviewDate <= graceEnd;
  });
}

function isAnnualPeriodComplete(
  reviews: PerformanceReviewRecord[],
  periodStart: Date,
  periodEnd: Date
): boolean {
  const graceEnd = addCalendarDays(periodEnd, ANNUAL_REVIEW_GRACE_DAYS);

  return reviews.some((review) => {
    if (normalizePerformanceReviewType(review.review_type) !== 'annual') return false;
    const reviewDate = parseDueDate(review.review_date);
    if (!reviewDate) return false;
    return reviewDate >= periodStart && reviewDate <= graceEnd;
  });
}

function severityForDueDate(dueDate: Date): 'overdue' | 'due_soon' | null {
  const days = daysUntilDate(isoDate(dueDate));
  if (days === null) return null;
  if (days < 0) return 'overdue';
  if (days <= PERFORMANCE_REVIEW_DUE_SOON_DAYS) return 'due_soon';
  return null;
}

function build90DayDueCandidate(
  employee: EmployeeLike,
  hireDate: Date,
  reviews: PerformanceReviewRecord[]
): PerformanceReviewDueCandidate | null {
  if (is90DayReviewComplete(reviews, hireDate)) return null;

  const dueDate = addCalendarDays(hireDate, 90);
  const severity = severityForDueDate(dueDate);
  if (!severity) return null;

  const daysUntilDue = daysUntilDate(isoDate(dueDate));
  if (daysUntilDue === null) return null;

  const employeeId = drawerEmployeeId(employee);
  if (!employeeId) return null;

  return {
    employeeId,
    employeeName: employeeDisplayName(employee),
    department: String(employee.department || employee.dept || '—').trim() || '—',
    supervisor: String(employee.supervisor || employee.displaySupervisor || '—').trim() || '—',
    reviewTypeLabel: '90-Day Review',
    periodKind: '90_day',
    dueDate: isoDate(dueDate),
    severity,
    daysUntilDue,
  };
}

function buildAnnualDueCandidate(
  employee: EmployeeLike,
  hireDate: Date,
  reviews: PerformanceReviewRecord[],
  today: Date
): PerformanceReviewDueCandidate | null {
  let latestIncomplete: { dueDate: Date; yearNumber: number } | null = null;

  for (let yearNumber = 1; ; yearNumber += 1) {
    const anniversary = addCalendarYears(hireDate, yearNumber);
    if (anniversary > today) break;

    const previousBoundary =
      yearNumber === 1 ? addCalendarDays(hireDate, 90) : addCalendarYears(hireDate, yearNumber - 1);
    const periodStart = addCalendarDays(previousBoundary, 1);
    const periodEnd = anniversary;

    if (isAnnualPeriodComplete(reviews, periodStart, periodEnd)) {
      continue;
    }

    latestIncomplete = { dueDate: anniversary, yearNumber };
  }

  if (!latestIncomplete) return null;

  const severity = severityForDueDate(latestIncomplete.dueDate);
  if (!severity) return null;

  const daysUntilDue = daysUntilDate(isoDate(latestIncomplete.dueDate));
  if (daysUntilDue === null) return null;

  const employeeId = drawerEmployeeId(employee);
  if (!employeeId) return null;

  return {
    employeeId,
    employeeName: employeeDisplayName(employee),
    department: String(employee.department || employee.dept || '—').trim() || '—',
    supervisor: String(employee.supervisor || employee.displaySupervisor || '—').trim() || '—',
    reviewTypeLabel: 'Annual Review',
    periodKind: 'annual',
    dueDate: isoDate(latestIncomplete.dueDate),
    severity,
    daysUntilDue,
  };
}

export function computePerformanceReviewDueCandidates(
  employees: EmployeeLike[],
  reviews: PerformanceReviewRecord[],
  today = new Date()
): PerformanceReviewDueCandidate[] {
  const reviewIndex = indexReviewsByEmployeeId(reviews);
  const normalizedToday = new Date(today);
  normalizedToday.setHours(0, 0, 0, 0);

  const items: PerformanceReviewDueCandidate[] = [];

  employees.forEach((employee) => {
    const hireDate = readHireDate(employee);
    if (!hireDate) return;

    const employeeReviews = reviewsForEmployee(employee, reviewIndex);

    const ninetyDay = build90DayDueCandidate(employee, hireDate, employeeReviews);
    if (ninetyDay) items.push(ninetyDay);

    const annual = buildAnnualDueCandidate(employee, hireDate, employeeReviews, normalizedToday);
    if (annual) items.push(annual);
  });

  items.sort((left, right) => {
    const severityRank = { overdue: 0, due_soon: 1 };
    const rank = severityRank[left.severity] - severityRank[right.severity];
    if (rank !== 0) return rank;

    const dueDiff = left.dueDate.localeCompare(right.dueDate);
    if (dueDiff !== 0) return dueDiff;

    return left.employeeName.localeCompare(right.employeeName, undefined, { sensitivity: 'base' });
  });

  return items;
}

export function getPerformanceReviewScopedEmployees(
  employees: EmployeeLike[] = getActiveEmployees() as EmployeeLike[]
): EmployeeLike[] {
  if (!isAdminUser() && !isSupervisorUser()) return [];

  return employees.filter((employee) => {
    if (!isActiveDashboardEmployee(employee)) return false;
    if (isAdminUser()) return true;
    return employeeMatchesSupervisorAccess(employee);
  });
}

export function formatPerformanceReviewDueDetail(candidate: PerformanceReviewDueCandidate): string {
  const dueLabel = formatDueDateLabel(parseDueDate(candidate.dueDate), candidate.dueDate);
  const timing =
    candidate.severity === 'overdue'
      ? `${Math.abs(candidate.daysUntilDue)} day${Math.abs(candidate.daysUntilDue) === 1 ? '' : 's'} overdue`
      : `Due in ${candidate.daysUntilDue} day${candidate.daysUntilDue === 1 ? '' : 's'}`;

  return `${candidate.department} · Supervisor: ${candidate.supervisor} · ${candidate.reviewTypeLabel} · Due ${dueLabel} (${timing})`;
}

export async function loadPerformanceReviewRecords(
  employees: EmployeeLike[]
): Promise<PerformanceReviewRecord[]> {
  const idSet = new Set<string>();
  employees.forEach((employee) => {
    employeeIdKeys(employee).forEach((key) => idSet.add(key));
  });

  const employeeIds = Array.from(idSet);
  if (!employeeIds.length) return [];

  const chunkSize = 100;
  const rows: PerformanceReviewRecord[] = [];

  for (let index = 0; index < employeeIds.length; index += chunkSize) {
    const chunk = employeeIds.slice(index, index + chunkSize);
    const { data, error } = await supabaseClient
      .from('employee_reviews')
      .select('employee_id, review_date, review_type')
      .in('employee_id', chunk);

    if (error) {
      console.warn('[PerformanceReviewDue] Could not load reviews:', error.message || error);
      continue;
    }

    rows.push(...((data || []) as PerformanceReviewRecord[]));
  }

  return rows;
}

export async function buildPerformanceReviewDueCandidates(): Promise<PerformanceReviewDueCandidate[]> {
  if (!isAdminUser() && !isSupervisorUser()) return [];

  if (!getEmployees().length) {
    try {
      await loadEmployees();
    } catch (err) {
      console.warn('[PerformanceReviewDue] Could not load employees:', err);
    }
  }

  const scopedEmployees = getPerformanceReviewScopedEmployees(
    getActiveEmployees() as EmployeeLike[]
  );
  if (!scopedEmployees.length) return [];

  const reviews = await loadPerformanceReviewRecords(scopedEmployees);
  return computePerformanceReviewDueCandidates(scopedEmployees, reviews);
}
