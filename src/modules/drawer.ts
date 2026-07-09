import {
  openDrawer,
  closeDrawer as closeDrawerUi,
  switchDrawerTab as switchDrawerTabUi,
} from '../ui/drawerUi';
import { showOrbisConfirm } from '../ui/confirmModal';
import { generateAvailableEmployeeId, insertEmployeeRecordWithRetry } from '../services/employeeIds';
import { cleanEmployeeNameValue, employeePersonalEmail, employeePortalSignInEmail, employeeWorkEmail } from '../services/employeeUtils';
import {
  formatEmployeeTenureMonths,
  formatEmployeeTenureYears,
  resolveEmployeeTenureFields,
} from '../services/employeeTenure';
import { createDefaultOnboardingTasks } from './onboarding';
import { syncStandardOnboardingTasks } from '../services/onboardingStandard';
import {
  applyNewTerminationFieldsToPayload,
  runEmployeeTerminationSideEffects,
} from '../services/employeeTermination';
import {
  canEditEmployeeAdmin,
  isAdminUser,
} from '../services/access';
import { deleteEmployeeById } from './employeeAdmin';
import { recordAuditEvent } from '../services/auditTrail';
import {
  employeeToPayrollSnapshot,
  logNewHirePayrollHandoff,
  logPayrollHandoffsFromEmployeeSave,
} from '../services/payrollHandoff';

interface DrawerEmployeeRecord {
  id?: string;
  employee_id?: string;

  first_name?: string;
  last_name?: string;

  preferred_name?: string;

  email?: string;
  phone?: string;

  department?: string;
  position?: string;
  supervisor?: string;

  status?: string;

  hire_date?: string;
  hireDate?: string | Date | null;
  termination_date?: string;
  terminationDate?: string;

  pay_type?: string;
  payType?: string;
  standard_hours?: string | number;
  stdHours?: string | number;
  next_review_date?: string;
  nextReview?: string | Date | null;
  anniversary_date?: string;
  anniversaryDate?: string;
  tenure_months?: string | number;
  tenureMonths?: string | number;
  tenure_years?: string | number;
  tenureYears?: string | number;
  benefits_status?: string;
  benefitsStatus?: string;
  tenure_bracket?: string;
  tenureBracket?: string;

  dept?: string;
  dbId?: string;

  at_risk?: boolean;
  impact_player?: boolean;

  [key: string]: unknown;
}

let selectedEmployee: DrawerEmployeeRecord | null = null;

/** Primary key captured when the drawer opens — never read from the form. */
let openedEmployeeRecordId: string | null = null;

function escapeHtml(value: unknown): string {
  if (typeof (window as Window & { esc?: (v: unknown) => string }).esc === 'function') {
    return (window as Window & { esc: (v: unknown) => string }).esc(value);
  }

  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatDrawerDate(value: unknown): string {
  if (typeof (window as Window & { formatDrawerDateForDisplay?: (v: unknown) => string })
    .formatDrawerDateForDisplay === 'function') {
    return (window as Window & { formatDrawerDateForDisplay: (v: unknown) => string })
      .formatDrawerDateForDisplay(value);
  }

  const raw = String(value || '').trim();

  if (!raw) return '';

  const date = new Date(`${raw}T00:00:00`);

  if (Number.isNaN(date.getTime())) return raw;

  return date.toLocaleDateString();
}

function getNextAnniversaryDate(employee: DrawerEmployeeRecord): string {
  if (typeof (window as Window & { getNextUpcomingAnniversaryDate?: (v: unknown) => string })
    .getNextUpcomingAnniversaryDate === 'function') {
    return (window as Window & { getNextUpcomingAnniversaryDate: (v: unknown) => string })
      .getNextUpcomingAnniversaryDate(
        employee.anniversary_date || employee.hire_date || employee.hireDate || ''
      );
  }

  return formatDrawerDate(employee.anniversary_date || employee.hire_date || '');
}

const EMPLOYEE_RELATED_TABLES = [
  'payroll_handoffs',
  'onboarding_tasks',
  'offboarding_tasks',
  'leave_requests',
  'employee_notes',
  'employee_meetings',
  'employee_reviews',
  'discipline_reports',
  'incident_reports',
  'stay_interviews',
  'emergency_contacts',
  'employee_audit_logs',
  'employee_documents',
  'signature_requests',
  'employee_acknowledgments',
  'policy_campaign_assignments',
  'care_items',
  'care_recognition',
  'care_employee_notes',
  'care_follow_ups',
  'care_resources_shared',
  'care_wellness_check_ins',
] as const;

let isEmployeeSaveInProgress = false;

function safeGet<T extends HTMLElement = HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function setText(id: string, value: unknown): void {
  const el = safeGet(id);

  if (!el) return;

  el.textContent = String(value ?? '');
}

function setValue(id: string, value: unknown): void {
  const el = safeGet<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(id);

  if (!el) return;

  el.value = String(value ?? '');
}

function setAdminValue(...ids: string[]): (value: unknown) => void {
  return (value: unknown) => {
    ids.forEach((id) => setValue(id, value));
  };
}

function normalizeStatusForAdminInput(status: unknown): string {
  const raw = String(status || '')
    .trim()
    .toUpperCase();

  if (raw === 'INACTIVE') return 'INACTIVE';
  if (raw === 'LEAVE' || raw === 'ON LEAVE') return 'LEAVE';
  if (raw === 'TERMINATED') return 'TERMINATED';

  return 'ACTIVE';
}

function formatDateForAdminInput(value: unknown): string {
  const raw = String(value || '').trim();

  if (!raw) return '';

  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    return raw.slice(0, 10);
  }

  const date = new Date(raw);

  if (Number.isNaN(date.getTime())) return '';

  return date.toISOString().slice(0, 10);
}

function getOpenedEmployeeRecordId(): string {
  if (openedEmployeeRecordId) {
    return openedEmployeeRecordId;
  }

  const current = window.currentEmployee as (DrawerEmployeeRecord & { dbId?: string }) | null;

  return String(selectedEmployee?.id || current?.dbId || '').trim();
}

async function cascadeEmployeeIdChange(
  oldId: string,
  newId: string,
  client: NonNullable<ReturnType<typeof getSupabaseBridgeClient>>
): Promise<Error | null> {
  if (!oldId || !newId || oldId === newId) return null;

  for (const table of EMPLOYEE_RELATED_TABLES) {
    const { error } = await (client.from!(table) as {
      update: (payload: Record<string, string>) => {
        eq: (column: string, value: string) => Promise<{ error: { message?: string } | null }>;
      };
    })
      .update({ employee_id: newId })
      .eq('employee_id', oldId);

    if (error) {
      console.error(`[Drawer] Could not cascade employee ID to ${table}:`, error);
      return new Error(
        `Employee saved but related ${table.replaceAll('_', ' ')} records could not be relinked: ${error.message}`
      );
    }
  }

  const { error: candidateError } = await (client.from!('candidates') as {
    update: (payload: Record<string, string | null>) => {
      eq: (column: string, value: string) => Promise<{ error: { message?: string } | null }>;
    };
  })
    .update({ linked_employee_id: newId })
    .eq('linked_employee_id', oldId);

  if (candidateError) {
    return new Error(
      `Employee saved but candidate links could not be relinked: ${candidateError.message}`
    );
  }

  const { error: accessError } = await (client.from!('user_access') as {
    update: (payload: Record<string, string | null>) => {
      eq: (column: string, value: string) => Promise<{ error: { message?: string } | null }>;
    };
  })
    .update({ linked_employee_id: newId })
    .eq('linked_employee_id', oldId);

  if (accessError) {
    return new Error(
      `Employee saved but portal account links could not be relinked: ${accessError.message}`
    );
  }

  return null;
}

function showDrawer(): void {
  const drawer = safeGet('employeeDrawer');

  if (!drawer) return;

  drawer.classList.add('open');
}

function hideDrawer(): void {
  const drawer = safeGet('employeeDrawer');

  if (!drawer) return;

  drawer.classList.remove('open');
}

async function fetchEmployeeRecord(employeeId: string): Promise<DrawerEmployeeRecord | null> {
  try {
    const bridge = window as Window & {
      supabase?: unknown;
      supabaseClient?: unknown;
    };

    const client = (bridge.supabaseClient || bridge.supabase) as unknown as {
      from?: (table: string) => {
        select: (query: string) => {
          eq: (
            column: string,
            value: string
          ) => {
            single: () => Promise<{
              data: DrawerEmployeeRecord | null;
              error: unknown;
            }>;
          };
        };
      };
    };

    if (!client?.from) {
      console.warn('[Drawer] Supabase client missing.');

      return null;
    }

    const { data, error } = await client
      .from('employees')
      .select('*')
      .eq('id', employeeId)
      .single();

    if (error) {
      console.error('[Drawer] Could not load employee:', error);

      return null;
    }

    return data;
  } catch (err) {
    console.error('[Drawer] Unexpected employee load error:', err);

    return null;
  }
}

function populateDrawer(employee: DrawerEmployeeRecord): void {
  selectedEmployee = employee;

  const dbEmployeeId = String(
    (employee as DrawerEmployeeRecord & { dbId?: string }).dbId || employee.id || ''
  ).trim();
  const displayEmployeeId = String(
    employee.employee_id || employee.id || ''
  ).trim();

  openedEmployeeRecordId = dbEmployeeId;
  window.selectedEmployeeId = dbEmployeeId;
  window.currentEmployee = employee;

  const setAdmin = setAdminValue(
    'employeeIdInput',
    'employeeId',
    'employeeRecordId',
    'employeeDisplayId'
  );

  setAdmin(displayEmployeeId);

  setText('drawerEmployeeName', `${employee.first_name || ''} ${employee.last_name || ''}`.trim());

  setText('drawerEmployeePosition', employee.position || '');

  setText('drawerEmployeeDepartment', employee.department || '');

  setText('drawerEmployeeStatus', employee.status || '');

  setAdminValue('employeeFirstNameInput', 'employeeFirstName')(employee.first_name || '');

  setAdminValue('employeeLastNameInput', 'employeeLastName')(employee.last_name || '');

  setAdminValue('employeeWorkEmailInput', 'empWorkEmail', 'workEmail')(
    employee.work_email || employee.workEmail || ''
  );
  setAdminValue('employeePersonalEmailInput', 'empPersonalEmail', 'personalEmail')(
    employee.personal_email || employee.personalEmail || employee.email || ''
  );

  setAdminValue('employeePhoneInput', 'empPhone', 'phone')(employee.phone || '');

  setAdminValue('employeeDepartmentInput', 'employeeDepartment')(employee.department || '');

  setAdminValue('employeePositionInput', 'employeePosition')(employee.position || '');

  setAdminValue('employeeSupervisorInput', 'employeeSupervisor')(employee.supervisor || '');

  setAdminValue('employeeStatusInput', 'employeeStatus')(
    normalizeStatusForAdminInput(employee.status)
  );

  setAdminValue('employeeHireDateInput', 'employeeHireDate')(employee.hire_date || '');

  setAdminValue('employeeTerminationDateInput', 'employeeTerminationDate')(
    formatDateForAdminInput(employee.termination_date || employee.terminationDate || '')
  );

  if (typeof window.syncEmployeeTerminationDateFieldVisibility === 'function') {
    window.syncEmployeeTerminationDateFieldVisibility(
      normalizeStatusForAdminInput(employee.status)
    );
  }

  setAdminValue('employeePayTypeInput', 'employeePayType')(
    String(employee.pay_type || '')
  );

  setAdminValue('employeeStandardHoursInput', 'employeeStandardHours')(
    employee.standard_hours ?? ''
  );

  setAdminValue('employeeBenefitsStatusInput', 'employeeBenefitsStatus')(
    String(employee.benefits_status || '')
  );

  setAdminValue('employeeNextReviewInput', 'employeeNextReviewDate')(
    String(employee.next_review_date || '')
  );

  setAdminValue('employeeAnniversaryDateInput', 'employeeAnniversaryDate')(
    String(employee.anniversary_date || '')
  );

  setAdminValue('employeeTenureBracketInput', 'employeeTenureBracket')(
    String(employee.tenure_bracket || '')
  );

  const remoteInput = safeGet<HTMLInputElement>('employeeIsRemoteInput');
  if (remoteInput) {
    remoteInput.checked = Boolean(employee.is_remote);
  }

  const atRiskBadge = safeGet('drawerAtRiskBadge');
  const riskMeta =
    typeof window.getEmployeeRiskMeta === 'function'
      ? window.getEmployeeRiskMeta(employee)
      : null;

  if (atRiskBadge) {
    atRiskBadge.style.display = riskMeta ? 'inline-flex' : 'none';
  }

  const impactBadge = safeGet('drawerImpactPlayerBadge');
  const impactMeta =
    typeof window.getEmployeeImpactMeta === 'function'
      ? window.getEmployeeImpactMeta(employee)
      : null;

  if (impactBadge) {
    impactBadge.style.display = impactMeta ? 'inline-flex' : 'none';
  }
}

function populateDrawerProfileDetails(employee: DrawerEmployeeRecord): void {
  const details = safeGet('drawerDetails');

  if (!details) return;

  const displayEmployeeId = String(
    employee.employee_id || employee.id || ''
  ).trim();

  const detailRows: Array<[string, unknown]> = [
    ['Employee ID', displayEmployeeId],
    ['Status', employee.status],
    ['Department', employee.dept || employee.department],
    ['Position', employee.position],
    ['Supervisor', employee.supervisor],
    ['Pay Type', employee.payType || employee.pay_type],
    ['Standard Hours', employee.stdHours || employee.standard_hours],
    ['Hire Date', formatDrawerDate(employee.hireDate || employee.hire_date)],
    [
      'Next Stay Interview',
      formatDrawerDate(
        employee.nextReview || employee.next_review_date || employee.next_review
      ),
    ],
    ['Anniversary', getNextAnniversaryDate(employee)],
    ['Tenure Months', formatEmployeeTenureMonths(employee)],
    ['Tenure Years', formatEmployeeTenureYears(employee)],
    ['Benefits Status', employee.benefitsStatus || employee.benefits_status],
    ['Tenure Bracket', employee.tenureBracket || employee.tenure_bracket],
    ['Phone', employee.phone || '—'],
    ['Work email', employeeWorkEmail(employee) || '—'],
    ['Personal email', employeePersonalEmail(employee) || '—'],
    ['PTO portal sign-in', employeePortalSignInEmail(employee) || 'Not set — add personal email in Employee Admin'],
    ['Work location', employee.is_remote ? 'Overseas / remote' : 'In house'],
  ];

  details.innerHTML = detailRows
    .map(
      ([label, value]) => `
        <div class="detail-card">
          <div class="detail-label">${escapeHtml(label)}</div>
          <div class="detail-value">${escapeHtml(value)}</div>
        </div>
      `
    )
    .join('');
}

function prepareEmployeeDrawerSession(employeeId: string): void {
  const recordId = String(employeeId || '').trim();
  if (!recordId) return;

  window.resetEmployeeDrawerTabLoadState?.();
}

export async function openEmployeeDrawer(employeeId: string): Promise<void> {
  if (!employeeId) {
    console.warn('[Drawer] Missing employee ID.');

    return;
  }

  let employee = await fetchEmployeeRecord(employeeId);

  if (!employee) {
    const current = window.currentEmployee as DrawerEmployeeRecord | null | undefined;

    if (
      current &&
      [current.id, current.dbId, current.employee_id]
        .filter(Boolean)
        .map(String)
        .includes(String(employeeId))
    ) {
      employee = current;
    }
  }

  if (!employee) {
    console.warn('[Drawer] Employee not found.');

    return;
  }

  const normalized =
    typeof (window as Window & { normalizeEmployee?: (e: DrawerEmployeeRecord) => DrawerEmployeeRecord | null })
      .normalizeEmployee === 'function'
      ? (window as Window & { normalizeEmployee: (e: DrawerEmployeeRecord) => DrawerEmployeeRecord | null })
          .normalizeEmployee(employee) || employee
      : employee;

  const recordId = String(
    (normalized as DrawerEmployeeRecord & { dbId?: string }).dbId || normalized.id || employeeId
  ).trim();

  populateDrawer(normalized);
  prepareEmployeeDrawerSession(recordId);
  openDrawer(normalized);
}

export function closeEmployeeDrawer(): void {
  selectedEmployee = null;
  openedEmployeeRecordId = null;

  window.selectedEmployeeId = null;
  window.resetEmployeeDrawerTabLoadState?.();

  if (typeof window.removeDrawerIdentityHeader === 'function') {
    window.removeDrawerIdentityHeader('employeeDrawerIdentityHeader');
  } else {
    document.getElementById('employeeDrawerIdentityHeader')?.remove();
  }

  document.getElementById('employeeDrawerChrome')?.replaceChildren();

  const drawer = document.getElementById('employeeDrawer');
  if (drawer && typeof window.restoreDrawerLegacyHeader === 'function') {
    window.restoreDrawerLegacyHeader(drawer);
  }

  closeDrawerUi();
}

export function syncOpenedEmployeeRecordId(employeeId: string): void {
  const recordId = String(employeeId || '').trim();

  if (!recordId) return;

  openedEmployeeRecordId = recordId;
  window.selectedEmployeeId = recordId;
}

function normalizeDrawerTabName(tabName: string): string {
  const rawOriginal = String(tabName || '').trim();

  const raw = rawOriginal
    .replace(/^#/, '')
    .replace(/Panel$/i, '')
    .replace(/Tab$/i, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase();

  if (raw.includes('incidentreport') || raw.includes('incident')) return 'incidentreports';
  if (raw.includes('stayinterview')) return 'stayinterviews';
  if (raw.includes('employeeadmin')) return 'employeeadmin';
  if (raw.includes('meeting')) return 'meetings';
  if (raw.includes('review')) return 'reviews';
  if (raw.includes('discipline')) return 'discipline';
  if (raw.includes('emergency')) return 'emergency';
  if (raw.includes('onboarding')) return 'onboarding';
  if (raw.includes('offboarding')) return 'offboarding';
  if (raw.includes('timeoff') || raw.includes('leave')) return 'timeoff';
  if (raw.includes('document')) return 'documents';
  if (raw.includes('history')) return 'history';
  if (raw.includes('notes')) return 'notes';
  if (raw.includes('profile')) return 'profile';
  if (raw.includes('caresupport') || raw.includes('careengagement')) return 'caresupport';

  const tabMap: Record<string, string> = {
    profile: 'profile',
    notes: 'notes',
    discipline: 'discipline',
    incidentreports: 'incidentreports',
    incidents: 'incidentreports',
    stayinterviews: 'stayinterviews',
    meetings: 'meetings',
    meeting: 'meetings',
    reviews: 'reviews',
    review: 'reviews',
    emergency: 'emergency',
    onboarding: 'onboarding',
    offboarding: 'offboarding',
    timeoff: 'timeoff',
    documents: 'documents',
    history: 'history',
    employeeadmin: 'employeeadmin',
    caresupport: 'caresupport',
  };

  return tabMap[raw] || raw;
}

function getSwitchTabName(normalizedTab: string): string {
  if (normalizedTab === 'stayinterviews') return 'stay-interviews';
  if (normalizedTab === 'incidentreports') return 'incidents';
  if (normalizedTab === 'offboarding') return 'offboarding';
  if (normalizedTab === 'timeoff') return 'time-off';
  if (normalizedTab === 'employeeadmin') return 'employee';
  if (normalizedTab === 'caresupport') return 'care-support';

  return normalizedTab;
}

export function switchDrawerTab(tabName: string): void {
  const normalizedTab = normalizeDrawerTabName(tabName);

  if (!normalizedTab) return;

  document.querySelectorAll('.tab-panel').forEach((panel) => {
    (panel as HTMLElement).style.display = '';
  });

  const employeeId = window.selectedEmployeeId || String(selectedEmployee?.id || '');

  if (normalizedTab === 'reviews' && employeeId) {
    const employee = selectedEmployee || (window.currentEmployee as Record<string, unknown> | null);
    if (
      typeof window.canAccessPerformanceReviews === 'function' &&
      !window.canAccessPerformanceReviews(employee)
    ) {
      window.showToast?.(
        'Performance reviews are only available for employees you supervise.',
        'error'
      );
      switchDrawerTabUi('profile');
      return;
    }
  }

  switchDrawerTabUi(getSwitchTabName(normalizedTab));
}

export async function refreshEmployeeDrawer(): Promise<void> {
  if (!window.selectedEmployeeId) {
    return;
  }

  await openEmployeeDrawer(window.selectedEmployeeId);
}

function getSupabaseBridgeClient() {
  const bridge = window as Window & {
    supabase?: unknown;
    supabaseClient?: unknown;
  };

  return (bridge.supabaseClient || bridge.supabase) as unknown as {
    from?: (table: string) => {
      update: (payload: Record<string, unknown>) => {
        eq: (column: string, value: string) => Promise<{ data: unknown; error: { message?: string } | null }>;
      };
      delete: () => {
        eq: (column: string, value: string) => Promise<{ data: unknown; error: { message?: string } | null }>;
      };
    };
  } | null;
}

function getInputValue(...ids: string[]): string {
  for (const id of ids) {
    const field = safeGet<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(id);

    if (!field) continue;

    return String(field.value || '').trim();
  }

  return '';
}

function showToast(message: string, type: string = 'success'): void {
  const maybeToast = (window as any).showToast;

  if (typeof maybeToast === 'function') {
    maybeToast(message, type);
    return;
  }

  console.log(`[${type}] ${message}`);
}

export async function saveEmployeeRecord(): Promise<void> {
  if (isEmployeeSaveInProgress) {
    return;
  }

  isEmployeeSaveInProgress = true;

  try {
    await saveEmployeeRecordInternal();
  } finally {
    isEmployeeSaveInProgress = false;
  }
}

async function saveEmployeeRecordInternal(): Promise<void> {
  if (!openedEmployeeRecordId) {
    const current = window.currentEmployee as (DrawerEmployeeRecord & { dbId?: string }) | null;

    openedEmployeeRecordId = String(current?.dbId || selectedEmployee?.id || '').trim();
  }

  const originalRecordId = getOpenedEmployeeRecordId();
  const isCreating =
    Boolean(window.isCreatingEmployee) || !originalRecordId;

  if (isCreating && !isAdminUser()) {
    showToast('Only HR administrators can create new employee records.', 'error');
    return;
  }

  if (!canEditEmployeeAdmin(window.currentEmployee as DrawerEmployeeRecord | null)) {
    showToast('You do not have permission to edit this employee record.', 'error');
    return;
  }

  let editedEmployeeId = getInputValue(
    'employeeIdInput',
    'employeeId',
    'empId',
    'empEmployeeId',
    'employeeRecordId',
    'employeeDisplayId'
  );

  const first_name = cleanEmployeeNameValue(
    getInputValue(
      'employeeFirstNameInput',
      'employeeFirstName',
      'empFirstName',
      'firstName',
      'employeeFirst'
    )
  );
  const last_name = cleanEmployeeNameValue(
    getInputValue(
      'employeeLastNameInput',
      'employeeLastName',
      'empLastName',
      'lastName',
      'employeeLast'
    )
  );

  if (!first_name || !last_name) {
    showToast('First name and last name are required.', 'error');
    return;
  }

  if (!editedEmployeeId && isCreating) {
    editedEmployeeId = await generateAvailableEmployeeId();
    const idFields = [
      'employeeIdInput',
      'employeeId',
      'empId',
      'empEmployeeId',
    ];
    idFields.forEach((id) => {
      const field = safeGet<HTMLInputElement>(id);
      if (field) {
        field.value = editedEmployeeId;
        field.dispatchEvent(new Event('input', { bubbles: true }));
        field.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  }

  if (!editedEmployeeId) {
    showToast('Employee ID is required.', 'error');
    return;
  }

  const client = getSupabaseBridgeClient();

  if (!client?.from) {
    showToast('Supabase client is not ready.', 'error');
    return;
  }

  const standardHoursRaw = getInputValue(
    'employeeStandardHoursInput',
    'employeeStandardHours'
  );

  const status =
    normalizeStatusForAdminInput(
      getInputValue('employeeStatusInput', 'employeeStatus', 'empStatus', 'status') || 'ACTIVE'
    ) || 'ACTIVE';

  let terminationDate = getInputValue(
    'employeeTerminationDateInput',
    'employeeTerminationDate',
    'empTerminationDate',
    'terminationDate'
  );

  if (status === 'TERMINATED' && !terminationDate) {
    terminationDate = new Date().toISOString().slice(0, 10);
  }

  const payload: Record<string, unknown> = {
    first_name,
    last_name,
    department: getInputValue(
      'employeeDepartmentInput',
      'employeeDepartment',
      'empDepartment',
      'department'
    ),
    position: getInputValue(
      'employeePositionInput',
      'employeePosition',
      'empPosition',
      'position'
    ),
    supervisor: getInputValue(
      'employeeSupervisorInput',
      'employeeSupervisor',
      'empSupervisor',
      'supervisor'
    ),
    status,
    hire_date:
      getInputValue('employeeHireDateInput', 'employeeHireDate', 'empHireDate', 'hireDate') ||
      null,
    pay_type:
      getInputValue('employeePayTypeInput', 'employeePayType', 'empPayType', 'payType') ||
      null,
    benefits_status: getInputValue(
      'employeeBenefitsStatusInput',
      'employeeBenefitsStatus',
      'empBenefitsStatus',
      'benefitsStatus'
    ) || null,
    next_review_date:
      getInputValue('employeeNextReviewInput', 'employeeNextReviewDate', 'empNextReviewDate', 'nextReviewDate') ||
      null,
    anniversary_date:
      getInputValue(
        'employeeAnniversaryDateInput',
        'employeeAnniversaryDate',
        'empAnniversaryDate',
        'anniversaryDate'
      ) || null,
    tenure_bracket:
      getInputValue(
        'employeeTenureBracketInput',
        'employeeTenureBracket',
        'empTenureBracket',
        'tenureBracket'
      ) || null,
    work_email:
      getInputValue('employeeWorkEmailInput', 'empWorkEmail', 'workEmail') || null,
    personal_email:
      getInputValue('employeePersonalEmailInput', 'empPersonalEmail', 'personalEmail') || null,
    phone: getInputValue('employeePhoneInput', 'empPhone', 'phone') || null,
    notes: getInputValue('empNotes', 'notes') || null,
    termination_date: status === 'TERMINATED' ? terminationDate || null : null,
    is_remote: Boolean(safeGet<HTMLInputElement>('employeeIsRemoteInput')?.checked),
  };

  if (payload.hire_date) {
    const tenure = resolveEmployeeTenureFields({ hire_date: String(payload.hire_date) });
    payload.tenure_months = tenure.tenure_months;
    payload.tenure_years = tenure.tenure_years;
  }

  payload.id = editedEmployeeId;

  if (standardHoursRaw !== '') {
    payload.standard_hours = Number(standardHoursRaw);
  }

  Object.keys(payload).forEach((key) => {
    if (payload[key] === '') delete payload[key];
  });

  const payrollBeforeSnapshot = employeeToPayrollSnapshot(
    window.currentEmployee as Record<string, unknown> | null | undefined
  );
  const statusBefore = normalizeStatusForAdminInput(
    String(
      (window.currentEmployee as Record<string, unknown> | null | undefined)?.status ||
        (window.currentEmployee as Record<string, unknown> | null | undefined)?.displayStatus ||
        ''
    )
  );
  const isNewTermination = status === 'TERMINATED' && statusBefore !== 'TERMINATED';

  Object.assign(
    payload,
    applyNewTerminationFieldsToPayload(payload, {
      isNewTermination,
      employee: window.currentEmployee as Record<string, unknown> | null | undefined,
      terminationDate: terminationDate || new Date().toISOString().slice(0, 10),
    })
  );

  if (isCreating) {
    const insertResult = await insertEmployeeRecordWithRetry(payload);
    const insertError = insertResult.error;
    editedEmployeeId = insertResult.employeeId;

    if (insertError) {
      showToast(insertError.message || 'Could not create employee.', 'error');
      return;
    }

    showToast('Employee created.');
    window.isCreatingEmployee = false;

    await createDefaultOnboardingTasks(editedEmployeeId);

    try {
      await logNewHirePayrollHandoff(
        editedEmployeeId,
        `${first_name} ${last_name}`,
        String(payload.hire_date || '')
      );
    } catch (err) {
      console.warn('[Drawer] New hire payroll handoff failed:', err);
    }

    if (typeof window.loadAllDashboardData === 'function') {
      await window.loadAllDashboardData();
    } else if (typeof window.loadEmployees === 'function') {
      await window.loadEmployees();
    }

    syncOpenedEmployeeRecordId(editedEmployeeId);

    const employees = window.EMPLOYEES || [];
    const refreshed = Array.isArray(employees)
      ? employees.find((e: DrawerEmployeeRecord) => String(e.id) === String(editedEmployeeId))
      : null;

    if (refreshed) {
      openDrawer(refreshed);
      if (typeof window.switchTab === 'function') {
        window.switchTab('employee');
      }
    } else {
      await openEmployeeDrawer(editedEmployeeId);
    }

    return;
  }

  if (!originalRecordId) {
    showToast('Open an employee first.', 'error');
    return;
  }

  const isEmployeeIdChanging = editedEmployeeId !== originalRecordId;

  if (isEmployeeIdChanging && !isAdminUser()) {
    showToast('Employee ID can only be changed by HR administrators.', 'error');
    return;
  }

  console.log('[Drawer] Saving employee:', {
    originalRecordId,
    editedEmployeeId,
    isEmployeeIdChanging,
    payload,
  });

  const updateEmployeeById = (window as {
    updateEmployeeById?: (
      employeeId: string,
      payload: Record<string, unknown>
    ) => Promise<{ error: { message?: string } | null }>;
  }).updateEmployeeById;

  let error: { message?: string } | null = null;
  let savedRow: Record<string, unknown> | null = null;

  if (typeof updateEmployeeById === 'function') {
    const result = await updateEmployeeById(originalRecordId, payload);
    error = result.error;
    savedRow = (result as { data?: Record<string, unknown> | null }).data || null;
  } else {
    const result = await client
      .from('employees')
      .update(payload)
      .eq('id', originalRecordId);

    error = result.error;
  }

  if (error) {
    showToast(error.message || 'Could not save employee.', 'error');
    return;
  }

  if (savedRow && window.currentEmployee) {
    window.currentEmployee = {
      ...(window.currentEmployee as Record<string, unknown>),
      ...savedRow,
    };
  }

  if (isEmployeeIdChanging) {
    const cascadeError = await cascadeEmployeeIdChange(
      originalRecordId,
      editedEmployeeId,
      client
    );
    if (cascadeError) {
      showToast(cascadeError.message, 'error');
      return;
    }
  }

  showToast('Employee saved.');

  if (payload.hire_date) {
    try {
      await syncStandardOnboardingTasks(editedEmployeeId);
    } catch (err) {
      console.warn('[Drawer] Onboarding due date refresh failed:', err);
    }
  }

  if (isNewTermination) {
    try {
      const { payrollHandoffs, warnings } = await runEmployeeTerminationSideEffects({
        employeeId: editedEmployeeId,
        employee: window.currentEmployee as Record<string, unknown> | null | undefined,
        payrollBefore: payrollBeforeSnapshot,
        payrollAfter: employeeToPayrollSnapshot(payload),
      });
      if (warnings.length) {
        showToast(`Employee saved, but: ${warnings.join(' ')}`, 'error');
      } else if (payrollHandoffs > 0) {
        showToast(
          `Logged ${payrollHandoffs} payroll handoff${payrollHandoffs === 1 ? '' : 's'} for external payroll.`
        );
      }
      window.invalidateEmployeeDrawerTab?.('employee');
    } catch (err) {
      console.warn('[Drawer] Termination side effects failed:', err);
      showToast('Employee saved, but termination follow-up tasks may be incomplete.', 'error');
    }
  } else {
    try {
      const handoffCount = await logPayrollHandoffsFromEmployeeSave({
        employeeId: editedEmployeeId,
        before: payrollBeforeSnapshot,
        after: payload,
      });
      if (handoffCount > 0) {
        showToast(
          `Logged ${handoffCount} payroll handoff${handoffCount === 1 ? '' : 's'} for external payroll.`
        );
      }
      window.invalidateEmployeeDrawerTab?.('employee');
      if (typeof window.loadHrInbox === 'function') {
        void window.loadHrInbox(true);
      }
    } catch (err) {
      console.warn('[Drawer] Payroll handoff logging failed:', err);
    }
  }

  syncOpenedEmployeeRecordId(editedEmployeeId);

  window.dispatchEvent(
    new CustomEvent('orbis:employee-record-saved', {
      detail: {
        originalRecordId,
        editedEmployeeId,
        isEmployeeIdChanging,
      },
    })
  );

  const maybeLoadEmployees = (window as any).loadEmployees;

  if (typeof maybeLoadEmployees === 'function') {
    await maybeLoadEmployees();
  }

  await openEmployeeDrawer(editedEmployeeId);
}

export async function deleteEmployeeRecord(): Promise<void> {
  const employeeId = getOpenedEmployeeRecordId();

  if (!employeeId) {
    showToast('Open an employee first.', 'error');
    return;
  }

  if (
    !(await showOrbisConfirm('Delete this employee record?', {
      title: 'Delete employee',
      confirmLabel: 'Delete',
      danger: true,
    }))
  ) {
    return;
  }

  const employee = window.currentEmployee as Record<string, unknown> | null;
  const { error } = await deleteEmployeeById(employeeId);

  if (error) {
    showToast(error.message || 'Could not delete employee.', 'error');
    return;
  }

  if (employee) {
    recordAuditEvent('Deleted Employee', employee, 'Employee record permanently deleted.');
  }

  showToast('Employee deleted permanently.');
  closeEmployeeDrawer();

  const maybeLoadEmployees = (window as any).loadEmployees;

  if (typeof maybeLoadEmployees === 'function') {
    await maybeLoadEmployees();
  }
}

function bindEmployeeAdminActions(): void {
  if ((window as any).__employeeAdminActionsBound) return;
  (window as any).__employeeAdminActionsBound = true;

  document.addEventListener(
    'click',
    async (event) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      const button = target.closest('button') as HTMLButtonElement | null;
      if (!button) return;

      const employeeDrawer = safeGet('employeeDrawer');
      if (employeeDrawer && !employeeDrawer.contains(button)) return;

      const buttonText = String(button.textContent || '')
        .trim()
        .toLowerCase();
      const buttonId = String(button.id || '')
        .trim()
        .toLowerCase();

      const isSaveEmployeeButton =
        buttonId === 'saveemployeebtn' ||
        buttonId === 'saveemployee' ||
        buttonText === 'save employee';

      const isDeleteEmployeeButton =
        buttonId === 'deleteemployeebtn' ||
        buttonId === 'deleteemployee' ||
        buttonText === 'delete employee';

      if (!isSaveEmployeeButton && !isDeleteEmployeeButton) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      if (isSaveEmployeeButton) {
        await saveEmployeeRecord();
        return;
      }

      if (isDeleteEmployeeButton) {
        await deleteEmployeeRecord();
      }
    },
    true
  );
}

bindEmployeeAdminActions();

window.openEmployeeDrawer = openEmployeeDrawer;

window.closeEmployeeDrawer = closeEmployeeDrawer;

window.switchDrawerTab = switchDrawerTab;

window.refreshEmployeeDrawer = refreshEmployeeDrawer;

window.saveEmployeeRecord = saveEmployeeRecord;
window.deleteEmployeeRecord = deleteEmployeeRecord;
window.syncOpenedEmployeeRecordId = syncOpenedEmployeeRecordId;
window.closeDrawer = () => {
  if (typeof window.closeActiveDrawer === 'function') {
    window.closeActiveDrawer();
    return;
  }

  closeEmployeeDrawer();
};