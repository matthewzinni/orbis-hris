// At-risk / impact player roster badges

type EmployeeRow = Record<string, unknown>;

type FlagMeta = {
  manualReason?: string;
  lowReview?: boolean;
  highReview?: boolean;
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

function getImpactMap(): Record<string, FlagMeta> {
  return (window.currentImpactPlayerRosterMap || {}) as Record<string, FlagMeta>;
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

export function hasActiveImpactMeta(meta: FlagMeta | null | undefined): boolean {
  if (!meta) return false;

  return (
    meta.highReview === true || String(meta.manualReason || '').trim() !== ''
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

export function getEmployeeImpactMeta(employee: EmployeeRow | null | undefined): FlagMeta | null {
  if (!employee) return null;

  if (
    isTruthyFlag(employee.impact_player) ||
    isTruthyFlag(employee.is_impact_player) ||
    isTruthyFlag(employee.impactPlayer)
  ) {
    return (
      resolveFlagMetaFromMap(getImpactMap(), employee, hasActiveImpactMeta) || {
        manualReason: String(employee.impact_reason || '').trim(),
      }
    );
  }

  return resolveFlagMetaFromMap(getImpactMap(), employee, hasActiveImpactMeta);
}

export function isEmployeeAtRisk(employee: EmployeeRow | null | undefined): boolean {
  return Boolean(getEmployeeRiskMeta(employee));
}

export function isEmployeeImpactPlayer(employee: EmployeeRow | null | undefined): boolean {
  return Boolean(getEmployeeImpactMeta(employee));
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

export function buildImpactBadgeHtml(impactMeta: FlagMeta | null): string {
  if (!hasActiveImpactMeta(impactMeta)) return '';

  const lines = ['Impact Player'];

  if (impactMeta.manualReason) {
    lines.push('', `Reason: ${impactMeta.manualReason}`);
  }

  if (impactMeta.highReview && impactMeta.reviewScore !== null && impactMeta.reviewScore !== undefined) {
    lines.push('', `Review Score: ${Number(impactMeta.reviewScore).toFixed(1)}`);
  }

  if (impactMeta.flaggedDate) {
    const flaggedDateLabel = new Date(`${impactMeta.flaggedDate}T00:00:00`).toLocaleDateString(
      'en-US',
      { month: 'short', day: 'numeric' }
    );
    lines.push('', `Flagged: ${flaggedDateLabel}`);
  }

  if (impactMeta.flaggedBy) {
    lines.push('', `By: ${impactMeta.flaggedBy}`);
  }

  return `<span class="badge" style="background:#ecfdf5; color:#065f46; border:1px solid #a7f3d0; font-weight:700;" title="${esc(lines.join('\n'))}">Impact Player</span>`;
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
    const impactHtml = buildImpactBadgeHtml(getEmployeeImpactMeta(employee));

    badgeContainer.innerHTML = `${impactHtml}${riskHtml}`;
  });
}

window.getEmployeeMapKeys = getEmployeeMapKeys;
window.getEmployeeRiskMeta = getEmployeeRiskMeta;
window.getEmployeeImpactMeta = getEmployeeImpactMeta;
window.isEmployeeAtRisk = isEmployeeAtRisk;
window.isEmployeeImpactPlayer = isEmployeeImpactPlayer;
window.hasActiveRiskMeta = hasActiveRiskMeta;
window.hasActiveImpactMeta = hasActiveImpactMeta;
window.buildRiskBadgeHtml = buildRiskBadgeHtml;
window.buildImpactBadgeHtml = buildImpactBadgeHtml;
window.updateEmployeeRowBadges = updateEmployeeRowBadges;
