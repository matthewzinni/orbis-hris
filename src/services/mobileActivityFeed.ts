import {
  employeeMatchesSupervisorAccess,
  isAdminUser,
  isSupervisorUser,
  canQueryDisciplineReports,
} from './access';
import { employeeDisplayName } from './employeeUtils';
import { supabaseClient } from './supabaseClient';

export type MobileActivitySource =
  | 'note'
  | 'discipline'
  | 'meeting'
  | 'review'
  | 'leave'
  | 'stay_interview';

export type MobileActivityItem = {
  id: string;
  source: MobileActivitySource;
  category: string;
  title: string;
  detail: string;
  sortTimestamp: string;
  employeeId: string;
  employeeName: string;
  drawerTab?: string;
};

function getEmployees(): Array<Record<string, unknown>> {
  return Array.isArray((window as { EMPLOYEES?: unknown[] }).EMPLOYEES)
    ? ((window as { EMPLOYEES?: Array<Record<string, unknown>> }).EMPLOYEES as Array<
        Record<string, unknown>
      >)
    : [];
}

function resolveEmployeeName(employeeId: string): string {
  const id = String(employeeId || '').trim();
  if (!id) return 'Unknown employee';

  const match = getEmployees().find((employee) => {
    const keys = [
      employee.id,
      employee.dbId,
      employee.employee_id,
      employee.employeeId,
    ].map((value) => String(value || '').trim());
    return keys.includes(id);
  });

  if (match) return employeeDisplayName(match);
  return id;
}

function isVisibleForUser(employeeId: string): boolean {
  if (isAdminUser()) return true;
  if (!isSupervisorUser()) return false;

  const match = getEmployees().find((employee) => {
    const keys = [
      employee.id,
      employee.dbId,
      employee.employee_id,
      employee.employeeId,
    ].map((value) => String(value || '').trim());
    return keys.includes(String(employeeId || '').trim());
  });

  return match ? employeeMatchesSupervisorAccess(match) : false;
}

function sortTimestamp(row: Record<string, unknown>): string {
  return String(
    row.created_at ||
      row.updated_at ||
      row.note_date ||
      row.incident_date ||
      row.meeting_date ||
      row.review_date ||
      row.start_date ||
      ''
  );
}

function mapRow(
  row: Record<string, unknown>,
  item: Omit<MobileActivityItem, 'employeeName'> & { employeeName?: string }
): MobileActivityItem | null {
  const employeeId = String(item.employeeId || row.employee_id || '').trim();
  if (!employeeId || !isVisibleForUser(employeeId)) return null;

  return {
    ...item,
    employeeId,
    employeeName: item.employeeName || resolveEmployeeName(employeeId),
  };
}

export async function fetchMobileActivityFeed(limit = 30): Promise<MobileActivityItem[]> {
  if (!isAdminUser() && !isSupervisorUser()) {
    return [];
  }

  const perTable = Math.max(6, Math.ceil(limit / 4));
  const includeDiscipline = canQueryDisciplineReports();

  const [notesRes, disciplineRes, meetingsRes, reviewsRes, leaveRes, stayRes] =
    await Promise.all([
      supabaseClient
        .from('employee_notes')
        .select('id, employee_id, note_type, note_text, note_date, created_at')
        .order('created_at', { ascending: false })
        .limit(perTable),
      includeDiscipline
        ? supabaseClient
            .from('discipline_reports')
            .select('id, employee_id, issue_type, description, incident_date, created_at')
            .order('created_at', { ascending: false })
            .limit(perTable)
        : Promise.resolve({ data: [], error: null }),
      supabaseClient
        .from('employee_meetings')
        .select('id, employee_id, meeting_type, subject, notes, meeting_date, created_at')
        .order('created_at', { ascending: false })
        .limit(perTable),
      supabaseClient
        .from('employee_reviews')
        .select(
          'id, employee_id, review_type, overall_result, manager_comments, review_date, created_at'
        )
        .order('created_at', { ascending: false })
        .limit(perTable),
      supabaseClient
        .from('leave_requests')
        .select('id, employee_id, leave_type, status, start_date, end_date, created_at')
        .order('created_at', { ascending: false })
        .limit(perTable),
      supabaseClient
        .from('stay_interviews')
        .select('id, employee_id, interview_type, interview_date, manager_summary, created_at')
        .order('created_at', { ascending: false })
        .limit(perTable),
    ]);

  const errors = [notesRes, disciplineRes, meetingsRes, reviewsRes, leaveRes, stayRes]
    .map((result) => result.error)
    .filter(Boolean);

  if (errors.length) {
    throw new Error(errors[0]?.message || 'Could not load activity feed.');
  }

  const items: MobileActivityItem[] = [];

  for (const row of (notesRes.data || []) as Record<string, unknown>[]) {
    const mapped = mapRow(row, {
      id: String(row.id),
      source: 'note',
      category: 'Note',
      title: String(row.note_type || 'Employee note'),
      detail: String(row.note_text || '').slice(0, 240),
      sortTimestamp: sortTimestamp(row),
      employeeId: String(row.employee_id || ''),
      drawerTab: 'notes',
    });
    if (mapped) items.push(mapped);
  }

  for (const row of (disciplineRes.data || []) as Record<string, unknown>[]) {
    const mapped = mapRow(row, {
      id: String(row.id),
      source: 'discipline',
      category: 'Discipline',
      title: String(row.issue_type || 'Discipline report'),
      detail: String(row.description || '').slice(0, 240),
      sortTimestamp: sortTimestamp(row),
      employeeId: String(row.employee_id || ''),
      drawerTab: 'discipline',
    });
    if (mapped) items.push(mapped);
  }

  for (const row of (meetingsRes.data || []) as Record<string, unknown>[]) {
    const mapped = mapRow(row, {
      id: String(row.id),
      source: 'meeting',
      category: 'Meeting',
      title: String(row.meeting_type || row.subject || 'Meeting'),
      detail: String(row.notes || row.subject || '').slice(0, 240),
      sortTimestamp: sortTimestamp(row),
      employeeId: String(row.employee_id || ''),
      drawerTab: 'meetings',
    });
    if (mapped) items.push(mapped);
  }

  for (const row of (reviewsRes.data || []) as Record<string, unknown>[]) {
    const mapped = mapRow(row, {
      id: String(row.id),
      source: 'review',
      category: 'Review',
      title: String(row.review_type || row.overall_result || 'Performance review'),
      detail: String(row.manager_comments || '').slice(0, 240),
      sortTimestamp: sortTimestamp(row),
      employeeId: String(row.employee_id || ''),
      drawerTab: 'reviews',
    });
    if (mapped) items.push(mapped);
  }

  for (const row of (leaveRes.data || []) as Record<string, unknown>[]) {
    const mapped = mapRow(row, {
      id: String(row.id),
      source: 'leave',
      category: 'Time off',
      title: `${String(row.leave_type || 'Leave').toUpperCase()} · ${String(row.status || 'requested')}`,
      detail: `${String(row.start_date || '').slice(0, 10)}${row.end_date ? ` → ${String(row.end_date).slice(0, 10)}` : ''}`,
      sortTimestamp: sortTimestamp(row),
      employeeId: String(row.employee_id || ''),
      drawerTab: 'time-off',
    });
    if (mapped) items.push(mapped);
  }

  for (const row of (stayRes.data || []) as Record<string, unknown>[]) {
    const mapped = mapRow(row, {
      id: String(row.id),
      source: 'stay_interview',
      category: 'Stay interview',
      title: String(row.interview_type || 'Stay interview'),
      detail: String(row.manager_summary || '').slice(0, 240),
      sortTimestamp: sortTimestamp(row),
      employeeId: String(row.employee_id || ''),
      drawerTab: 'stay-interviews',
    });
    if (mapped) items.push(mapped);
  }

  return items
    .sort((a, b) => String(b.sortTimestamp).localeCompare(String(a.sortTimestamp)))
    .slice(0, limit);
}
