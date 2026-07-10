import type { CareTrackerItem } from '../types/careEngagementTypes';
import type { Investigation } from '../types/investigationsTypes';
import type { OperationsIssue } from '../types/operationsTypes';
import { isMobileLayout } from './mobileLayout';

type CandidateRow = {
  id?: string;
  first_name?: string;
  last_name?: string;
  position?: string;
  department?: string;
  stage?: string;
  source?: string;
  applied_date?: string;
};

type AttendanceRollRow = {
  attendanceKey: string;
  name: string;
  department: string;
  presentChecked: boolean;
  absentChecked: boolean;
  sectionLabel?: string;
};

type AbsenceRow = {
  employeeId: string;
  name: string;
  department: string;
  absenceCount: number;
  datesLabel: string;
};

function esc(value: unknown): string {
  if (typeof window.esc === 'function') {
    return window.esc(value);
  }
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function setListHtml(id: string, html: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle('hidden', !isMobileLayout());
  if (!isMobileLayout()) {
    el.innerHTML = '';
    return;
  }
  el.innerHTML = html;
}

function emptyState(message: string): string {
  return `<div class="orbis-mobile-empty muted">${esc(message)}</div>`;
}

export function renderMobileOperationsCards(issues: OperationsIssue[]): void {
  if (!issues.length) {
    setListHtml('mobileOperationsList', emptyState('No operational issues match your filters.'));
    return;
  }

  setListHtml(
    'mobileOperationsList',
    issues
      .map((issue) => {
        const status = String(issue.status || 'open').toLowerCase();
        const priority = String(issue.priority || 'normal').toLowerCase();
        return `
      <button
        type="button"
        class="orbis-mobile-module-card"
        data-edit-operations-issue-id="${esc(issue.id)}"
      >
        <div class="orbis-mobile-module-card-top">
          <span class="badge badge-soft">${esc(issue.category || 'Issue')}</span>
          <span class="badge ${priority === 'urgent' ? 'badge-absent' : 'badge-soft'}">${esc(priority)}</span>
        </div>
        <div class="orbis-mobile-module-card-title">${esc(issue.title || 'Untitled issue')}</div>
        <div class="orbis-mobile-module-card-meta">${esc(issue.department || '—')} · ${esc(status)}</div>
      </button>`;
      })
      .join('')
  );
}

export function renderMobileInvestigationCards(rows: Investigation[]): void {
  if (!rows.length) {
    setListHtml('mobileInvestigationsList', emptyState('No investigations match your filters.'));
    return;
  }

  setListHtml(
    'mobileInvestigationsList',
    rows
      .map(
        (row) => `
      <button
        type="button"
        class="orbis-mobile-module-card"
        data-edit-investigation-id="${esc(row.id)}"
      >
        <div class="orbis-mobile-module-card-top">
          <span class="badge badge-soft">${esc(row.case_number || 'Case')}</span>
          <span class="badge ${String(row.severity) === 'critical' ? 'badge-absent' : 'badge-soft'}">${esc(row.severity || 'medium')}</span>
        </div>
        <div class="orbis-mobile-module-card-title">${esc(row.title || 'Investigation')}</div>
        <div class="orbis-mobile-module-card-meta">${esc(row.status || 'open')} · ${esc(row.category || '—')}</div>
      </button>`
      )
      .join('')
  );
}

export function renderMobileCareCards(items: CareTrackerItem[]): void {
  if (!items.length) {
    setListHtml('mobileCareList', emptyState('No care items logged.'));
    return;
  }

  setListHtml(
    'mobileCareList',
    items
      .map(
        (item) => `
      <button type="button" class="orbis-mobile-module-card" data-care-item-id="${esc(item.id)}">
        <div class="orbis-mobile-module-card-top">
          <span class="badge badge-soft">${esc(item.type)}</span>
          <span class="badge badge-soft">${esc(item.status)}</span>
        </div>
        <div class="orbis-mobile-module-card-title">${esc(item.employeeName)}</div>
        <div class="orbis-mobile-module-card-meta">${esc(item.needOrConcern || item.actionTaken || '—')}</div>
      </button>`
      )
      .join('')
  );
}

export function renderMobileCandidateCards(rows: CandidateRow[]): void {
  if (!rows.length) {
    setListHtml('mobileCandidatesList', emptyState('No candidates in the pipeline.'));
    return;
  }

  setListHtml(
    'mobileCandidatesList',
    rows
      .map((row) => {
        const name = `${row.first_name || ''} ${row.last_name || ''}`.trim() || 'Candidate';
        const applied = row.applied_date ? String(row.applied_date).trim() : '';
        const appliedLabel = applied ? ` · Applied ${applied}` : '';
        return `
      <button type="button" class="orbis-mobile-module-card" data-edit-candidate-id="${esc(row.id)}">
        <div class="orbis-mobile-module-card-top">
          <span class="badge badge-soft">${esc(row.stage || 'Applied')}</span>
        </div>
        <div class="orbis-mobile-module-card-title">${esc(name)}</div>
        <div class="orbis-mobile-module-card-meta">${esc(row.position || '—')} · ${esc(row.department || '—')}${esc(appliedLabel)}</div>
      </button>`;
      })
      .join('')
  );
}

export function renderMobileAttendanceRollCall(rows: AttendanceRollRow[]): void {
  if (!rows.length) {
    setListHtml('mobileAttendanceRollCall', emptyState('No employees in roll call.'));
    return;
  }

  setListHtml(
    'mobileAttendanceRollCall',
    rows
      .map(
        (row) => `
      ${row.sectionLabel ? `<div class="orbis-mobile-attendance-section">${esc(row.sectionLabel)}</div>` : ''}
      <div class="orbis-mobile-attendance-card" data-attendance-key="${esc(row.attendanceKey)}">
        <div class="orbis-mobile-attendance-card-main">
          <strong>${esc(row.name)}</strong>
          <span class="muted">${esc(row.department || '—')}</span>
        </div>
        <div class="orbis-mobile-attendance-toggles">
          <label class="orbis-mobile-attendance-toggle">
            <input type="checkbox" class="attendance-present-check" data-sync-present="${esc(row.attendanceKey)}" ${row.presentChecked ? 'checked' : ''} />
            Present
          </label>
          <label class="orbis-mobile-attendance-toggle">
            <input type="checkbox" class="attendance-absent-check" data-sync-absent="${esc(row.attendanceKey)}" ${row.absentChecked ? 'checked' : ''} />
            Absent
          </label>
        </div>
      </div>`
      )
      .join('')
  );
}

export function renderMobileAbsenceCards(rows: AbsenceRow[]): void {
  if (!rows.length) {
    setListHtml('mobileAttendanceAbsences', emptyState('No repeat absences in the lookback window.'));
    return;
  }

  setListHtml(
    'mobileAttendanceAbsences',
    rows
      .map(
        (row) => `
      <button type="button" class="orbis-mobile-module-card" data-attendance-open-employee="${esc(row.employeeId)}">
        <div class="orbis-mobile-module-card-top">
          <span class="badge badge-absent">${esc(row.absenceCount)} absences</span>
        </div>
        <div class="orbis-mobile-module-card-title">${esc(row.name)}</div>
        <div class="orbis-mobile-module-card-meta">${esc(row.department || '—')}</div>
        <div class="orbis-mobile-module-card-sub muted">${esc(row.datesLabel)}</div>
      </button>`
      )
      .join('')
  );
}

export function renderMobileSettingsNav(): void {
  const nav = document.getElementById('mobileSettingsNav');
  if (!nav) return;

  if (!isMobileLayout()) {
    nav.classList.add('hidden');
    return;
  }

  nav.classList.remove('hidden');
  const groups = [
    { id: 'settingsPendingApprovalsCard', label: 'Pending approvals' },
    { id: 'settingsUserAccessCard', label: 'User access' },
    { id: 'settingsAuditLogCard', label: 'Audit log' },
  ];

  nav.innerHTML = groups
    .map(
      (group) => `
    <button type="button" class="orbis-mobile-settings-link" data-settings-scroll="${esc(group.id)}">
      <span>${esc(group.label)}</span>
      <span aria-hidden="true">›</span>
    </button>`
    )
    .join('');
}

export function renderMobileOrgChartDrill(): void {
  const slot = document.getElementById('mobileOrgChartDrill');
  const tree = document.getElementById('orgChartTree');
  if (!slot || !tree) return;

  if (!isMobileLayout()) {
    slot.classList.add('hidden');
    slot.innerHTML = '';
    return;
  }

  const topButtons = tree.querySelectorAll(':scope > ul > li > .org-chart-node-button');
  if (!topButtons.length) {
    slot.classList.add('hidden');
    return;
  }

  slot.classList.remove('hidden');
  slot.innerHTML = `
    <p class="muted orbis-mobile-orgchart-hint">Tap a leader to open their profile. Use the chart below to explore the full tree.</p>`;
}

function syncAttendanceCheckboxToTable(
  attendanceKey: string,
  kind: 'present' | 'absent',
  checked: boolean
): void {
  const row = document.querySelector<HTMLTableRowElement>(
    `tr.attendance-employee-row[data-attendance-key="${attendanceKey}"]`
  );
  if (!row) return;

  const input = row.querySelector<HTMLInputElement>(
    kind === 'present' ? '.attendance-present-check' : '.attendance-absent-check'
  );
  if (!input) return;

  input.checked = checked;
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function bindMobileMoreModuleEvents(): void {
  if ((window as { __mobileMoreModulesBound?: boolean }).__mobileMoreModulesBound) return;
  (window as { __mobileMoreModulesBound?: boolean }).__mobileMoreModulesBound = true;

  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    if (!isMobileLayout()) return;

    const ops = target?.closest<HTMLElement>('[data-edit-operations-issue-id]');
    if (ops && target?.closest('#mobileOperationsList')) {
      event.preventDefault();
      const id = ops.dataset.editOperationsIssueId || '';
      if (id && typeof window.openOperationsIssueDrawer === 'function') {
        void window.openOperationsIssueDrawer(id);
      }
      return;
    }

    const inv = target?.closest<HTMLElement>('[data-edit-investigation-id]');
    if (inv && target?.closest('#mobileInvestigationsList')) {
      event.preventDefault();
      const id = inv.dataset.editInvestigationId || '';
      if (id && typeof window.openInvestigationDrawer === 'function') {
        void window.openInvestigationDrawer(id);
      }
      return;
    }

    const care = target?.closest<HTMLElement>('[data-care-item-id]');
    if (care && target?.closest('#mobileCareList')) {
      event.preventDefault();
      const id = care.dataset.careItemId || '';
      document
        .querySelector<HTMLElement>(`#careTrackerBody [data-care-item-id="${id}"]`)
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return;
    }

    const candidate = target?.closest<HTMLElement>('[data-edit-candidate-id]');
    if (candidate && target?.closest('#mobileCandidatesList')) {
      event.preventDefault();
      const id = candidate.dataset.editCandidateId || '';
      document
        .querySelector<HTMLElement>(`#candidateBody [data-edit-candidate-id="${id}"]`)
        ?.click();
      return;
    }

    const absence = target?.closest<HTMLElement>('[data-attendance-open-employee]');
    if (absence && target?.closest('#mobileAttendanceAbsences')) {
      event.preventDefault();
      const employeeId = absence.dataset.attendanceOpenEmployee || '';
      if (employeeId && employeeId !== '—' && typeof window.openEmployeeDrawer === 'function') {
        void window.openEmployeeDrawer(employeeId);
      }
      return;
    }

    const settingsLink = target?.closest<HTMLElement>('[data-settings-scroll]');
    if (settingsLink) {
      event.preventDefault();
      const cardId = settingsLink.dataset.settingsScroll || '';
      document.getElementById(cardId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  document.getElementById('mobileAttendanceRollCall')?.addEventListener('change', (event) => {
    const input = event.target as HTMLInputElement | null;
    if (!input) return;

    const presentId = input.dataset.syncPresent;
    const absentId = input.dataset.syncAbsent;

    if (presentId) {
      syncAttendanceCheckboxToTable(presentId, 'present', input.checked);
      if (input.checked) {
        syncAttendanceCheckboxToTable(presentId, 'absent', false);
      }
    }

    if (absentId) {
      syncAttendanceCheckboxToTable(absentId, 'absent', input.checked);
      if (input.checked) {
        syncAttendanceCheckboxToTable(absentId, 'present', false);
      }
    }
  });

  window.addEventListener('orbis:layout-change', () => {
    renderMobileSettingsNav();
    renderMobileOrgChartDrill();
  });

  window.addEventListener('orbis:section-change', (event) => {
    const sectionId = (event as CustomEvent<{ sectionId?: string }>).detail?.sectionId;
    if (sectionId === 'settingsView') renderMobileSettingsNav();
    if (sectionId === 'orgChartView') renderMobileOrgChartDrill();
  });
}

export function initMobileMoreModules(): void {
  bindMobileMoreModuleEvents();
  renderMobileSettingsNav();
}

window.renderMobileOperationsCards = renderMobileOperationsCards;
window.renderMobileInvestigationCards = renderMobileInvestigationCards;
window.renderMobileCareCards = renderMobileCareCards;
window.renderMobileCandidateCards = renderMobileCandidateCards;
window.renderMobileAttendanceRollCall = renderMobileAttendanceRollCall;
window.renderMobileAbsenceCards = renderMobileAbsenceCards;
window.renderMobileOrgChartDrill = renderMobileOrgChartDrill;
window.renderMobileSettingsNav = renderMobileSettingsNav;
