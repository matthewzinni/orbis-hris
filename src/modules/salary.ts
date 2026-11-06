/**
 * Matthew-only Salary page: current pay, salary history (from Employee Navigator),
 * bonus / other compensation and private notes per employee.
 * Access is enforced in the database (orbis_can_view_salaries()); this module also
 * refuses to render for anyone else.
 */
import { canViewSalaries } from '../services/accessScopes';
import {
  matchEnPeopleToEmployees,
  type EnMatchResult,
  type OrbisEmployeeForMatch,
} from '../services/employeeNavigatorBenefits';
import { loadEmployeeNavigatorLinks, resolveEmployeeNavigatorMatches } from '../services/employeeNavigatorStore';
import {
  annualizedSalary,
  COMP_TYPE_LABELS,
  parseSalaryImport,
  raisePercent,
  summarizeEmployeeSalary,
  type CompensationExtra,
  type EmployeeSalarySummary,
  type SalaryHistoryRow,
} from '../services/salaryData';
import {
  deleteCompensationExtra,
  loadSalaryData,
  saveCompensationExtra,
  saveSalaryNotes,
  saveSalarySnapshot,
  type SalaryData,
} from '../services/salaryStore';
import { compareEmployeesByLastName, isActiveDashboardEmployee, type EmployeeLike } from '../services/employeeUtils';
import { getEmployees } from './employees';

const PANEL_ID = 'salaryPanel';

type PendingImport = {
  filename: string;
  rowCount: number;
  warnings: string[];
  results: EnMatchResult[];
  history: SalaryHistoryRow[];
  employees: OrbisEmployeeForMatch[];
};

let data: SalaryData | null = null;
let selectedEmployeeId = '';
let filterText = '';
let showInactive = false;
let pendingImport: PendingImport | null = null;
let eventsBound = false;
let loadToken = 0;

function esc(value: unknown): string {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function money(value: number | null | undefined, cents = false): string {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: cents ? 2 : 0, minimumFractionDigits: cents ? 2 : 0,
  });
}

function shortDate(iso: string | null | undefined): string {
  const match = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[2]}/${match[3]}/${match[1]}` : '—';
}

function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function employeeId(employee: EmployeeLike): string {
  return String(employee.dbId || employee.id || employee.employee_id || '').trim();
}

function employeeName(employee: EmployeeLike): string {
  return `${employee.first_name || employee.first || ''} ${employee.last_name || employee.last || ''}`.trim();
}

function standardHours(employee: EmployeeLike): number | null {
  const hours = Number(employee.standard_hours || employee.standardHours || 0);
  return Number.isFinite(hours) && hours > 0 ? hours : null;
}

function toMatchEmployee(employee: EmployeeLike): OrbisEmployeeForMatch {
  return {
    id: employeeId(employee),
    first_name: String(employee.first_name || employee.first || ''),
    last_name: String(employee.last_name || employee.last || ''),
    hire_date: String(employee.hire_date || '').slice(0, 10) || null,
    status: String(employee.status || employee.displayStatus || ''),
    emails: [employee.work_email, employee.workEmail, employee.personal_email, employee.personalEmail, employee.email]
      .map((value) => String(value || '').trim().toLowerCase())
      .filter(Boolean),
  };
}

function panel(): HTMLElement | null {
  return document.getElementById(PANEL_ID);
}

async function ensureEmployeesLoaded(): Promise<EmployeeLike[]> {
  let roster = getEmployees() as EmployeeLike[];
  if (!roster.length && typeof window.loadEmployees === 'function') {
    await window.loadEmployees();
    roster = getEmployees() as EmployeeLike[];
  }
  return roster;
}

/* ------------------------------------------------------------- Overview */

function summaries(roster: EmployeeLike[]): Array<{ employee: EmployeeLike; summary: EmployeeSalarySummary }> {
  if (!data) return [];
  const today = todayIso();
  return roster
    .filter((employee) => employeeId(employee))
    .map((employee) => ({
      employee,
      summary: summarizeEmployeeSalary({
        employeeId: employeeId(employee),
        history: data!.history,
        extras: data!.extras,
        todayIso: today,
        standardHours: standardHours(employee),
      }),
    }));
}

function renderOverview(roster: EmployeeLike[]): string {
  const all = summaries(roster).sort((a, b) => compareEmployeesByLastName(a.employee, b.employee));
  const needle = filterText.trim().toLowerCase();
  const visible = all.filter(({ employee }) =>
    (showInactive || isActiveDashboardEmployee(employee)) &&
    (!needle || `${employeeName(employee)} ${employee.department || ''} ${employee.position || ''}`.toLowerCase().includes(needle))
  );
  const activeWithPay = all.filter(({ employee, summary }) => isActiveDashboardEmployee(employee) && summary.annualized);
  const totalAnnual = activeWithPay.reduce((sum, { summary }) => sum + (summary.annualized || 0), 0);
  const totalExtras = all.reduce((sum, { summary }) => sum + summary.extrasLast12Months, 0);
  const activeCount = all.filter(({ employee }) => isActiveDashboardEmployee(employee)).length;
  const latest = data?.latestImport;

  const rows = visible.map(({ employee, summary }) => {
    const id = employeeId(employee);
    const current = summary.current;
    const rate = current
      ? current.pay_basis === 'hourly' || (!current.annual_base_salary && current.hourly_rate)
        ? `${money(current.hourly_rate, true)}/hr`
        : `${money(current.annual_base_salary)}/yr`
      : '—';
    return `<tr class="salary-row${id === selectedEmployeeId ? ' is-selected' : ''}" data-salary-employee="${esc(id)}" tabindex="0">
      <td><strong>${esc(employeeName(employee))}</strong>
        ${isActiveDashboardEmployee(employee) ? '' : ` <span class="muted">(${esc(employee.status || 'Inactive')})</span>`}
        <div class="muted">${esc(employee.position || '')}</div></td>
      <td>${esc(employee.department || '')}</td>
      <td>${esc(rate)}</td>
      <td>${summary.annualized ? `${money(summary.annualized)}${summary.estimated ? ' <span class="muted" title="Hourly rate × hours per week × 52">est.</span>' : ''}` : '—'}</td>
      <td>${esc(shortDate(summary.lastChange))}<div class="muted">${esc(current?.change_reason || '')}</div></td>
      <td>${summary.extrasLast12Months ? money(summary.extrasLast12Months) : '—'}</td>
    </tr>`;
  }).join('');

  return `<div class="detail-grid salary-kpis">
      <div class="detail-card"><div class="detail-label">Annualized base pay (active)</div>
        <div class="detail-value">${money(totalAnnual)}</div></div>
      <div class="detail-card"><div class="detail-label">Active employees with pay on file</div>
        <div class="detail-value">${activeWithPay.length} of ${activeCount}</div></div>
      <div class="detail-card"><div class="detail-label">Bonus &amp; other comp, last 12 months</div>
        <div class="detail-value">${money(totalExtras)}</div></div>
    </div>
    <p class="muted salary-source">${latest
      ? `Salary history from Employee Navigator, imported ${esc(new Date(latest.imported_at).toLocaleString())} · ${latest.matched_count} of ${latest.people_count} EN employees linked${
        latest.unmatched?.length ? ` · not linked: ${esc(latest.unmatched.map((u) => u.name).join(', '))}` : ''}`
      : 'No Employee Navigator salary import yet. Use <strong>Import salary CSV</strong> above.'}</p>
    <div class="toolbar salary-toolbar">
      <input type="search" class="input" data-salary-filter placeholder="Search name, department or title" value="${esc(filterText)}" aria-label="Search employees" />
      <label class="muted"><input type="checkbox" data-salary-inactive${showInactive ? ' checked' : ''} /> Show inactive</label>
    </div>
    <div class="salary-layout">
      <div class="table-wrap salary-table-wrap"><table class="salary-table">
        <thead><tr><th>Employee</th><th>Department</th><th>Rate</th><th>Annualized</th><th>Effective</th><th>Bonus/other (12 mo)</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="6" class="empty">No employees match.</td></tr>'}</tbody>
      </table></div>
      <div class="salary-detail" id="salaryDetail">${renderDetail(roster)}</div>
    </div>`;
}

/* --------------------------------------------------------------- Detail */

function renderDetail(roster: EmployeeLike[]): string {
  const employee = roster.find((entry) => employeeId(entry) === selectedEmployeeId);
  if (!employee || !data) {
    return '<div class="card"><div class="card-body empty">Select an employee to see salary history, bonuses and notes.</div></div>';
  }
  const summary = summarizeEmployeeSalary({
    employeeId: selectedEmployeeId,
    history: data.history,
    extras: data.extras,
    todayIso: todayIso(),
    standardHours: standardHours(employee),
  });
  const hours = standardHours(employee);

  const historyRows = summary.history.map((row, index) => {
    const raise = raisePercent(row, summary.history[index + 1], hours);
    const annual = annualizedSalary(row, hours);
    return `<tr>
      <td>${esc(shortDate(row.effective_date))}</td>
      <td>${esc(row.salary_type || '')}</td>
      <td>${row.annual_base_salary ? money(row.annual_base_salary) : row.hourly_rate ? `${money(row.hourly_rate, true)}/hr` : '—'}
        ${row.hours_per_week ? `<div class="muted">${esc(row.hours_per_week)} hrs/wk</div>` : ''}</td>
      <td>${money(annual.amount)}${annual.estimated ? ' <span class="muted">est.</span>' : ''}</td>
      <td>${raise === null ? '—' : `${raise > 0 ? '+' : ''}${raise}%`}</td>
      <td>${esc(row.change_reason || '')}</td>
    </tr>`;
  }).join('');

  const extraRows = summary.extras.map((extra) => `<tr>
      <td>${esc(shortDate(extra.effective_date))}</td>
      <td>${esc(COMP_TYPE_LABELS[extra.comp_type] || extra.comp_type)}</td>
      <td>${money(extra.amount, true)}</td>
      <td>${esc(extra.note || '')}</td>
      <td><button type="button" class="button soft small" data-salary-delete-extra="${esc(extra.id)}">Delete</button></td>
    </tr>`).join('');

  return `<div class="card">
    <div class="card-header">${esc(employeeName(employee))}</div>
    <div class="card-body">
      <p class="muted">${esc(employee.position || '')}${employee.department ? ` · ${esc(employee.department)}` : ''}${
        employee.pay_type || employee.payType ? ` · ${esc(employee.pay_type || employee.payType)}` : ''}</p>
      <div class="detail-grid">
        <div class="detail-card"><div class="detail-label">Current annualized</div>
          <div class="detail-value">${money(summary.annualized)}${summary.estimated ? ' <span class="muted">est.</span>' : ''}</div></div>
        <div class="detail-card"><div class="detail-label">Effective</div>
          <div class="detail-value">${esc(shortDate(summary.lastChange))}</div></div>
        <div class="detail-card"><div class="detail-label">Bonus &amp; other, 12 mo</div>
          <div class="detail-value">${money(summary.extrasLast12Months)}</div></div>
      </div>

      <h4 class="salary-heading">Salary history</h4>
      ${historyRows ? `<div class="table-wrap"><table class="salary-table">
        <thead><tr><th>Effective</th><th>Type</th><th>Pay</th><th>Annualized</th><th>Change</th><th>Reason</th></tr></thead>
        <tbody>${historyRows}</tbody></table></div>` : '<div class="empty">No salary history from Employee Navigator.</div>'}

      <h4 class="salary-heading">Bonus &amp; other compensation</h4>
      ${extraRows ? `<div class="table-wrap"><table class="salary-table">
        <thead><tr><th>Date</th><th>Type</th><th>Amount</th><th>Note</th><th></th></tr></thead>
        <tbody>${extraRows}</tbody></table></div>` : '<div class="empty">None recorded.</div>'}
      <form class="salary-extra-form" data-salary-extra-form>
        <select class="input" name="comp_type" aria-label="Type">
          <option value="bonus">Bonus</option><option value="commission">Commission</option><option value="other">Other</option>
        </select>
        <input class="input" name="amount" type="number" step="0.01" min="0" placeholder="Amount" aria-label="Amount" required />
        <input class="input" name="effective_date" type="date" aria-label="Date" value="${esc(todayIso())}" />
        <input class="input" name="note" type="text" placeholder="Note (optional)" aria-label="Note" />
        <button type="submit" class="button primary">Add</button>
      </form>

      <h4 class="salary-heading">Notes</h4>
      <textarea class="input salary-notes" data-salary-notes rows="4" placeholder="Private notes">${esc(data.notes.get(selectedEmployeeId) || '')}</textarea>
      <div class="salary-notes-actions"><button type="button" class="button soft" data-salary-save-notes>Save notes</button></div>
    </div>
  </div>`;
}

/* --------------------------------------------------------------- Import */

const REVIEW_REASON_LABEL: Record<string, string> = {
  ambiguous: 'More than one Orbis employee has this name',
  conflict: 'Another EN person matched the same Orbis employee',
  no_match: 'No exact name match',
};

function employeeOptions(employees: OrbisEmployeeForMatch[], result: EnMatchResult, selected: string): string {
  const suggestedIds = new Set(result.candidates.map((candidate) => candidate.employee_id));
  const suggested = result.candidates.map((candidate) =>
    `<option value="${esc(candidate.employee_id)}"${candidate.employee_id === selected ? ' selected' : ''}>${esc(candidate.label)} — ${esc(candidate.reason)}</option>`
  ).join('');
  const all = employees.filter((employee) => !suggestedIds.has(employee.id)).map((employee) =>
    `<option value="${esc(employee.id)}"${employee.id === selected ? ' selected' : ''}>${esc(`${employee.first_name} ${employee.last_name}`.trim())}</option>`
  ).join('');
  return `<option value=""${selected ? '' : ' selected'}>— Leave unmatched —</option>
    ${suggested ? `<optgroup label="Suggested">${suggested}</optgroup>` : ''}
    <optgroup label="All Orbis employees">${all}</optgroup>`;
}

function renderImportReview(pending: PendingImport): string {
  const needsReview = pending.results.filter((result) => !result.employee_id);
  const matched = pending.results.filter((result) => result.employee_id);
  const pickRow = (result: EnMatchResult, auto: boolean) => `<tr>
      <td><strong>${esc(`${result.person.first_name} ${result.person.last_name}`)}</strong>
        <div class="muted">Hired ${esc(shortDate(result.person.hire_date))}</div></td>
      <td>${auto ? esc(result.method === 'link' ? 'saved link' : 'exact name') : esc(REVIEW_REASON_LABEL[result.review_reason || 'no_match'])}</td>
      <td><select class="input" data-salary-pick="${esc(result.person.person_key)}"${auto ? ` data-salary-auto="${esc(result.employee_id)}"` : ''}>
        ${employeeOptions(pending.employees, result, result.employee_id || '')}</select></td>
    </tr>`;

  return `<div class="card">
    <div class="card-header">Review salary import</div>
    <div class="card-body">
      <p class="muted">${esc(pending.filename)} · ${pending.rowCount} rows · ${pending.history.length} salary entries for
        ${pending.results.length} EN employees · ${matched.length} matched · <strong>${needsReview.length} need review</strong>.
        Nothing is saved until you click <strong>Save import</strong>. Saving replaces the previous salary history.</p>
      ${pending.warnings.map((warning) => `<p class="muted">⚠︎ ${esc(warning)}</p>`).join('')}
      ${needsReview.length ? `<div class="table-wrap"><table class="salary-table">
        <thead><tr><th>Employee Navigator</th><th>Why</th><th>Orbis employee</th></tr></thead>
        <tbody>${needsReview.map((result) => pickRow(result, false)).join('')}</tbody></table></div>`
        : '<div class="empty">Everyone matched automatically.</div>'}
      <details class="salary-review-details">
        <summary>Matched automatically (${matched.length}) — check and change if wrong</summary>
        <div class="table-wrap"><table class="salary-table">
          <thead><tr><th>Employee Navigator</th><th>Matched by</th><th>Orbis employee</th></tr></thead>
          <tbody>${matched.map((result) => pickRow(result, true)).join('')}</tbody></table></div>
      </details>
      <div class="salary-review-actions">
        <button type="button" class="button primary" data-salary-import-save>Save import</button>
        <button type="button" class="button soft" data-salary-import-cancel>Cancel</button>
      </div>
    </div>
  </div>`;
}

async function startImport(file: File): Promise<void> {
  const root = panel();
  if (!root || !canViewSalaries()) return;
  root.innerHTML = '<div class="empty">Reading salary CSV…</div>';
  try {
    const parsed = parseSalaryImport(await file.text());
    if (!parsed.people.length) throw new Error('No employees found in this file.');
    const roster = await ensureEmployeesLoaded();
    const employees = roster.map(toMatchEmployee).filter((employee) => employee.id)
      .sort((a, b) => `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`));
    const links = await loadEmployeeNavigatorLinks();
    pendingImport = {
      filename: file.name,
      rowCount: parsed.rowCount,
      warnings: parsed.warnings,
      results: matchEnPeopleToEmployees(parsed.people, employees, links),
      history: parsed.history,
      employees,
    };
    root.innerHTML = renderImportReview(pendingImport);
  } catch (error) {
    pendingImport = null;
    window.showToast?.(error instanceof Error ? error.message : String(error), 'error');
    await loadSalarySection(true);
  }
}

function collectManualPicks(root: HTMLElement): Map<string, string> {
  const picks = new Map<string, string>();
  root.querySelectorAll<HTMLSelectElement>('select[data-salary-pick]').forEach((select) => {
    const key = select.dataset.salaryPick || '';
    if (select.value !== (select.dataset.salaryAuto || '')) picks.set(key, select.value);
  });
  return picks;
}

async function saveImport(button: HTMLButtonElement): Promise<void> {
  const root = panel();
  if (!root || !pendingImport) return;
  const manualPicks = collectManualPicks(root);
  button.disabled = true;
  button.textContent = 'Saving…';
  try {
    await saveSalarySnapshot({
      sourceFilename: pendingImport.filename,
      rowCount: pendingImport.rowCount,
      results: pendingImport.results,
      history: pendingImport.history,
      manualPicks,
    });
    const linked = resolveEmployeeNavigatorMatches(pendingImport.results, manualPicks)
      .filter((entry) => entry.employeeId).length;
    window.showToast?.(`Salary import saved — ${linked} of ${pendingImport.results.length} employees linked.`);
    pendingImport = null;
    await loadSalarySection(true);
  } catch (error) {
    button.disabled = false;
    button.textContent = 'Save import';
    window.showToast?.(error instanceof Error ? error.message : String(error), 'error');
  }
}

/* --------------------------------------------------------------- Events */

async function rerender(): Promise<void> {
  const root = panel();
  if (!root || !data) return;
  root.innerHTML = renderOverview(await ensureEmployeesLoaded());
}

async function rerenderDetail(): Promise<void> {
  const detail = document.getElementById('salaryDetail');
  if (!detail) return;
  detail.innerHTML = renderDetail(await ensureEmployeesLoaded());
  panel()?.querySelectorAll<HTMLElement>('[data-salary-employee]').forEach((row) => {
    row.classList.toggle('is-selected', row.dataset.salaryEmployee === selectedEmployeeId);
  });
}

async function refreshData(): Promise<void> {
  data = await loadSalaryData();
  await rerender();
}

function bindEvents(): void {
  if (eventsBound) return;
  const page = document.getElementById('salaryPage');
  if (!page) return;
  eventsBound = true;

  page.addEventListener('change', (event) => {
    const target = event.target as HTMLInputElement;
    if (target.matches('input[data-salary-import]')) {
      const file = target.files?.[0];
      target.value = '';
      if (file) void startImport(file);
    } else if (target.matches('[data-salary-inactive]')) {
      showInactive = target.checked;
      void rerender();
    }
  });

  page.addEventListener('input', (event) => {
    const target = event.target as HTMLInputElement;
    if (!target.matches('[data-salary-filter]')) return;
    filterText = target.value;
    const caret = target.selectionStart;
    void rerender().then(() => {
      const input = page.querySelector<HTMLInputElement>('[data-salary-filter]');
      input?.focus();
      if (input && caret !== null) input.setSelectionRange(caret, caret);
    });
  });

  const selectRow = (target: HTMLElement) => {
    const row = target.closest<HTMLElement>('[data-salary-employee]');
    if (!row) return false;
    selectedEmployeeId = row.dataset.salaryEmployee || '';
    void rerenderDetail();
    return true;
  };

  page.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && selectRow(event.target as HTMLElement)) event.preventDefault();
  });

  page.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const save = target.closest<HTMLButtonElement>('[data-salary-import-save]');
    if (save) return void saveImport(save);
    if (target.closest('[data-salary-import-cancel]')) {
      pendingImport = null;
      return void rerender();
    }
    const del = target.closest<HTMLButtonElement>('[data-salary-delete-extra]');
    if (del) {
      del.disabled = true;
      void deleteCompensationExtra(del.dataset.salaryDeleteExtra || '')
        .then(refreshData)
        .catch((error) => {
          del.disabled = false;
          window.showToast?.(error instanceof Error ? error.message : String(error), 'error');
        });
      return;
    }
    const notesBtn = target.closest<HTMLButtonElement>('[data-salary-save-notes]');
    if (notesBtn) {
      const notes = page.querySelector<HTMLTextAreaElement>('[data-salary-notes]')?.value || '';
      notesBtn.disabled = true;
      void saveSalaryNotes(selectedEmployeeId, notes)
        .then(() => {
          data?.notes.set(selectedEmployeeId, notes);
          window.showToast?.('Notes saved.');
        })
        .catch((error) => window.showToast?.(error instanceof Error ? error.message : String(error), 'error'))
        .finally(() => { notesBtn.disabled = false; });
      return;
    }
    selectRow(target);
  });

  page.addEventListener('submit', (event) => {
    const form = (event.target as HTMLElement).closest<HTMLFormElement>('[data-salary-extra-form]');
    if (!form) return;
    event.preventDefault();
    const fields = new FormData(form);
    const amount = Number(fields.get('amount'));
    if (!Number.isFinite(amount) || amount <= 0) {
      window.showToast?.('Enter an amount.', 'error');
      return;
    }
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (button) button.disabled = true;
    void saveCompensationExtra({
      id: null,
      employeeId: selectedEmployeeId,
      compType: String(fields.get('comp_type') || 'bonus') as CompensationExtra['comp_type'],
      amount,
      effectiveDate: String(fields.get('effective_date') || '') || null,
      note: String(fields.get('note') || ''),
    })
      .then(refreshData)
      .catch((error) => {
        if (button) button.disabled = false;
        window.showToast?.(error instanceof Error ? error.message : String(error), 'error');
      });
  });
}

/* ----------------------------------------------------------------- Entry */

export async function loadSalarySection(force = false): Promise<void> {
  const root = panel();
  if (!root) return;
  if (!canViewSalaries()) {
    data = null;
    root.innerHTML = '';
    return;
  }
  bindEvents();
  if (pendingImport && !force) return;
  if (data && !force) {
    await rerender();
    return;
  }
  const token = ++loadToken;
  root.innerHTML = '<div class="empty">Loading salaries…</div>';
  try {
    const [loaded] = await Promise.all([loadSalaryData(), ensureEmployeesLoaded()]);
    if (token !== loadToken) return;
    data = loaded;
    await rerender();
  } catch (error) {
    if (token !== loadToken) return;
    root.innerHTML = `<div class="empty">Could not load salaries: ${esc(error instanceof Error ? error.message : String(error))}</div>`;
  }
}

/** Drop cached salary data (e.g. on sign-out) so nothing lingers in memory. */
export function clearSalaryState(): void {
  data = null;
  pendingImport = null;
  selectedEmployeeId = '';
  const root = panel();
  if (root) root.innerHTML = '';
}
