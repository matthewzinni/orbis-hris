import {
  buildOrgChart,
  getOrgChartDrawerId,
  getOrgChartEmployeeKey,
  type OrgChartNode,
} from '../services/orgChartBuilder';
import { employeeDisplayName, type EmployeeLike } from '../services/employeeUtils';

declare global {
  interface Window {
    renderOrgChart?: () => void;
    loadOrgChart?: () => Promise<void>;
  }
}

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

function getScopedRoster(): EmployeeLike[] {
  const scoped = window.EMPLOYEES;
  return Array.isArray(scoped) ? scoped : [];
}

function renderOrgChartNode(node: OrgChartNode): string {
  const employee = node.employee;
  const drawerId = esc(getOrgChartDrawerId(employee));
  const name = esc(employeeDisplayName(employee));
  const position = esc(String(employee.position || employee.displayPosition || '').trim() || '—');
  const department = esc(
    String(employee.department || employee.dept || employee.displayDepartment || '').trim() || '—'
  );
  const directReports = node.children.length;

  const childrenHtml =
    node.children.length > 0
      ? `<ul class="org-chart-children">${node.children.map(renderOrgChartNode).join('')}</ul>`
      : '';

  return `
    <li class="org-chart-item">
      <div class="org-chart-node" role="treeitem" aria-expanded="${node.children.length > 0}">
        <button
          type="button"
          class="org-chart-node-button"
          onclick="openDrawerByEmployeeId('${drawerId}')"
          title="Open ${name}"
        >
          <span class="org-chart-node-name">${name}</span>
          <span class="org-chart-node-meta">${position} · ${department}</span>
          ${
            directReports > 0
              ? `<span class="org-chart-node-reports">${directReports} direct report${directReports === 1 ? '' : 's'}</span>`
              : ''
          }
        </button>
      </div>
      ${childrenHtml}
    </li>
  `;
}

function renderUnlinkedRow(employee: EmployeeLike): string {
  const drawerId = esc(getOrgChartDrawerId(employee));
  const name = esc(employeeDisplayName(employee));
  const supervisor = esc(
    String(employee.supervisor || employee.displaySupervisor || '').trim() || '—'
  );
  const department = esc(
    String(employee.department || employee.dept || employee.displayDepartment || '').trim() || '—'
  );

  return `
    <tr>
      <td>
        <button type="button" class="link-button" onclick="openDrawerByEmployeeId('${drawerId}')">
          ${name}
        </button>
      </td>
      <td>${department}</td>
      <td>${supervisor}</td>
    </tr>
  `;
}

export function renderOrgChart(): void {
  const treeRoot = document.getElementById('orgChartTree');
  const unlinkedBody = document.getElementById('orgChartUnlinkedBody');
  const summaryEl = document.getElementById('orgChartSummary');
  const activeOnlyToggle = document.getElementById('orgChartActiveOnly') as HTMLInputElement | null;

  if (!treeRoot) return;

  const roster = getScopedRoster();

  if (!roster.length) {
    treeRoot.innerHTML = '<p class="empty">Load employees to build the org chart.</p>';
    if (unlinkedBody) {
      unlinkedBody.innerHTML =
        '<tr><td colspan="3" class="empty">No employees in scope</td></tr>';
    }
    if (summaryEl) summaryEl.textContent = '';
    return;
  }

  const activeOnly = activeOnlyToggle ? activeOnlyToggle.checked : true;
  const { roots, unlinked } = buildOrgChart(roster, { activeOnly });

  const totalInChart = activeOnly
    ? roster.filter(
        (e) =>
          String(e.status || e.displayStatus || '')
            .trim()
            .toUpperCase() === 'ACTIVE'
      ).length
    : roster.length;

  if (summaryEl) {
    summaryEl.textContent = `${roots.length} top-level leader${roots.length === 1 ? '' : 's'} · ${totalInChart} employee${totalInChart === 1 ? '' : 's'} in chart`;
  }

  if (!roots.length) {
    treeRoot.innerHTML =
      '<p class="empty">No hierarchy could be built. Check that supervisor names match employee names on the roster.</p>';
  } else {
    treeRoot.innerHTML = `<ul class="org-chart-forest" role="tree">${roots.map(renderOrgChartNode).join('')}</ul>`;
  }

  if (unlinkedBody) {
    if (!unlinked.length) {
      unlinkedBody.innerHTML =
        '<tr><td colspan="3" class="empty">Everyone in scope is linked to a manager in Orbis.</td></tr>';
    } else {
      unlinkedBody.innerHTML = unlinked.map(renderUnlinkedRow).join('');
    }
  }

  const unlinkedCard = document.getElementById('orgChartUnlinkedCard');
  if (unlinkedCard) {
    unlinkedCard.classList.toggle('hidden', !unlinked.length);
  }

  window.renderMobileOrgChartDrill?.();
}

export async function loadOrgChart(): Promise<void> {
  if ((!Array.isArray(window.EMPLOYEES) || !window.EMPLOYEES.length) && typeof window.loadEmployees === 'function') {
    await window.loadEmployees();
  }
  renderOrgChart();
}

function bindOrgChartControls(): void {
  document.getElementById('orgChartActiveOnly')?.addEventListener('change', () => {
    renderOrgChart();
  });

  document.getElementById('orgChartRefreshBtn')?.addEventListener('click', () => {
    void loadOrgChart();
  });

  document.getElementById('orgChartPrintBtn')?.addEventListener('click', () => {
    const body = document.body;
    if (!body) {
      window.print();
      return;
    }

    const cleanup = () => {
      body.classList.remove('org-chart-print-mode');
    };

    const handleAfterPrint = () => {
      cleanup();
      window.removeEventListener('afterprint', handleAfterPrint);
    };

    body.classList.add('org-chart-print-mode');
    window.addEventListener('afterprint', handleAfterPrint, { once: true });
    window.print();

    // Fallback for environments where afterprint may not fire reliably.
    window.setTimeout(cleanup, 2500);
  });
}

window.renderOrgChart = renderOrgChart;
window.loadOrgChart = loadOrgChart;

bindOrgChartControls();
