import { canAccessAppSection } from '../services/access';
import {
  directoryDisplayName,
  directoryEmployeeToRosterRow,
  directoryWorkLocation,
  filterDirectoryEmployees,
  loadEmployeeDirectory,
  type DirectoryEmployee,
} from '../services/employeeDirectory';
import { buildOrgChart, type OrgChartNode } from '../services/orgChartBuilder';
import { employeeDisplayName } from '../services/employeeUtils';

declare global {
  interface Window {
    loadMyDirectoryPortal?: () => Promise<void>;
  }
}

let cachedDirectory: DirectoryEmployee[] = [];
let activeDirectoryView: 'list' | 'chart' = 'list';

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

function showToast(message: string, type = 'success'): void {
  if (typeof window.showToast === 'function') {
    window.showToast(message, type);
    return;
  }
  console.log(`[${type}] ${message}`);
}

function renderReadOnlyOrgNode(node: OrgChartNode): string {
  const name = esc(employeeDisplayName(node.employee));
  const position = esc(String(node.employee.position || '').trim() || '—');
  const department = esc(String(node.employee.department || node.employee.dept || '').trim() || '—');
  const directReports = node.children.length;

  const childrenHtml =
    node.children.length > 0
      ? `<ul class="org-chart-children">${node.children.map(renderReadOnlyOrgNode).join('')}</ul>`
      : '';

  return `
    <li class="org-chart-item">
      <div class="org-chart-node org-chart-node--readonly" role="treeitem" aria-expanded="${node.children.length > 0}">
        <div class="org-chart-node-card">
          <span class="org-chart-node-name">${name}</span>
          <span class="org-chart-node-meta">${position} · ${department}</span>
          ${
            directReports > 0
              ? `<span class="org-chart-node-reports">${directReports} direct report${directReports === 1 ? '' : 's'}</span>`
              : ''
          }
        </div>
      </div>
      ${childrenHtml}
    </li>
  `;
}

function renderDirectoryList(rows: DirectoryEmployee[]): void {
  const list = safeGet('myDirectoryList');
  const summary = safeGet('myDirectorySummary');
  if (!list) return;

  if (!rows.length) {
    list.innerHTML = '<div class="muted">No employees match your search.</div>';
    if (summary) summary.textContent = '0 people';
    return;
  }

  list.innerHTML = rows
    .map(
      (row) => `
        <article class="employee-directory-card">
          <div class="employee-directory-card-top">
            <strong>${esc(directoryDisplayName(row))}</strong>
            <span class="badge badge-soft">${esc(row.department || '—')}</span>
          </div>
          <div class="employee-directory-card-meta">
            <span>${esc(row.position || '—')}</span>
            <span class="muted">Supervisor: ${esc(row.supervisor || '—')}</span>
            <span class="muted">${esc(directoryWorkLocation(row))}</span>
          </div>
        </article>
      `
    )
    .join('');

  if (summary) {
    summary.textContent = `${rows.length} active employee${rows.length === 1 ? '' : 's'}`;
  }
}

function renderDirectoryChart(rows: DirectoryEmployee[]): void {
  const tree = safeGet('myDirectoryChart');
  if (!tree) return;

  const roster = rows.map(directoryEmployeeToRosterRow);
  const { roots } = buildOrgChart(roster, { activeOnly: true });

  if (!roots.length) {
    tree.innerHTML =
      '<p class="muted">Could not build an org chart from supervisor names. Try the list view.</p>';
    return;
  }

  tree.innerHTML = `<ul class="org-chart-forest" role="tree">${roots.map(renderReadOnlyOrgNode).join('')}</ul>`;
}

function setDirectoryView(view: 'list' | 'chart'): void {
  activeDirectoryView = view;

  const listPanel = safeGet('myDirectoryListPanel');
  const chartPanel = safeGet('myDirectoryChartPanel');
  const listBtn = safeGet('myDirectoryViewListBtn');
  const chartBtn = safeGet('myDirectoryViewChartBtn');

  listPanel?.classList.toggle('hidden', view !== 'list');
  chartPanel?.classList.toggle('hidden', view !== 'chart');
  listBtn?.classList.toggle('active', view === 'list');
  chartBtn?.classList.toggle('active', view === 'chart');

  const query = String(safeGet<HTMLInputElement>('myDirectorySearchInput')?.value || '');
  const filtered = filterDirectoryEmployees(cachedDirectory, query);

  if (view === 'list') {
    renderDirectoryList(filtered);
  } else {
    renderDirectoryChart(filtered);
  }
}

function bindDirectoryControls(): void {
  if (safeGet('myDirectoryPage')?.dataset.bound === '1') return;
  safeGet('myDirectoryPage')!.dataset.bound = '1';

  safeGet('myDirectoryViewListBtn')?.addEventListener('click', () => {
    setDirectoryView('list');
  });

  safeGet('myDirectoryViewChartBtn')?.addEventListener('click', () => {
    setDirectoryView('chart');
  });

  safeGet<HTMLInputElement>('myDirectorySearchInput')?.addEventListener('input', (event) => {
    const query = String((event.target as HTMLInputElement).value || '');
    const filtered = filterDirectoryEmployees(cachedDirectory, query);
    if (activeDirectoryView === 'list') {
      renderDirectoryList(filtered);
    } else {
      renderDirectoryChart(filtered);
    }
  });
}

export async function loadMyDirectoryPortal(): Promise<void> {
  if (!canAccessAppSection('myDirectoryView')) return;

  bindDirectoryControls();

  const list = safeGet('myDirectoryList');
  const chart = safeGet('myDirectoryChart');
  if (list) list.innerHTML = '<div class="muted">Loading directory…</div>';
  if (chart) chart.innerHTML = '<div class="muted">Loading org chart…</div>';

  try {
    cachedDirectory = await loadEmployeeDirectory();
    setDirectoryView(activeDirectoryView);
  } catch (err) {
    console.error('[MyDirectoryPortal]', err);
    if (list) list.innerHTML = '<div class="muted">Could not load the company directory.</div>';
    if (chart) chart.innerHTML = '<div class="muted">Could not load the org chart.</div>';
    showToast('Could not load directory.', 'error');
  }
}

window.loadMyDirectoryPortal = loadMyDirectoryPortal;
