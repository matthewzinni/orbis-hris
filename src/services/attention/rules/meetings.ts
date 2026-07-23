import {
  employeeMatchesSupervisorAccess,
  isAdminUser,
  isSupervisorUser,
} from '../../access';
import {
  employeeDisplayName,
  isActiveDashboardEmployee,
  parseDueDate,
} from '../../employeeUtils';
import { getActiveEmployees, getEmployees, loadEmployees } from '../../../modules/employees';
import { supabaseClient } from '../../supabaseClient';
import { buildAttentionDedupeKey } from '../dedupe';
import { severityFromDaysUntilDue, statusFromDueDate } from '../severity';
import type { AttentionItem } from '../types';
import {
  daysUntil,
  drawerEmployeeId,
  evaluationTimestamp,
  isoDateFromValue,
  todayIsoDate,
} from '../utils';

type MeetingRow = {
  id?: string | number;
  employee_id?: string;
  meeting_date?: string | null;
  meeting_type?: string | null;
  subject?: string | null;
  follow_up_date?: string | null;
};

function employeeInMeetingScope(employee: Record<string, unknown>): boolean {
  if (isAdminUser()) return true;
  return employeeMatchesSupervisorAccess(employee);
}

export async function collectMeetingAttentionItems(): Promise<AttentionItem[]> {
  if (!isAdminUser() && !isSupervisorUser()) return [];

  if (!getEmployees().length) {
    try {
      await loadEmployees();
    } catch (err) {
      console.warn('[Attention] Could not load employees for meetings rule:', err);
    }
  }

  const today = todayIsoDate();
  const { data, error } = await supabaseClient
    .from('employee_meetings')
    .select('id, employee_id, meeting_date, meeting_type, subject, follow_up_date')
    .eq('meeting_date', today);

  if (error) {
    console.warn('[Attention] Meetings query failed:', error.message || error);
    return [];
  }

  const employeeIndex = new Map<string, Record<string, unknown>>();
  getActiveEmployees().forEach((employee) => {
    const id = drawerEmployeeId(employee as Record<string, unknown>);
    if (id) employeeIndex.set(id, employee as Record<string, unknown>);
  });

  const evaluatedAt = evaluationTimestamp();
  const items: AttentionItem[] = [];

  (data || []).forEach((row: MeetingRow) => {
    const sourceId = String(row.id || '').trim();
    const employeeRef = String(row.employee_id || '').trim();
    if (!sourceId || !employeeRef) return;

    const employee =
      employeeIndex.get(employeeRef) ||
      (getEmployees().find((entry) => {
        const ids = [entry.id, entry.dbId, entry.employee_id, entry.displayId]
          .filter(Boolean)
          .map(String);
        return ids.includes(employeeRef);
      }) as Record<string, unknown> | undefined);

    if (!employee || !isActiveDashboardEmployee(employee)) return;
    if (!employeeInMeetingScope(employee)) return;

    const employeeId = drawerEmployeeId(employee);
    const name = employeeDisplayName(employee);
    const meetingType = String(row.meeting_type || 'Meeting').trim() || 'Meeting';
    const subject = String(row.subject || '').trim();
    const dueDate = isoDateFromValue(row.meeting_date);
    const days = daysUntil(dueDate);
    const dedupeKey = buildAttentionDedupeKey('meeting', 'employee_meeting', sourceId);

    items.push({
      id: dedupeKey,
      dedupeKey,
      category: 'meeting',
      severity: severityFromDaysUntilDue(days),
      status: statusFromDueDate(dueDate, days),
      title: `Meeting today — ${name}`,
      explanation: [meetingType, subject].filter(Boolean).join(' · ') || meetingType,
      employeeId,
      employeeName: name,
      responsibleRole: isAdminUser() ? 'admin' : 'supervisor',
      dueDate,
      sourceType: 'employee_meeting',
      sourceId,
      recommendedAction: 'Open the employee record and confirm the meeting notes or follow-up.',
      route: { type: 'employee', employeeId, drawerTab: 'meetings' },
      evaluatedAt,
    });
  });

  // Follow-up meetings overdue (follow_up_date before today, meeting already occurred)
  const activeIds = getActiveEmployees()
    .map((employee) => drawerEmployeeId(employee as Record<string, unknown>))
    .filter(Boolean);

  if (activeIds.length) {
    const chunkSize = 100;
    for (let index = 0; index < activeIds.length; index += chunkSize) {
      const chunk = activeIds.slice(index, index + chunkSize);
      const { data: followUps, error: followUpError } = await supabaseClient
        .from('employee_meetings')
        .select('id, employee_id, meeting_date, meeting_type, subject, follow_up_date')
        .in('employee_id', chunk)
        .not('follow_up_date', 'is', null)
        .lt('follow_up_date', today);

      if (followUpError) {
        console.warn('[Attention] Meeting follow-up query failed:', followUpError.message || followUpError);
        continue;
      }

      (followUps || []).forEach((row: MeetingRow) => {
        const sourceId = String(row.id || '').trim();
        const employeeRef = String(row.employee_id || '').trim();
        if (!sourceId || !employeeRef) return;

        const employee = getEmployees().find((entry) => {
          const ids = [entry.id, entry.dbId, entry.employee_id, entry.displayId]
            .filter(Boolean)
            .map(String);
          return ids.includes(employeeRef);
        }) as Record<string, unknown> | undefined;

        if (!employee || !isActiveDashboardEmployee(employee)) return;
        if (!employeeInMeetingScope(employee)) return;

        const employeeId = drawerEmployeeId(employee);
        const name = employeeDisplayName(employee);
        const followUpDate = isoDateFromValue(row.follow_up_date);
        const days = daysUntil(followUpDate);
        const dedupeKey = buildAttentionDedupeKey(
          'meeting',
          'employee_meeting',
          sourceId,
          'follow_up'
        );

        items.push({
          id: dedupeKey,
          dedupeKey,
          category: 'meeting',
          severity: severityFromDaysUntilDue(days),
          status: statusFromDueDate(followUpDate, days),
          title: `Meeting follow-up overdue — ${name}`,
          explanation: `Follow-up was due ${parseDueDate(followUpDate)?.toLocaleDateString() || followUpDate}`,
          employeeId,
          employeeName: name,
          responsibleRole: isAdminUser() ? 'admin' : 'supervisor',
          dueDate: followUpDate,
          sourceType: 'employee_meeting',
          sourceId,
          recommendedAction: 'Document follow-up in the meeting record or close the loop.',
          route: { type: 'employee', employeeId, drawerTab: 'meetings' },
          evaluatedAt,
        });
      });
    }
  }

  return items;
}
