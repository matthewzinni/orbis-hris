import { canViewCompletedPerformanceReviewsLedger } from './access';
import {
  employeeDisplayName,
  formatDueDateLabel,
  parseDueDate,
  type EmployeeLike,
} from './employeeUtils';
import { getEmployees, loadEmployees } from '../modules/employees';
import { supabaseClient } from './supabaseClient';
import { getReviewAverageScore } from '../utils/reviewScores';
import { normalizePerformanceReviewType } from './performanceReviewDue';

export type CompletedPerformanceReviewLedgerRow = {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  supervisor: string;
  reviewType: string;
  reviewTypeLabel: string;
  reviewDate: string;
  reviewDateLabel: string;
  overallResult: string;
  averageScore: number | null;
  createdBy: string;
};

const LEDGER_SELECT = [
  'id',
  'employee_id',
  'review_date',
  'review_type',
  'overall_result',
  'quality_score',
  'attendance_score',
  'reliability_score',
  'communication_score',
  'judgement_score',
  'initiative_score',
  'teamwork_score',
  'knowledge_score',
  'training_score',
  'created_by',
  'created_at',
].join(', ');

function drawerEmployeeId(employee: EmployeeLike): string {
  return String(employee.id || employee.dbId || employee.employee_id || '').trim();
}

function employeeIdKeys(employee: EmployeeLike): string[] {
  return [employee.id, employee.dbId, employee.employee_id, employee.displayId]
    .filter(Boolean)
    .map((value) => String(value).trim())
    .filter(Boolean);
}

function buildEmployeeIndex(employees: EmployeeLike[]): Map<string, EmployeeLike> {
  const index = new Map<string, EmployeeLike>();
  employees.forEach((employee) => {
    employeeIdKeys(employee).forEach((key) => {
      if (!index.has(key)) index.set(key, employee);
    });
  });
  return index;
}

function reviewTypeLabel(reviewType: unknown): string {
  const kind = normalizePerformanceReviewType(reviewType);
  if (kind === '90_day') return '90-Day Review';
  if (kind === 'annual') return 'Annual Review';
  const raw = String(reviewType || '').trim();
  return raw || 'Review';
}

export async function loadCompletedPerformanceReviewsLedger(
  limit = 150
): Promise<CompletedPerformanceReviewLedgerRow[]> {
  if (!canViewCompletedPerformanceReviewsLedger()) return [];

  if (!getEmployees().length) {
    try {
      await loadEmployees();
    } catch (err) {
      console.warn('[CompletedReviewsLedger] Could not load employees:', err);
    }
  }

  const { data, error } = await supabaseClient
    .from('employee_reviews')
    .select(LEDGER_SELECT)
    .order('review_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(error.message || 'Could not load completed performance reviews.');
  }

  const employeeIndex = buildEmployeeIndex(getEmployees() as EmployeeLike[]);

  return ((data || []) as unknown as Record<string, unknown>[]).map((record) => {
    const employeeId = String(record.employee_id || '').trim();
    const employee = employeeIndex.get(employeeId) || null;
    const averageScore = getReviewAverageScore(record);
    const reviewDate = String(record.review_date || '').trim();

    return {
      id: String(record.id || '').trim(),
      employeeId: employeeId || drawerEmployeeId(employee || {}),
      employeeName: employee
        ? employeeDisplayName(employee)
        : employeeId || 'Unknown employee',
      department: String(employee?.department || employee?.dept || '—').trim() || '—',
      supervisor: String(employee?.supervisor || employee?.displaySupervisor || '—').trim() || '—',
      reviewType: String(record.review_type || '').trim(),
      reviewTypeLabel: reviewTypeLabel(record.review_type),
      reviewDate,
      reviewDateLabel: reviewDate
        ? formatDueDateLabel(parseDueDate(reviewDate), reviewDate) || reviewDate
        : '—',
      overallResult: String(record.overall_result || '').trim(),
      averageScore,
      createdBy: String(record.created_by || '').trim() || '—',
    } satisfies CompletedPerformanceReviewLedgerRow;
  });
}
