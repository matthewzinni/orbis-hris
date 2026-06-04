import { supabaseClient } from '../services/supabaseClient';
import { isAdminUser } from '../services/access';
import {
  daysUntilDate,
  employeeDisplayName,
  isActiveDashboardEmployee,
} from '../services/employeeUtils';

type EmployeeRow = Record<string, unknown>;

type StayInterviewReportRow = {
  name: string;
  department: string;
  nextInterview: string;
  lastInterview: string;
  interviewType: string;
  statusLabel: string;
};

let cachedStayInterviewRows: StayInterviewReportRow[] = [];
let cachedErRecentRows: ErRecentRow[] = [];
let reportsSectionLoaded = false;

type ErRecentRow = {
  kind: string;
  date: string;
  employeeName: string;
  department: string;
  category: string;
  status: string;
  sortDate: string;
};

type DisciplineReportRow = {
  employee_id?: string;
  incident_date?: string;
  issue_type?: string;
  discipline_level?: string;
  report_status?: string;
};

type IncidentReportRow = {
  employee_id?: string;
  incident_date?: string;
  incident_type?: string;
  status?: string;
};

function esc(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function showToast(message: string, type = 'success'): void {
  if (typeof window.showToast === 'function') {
    window.showToast(message, type);
    return;
  }
  console.log(`[${type}] ${message}`);
}

function getScopedEmployees(): EmployeeRow[] {
  const scoped = (window as { EMPLOYEES?: EmployeeRow[] }).EMPLOYEES;

  if (Array.isArray(scoped) && scoped.length) {
    return scoped;
  }

  return Array.isArray(window.currentEmployeeRoster) ? window.currentEmployeeRoster : [];
}

function readKpiText(id: string): string {
  return String(document.getElementById(id)?.textContent || '').trim() || '—';
}

function renderReportsMetricSnapshots(): void {
  const pairs: Array<[string, string]> = [
    ['reportsKpiActiveHc', 'kActiveHC'],
    ['reportsKpiDepartments', 'kDepartments'],
    ['reportsKpiTurnoverRisk', 'kTurnoverRisk'],
    ['reportsKpiTurnover', 'kTurnover'],
    ['reportsKpiNewHireTurnover', 'kNewHireTurnover'],
    ['reportsKpiAtRisk', 'kAtRiskEmployees'],
    ['reportsKpiOnLeave', 'kOnLeave'],
    ['reportsKpiOpenDiscipline', 'kOpenDiscipline'],
    ['reportsKpiReviewsDue', 'kReviewsDue'],
    ['reportsKpiImpactPlayers', 'kImpactPlayers'],
  ];

  pairs.forEach(([targetId, sourceId]) => {
    const el = document.getElementById(targetId);
    if (el) {
      el.textContent = readKpiText(sourceId);
    }
  });

  const overdue = document.getElementById('reviewDashboardOverdue');
  const dueSoon = document.getElementById('reviewDashboardDueSoon');
  const completed = document.getElementById('reviewDashboardCompleted');

  const set = (id: string, source: HTMLElement | null) => {
    const el = document.getElementById(id);
    if (el && source) {
      el.textContent = source.textContent?.trim() || '—';
    }
  };

  set('reportsStayOverdue', overdue);
  set('reportsStayDueSoon', dueSoon);
  set('reportsStayCompleted', completed);
}

function getEmployeeKeys(employee: EmployeeRow): string[] {
  return [
    String(employee.dbId || '').trim(),
    String(employee.id || '').trim(),
    String(employee.employee_id || '').trim(),
  ].filter(Boolean);
}

function getScopedEmployeeIdSet(): Set<string> {
  const ids = new Set<string>();

  getScopedEmployees().forEach((employee) => {
    getEmployeeKeys(employee).forEach((key) => ids.add(key));
  });

  return ids;
}

function buildEmployeeLookup(): Map<string, EmployeeRow> {
  const lookup = new Map<string, EmployeeRow>();

  getScopedEmployees().forEach((employee) => {
    getEmployeeKeys(employee).forEach((key) => lookup.set(key, employee));
  });

  return lookup;
}

function resolveEmployeeFromLookup(
  employeeId: string,
  lookup: Map<string, EmployeeRow>
): { name: string; department: string } {
  const employee = lookup.get(String(employeeId || '').trim());

  if (!employee) {
    return { name: '—', department: '—' };
  }

  return {
    name: employeeDisplayName(employee),
    department: String(employee.department || employee.dept || '—').trim() || '—',
  };
}

function isRecordInScope(employeeId: string, scope: Set<string>): boolean {
  return scope.has(String(employeeId || '').trim());
}

function isOpenErStatus(status: string): boolean {
  return String(status || '').trim().toLowerCase() !== 'closed';
}

function parseRecordDate(value: string): Date | null {
  const raw = String(value || '').trim();

  if (!raw) return null;

  const date = new Date(raw);

  return Number.isNaN(date.getTime()) ? null : date;
}

function formatMonthKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');

  return `${year}-${month}`;
}

function formatMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-').map((part) => Number(part));

  if (!year || !month) return monthKey;

  const date = new Date(year, month - 1, 1);

  return date.toLocaleString(undefined, { month: 'short', year: 'numeric' });
}

function getRecentMonthKeys(count = 6): string[] {
  const keys: string[] = [];
  const now = new Date();

  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    keys.push(formatMonthKey(date));
  }

  return keys;
}

function countByMonth<T extends { incident_date?: string }>(
  rows: T[],
  monthKeys: string[]
): Map<string, number> {
  const counts = new Map<string, number>();

  monthKeys.forEach((key) => counts.set(key, 0));

  rows.forEach((row) => {
    const date = parseRecordDate(String(row.incident_date || ''));

    if (!date) return;

    const key = formatMonthKey(date);

    if (!counts.has(key)) return;

    counts.set(key, (counts.get(key) || 0) + 1);
  });

  return counts;
}

function countByField<T>(rows: T[], field: keyof T, fallback = 'Unspecified'): [string, number][] {
  const counts = new Map<string, number>();

  rows.forEach((row) => {
    const label = String(row[field] || '').trim() || fallback;
    counts.set(label, (counts.get(label) || 0) + 1);
  });

  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function renderCountTable(
  bodyId: string,
  rows: [string, number][],
  emptyMessage: string
): void {
  const body = document.getElementById(bodyId);

  if (!body) return;

  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="2" class="empty">${esc(emptyMessage)}</td></tr>`;
    return;
  }

  body.innerHTML = rows
    .map(
      ([label, count]) => `
      <tr>
        <td>${esc(label)}</td>
        <td>${esc(count)}</td>
      </tr>
    `
    )
    .join('');
}

function renderMonthlyTable(bodyId: string, monthKeys: string[], counts: Map<string, number>): void {
  const body = document.getElementById(bodyId);

  if (!body) return;

  body.innerHTML = monthKeys
    .map(
      (key) => `
      <tr>
        <td>${esc(formatMonthLabel(key))}</td>
        <td>${esc(counts.get(key) || 0)}</td>
      </tr>
    `
    )
    .join('');
}

function countWithinDays<T extends { incident_date?: string }>(rows: T[], days: number): number {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  cutoff.setHours(0, 0, 0, 0);

  return rows.filter((row) => {
    const date = parseRecordDate(String(row.incident_date || ''));

    return Boolean(date && date >= cutoff);
  }).length;
}

async function loadErTrendsReport(): Promise<void> {
  const subtitle = document.getElementById('reportsErTrendsSubtitle');
  const recentCount = document.getElementById('reportsErRecentCount');
  const scope = getScopedEmployeeIdSet();
  const employeeLookup = buildEmployeeLookup();
  const monthKeys = getRecentMonthKeys(6);

  const setSummary = (id: string, value: number | string) => {
    const el = document.getElementById(id);
    if (el) el.textContent = String(value);
  };

  const loadingRow = '<tr><td colspan="2" class="empty">Loading...</td></tr>';
  const recentLoading =
    '<tr><td colspan="6" class="empty">Loading recent activity...</td></tr>';

  [
    'reportsDisciplineMonthlyBody',
    'reportsDisciplineByTypeBody',
    'reportsIncidentMonthlyBody',
    'reportsIncidentByTypeBody',
  ].forEach((id) => {
    const body = document.getElementById(id);
    if (body) body.innerHTML = loadingRow;
  });

  const recentBody = document.getElementById('reportsErRecentBody');
  if (recentBody) recentBody.innerHTML = recentLoading;
  if (subtitle) subtitle.textContent = 'Loading trends...';

  try {
    const [disciplineRes, incidentsRes] = await Promise.all([
      supabaseClient
        .from('discipline_reports')
        .select('employee_id, incident_date, issue_type, discipline_level, report_status')
        .order('incident_date', { ascending: false }),
      supabaseClient
        .from('incident_reports')
        .select('employee_id, incident_date, incident_type, status')
        .order('incident_date', { ascending: false }),
    ]);

    if (disciplineRes.error) throw disciplineRes.error;
    if (incidentsRes.error) throw incidentsRes.error;

    const disciplineRows = (disciplineRes.data || []).filter((row) =>
      isRecordInScope(String((row as DisciplineReportRow).employee_id || ''), scope)
    ) as DisciplineReportRow[];

    const incidentRows = (incidentsRes.data || []).filter((row) =>
      isRecordInScope(String((row as IncidentReportRow).employee_id || ''), scope)
    ) as IncidentReportRow[];

    const openDiscipline = disciplineRows.filter((row) =>
      isOpenErStatus(String(row.report_status || ''))
    ).length;
    const openIncidents = incidentRows.filter((row) =>
      isOpenErStatus(String(row.status || ''))
    ).length;

    setSummary('reportsErOpenDiscipline', openDiscipline);
    setSummary('reportsErOpenIncidents', openIncidents);
    setSummary('reportsErDiscipline90', countWithinDays(disciplineRows, 90));
    setSummary('reportsErIncidents90', countWithinDays(incidentRows, 90));

    renderMonthlyTable(
      'reportsDisciplineMonthlyBody',
      monthKeys,
      countByMonth(disciplineRows, monthKeys)
    );
    renderMonthlyTable(
      'reportsIncidentMonthlyBody',
      monthKeys,
      countByMonth(incidentRows, monthKeys)
    );

    renderCountTable(
      'reportsDisciplineByTypeBody',
      countByField(disciplineRows, 'issue_type'),
      'No discipline cases in scope.'
    );
    renderCountTable(
      'reportsIncidentByTypeBody',
      countByField(incidentRows, 'incident_type'),
      'No incident reports in scope.'
    );

    cachedErRecentRows = [
      ...disciplineRows.map((row) => {
        const employeeId = String(row.employee_id || '').trim();
        const { name, department } = resolveEmployeeFromLookup(employeeId, employeeLookup);
        const date = String(row.incident_date || '').trim();

        return {
          kind: 'Discipline',
          date: date || '—',
          employeeName: name,
          department,
          category: String(row.issue_type || row.discipline_level || '—').trim() || '—',
          status: String(row.report_status || '—').trim() || '—',
          sortDate: date,
        };
      }),
      ...incidentRows.map((row) => {
        const employeeId = String(row.employee_id || '').trim();
        const { name, department } = resolveEmployeeFromLookup(employeeId, employeeLookup);
        const date = String(row.incident_date || '').trim();

        return {
          kind: 'Incident',
          date: date || '—',
          employeeName: name,
          department,
          category: String(row.incident_type || '—').trim() || '—',
          status: String(row.status || '—').trim() || '—',
          sortDate: date,
        };
      }),
    ]
      .sort((a, b) => String(b.sortDate).localeCompare(String(a.sortDate)))
      .slice(0, 20);

    if (recentBody) {
      if (!cachedErRecentRows.length) {
        recentBody.innerHTML =
          '<tr><td colspan="6" class="empty">No discipline or incident activity in your current scope.</td></tr>';
      } else {
        recentBody.innerHTML = cachedErRecentRows
          .map(
            (row) => `
          <tr>
            <td>${esc(row.kind)}</td>
            <td>${esc(row.date)}</td>
            <td>${esc(row.employeeName)}</td>
            <td>${esc(row.department)}</td>
            <td>${esc(row.category)}</td>
            <td>${esc(row.status)}</td>
          </tr>
        `
          )
          .join('');
      }
    }

    if (subtitle) {
      subtitle.textContent = `${disciplineRows.length} discipline · ${incidentRows.length} incidents (scoped)`;
    }

    if (recentCount) {
      recentCount.textContent = `Showing ${cachedErRecentRows.length} recent`;
    }
  } catch (err) {
    console.error('[Reports] ER trends failed:', err);

    if (subtitle) subtitle.textContent = 'Load failed';

    [
      'reportsDisciplineMonthlyBody',
      'reportsDisciplineByTypeBody',
      'reportsIncidentMonthlyBody',
      'reportsIncidentByTypeBody',
    ].forEach((id) => {
      const body = document.getElementById(id);
      if (body) {
        body.innerHTML =
          '<tr><td colspan="2" class="empty">Could not load trend data.</td></tr>';
      }
    });

    if (recentBody) {
      recentBody.innerHTML =
        '<tr><td colspan="6" class="empty">Could not load recent activity.</td></tr>';
    }
  }
}

function isReviewEligible(employee: EmployeeRow): boolean {
  if (!isActiveDashboardEmployee(employee)) {
    return false;
  }

  const payType = String(employee.pay_type || employee.payType || '').toLowerCase();

  return !payType.includes('contract');
}

async function loadStayInterviewReportRows(): Promise<void> {
  const body = document.getElementById('reportsStayInterviewBody');
  const countEl = document.getElementById('reportsStayInterviewCount');

  if (!body) return;

  body.innerHTML =
    '<tr><td colspan="6" class="empty">Loading stay interview report...</td></tr>';

  const activeEmployees = getScopedEmployees().filter(isReviewEligible);

  try {
    const { data, error } = await supabaseClient
      .from('stay_interviews')
      .select('employee_id, interview_date, interview_type, created_at')
      .order('interview_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    const lastByEmployee: Record<
      string,
      { interviewDate: string; interviewType: string; sortDate: string }
    > = {};

    (data || []).forEach((row) => {
      const record = row as {
        employee_id?: string;
        interview_date?: string;
        interview_type?: string;
        created_at?: string;
      };
      const employeeId = String(record.employee_id || '').trim();
      const interviewDate = String(record.interview_date || '').trim();
      const sortDate = interviewDate || String(record.created_at || '').trim();

      if (!employeeId || !sortDate) return;

      const existing = lastByEmployee[employeeId];

      if (!existing || sortDate > existing.sortDate) {
        lastByEmployee[employeeId] = {
          interviewDate,
          interviewType: String(record.interview_type || '').trim() || 'Stay Interview',
          sortDate,
        };
      }
    });

    const sortedRows = activeEmployees
      .map((employee) => {
        const nextInterview = String(
          employee.next_review_date || employee.nextReviewDate || employee.nextReview || ''
        ).trim();
        const days = daysUntilDate(nextInterview);

        let statusLabel = 'No Date';

        if (days !== null) {
          if (days < 0) statusLabel = 'Overdue';
          else if (days <= 30) statusLabel = 'Due Soon';
          else statusLabel = 'Scheduled';
        }

        const lastKey = getEmployeeKeys(employee).find((key) => lastByEmployee[key]);
        const last = lastKey ? lastByEmployee[lastKey] : null;

        return {
          name: employeeDisplayName(employee),
          department: String(employee.department || employee.dept || '').trim(),
          nextInterview: nextInterview || '—',
          lastInterview: last?.interviewDate || '—',
          interviewType: last?.interviewType || 'Not recorded',
          statusLabel,
          days: days ?? 99999,
        };
      })
      .sort((a, b) => a.days - b.days);

    cachedStayInterviewRows = sortedRows.map(({ days: _days, ...row }) => row);

    if (!cachedStayInterviewRows.length) {
      body.innerHTML =
        '<tr><td colspan="6" class="empty">No stay interview data for the current scope.</td></tr>';
      if (countEl) countEl.textContent = '0 employees';
      return;
    }

    if (countEl) {
      countEl.textContent = `${cachedStayInterviewRows.length} employee${
        cachedStayInterviewRows.length === 1 ? '' : 's'
      }`;
    }

    body.innerHTML = cachedStayInterviewRows
      .map(
        (row) => `
        <tr>
          <td>${esc(row.name)}</td>
          <td>${esc(row.department || '—')}</td>
          <td>${esc(row.nextInterview)}</td>
          <td>${esc(row.lastInterview)}</td>
          <td>${esc(row.interviewType)}</td>
          <td>${esc(row.statusLabel)}</td>
        </tr>
      `
      )
      .join('');
  } catch (err) {
    console.error('[Reports] Stay interview report failed:', err);
    body.innerHTML =
      '<tr><td colspan="6" class="empty">Could not load stay interview report.</td></tr>';
    if (countEl) countEl.textContent = 'Load failed';
  }
}

function renderDepartmentHeadcountReport(): void {
  const body = document.getElementById('reportsDeptHeadcountBody');

  if (!body) return;

  const active = getScopedEmployees().filter((employee) =>
    isActiveDashboardEmployee(employee)
  );

  const counts = new Map<string, number>();

  active.forEach((employee) => {
    const dept = String(employee.department || employee.dept || 'Unassigned').trim() || 'Unassigned';
    counts.set(dept, (counts.get(dept) || 0) + 1);
  });

  const rows = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  if (!rows.length) {
    body.innerHTML =
      '<tr><td colspan="2" class="empty">No department headcount data available.</td></tr>';
    return;
  }

  body.innerHTML = rows
    .map(
      ([department, count]) => `
      <tr>
        <td>${esc(department)}</td>
        <td>${esc(count)}</td>
      </tr>
    `
    )
    .join('');
}

function csvEscape(value: unknown): string {
  const text = String(value ?? '');

  if (/[",\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }

  return text;
}

function downloadCsv(filename: string, headers: string[], rows: string[][]): void {
  const lines = [headers.map(csvEscape).join(',')];

  rows.forEach((row) => {
    lines.push(row.map(csvEscape).join(','));
  });

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function exportReportsStayInterviewsCsv(): void {
  if (!cachedStayInterviewRows.length) {
    showToast('No stay interview rows to export.', 'error');
    return;
  }

  downloadCsv(
    `orbis-stay-interviews-${new Date().toISOString().slice(0, 10)}.csv`,
    ['Employee', 'Department', 'Next Stay Interview', 'Last Stay Interview', 'Type', 'Status'],
    cachedStayInterviewRows.map((row) => [
      row.name,
      row.department,
      row.nextInterview,
      row.lastInterview,
      row.interviewType,
      row.statusLabel,
    ])
  );

  showToast('Stay interview report exported.');
}

export function exportReportsHeadcountCsv(): void {
  const active = getScopedEmployees().filter((employee) =>
    isActiveDashboardEmployee(employee)
  );

  const counts = new Map<string, number>();

  active.forEach((employee) => {
    const dept = String(employee.department || employee.dept || 'Unassigned').trim() || 'Unassigned';
    counts.set(dept, (counts.get(dept) || 0) + 1);
  });

  const rows = [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  if (!rows.length) {
    showToast('No headcount data to export.', 'error');
    return;
  }

  downloadCsv(
    `orbis-headcount-by-department-${new Date().toISOString().slice(0, 10)}.csv`,
    ['Department', 'Headcount'],
    rows.map(([department, count]) => [department, String(count)])
  );

  showToast('Headcount report exported.');
}

export function exportReportsErTrendsCsv(): void {
  if (!cachedErRecentRows.length) {
    showToast('No employee relations activity to export.', 'error');
    return;
  }

  downloadCsv(
    `orbis-er-trends-${new Date().toISOString().slice(0, 10)}.csv`,
    ['Type', 'Date', 'Employee', 'Department', 'Category', 'Status'],
    cachedErRecentRows.map((row) => [
      row.kind,
      row.date,
      row.employeeName,
      row.department,
      row.category,
      row.status,
    ])
  );

  showToast('ER trends activity exported.');
}

export function printReportsSection(): void {
  const section = document.getElementById('orbisSectionReports');

  if (!section) {
    window.print();
    return;
  }

  document.body.classList.add('orbis-print-reports');

  window.print();

  window.setTimeout(() => {
    document.body.classList.remove('orbis-print-reports');
  }, 0);
}

function renderReportsAccessGate(): void {
  const gate = document.getElementById('reportsAdminGate');
  const content = document.getElementById('reportsAdminContent');

  if (!gate || !content) return;

  if (isAdminUser()) {
    gate.classList.add('hidden');
    content.classList.remove('hidden');
    return;
  }

  gate.classList.remove('hidden');
  content.classList.add('hidden');
}

export async function loadReportsSection(force = false): Promise<void> {
  renderReportsAccessGate();

  if (!isAdminUser()) {
    return;
  }

  if (reportsSectionLoaded && !force) {
    renderReportsMetricSnapshots();
    void loadErTrendsReport();
    return;
  }

  if (!getScopedEmployees().length && typeof window.loadEmployees === 'function') {
    try {
      await window.loadEmployees();
    } catch (err) {
      console.error('[Reports] Employee preload failed:', err);
    }
  }

  if (typeof window.loadDashboardOverview === 'function' && !readKpiText('kActiveHC').match(/^\d/)) {
    try {
      await window.loadDashboardOverview();
    } catch (err) {
      console.warn('[Reports] Dashboard overview refresh skipped:', err);
    }
  }

  renderReportsMetricSnapshots();
  await Promise.all([loadStayInterviewReportRows(), loadErTrendsReport()]);
  renderDepartmentHeadcountReport();
  reportsSectionLoaded = true;

  if (typeof window.initOrbisDisclosure === 'function') {
    const reportsRoot = document.getElementById('orbisSectionReports');
    if (reportsRoot) window.initOrbisDisclosure(reportsRoot);
  }

  if (typeof window.initStayInterviewOrgInsights === 'function') {
    window.initStayInterviewOrgInsights();
  }
}

function bindReportsEvents(): void {
  if ((window as { __reportsEventsBound?: boolean }).__reportsEventsBound) {
    return;
  }

  (window as { __reportsEventsBound?: boolean }).__reportsEventsBound = true;

  document.getElementById('reportsRefreshBtn')?.addEventListener('click', () => {
    void loadReportsSection(true);
  });

  document.getElementById('exportReportsStayCsvBtn')?.addEventListener('click', () => {
    exportReportsStayInterviewsCsv();
  });

  document.getElementById('exportReportsHeadcountCsvBtn')?.addEventListener('click', () => {
    exportReportsHeadcountCsv();
  });

  document.getElementById('exportReportsErCsvBtn')?.addEventListener('click', () => {
    exportReportsErTrendsCsv();
  });

  document.getElementById('printReportsBtn')?.addEventListener('click', () => {
    printReportsSection();
  });
}

bindReportsEvents();

declare global {
  interface Window {
    loadReportsSection?: (force?: boolean) => Promise<void>;
    exportReportsStayInterviewsCsv?: () => void;
    exportReportsHeadcountCsv?: () => void;
    exportReportsErTrendsCsv?: () => void;
    printReportsSection?: () => void;
  }
}

window.loadReportsSection = loadReportsSection;
window.exportReportsStayInterviewsCsv = exportReportsStayInterviewsCsv;
window.exportReportsHeadcountCsv = exportReportsHeadcountCsv;
window.exportReportsErTrendsCsv = exportReportsErTrendsCsv;
window.printReportsSection = printReportsSection;
