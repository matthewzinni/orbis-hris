import { employeeMatchesSupervisorAccess, isSupervisorUser } from '../services/access';
import { getEmployees } from './employees';
import { renderManagerHomeCharts } from '../ui/dashboardCharts';
import {
  buildManagerHomeSnapshot,
  type ManagerAttentionItem,
  type ManagerHomeSnapshot,
} from '../services/managerHome';
import {
  employeeNameForLeave,
  formatLeaveDateRange,
  leaveTypeLabel,
} from '../services/leaveRequests';
import { switchMainView } from '../ui/navigation';

let managerHomeBound = false;
let cachedSnapshot: ManagerHomeSnapshot | null = null;

function safeGet<T extends HTMLElement = HTMLElement>(id: string): T | null {
  if (typeof window.safeGet === 'function') {
    return window.safeGet(id) as T | null;
  }
  return document.getElementById(id) as T | null;
}

function esc(value: unknown): string {
  if (typeof window.esc === 'function') {
    return window.esc(value);
  }
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function severityBadge(severity: ManagerAttentionItem['severity']): string {
  if (severity === 'overdue') return 'badge badge-absent';
  if (severity === 'due_soon') return 'badge badge-leave';
  return 'badge badge-soft';
}

function severityLabel(severity: ManagerAttentionItem['severity']): string {
  if (severity === 'overdue') return 'Overdue';
  if (severity === 'due_soon') return 'Due soon';
  return 'Watch';
}

function statusBadgeClass(status: string): string {
  const normalized = String(status || '').trim().toUpperCase();
  if (normalized === 'LEAVE' || normalized === 'ON LEAVE') return 'badge badge-leave';
  if (normalized === 'TERMINATED') return 'badge badge-terminated';
  if (normalized === 'INACTIVE') return 'badge badge-inactive';
  return 'badge badge-active';
}

async function openEmployeeDrawerTab(employeeId: string, tab: string): Promise<void> {
  if (typeof window.openEmployeeDrawer === 'function') {
    await window.openEmployeeDrawer(employeeId);
  }

  if (typeof window.switchDrawerTab === 'function') {
    window.switchDrawerTab(tab);
  } else if (typeof window.switchTab === 'function') {
    window.switchTab(tab);
  }
}

function renderAttentionItem(item: ManagerAttentionItem): string {
  const leaveActions =
    item.kind === 'leave_request' && item.leaveRequestId
      ? `<div class="manager-home-item-actions">
          <button class="button soft sm" type="button" data-manager-leave-approve="${esc(item.leaveRequestId)}">Approve</button>
          <button class="button soft sm" type="button" data-manager-leave-deny="${esc(item.leaveRequestId)}">Deny</button>
        </div>`
      : `<button class="button soft sm" type="button" data-manager-open="${esc(item.employeeId)}" data-manager-tab="${esc(item.drawerTab)}">Open</button>`;

  return `
    <article class="manager-home-attention-item" data-manager-attention-id="${esc(item.id)}">
      <div class="manager-home-attention-top">
        <span class="${severityBadge(item.severity)}">${esc(severityLabel(item.severity))}</span>
        <strong>${esc(item.employeeName)}</strong>
      </div>
      <div class="manager-home-attention-title">${esc(item.title)}</div>
      <div class="muted manager-home-attention-detail">${esc(item.detail)}</div>
      <div class="manager-home-attention-actions">${leaveActions}</div>
    </article>
  `;
}

function renderSnapshot(snapshot: ManagerHomeSnapshot): void {
  const summary = safeGet('managerHomeSummary');
  if (summary) {
    summary.textContent = `${snapshot.activeCount} active · ${snapshot.outTodayCount} out today · ${snapshot.pendingLeaveCount} leave to review · ${snapshot.overdueStayInterviewCount} stay interviews overdue`;
  }

  const metrics: Array<[string, string, string]> = [
    ['managerHomeMetricTeam', String(snapshot.teamCount), 'Team members'],
    ['managerHomeMetricOut', String(snapshot.outTodayCount), 'Out today'],
    ['managerHomeMetricStay', String(snapshot.overdueStayInterviewCount), 'Stay interviews overdue'],
    ['managerHomeMetricLeave', String(snapshot.pendingLeaveCount), 'Pending leave'],
  ];

  metrics.forEach(([id, value, label]) => {
    const valueEl = safeGet(`${id}Value`);
    const labelEl = safeGet(`${id}Label`);
    if (valueEl) valueEl.textContent = value;
    if (labelEl) labelEl.textContent = label;
  });

  const attentionList = safeGet('managerHomeAttentionList');
  if (attentionList) {
    if (!snapshot.attentionItems.length) {
      attentionList.innerHTML =
        '<div class="manager-home-empty muted">Your team is caught up — no pending leave or overdue stay interviews.</div>';
    } else {
      attentionList.innerHTML = snapshot.attentionItems.map(renderAttentionItem).join('');
    }
  }

  const outTodayList = safeGet('managerHomeOutTodayList');
  if (outTodayList) {
    if (!snapshot.outToday.length) {
      outTodayList.innerHTML =
        '<div class="manager-home-empty muted">Everyone on your team is expected in today.</div>';
    } else {
      outTodayList.innerHTML = snapshot.outToday
        .map((row) => {
          const name = employeeNameForLeave(String(row.employee_id || '').trim());
          return `<button class="manager-home-out-item" type="button" data-manager-open="${esc(row.employee_id)}" data-manager-tab="time-off">
            <strong>${esc(name)}</strong>
            <span class="muted">${esc(leaveTypeLabel(row.leave_type))} · ${esc(formatLeaveDateRange(row))}</span>
          </button>`;
        })
        .join('');
    }
  }

  const team = getEmployees().filter((employee) => employeeMatchesSupervisorAccess(employee));
  renderManagerHomeCharts(snapshot, team as Array<Record<string, unknown>>);

  const rosterBody = safeGet('managerHomeRosterBody');
  if (rosterBody) {
    if (!snapshot.teamRoster.length) {
      rosterBody.innerHTML =
        '<tr><td colspan="5" class="empty">No team members are assigned to your account yet.</td></tr>';
    } else {
      rosterBody.innerHTML = snapshot.teamRoster
        .map(
          (member) => `
          <tr class="manager-home-roster-row" data-manager-open="${esc(member.id)}" data-manager-tab="profile" tabindex="0" role="button">
            <td><strong>${esc(member.name)}</strong></td>
            <td>${esc(member.department)}</td>
            <td>${esc(member.position)}</td>
            <td><span class="${statusBadgeClass(member.status)}">${esc(member.status)}</span></td>
            <td class="muted">${esc(member.stayInterviewDue || '—')}</td>
          </tr>
        `
        )
        .join('');
    }
  }
}

function bindManagerHomeControls(): void {
  if (managerHomeBound) return;
  managerHomeBound = true;

  safeGet('managerHomeRefreshBtn')?.addEventListener('click', () => {
    void loadManagerHome(true);
  });

  safeGet('managerHomeAttendanceBtn')?.addEventListener('click', () => {
    switchMainView('attendanceView');
  });

  safeGet('managerHomeRosterBtn')?.addEventListener('click', () => {
    switchMainView('employeesView');
  });

  const root = safeGet('managerHomeCard');
  if (!root) return;

  root.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;

    const approveId = target.closest<HTMLElement>('[data-manager-leave-approve]')?.dataset
      .managerLeaveApprove;
    if (approveId) {
      event.preventDefault();
      void (async () => {
        if (typeof window.approveLeaveRequestById === 'function') {
          await window.approveLeaveRequestById(approveId);
          await loadManagerHome(true);
        }
      })();
      return;
    }

    const denyId = target.closest<HTMLElement>('[data-manager-leave-deny]')?.dataset.managerLeaveDeny;
    if (denyId) {
      event.preventDefault();
      void (async () => {
        if (typeof window.denyLeaveRequestById === 'function') {
          await window.denyLeaveRequestById(denyId);
          await loadManagerHome(true);
        }
      })();
      return;
    }

    const openBtn = target.closest<HTMLElement>('[data-manager-open]');
    if (!openBtn) return;

    const employeeId = String(openBtn.dataset.managerOpen || '').trim();
    const tab = String(openBtn.dataset.managerTab || 'profile').trim();
    if (!employeeId) return;

    void openEmployeeDrawerTab(employeeId, tab);
  });

  root.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const row = (event.target as HTMLElement).closest<HTMLElement>('.manager-home-roster-row');
    if (!row) return;
    event.preventDefault();
    const employeeId = String(row.dataset.managerOpen || '').trim();
    const tab = String(row.dataset.managerTab || 'profile').trim();
    if (employeeId) void openEmployeeDrawerTab(employeeId, tab);
  });
}

export function applyManagerHomeAccess(): void {
  const card = safeGet('managerHomeCard');
  const legacyGrid = safeGet('dashboardLegacyKpiGrid');
  const legacyOverview = safeGet('dashboardLegacyOverview');
  const visible = isSupervisorUser();

  card?.classList.toggle('hidden', !visible);
  legacyGrid?.classList.toggle('hidden', visible);
  legacyOverview?.classList.toggle('hidden', visible);

  document.querySelectorAll<HTMLElement>('[data-supervisor-dashboard-hide="true"]').forEach((el) => {
    el.classList.toggle('hidden', visible);
  });

  document.getElementById('supervisorBanner')?.classList.toggle('hidden', visible);
}

export async function loadManagerHome(force = false): Promise<void> {
  if (!isSupervisorUser()) {
    applyManagerHomeAccess();
    return;
  }

  applyManagerHomeAccess();
  bindManagerHomeControls();

  if (!force && cachedSnapshot) {
    renderSnapshot(cachedSnapshot);
    return;
  }

  const attentionList = safeGet('managerHomeAttentionList');
  const outTodayList = safeGet('managerHomeOutTodayList');
  const rosterBody = safeGet('managerHomeRosterBody');

  if (attentionList) attentionList.innerHTML = '<div class="muted">Loading…</div>';
  if (outTodayList) outTodayList.innerHTML = '<div class="muted">Loading…</div>';
  if (rosterBody) {
    rosterBody.innerHTML = '<tr><td colspan="5" class="empty">Loading team…</td></tr>';
  }

  try {
    cachedSnapshot = await buildManagerHomeSnapshot();
    if (cachedSnapshot) {
      renderSnapshot(cachedSnapshot);
    }
  } catch (err) {
    console.error('[ManagerHome]', err);
    if (attentionList) {
      attentionList.innerHTML = '<div class="muted">Could not load manager home.</div>';
    }
  }
}

window.loadManagerHome = loadManagerHome;
window.applyManagerHomeAccess = applyManagerHomeAccess;
