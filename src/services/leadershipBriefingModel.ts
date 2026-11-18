export type BriefingRow = Record<string, unknown>;
export type BriefingSource = { label: string; rows: BriefingRow[]; error?: string };
export type BriefingMetric = { label: string; value: string; source: string; rows: BriefingRow[] };
export type LeadershipBriefing = {
  start: string; end: string; generatedAt: string; metrics: BriefingMetric[];
  warnings: string[]; narrative: string;
};

export function dateOnly(value: unknown): string {
  const text = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return '';
  const date = new Date(`${text}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text ? text : '';
}

export function shiftDate(date: string, days: number): string {
  if (!dateOnly(date)) throw new Error('Choose a valid date.');
  const shifted = new Date(`${date}T12:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

export function validateBriefingDates(start: string, end: string): void {
  if (!dateOnly(start) || !dateOnly(end) || start > end || shiftDate(start, 6) !== end) {
    throw new Error('Choose a seven-day reporting period.');
  }
}

export function buildLeadershipBriefing(
  start: string, end: string, sources: Record<string, BriefingSource>, today: string,
): LeadershipBriefing {
  validateBriefingDates(start, end);
  const metrics: BriefingMetric[] = [];
  const warnings = Object.values(sources).filter(s => s.error).map(s => `${s.label}: unavailable. ${s.error}`);
  const within = (v: unknown, from = start, to = end) => {
    const d = dateOnly(v); return Boolean(d && d >= from && d <= to);
  };
  const add = (label: string, source: string, predicate: (row: BriefingRow) => boolean) => {
    const input = sources[source];
    const rows = input.rows.filter(predicate);
    metrics.push({ label, source, rows, value: input.error ? 'Unavailable' : String(rows.length) });
  };
  add('Hires recorded this week', 'employees', r => within(r.hire_date));
  add('Departures recorded this week', 'employees', r => within(r.termination_date));
  add('Performance reviews recorded', 'reviews', r => within(r.review_date));
  add('Onboarding tasks completed', 'onboarding', r => r.status === 'completed' && within(r.completed_at));
  add('Training assignments completed', 'training', r => r.status === 'completed' && within(r.completed_at));
  for (const key of ['onboarding', 'training']) {
    add(`${sources[key].label} overdue today (${today})`, key, r => {
      const due = dateOnly(r.due_date);
      return Boolean(due && due < today && !['completed', 'withdrawn', 'paused', 'cancelled'].includes(String(r.status)));
    });
    add(`${sources[key].label} due next reporting week`, key, r =>
      within(r.due_date, shiftDate(end, 1), shiftDate(end, 7)) &&
      !['completed', 'withdrawn', 'paused', 'cancelled'].includes(String(r.status)));
    const undated = sources[key].rows.filter(r => r.status === 'completed' && !dateOnly(r.completed_at)).length;
    if (undated) warnings.push(`${sources[key].label}: ${undated} completed record(s) have no valid completion date and cannot be assigned to a week.`);
  }
  add('Recorded start dates next reporting week', 'employees', r => within(r.hire_date, shiftDate(end, 1), shiftDate(end, 7)));
  if (!sources.employees.error) {
    const missing = sources.employees.rows.filter(r => !dateOnly(r.hire_date)).length;
    if (missing) warnings.push(`${missing} employee record(s) lack a valid hire date.`);
    const missingDepartures = sources.employees.rows.filter(r => String(r.status).toUpperCase() === 'TERMINATED' && !dateOnly(r.termination_date)).length;
    if (missingDepartures) warnings.push(`${missingDepartures} terminated employee record(s) lack a valid departure date.`);
  }
  for (const [key, label] of [['attendance', 'Selected week'], ['previousAttendance', 'Previous week']]) {
    const source = sources[key];
    const rows = source.rows.filter(r => r.available === true);
    const absent = rows.reduce((n, r) => n + Number(r.absent || 0), 0);
    metrics.push({ label: `${label}: recorded absence-days`, source: key, rows,
      value: source.error ? 'Unavailable' : rows.length ? `${absent} (${rows.length}/7 days recorded)` : 'No snapshots recorded' });
    if (rows.length < 7 && !source.error) warnings.push(`${label}: ${7 - rows.length} day(s) have no attendance snapshot; these are not zero absences. Coverage includes weekends.`);
  }
  warnings.push('Counts reflect accessible records at generation time, not a historical headcount ledger. Rehires and deleted records may require reconciliation.');
  warnings.push('Overdue and upcoming items use current task status. Historical closed-action totals and scheduled performance-review due dates are not included.');
  warnings.push('Attendance counts are employee-days, not unique employees or an absence rate. Compare weeks only when coverage is comparable.');
  warnings.push('Completion timestamps are grouped by their stored ISO calendar date (UTC for server timestamps). Employee and due dates use their recorded calendar date.');
  const narrative = [
    `WEEK AT A GLANCE — ${start} to ${end}`,
    ...metrics.slice(0, 5).map(m => `${m.label}: ${m.value}`),
    '', 'WORK COMPLETED', 'Add outcomes and context for the recorded activity above.',
    '', 'NEEDS ATTENTION', 'Review the current overdue items below. Add an owner, next step, and follow-up date.',
    '', 'LEADERSHIP DECISIONS', 'Add decisions or approvals needed, who owns them, and the deadline.',
    '', 'NEXT WEEK', 'Review upcoming items below and add priorities.',
  ].join('\n');
  return { start, end, generatedAt: new Date().toISOString(), metrics, warnings, narrative };
}

export function briefingText(brief: LeadershipBriefing): string {
  return [`Orbis — Weekly Leadership Briefing`, `${brief.start} to ${brief.end}`,
    `Generated ${brief.generatedAt}`, '', brief.narrative, '', 'SUPPORTING METRICS',
    ...brief.metrics.map(m => `${m.label}: ${m.value}`), '', 'COVERAGE & LIMITATIONS', ...brief.warnings].join('\n');
}
