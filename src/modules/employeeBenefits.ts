/**
 * Employee drawer "Benefits" tab: Employee Navigator enrollment snapshot for one
 * employee, plus the HR-admin import/review flow for EN's Row-Based report CSV.
 */
import { isAdminUser } from '../services/accessState';
import { isRemoteEmployee } from '../services/attendanceRemoteEmployees';
import {
  BENEFITS_STATUS_LABELS,
  matchEnPeopleToEmployees,
  parseEmployeeNavigatorReport,
  summarizeEmployeeBenefits,
  type EmployeeBenefitsStatus,
  type EmployeeBenefitsSummary,
  type EnEnrollmentRow,
  type EnMatchResult,
  type OrbisEmployeeForMatch,
} from '../services/employeeNavigatorBenefits';
import {
  loadEmployeeBenefitsSnapshot,
  loadEmployeeNavigatorLinks,
  loadLatestEmployeeNavigatorImport,
  resolveEmployeeNavigatorMatches,
  saveEmployeeNavigatorSnapshot,
  type EmployeeNavigatorImport,
} from '../services/employeeNavigatorStore';
import { compareEmployeesByLastName, isActiveDashboardEmployee, type EmployeeLike } from '../services/employeeUtils';
import { getEmployees } from './employees';
import { createEmployeeDrawerRenderer, type EmployeeDrawerLoadContext } from './employeeDrawerRenderGuard';
import { invalidateEmployeeDrawerTab, loadEmployeeDrawerTab } from './employeeDrawerTabLoads';

const PANEL_ID = 'employeeBenefitsPanel';

type PendingImport = {
  filename: string;
  rowCount: number;
  warnings: string[];
  results: EnMatchResult[];
  employees: OrbisEmployeeForMatch[];
  rosterById: Map<string, EmployeeLike>;
};

let pendingImport: PendingImport | null = null;
let eventsBound = false;

function esc(value: unknown): string {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function money(value: number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function benefitAmount(value: number | null | undefined): string {
  if (!value) return '';
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function shortDate(iso: string | null | undefined): string {
  const match = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[2]}/${match[3]}/${match[1]}` : '';
}

function currentEmployee(): EmployeeLike | null {
  const employee = typeof window.getCurrentEmployeeForOrbis === 'function'
    ? window.getCurrentEmployeeForOrbis()
    : window.currentEmployee;
  return (employee as EmployeeLike | null) || null;
}

function employeeRecordId(employee: EmployeeLike): string {
  return String(employee.dbId || employee.id || employee.employee_id || '').trim();
}

const STATUS_BADGE: Record<EmployeeBenefitsStatus, string> = {
  enrolled: 'badge-active',
  waived: 'badge-leave',
  not_enrolled: 'badge-absent',
  not_found: 'badge-inactive',
  not_eligible_overseas: 'badge-soft',
  no_import: 'badge-soft',
};

/* ------------------------------------------------------------ Tab render */

function statusLine(summary: EmployeeBenefitsSummary): string {
  switch (summary.status) {
    case 'enrolled': {
      const types = [...new Set(summary.plans.map((plan) => plan.plan_type))].join(', ');
      return `Enrolled in ${esc(types)} · ${esc(money(summary.totalCostPerPay))} per pay.`;
    }
    case 'waived':
      return `Waived ${esc(summary.waived.map((row) => row.plan_type).join(', ') || 'coverage')}${
        summary.basicLifeOnly ? ' · has employer-paid Basic Life only' : ''}.`;
    case 'not_enrolled':
      return summary.basicLifeOnly
        ? 'In Employee Navigator with employer-paid Basic Life only — no medical, dental, vision or voluntary elections or waivers yet.'
        : 'In Employee Navigator, but has not elected or waived any coverage yet.';
    case 'not_found':
      return 'This employee is not in the latest Employee Navigator import (or wasn\'t matched). Add them in Employee Navigator, or link them during the next import.';
    case 'not_eligible_overseas':
      return 'Overseas / remote employees are not eligible for BTW benefits.';
    default:
      return 'Import the Employee Navigator report to see enrollment here.';
  }
}

function plansTable(plans: EnEnrollmentRow[]): string {
  if (!plans.length) return '<div class="empty">No enrolled plans.</div>';
  return `<div class="table-wrap benefits-table-wrap"><table class="benefits-table">
    <thead><tr><th>Plan Type</th><th>Carrier</th><th>Plan Name</th><th>Coverage</th><th>Effective</th>
      <th class="num">Cost Per Pay</th><th class="num">Benefit</th></tr></thead>
    <tbody>${plans.map((plan) => `<tr>
      <td>${esc(plan.plan_type)}</td><td>${esc(plan.carrier)}</td><td>${esc(plan.plan_name)}</td>
      <td>${esc(plan.coverage_level)}</td><td>${esc(shortDate(plan.effective_date))}</td>
      <td class="num">${esc(money(plan.cost_per_pay))}</td><td class="num">${esc(benefitAmount(plan.benefit_amount))}</td>
    </tr>`).join('')}</tbody></table></div>`;
}

function waivedTable(rows: EnEnrollmentRow[]): string {
  if (!rows.length) return '';
  return `<div class="card"><div class="card-header">Waived coverage</div><div class="card-body">
    <div class="table-wrap benefits-table-wrap"><table class="benefits-table">
      <thead><tr><th>Plan Type</th><th>Reason</th><th>Effective</th></tr></thead>
      <tbody>${rows.map((row) => `<tr><td>${esc(row.plan_type)}</td><td>${esc(row.decline_reason || 'Declined')}</td>
        <td>${esc(shortDate(row.effective_date))}</td></tr>`).join('')}</tbody>
    </table></div></div></div>`;
}

function dependentsTable(summary: EmployeeBenefitsSummary): string {
  const rows = summary.dependents.length
    ? `<div class="table-wrap benefits-table-wrap"><table class="benefits-table">
        <thead><tr><th>Name</th><th>Plan Types</th></tr></thead>
        <tbody>${summary.dependents.map((dependent) => `<tr>
          <td>${esc(dependent.name)} <span class="muted">(${esc(dependent.relationship.toLowerCase())})</span></td>
          <td>${esc(dependent.planTypes.join(', ') || 'Not covered')}</td></tr>`).join('')}</tbody>
      </table></div>`
    : '<div class="empty">No dependents listed in Employee Navigator.</div>';
  return `<div class="card"><div class="card-header">Dependents</div><div class="card-body">${rows}</div></div>`;
}

function refreshHelp(): string {
  return `<details class="benefits-refresh-help">
    <summary>How to refresh from Employee Navigator</summary>
    <ol>
      <li>In Employee Navigator go to <strong>Reports → Saved Report Templates</strong> and open
        <strong>Orbis Benefits Import</strong>. (First time: <strong>Reports → Row-Based Report</strong>. Employee fields:
        First Name, Last Name, Preferred Name, Work Email, Personal Email, Employment Status, Hire Date.
        Enrollment fields: Benefit, Carrier, Plan, Coverage Level, Start Date, End Date, Decline Reason,
        EE Per Pay Cost, Benefit Amount. Options: tick <em>Include dependents</em>; under <em>What to exclude</em>
        tick only <em>Ended enrollments</em>. Save it as a template.)</li>
      <li>Click <strong>View</strong>, then export as <strong>CSV</strong>.</li>
      <li>Here, click <strong>Import Employee Navigator report</strong>, choose the CSV, review the matches and save.
        Orbis drops the SSN column and stores no emails; delete the downloaded CSV afterwards.</li>
    </ol>
  </details>`;
}

function importControls(): string {
  return `<div class="benefits-import-actions">
    <label class="button soft sm" for="employeeNavigatorImportInput">Import Employee Navigator report</label>
    <input id="employeeNavigatorImportInput" type="file" accept=".csv,text/csv" hidden data-en-import />
  </div>`;
}

function sourceLine(latest: EmployeeNavigatorImport | null, summary: EmployeeBenefitsSummary): string {
  if (!latest) return '';
  const when = new Date(latest.imported_at).toLocaleString();
  const enName = summary.enName ? ` · EN record: ${esc(summary.enName)}${
    summary.enEmploymentStatus && summary.enEmploymentStatus !== 'Active' ? ` (${esc(summary.enEmploymentStatus)} in EN)` : ''}` : '';
  return `<div class="muted benefits-source">From Employee Navigator report imported ${esc(when)}${
    latest.source_filename ? ` (${esc(latest.source_filename)})` : ''}${enName}</div>`;
}

function renderSummary(summary: EmployeeBenefitsSummary, latest: EmployeeNavigatorImport | null): string {
  const showDetail = summary.status === 'enrolled' || summary.status === 'waived' || summary.status === 'not_enrolled';
  const total = summary.plans.length
    ? `<div class="benefits-total"><div class="benefits-total-label">Total Cost Per Pay — Bi-Weekly (26 periods)</div>
        <div class="benefits-total-value">${esc(money(summary.totalCostPerPay))}</div></div>`
    : '';
  return `
    <div class="card">
      <div class="card-header">Benefits — Employee Navigator</div>
      <div class="card-body">
        <div class="benefits-status-row">
          <span class="badge ${STATUS_BADGE[summary.status]}">${esc(BENEFITS_STATUS_LABELS[summary.status])}</span>
          <span>${statusLine(summary)}</span>
        </div>
        ${sourceLine(latest, summary)}
        ${importControls()}
        ${refreshHelp()}
      </div>
    </div>
    ${showDetail ? `<div class="card"><div class="card-header">Enrolled Plans</div><div class="card-body">
      ${plansTable(summary.plans)}${total}</div></div>
      ${waivedTable(summary.waived)}
      ${dependentsTable(summary)}` : ''}`;
}

export async function loadEmployeeBenefits(
  employeeId: string,
  context?: EmployeeDrawerLoadContext
): Promise<void> {
  bindBenefitsEvents();
  const render = createEmployeeDrawerRenderer(context, employeeId);
  const panel = document.getElementById(PANEL_ID);
  if (!panel || !render.isCurrent()) return;

  if (!isAdminUser()) {
    render.write(panel, '<div class="empty">Benefits are available to HR administrators only.</div>');
    return;
  }
  if (pendingImport) {
    render.write(panel, renderImportReview(pendingImport));
    return;
  }

  const employee = currentEmployee();
  if (!render.write(panel, '<div class="empty">Loading benefits…</div>')) return;

  try {
    const latest = await loadLatestEmployeeNavigatorImport();
    const snapshot = latest
      ? await loadEmployeeBenefitsSnapshot(latest.id, employeeId)
      : { person: null, enrollments: [] };
    if (!render.isCurrent()) return;
    const summary = summarizeEmployeeBenefits({
      hasImport: Boolean(latest),
      isOverseas: Boolean(employee && isRemoteEmployee(employee as Parameters<typeof isRemoteEmployee>[0])),
      person: snapshot.person,
      enrollments: snapshot.enrollments,
    });
    render.write(panel, renderSummary(summary, latest));
  } catch (error) {
    if (!render.isCurrent()) return;
    const message = error instanceof Error ? error.message : String(error);
    render.write(panel, `<div class="empty">Could not load benefits: ${esc(message)}</div>${importControls()}`);
  }
}

/* --------------------------------------------------------- Import review */

function toMatchEmployee(employee: EmployeeLike): OrbisEmployeeForMatch {
  return {
    id: employeeRecordId(employee),
    first_name: String(employee.first_name || employee.first || ''),
    last_name: String(employee.last_name || employee.last || ''),
    hire_date: String(employee.hire_date || '').slice(0, 10) || null,
    status: String(employee.status || employee.displayStatus || ''),
    emails: [employee.work_email, employee.workEmail, employee.personal_email, employee.personalEmail, employee.email]
      .map((value) => String(value || '').trim().toLowerCase())
      .filter(Boolean),
  };
}

function isActiveEnPerson(result: EnMatchResult): boolean {
  return !/terminat/i.test(result.person.employment_status);
}

function employeeOptions(
  employees: OrbisEmployeeForMatch[],
  result: EnMatchResult,
  selected: string
): string {
  const suggested = result.candidates
    .map((candidate) => `<option value="${esc(candidate.employee_id)}"${candidate.employee_id === selected ? ' selected' : ''}>
      ${esc(candidate.label)} — ${esc(candidate.reason)}</option>`)
    .join('');
  const suggestedIds = new Set(result.candidates.map((candidate) => candidate.employee_id));
  const all = employees
    .filter((employee) => !suggestedIds.has(employee.id))
    .map((employee) => `<option value="${esc(employee.id)}"${employee.id === selected ? ' selected' : ''}>
      ${esc(`${employee.first_name} ${employee.last_name}`.trim())}${
        employee.status && !/^active$/i.test(employee.status) ? ` (${esc(employee.status)})` : ''}</option>`)
    .join('');
  return `<option value=""${selected ? '' : ' selected'}>— Leave unmatched —</option>
    ${suggested ? `<optgroup label="Suggested">${suggested}</optgroup>` : ''}
    <optgroup label="All Orbis employees">${all}</optgroup>`;
}

const REVIEW_REASON_LABEL: Record<string, string> = {
  ambiguous: 'More than one Orbis employee has this name',
  conflict: 'Another EN person matched the same Orbis employee',
  no_match: 'No exact name or email match',
};

const METHOD_LABEL: Record<string, string> = {
  link: 'saved link', email: 'email', name: 'exact name',
};

function personCell(result: EnMatchResult): string {
  const p = result.person;
  const preferred = p.preferred_name ? ` <span class="muted">(prefers ${esc(p.preferred_name)})</span>` : '';
  return `<strong>${esc(`${p.first_name} ${p.last_name}`)}</strong>${preferred}
    <div class="muted">Hired ${esc(shortDate(p.hire_date) || '—')} · ${esc(p.employment_status || 'Unknown')} in EN</div>`;
}

function renderImportReview(pending: PendingImport): string {
  const active = pending.results.filter(isActiveEnPerson);
  const needsReview = active.filter((result) => !result.employee_id);
  const autoMatched = active.filter((result) => result.employee_id);
  const terminated = pending.results.filter((result) => !isActiveEnPerson(result));
  const matchedIds = new Set(pending.results.map((result) => result.employee_id).filter(Boolean));

  const missingFromEn = [...pending.rosterById.values()]
    .filter((employee) => isActiveDashboardEmployee(employee) && !matchedIds.has(employeeRecordId(employee)))
    .sort(compareEmployeesByLastName);

  const reviewRows = needsReview.map((result) => `<tr>
      <td>${personCell(result)}</td>
      <td>${esc(REVIEW_REASON_LABEL[result.review_reason || 'no_match'])}</td>
      <td><select data-en-pick="${esc(result.person.person_key)}" aria-label="Orbis employee for ${esc(result.person.first_name)} ${esc(result.person.last_name)}">
        ${employeeOptions(pending.employees, result, '')}</select></td>
    </tr>`).join('');

  const autoRows = autoMatched.map((result) => `<tr>
      <td>${personCell(result)}</td>
      <td>${esc(METHOD_LABEL[result.method || ''] || '')}</td>
      <td><select data-en-pick="${esc(result.person.person_key)}" data-en-auto="${esc(result.employee_id)}">
        ${employeeOptions(pending.employees, result, result.employee_id || '')}</select></td>
    </tr>`).join('');

  const missingRows = missingFromEn.map((employee) => {
    const overseas = isRemoteEmployee(employee as Parameters<typeof isRemoteEmployee>[0]);
    return `<li>${esc(`${employee.first_name || employee.first || ''} ${employee.last_name || employee.last || ''}`.trim())}${
      overseas ? ' <span class="muted">— overseas, not eligible</span>' : ''}</li>`;
  }).join('');

  return `<div class="card">
    <div class="card-header">Review Employee Navigator import</div>
    <div class="card-body">
      <p class="muted">${esc(pending.filename)} · ${pending.rowCount} rows · ${pending.results.length} EN employees
        (${active.length} active) · ${autoMatched.length} matched automatically · <strong>${needsReview.length} need review</strong>.
        Nothing is saved until you click <strong>Save import</strong>.</p>
      ${pending.warnings.map((warning) => `<p class="muted">⚠︎ ${esc(warning)}</p>`).join('')}

      <h4 class="benefits-review-heading">Needs review (${needsReview.length})</h4>
      ${needsReview.length ? `<p class="muted">Pick the Orbis employee for each, or leave unmatched. Picks are remembered for future imports.</p>
        <div class="table-wrap benefits-table-wrap"><table class="benefits-table">
          <thead><tr><th>Employee Navigator</th><th>Why</th><th>Orbis employee</th></tr></thead>
          <tbody>${reviewRows}</tbody></table></div>` : '<div class="empty">Everyone active in EN matched automatically.</div>'}

      <details class="benefits-review-details">
        <summary>Matched automatically (${autoMatched.length}) — check and change if wrong</summary>
        <div class="table-wrap benefits-table-wrap"><table class="benefits-table">
          <thead><tr><th>Employee Navigator</th><th>Matched by</th><th>Orbis employee</th></tr></thead>
          <tbody>${autoRows}</tbody></table></div>
      </details>

      <details class="benefits-review-details">
        <summary>Active in Orbis but not matched to anyone in this report (${missingFromEn.length})</summary>
        <ul class="benefits-missing-list">${missingRows || '<li>None</li>'}</ul>
      </details>

      ${terminated.length ? `<details class="benefits-review-details">
        <summary>Terminated in EN (${terminated.length}) — saved as history, not reviewed</summary>
        <ul class="benefits-missing-list">${terminated.map((result) => `<li>${esc(`${result.person.first_name} ${result.person.last_name}`)}${
          result.employee_id ? ` → ${esc(pending.employees.find((e) => e.id === result.employee_id)?.first_name || '')} ${
            esc(pending.employees.find((e) => e.id === result.employee_id)?.last_name || '')}` : ''}</li>`).join('')}</ul>
      </details>` : ''}

      <div class="benefits-review-actions">
        <button type="button" class="button primary" data-en-save>Save import</button>
        <button type="button" class="button soft" data-en-cancel>Cancel</button>
      </div>
    </div>
  </div>`;
}

async function startImport(file: File): Promise<void> {
  const panel = document.getElementById(PANEL_ID);
  if (!panel) return;
  panel.innerHTML = '<div class="empty">Reading Employee Navigator report…</div>';
  try {
    const parsed = parseEmployeeNavigatorReport(await file.text());
    if (!parsed.people.length) throw new Error('No employees found in this file.');
    const roster = getEmployees() as EmployeeLike[];
    const employees = roster.map(toMatchEmployee).filter((employee) => employee.id)
      .sort((a, b) => `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`));
    const links = await loadEmployeeNavigatorLinks();
    pendingImport = {
      filename: file.name,
      rowCount: parsed.rowCount,
      warnings: parsed.warnings,
      results: matchEnPeopleToEmployees(parsed.people, employees, links),
      employees,
      rosterById: new Map(roster.map((employee) => [employeeRecordId(employee), employee])),
    };
    panel.innerHTML = renderImportReview(pendingImport);
  } catch (error) {
    pendingImport = null;
    const message = error instanceof Error ? error.message : String(error);
    window.showToast?.(message, 'error');
    reloadBenefitsTab();
  }
}

function collectManualPicks(panel: HTMLElement): Map<string, string> {
  const picks = new Map<string, string>();
  panel.querySelectorAll<HTMLSelectElement>('select[data-en-pick]').forEach((select) => {
    const key = select.dataset.enPick || '';
    const auto = select.dataset.enAuto || '';
    if (select.value !== auto) picks.set(key, select.value);
  });
  return picks;
}

async function saveImport(button: HTMLButtonElement): Promise<void> {
  const panel = document.getElementById(PANEL_ID);
  if (!panel || !pendingImport) return;
  const manualPicks = collectManualPicks(panel);
  button.disabled = true;
  button.textContent = 'Saving…';
  try {
    await saveEmployeeNavigatorSnapshot({
      sourceFilename: pendingImport.filename,
      rowCount: pendingImport.rowCount,
      results: pendingImport.results,
      manualPicks,
    });
    const matched = resolveEmployeeNavigatorMatches(pendingImport.results, manualPicks)
      .filter((entry) => entry.employeeId).length;
    window.showToast?.(`Employee Navigator import saved — ${matched} of ${pendingImport.results.length} EN employees linked.`);
    pendingImport = null;
    reloadBenefitsTab();
  } catch (error) {
    button.disabled = false;
    button.textContent = 'Save import';
    window.showToast?.(error instanceof Error ? error.message : String(error), 'error');
  }
}

function reloadBenefitsTab(): void {
  invalidateEmployeeDrawerTab('benefits');
  void loadEmployeeDrawerTab('benefits');
}

function bindBenefitsEvents(): void {
  if (eventsBound) return;
  const panel = document.getElementById(PANEL_ID);
  if (!panel) return;
  eventsBound = true;

  panel.addEventListener('change', (event) => {
    const input = event.target as HTMLInputElement;
    if (!input.matches('input[data-en-import]')) return;
    const file = input.files?.[0];
    input.value = '';
    if (file) void startImport(file);
  });

  panel.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const save = target.closest<HTMLButtonElement>('[data-en-save]');
    if (save) {
      void saveImport(save);
      return;
    }
    if (target.closest('[data-en-cancel]')) {
      pendingImport = null;
      reloadBenefitsTab();
    }
  });
}
