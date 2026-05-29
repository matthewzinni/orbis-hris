import { supabaseClient } from './supabaseClient';
import {
  computeNextStayInterviewDateFromLast,
  formatStayInterviewScheduleLabel,
} from './stayInterviewSchedule';

export async function fetchLatestStayInterviewDate(
  employeeIds: string[]
): Promise<string | null> {
  const ids = [...new Set(employeeIds.map((id) => String(id || '').trim()).filter(Boolean))];

  if (!ids.length) {
    return null;
  }

  const { data, error } = await supabaseClient
    .from('stay_interviews')
    .select('interview_date, created_at')
    .in('employee_id', ids)
    .order('interview_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    console.warn('[StayInterviews] Could not load latest stay interview date:', error);
    return null;
  }

  const row = (data || [])[0] as { interview_date?: string; created_at?: string } | undefined;

  if (!row) {
    return null;
  }

  return String(row.interview_date || row.created_at || '').trim() || null;
}

export async function syncEmployeeNextStayInterviewFromLastDate(
  employeeRecordId: string,
  lastInterviewDate: string
): Promise<{ nextDate: string | null; error: Error | null }> {
  const recordId = String(employeeRecordId || '').trim();
  const lastDate = String(lastInterviewDate || '').trim();

  if (!recordId || !lastDate) {
    return { nextDate: null, error: new Error('Missing employee or interview date') };
  }

  const nextDate = computeNextStayInterviewDateFromLast(lastDate);

  if (!nextDate) {
    return { nextDate: null, error: new Error('Could not calculate next stay interview date') };
  }

  const { error } = await supabaseClient
    .from('employees')
    .update({ next_review_date: nextDate })
    .eq('id', recordId);

  if (error) {
    return { nextDate: null, error: new Error(error.message || 'Employee update failed') };
  }

  return { nextDate, error: null };
}

export async function syncEmployeeNextStayInterviewFromLatestRecord(
  employeeRecordId: string,
  employeeLookupIds: string[]
): Promise<{ nextDate: string | null; error: Error | null }> {
  const latestDate = await fetchLatestStayInterviewDate(employeeLookupIds);

  if (!latestDate) {
    return { nextDate: null, error: null };
  }

  return syncEmployeeNextStayInterviewFromLastDate(employeeRecordId, latestDate);
}

export function describeScheduledNextStayInterview(nextDate: string): string {
  return formatStayInterviewScheduleLabel(nextDate);
}
