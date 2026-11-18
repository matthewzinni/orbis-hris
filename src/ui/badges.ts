// At-risk / iron shift roster badges

type IronShiftAwardMeta = {
  summary: string;
  recognizedOn: string;
  recognizedBy: string;
  awardCount: number;
};

type EmployeeRow = Record<string, unknown>;

type FlagMeta = {
  manualReason?: string;
  lowReview?: boolean;
  reviewScore?: number | null;
  openIncidentCount?: number;
  disciplineRisk?: boolean;
  openInvestigation?: boolean;
  stayInterviewOverdue?: boolean;
  operationsPressure?: boolean;
  flaggedDate?: string;
  flaggedBy?: string;
};

function esc(value: unknown): string {
  if (typeof window.esc === 'function') {
    return window.esc(value);
  }
  return String(value ?? '');
}

function getRiskMap(): Record<string, FlagMeta> {
  return (window.currentAtRiskRosterMap || {}) as Record<string, FlagMeta>;
}

export function getEmployeeMapKeys(employee: EmployeeRow | null | undefined): string[] {
  if (!employee) return [];

  return [...new Set(
    [employee.dbId, employee.id, employee.employee_id, employee.displayId]
      .filter(Boolean)
      .map((value) => String(value).trim())
      .filter(Boolean)
  )];
}

function resolveFlagMetaFromMap(
  map: Record<string, FlagMeta>,
  employee: EmployeeRow | null | undefined,
  hasActive: (meta: FlagMeta | null | undefined) => boolean
): FlagMeta | null {
  for (const key of getEmployeeMapKeys(employee)) {
    const meta = map[key];
    if (hasActive(meta)) {
      return meta;
    }
  }

  return null;
}

function isTruthyFlag(value: unknown): boolean {
  return value === true || String(value || '').toLowerCase() === 'true';
}

export function hasActiveRiskMeta(meta: FlagMeta | null | undefined): boolean {
  if (!meta) return false;

  return (
    meta.lowReview === true ||
    String(meta.manualReason || '').trim() !== '' ||
    meta.disciplineRisk === true
  );
}

export function getEmployeeRiskMeta(employee: EmployeeRow | null | undefined): FlagMeta | null {
  if (!employee) return null;

  if (isTruthyFlag(employee.at_risk) || isTruthyFlag(employee.atRisk)) {
    return resolveFlagMetaFromMap(getRiskMap(), employee, hasActiveRiskMeta) || {
      manualReason: String(employee.at_risk_reason || employee.risk_reason || '').trim(),
    };
  }

  return resolveFlagMetaFromMap(getRiskMap(), employee, hasActiveRiskMeta);
}

export function isEmployeeAtRisk(employee: EmployeeRow | null | undefined): boolean {
  return Boolean(getEmployeeRiskMeta(employee));
}

export function buildRiskBadgeHtml(riskMeta: FlagMeta | null): string {
  if (!hasActiveRiskMeta(riskMeta)) return '';

  const lines = ['At-Risk Flag'];

  if (riskMeta.manualReason) {
    lines.push('', `Reason: ${riskMeta.manualReason}`);
  }

  if (riskMeta.lowReview && riskMeta.reviewScore !== null && riskMeta.reviewScore !== undefined) {
    lines.push('', `Review Score: ${Number(riskMeta.reviewScore).toFixed(1)}`);
  }

  if (riskMeta.disciplineRisk) {
    lines.push('', 'Severe discipline on file (Final Warning or higher)');
  }

  if (riskMeta.flaggedDate) {
    const flaggedDateLabel = new Date(`${riskMeta.flaggedDate}T00:00:00`).toLocaleDateString(
      'en-US',
      { month: 'short', day: 'numeric' }
    );
    lines.push('', `Flagged: ${flaggedDateLabel}`);
  }

  if (riskMeta.flaggedBy) {
    lines.push('', `By: ${riskMeta.flaggedBy}`);
  }

  return `<span class="badge badge-leave" style="background:#fef2f2; color:#991b1b; border:1px solid #fecaca; font-weight:700;" title="${esc(lines.join('\n'))}">At-Risk</span>`;
}

export function buildIronShiftBadgeHtml(meta: IronShiftAwardMeta | null): string {
  if (!meta) return '';

  const lines = ['Iron Shift Award'];
  if (meta.summary) lines.push('', meta.summary);
  if (meta.recognizedOn) {
    const date = new Date(`${meta.recognizedOn.slice(0, 10)}T12:00:00`);
    const label = Number.isNaN(date.getTime())
      ? meta.recognizedOn
      : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    lines.push('', `Awarded: ${label}`);
  }
  if (meta.recognizedBy) lines.push('', `By: ${meta.recognizedBy}`);
  if (meta.awardCount > 1) lines.push('', `${meta.awardCount} total awards`);

  return `<span class="badge badge-iron-shift" title="${esc(lines.join('\n'))}">Iron Shift</span>`;
}

export function getEmployeeIronShiftMetaFromBadges(
  employee: EmployeeRow | null | undefined
): IronShiftAwardMeta | null {
  if (!employee) return null;

  const map = (window.currentIronShiftRosterMap || {}) as Record<string, IronShiftAwardMeta>;
  for (const key of getEmployeeMapKeys(employee)) {
    const meta = map[key];
    if (meta) return meta;
  }

  return null;
}

export function updateEmployeeRowBadges(): void {
  const employees = Array.isArray(window.EMPLOYEES) ? window.EMPLOYEES : [];
  const rows = document.querySelectorAll('#employeeTable tbody tr, #employeeRosterBody tr');

  rows.forEach((row) => {
    const employeeId = row.getAttribute('data-id') || row.getAttribute('data-employee-id');
    if (!employeeId) return;

    const employee = employees.find(
      (e: EmployeeRow) =>
        String(e.dbId) === String(employeeId) ||
        String(e.id) === String(employeeId) ||
        String(e.employee_id) === String(employeeId)
    );

    if (!employee) return;

    const nameMain =
      row.querySelector('.roster-name-main') || row.querySelector('td:nth-child(2)');

    if (!nameMain) return;

    let badgeContainer = nameMain.querySelector('.employee-badges') as HTMLElement | null;

    if (!badgeContainer) {
      badgeContainer = document.createElement('div');
      badgeContainer.className = 'employee-badges';
      badgeContainer.style.display = 'inline-flex';
      badgeContainer.style.flexWrap = 'wrap';
      badgeContainer.style.alignItems = 'center';
      badgeContainer.style.gap = '4px';
      badgeContainer.style.marginLeft = '4px';
      nameMain.appendChild(badgeContainer);
    }

    const riskHtml = buildRiskBadgeHtml(getEmployeeRiskMeta(employee));
    const ironShiftHtml = buildIronShiftBadgeHtml(getEmployeeIronShiftMetaFromBadges(employee));

    badgeContainer.innerHTML = `${ironShiftHtml}${riskHtml}`;
  });
}

window.getEmployeeMapKeys = getEmployeeMapKeys;
window.getEmployeeRiskMeta = getEmployeeRiskMeta;
window.isEmployeeAtRisk = isEmployeeAtRisk;
window.hasActiveRiskMeta = hasActiveRiskMeta;
window.buildRiskBadgeHtml = buildRiskBadgeHtml;
window.buildIronShiftBadgeHtml = buildIronShiftBadgeHtml;
window.updateEmployeeRowBadges = updateEmployeeRowBadges;
