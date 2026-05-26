import { supabaseClient } from '../services/supabaseClient';
import { isAdminUser } from '../services/access';
import { employeeDisplayName, type EmployeeLike } from '../services/employeeUtils';
import { switchMainView } from './navigation';

type CommandKind = 'action' | 'employee' | 'candidate';

type CommandItem = {
  id: string;
  kind: CommandKind;
  title: string;
  subtitle: string;
  searchText: string;
  run: () => void | Promise<void>;
};

type CandidateSearchRow = {
  id?: string;
  first_name?: string;
  last_name?: string;
  position?: string;
  stage?: string;
  email?: string;
};

declare global {
  interface Window {
    openCommandPalette?: () => void;
    closeCommandPalette?: () => void;
  }
}

const ACTION_COMMANDS: CommandItem[] = [
  {
    id: 'nav-dashboard',
    kind: 'action',
    title: 'Go to Dashboard',
    subtitle: 'Navigation',
    searchText: 'dashboard home kpi',
    run: () => switchMainView('dashboardView'),
  },
  {
    id: 'nav-employees',
    kind: 'action',
    title: 'Go to Employees',
    subtitle: 'Navigation',
    searchText: 'employees roster staff',
    run: () => switchMainView('employeesView'),
  },
  {
    id: 'nav-candidates',
    kind: 'action',
    title: 'Go to Candidate Pipeline',
    subtitle: 'Navigation',
    searchText: 'candidates pipeline hiring',
    run: () => switchMainView('candidatesView'),
  },
  {
    id: 'nav-documents',
    kind: 'action',
    title: 'Go to Documents',
    subtitle: 'Navigation',
    searchText: 'documents files library',
    run: () => switchMainView('documentsView'),
  },
  {
    id: 'nav-operations',
    kind: 'action',
    title: 'Go to Operations Center',
    subtitle: 'Navigation',
    searchText: 'operations issues resolution shipstation workflow equipment',
    run: () => switchMainView('operationsView'),
  },
  {
    id: 'nav-care-engagement',
    kind: 'action',
    title: 'Go to Care & Engagement',
    subtitle: 'Navigation',
    searchText: 'care engagement culture support recognition wellness matrix retention',
    run: () => switchMainView('careEngagementView'),
  },
  {
    id: 'nav-investigations',
    kind: 'action',
    title: 'Go to HR Investigations',
    subtitle: 'Navigation',
    searchText: 'investigations harassment complaint workplace investigation case',
    run: () => switchMainView('investigationsView'),
  },
  {
    id: 'action-new-investigation',
    kind: 'action',
    title: 'Open new investigation case',
    subtitle: 'Quick action',
    searchText: 'investigation case harassment complaint hr interview',
    run: async () => {
      switchMainView('investigationsView');
      if (typeof window.openNewInvestigationForm === 'function') {
        window.openNewInvestigationForm();
      }
    },
  },
  {
    id: 'nav-reports',
    kind: 'action',
    title: 'Go to Reports',
    subtitle: 'Navigation',
    searchText: 'reports analytics turnover metrics export',
    run: () => switchMainView('reportsView'),
  },
  {
    id: 'nav-settings',
    kind: 'action',
    title: 'Go to Admin & Settings',
    subtitle: 'Navigation',
    searchText: 'settings admin permissions audit configuration',
    run: () => switchMainView('settingsView'),
  },
  {
    id: 'action-new-operations-issue',
    kind: 'action',
    title: 'Report operational issue',
    subtitle: 'Quick action',
    searchText: 'operations issue bug bottleneck equipment software',
    run: async () => {
      switchMainView('operationsView');
      if (typeof window.openNewOperationsIssueForm === 'function') {
        window.openNewOperationsIssueForm();
      }
    },
  },
  {
    id: 'action-add-employee',
    kind: 'action',
    title: 'Add employee',
    subtitle: 'Quick action',
    searchText: 'new employee create hire',
    run: async () => {
      switchMainView('employeesView');

      if (typeof window.openNewEmployeeForm === 'function') {
        window.openNewEmployeeForm();
        return;
      }

      if (typeof window.openNewEmployeeDrawer === 'function') {
        window.openNewEmployeeDrawer();
      }
    },
  },
  {
    id: 'action-add-candidate',
    kind: 'action',
    title: 'Add candidate',
    subtitle: 'Quick action',
    searchText: 'new candidate create applicant',
    run: async () => {
      switchMainView('candidatesView');

      if (typeof window.openNewCandidateForm === 'function') {
        window.openNewCandidateForm();
      }
    },
  },
  {
    id: 'action-refresh',
    kind: 'action',
    title: 'Refresh dashboard',
    subtitle: 'Quick action',
    searchText: 'reload refresh sync data',
    run: async () => {
      if (typeof window.refreshOrbisWorkspace === 'function') {
        await window.refreshOrbisWorkspace();
      } else if (typeof window.loadAllDashboardData === 'function') {
        await window.loadAllDashboardData();
        return;
      }

      if (typeof window.loadEmployees === 'function') {
        await window.loadEmployees();
      }
    },
  },
];

let paletteMounted = false;
let paletteBound = false;
let paletteOpen = false;
let activeIndex = 0;
let filteredItems: CommandItem[] = [];
let candidateRows: CandidateSearchRow[] = [];
let candidatesLoading = false;

function isMacPlatform(): boolean {
  return /mac/i.test(navigator.platform || navigator.userAgent);
}

function shortcutLabel(): string {
  return isMacPlatform() ? '⌘K' : 'Ctrl+K';
}

function isAuthenticatedAppVisible(): boolean {
  const appView = document.getElementById('appView');

  return Boolean(appView && !appView.classList.contains('hidden'));
}

function isBlockingModalOpen(): boolean {
  return document.getElementById('orbisConfirmBackdrop')?.classList.contains('open') === true;
}

function normalizeSearchText(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function matchesQuery(searchText: string, query: string): boolean {
  const normalizedQuery = normalizeSearchText(query);

  if (!normalizedQuery) {
    return true;
  }

  const haystack = normalizeSearchText(searchText);

  return normalizedQuery.split(' ').every((token) => haystack.includes(token));
}

function scoreMatch(searchText: string, query: string): number {
  const normalizedQuery = normalizeSearchText(query);

  if (!normalizedQuery) {
    return 0;
  }

  const haystack = normalizeSearchText(searchText);

  if (haystack.startsWith(normalizedQuery)) {
    return 3;
  }

  if (haystack.includes(normalizedQuery)) {
    return 2;
  }

  if (matchesQuery(searchText, query)) {
    return 1;
  }

  return -1;
}

function getOverlay(): HTMLElement | null {
  return document.getElementById('commandPaletteOverlay');
}

function getInput(): HTMLInputElement | null {
  return document.getElementById('commandPaletteInput') as HTMLInputElement | null;
}

function getResults(): HTMLElement | null {
  return document.getElementById('commandPaletteResults');
}

function mountPaletteDom(): void {
  if (paletteMounted) {
    return;
  }

  paletteMounted = true;

  const overlay = document.createElement('div');
  overlay.id = 'commandPaletteOverlay';
  overlay.className = 'command-palette-overlay hidden';
  overlay.setAttribute('role', 'presentation');

  overlay.innerHTML = `
    <div
      class="command-palette"
      role="dialog"
      aria-modal="true"
      aria-labelledby="commandPaletteTitle"
    >
      <div class="command-palette-header">
        <span class="command-palette-icon" id="commandPaletteShortcut">${shortcutLabel()}</span>
        <input
          id="commandPaletteInput"
          type="search"
          autocomplete="off"
          spellcheck="false"
          aria-labelledby="commandPaletteTitle"
          aria-controls="commandPaletteResults"
          aria-autocomplete="list"
          placeholder="Search employees, candidates, or actions..."
        />
      </div>
      <div id="commandPaletteTitle" class="sr-only">Command palette</div>
      <div
        id="commandPaletteResults"
        class="command-palette-results"
        role="listbox"
        aria-label="Command results"
      ></div>
    </div>
  `;

  document.body.appendChild(overlay);

  const shortcut = document.getElementById('commandPaletteShortcut');
  if (shortcut) {
    shortcut.textContent = shortcutLabel();
  }
}

function getEmployeeCommands(): CommandItem[] {
  const employees = Array.isArray(window.EMPLOYEES) ? window.EMPLOYEES : [];

  return employees.map((employee) => {
    const record = employee as EmployeeLike & Record<string, unknown>;
    const name = employeeDisplayName(record);
    const employeeId = String(
      record.displayId ||
        record.employee_id ||
        record.employeeId ||
        record.id ||
        ''
    ).trim();
    const department = String(record.department || record.dept || '').trim();
    const position = String(record.position || '').trim();
    const drawerId = String(record.dbId || record.id || employeeId).trim();

    return {
      id: `employee-${drawerId}`,
      kind: 'employee',
      title: name,
      subtitle: [employeeId, department, position].filter(Boolean).join(' · ') || 'Employee',
      searchText: [name, employeeId, department, position, String(record.supervisor || '')]
        .filter(Boolean)
        .join(' '),
      run: async () => {
        switchMainView('employeesView');

        if (typeof window.openEmployeeDrawer === 'function' && drawerId) {
          await window.openEmployeeDrawer(drawerId);
        }
      },
    };
  });
}

function getCandidateCommands(): CommandItem[] {
  return candidateRows.map((candidate) => {
    const candidateId = String(candidate.id || '').trim();
    const name =
      `${candidate.first_name || ''} ${candidate.last_name || ''}`.trim() || 'Unnamed candidate';
    const stage = String(candidate.stage || '').trim();
    const position = String(candidate.position || '').trim();

    return {
      id: `candidate-${candidateId}`,
      kind: 'candidate',
      title: name,
      subtitle: [stage, position].filter(Boolean).join(' · ') || 'Candidate',
      searchText: [name, stage, position, candidate.email || ''].filter(Boolean).join(' '),
      run: async () => {
        switchMainView('candidatesView');

        if (typeof window.openCandidateDrawer === 'function' && candidateId) {
          await window.openCandidateDrawer(candidateId);
        }
      },
    };
  });
}

function collectCandidateRowsFromDom(): CandidateSearchRow[] {
  const rows = document.querySelectorAll<HTMLElement>('[data-candidate-id]');

  return Array.from(rows)
    .map((row) => {
      const id = String(row.dataset.candidateId || '').trim();
      const link = row.querySelector<HTMLElement>('[data-edit-candidate-id]');

      if (!id) {
        return null;
      }

      const title = (link?.textContent || row.textContent || '').trim();

      return {
        id,
        first_name: title,
        stage: row.querySelector('td:nth-child(3)')?.textContent?.trim() || '',
        position: row.querySelector('td:nth-child(2)')?.textContent?.trim() || '',
      } satisfies CandidateSearchRow;
    })
    .filter((row): row is CandidateSearchRow => Boolean(row?.id));
}

async function refreshCandidateIndex(): Promise<void> {
  const domRows = collectCandidateRowsFromDom();

  if (domRows.length) {
    candidateRows = domRows;
    return;
  }

  candidatesLoading = true;

  try {
    const { data, error } = await supabaseClient
      .from('candidates')
      .select('id, first_name, last_name, position, stage, email')
      .neq('stage', 'Hired')
      .order('created_at', { ascending: false })
      .limit(250);

    if (error) {
      console.warn('[CommandPalette] Could not load candidates:', error);
      candidateRows = [];
      return;
    }

    candidateRows = (data || []) as CandidateSearchRow[];
  } finally {
    candidatesLoading = false;
  }
}

function getNavigationCommands(): CommandItem[] {
  const adminOnlyIds = new Set([
    'nav-care-engagement',
    'nav-investigations',
    'action-new-investigation',
    'nav-reports',
    'nav-settings',
  ]);

  if (isAdminUser()) {
    return ACTION_COMMANDS;
  }

  return ACTION_COMMANDS.filter((command) => !adminOnlyIds.has(command.id));
}

function buildCommandList(query: string): CommandItem[] {
  try {
    const combined = [
      ...getNavigationCommands(),
      ...getEmployeeCommands(),
      ...getCandidateCommands(),
    ];

    const ranked = combined
      .map((item) => ({
        item,
        score: scoreMatch(item.searchText || item.title || '', query),
      }))
      .filter((entry) => entry.score >= 0)
      .sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }

        if (a.item.kind !== b.item.kind) {
          const kindOrder: Record<CommandKind, number> = {
            action: 0,
            employee: 1,
            candidate: 2,
          };

          return kindOrder[a.item.kind] - kindOrder[b.item.kind];
        }

        return String(a.item.title || '').localeCompare(String(b.item.title || ''));
      })
      .map((entry) => entry.item);

    return ranked.slice(0, 40);
  } catch (error) {
    console.error('[CommandPalette] Failed to build command list:', error);
    return ACTION_COMMANDS;
  }
}

function renderResults(): void {
  const results = getResults();

  if (!results) {
    return;
  }

  if (!filteredItems.length) {
    const emptyMessage = candidatesLoading
      ? 'Loading candidates...'
      : 'No matching commands. Try an employee name, candidate, or "dashboard".';

    results.innerHTML = `<div class="command-palette-empty">${emptyMessage}</div>`;
    return;
  }

  results.innerHTML = filteredItems
    .map((item, index) => {
      const activeClass = index === activeIndex ? ' active' : '';
      const kindLabel =
        item.kind === 'employee' ? 'Employee' : item.kind === 'candidate' ? 'Candidate' : 'Action';

      return `
        <button
          type="button"
          class="command-palette-item${activeClass}"
          role="option"
          aria-selected="${index === activeIndex ? 'true' : 'false'}"
          data-command-index="${index}"
        >
          <span aria-hidden="true">${kindLabel === 'Employee' ? '👤' : kindLabel === 'Candidate' ? '📋' : '⚡'}</span>
          <span>
            <strong>${escapeHtml(item.title)}</strong>
            <small>${escapeHtml(item.subtitle)}</small>
          </span>
        </button>
      `;
    })
    .join('');
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function setActiveIndex(nextIndex: number): void {
  if (!filteredItems.length) {
    activeIndex = 0;
    renderResults();
    return;
  }

  const max = filteredItems.length - 1;
  activeIndex = Math.max(0, Math.min(nextIndex, max));
  renderResults();

  const activeEl = document.querySelector<HTMLElement>(
    `[data-command-index="${activeIndex}"]`
  );

  activeEl?.scrollIntoView({ block: 'nearest' });
}

function applyFilter(query: string): void {
  filteredItems = buildCommandList(query);
  activeIndex = 0;
  renderResults();
}

async function runActiveCommand(): Promise<void> {
  const item = filteredItems[activeIndex];

  if (!item) {
    return;
  }

  closeCommandPalette();

  try {
    await item.run();
  } catch (error) {
    console.error('[CommandPalette] Command failed:', error);

    if (typeof window.showToast === 'function') {
      window.showToast('That command could not be completed.', 'error');
    }
  }
}

export function openCommandPalette(): void {
  if (!isAuthenticatedAppVisible() || isBlockingModalOpen()) {
    return;
  }

  try {
    mountPaletteDom();

    const overlay = getOverlay();
    const input = getInput();

    if (!overlay || !input) {
      return;
    }

    paletteOpen = true;
    overlay.classList.remove('hidden');
    document.body.classList.add('orbis-modal-open');

    candidateRows = [];
    applyFilter('');

    void refreshCandidateIndex().then(() => {
      if (!paletteOpen) {
        return;
      }

      applyFilter(input.value || '');
    });

    requestAnimationFrame(() => {
      input.value = '';
      input.focus();
      input.select();
    });
  } catch (error) {
    console.error('[CommandPalette] Could not open:', error);
    paletteOpen = false;

    if (typeof window.showToast === 'function') {
      window.showToast('Command palette is unavailable right now.', 'error');
    }
  }
}

export function closeCommandPalette(): void {
  const overlay = getOverlay();
  const input = getInput();

  paletteOpen = false;
  overlay?.classList.add('hidden');
  document.body.classList.remove('orbis-modal-open');

  if (input) {
    input.value = '';
  }

  filteredItems = [];
  activeIndex = 0;
}

function bindCommandPaletteEvents(): void {
  if (paletteBound) {
    return;
  }

  paletteBound = true;
  mountPaletteDom();

  const overlay = getOverlay();
  const input = getInput();
  const results = getResults();

  overlay?.addEventListener('click', (event) => {
    if (event.target === overlay) {
      closeCommandPalette();
    }
  });

  input?.addEventListener('input', () => {
    applyFilter(input.value);
  });

  input?.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex(activeIndex + 1);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex(activeIndex - 1);
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      setActiveIndex(filteredItems.length - 1);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      void runActiveCommand();
    }
  });

  results?.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement | null)?.closest<HTMLElement>(
      '[data-command-index]'
    );

    if (!button) {
      return;
    }

    const index = Number(button.dataset.commandIndex);

    if (Number.isNaN(index)) {
      return;
    }

    activeIndex = index;
    void runActiveCommand();
  });

  results?.addEventListener('mousemove', (event) => {
    const button = (event.target as HTMLElement | null)?.closest<HTMLElement>(
      '[data-command-index]'
    );

    if (!button) {
      return;
    }

    const index = Number(button.dataset.commandIndex);

    if (!Number.isNaN(index) && index !== activeIndex) {
      activeIndex = index;
      renderResults();
    }
  });

  document.addEventListener('keydown', (event) => {
    const key = String(event.key || '').toLowerCase();

    if (!key) {
      return;
    }

    const modifier = isMacPlatform() ? event.metaKey : event.ctrlKey;

    if (modifier && key === 'k') {
      event.preventDefault();

      if (paletteOpen) {
        closeCommandPalette();
      } else {
        openCommandPalette();
      }

      return;
    }

    if (event.key === 'Escape' && paletteOpen) {
      event.preventDefault();
      closeCommandPalette();
    }
  });
}

bindCommandPaletteEvents();

window.openCommandPalette = openCommandPalette;
window.closeCommandPalette = closeCommandPalette;
