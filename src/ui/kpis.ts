import { getEmployeeById, loadEmployees } from '../modules/employees';
import { supabaseClient } from '../services/supabaseClient';
import { hideKpiRetryBanner, showKpiRetryBanner } from './dashboardRetry';
import {
  compareEmployeesByDueDateAsc,
  daysUntilDate,
  employeeDisplayName,
  formatDueDateLabel,
  formatEmployeeDueDateLine,
  getEmployeeNextStayInterviewDueDate,
  isActiveDashboardEmployee,
} from '../services/employeeUtils';
import { hasActiveImpactMeta, hasActiveRiskMeta } from './badges';
import {
  buildHrIntelligenceContext,
  computeTurnoverRiskPercentage,
  enrichAtRiskMetaFromContext,
  isOpenInvestigationStatus,
  isOpenOperationsIssue,
  isTurnoverRiskContributor,
} from '../services/hrIntelligence';

interface KpiEmployeeRecord {
  id?: string;
  dbId?: string;
  employee_id?: string;
  first?: string;
  last?: string;
  first_name?: string;
  last_name?: string;
  preferred_name?: string;
  displayName?: string;
  name?: string;
  status?: string;
  displayStatus?: string;
  employee_status?: string;
  hire_date?: string;
  hireDate?: string | Date | null;
  termination_date?: string;
  department?: string;
  position?: string;
  pay_type?: string;
  payType?: string;
  dept?: string;
  nextReview?: string | Date | null;
  next_review_date?: string;
  first?: string;
  last?: string;
  tenure_months?: number | string;
  tenureMonths?: number | string;
  at_risk?: boolean;
  impact_player?: boolean;
  is_impact_player?: boolean;
  impactPlayer?: boolean;
  [key: string]: unknown;
}

type KpiMetric = {
  id: string;
  label: string;
  value: string | number;
  helper?: string;
};

type AtRiskMeta = {
  lowReview?: boolean;
  disciplineRisk?: boolean;
  openIncidentCount?: number;
  manualReason?: string;
  reviewScore?: number | null;
  flaggedDate?: string;
  flaggedBy?: string;
  openInvestigation?: boolean;
  stayInterviewOverdue?: boolean;
  operationsPressure?: boolean;
};

type ImpactPlayerMeta = {
  manualReason?: string;
  highReview?: boolean;
  reviewScore?: number | null;
  flaggedDate?: string;
  flaggedBy?: string;
};

type LatestReviewEntry = {
  avgScore: number | null;
  sortDate: string;
};

declare global {
  interface Window {
    EMPLOYEES?: KpiEmployeeRecord[];
    ALL_EMPLOYEES?: KpiEmployeeRecord[];
    currentEmployeeRoster?: KpiEmployeeRecord[];
    renderBasicDashboardKpis?: (employees?: KpiEmployeeRecord[]) => void;
    refreshDashboardKpis?: (employees?: KpiEmployeeRecord[]) => void;
    renderKpiEmployeeMetrics?: () => void;
    refreshTurnoverKpisFromSupabase?: () => Promise<void>;
    buildKpiHoverDetails?: () => void;
    initKpiHoverUi?: () => void;
    syncKpiCardTooltip?: (card: Element | null, text: string) => void;
    updateTurnoverRiskKpi?: (rate: number, subtext: string) => void;
    currentImpactPlayerRosterMap?: Record<string, ImpactPlayerMeta>;
    currentAtRiskRosterMap?: Record<string, AtRiskMeta>;
    hrIntelligenceContext?: import('../services/hrIntelligence').HrIntelligenceContext;
    loadSummaryMetrics?: () => Promise<void>;
    compareText?: (a: unknown, b: unknown) => number;
    safeSet?: (id: string, value: unknown) => void;
    setText?: (id: string, value: unknown) => void;
  }
}

function safeGet<T extends HTMLElement = HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function getEmployeeKey(employee: KpiEmployeeRecord): string {
  return String(employee.id || employee.employee_id || '');
}

function isImpactPlayer(employee: KpiEmployeeRecord): boolean {
  const key = getEmployeeKey(employee);

  return Boolean(
    employee.impact_player ||
      employee.is_impact_player ||
      employee.impactPlayer ||
      (key && window.currentImpactPlayerRosterMap?.[key])
  );
}

function isAtRisk(employee: KpiEmployeeRecord): boolean {
  const key = getEmployeeKey(employee);

  return Boolean(
    employee.at_risk ||
      (key && window.currentAtRiskRosterMap?.[key])
  );
}

function daysBetween(startDate: string, endDate: Date = new Date()): number | null {
  if (!startDate) return null;

  const start = new Date(startDate);
  if (Number.isNaN(start.getTime())) return null;

  const diffMs = endDate.getTime() - start.getTime();
  return Math.max(0, Math.floor(diffMs / 86_400_000));
}

function calculateAverageTenureYears(employees: KpiEmployeeRecord[]): string {
  const activeEmployees = employees.filter(isActiveDashboardEmployee);

  const tenureDays = activeEmployees
    .map((employee) => daysBetween(String(employee.hire_date || '')))
    .filter((days): days is number => Number.isFinite(days));

  if (!tenureDays.length) return '0.0';

  const averageDays = tenureDays.reduce((sum, days) => sum + days, 0) / tenureDays.length;
  return (averageDays / 365).toFixed(1);
}

function getAnniversariesNext30Days(employees: KpiEmployeeRecord[]): KpiEmployeeRecord[] {
  const today = new Date();
  const currentYear = today.getFullYear();

  return employees.filter((employee) => {
    if (!isActiveDashboardEmployee(employee) || !employee.hire_date) return false;

    const hireDate = new Date(employee.hire_date);
    if (Number.isNaN(hireDate.getTime())) return false;

    const anniversary = new Date(currentYear, hireDate.getMonth(), hireDate.getDate());

    if (anniversary < today) {
      anniversary.setFullYear(currentYear + 1);
    }

    const daysUntil = Math.ceil((anniversary.getTime() - today.getTime()) / 86_400_000);
    return daysUntil >= 0 && daysUntil <= 30;
  });
}

function getTurnoverYtd(employees: KpiEmployeeRecord[]): string {
  const currentYear = new Date().getFullYear();
  const activeCount = employees.filter(isActiveDashboardEmployee).length;

  const ytdSeparations = employees.filter((employee) => {
    if (!employee.termination_date) return false;

    const date = new Date(employee.termination_date);
    return !Number.isNaN(date.getTime()) && date.getFullYear() === currentYear;
  }).length;

  if (!activeCount && !ytdSeparations) return '0%';

  const denominator = activeCount + ytdSeparations;
  return `${Math.round((ytdSeparations / denominator) * 100)}%`;
}

function buildKpiMetrics(employees: KpiEmployeeRecord[]): KpiMetric[] {
  const activeEmployees = employees.filter(isActiveDashboardEmployee);
  const atRiskEmployees = activeEmployees.filter(isAtRisk);
  const impactPlayers = activeEmployees.filter(isImpactPlayer);
  const anniversaries = getAnniversariesNext30Days(activeEmployees);

  return [
    {
      id: 'kHeadcount',
      label: 'Active Headcount',
      value: activeEmployees.length,
      helper: 'Currently active employees',
    },
    {
      id: 'kFte',
      label: 'FTE',
      value: activeEmployees.length,
      helper: 'Estimated full-time equivalent headcount',
    },
    {
      id: 'kAvgTenure',
      label: 'Avg Tenure',
      value: calculateAverageTenureYears(activeEmployees),
      helper: 'Average tenure in years',
    },
    {
      id: 'kAnniversaries',
      label: 'Anniversaries',
      value: anniversaries.length,
      helper: 'Upcoming in the next 30 days',
    },
    {
      id: 'kTurnover',
      label: 'Turnover YTD',
      value: getTurnoverYtd(employees),
      helper: 'Year-to-date separations',
    },
    {
      id: 'kAtRisk',
      label: 'At-Risk Employees',
      value: atRiskEmployees.length,
      helper: atRiskEmployees.map(employeeDisplayName).join(', ') || 'No current at-risk employees',
    },
    {
      id: 'kImpactPlayers',
      label: 'Impact Players',
      value: impactPlayers.length,
      helper: impactPlayers.map(employeeDisplayName).join(', ') || 'No current impact players',
    },
  ];
}

function renderKpiCard(metric: KpiMetric): string {
  return `
    <div class="kpi-card" data-kpi-id="${escapeHtml(metric.id)}" data-tooltip="${escapeHtml(metric.helper || '')}">
      <span class="kpi-label">${escapeHtml(metric.label)}</span>
      <strong id="${escapeHtml(metric.id)}">${escapeHtml(metric.value)}</strong>
      ${metric.helper ? `<small>${escapeHtml(metric.helper)}</small>` : ''}
    </div>
  `;
}

function findKpiContainer(): HTMLElement | null {
  return (
    safeGet('kpiGrid') ||
    safeGet('dashboardKpis') ||
    safeGet('summaryKpis') ||
    safeGet('executiveKpis')
  );
}

function getKpiRoster(employees?: KpiEmployeeRecord[]): KpiEmployeeRecord[] {
  if (Array.isArray(employees) && employees.length) {
    return employees;
  }

  // Prefer access-scoped roster (supervisor team or full company for admins).
  const scopedEmployees = (window as { EMPLOYEES?: KpiEmployeeRecord[] }).EMPLOYEES;

  if (Array.isArray(scopedEmployees)) {
    return scopedEmployees;
  }

  if (Array.isArray(window.currentEmployeeRoster) && window.currentEmployeeRoster.length) {
    return window.currentEmployeeRoster;
  }

  return [];
}

export function renderBasicDashboardKpis(employees?: KpiEmployeeRecord[]): void {
  const roster = getKpiRoster(employees);
  const metrics = buildKpiMetrics(roster);
  const container = findKpiContainer();

  if (container) {
    container.innerHTML = metrics.map(renderKpiCard).join('');
    updateTurnoverRateKpis(roster);
    buildKpiHoverDetails();
    return;
  }

  metrics.forEach((metric) => {
    const el = safeGet(metric.id);
    if (el) {
      el.textContent = String(metric.value);
      el.setAttribute('title', metric.helper || '');
    }
  });

  updateTurnoverRateKpis(roster);
}

export function refreshDashboardKpis(employees?: KpiEmployeeRecord[]): void {
  renderBasicDashboardKpis(employees);
}

function compareKpiText(a: unknown, b: unknown): number {
  if (typeof window.compareText === 'function') {
    return window.compareText(a, b);
  }

  return String(a ?? '').localeCompare(String(b ?? ''));
}

function setKpiText(id: string, value: unknown): void {
  if (typeof window.safeSet === 'function') {
    window.safeSet(id, value);
    return;
  }

  if (typeof window.setText === 'function') {
    window.setText(id, value);
    return;
  }

  const element = safeGet(id);

  if (element) {
    element.textContent = String(value ?? '');
  }
}

function getKpiEmployees(): KpiEmployeeRecord[] {
  if (Array.isArray(window.ALL_EMPLOYEES) && window.ALL_EMPLOYEES.length) {
    return window.ALL_EMPLOYEES;
  }

  return getKpiRoster();
}

/** Scoped roster for dashboard headcount / review KPIs (not company-wide ALL_EMPLOYEES). */
function getDashboardKpiEmployees(): KpiEmployeeRecord[] {
  return getKpiRoster();
}

function isOnLeaveStatus(status: string): boolean {
  return status === 'LEAVE' || status === 'ON LEAVE';
}

function getEmployeeNextReviewDate(employee: KpiEmployeeRecord): Date | null {
  return getEmployeeNextStayInterviewDueDate(employee);
}

function sortOverdueStayInterviewEmployees(
  employees: KpiEmployeeRecord[]
): KpiEmployeeRecord[] {
  return [...employees].sort((left, right) =>
    compareEmployeesByDueDateAsc(left, right, getEmployeeNextStayInterviewDueDate)
  );
}

function buildOverdueStayInterviewLines(
  employees: KpiEmployeeRecord[]
): string[] {
  return sortOverdueStayInterviewEmployees(employees)
    .map((employee) => formatEmployeeDueDateLine(employee))
    .filter(Boolean);
}

function applyReviewImpactPlayers(
  latestReviewByEmployee: Record<string, LatestReviewEntry>
): void {
  const impactMap = window.currentImpactPlayerRosterMap || {};

  Object.entries(latestReviewByEmployee).forEach(([employeeId, item]) => {
    if (item.avgScore === null || item.avgScore < 4) return;

    if (!impactMap[employeeId]) {
      impactMap[employeeId] = {
        manualReason: '',
        flaggedDate: '',
        flaggedBy: '',
        highReview: false,
        reviewScore: null,
      };
    }

    impactMap[employeeId].highReview = true;
    impactMap[employeeId].reviewScore = item.avgScore;
  });

  window.currentImpactPlayerRosterMap = impactMap;
}

function ensureAtRiskMeta(employeeId: string): AtRiskMeta {
  const map = window.currentAtRiskRosterMap || {};
  if (!map[employeeId]) {
    map[employeeId] = {
      manualReason: '',
      lowReview: false,
      reviewScore: null,
      openIncidentCount: 0,
      flaggedDate: '',
      flaggedBy: '',
    };
  }
  window.currentAtRiskRosterMap = map;
  return map[employeeId];
}

function getEmployeeStatus(employee: KpiEmployeeRecord): string {
  return String(employee.status || employee.displayStatus || employee.employee_status || '')
    .trim()
    .toUpperCase();
}

function hasTerminationDate(employee: KpiEmployeeRecord): boolean {
  return Boolean(String(employee.termination_date || '').trim());
}

function isCompletedTermination(employee: KpiEmployeeRecord): boolean {
  return getEmployeeStatus(employee) === 'TERMINATED' && hasTerminationDate(employee);
}

function updateTurnoverRateKpis(employees: KpiEmployeeRecord[]): void {
  const activeEmployees = employees.filter((employee) => getEmployeeStatus(employee) === 'ACTIVE');
  const terminatedEmployees = employees.filter((employee) => isCompletedTermination(employee));
  const totalWorkforce = activeEmployees.length + terminatedEmployees.length;

  const turnoverRate = totalWorkforce
    ? ((terminatedEmployees.length / totalWorkforce) * 100).toFixed(1)
    : '0.0';

  setKpiText('kTurnover', `${turnoverRate}%`);

  const turnoverSubtext =
    document.getElementById('turnoverSubtext') || document.getElementById('kTurnoverSubtext');

  if (turnoverSubtext) {
    turnoverSubtext.textContent = `${terminatedEmployees.length} terminated employee${terminatedEmployees.length === 1 ? '' : 's'} retained for turnover tracking`;
  }

  const newHireTerminatedEmployees = terminatedEmployees.filter((employee) => {
    const tenureMonths = getEmployeeTenureMonths(employee);
    return tenureMonths >= 0 && tenureMonths <= 3;
  });

  const newHirePopulation = employees.filter((employee) => {
    const status = getEmployeeStatus(employee);
    const tenureMonths = getEmployeeTenureMonths(employee);
    return (
      tenureMonths >= 0 && tenureMonths <= 3 && (status === 'ACTIVE' || status === 'TERMINATED')
    );
  });

  const newHireTurnoverRate = newHirePopulation.length
    ? ((newHireTerminatedEmployees.length / newHirePopulation.length) * 100).toFixed(1)
    : '0.0';

  setKpiText('kNewHireTurnover', `${newHireTurnoverRate}%`);

  const newHireTurnoverSubtext =
    document.getElementById('newHireTurnoverSubtext') ||
    document.getElementById('kNewHireTurnoverSubtext');

  if (newHireTurnoverSubtext) {
    newHireTurnoverSubtext.textContent = `${newHireTerminatedEmployees.length} terminated new hire${newHireTerminatedEmployees.length === 1 ? '' : 's'} in first 90 days`;
  }
}

function getEmployeeTenureMonths(employee: KpiEmployeeRecord): number {
  const storedTenure = Number(employee.tenureMonths || employee.tenure_months || 0);

  if (storedTenure > 0) return storedTenure;

  const hireDate = employee.hireDate || employee.hire_date;

  if (!hireDate) return 0;

  const hiredAt = new Date(String(hireDate));

  if (Number.isNaN(hiredAt.getTime())) return 0;

  const now = new Date();

  return Math.max(
    0,
    (now.getFullYear() - hiredAt.getFullYear()) * 12 + (now.getMonth() - hiredAt.getMonth())
  );
}

function employeeHasAtRiskMeta(employee: KpiEmployeeRecord): boolean {
  const keys = [employee.dbId, employee.id, employee.employee_id]
    .filter(Boolean)
    .map(String);
  const map = window.currentAtRiskRosterMap || {};

  return keys.some((key) => hasActiveRiskMeta(map[key]));
}

function pruneInactiveAtRiskMap(map: Record<string, AtRiskMeta>): void {
  Object.keys(map).forEach((key) => {
    if (!hasActiveRiskMeta(map[key])) {
      delete map[key];
    }
  });
}

function pruneInactiveImpactMap(map: Record<string, ImpactPlayerMeta>): void {
  Object.keys(map).forEach((key) => {
    if (!hasActiveImpactMeta(map[key])) {
      delete map[key];
    }
  });
}

export function syncKpiCardTooltip(card: Element | null, text: string): void {
  if (!card) return;

  const normalized = String(text || '').trim();
  card.removeAttribute('title');
  card.setAttribute('data-tooltip', normalized);
  card.setAttribute('aria-label', normalized);

  let popover = card.querySelector('.kpi-tooltip-popover') as HTMLElement | null;

  if (!popover) {
    popover = document.createElement('div');
    popover.className = 'kpi-tooltip-popover';
    popover.setAttribute('role', 'tooltip');
    card.appendChild(popover);
  }

  const lines = normalized
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    popover.innerHTML = '<div class="kpi-tooltip-empty">No data available</div>';
    return;
  }

  popover.innerHTML = `<ul class="kpi-tooltip-list">${lines
    .map((line) => `<li>${escapeHtml(line)}</li>`)
    .join('')}</ul>`;
}

function applyTooltip(card: Element | null, text: string): void {
  syncKpiCardTooltip(card, text);
}

function setKpiCardTooltip(
  cardId: string,
  lines: string[],
  emptyText = 'No data available'
): void {
  const card = document.getElementById(cardId);

  if (!card) return;

  const cleaned = lines.map((value) => String(value || '').trim()).filter(Boolean);
  const text = cleaned.length ? cleaned.join('\n') : emptyText;

  applyTooltip(card, text);
}

function formatReviewDateLabel(reviewDate: Date | null): string {
  return formatDueDateLabel(reviewDate);
}

function getEmployeeDepartmentLabel(employee: KpiEmployeeRecord): string {
  return String(employee.dept || employee.department || '').trim();
}

function isReviewOverdue(employee: KpiEmployeeRecord, today: Date): boolean {
  const reviewDate = getEmployeeNextReviewDate(employee);

  if (reviewDate) {
    const normalized = new Date(reviewDate);
    normalized.setHours(0, 0, 0, 0);
    return normalized.getTime() <= today.getTime();
  }

  const days = daysUntilDate(
    employee.next_review_date ||
      employee.nextReviewDate ||
      employee.nextReview ||
      ''
  );

  return days !== null && days <= 0;
}

function getEmployeeNextReviewLabel(employee: KpiEmployeeRecord): string {
  const reviewDate = getEmployeeNextReviewDate(employee);

  if (reviewDate) {
    return formatReviewDateLabel(reviewDate);
  }

  const raw = String(
    employee.next_review_date ||
      employee.nextReviewDate ||
      employee.nextReview ||
      ''
  ).trim();

  return raw;
}

export function buildKpiHoverDetails(): void {
  const roster = getKpiRoster();
  const employees = getDashboardKpiEmployees();
  const activeEmployees = employees.filter((employee) =>
    typeof window.isActiveDashboardEmployee === 'function'
      ? window.isActiveDashboardEmployee(employee)
      : getEmployeeStatus(employee) === 'ACTIVE'
  );
  const leaveEmployees = employees.filter((employee) =>
    isOnLeaveStatus(getEmployeeStatus(employee))
  );
  const reviewEligibleActive = activeEmployees.filter(
    (employee) =>
      !String(employee.payType || employee.pay_type || '').toLowerCase().includes('contract')
  );

  setKpiCardTooltip(
    'cardActiveHC',
    activeEmployees.map(employeeDisplayName),
    'No active employees'
  );

  const departmentCounts = [
    ...new Set(activeEmployees.map(getEmployeeDepartmentLabel).filter(Boolean)),
  ]
    .sort(compareKpiText)
    .map((department) => {
      const count = activeEmployees.filter(
        (employee) => getEmployeeDepartmentLabel(employee) === department
      ).length;

      return `${department}: ${count}`;
    });

  setKpiCardTooltip('cardDepartments', departmentCounts, 'No departments available');

  const intelligenceForTooltip =
    window.hrIntelligenceContext || buildHrIntelligenceContext({ employees: reviewEligibleActive });
  const atRiskMapForTooltip = window.currentAtRiskRosterMap || {};

  const turnoverRiskEmployees = reviewEligibleActive
    .filter((employee) =>
      isTurnoverRiskContributor(
        employee,
        atRiskMapForTooltip[getEmployeeKey(employee)],
        intelligenceForTooltip,
        getEmployeeTenureMonths(employee)
      )
    )
    .map((employee) => {
      const tenureMonths = getEmployeeTenureMonths(employee);
      const name = employeeDisplayName(employee);
      return tenureMonths > 0 ? `${name} • ${tenureMonths} mo` : name;
    })
    .filter(Boolean)
    .sort(compareKpiText);

  setKpiCardTooltip(
    'cardTurnoverRisk',
    turnoverRiskEmployees,
    'No employees currently contributing to turnover risk'
  );

  const terminatedNames = employees
    .filter((employee) => isCompletedTermination(employee))
    .map((employee) => {
      const name = employeeDisplayName(employee);
      const termDate = employee.termination_date;
      if (!name) return '';
      if (!termDate) return name;
      const formatted = new Date(termDate).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
      return `${name} • ${formatted}`;
    })
    .filter(Boolean)
    .sort(compareKpiText);

  setKpiCardTooltip(
    'cardTurnover',
    terminatedNames,
    'No terminated employees retained for turnover tracking'
  );

  const newHireTerminatedNames = employees
    .filter((employee) => {
      const status = getEmployeeStatus(employee);
      const tenureMonths = getEmployeeTenureMonths(employee);
      return isCompletedTermination(employee) && tenureMonths >= 0 && tenureMonths <= 3;
    })
    .map(employeeDisplayName)
    .filter(Boolean)
    .sort(compareKpiText);

  setKpiCardTooltip(
    'cardNewHireTurnover',
    newHireTerminatedNames,
    'No terminated new hires in their first 90 days'
  );

  const atRiskNames = activeEmployees
    .filter(employeeHasAtRiskMeta)
    .map(employeeDisplayName)
    .filter(Boolean)
    .sort(compareKpiText);

  const atRiskCount =
    Number(String(safeGet('kAtRiskEmployees')?.textContent || '0').trim()) || 0;

  setKpiCardTooltip(
    'cardAtRiskEmployees',
    atRiskNames.length
      ? atRiskNames
      : atRiskCount > 0
        ? [`${atRiskCount} employee${atRiskCount === 1 ? '' : 's'} flagged`]
        : [],
    'No employees currently flagged'
  );

  const impactPlayerNames = activeEmployees
    .filter(isImpactPlayer)
    .map(employeeDisplayName)
    .filter(Boolean)
    .sort(compareKpiText);

  setKpiCardTooltip('cardImpactPlayers', impactPlayerNames, 'No impact players');

  setKpiCardTooltip(
    'cardOnLeave',
    leaveEmployees.map(employeeDisplayName),
    'No employees currently on leave'
  );

  const disciplineCard = document.getElementById('cardOpenDiscipline');
  const existingDisciplineTooltip = disciplineCard?.getAttribute('data-tooltip') || '';
  const disciplineCountText = String(safeGet('kOpenDiscipline')?.textContent || '').trim();
  const hasRealDisciplineTooltip =
    Boolean(existingDisciplineTooltip) &&
    existingDisciplineTooltip !== 'No open discipline cases' &&
    existingDisciplineTooltip !== 'Could not load discipline cases';

  if (!hasRealDisciplineTooltip) {
    if (disciplineCountText === '0') {
      setKpiCardTooltip('cardOpenDiscipline', [], 'No open discipline cases');
    } else if (disciplineCountText === '—' || disciplineCountText === '') {
      setKpiCardTooltip('cardOpenDiscipline', [], 'Could not load discipline cases');
    }
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const overdueReviewEmployees = reviewEligibleActive.filter((employee) =>
    isReviewOverdue(employee, today)
  );

  setKpiCardTooltip(
    'cardReviewsDue',
    buildOverdueStayInterviewLines(overdueReviewEmployees),
    'No overdue stay interviews'
  );

  const metrics = buildKpiMetrics(roster);

  metrics.forEach((metric) => {
    const card = document.querySelector(`[data-kpi-id="${metric.id}"]`);

    if (card && metric.helper) {
      applyTooltip(card, metric.helper);
    }
  });
}

let kpiHoverUiBound = false;

export function initKpiHoverUi(): void {
  buildKpiHoverDetails();

  if (kpiHoverUiBound) return;

  kpiHoverUiBound = true;
}

export function renderKpiEmployeeMetrics(): void {
  const employees = getDashboardKpiEmployees();
  const activeEmployees = employees.filter((employee) =>
    typeof window.isActiveDashboardEmployee === 'function'
      ? window.isActiveDashboardEmployee(employee)
      : getEmployeeStatus(employee) === 'ACTIVE'
  );
  const reviewEligibleActive = activeEmployees.filter(
    (employee) =>
      !String(employee.payType || employee.pay_type || '').toLowerCase().includes('contract')
  );

  const departments = [
    ...new Set(
      activeEmployees
        .map((employee) => String(employee.dept || employee.department || '').trim())
        .filter(Boolean)
    ),
  ];

  const onLeave = employees.filter((employee) =>
    isOnLeaveStatus(getEmployeeStatus(employee))
  ).length;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const overdueReviewEmployees = reviewEligibleActive.filter((employee) =>
    isReviewOverdue(employee, today)
  );

  const reviewsDue = overdueReviewEmployees.length;

  const intelligenceContext =
    window.hrIntelligenceContext ||
    buildHrIntelligenceContext({ employees: reviewEligibleActive });
  const atRiskMap = window.currentAtRiskRosterMap || {};

  const turnoverResult = computeTurnoverRiskPercentage(
    reviewEligibleActive,
    intelligenceContext,
    getEmployeeTenureMonths,
    (employeeId) => atRiskMap[employeeId],
    () => true
  );

  const turnoverRisk = turnoverResult.percentage;
  const turnoverRiskContributors = turnoverResult.contributorCount;
  const turnoverRiskDisplay = `${turnoverRisk.toFixed(1)}%`;
  const turnoverSubtext = `${turnoverRiskContributors} employee${turnoverRiskContributors === 1 ? '' : 's'} flagged at-risk and/or with retention signals (discipline, reviews, or operations load)`;

  setKpiText('kActiveHC', activeEmployees.length);
  setKpiText('kDepartments', departments.length);
  setKpiText('kOnLeave', onLeave);

  if (typeof window.updateTurnoverRiskKpi === 'function') {
    window.updateTurnoverRiskKpi(Number(turnoverRisk.toFixed(1)), turnoverSubtext);
  } else {
    setKpiText('kTurnoverRisk', turnoverRiskDisplay);
    setKpiText('kTurnoverRiskSub', turnoverSubtext);
  }

  const turnoverRiskCard = safeGet('kTurnoverRisk')?.closest('.kpi-card');
  if (turnoverRiskCard) {
    turnoverRiskCard.classList.remove('good', 'warn', 'alert');
    if (turnoverRisk >= 40) turnoverRiskCard.classList.add('alert');
    else if (turnoverRisk >= 20) turnoverRiskCard.classList.add('warn');
    else turnoverRiskCard.classList.add('good');
  }

  if (typeof window.updateReviewsDueKpi === 'function') {
    (window as { updateReviewsDueKpi?: (count: number) => void }).updateReviewsDueKpi?.(
      reviewsDue
    );
  } else {
    setKpiText('kReviewsDue', reviewsDue);
  }

  const reviewsDueInfo = safeGet('kReviewsDueInfo');
  if (reviewsDueInfo) {
    const overdueLines = buildOverdueStayInterviewLines(overdueReviewEmployees);

    reviewsDueInfo.title = overdueLines.length
      ? `Counts active non-contract employees whose next stay interview date is today or earlier. Due now (oldest first): ${overdueLines.join('; ')}`
      : 'Counts active non-contract employees whose next stay interview date is today or earlier. No overdue stay interviews right now.';
  }

  updateTurnoverRateKpis(employees);
  buildKpiHoverDetails();
}

function isOpenDisciplineReport(status: unknown): boolean {
  const normalized = String(status || 'open').trim().toLowerCase();
  return normalized !== 'closed';
}

async function ensureKpiEmployeeRoster(): Promise<void> {
  if (getDashboardKpiEmployees().length) {
    return;
  }

  try {
    await loadEmployees();
  } catch (err) {
    console.warn('[KPIs] Could not preload employee roster for KPI labels:', err);
  }
}

export async function loadSummaryMetrics(): Promise<void> {
  const atRiskMap = window.currentAtRiskRosterMap || {};
  const impactMap = window.currentImpactPlayerRosterMap || {};
  const failedMetrics: string[] = [];

  hideKpiRetryBanner();

  await ensureKpiEmployeeRoster();

  try {
    const [
      disciplineRes,
      reviewsRes,
      manualRiskRes,
      impactPlayerRes,
      investigationsRes,
      operationsRes,
    ] = await Promise.all([
      supabaseClient
        .from('discipline_reports')
        .select('id, employee_id, issue_type, report_status, discipline_level'),
      supabaseClient
        .from('employee_reviews')
        .select(
          'employee_id, attendance_score, performance_score, teamwork_score, attitude_score, reliability_score, created_at, review_date'
        ),
      supabaseClient
        .from('employee_notes')
        .select('employee_id, note_type, note_text, note_date, created_at, created_by')
        .in('note_type', ['At-Risk Flag', 'At-Risk Cleared'])
        .order('created_at', { ascending: false }),
      supabaseClient
        .from('employee_notes')
        .select('employee_id, note_type, note_text, note_date, created_at')
        .in('note_type', ['Impact Player Flag', 'Impact Player Cleared'])
        .order('created_at', { ascending: false }),
      supabaseClient
        .from('investigations')
        .select(
          'id, status, primary_employee_id, targeted_employee_id, investigation_subjects(employee_id, subject_role)'
        ),
      supabaseClient
        .from('operations_issues')
        .select('id, status, is_recurring, department, related_employee_id, priority'),
    ]);

    if (!disciplineRes.error) {
      const openDisciplineCases = (disciplineRes.data || []).filter((row) =>
        isOpenDisciplineReport((row as { report_status?: string }).report_status)
      );
      const openCount = openDisciplineCases.length;
      setKpiText('kOpenDiscipline', openCount);

      const disciplineCard = document.getElementById('cardOpenDiscipline');
      if (disciplineCard) {
        const openDisciplineNames = openDisciplineCases
          .map((row) => {
            const record = row as {
              employee_id?: string;
              issue_type?: string;
            };
            const employeeId = String(record.employee_id || '').trim();
            const rosterEmployee = employeeId ? getEmployeeById(employeeId) : undefined;
            const fullName = rosterEmployee ? employeeDisplayName(rosterEmployee) : '';
            const issueType = String(record.issue_type || '').trim();
            if (fullName && issueType) return `${fullName} (${issueType})`;
            if (fullName) return fullName;
            if (issueType) return issueType;
            return 'Unnamed discipline case';
          })
          .filter(Boolean);

        syncKpiCardTooltip(
          disciplineCard,
          openDisciplineNames.length
            ? openDisciplineNames.join('\n')
            : 'No open discipline cases'
        );
      }
    } else {
      console.error(disciplineRes.error);
      failedMetrics.push('open discipline');
      setKpiText('kOpenDiscipline', '—');
      const disciplineCard = document.getElementById('cardOpenDiscipline');
      if (disciplineCard) {
        syncKpiCardTooltip(disciplineCard, 'Could not load discipline cases');
      }
    }

    const reviewRiskEmployeeIds = new Set<string>();
    const manualRiskEmployeeIds = new Set<string>();
    const latestReviewByEmployee: Record<string, LatestReviewEntry> = {};

    if (!reviewsRes.error) {
      (reviewsRes.data || []).forEach((row) => {
        const record = row as {
          employee_id?: string;
          review_date?: string;
          created_at?: string;
          attendance_score?: number | string;
          performance_score?: number | string;
          teamwork_score?: number | string;
          attitude_score?: number | string;
          reliability_score?: number | string;
        };
        const employeeId = record.employee_id;
        const sortDate = record.review_date || record.created_at || '';
        if (!employeeId) return;

        if (
          !latestReviewByEmployee[employeeId] ||
          String(sortDate) > String(latestReviewByEmployee[employeeId].sortDate)
        ) {
          const scoreValues = [
            record.attendance_score,
            record.performance_score,
            record.teamwork_score,
            record.attitude_score,
            record.reliability_score,
          ].filter((value) => value !== null && value !== undefined && value !== '');

          const avgScore = scoreValues.length
            ? scoreValues.reduce((sum, value) => sum + Number(value), 0) / scoreValues.length
            : null;

          latestReviewByEmployee[employeeId] = { avgScore, sortDate: String(sortDate) };
        }
      });

      Object.entries(latestReviewByEmployee).forEach(([employeeId, item]) => {
        if (item.avgScore !== null && item.avgScore <= 2) {
          reviewRiskEmployeeIds.add(employeeId);
        }
      });
    } else {
      console.error(reviewsRes.error);
      failedMetrics.push('review scores');
    }

    const latestManualRiskByEmployee: Record<string, Record<string, unknown>> = {};
    const manualSuppressedAtRiskIds = new Set<string>();

    if (!manualRiskRes.error) {
      (manualRiskRes.data || []).forEach((row) => {
        const employeeId = String((row as { employee_id?: string }).employee_id || '');
        if (!employeeId) return;
        if (!latestManualRiskByEmployee[employeeId]) {
          latestManualRiskByEmployee[employeeId] = row as Record<string, unknown>;
        }
      });

      Object.entries(latestManualRiskByEmployee).forEach(([employeeId, row]) => {
        if (String(row.note_type || '') === 'At-Risk Cleared') {
          manualSuppressedAtRiskIds.add(employeeId);
        }
      });
    } else {
      console.error(manualRiskRes.error);
      failedMetrics.push('at-risk flags');
    }

    reviewRiskEmployeeIds.forEach((employeeId) => {
      if (manualSuppressedAtRiskIds.has(employeeId)) {
        reviewRiskEmployeeIds.delete(employeeId);
      }
    });

    if (!manualRiskRes.error) {
      Object.keys(atRiskMap).forEach((key) => {
        atRiskMap[key] = {
          ...atRiskMap[key],
          lowReview: false,
          reviewScore: null,
          openIncidentCount: 0,
          manualReason: '',
        };
      });

      Object.entries(latestManualRiskByEmployee).forEach(([employeeId, row]) => {
        if (String(row.note_type || '') === 'At-Risk Flag') {
          manualRiskEmployeeIds.add(employeeId);
        }
      });

      Object.entries(latestManualRiskByEmployee).forEach(([employeeId, row]) => {
        if (String(row.note_type || '') !== 'At-Risk Flag') return;

        const meta = ensureAtRiskMeta(employeeId);
        meta.manualReason = String(row.note_text || '').trim();
        meta.flaggedDate = String(row.note_date || '').trim();
        meta.flaggedBy = String(row.created_by || '').trim();
      });

      Object.entries(latestReviewByEmployee).forEach(([employeeId, item]) => {
        if (manualSuppressedAtRiskIds.has(employeeId)) return;
        if (item.avgScore !== null && item.avgScore <= 2) {
          const meta = ensureAtRiskMeta(employeeId);
          meta.lowReview = true;
          meta.reviewScore = item.avgScore;
        }
      });

    }

    const rosterEmployees = getDashboardKpiEmployees();
    const intelligenceContext = buildHrIntelligenceContext({
      disciplineRows: (disciplineRes.data || []) as Array<{
        employee_id?: string;
        report_status?: string;
      }>,
      investigationRows: !investigationsRes.error
        ? (investigationsRes.data || []).filter((row) =>
            isOpenInvestigationStatus((row as { status?: string }).status)
          )
        : [],
      operationsRows: !operationsRes.error
        ? (operationsRes.data || []).filter((row) =>
            isOpenOperationsIssue((row as { status?: string }).status)
          )
        : [],
      employees: rosterEmployees,
    });
    window.hrIntelligenceContext = intelligenceContext;

    if (investigationsRes.error) {
      console.warn('[KPIs] investigations intelligence:', investigationsRes.error);
      failedMetrics.push('investigations intelligence');
    }

    if (operationsRes.error) {
      console.warn('[KPIs] operations intelligence:', operationsRes.error);
      failedMetrics.push('operations intelligence');
    }

    intelligenceContext.disciplineOpenByEmployee.forEach((_, employeeId) => {
      if (manualSuppressedAtRiskIds.has(employeeId)) return;
      const meta = ensureAtRiskMeta(employeeId);
      meta.disciplineRisk = true;
    });

    Object.keys(atRiskMap).forEach((employeeId) => {
      atRiskMap[employeeId] = enrichAtRiskMetaFromContext(
        employeeId,
        atRiskMap[employeeId],
        intelligenceContext
      );
    });

    pruneInactiveAtRiskMap(atRiskMap);
    window.currentAtRiskRosterMap = atRiskMap;

    const latestImpactPlayerByEmployee: Record<string, Record<string, unknown>> = {};
    const manualSuppressedImpactIds = new Set<string>();

    if (!impactPlayerRes.error) {
      (impactPlayerRes.data || []).forEach((row) => {
        const employeeId = String((row as { employee_id?: string }).employee_id || '');
        if (!employeeId) return;
        if (!latestImpactPlayerByEmployee[employeeId]) {
          latestImpactPlayerByEmployee[employeeId] = row as Record<string, unknown>;
        }
      });

      Object.entries(latestImpactPlayerByEmployee).forEach(([employeeId, row]) => {
        if (String(row.note_type || '') === 'Impact Player Cleared') {
          manualSuppressedImpactIds.add(employeeId);
        }
      });

      Object.keys(impactMap).forEach((key) => {
        impactMap[key] = {
          ...impactMap[key],
          highReview: false,
          reviewScore: null,
          manualReason: '',
        };
      });

      Object.entries(latestImpactPlayerByEmployee).forEach(([employeeId, row]) => {
        if (String(row.note_type || '') !== 'Impact Player Flag') return;
        if (manualSuppressedImpactIds.has(employeeId)) return;

        impactMap[employeeId] = {
          manualReason: String(row.note_text || '').trim(),
          flaggedDate: String(row.note_date || '').trim(),
          flaggedBy: '',
          highReview: false,
          reviewScore: null,
        };
      });
    } else {
      console.error(impactPlayerRes.error);
      failedMetrics.push('impact player flags');
    }

    if (manualSuppressedImpactIds.size) {
      Object.keys(latestReviewByEmployee).forEach((employeeId) => {
        if (manualSuppressedImpactIds.has(employeeId)) {
          delete latestReviewByEmployee[employeeId];
        }
      });
    }

    applyReviewImpactPlayers(latestReviewByEmployee);
    pruneInactiveImpactMap(impactMap);
    window.currentImpactPlayerRosterMap = impactMap;

    const combinedRiskEmployeeIds = new Set([
      ...reviewRiskEmployeeIds,
      ...manualRiskEmployeeIds,
      ...intelligenceContext.disciplineOpenByEmployee.keys(),
    ]);
    const atRiskEmployees = combinedRiskEmployeeIds.size;
    const impactRosterMap = window.currentImpactPlayerRosterMap || impactMap;
    const impactPlayers = (Array.isArray(window.EMPLOYEES) ? window.EMPLOYEES : []).filter(
      (employee) => {
        if (typeof window.isEmployeeImpactPlayer === 'function') {
          return window.isEmployeeImpactPlayer(employee as KpiEmployeeRecord);
        }

        const record = employee as KpiEmployeeRecord;
        const keys = [record.id, record.employee_id, record.dbId, record.displayId]
          .filter(Boolean)
          .map(String);

        if (
          record.impact_player ||
          record.is_impact_player ||
          record.impactPlayer
        ) {
          return true;
        }

        return keys.some((key) => {
          const meta = impactRosterMap[key];
          return meta && hasActiveImpactMeta(meta);
        });
      }
    ).length;

    const hasAnyData = !reviewsRes.error;

    if (hasAnyData) {
      setKpiText('kAtRiskEmployees', atRiskEmployees);
      setKpiText(
        'kAtRiskEmployeesSub',
        atRiskEmployees === 0
          ? 'No employees flagged from low review scores, manual HR flags, or open discipline'
          : `${atRiskEmployees} employee${atRiskEmployees === 1 ? '' : 's'} flagged by review score, HR note, or open discipline`
      );
    } else {
      failedMetrics.push('at-risk summary');
      setKpiText('kAtRiskEmployees', '—');
      setKpiText('kAtRiskEmployeesSub', 'Could not load review score data');
    }

    setKpiText('kImpactPlayers', impactPlayers);
    const impactSubEl = safeGet('kImpactPlayersSub');
    if (impactSubEl) {
      impactSubEl.textContent =
        impactPlayers === 0
          ? 'No employees currently flagged as high-impact contributors'
          : `${impactPlayers} high-impact employee${impactPlayers === 1 ? '' : 's'} based on reviews or recognition`;
    }

    if (Array.isArray(window.EMPLOYEES) && window.EMPLOYEES.length) {
      if (typeof window.renderRoster === 'function') {
        window.renderRoster();
      }
    }

    renderKpiEmployeeMetrics();

    if (typeof window.loadExecutiveInsight === 'function') {
      window.loadExecutiveInsight();
    }

    if (typeof window.refreshEmployeeDrawerRiskSignalsIfOpen === 'function') {
      window.refreshEmployeeDrawerRiskSignalsIfOpen();
    }

    if (typeof window.loadRiskEmployeesFallback === 'function') {
      await window.loadRiskEmployeesFallback();
    }

    if (typeof window.loadImpactPlayersFallback === 'function') {
      await window.loadImpactPlayersFallback();
    }

    const uniqueFailures = [...new Set(failedMetrics)];

    if (uniqueFailures.length) {
      showKpiRetryBanner(
        `Some KPI metrics could not load (${uniqueFailures.join(', ')}).`,
        () => loadSummaryMetrics()
      );
    } else {
      hideKpiRetryBanner();
    }
  } catch (err) {
    console.error('[KPIs] loadSummaryMetrics failed:', err);

    if (Array.isArray(window.EMPLOYEES) && window.EMPLOYEES.length && typeof window.renderRoster === 'function') {
      window.renderRoster();
    }

    setKpiText('kOpenDiscipline', '—');
    setKpiText('kAtRiskEmployees', '—');
    setKpiText('kAtRiskEmployeesSub', 'Could not load review score data');
    setKpiText('kImpactPlayers', '—');

    const impactSubEl = safeGet('kImpactPlayersSub');
    if (impactSubEl) {
      impactSubEl.textContent = 'Could not load impact player data';
    }

    if (typeof window.renderKpiEmployeeMetrics === 'function') {
      window.renderKpiEmployeeMetrics();
    }

    showKpiRetryBanner('Some KPI metrics could not be loaded from Supabase.', () => loadSummaryMetrics());
  }
}

export async function refreshTurnoverKpisFromSupabase(): Promise<void> {
  try {
    let employees = getDashboardKpiEmployees();

    if (!employees.length) {
      const { data, error } = await supabaseClient
        .from('employees')
        .select('id, first_name, last_name, status, hire_date, tenure_months, termination_date');

      if (error) {
        console.warn('[KPIs] Could not refresh turnover KPIs from Supabase:', error);
        return;
      }

      employees = (Array.isArray(data) ? data : []) as KpiEmployeeRecord[];
    }

    updateTurnoverRateKpis(employees);
    buildKpiHoverDetails();
  } catch (err) {
    console.warn('[KPIs] Unexpected turnover KPI refresh failure:', err);
  }
}

window.renderBasicDashboardKpis = renderBasicDashboardKpis;
window.refreshDashboardKpis = refreshDashboardKpis;
window.buildKpiHoverDetails = buildKpiHoverDetails;
window.initKpiHoverUi = initKpiHoverUi;
window.syncKpiCardTooltip = syncKpiCardTooltip;
window.renderKpiEmployeeMetrics = renderKpiEmployeeMetrics;
window.loadSummaryMetrics = loadSummaryMetrics;
window.refreshTurnoverKpisFromSupabase = refreshTurnoverKpisFromSupabase;
