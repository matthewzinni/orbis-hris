// DOM locks, dashboard views, and drawer permission UI.
import { applyPayrollReliefLinks } from '../brand/payrollPortal';
import type { EmployeeLike } from './accessTypes';
import {
  accessSafeGet,
  getCurrentUserAccess,
  getCurrentUserRole,
  isEmployeeUser,
  isPortalUser,
  isSupervisorUser,
} from './accessState';
import {
  canAccessAppSection,
  canManageEmployeeRecords,
  EMPLOYEE_PORTAL_SECTIONS,
  hasPersonalEmployeePortal,
  isAdminUser,
  setCurrentUserAccess,
} from './accessRoles';
import {
  canAccessPerformanceReviews,
  canAccessDisciplineForEmployee,
  canEditEmployeeAdmin,
  hasOrgWideDisciplineAccess,
} from './accessScopes';

const EMPLOYEE_ADMIN_FIELD_IDS = [
  'empId',
  'employeeId',
  'empEmployeeId',
  'employeeIdInput',
  'empStatus',
  'status',
  'employeeStatusInput',
  'empFirstName',
  'firstName',
  'employeeFirstName',
  'employeeFirstNameInput',
  'empLastName',
  'lastName',
  'employeeLastName',
  'employeeLastNameInput',
  'empDepartment',
  'department',
  'employeeDepartment',
  'employeeDepartmentInput',
  'empPosition',
  'position',
  'employeePosition',
  'employeePositionInput',
  'empSupervisor',
  'supervisor',
  'employeeSupervisor',
  'employeeSupervisorInput',
  'empPayType',
  'payType',
  'employeePayTypeInput',
  'empStandardHours',
  'standardHours',
  'employeeStandardHoursInput',
  'empBenefitsStatus',
  'benefitsStatus',
  'employeeBenefitsStatusInput',
  'empHireDate',
  'hireDate',
  'employeeHireDateInput',
  'employeeTerminationDateInput',
  'employeeTerminationDate',
  'empTerminationDate',
  'terminationDate',
  'empNextReviewDate',
  'nextReviewDate',
  'employeeNextReviewInput',
  'empAnniversaryDate',
  'anniversaryDate',
  'employeeAnniversaryDateInput',
  'empTenureBracket',
  'tenureBracket',
  'employeeTenureBracketInput',
  'empWorkEmail',
  'workEmail',
  'employeeWorkEmailInput',
  'empPersonalEmail',
  'personalEmail',
  'employeePersonalEmailInput',
  'empPhone',
  'phone',
  'empNotes',
  'notes',
  'atRiskReasonInput',
  'impactPlayerReasonInput',
];

const EMPLOYEE_ID_FIELD_IDS = [
  'empId',
  'employeeId',
  'empEmployeeId',
  'employeeIdInput',
];

const EMPLOYEE_FLAG_BUTTON_IDS = [
  'markAtRiskBtn',
  'clearAtRiskBtn',
  'markImpactPlayerBtn',
  'clearImpactPlayerBtn',
];

function setEmployeeAdminFieldsLocked(locked: boolean, lockTitle: string): void {
  const lockMessage =
    lockTitle || 'Locked: you can only edit employee admin for people on your team';

  EMPLOYEE_ADMIN_FIELD_IDS.forEach((id) => {
    const field = accessSafeGet(id) as HTMLInputElement | HTMLTextAreaElement | null;
    if (!field) return;
    field.disabled = locked;
    field.readOnly = locked;
    if (locked) {
      field.title = lockMessage;
    } else {
      field.removeAttribute('title');
    }
  });

  const adminPanel = document.getElementById('tab-employee');
  adminPanel
    ?.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      'input, select, textarea'
    )
    .forEach((field) => {
      field.disabled = locked;
      if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
        field.readOnly = locked;
      }
      if (locked) {
        field.title = lockMessage;
      } else {
        field.removeAttribute('title');
      }
    });
}

function setSupervisorEmployeeIdFieldsLocked(): void {
  if (!isSupervisorUser()) return;

  const lockMessage = 'Employee ID can only be changed by HR administrators';
  EMPLOYEE_ID_FIELD_IDS.forEach((id) => {
    const field = accessSafeGet(id) as HTMLInputElement | null;
    if (!field) return;
    field.disabled = true;
    field.readOnly = true;
    field.title = lockMessage;
  });
}

function setEmployeeFlagButtonsLocked(locked: boolean, lockTitle: string): void {
  const lockMessage =
    lockTitle || 'Locked: you can only change flags for people on your team';

  EMPLOYEE_FLAG_BUTTON_IDS.forEach((id) => {
    const btn = accessSafeGet(id) as HTMLButtonElement | null;
    if (!btn) return;
    btn.disabled = locked;
    btn.classList.toggle('hidden', locked);
    if (locked) {
      btn.title = lockMessage;
    } else {
      btn.removeAttribute('title');
    }
  });
}

function applyDisciplineTabAccess(employee?: EmployeeLike | null): void {
  const allowed = canAccessDisciplineForEmployee(employee);
  const drawer = document.getElementById('employeeDrawer');
  const tabBtn = drawer?.querySelector<HTMLButtonElement>('[data-tab="discipline"]');
  const panel = document.getElementById('tab-discipline');
  const wasOnDisciplineTab =
    tabBtn?.getAttribute('aria-selected') === 'true' || tabBtn?.classList.contains('active');

  if (tabBtn) {
    tabBtn.classList.toggle('hidden', !allowed);
    tabBtn.setAttribute('aria-hidden', allowed ? 'false' : 'true');
    if (!allowed) {
      tabBtn.classList.remove('active');
      tabBtn.setAttribute('aria-selected', 'false');
      tabBtn.tabIndex = -1;
    }
  }

  if (panel) {
    if (!allowed) {
      panel.classList.remove('active');
      panel.hidden = true;
      panel.setAttribute('aria-hidden', 'true');
    }
  }

  if (!allowed && wasOnDisciplineTab && typeof window.activateDrawerTab === 'function') {
    window.activateDrawerTab('employee', 'profile', false);
  }
}

function applyDisciplineDashboardAccess(): void {
  const orgWide = hasOrgWideDisciplineAccess();

  document.getElementById('cardOpenDiscipline')?.classList.toggle('hidden', !orgWide);

  const reportsOpenDiscipline = document.getElementById('reportsKpiOpenDiscipline');
  reportsOpenDiscipline?.closest('.detail-card')?.classList.toggle('hidden', !orgWide);

  document.getElementById('reportsErOpenDiscipline')?.closest('.detail-card')?.classList.toggle('hidden', !orgWide);
  document.getElementById('reportsErDiscipline90')?.closest('.detail-card')?.classList.toggle('hidden', !orgWide);

  document
    .querySelectorAll<HTMLElement>('[data-reports-discipline-only]')
    .forEach((element) => {
      element.classList.toggle('hidden', !orgWide);
    });

  const activitySubtitle = document.querySelector<HTMLElement>(
    '#orbisSectionActivity .mobile-activity-toolbar .muted'
  );
  if (activitySubtitle) {
    activitySubtitle.textContent = orgWide
      ? 'Recent notes, discipline, reviews, and team updates'
      : 'Recent notes, discipline for your team, reviews, and team updates';
  }
}

function applyPerformanceReviewTabAccess(employee?: EmployeeLike | null): void {
  const allowed = canAccessPerformanceReviews(employee);
  const drawer = document.getElementById('employeeDrawer');
  const tabBtn = drawer?.querySelector<HTMLButtonElement>('[data-tab="reviews"]');
  const panel = document.getElementById('tab-reviews');
  const wasOnReviewsTab =
    tabBtn?.getAttribute('aria-selected') === 'true' || tabBtn?.classList.contains('active');

  if (tabBtn) {
    tabBtn.classList.toggle('hidden', !allowed);
    tabBtn.setAttribute('aria-hidden', allowed ? 'false' : 'true');
    if (!allowed) {
      tabBtn.classList.remove('active');
      tabBtn.setAttribute('aria-selected', 'false');
      tabBtn.tabIndex = -1;
    }
  }

  if (panel) {
    if (!allowed) {
      panel.classList.remove('active');
      panel.hidden = true;
      panel.setAttribute('aria-hidden', 'true');
    }
  }

  if (!allowed && wasOnReviewsTab && typeof window.activateDrawerTab === 'function') {
    window.activateDrawerTab('employee', 'profile', false);
  }
}

export function applyRoleNavigation(): void {
  const role = String(getCurrentUserRole() || '').toLowerCase();

  applyDisciplineDashboardAccess();

  document.querySelectorAll<HTMLElement>('[data-nav-view]').forEach((button) => {
    const sectionId = String(button.dataset.navView || '').trim();
    const allowed = canAccessAppSection(sectionId);
    button.classList.toggle('hidden', !allowed);
    (button as HTMLButtonElement).disabled = !allowed;
  });

  document
    .querySelectorAll<HTMLElement>(
      '#dashboardQuickLinks [data-nav-view], .orbis-quick-links [data-nav-view]'
    )
    .forEach((button) => {
      const sectionId = String(button.dataset.navView || '').trim();
      const allowed = canAccessAppSection(sectionId);
      button.classList.toggle('hidden', !allowed);
      (button as HTMLButtonElement).disabled = !allowed;
    });

  document.querySelectorAll<HTMLElement>('[data-personal-portal-link]').forEach((element) => {
    const sectionId = String(element.dataset.navView || '').trim();
    const allowed = sectionId ? canAccessAppSection(sectionId) : hasPersonalEmployeePortal();
    element.classList.toggle('hidden', !allowed);
  });

  if (role === 'admin') {
    document.querySelectorAll('[data-admin-only="true"], .admin-only').forEach((el) => {
      (el as HTMLElement).classList.remove('hidden');
      (el as HTMLInputElement).disabled = false;
    });
  }

  if (typeof window.refreshMobileNavigation === 'function') {
    window.refreshMobileNavigation();
  }
}

export function applyEmployeePortalView(): void {
  if (!isEmployeeUser()) return;

  document.getElementById('supervisorBanner')?.remove();

  const access = getCurrentUserAccess();
  const name = access?.display_name || 'My Profile';
  const title = accessSafeGet('dashboardTitle');
  if (title) title.textContent = name;

  document.querySelectorAll('.orbis-sidebar-nav .orbis-nav-item').forEach((button) => {
    const view = String((button as HTMLElement).dataset.navView || '');
    const allowed = EMPLOYEE_PORTAL_SECTIONS.has(view);
    (button as HTMLElement).classList.toggle('hidden', !allowed);
    (button as HTMLButtonElement).disabled = !allowed;
    if (!allowed) {
      button.classList.remove('active');
      button.removeAttribute('aria-current');
    }
  });

  const myProfileNav = document.getElementById('navMyProfile');
  if (myProfileNav) {
    myProfileNav.classList.add('active');
    myProfileNav.setAttribute('aria-current', 'page');
  }

  document.querySelectorAll('[data-employee-portal-hide="true"]').forEach((el) => {
    (el as HTMLElement).classList.add('hidden');
  });

  document.querySelectorAll('[data-admin-only="true"], .admin-only').forEach((el) => {
    (el as HTMLElement).classList.add('hidden');
    (el as HTMLInputElement).disabled = true;
  });
}

export function applyAdminDashboardView(): void {
  document.getElementById('supervisorBanner')?.remove();
  window.applyManagerHomeAccess?.();

  const currentView = String(window.currentMainView || 'dashboardView');
  const dashboardTitle = accessSafeGet('dashboardTitle');
  if (dashboardTitle && currentView === 'dashboardView') {
    dashboardTitle.textContent = 'Dashboard';
  }

  const rosterHeader = document.querySelector('#employeeRosterCard .card-header > span');
  if (rosterHeader) rosterHeader.textContent = 'Employee Roster';

  const activeLabel = document
    .querySelector('#kActiveHC')
    ?.closest('.kpi-card')
    ?.querySelector('.kpi-label');
  if (activeLabel) activeLabel.textContent = 'Active Headcount';

  const reviewsLabel = document.querySelector('#cardReviewsDue .kpi-label');
  if (reviewsLabel) {
    reviewsLabel.innerHTML = `Stay Interviews Due
              <span
                id="kReviewsDueInfo"
                class="info-icon"
                title="Counts active employees whose next stay interview date is today or earlier."
                style="cursor: help; font-size: 0.8rem; color: var(--muted)"
                >ⓘ</span
              >`;
  }

  const performanceReviewsLabel = document.querySelector('#cardPerformanceReviewsDue .kpi-label');
  if (performanceReviewsLabel) {
    performanceReviewsLabel.innerHTML = `Performance Reviews Due
              <span
                id="kPerformanceReviewsDueInfo"
                class="info-icon"
                title="90-day and annual performance reviews overdue or due within 7 days."
                style="cursor: help; font-size: 0.8rem; color: var(--muted)"
                >ⓘ</span
              >`;
  }

  const riskLabel = document.querySelector('#cardTurnoverRisk .kpi-label');
  if (riskLabel) {
    riskLabel.innerHTML = `Turnover Risk
              <span
                class="info-icon"
                title="Score is based on early tenure (0-6 months) and overdue reviews. Higher score = higher retention risk."
                style="cursor: help; font-size: 0.8rem; color: var(--muted)"
                >ⓘ</span
              >`;
  }

  const leaveLabel = document
    .querySelector('#kOnLeave')
    ?.closest('.kpi-card')
    ?.querySelector('.kpi-label');
  if (leaveLabel) leaveLabel.textContent = 'Employees on Leave';

  const deptCard = document.querySelector('#kDepartments')?.closest('.kpi-card');
  if (deptCard) deptCard.classList.remove('hidden');

  document.querySelectorAll('[data-admin-only="true"], .admin-only').forEach((el) => {
    (el as HTMLElement).classList.remove('hidden');
    (el as HTMLInputElement).disabled = false;
    (el as HTMLElement).removeAttribute('title');
  });
}

export function clearOrbisSessionState(): void {
  delete (window as { currentUserEmail?: string }).currentUserEmail;
  setCurrentUserAccess(null, 'user');
  window.EMPLOYEES = [];
  window.ALL_EMPLOYEES = [];
  window.currentEmployeeRoster = [];
  window.currentFilteredEmployees = [];
  const signedInEl = accessSafeGet('currentUserEmail');
  if (signedInEl) signedInEl.textContent = '—';
  applyAdminDashboardView();
}

export function applySupervisorDashboardView(): void {
  if (!isSupervisorUser()) return;

  applyAdminDashboardView();

  const access = getCurrentUserAccess();
  const name =
    access?.display_name || access?.supervisor_name || 'Supervisor';

  const currentView = String(window.currentMainView || 'dashboardView');
  const title = accessSafeGet('dashboardTitle');
  if (title && currentView === 'dashboardView') {
    title.textContent = `${name}'s Team Dashboard`;
  }

  const rosterTitle =
    accessSafeGet('rosterTitle') ||
    document.querySelector('#employeeRosterCard h2, #employeeRosterCard h3, .roster-title');

  if (rosterTitle) rosterTitle.textContent = 'My Team';

  const activeLabel = document
    .querySelector('#kActiveHC')
    ?.closest('.kpi-card')
    ?.querySelector('.kpi-label');
  if (activeLabel) activeLabel.textContent = 'My Team Size';

  const reviewsLabel = document
    .querySelector('#kReviewsDue')
    ?.closest('.kpi-card')
    ?.querySelector('.kpi-label');
  if (reviewsLabel) reviewsLabel.textContent = 'My Stay Interviews Due';

  const performanceReviewsLabel = document
    .querySelector('#kPerformanceReviewsDue')
    ?.closest('.kpi-card')
    ?.querySelector('.kpi-label');
  if (performanceReviewsLabel) {
    performanceReviewsLabel.textContent = 'My Performance Reviews Due';
  }

  const riskLabel = document
    .querySelector('#kTurnoverRisk')
    ?.closest('.kpi-card')
    ?.querySelector('.kpi-label');
  if (riskLabel) riskLabel.textContent = 'My Team Risk';

  const leaveLabel = document
    .querySelector('#kOnLeave')
    ?.closest('.kpi-card')
    ?.querySelector('.kpi-label');
  if (leaveLabel) leaveLabel.textContent = 'My Team On Leave';

  const deptCard = document.querySelector('#kDepartments')?.closest('.kpi-card');
  if (deptCard) deptCard.classList.add('hidden');

  document.querySelectorAll('[data-admin-only="true"], .admin-only').forEach((el) => {
    (el as HTMLElement).classList.add('hidden');
    (el as HTMLInputElement).disabled = true;
  });

  window.applyManagerHomeAccess?.();

  const existingBanner = document.getElementById('supervisorBanner');
  if (!existingBanner && !document.getElementById('managerHomeCard')) {
    const banner = document.createElement('div');
    banner.id = 'supervisorBanner';
    banner.style.padding = '10px';
    banner.style.marginBottom = '10px';
    banner.style.borderRadius = '6px';
    banner.style.background = '#eef2ff';
    banner.style.fontSize = '14px';

    const employees = window.EMPLOYEES || [];
    const riskMap = window.currentAtRiskRosterMap || {};
    const atRisk = employees.filter((e: EmployeeLike) => {
      const key = String(e.dbId || e.id || '');
      const risk = riskMap[key] as {
        lowReview?: boolean;
        manualReason?: string;
        disciplineRisk?: boolean;
      } | undefined;
      return (
        risk &&
        (risk.lowReview ||
          Boolean(String(risk.manualReason || '').trim()) ||
          risk.disciplineRisk)
      );
    }).length;

    const teamCount = employees.filter((e: EmployeeLike) => {
      if (typeof window.isActiveDashboardEmployee === 'function') {
        return window.isActiveDashboardEmployee(e);
      }
      const status = String(e.status || e.displayStatus || '')
        .trim()
        .toUpperCase();
      return status === 'ACTIVE' || status === 'LEAVE';
    }).length;

    banner.textContent = `You have ${teamCount} active team member${teamCount === 1 ? '' : 's'}. ${atRisk} may need attention.`;
    const container = document.querySelector('.dashboard') || document.body;
    container?.prepend(banner);
  }
}

export function applyRoleLocks(): void {
  const adminOnlyIds = ['deleteEmployeeBtn', 'terminateEmployeeBtn'];
  adminOnlyIds.forEach((id) => {
    const el = accessSafeGet(id) as HTMLButtonElement | null;
    if (!el) return;
    const locked = !canManageEmployeeRecords();
    el.disabled = locked;
    el.title = locked ? 'Locked: admin access required' : '';
  });

  applyAddEmployeeAsCandidateAccess();
}

export function applyAddEmployeeAsCandidateAccess(): void {
  const section = accessSafeGet('employeeInternalMobilitySection');
  const button = accessSafeGet('addEmployeeAsCandidateBtn') as HTMLButtonElement | null;
  if (!section && !button) return;

  const show =
    isAdminUser() && !Boolean(window.isCreatingEmployee) && Boolean(window.currentEmployee);

  if (section) {
    section.classList.toggle('hidden', !show);
  }

  if (button) {
    button.classList.toggle('hidden', !show);
    button.disabled = !show;
    if (show) {
      button.removeAttribute('title');
    } else {
      button.title = isAdminUser()
        ? 'Open a saved employee record to add them as a candidate'
        : 'Admin access required';
    }
  }
}

export function ensureDeleteEmployeeButton(): HTMLButtonElement | null {
  const drawer =
    accessSafeGet('employeeDrawer') ||
    document.querySelector('#employeeDrawer') ||
    document.querySelector('.drawer.open');
  const searchRoot = drawer || document;

  const findButtonByText = (labels: string[]) => {
    const normalizedLabels = labels.map((label) => String(label).trim().toLowerCase());
    return Array.from(searchRoot.querySelectorAll('button')).find((button) =>
      normalizedLabels.includes(
        String(button.textContent || '')
          .trim()
          .toLowerCase()
      )
    );
  };

  const newBtn =
    (drawer?.querySelector("button[onclick='openNewEmployeeForm()']") as HTMLButtonElement | null) ||
    (drawer?.querySelector('#newEmployeeBtn') as HTMLButtonElement | null) ||
    findButtonByText(['New Employee']);

  const saveBtn =
    (drawer?.querySelector('#saveEmployeeBtn') as HTMLButtonElement | null) ||
    findButtonByText(['Update Employee', 'Save Employee']);

  const actionsRow =
    (newBtn?.parentElement as HTMLElement | null) ||
    (saveBtn?.parentElement as HTMLElement | null) ||
    (drawer?.querySelector('.form-actions') as HTMLElement | null) ||
    (drawer?.querySelector('.actions') as HTMLElement | null) ||
    (drawer?.querySelector('#tab-employee') as HTMLElement | null) ||
    (drawer?.querySelector('#tab-profile') as HTMLElement | null) ||
    (drawer as HTMLElement | null);

  if (!actionsRow) {
    console.warn('Could not find employee action row for Archive/Terminate buttons.');
    return null;
  }

  let archiveBtn = accessSafeGet('deleteEmployeeBtn') as HTMLButtonElement | null;
  if (!archiveBtn) {
    archiveBtn = document.createElement('button');
    archiveBtn.type = 'button';
    archiveBtn.id = 'deleteEmployeeBtn';
    archiveBtn.className = 'button danger';
    archiveBtn.textContent = 'Delete Employee';
    archiveBtn.onclick = () => {
      if (typeof window.runDeleteEmployee === 'function') {
        window.runDeleteEmployee();
      }
    };
  }

  let terminateBtn = accessSafeGet('terminateEmployeeBtn') as HTMLButtonElement | null;
  if (!terminateBtn) {
    terminateBtn = document.createElement('button');
    terminateBtn.type = 'button';
    terminateBtn.id = 'terminateEmployeeBtn';
    terminateBtn.className = 'button danger';
    terminateBtn.textContent = 'Terminate Employee';
    terminateBtn.onclick = () => {
      if (typeof window.runTerminateEmployee === 'function') {
        window.runTerminateEmployee();
      }
    };
  }

  if (!actionsRow.contains(archiveBtn)) {
    if (newBtn?.nextSibling) {
      actionsRow.insertBefore(archiveBtn, newBtn.nextSibling);
    } else {
      actionsRow.appendChild(archiveBtn);
    }
  }

  if (!actionsRow.contains(terminateBtn)) {
    if (archiveBtn?.nextSibling) {
      actionsRow.insertBefore(terminateBtn, archiveBtn.nextSibling);
    } else {
      actionsRow.appendChild(terminateBtn);
    }
  }

  archiveBtn.classList.remove('hidden');
  terminateBtn.classList.remove('hidden');
  applyRoleLocks();
  return archiveBtn;
}

export function applyRolePermissions(): void {
  const supervisorMode = isSupervisorUser();
  const deleteEmployeeBtn = ensureDeleteEmployeeButton();
  const terminateBtn = accessSafeGet('terminateEmployeeBtn') as HTMLButtonElement | null;
  const currentEmployee = window.currentEmployee as Record<string, unknown> | null | undefined;
  const isCreatingEmployee = Boolean(window.isCreatingEmployee);
  const currentEmergencyContactId = window.currentEmergencyContactId;

  if (currentEmployee) {
    const status = String(currentEmployee.status || '').toUpperCase();
    if (deleteEmployeeBtn) {
      const shouldHideDeleteEmployee = isCreatingEmployee || supervisorMode;
      deleteEmployeeBtn.classList.toggle('hidden', shouldHideDeleteEmployee);
    }
    if (terminateBtn) {
      const shouldHideTerminate = status === 'TERMINATED' || supervisorMode;
      terminateBtn.classList.toggle('hidden', shouldHideTerminate);
    }
  } else {
    deleteEmployeeBtn?.classList.add('hidden');
    terminateBtn?.classList.add('hidden');
  }

  const deleteECBtn = accessSafeGet('deleteECBtn') as HTMLButtonElement | null;
  if (deleteECBtn) {
    deleteECBtn.classList.toggle('hidden', !currentEmergencyContactId);
  }

  if (supervisorMode) {
    document
      .querySelectorAll(
        '#deleteEmployeeBtn, #terminateEmployeeBtn, #addEmployeeAsCandidateBtn, #employeeInternalMobilitySection, .delete-btn, .danger-delete, [data-delete-review-id], [data-admin-only="true"]'
      )
      .forEach((el) => {
        (el as HTMLElement).classList.add('hidden');
        (el as HTMLInputElement).disabled = true;
        (el as HTMLElement).title =
          'Locked: supervisors cannot delete or terminate records';
      });

    const newEmployeeBtn =
      (accessSafeGet('newEmployeeBtn') as HTMLButtonElement | null) ||
      (document.querySelector(
        "button[onclick='openNewEmployeeForm()']"
      ) as HTMLButtonElement | null);

    if (newEmployeeBtn) {
      newEmployeeBtn.disabled = true;
      newEmployeeBtn.classList.add('hidden');
      newEmployeeBtn.title = 'Locked: supervisors cannot create employee records';
    }
  } else {
    const newEmployeeBtn =
      (accessSafeGet('newEmployeeBtn') as HTMLButtonElement | null) ||
      (document.querySelector(
        "button[onclick='openNewEmployeeForm()']"
      ) as HTMLButtonElement | null);

    if (newEmployeeBtn) {
      newEmployeeBtn.classList.remove('hidden');
      newEmployeeBtn.disabled = false;
      newEmployeeBtn.removeAttribute('title');
    }
  }

  const canEditAdmin = canEditEmployeeAdmin(currentEmployee as EmployeeLike | null | undefined);
  const saveEmployeeBtn = accessSafeGet('saveEmployeeBtn') as HTMLButtonElement | null;

  if (canEditAdmin) {
    setEmployeeAdminFieldsLocked(false, '');
    setEmployeeFlagButtonsLocked(false, '');
    setSupervisorEmployeeIdFieldsLocked();

    if (saveEmployeeBtn) {
      saveEmployeeBtn.classList.remove('hidden');
      saveEmployeeBtn.disabled = false;
      saveEmployeeBtn.removeAttribute('title');
    }
  } else {
    setEmployeeAdminFieldsLocked(
      true,
      supervisorMode
        ? 'Locked: you can only edit employee admin for people on your team'
        : 'Locked: admin access required'
    );
    setEmployeeFlagButtonsLocked(
      true,
      supervisorMode
        ? 'Locked: you can only change flags for people on your team'
        : 'Locked: admin access required'
    );

    if (saveEmployeeBtn) {
      saveEmployeeBtn.disabled = true;
      saveEmployeeBtn.classList.add('hidden');
      saveEmployeeBtn.title = supervisorMode
        ? 'Locked: you can only edit employee admin for people on your team'
        : 'Locked: admin access required';
    }
  }

  applyRoleLocks();
  applyPerformanceReviewTabAccess(currentEmployee as EmployeeLike | null | undefined);
  applyDisciplineTabAccess(currentEmployee as EmployeeLike | null | undefined);
  applyDisciplineDashboardAccess();

  if (typeof window.applyAttendanceAccess === 'function') {
    window.applyAttendanceAccess();
  }

  if (typeof window.applyHrInboxAccess === 'function') {
    window.applyHrInboxAccess();
  }

  if (typeof window.applyLeaveAccess === 'function') {
    window.applyLeaveAccess();
  }

  applyRoleNavigation();
  applyPayrollReliefLinks();

  if (isPortalUser()) {
    applyEmployeePortalView();
  }
}
