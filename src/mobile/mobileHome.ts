import { isMobileLayout } from './mobileLayout';

export type StayInterviewMobileRow = {
  employeeId: string;
  name: string;
  department: string;
  nextInterview: string;
  statusLabel: string;
  statusClass: string;
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

export function renderMobileStayInterviewCards(rows: StayInterviewMobileRow[]): void {
  const list = document.getElementById('mobileStayInterviewList');
  if (!list) return;

  if (!isMobileLayout()) {
    list.classList.add('hidden');
    list.innerHTML = '';
    return;
  }

  list.classList.remove('hidden');

  if (!rows.length) {
    list.innerHTML =
      '<div class="orbis-mobile-empty muted">No stay interview schedule data available.</div>';
    return;
  }

  list.innerHTML = rows
    .map(
      (row) => `
    <button type="button" class="orbis-mobile-module-card" data-employee-id="${esc(row.employeeId)}">
      <div class="orbis-mobile-module-card-top">
        <span class="badge ${esc(row.statusClass)}">${esc(row.statusLabel)}</span>
      </div>
      <div class="orbis-mobile-module-card-title">${esc(row.name)}</div>
      <div class="orbis-mobile-module-card-meta">${esc(row.department || '—')} · Next: ${esc(row.nextInterview)}</div>
    </button>`
    )
    .join('');
}

function refreshMobileHomeLayout(): void {
  const dashboard = document.getElementById('dashboardTop');
  if (!dashboard) return;

  dashboard.classList.toggle('orbis-mobile-home', isMobileLayout());

  dashboard.querySelectorAll('.orbis-mobile-kpi-carousel').forEach((grid) => {
    grid.classList.remove('orbis-mobile-kpi-carousel');
  });
}

function bindMobileHomeEvents(): void {
  if ((window as { __mobileHomeBound?: boolean }).__mobileHomeBound) return;
  (window as { __mobileHomeBound?: boolean }).__mobileHomeBound = true;

  window.addEventListener('orbis:section-change', (event) => {
    const sectionId = (event as CustomEvent<{ sectionId?: string }>).detail?.sectionId;
    if (sectionId === 'dashboardView' || sectionId === 'myProfileView') {
      refreshMobileHomeLayout();
    }
  });

  window.addEventListener('orbis:layout-change', () => {
    refreshMobileHomeLayout();
  });

  document.getElementById('mobileStayInterviewList')?.addEventListener('click', (event) => {
    const button = (event.target as Element | null)?.closest<HTMLElement>('[data-employee-id]');
    const employeeId = button?.dataset.employeeId || '';
    if (!employeeId) return;
    event.preventDefault();
    document
      .querySelector<HTMLElement>(`#reviewDashboardBody [data-employee-id="${employeeId}"]`)
      ?.click();
  });
}

export function initMobileHome(): void {
  bindMobileHomeEvents();
  refreshMobileHomeLayout();
}

declare global {
  interface Window {
    renderMobileStayInterviewCards?: (rows: StayInterviewMobileRow[]) => void;
  }
}

window.renderMobileStayInterviewCards = renderMobileStayInterviewCards;
