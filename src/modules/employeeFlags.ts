// Manual at-risk / impact player flags (employee admin drawer)

import { canEditEmployeeAdmin } from '../services/access';
import { supabaseClient } from '../services/supabaseClient';
import { recordAuditEvent } from '../services/auditTrail';

type EmployeeRow = Record<string, unknown>;

type FlagMeta = {
  manualReason?: string;
  lowReview?: boolean;
  reviewScore?: number | null;
  openIncidentCount?: number;
  flaggedDate?: string;
  flaggedBy?: string;
  highReview?: boolean;
};

function safeGet(id: string): HTMLElement | null {
  if (typeof window.safeGet === 'function') {
    return window.safeGet(id);
  }
  return document.getElementById(id);
}

function showToast(message: string, type = 'success'): void {
  if (typeof window.showToast === 'function') {
    window.showToast(message, type);
    return;
  }
  console.log(`[${type}] ${message}`);
}

function todayInputValue(): string {
  if (typeof window.todayInputValue === 'function') {
    return window.todayInputValue();
  }
  return new Date().toISOString().slice(0, 10);
}

function getCurrentEmployee(): EmployeeRow | null {
  return (window.currentEmployee as EmployeeRow | null) || null;
}

function ensureCanEditEmployeeFlags(): EmployeeRow | null {
  const currentEmployee = getCurrentEmployee();
  if (!currentEmployee) {
    showToast('Open an employee first.', 'error');
    return null;
  }

  if (!canEditEmployeeAdmin(currentEmployee)) {
    showToast('You can only change flags for people on your team.', 'error');
    return null;
  }

  return currentEmployee;
}

function getEmployeeDbId(employee: EmployeeRow): string {
  return String(employee.dbId || employee.employee_id || employee.id || '').trim();
}

function removeEmployeeFromAtRiskMap(employee: EmployeeRow): void {
  const map = window.currentAtRiskRosterMap || {};
  const keysToRemove = new Set(getEmployeeMapKeys(employee));

  Object.keys(map).forEach((key) => {
    if (keysToRemove.has(key)) {
      delete map[key];
    }
  });

  window.currentAtRiskRosterMap = map;
}

function removeEmployeeFromImpactMap(employee: EmployeeRow): void {
  const map = window.currentImpactPlayerRosterMap || {};
  const keysToRemove = new Set(getEmployeeMapKeys(employee));

  Object.keys(map).forEach((key) => {
    if (keysToRemove.has(key)) {
      delete map[key];
    }
  });

  window.currentImpactPlayerRosterMap = map;
}

function getEmployeeMapKeys(employee: EmployeeRow): string[] {
  return [employee.dbId, employee.id, employee.employee_id, employee.displayId]
    .filter(Boolean)
    .map(String);
}

function setManualAtRiskUi(flagged: boolean, reason = ''): void {
  window.currentManualAtRiskState = { flagged: !!flagged, reason: String(reason || '').trim() };
  const input = safeGet('atRiskReasonInput') as HTMLTextAreaElement | null;
  if (input) {
    input.value = window.currentManualAtRiskState.reason;
  }
}

function setManualImpactPlayerUi(flagged: boolean, reason = ''): void {
  window.currentManualImpactPlayerState = {
    flagged: !!flagged,
    reason: String(reason || '').trim(),
  };
  const input = safeGet('impactPlayerReasonInput') as HTMLTextAreaElement | null;
  if (input) {
    input.value = window.currentManualImpactPlayerState.reason;
  }
}

async function refreshAfterFlagChange(employee: EmployeeRow): Promise<void> {
  const employeeId = String(employee.id || employee.displayId || employee.dbId || '');

  if (typeof window.loadEmployeeNotes === 'function' && employeeId) {
    await window.loadEmployeeNotes(employeeId);
  }

  if (typeof window.loadSummaryMetrics === 'function') {
    await window.loadSummaryMetrics();
  }

  if (typeof window.loadRiskEmployeesFallback === 'function') {
    await window.loadRiskEmployeesFallback();
  }

  if (typeof window.loadImpactPlayersFallback === 'function') {
    await window.loadImpactPlayersFallback();
  }

  if (typeof window.renderRoster === 'function') {
    window.renderRoster();
  }

  if (typeof window.updateEmployeeRowBadges === 'function') {
    window.updateEmployeeRowBadges();
  }
}

export async function loadEmployeeManualAtRisk(employeeId: string): Promise<void> {
  const currentEmployee = getCurrentEmployee();
  const actualEmployeeId = String(currentEmployee?.dbId || employeeId || '').trim();

  if (!actualEmployeeId) {
    setManualAtRiskUi(false, '');
    return;
  }

  const { data, error } = await supabaseClient
    .from('employee_notes')
    .select('id, note_type, note_text, note_date, created_at')
    .eq('employee_id', actualEmployeeId)
    .in('note_type', ['At-Risk Flag', 'At-Risk Cleared'])
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    console.error(error);
    setManualAtRiskUi(false, '');
    return;
  }

  const latest = data?.[0] as { note_type?: string; note_text?: string } | undefined;

  if (!latest || latest.note_type !== 'At-Risk Flag') {
    setManualAtRiskUi(false, '');
    return;
  }

  setManualAtRiskUi(true, latest.note_text || '');
}

export async function loadEmployeeManualImpactPlayer(employeeId: string): Promise<void> {
  const currentEmployee = getCurrentEmployee();
  const actualEmployeeId = String(currentEmployee?.dbId || employeeId || '').trim();

  if (!actualEmployeeId) {
    setManualImpactPlayerUi(false, '');
    return;
  }

  const { data, error } = await supabaseClient
    .from('employee_notes')
    .select('id, note_type, note_text, note_date, created_at')
    .eq('employee_id', actualEmployeeId)
    .in('note_type', ['Impact Player Flag', 'Impact Player Cleared'])
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    console.error(error);
    setManualImpactPlayerUi(false, '');
    return;
  }

  const latest = data?.[0] as { note_type?: string; note_text?: string } | undefined;

  if (!latest || latest.note_type !== 'Impact Player Flag') {
    setManualImpactPlayerUi(false, '');
    return;
  }

  setManualImpactPlayerUi(true, latest.note_text || '');
}

export async function markEmployeeAtRisk(): Promise<void> {
  const currentEmployee = ensureCanEditEmployeeFlags();
  if (!currentEmployee) return;

  const reason = String((safeGet('atRiskReasonInput') as HTMLTextAreaElement | null)?.value || '').trim();

  if (!reason) {
    showToast('Enter a reason before marking the employee at-risk.', 'error');
    return;
  }

  const employeeDbId = getEmployeeDbId(currentEmployee);

  const { error } = await supabaseClient.from('employee_notes').insert([
    {
      employee_id: employeeDbId,
      note_date: todayInputValue(),
      note_type: 'At-Risk Flag',
      note_text: reason,
    },
  ]);

  if (error) {
    console.error(error);
    showToast('Could not mark employee at-risk.', 'error');
    return;
  }

  showToast('Employee marked at-risk.');
  recordAuditEvent('Marked At-Risk', currentEmployee, reason);
  setManualAtRiskUi(true, reason);

  const riskMeta: FlagMeta = {
    manualReason: reason,
    lowReview: false,
    reviewScore: null,
    openIncidentCount: 0,
    flaggedDate: todayInputValue(),
    flaggedBy: '',
  };

  const riskMap = window.currentAtRiskRosterMap || {};
  getEmployeeMapKeys(currentEmployee).forEach((key) => {
    riskMap[key] = riskMeta;
  });
  window.currentAtRiskRosterMap = riskMap;

  await refreshAfterFlagChange(currentEmployee);
}

export async function clearAtRiskStatus(): Promise<void> {
  const currentEmployee = ensureCanEditEmployeeFlags();
  if (!currentEmployee) return;

  const employeeDbId = getEmployeeDbId(currentEmployee);
  const { error } = await supabaseClient.from('employee_notes').insert([
    {
      employee_id: employeeDbId,
      note_date: todayInputValue(),
      note_type: 'At-Risk Cleared',
      note_text: '',
    },
  ]);

  if (error) {
    console.error(error);
    showToast('Could not clear at-risk flag.', 'error');
    return;
  }

  showToast('At-risk flag cleared.');
  recordAuditEvent('Cleared At-Risk', currentEmployee, 'Manual at-risk flag cleared');
  setManualAtRiskUi(false, '');

  removeEmployeeFromAtRiskMap(currentEmployee);

  await refreshAfterFlagChange(currentEmployee);
}

export async function markImpactPlayer(): Promise<void> {
  const currentEmployee = ensureCanEditEmployeeFlags();
  if (!currentEmployee) return;

  const reason = String(
    (safeGet('impactPlayerReasonInput') as HTMLTextAreaElement | null)?.value || ''
  ).trim();

  if (!reason) {
    showToast('Enter a reason before marking the employee as an Impact Player.', 'error');
    return;
  }

  const employeeDbId = getEmployeeDbId(currentEmployee);

  const { error } = await supabaseClient.from('employee_notes').insert([
    {
      employee_id: employeeDbId,
      note_date: todayInputValue(),
      note_type: 'Impact Player Flag',
      note_text: reason,
    },
  ]);

  if (error) {
    console.error(error);
    showToast('Could not mark employee as an Impact Player.', 'error');
    return;
  }

  showToast('Employee marked as an Impact Player.');
  recordAuditEvent('Marked Impact Player', currentEmployee, reason);
  setManualImpactPlayerUi(true, reason);

  const impactMeta: FlagMeta = {
    manualReason: reason,
    flaggedDate: todayInputValue(),
    flaggedBy: '',
    highReview: false,
    reviewScore: null,
  };

  const impactMap = window.currentImpactPlayerRosterMap || {};
  getEmployeeMapKeys(currentEmployee).forEach((key) => {
    impactMap[key] = impactMeta;
  });
  window.currentImpactPlayerRosterMap = impactMap;

  await refreshAfterFlagChange(currentEmployee);
}

export async function clearImpactPlayerStatus(): Promise<void> {
  const currentEmployee = ensureCanEditEmployeeFlags();
  if (!currentEmployee) return;

  const employeeDbId = getEmployeeDbId(currentEmployee);
  const { error } = await supabaseClient.from('employee_notes').insert([
    {
      employee_id: employeeDbId,
      note_date: todayInputValue(),
      note_type: 'Impact Player Cleared',
      note_text: '',
    },
  ]);

  if (error) {
    console.error(error);
    showToast('Could not clear Impact Player flag.', 'error');
    return;
  }

  showToast('Impact Player flag cleared.');
  recordAuditEvent('Cleared Impact Player', currentEmployee, 'Manual Impact Player flag cleared');
  setManualImpactPlayerUi(false, '');

  removeEmployeeFromImpactMap(currentEmployee);

  await refreshAfterFlagChange(currentEmployee);
}

function bindEmployeeFlagButtons(): void {
  if ((window as { __employeeFlagButtonsBound?: boolean }).__employeeFlagButtonsBound) {
    return;
  }

  (window as { __employeeFlagButtonsBound?: boolean }).__employeeFlagButtonsBound = true;

  document.addEventListener(
    'click',
    (event) => {
      const button = (event.target as HTMLElement | null)?.closest('button');
      if (!button?.id) return;

      switch (button.id) {
        case 'markAtRiskBtn':
          event.preventDefault();
          void markEmployeeAtRisk();
          break;
        case 'clearAtRiskBtn':
          event.preventDefault();
          void clearAtRiskStatus();
          break;
        case 'markImpactPlayerBtn':
          event.preventDefault();
          void markImpactPlayer();
          break;
        case 'clearImpactPlayerBtn':
          event.preventDefault();
          void clearImpactPlayerStatus();
          break;
        default:
          break;
      }
    },
    true
  );
}

bindEmployeeFlagButtons();

window.loadEmployeeManualAtRisk = loadEmployeeManualAtRisk;
window.loadEmployeeManualImpactPlayer = loadEmployeeManualImpactPlayer;
window.markEmployeeAtRisk = markEmployeeAtRisk;
window.clearAtRiskStatus = clearAtRiskStatus;
window.markImpactPlayer = markImpactPlayer;
window.clearImpactPlayerStatus = clearImpactPlayerStatus;
