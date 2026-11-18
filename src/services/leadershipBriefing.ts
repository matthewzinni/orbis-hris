import { supabaseClient } from './supabaseClient';
import { isAdminUser } from './accessState';
import { loadManualAttendanceSnapshot } from './attendance';
import { buildLeadershipBriefing, shiftDate, validateBriefingDates, type BriefingSource, type BriefingRow, type LeadershipBriefing } from './leadershipBriefingModel';

function requireAdmin(): void {
  if (!isAdminUser()) throw new Error('Admin access is required for leadership briefings.');
}

// Explicit allowlists prevent case narratives, signatures, medical information,
// performance scores, and other sensitive fields entering a briefing snapshot.
async function source(table: string, fields: string, label: string): Promise<BriefingSource> {
  try {
    const rows: BriefingRow[] = [];
    for (let offset = 0; ; offset += 500) {
      const result = await supabaseClient.from(table).select(fields).order('id').range(offset, offset + 499);
      if (result.error) throw result.error;
      const page = (result.data || []) as unknown as BriefingRow[];
      rows.push(...page);
      if (page.length < 500) break;
    }
    return { label, rows };
  } catch {
    return { label, rows: [], error: 'The source could not be loaded. Retry or check access.' };
  }
}

async function attendance(start: string, label: string): Promise<BriefingSource> {
  try {
    const rows = await Promise.all(Array.from({ length: 7 }, async (_, day) => {
      const date = shiftDate(start, day);
      const snapshot = await loadManualAttendanceSnapshot(date);
      return { date, available: Boolean(snapshot), absent: snapshot?.absent.length ?? 0, present: snapshot?.present.length ?? 0 };
    }));
    return { label, rows };
  } catch {
    return { label, rows: [], error: 'Attendance could not be loaded. Retry or check access.' };
  }
}

export async function generateLeadershipBriefing(start: string, end: string, today: string): Promise<LeadershipBriefing> {
  requireAdmin();
  validateBriefingDates(start, end);
  const [employees, reviews, onboarding, training, currentAttendance, previousAttendance] = await Promise.all([
    source('employees', 'id,first_name,last_name,hire_date,termination_date,status', 'Employee records'),
    source('employee_reviews', 'id,employee_id,review_date', 'Performance reviews'),
    source('onboarding_tasks', 'id,employee_id,task_name,status,due_date,completed_at,assigned_to', 'Onboarding tasks'),
    source('leadership_course_assignments', 'id,enrollment_id,course_id,status,due_date,completed_at', 'Training assignments'),
    attendance(start, 'Selected week attendance'), attendance(shiftDate(start, -7), 'Previous week attendance'),
  ]);
  requireAdmin();
  return buildLeadershipBriefing(start, end, { employees, reviews, onboarding, training, attendance: currentAttendance, previousAttendance }, today);
}

export async function saveLeadershipBriefing(brief: LeadershipBriefing): Promise<void> {
  requireAdmin();
  validateBriefingDates(brief.start, brief.end);
  const { error } = await supabaseClient.from('leadership_briefings').insert({
    period_start: brief.start, period_end: brief.end, snapshot: brief,
  });
  if (error) throw new Error('The briefing was not saved. Check that the leadership briefing database update is installed and your admin access is active. You can still download a copy.');
}

export type SavedBriefing = { id: string; created_at: string; period_start: string; period_end: string };
export async function listLeadershipBriefings(): Promise<SavedBriefing[]> {
  requireAdmin();
  const { data, error } = await supabaseClient.from('leadership_briefings')
    .select('id,created_at,period_start,period_end').order('created_at', { ascending: false }).limit(30);
  if (error) throw new Error('Saved briefings are unavailable. If this is a new installation, apply the briefing database update.');
  requireAdmin();
  return data || [];
}

export async function getLeadershipBriefing(id: string): Promise<LeadershipBriefing> {
  requireAdmin();
  const { data, error } = await supabaseClient.from('leadership_briefings').select('snapshot').eq('id', id).single();
  if (error || !data) throw new Error('Could not open the saved briefing.');
  requireAdmin();
  return data.snapshot as LeadershipBriefing;
}
