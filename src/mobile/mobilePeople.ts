import { isMobileLayout } from './mobileLayout';

type RosterEmployee = Record<string, unknown> & {
  dbId?: string;
  id?: string;
  employee_id?: string;
  displayName?: string;
  displayDepartment?: string;
  displayPosition?: string;
  displaySupervisor?: string;
  displayStatus?: string;
  displayStatusLabel?: string;
  displayTerminationDate?: string;
  termination_date?: string;
  terminationDate?: string;
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

function statusBadgeClass(status: unknown): string {
  if (typeof window.statusBadge === 'function') {
    return window.statusBadge(status);
  }
  return 'badge badge-inactive';
}

function formatTerminationDate(employee: RosterEmployee): string {
  const raw =
    employee.displayTerminationDate || employee.termination_date || employee.terminationDate || '';
  if (!raw) return '';
  if (typeof window.fmtDate === 'function') {
    return window.fmtDate(raw);
  }
  return String(raw);
}

function updateMobileFilterButtonState(): void {
  const button = document.getElementById('mobileRosterFilterBtn');
  if (!button) return;

  const dept = (document.getElementById('deptFilter') as HTMLSelectElement | null)?.value || '';
  const status = (document.getElementById('statusFilter') as HTMLSelectElement | null)?.value || '';
  const mode = String(window.rosterViewMode || 'active');
  let count = 0;
  if (dept) count += 1;
  if (status) count += 1;
  if (mode === 'former') count += 1;

  button.classList.toggle('has-active-filters', count > 0);
  button.setAttribute('data-filter-count', count > 0 ? String(count) : '0');
  button.setAttribute(
    'aria-label',
    count > 0 ? `Roster filters, ${count} active` : 'Roster filters'
  );
}

function syncMobileRosterModeFromDesktop(): void {
  const mode = String(window.rosterViewMode || 'active');
  document
    .querySelectorAll<HTMLButtonElement>('#orbisMobileRosterViewToggle [data-mobile-roster-mode]')
    .forEach((button) => {
      const active = button.dataset.mobileRosterMode === mode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
}

function applyMobileRosterModeToDesktop(mode: string): void {
  window.rosterViewMode = mode;
  const tab = document.querySelector(
    `#rosterViewTabs [data-roster-mode="${mode}"]`
  ) as HTMLButtonElement | null;
  if (tab) {
    tab.click();
    return;
  }
  if (typeof window.renderEmployeeRoster === 'function') {
    window.renderEmployeeRoster();
  } else {
    renderMobileEmployeeRoster();
  }
}

function getFilteredEmployees(): RosterEmployee[] {
  if (typeof window.getFilteredRosterEmployees === 'function') {
    return window.getFilteredRosterEmployees();
  }
  return Array.isArray(window.currentFilteredEmployees) ? window.currentFilteredEmployees : [];
}

function employeeInitials(name: string): string {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase();
}

function renderRosterSkeleton(): void {
  const list = document.getElementById('mobileEmployeeRosterList');
  if (!list) return;

  list.innerHTML = Array.from({ length: 6 })
    .map(
      () => `
    <div class="orbis-mobile-roster-card orbis-mobile-roster-card--skeleton" aria-hidden="true">
      <div class="orbis-mobile-roster-avatar skeleton-block"></div>
      <div class="orbis-mobile-roster-body">
        <div class="skeleton-block skeleton-line skeleton-line--lg"></div>
        <div class="skeleton-block skeleton-line"></div>
        <div class="skeleton-block skeleton-line skeleton-line--sm"></div>
      </div>
    </div>`
    )
    .join('');
}

export function renderMobileEmployeeRoster(): void {
  const list = document.getElementById('mobileEmployeeRosterList');
  if (!list) return;

  if (!isMobileLayout()) {
    list.innerHTML = '';
    list.classList.add('hidden');
    return;
  }

  list.classList.remove('hidden');

  const employees = Array.isArray((window as { EMPLOYEES?: RosterEmployee[] }).EMPLOYEES)
    ? (window as { EMPLOYEES?: RosterEmployee[] }).EMPLOYEES!
    : null;
  const countText = document.getElementById('empCount')?.textContent || '';
  if (!employees && /loading/i.test(countText)) {
    renderRosterSkeleton();
    return;
  }
  if (!employees) {
    list.innerHTML = '<div class="orbis-mobile-empty muted">Employee roster is not loaded yet.</div>';
    return;
  }

  const filtered = getFilteredEmployees();
  const isFormerView = String(window.rosterViewMode || 'active') === 'former';

  const countEl = document.getElementById('empCount');
  if (countEl) {
    const total = employees.length;
    countEl.textContent = `Showing ${filtered.length} of ${total} employee${total === 1 ? '' : 's'}`;
  }

  if (!filtered.length) {
    list.innerHTML = `
      <div class="orbis-mobile-empty">
        <strong>No employees found</strong>
        <p class="muted">Try adjusting your search or filters.</p>
      </div>`;
    return;
  }

  list.innerHTML = filtered
    .map((employee) => {
      const recordId = String(employee.dbId || employee.id || employee.employee_id || '').trim();
      const name = String(employee.displayName || 'Employee');
      const dept = String(employee.displayDepartment || '—');
      const position = String(employee.displayPosition || '—');
      const supervisor = String(employee.displaySupervisor || '').trim();
      const statusLabel = String(employee.displayStatusLabel || employee.displayStatus || 'Active');
      const badge = statusBadgeClass(employee.displayStatus);
      const terminationDate = isFormerView ? formatTerminationDate(employee) : '';

      return `
        <button
          type="button"
          class="orbis-mobile-roster-card${isFormerView ? ' orbis-mobile-roster-card--former' : ''}"
          data-employee-id="${esc(recordId)}"
          aria-label="Open ${esc(name)}"
        >
          <div class="orbis-mobile-roster-avatar" aria-hidden="true">${esc(employeeInitials(name))}</div>
          <div class="orbis-mobile-roster-body">
            <div class="orbis-mobile-roster-top">
              <span class="orbis-mobile-roster-name">${esc(name)}</span>
              <span class="${esc(badge)}">${esc(statusLabel)}</span>
            </div>
            <div class="orbis-mobile-roster-meta">${esc(position)} · ${esc(dept)}</div>
            ${supervisor ? `<div class="orbis-mobile-roster-sub muted">Supervisor: ${esc(supervisor)}</div>` : ''}
            ${terminationDate ? `<div class="orbis-mobile-roster-sub muted">Terminated: ${esc(terminationDate)}</div>` : ''}
          </div>
          <span class="orbis-mobile-roster-chevron" aria-hidden="true">›</span>
        </button>`;
    })
    .join('');

  updateMobileFilterButtonState();
}

function syncMobileFilterSelectsFromDesktop(): void {
  const dept = document.getElementById('deptFilter') as HTMLSelectElement | null;
  const status = document.getElementById('statusFilter') as HTMLSelectElement | null;
  const mobileDept = document.getElementById('orbisMobileDeptFilter') as HTMLSelectElement | null;
  const mobileStatus = document.getElementById('orbisMobileStatusFilter') as HTMLSelectElement | null;

  if (dept && mobileDept) {
    mobileDept.innerHTML = dept.innerHTML;
    mobileDept.value = dept.value;
  }

  if (status && mobileStatus) {
    mobileStatus.value = status.value;
  }

  syncMobileRosterModeFromDesktop();
}

function applyMobileFilterSelectsToDesktop(): void {
  const dept = document.getElementById('deptFilter') as HTMLSelectElement | null;
  const status = document.getElementById('statusFilter') as HTMLSelectElement | null;
  const mobileDept = document.getElementById('orbisMobileDeptFilter') as HTMLSelectElement | null;
  const mobileStatus = document.getElementById('orbisMobileStatusFilter') as HTMLSelectElement | null;
  const activeMode =
    document.querySelector<HTMLButtonElement>(
      '#orbisMobileRosterViewToggle [data-mobile-roster-mode].active'
    )?.dataset.mobileRosterMode || 'active';

  if (dept && mobileDept) {
    dept.value = mobileDept.value;
    dept.dispatchEvent(new Event('change', { bubbles: true }));
  }

  if (status && mobileStatus) {
    status.value = mobileStatus.value;
    status.dispatchEvent(new Event('change', { bubbles: true }));
  }

  applyMobileRosterModeToDesktop(activeMode);
}

function openRosterFilterSheet(): void {
  const sheet = document.getElementById('orbisMobileRosterFilterSheet');
  if (!sheet) return;
  syncMobileFilterSelectsFromDesktop();
  sheet.classList.add('open');
  sheet.setAttribute('aria-hidden', 'false');
  document.body.classList.add('orbis-mobile-sheet-open');
}

function closeRosterFilterSheet(): void {
  const sheet = document.getElementById('orbisMobileRosterFilterSheet');
  if (!sheet) return;
  sheet.classList.remove('open');
  sheet.setAttribute('aria-hidden', 'true');
  if (!document.getElementById('orbisMobileMoreSheet')?.classList.contains('open')) {
    document.body.classList.remove('orbis-mobile-sheet-open');
  }
}

async function refreshRosterFromPull(): Promise<void> {
  const indicator = document.getElementById('mobileRosterPullIndicator');
  indicator?.classList.add('refreshing');

  try {
    if (typeof window.loadEmployees === 'function') {
      await window.loadEmployees();
    } else if (typeof window.renderEmployeeRoster === 'function') {
      window.renderEmployeeRoster();
    }
  } finally {
    indicator?.classList.remove('refreshing', 'visible');
  }
}

function bindPullToRefresh(): void {
  const scrollRoot = document.getElementById('orbisAppMain');
  const indicator = document.getElementById('mobileRosterPullIndicator');
  if (!scrollRoot || scrollRoot.dataset.pullBound === '1') return;
  scrollRoot.dataset.pullBound = '1';

  let startY = 0;
  let pullDistance = 0;
  let tracking = false;

  scrollRoot.addEventListener(
    'touchstart',
    (event) => {
      if (!isMobileLayout()) return;
      if (window.currentMainView !== 'employeesView') return;
      if (scrollRoot.scrollTop > 0) return;
      startY = event.touches[0]?.clientY ?? 0;
      tracking = true;
      pullDistance = 0;
    },
    { passive: true }
  );

  scrollRoot.addEventListener(
    'touchmove',
    (event) => {
      if (!tracking || !isMobileLayout()) return;
      const currentY = event.touches[0]?.clientY ?? 0;
      pullDistance = Math.max(0, currentY - startY);
      if (pullDistance > 8) {
        indicator?.classList.add('visible');
        indicator?.style.setProperty('--pull-offset', `${Math.min(pullDistance, 80)}px`);
      }
    },
    { passive: true }
  );

  scrollRoot.addEventListener(
    'touchend',
    async () => {
      if (!tracking) return;
      tracking = false;
      const shouldRefresh = pullDistance > 72;
      pullDistance = 0;
      if (shouldRefresh && isMobileLayout() && window.currentMainView === 'employeesView') {
        await refreshRosterFromPull();
      } else {
        indicator?.classList.remove('visible');
      }
    },
    { passive: true }
  );
}

function bindRosterFilterSheet(): void {
  document.getElementById('mobileRosterFilterBtn')?.addEventListener('click', () => {
    openRosterFilterSheet();
  });

  document.getElementById('orbisMobileRosterFilterClose')?.addEventListener('click', () => {
    closeRosterFilterSheet();
  });

  document.getElementById('orbisMobileRosterFilterBackdrop')?.addEventListener('click', () => {
    closeRosterFilterSheet();
  });

  document.getElementById('orbisMobileRosterFilterApply')?.addEventListener('click', () => {
    applyMobileFilterSelectsToDesktop();
    closeRosterFilterSheet();
    if (typeof window.renderEmployeeRoster === 'function') {
      window.renderEmployeeRoster();
    } else {
      renderMobileEmployeeRoster();
    }
  });

  document.getElementById('orbisMobileRosterFilterClear')?.addEventListener('click', () => {
    const dept = document.getElementById('deptFilter') as HTMLSelectElement | null;
    const status = document.getElementById('statusFilter') as HTMLSelectElement | null;
    const mobileDept = document.getElementById('orbisMobileDeptFilter') as HTMLSelectElement | null;
    const mobileStatus = document.getElementById('orbisMobileStatusFilter') as HTMLSelectElement | null;
    if (dept) dept.value = '';
    if (status) status.value = '';
    if (mobileDept) mobileDept.value = '';
    if (mobileStatus) mobileStatus.value = '';
    if (typeof window.renderEmployeeRoster === 'function') {
      window.renderEmployeeRoster();
    } else {
      renderMobileEmployeeRoster();
    }
    closeRosterFilterSheet();
  });

  document.getElementById('orbisMobileRosterViewToggle')?.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>(
      '[data-mobile-roster-mode]'
    );
    if (!button) return;
    event.preventDefault();

    document
      .querySelectorAll<HTMLButtonElement>('#orbisMobileRosterViewToggle [data-mobile-roster-mode]')
      .forEach((el) => {
        const active = el === button;
        el.classList.toggle('active', active);
        el.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
  });
}

function bindMobileRosterEvents(): void {
  if ((window as { __mobilePeopleBound?: boolean }).__mobilePeopleBound) return;
  (window as { __mobilePeopleBound?: boolean }).__mobilePeopleBound = true;

  const rosterList = document.getElementById('mobileEmployeeRosterList');
  rosterList?.addEventListener('click', (event) => {
    if (!isMobileLayout()) return;
    const card = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-employee-id]');
    if (!card) return;
    const employeeId = String(card.dataset.employeeId || '').trim();
    if (!employeeId) return;
    event.preventDefault();
    if (typeof window.openDrawerByEmployeeId === 'function') {
      void window.openDrawerByEmployeeId(employeeId);
    }
  });

  const searchInput = document.getElementById('globalSearch');
  searchInput?.addEventListener('input', () => {
    if (!isMobileLayout()) return;
    renderMobileEmployeeRoster();
  });

  document.getElementById('deptFilter')?.addEventListener('change', () => {
    if (!isMobileLayout()) return;
    renderMobileEmployeeRoster();
  });

  document.getElementById('statusFilter')?.addEventListener('change', () => {
    if (!isMobileLayout()) return;
    renderMobileEmployeeRoster();
  });

  const rosterTabs = document.getElementById('rosterViewTabs');
  rosterTabs?.addEventListener('click', () => {
    if (!isMobileLayout()) return;
    window.setTimeout(() => {
      syncMobileRosterModeFromDesktop();
      updateMobileFilterButtonState();
      renderMobileEmployeeRoster();
    }, 0);
  });

  window.addEventListener('orbis:layout-change', () => {
    renderMobileEmployeeRoster();
  });

  window.addEventListener('orbis:section-change', (event) => {
    const sectionId = (event as CustomEvent<{ sectionId?: string }>).detail?.sectionId;
    if (sectionId === 'employeesView') {
      renderMobileEmployeeRoster();
    }
  });

  bindPullToRefresh();
  bindRosterFilterSheet();
}

export function initMobilePeople(): void {
  bindMobileRosterEvents();
  renderMobileEmployeeRoster();
}

window.renderMobileEmployeeRoster = renderMobileEmployeeRoster;
