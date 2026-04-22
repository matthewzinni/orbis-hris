window.addEventListener('DOMContentLoaded', () => {
    const currentDateEl = safeGet('currentDate');
    if (currentDateEl) {
        currentDateEl.textContent = new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric'
        });
    }

    initializeAuth();

    document.querySelectorAll('th[data-sort]').forEach(th => {
        th.style.cursor = 'pointer';
        th.addEventListener('click', () => {
            const nextColumn = th.dataset.sort;
            if (!nextColumn) return;

            if (currentSort.column === nextColumn) {
                currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
            } else {
                currentSort.column = nextColumn;
                currentSort.direction = 'asc';
            }

            renderRoster();
        });
    });

    safeGet('globalSearch')?.addEventListener('input', renderRoster);
    safeGet('deptFilter')?.addEventListener('change', renderRoster);
    safeGet('statusFilter')?.addEventListener('change', renderRoster);
});

let EMPLOYEES = [];
let currentFilteredEmployees = [];
let currentEmployee = null;
let currentDisciplineReportId = null;
let currentNoteId = null;
let currentMeetingId = null;
let currentReviewId = null;
let currentEmergencyContactId = null;
let currentIncidentReportId = null;
let currentStayInterviewId = null;
let isCreatingEmployee = false;
let currentSort = {
    column: 'name',
    direction: 'asc'
};

let currentUserRole = 'user';
let currentManualAtRiskState = { flagged: false, reason: '' };
let currentAtRiskRosterMap = {};
let currentManualImpactPlayerState = { flagged: false, reason: '' };
let currentImpactPlayerRosterMap = {};

// Shared helper, formatting, toast, and print functions now live in:
// js/utils/helpers.js

// =========================
// AUTH
// =========================
function setLoginBusy(isBusy) {
    const btn = safeGet('loginBtn');
    if (!btn) return;
    btn.disabled = isBusy;
    btn.textContent = isBusy ? 'Signing In...' : 'Sign In';
}

// =========================
// UI / NAVIGATION
// =========================
function switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.classList.toggle('active', panel.id === `tab-${tabName}`);
    });
}

function openNewEmployeeForm() {
    if (typeof startNewEmployee === 'function') {
        try {
            startNewEmployee();
            return;
        } catch (err) {
            console.error(err);
        }
    }

    currentEmployee = null;
    isCreatingEmployee = true;
    resetDrawerForms();
    switchTab('employee');

    setText('drawerTitle', 'New Employee');
    setText('drawerSub', 'Create employee record');

    if (safeGet('employeeIdInput')) safeGet('employeeIdInput').value = '';
    if (safeGet('employeeStatusInput')) safeGet('employeeStatusInput').value = 'ACTIVE';
    if (safeGet('employeeFirstNameInput')) safeGet('employeeFirstNameInput').value = '';
    if (safeGet('employeeLastNameInput')) safeGet('employeeLastNameInput').value = '';
    if (safeGet('employeeDepartmentInput')) safeGet('employeeDepartmentInput').value = '';
    if (safeGet('employeePositionInput')) safeGet('employeePositionInput').value = '';
    if (safeGet('employeeSupervisorInput')) safeGet('employeeSupervisorInput').value = '';
    if (safeGet('employeePayTypeInput')) safeGet('employeePayTypeInput').value = '';
    if (safeGet('employeeStandardHoursInput')) safeGet('employeeStandardHoursInput').value = '';
    if (safeGet('employeeBenefitsStatusInput')) safeGet('employeeBenefitsStatusInput').value = '';
    if (safeGet('employeeHireDateInput')) safeGet('employeeHireDateInput').value = '';
    if (safeGet('employeeNextReviewInput')) safeGet('employeeNextReviewInput').value = '';
    if (safeGet('employeeAnniversaryDateInput')) safeGet('employeeAnniversaryDateInput').value = '';
    if (safeGet('employeeTenureBracketInput')) safeGet('employeeTenureBracketInput').value = '';

    if (safeGet('saveEmployeeBtn')) safeGet('saveEmployeeBtn').textContent = 'Save Employee';

    const backdrop = safeGet('drawerBackdrop');
    const drawer = safeGet('employeeDrawer');
    if (backdrop) backdrop.classList.add('open');
    if (drawer) drawer.classList.add('open');
}

async function runDeleteEmployee() {
    if (typeof deleteEmployeeRecord === 'function') {
        await deleteEmployeeRecord();
        return;
    }

    if (typeof deleteEmployee === 'function') {
        return deleteEmployee();
    }

    showToast('Delete employee function is not available yet.', 'error');
}

// =========================
// FORM RESET / STATE MANAGEMENT
// =========================
function resetDrawerForms() {
    if (safeGet('noteDate')) safeGet('noteDate').value = todayInputValue();
    if (safeGet('noteType')) safeGet('noteType').value = '';
    if (safeGet('noteText')) safeGet('noteText').value = '';

    if (safeGet('disciplineDate')) safeGet('disciplineDate').value = todayInputValue();
    if (safeGet('disciplineType')) safeGet('disciplineType').value = '';
    if (safeGet('disciplineDescription')) safeGet('disciplineDescription').value = '';
    if (safeGet('disciplineAction')) safeGet('disciplineAction').value = '';
    if (safeGet('disciplineStatus')) safeGet('disciplineStatus').value = 'Open';

    if (safeGet('incidentDate')) safeGet('incidentDate').value = todayInputValue();
    if (safeGet('incidentType')) safeGet('incidentType').value = '';
    if (safeGet('incidentLocation')) safeGet('incidentLocation').value = '';
    if (safeGet('incidentDescription')) safeGet('incidentDescription').value = '';
    if (safeGet('incidentFollowUp')) safeGet('incidentFollowUp').value = '';
    if (safeGet('incidentStatus')) safeGet('incidentStatus').value = 'Open';

    if (safeGet('meetingDate')) safeGet('meetingDate').value = todayInputValue();
    if (safeGet('meetingType')) safeGet('meetingType').value = '';
    if (safeGet('meetingSubject')) safeGet('meetingSubject').value = '';
    if (safeGet('meetingNotes')) safeGet('meetingNotes').value = '';

    if (safeGet('reviewDate')) safeGet('reviewDate').value = todayInputValue();
    if (safeGet('reviewType')) safeGet('reviewType').value = '';
    if (safeGet('reviewAttendance')) safeGet('reviewAttendance').value = '';
    if (safeGet('reviewPerformance')) safeGet('reviewPerformance').value = '';
    if (safeGet('reviewTeamwork')) safeGet('reviewTeamwork').value = '';
    if (safeGet('reviewAttitude')) safeGet('reviewAttitude').value = '';
    if (safeGet('reviewReliability')) safeGet('reviewReliability').value = '';
    if (safeGet('reviewOverallResult')) safeGet('reviewOverallResult').value = '';
    if (safeGet('reviewStrengths')) safeGet('reviewStrengths').value = '';
    if (safeGet('reviewImprovements')) safeGet('reviewImprovements').value = '';
    if (safeGet('reviewEmployeeComments')) safeGet('reviewEmployeeComments').value = '';
    if (safeGet('reviewManagerComments')) safeGet('reviewManagerComments').value = '';

    if (safeGet('stayInterviewDate')) safeGet('stayInterviewDate').value = todayInputValue();
    if (safeGet('stayInterviewType')) safeGet('stayInterviewType').value = '';
    if (safeGet('stayQ1')) safeGet('stayQ1').value = '';
    if (safeGet('stayQ2')) safeGet('stayQ2').value = '';
    if (safeGet('stayQ3')) safeGet('stayQ3').value = '';
    if (safeGet('stayQ4')) safeGet('stayQ4').value = '';
    if (safeGet('stayQ5')) safeGet('stayQ5').value = '';
    if (safeGet('stayQ6')) safeGet('stayQ6').value = '';
    if (safeGet('stayQ7')) safeGet('stayQ7').value = '';
    if (safeGet('stayManagerSummary')) safeGet('stayManagerSummary').value = '';

    if (safeGet('ecName')) safeGet('ecName').value = '';
    if (safeGet('ecRelationship')) safeGet('ecRelationship').value = '';
    if (safeGet('ecPhone')) safeGet('ecPhone').value = '';
    if (safeGet('ecAltPhone')) safeGet('ecAltPhone').value = '';
    if (safeGet('ecNotes')) safeGet('ecNotes').value = '';
    if (safeGet('atRiskReasonInput')) safeGet('atRiskReasonInput').value = '';
    currentManualAtRiskState = { flagged: false, reason: '' };
    if (safeGet('impactPlayerReasonInput')) safeGet('impactPlayerReasonInput').value = '';
    currentManualImpactPlayerState = { flagged: false, reason: '' };

    currentDisciplineReportId = null;
    currentEmergencyContactId = null;
    currentIncidentReportId = null;
    currentStayInterviewId = null;
    currentNoteId = null;
    currentMeetingId = null;
    currentReviewId = null;
    isCreatingEmployee = false;

    if (safeGet('saveDisciplineBtn')) safeGet('saveDisciplineBtn').textContent = 'Save Discipline Report';
    if (safeGet('saveIncidentBtn')) safeGet('saveIncidentBtn').textContent = 'Save Incident Report';
    if (safeGet('saveStayInterviewBtn')) safeGet('saveStayInterviewBtn').textContent = 'Save Stay Interview';
    if (safeGet('saveNoteBtn')) safeGet('saveNoteBtn').textContent = 'Save Note';
    if (safeGet('saveMeetingBtn')) safeGet('saveMeetingBtn').textContent = 'Save Meeting';
    if (safeGet('saveReviewBtn')) safeGet('saveReviewBtn').textContent = 'Save Review';

    safeGet('cancelDisciplineEditBtn')?.classList.add('hidden');
    safeGet('disciplineEditStatus')?.classList.add('hidden');
    safeGet('cancelIncidentEditBtn')?.classList.add('hidden');
    safeGet('incidentEditStatus')?.classList.add('hidden');
    safeGet('cancelStayInterviewEditBtn')?.classList.add('hidden');
    safeGet('stayInterviewEditStatus')?.classList.add('hidden');
    safeGet('cancelMeetingEditBtn')?.classList.add('hidden');
    safeGet('meetingEditStatus')?.classList.add('hidden');
    safeGet('cancelReviewEditBtn')?.classList.add('hidden');
    safeGet('reviewEditStatus')?.classList.add('hidden');
}

// =========================
// EDIT CANCEL HANDLERS
// =========================



function cancelStayInterviewEdit() {
    currentStayInterviewId = null;
    if (safeGet('stayInterviewDate')) safeGet('stayInterviewDate').value = todayInputValue();
    if (safeGet('stayInterviewType')) safeGet('stayInterviewType').value = '';
    if (safeGet('stayQ1')) safeGet('stayQ1').value = '';
    if (safeGet('stayQ2')) safeGet('stayQ2').value = '';
    if (safeGet('stayQ3')) safeGet('stayQ3').value = '';
    if (safeGet('stayQ4')) safeGet('stayQ4').value = '';
    if (safeGet('stayQ5')) safeGet('stayQ5').value = '';
    if (safeGet('stayQ6')) safeGet('stayQ6').value = '';
    if (safeGet('stayQ7')) safeGet('stayQ7').value = '';
    if (safeGet('stayManagerSummary')) safeGet('stayManagerSummary').value = '';
    if (safeGet('saveStayInterviewBtn')) safeGet('saveStayInterviewBtn').textContent = 'Save Stay Interview';
    safeGet('cancelStayInterviewEditBtn')?.classList.add('hidden');
    safeGet('stayInterviewEditStatus')?.classList.add('hidden');
}


function compareText(a, b) {
    return String(a || '').localeCompare(String(b || ''), undefined, { sensitivity: 'base' });
}

async function signIn() {
    const email = safeGet('loginEmail')?.value.trim().toLowerCase() || '';
    const password = safeGet('loginPassword')?.value || '';

    if (!email || !password) {
        showToast('Enter your email and password.', 'error');
        return;
    }

    setLoginBusy(true);

    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

        if (error) {
            console.error(error);
            showToast('Invalid email or password, or this account is not authorized.', 'error');
            setAuthView(null);
            return;
        }

        if (!data?.session) {
            showToast('Sign-in failed. No active session was created.', 'error');
            setAuthView(null);
            return;
        }

        setAuthView(data.session);
        setText('currentUserEmail', data.session.user?.email || email);
        showToast('Signed in successfully.');
    } catch (err) {
        console.error(err);
        showToast('Something went wrong during sign-in.', 'error');
        setAuthView(null);
    } finally {
        setLoginBusy(false);
    }
}

async function signOut() {
    try {
        const { error } = await supabaseClient.auth.signOut();
        if (error) {
            console.error(error);
            showToast('Could not log out.', 'error');
            return;
        }

        currentEmployee = null;
        EMPLOYEES = [];
        currentFilteredEmployees = [];
        closeDrawer();
        showToast('Logged out.');
        setAuthView(null);
    } catch (err) {
        console.error(err);
        showToast('Something went wrong during logout.', 'error');
    }
}

async function initializeAuth() {
    try {
        const { data, error } = await supabaseClient.auth.getSession();

        if (error) {
            console.error(error);
            showToast('Could not check session.', 'error');
            setAuthView(null);
            return;
        }

        setAuthView(data?.session || null);

        supabaseClient.auth.onAuthStateChange((_event, session) => {
            setAuthView(session || null);
        });
    } catch (err) {
        console.error(err);
        showToast('Could not initialize authentication.', 'error');
        setAuthView(null);
    }
}

function setAuthView(session) {
    const authView = safeGet('authView');
    const appView = safeGet('appView');

    if (!authView || !appView) return;

    if (session?.user) {
        authView.classList.add('hidden');
        appView.classList.remove('hidden');
        setText('currentUserEmail', session.user.email || 'Signed in');

        currentUserRole = 'user';
        applyRolePermissions();

        getUserRole()
            .then(role => {
                currentUserRole = role || 'user';
                applyRolePermissions();
            })
            .catch(err => {
                console.error(err);
                currentUserRole = 'user';
                applyRolePermissions();
            });

        loadAllDashboardData();
    } else {
        currentUserRole = 'user';
        applyRolePermissions();
        appView.classList.add('hidden');
        authView.classList.remove('hidden');
        setText('currentUserEmail', '—');
        if (safeGet('loginPassword')) safeGet('loginPassword').value = '';
    }
}

let isLoadingDashboard = false;

async function getUserRole() {
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) return null;

        const { data, error } = await supabaseClient
            .from('profiles')
            .select('hr_role')
            .eq('id', user.id);

        if (error) {
            console.error(error);
            return null;
        }

        const roles = (data || [])
            .map(row => String(row.hr_role || '').toLowerCase().trim())
            .filter(Boolean);

        if (roles.includes('admin')) return 'admin';
        if (roles.includes('user')) return 'user';
        return roles[0] || 'user';
    } catch (err) {
        console.error(err);
        return null;
    }
}

function canManageEmployeeRecords() {
    return String(currentUserRole || '').toLowerCase() === 'admin';
}
function getAuditTrail() {

    try {

        const raw = localStorage.getItem('btw_hris_audit_trail');

        const parsed = raw ? JSON.parse(raw) : [];

        return Array.isArray(parsed) ? parsed : [];

    } catch (_err) {

        return [];

    }

}

function recordAuditEvent(action, employee, details = '') {

    try {

        const audit = getAuditTrail();

        const entry = {

            action,

            employeeId: employee?.id || employee?.dbId || '',

            employeeName: employee ? `${employee.first || ''} ${employee.last || ''}`.trim() : '',

            details: String(details || '').trim(),

            userRole: currentUserRole || 'user',

            timestamp: new Date().toISOString()

        };

        audit.unshift(entry);

        localStorage.setItem('btw_hris_audit_trail', JSON.stringify(audit.slice(0, 75)));

    } catch (err) {

        console.error('Could not write audit trail.', err);

    }

}

function applyRoleLocks() {

    const adminOnlyIds = [

        'saveEmployeeBtn',

        'deleteEmployeeBtn'

    ];

    adminOnlyIds.forEach(id => {

        const el = safeGet(id);

        if (!el) return;

        const locked = !canManageEmployeeRecords();

        el.disabled = locked;

        el.title = locked ? 'Locked: admin access required' : '';

    });

}


function applyRolePermissions() {
    const deleteEmployeeBtn = ensureDeleteEmployeeButton();
    if (deleteEmployeeBtn) {
        const shouldHideDeleteEmployee = isCreatingEmployee || !currentEmployee;
        deleteEmployeeBtn.classList.toggle('hidden', shouldHideDeleteEmployee);
    }

    const deleteECBtn = safeGet('deleteECBtn');
    if (deleteECBtn) {
        const shouldHideDeleteEC = !currentEmergencyContactId;
        deleteECBtn.classList.toggle('hidden', shouldHideDeleteEC);
    }
}

function ensureDeleteEmployeeButton() {
    let btn = safeGet('deleteEmployeeBtn');
    if (btn) return btn;

    const newBtn = document.querySelector("button[onclick='openNewEmployeeForm()']") || safeGet('newEmployeeBtn');
    const saveBtn = safeGet('saveEmployeeBtn');
    const actionsRow = (newBtn && newBtn.parentElement) || (saveBtn && saveBtn.parentElement);
    if (!actionsRow) return null;

    btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'deleteEmployeeBtn';
    btn.className = 'button danger';
    btn.textContent = 'Delete Employee';
    btn.onclick = () => runDeleteEmployee();

    if (newBtn && newBtn.nextSibling) {
        actionsRow.insertBefore(btn, newBtn.nextSibling);
    } else {
        actionsRow.appendChild(btn);
        applyRoleLocks();
    }

    return btn;
}

async function loadAllDashboardData() {
    if (isLoadingDashboard) return;
    isLoadingDashboard = true;

    try {
        await Promise.all([
            loadEmployees(),
            loadSummaryMetrics(),
            loadRecentActivity()
        ]);

        setText('lastRefresh', new Date().toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit'
        }));
    } catch (err) {
        console.error(err);
        showToast('Could not refresh dashboard data.', 'error');
    } finally {
        isLoadingDashboard = false;
    }
    initKpiHoverUi();
    buildKpiHoverDetails();
}

async function loadEmployees() {
    try {
        const { data, error } = await getEmployees();


        if (error) {
            console.error(error);
            setText('empCount', 'Error loading employees');
            showToast('Could not load employees from Supabase.', 'error');
            return;
        }

        EMPLOYEES = (data || []).map(e => ({
            dbId: e.id,
            id: e.employee_id || e.id,
            first: e.first_name,
            last: e.last_name,
            dept: e.department,
            position: e.position,
            supervisor: e.supervisor,
            hireDate: e.hire_date ? new Date(e.hire_date + 'T00:00:00') : null,
            status: String(e.status || '').toUpperCase(),
            payType: e.pay_type,
            stdHours: Number(e.standard_hours) || 0,
            nextReview: e.next_review_date ? new Date(e.next_review_date + 'T00:00:00') : null,
            tenureMonths: Number(e.tenure_months) || 0,
            tenureYears: Number(e.tenure_years) || 0,
            benefitsStatus: e.benefits_status,
            anniversaryDate: e.anniversary_date ? new Date(e.anniversary_date + 'T00:00:00') : null,
            tenureBracket: e.tenure_bracket,
            raw: e
        }));

        populateDepartmentFilter();
        renderRoster();
        renderDepartmentSummary();
        renderKpiEmployeeMetrics();

        await loadReviewDashboard();
        await loadExecutiveInsight();
        await loadRiskEmployees();
        await loadImpactPlayers();
    } catch (err) {
        console.error(err);
        setText('empCount', 'Error loading employees');
        showToast('Something went wrong while loading employee data.', 'error');
    }
}

function populateDepartmentFilter() {
    const deptSelect = safeGet('deptFilter');
    if (!deptSelect) return;

    const currentValue = deptSelect.value;

    const depts = [...new Set(
        EMPLOYEES.map(e => e.dept).filter(Boolean)
    )].sort(compareText);

    deptSelect.innerHTML =
        '<option value="">All Departments</option>' +
        depts.map(d => `<option value="${esc(d)}">${esc(d)}</option>`).join('');

    deptSelect.value = currentValue;
}

function getFilteredEmployees() {
    const q = (safeGet('globalSearch')?.value || '').toLowerCase().trim();
    const dept = safeGet('deptFilter')?.value || '';
    const status = safeGet('statusFilter')?.value || '';

    return EMPLOYEES.filter(e => {
        const haystack = `${e.first || ''} ${e.last || ''} ${e.id || ''} ${e.position || ''} ${e.dept || ''} ${e.supervisor || ''}`.toLowerCase();

        if (q && !haystack.includes(q)) return false;
        if (dept && e.dept !== dept) return false;
        if (status && e.status !== status) return false;

        return true;
    }).sort((a, b) => {
        let valA, valB;

        switch (currentSort.column) {
            case 'id':
                valA = a.id || '';
                valB = b.id || '';
                break;
            case 'name':
                valA = `${a.last || ''} ${a.first || ''}`;
                valB = `${b.last || ''} ${b.first || ''}`;
                break;
            case 'dept':
                valA = a.dept || '';
                valB = b.dept || '';
                break;
            case 'position':
                valA = a.position || '';
                valB = b.position || '';
                break;
            case 'supervisor':
                valA = a.supervisor || '';
                valB = b.supervisor || '';
                break;
            case 'hireDate': {
                const timeA = a.hireDate ? a.hireDate.getTime() : 0;
                const timeB = b.hireDate ? b.hireDate.getTime() : 0;
                return currentSort.direction === 'asc' ? timeA - timeB : timeB - timeA;
            }
            case 'status':
                valA = a.status || '';
                valB = b.status || '';
                break;
            default:
                valA = `${a.last || ''} ${a.first || ''}`;
                valB = `${b.last || ''} ${b.first || ''}`;
        }

        const result = compareText(valA, valB);
        return currentSort.direction === 'asc' ? result : -result;
    });
}


function renderRoster() {
    const body = safeGet('empBody');
    if (!body) return;

    const filtered = getFilteredEmployees();
    currentFilteredEmployees = filtered;

    if (!filtered.length) {
        body.innerHTML = '<tr><td colspan="7" class="empty">No employees match the current filters</td></tr>';
        setText('empCount', `Showing 0 of ${EMPLOYEES.length} employees`);
        return;
    }

    body.innerHTML = filtered.map(e => `
        <tr>
          <td>${esc(e.id)}</td>
          <td>
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              <button class="link-button" data-view-id="${esc(e.id)}" type="button">
                ${esc(e.first)} ${esc(e.last)}
              </button>
              ${buildRiskBadgeHtml(getEmployeeRiskMeta(e))}
              ${buildImpactBadgeHtml(getEmployeeImpactMeta(e))}
            </div>
          </td>
          <td>${esc(e.dept || '')}</td>
          <td>${esc(e.position || '')}</td>
          <td>${esc(e.supervisor || '')}</td>
          <td>${fmtDate(e.hireDate)}</td>
          <td><span class="${statusBadge(e.status)}">${esc(e.status)}</span></td>
        </tr>
      `).join('');

    setText('empCount', `Showing ${filtered.length} of ${EMPLOYEES.length} employees`);

    document.querySelectorAll('[data-view-id]').forEach(btn => {
        btn.addEventListener('click', () => {
            const employee = EMPLOYEES.find(e => String(e.id) === String(btn.dataset.viewId));
            if (employee) openDrawer(employee);
        });
    });
}

function clearFilters() {
    if (safeGet('globalSearch')) safeGet('globalSearch').value = '';
    if (safeGet('deptFilter')) safeGet('deptFilter').value = '';
    if (safeGet('statusFilter')) safeGet('statusFilter').value = '';
    currentSort = {
        column: 'name',
        direction: 'asc'
    };
    renderRoster();
}

function renderDepartmentSummary() {
    const body = safeGet('deptSummaryBody');
    if (!body) return;

    const counts = {};
    EMPLOYEES.filter(e => e.status === 'ACTIVE').forEach(e => {
        const dept = e.dept || 'Unassigned';
        counts[dept] = (counts[dept] || 0) + 1;
    });

    const rows = Object.entries(counts).sort((a, b) => compareText(a[0], b[0]));

    if (!rows.length) {
        body.innerHTML = '<tr><td colspan="2" class="empty">No department data available</td></tr>';
        return;
    }

    body.innerHTML = rows.map(([dept, count]) => `
        <tr>
          <td>${esc(dept)}</td>
          <td>${count}</td>
        </tr>
      `).join('');
}

function renderKpiEmployeeMetrics() {
    const active = EMPLOYEES.filter(e => e.status === 'ACTIVE');
    const reviewEligibleActive = active.filter(e => !String(e.payType || '').toLowerCase().includes('contract'));
    const departments = [...new Set(active.map(e => e.dept).filter(Boolean))];
    const onLeave = EMPLOYEES.filter(e => e.status === 'LEAVE').length;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const overdueReviewEmployees = reviewEligibleActive.filter(e => {
        if (!e.nextReview || !(e.nextReview instanceof Date) || isNaN(e.nextReview)) return false;
        const reviewDate = new Date(e.nextReview);
        reviewDate.setHours(0, 0, 0, 0);
        return reviewDate <= today;
    });
    const reviewsDue = overdueReviewEmployees.length;

    let turnoverRiskContributors = 0;
    const turnoverRisk = reviewEligibleActive.reduce((score, e) => {
        let employeeRisk = 0;
        const tenureMonths = Number(e.tenureMonths) || 0;

        if (tenureMonths <= 1) employeeRisk += 3;
        else if (tenureMonths <= 3) employeeRisk += 2;
        else if (tenureMonths <= 6) employeeRisk += 1;

        if (e.nextReview && e.nextReview instanceof Date && !isNaN(e.nextReview)) {
            const reviewDate = new Date(e.nextReview);
            reviewDate.setHours(0, 0, 0, 0);
            if (reviewDate <= today) employeeRisk += 1;
        }

        if (employeeRisk > 0) turnoverRiskContributors += 1;
        return score + employeeRisk;
    }, 0);

    setText('kActiveHC', active.length);
    setText('kDepartments', departments.length);
    if (typeof window.updateTurnoverRiskKpi === 'function') {
        window.updateTurnoverRiskKpi(
            turnoverRisk,
            `${turnoverRiskContributors} employee${turnoverRiskContributors === 1 ? '' : 's'} contributing to risk`
        );
    } else {
        setText('kTurnoverRisk', turnoverRisk);
        setText(
            'kTurnoverRiskSub',
            `${turnoverRiskContributors} employee${turnoverRiskContributors === 1 ? '' : 's'} contributing to risk`
        );
    }

    const turnoverRiskCard = safeGet('kTurnoverRisk')?.closest('.kpi-card');
    if (turnoverRiskCard) {
        turnoverRiskCard.classList.remove('good', 'warn', 'alert');
        if (turnoverRisk >= 15) turnoverRiskCard.classList.add('alert');
        else if (turnoverRisk >= 7) turnoverRiskCard.classList.add('warn');
        else turnoverRiskCard.classList.add('good');
    }

    setText('kOnLeave', onLeave);
    if (typeof window.updateReviewsDueKpi === 'function') {
        window.updateReviewsDueKpi(reviewsDue);
    } else {
        setText('kReviewsDue', reviewsDue);
    }

    const reviewsDueInfo = safeGet('kReviewsDueInfo');
    if (reviewsDueInfo) {
        const overdueNames = overdueReviewEmployees
            .map(e => `${e.first || ''} ${e.last || ''}`.trim())
            .filter(Boolean)
            .sort((a, b) => compareText(a, b));

        reviewsDueInfo.title = overdueNames.length
            ? `Counts active non-contract employees whose next review date is today or earlier. Due now: ${overdueNames.join(', ')}`
            : 'Counts active non-contract employees whose next review date is today or earlier. No overdue reviews right now.';
    }
}

function applyReviewImpactPlayers(latestReviewByEmployee) {
    Object.entries(latestReviewByEmployee).forEach(([employeeId, item]) => {
        if (item.avgScore !== null && item.avgScore >= 4) {
            if (!currentImpactPlayerRosterMap[employeeId]) {
                currentImpactPlayerRosterMap[employeeId] = {
                    manualReason: '',
                    flaggedDate: '',
                    flaggedBy: '',
                    highReview: false,
                    reviewScore: null
                };
            }

            currentImpactPlayerRosterMap[employeeId].highReview = true;
            currentImpactPlayerRosterMap[employeeId].reviewScore = item.avgScore;
        }
    });
}

async function loadSummaryMetrics() {
    try {
        const [disciplineRes, reviewsRes, incidentsRes, manualRiskRes, impactPlayerRes] = await Promise.all([
            supabaseClient
                .from('discipline_reports')
                .select('id, employee_id, issue_type, report_status, employees(first_name, last_name)'),
            supabaseClient
                .from('employee_reviews')
                .select('employee_id, attendance_score, performance_score, teamwork_score, attitude_score, reliability_score, created_at, review_date'),
            supabaseClient
                .from('incident_reports')
                .select('employee_id, status'),
            supabaseClient
                .from('employee_notes')
                .select('employee_id, note_type, note_text, note_date, created_at, created_by')
                .in('note_type', ['At-Risk Flag', 'At-Risk Cleared'])
                .order('created_at', { ascending: false })
            , supabaseClient
                .from('employee_notes')
                .select('employee_id, note_type, note_text, note_date, created_at')
                .in('note_type', ['Impact Player Flag', 'Impact Player Cleared'])
                .order('created_at', { ascending: false })
        ]);

        if (!disciplineRes.error) {
            const openDisciplineCases = (disciplineRes.data || []).filter(row =>
                String(row.report_status || '').trim().toLowerCase() !== 'closed'
            );

            const openCount = openDisciplineCases.length;
            setText('kOpenDiscipline', openCount);

            const disciplineCard = document.getElementById('cardOpenDiscipline');
            if (disciplineCard) {
                const openDisciplineNames = openDisciplineCases
                    .map(row => {
                        const employee = row?.employees || null;
                        const first = String(employee?.first_name || '').trim();
                        const last = String(employee?.last_name || '').trim();
                        const fullName = `${first} ${last}`.trim();
                        const issueType = String(row?.issue_type || '').trim();

                        if (fullName && issueType) return `${fullName} (${issueType})`;
                        if (fullName) return fullName;
                        if (issueType) return issueType;
                        return 'Unnamed discipline case';
                    })
                    .filter(Boolean);

                const disciplineTooltip = openDisciplineNames.length
                    ? openDisciplineNames.join('\n')
                    : 'No open discipline cases';

                disciplineCard.setAttribute('data-tooltip', disciplineTooltip);
                disciplineCard.removeAttribute('title');
            }
        } else {
            console.error(disciplineRes.error);
            setText('kOpenDiscipline', '—');

            const disciplineCard = document.getElementById('cardOpenDiscipline');
            if (disciplineCard) {
                disciplineCard.setAttribute('data-tooltip', 'Could not load discipline cases');
                disciplineCard.removeAttribute('title');
            }
        }

        const reviewRiskEmployeeIds = new Set();
        const incidentRiskEmployeeIds = new Set();
        const manualRiskEmployeeIds = new Set();
        const latestReviewByEmployee = {};
        const impactPlayerEmployeeIds = new Set();

        if (!reviewsRes.error) {
            (reviewsRes.data || []).forEach(row => {
                const employeeId = row.employee_id;
                const sortDate = row.review_date || row.created_at || '';
                if (!employeeId) return;

                if (!latestReviewByEmployee[employeeId] || String(sortDate) > String(latestReviewByEmployee[employeeId].sortDate)) {
                    const scoreValues = [
                        row.attendance_score,
                        row.performance_score,
                        row.teamwork_score,
                        row.attitude_score,
                        row.reliability_score
                    ].filter(v => v !== null && v !== undefined && v !== '');

                    const avgScore = scoreValues.length
                        ? scoreValues.reduce((sum, v) => sum + Number(v), 0) / scoreValues.length
                        : null;

                    latestReviewByEmployee[employeeId] = { avgScore, sortDate };
                }
            });

            Object.entries(latestReviewByEmployee).forEach(([employeeId, item]) => {
                if (item.avgScore !== null && item.avgScore <= 3) {
                    reviewRiskEmployeeIds.add(String(employeeId));
                }
            });
        } else {
            console.error(reviewsRes.error);
        }

        if (!incidentsRes.error) {
            (incidentsRes.data || []).forEach(row => {
                const status = String(row.status || '').toLowerCase();
                if (row.employee_id && status !== 'closed') {
                    incidentRiskEmployeeIds.add(String(row.employee_id));
                }
            });
        } else {
            console.error(incidentsRes.error);
        }

        if (!manualRiskRes.error) {
            const latestManualRiskByEmployee = {};
            Object.keys(currentAtRiskRosterMap).forEach(key => {
                const existing = currentAtRiskRosterMap[key];
                currentAtRiskRosterMap[key] = {
                    ...existing,
                    lowReview: false,
                    reviewScore: null,
                    openIncidentCount: 0
                };
            });
            (manualRiskRes.data || []).forEach(row => {
                const employeeId = String(row.employee_id || '');
                if (!employeeId) return;
                if (!latestManualRiskByEmployee[employeeId]) {
                    latestManualRiskByEmployee[employeeId] = row;
                }
            });

            Object.entries(latestManualRiskByEmployee).forEach(([employeeId, row]) => {
                if (String(row.note_type || '') === 'At-Risk Flag') {
                    manualRiskEmployeeIds.add(employeeId);
                }
            });

            Object.entries(latestManualRiskByEmployee).forEach(([employeeId, row]) => {
                if (!currentAtRiskRosterMap[employeeId]) {
                    currentAtRiskRosterMap[employeeId] = {
                        manualReason: '',
                        lowReview: false,
                        reviewScore: null,
                        openIncidentCount: 0,
                        flaggedDate: '',
                        flaggedBy: ''
                    };
                }

                if (String(row.note_type || '') === 'At-Risk Flag') {
                    currentAtRiskRosterMap[employeeId].manualReason = String(row.note_text || '').trim();
                    currentAtRiskRosterMap[employeeId].flaggedDate = String(row.note_date || '').trim();
                    currentAtRiskRosterMap[employeeId].flaggedBy = 'Matthew Zinni';
                }
            });
            Object.entries(latestReviewByEmployee).forEach(([employeeId, item]) => {
                if (item.avgScore !== null && item.avgScore <= 3) {
                    if (!currentAtRiskRosterMap[employeeId]) {
                        currentAtRiskRosterMap[employeeId] = {
                            manualReason: '',
                            lowReview: false,
                            reviewScore: null,
                            openIncidentCount: 0,
                            flaggedDate: '',
                            flaggedBy: ''
                        };
                    }
                    currentAtRiskRosterMap[employeeId].lowReview = true;
                    currentAtRiskRosterMap[employeeId].reviewScore = item.avgScore;
                }
            });

            incidentRiskEmployeeIds.forEach(employeeId => {
                if (!currentAtRiskRosterMap[employeeId]) {
                    currentAtRiskRosterMap[employeeId] = {
                        manualReason: '',
                        lowReview: false,
                        reviewScore: null,
                        openIncidentCount: 0,
                        flaggedDate: '',
                        flaggedBy: ''
                    };
                }

                currentAtRiskRosterMap[employeeId].openIncidentCount =
                    (currentAtRiskRosterMap[employeeId].openIncidentCount || 0) + 1;
            });
            // Refresh roster so new manual At-Risk badge appears
            if (Array.isArray(EMPLOYEES) && EMPLOYEES.length) {
                renderRoster();
            }

        } else {
            console.error(manualRiskRes.error);
            // Preserve existing manual state when the notes query fails.
            if (Array.isArray(EMPLOYEES) && EMPLOYEES.length) {
                renderRoster();
            }
        }

        if (!impactPlayerRes.error) {
            const latestImpactPlayerByEmployee = {};
            Object.keys(currentImpactPlayerRosterMap).forEach(key => {
                const existing = currentImpactPlayerRosterMap[key];
                currentImpactPlayerRosterMap[key] = {
                    ...existing,
                    highReview: false,
                    reviewScore: null
                };
            });

            (impactPlayerRes.data || []).forEach(row => {
                const employeeId = String(row.employee_id || '');
                if (!employeeId) return;
                if (!latestImpactPlayerByEmployee[employeeId]) {
                    latestImpactPlayerByEmployee[employeeId] = row;
                }
            });

            Object.entries(latestImpactPlayerByEmployee).forEach(([employeeId, row]) => {
                if (String(row.note_type || '') === 'Impact Player Flag') {
                    impactPlayerEmployeeIds.add(employeeId);
                    currentImpactPlayerRosterMap[employeeId] = {
                        manualReason: String(row.note_text || '').trim(),
                        flaggedDate: String(row.note_date || '').trim(),
                        flaggedBy: 'Matthew Zinni',
                        highReview: false,
                        reviewScore: null
                    };
                }
            });
            if (Array.isArray(EMPLOYEES) && EMPLOYEES.length) {
                renderRoster();
            }
        } else {
            console.error(impactPlayerRes.error);
            // Preserve existing impact player state when the notes query fails.
            if (Array.isArray(EMPLOYEES) && EMPLOYEES.length) {
                renderRoster();
            }
        }

        Object.entries(latestReviewByEmployee).forEach(([employeeId, item]) => {
            if (item.avgScore !== null && item.avgScore >= 4) {
                impactPlayerEmployeeIds.add(employeeId);
            }
        });
        applyReviewImpactPlayers(latestReviewByEmployee);

        Object.keys(currentImpactPlayerRosterMap || {}).forEach(key => {
            const meta = currentImpactPlayerRosterMap[key];
            const hasManualFlag = !!(meta?.manualReason && String(meta.manualReason).trim() !== '');
            const hasReviewFlag = meta?.highReview === true;

            if (!hasManualFlag && !hasReviewFlag) {
                delete currentImpactPlayerRosterMap[key];
            }
        });

        const combinedRiskEmployeeIds = new Set([
            ...reviewRiskEmployeeIds,
            ...incidentRiskEmployeeIds,
            ...manualRiskEmployeeIds
        ]);

        const atRiskEmployees = combinedRiskEmployeeIds.size;
        const impactPlayers = Object.values(currentImpactPlayerRosterMap || {}).filter(meta =>
            meta && (
                meta.highReview === true ||
                (meta.manualReason && meta.manualReason.trim() !== '')
            )
        ).length;
        const hasAnyData = !reviewsRes.error || !incidentsRes.error;

        if (hasAnyData) {
            if (typeof window.updateAtRiskKpi === 'function') {
                window.updateAtRiskKpi(atRiskEmployees);
            } else {
                setText('kAtRiskEmployees', atRiskEmployees);
                setText(
                    'kAtRiskEmployeesSub',
                    atRiskEmployees === 0
                        ? 'No employees currently flagged from latest review scores or HR indicators'
                        : `${atRiskEmployees} employee${atRiskEmployees === 1 ? '' : 's'} currently flagged by review score or incident activity`
                );
            }
        } else {
            setText('kAtRiskEmployees', '—');
            setText('kAtRiskEmployeesSub', 'Could not load review score data');
        }

        if (typeof window.updateImpactPlayersKpi === 'function') {
            window.updateImpactPlayersKpi(impactPlayers);
        } else {
            const impactValueEl = safeGet('kImpactPlayers');
            const impactSubEl = safeGet('kImpactPlayersSub');

            if (impactValueEl) {
                impactValueEl.textContent = String(impactPlayers);
            }

            if (impactSubEl) {
                impactSubEl.textContent = impactPlayers === 0
                    ? 'No employees currently flagged as high-impact contributors'
                    : `${impactPlayers} high-impact employee${impactPlayers === 1 ? '' : 's'} based on reviews or recognition`;
            }
        }
    } catch (err) {
        console.error(err);
        if (Array.isArray(EMPLOYEES) && EMPLOYEES.length) {
            renderRoster();
        }
        setText('kOpenDiscipline', '—');
        setText('kAtRiskEmployees', '—');
        setText('kAtRiskEmployeesSub', 'Could not load review score data');
        setText('kImpactPlayers', '—');
        setText('kImpactPlayersSub', 'Could not load impact player data');
    }
}
async function loadReviewDashboard() {
    const summaryTarget = safeGet('reviewDashboardSummary');
    const bodyTarget = safeGet('reviewDashboardBody');
    if (!summaryTarget || !bodyTarget) return;

    const activeEmployees = EMPLOYEES.filter(e => e.status === 'ACTIVE' && !String(e.payType || '').toLowerCase().includes('contract'));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const next30 = new Date(today);
    next30.setDate(next30.getDate() + 30);
    const last30 = new Date(today);
    last30.setDate(last30.getDate() - 30);

    try {
        const [meetingsRes, reviewsRes] = await Promise.all([
            supabaseClient
                .from('employee_meetings')
                .select('employee_id, meeting_date, meeting_type')
                .order('meeting_date', { ascending: false }),
            supabaseClient
                .from('employee_reviews')
                .select('employee_id, attendance_score, performance_score, teamwork_score, attitude_score, reliability_score, overall_result, created_at, review_date')
                .order('review_date', { ascending: false })
        ]);

        const data = meetingsRes.data;
        const error = meetingsRes.error;

        if (error) {
            console.error(error);
            bodyTarget.innerHTML = '<tr><td colspan="6" class="empty">Could not load review dashboard</td></tr>';
            return;
        }

        const reviewMeetings = (data || []).filter(row => {
            const meetingType = String(row.meeting_type || '').toLowerCase();
            return meetingType === 'review' || meetingType === 'performance review';
        });

        const lastReviewByEmployee = {};
        reviewMeetings.forEach(row => {
            if (!row.employee_id || !row.meeting_date) return;
            if (!lastReviewByEmployee[row.employee_id]) {
                lastReviewByEmployee[row.employee_id] = row.meeting_date;
            }
        });

        const latestReviewPerformanceByEmployee = {};
        if (!reviewsRes.error) {
            (reviewsRes.data || []).forEach(row => {
                const employeeId = row.employee_id;
                const sortDate = row.review_date || row.created_at || '';
                if (!employeeId) return;
                if (!latestReviewPerformanceByEmployee[employeeId] || String(sortDate) > String(latestReviewPerformanceByEmployee[employeeId].sortDate)) {
                    const scoreValues = [row.attendance_score, row.performance_score, row.teamwork_score, row.attitude_score, row.reliability_score]
                        .filter(v => v !== null && v !== undefined && v !== '');
                    const avgScore = scoreValues.length
                        ? scoreValues.reduce((sum, v) => sum + Number(v), 0) / scoreValues.length
                        : null;
                    let label = row.overall_result || 'No Review';
                    let badgeClass = 'badge badge-soft';
                    if (avgScore !== null) {
                        if (avgScore >= 4) {
                            label = row.overall_result || 'Exceeds';
                            badgeClass = 'badge badge-active';
                        } else if (avgScore >= 3) {
                            label = row.overall_result || 'Meets';
                            badgeClass = 'badge badge-soft';
                        } else {
                            label = row.overall_result || 'Needs Improvement';
                            badgeClass = 'badge badge-leave';
                        }
                    }
                    latestReviewPerformanceByEmployee[employeeId] = {
                        avgScore,
                        label,
                        badgeClass,
                        sortDate
                    };
                }
            });
        } else {
            console.error(reviewsRes.error);
        }

        const overdueReviews = activeEmployees.filter(e => {
            if (!e.nextReview || !(e.nextReview instanceof Date) || isNaN(e.nextReview)) return false;
            const reviewDate = new Date(e.nextReview);
            reviewDate.setHours(0, 0, 0, 0);
            return reviewDate <= today;
        }).length;

        const dueSoonReviews = activeEmployees.filter(e => {
            if (!e.nextReview || !(e.nextReview instanceof Date) || isNaN(e.nextReview)) return false;
            const reviewDate = new Date(e.nextReview);
            reviewDate.setHours(0, 0, 0, 0);
            return reviewDate > today && reviewDate <= next30;
        }).length;

        const completedLast30Days = reviewMeetings.filter(row => {
            if (!row.meeting_date) return false;
            const meetingDate = new Date(row.meeting_date + 'T00:00:00');
            return meetingDate >= last30 && meetingDate <= today;
        }).length;

        summaryTarget.innerHTML = `
          <div class="detail-card">
            <div class="detail-label">Overdue Reviews</div>
            <div class="detail-value">${overdueReviews}</div>
          </div>
          <div class="detail-card">
            <div class="detail-label">Due in 30 Days</div>
            <div class="detail-value">${dueSoonReviews}</div>
          </div>
          <div class="detail-card">
            <div class="detail-label">Completed in 30 Days</div>
            <div class="detail-value">${completedLast30Days}</div>
          </div>
        `;

        const reviewRows = activeEmployees
            .map(employee => {
                let statusLabel = 'No Date';
                let statusClass = 'badge badge-soft';

                if (employee.nextReview && employee.nextReview instanceof Date && !isNaN(employee.nextReview)) {
                    const reviewDate = new Date(employee.nextReview);
                    reviewDate.setHours(0, 0, 0, 0);

                    if (reviewDate <= today) {
                        statusLabel = 'Overdue';
                        statusClass = 'badge badge-inactive';
                    } else if (reviewDate <= next30) {
                        statusLabel = 'Due Soon';
                        statusClass = 'badge badge-leave';
                    } else {
                        statusLabel = 'Scheduled';
                        statusClass = 'badge badge-active';
                    }
                }

                const performance = latestReviewPerformanceByEmployee[employee.id] || {
                    avgScore: null,
                    label: 'No Review',
                    badgeClass: 'badge badge-soft'
                };

                return {
                    employee,
                    lastReview: lastReviewByEmployee[employee.id] || '',
                    performance,
                    statusLabel,
                    statusClass
                };
            })
            .sort((a, b) => {
                const aTime = a.employee.nextReview instanceof Date && !isNaN(a.employee.nextReview) ? a.employee.nextReview.getTime() : Number.MAX_SAFE_INTEGER;
                const bTime = b.employee.nextReview instanceof Date && !isNaN(b.employee.nextReview) ? b.employee.nextReview.getTime() : Number.MAX_SAFE_INTEGER;
                return aTime - bTime;
            })
            .slice(0, 12);

        if (!reviewRows.length) {
            bodyTarget.innerHTML = '<tr><td colspan="6" class="empty">No review data available</td></tr>';
            return;
        }

        bodyTarget.innerHTML = reviewRows.map(({ employee, lastReview, performance, statusLabel, statusClass }) => `
          <tr data-review-employee-id="${esc(employee.id)}" style="cursor:pointer;">
            <td>
              <button class="link-button" type="button" data-review-employee-id="${esc(employee.id)}">
                ${esc(employee.first || '')} ${esc(employee.last || '')}
              </button>
            </td>
            <td>${esc(employee.dept || '')}</td>
            <td>${fmtDate(employee.nextReview)}</td>
            <td>${lastReview ? esc(lastReview) : '—'}</td>
            <td><span class="${performance.badgeClass}">${esc(performance.label)}</span></td>
            <td><span class="${statusClass}">${esc(statusLabel)}</span></td>
          </tr>
        `).join('');

        bodyTarget.querySelectorAll('[data-review-employee-id]').forEach(el => {
            el.addEventListener('click', (event) => {
                event.stopPropagation();
                const employee = EMPLOYEES.find(e => String(e.id) === String(el.dataset.reviewEmployeeId));
                if (employee) openDrawer(employee);
            });
        });
    } catch (err) {
        console.error(err);
        bodyTarget.innerHTML = '<tr><td colspan="6" class="empty">Could not load review dashboard</td></tr>';
    }
}

async function loadExecutiveInsight() {
    const target = safeGet('executiveInsight');
    if (!target) return;

    const activeEmployees = EMPLOYEES.filter(e => e.status === 'ACTIVE' && !String(e.payType || '').toLowerCase().includes('contract'));
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    try {
        const { data, error } = await supabaseClient
            .from('employee_reviews')
            .select('employee_id, attendance_score, performance_score, teamwork_score, attitude_score, reliability_score, overall_result, created_at, review_date')
            .order('review_date', { ascending: false });

        if (error) {
            console.error(error);
            target.innerHTML = '<div class="history-item"><div class="history-body">Could not load executive insight.</div></div>';
            return;
        }

        const latestReviewByEmployee = {};
        (data || []).forEach(row => {
            const employeeId = row.employee_id;
            const sortDate = row.review_date || row.created_at || '';
            if (!employeeId) return;

            if (!latestReviewByEmployee[employeeId] || String(sortDate) > String(latestReviewByEmployee[employeeId].sortDate)) {
                const scoreValues = [
                    row.attendance_score,
                    row.performance_score,
                    row.teamwork_score,
                    row.attitude_score,
                    row.reliability_score
                ].filter(v => v !== null && v !== undefined && v !== '');

                const avgScore = scoreValues.length
                    ? scoreValues.reduce((sum, v) => sum + Number(v), 0) / scoreValues.length
                    : null;

                latestReviewByEmployee[employeeId] = {
                    avgScore,
                    overallResult: row.overall_result || '',
                    sortDate
                };
            }
        });

        const overdueReviewEmployees = activeEmployees.filter(e => {
            if (!e.nextReview || !(e.nextReview instanceof Date) || isNaN(e.nextReview)) return false;
            const reviewDate = new Date(e.nextReview);
            reviewDate.setHours(0, 0, 0, 0);
            return reviewDate <= today;
        });

        const lowPerformers = activeEmployees.filter(e => {
            const latestReview = latestReviewByEmployee[e.id];
            return latestReview && latestReview.avgScore !== null && latestReview.avgScore <= 3;
        });

        const earlyTenureEmployees = activeEmployees.filter(e => {
            const tenureMonths = Number(e.tenureMonths) || 0;
            return tenureMonths <= 3;
        });

        let insightText = 'All core HR indicators are stable today.';

        if (overdueReviewEmployees.length || lowPerformers.length || earlyTenureEmployees.length) {
            insightText = `${overdueReviewEmployees.length} overdue review${overdueReviewEmployees.length === 1 ? '' : 's'}, ${lowPerformers.length} low performer${lowPerformers.length === 1 ? '' : 's'}, and ${earlyTenureEmployees.length} employee${earlyTenureEmployees.length === 1 ? '' : 's'} in early tenure require attention.`;
        }

        target.innerHTML = `
          <div class="history-item">
            <div class="history-body">${esc(insightText)}</div>
          </div>
        `;
    } catch (err) {
        console.error(err);
        target.innerHTML = '<div class="history-item"><div class="history-body">Could not load executive insight.</div></div>';
    }
}

async function loadRiskEmployees() {
    const target = safeGet('riskEmployees');
    if (!target) return;

    const activeEmployees = EMPLOYEES.filter(e => e.status === 'ACTIVE' && !String(e.payType || '').toLowerCase().includes('contract'));
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    try {
        const [meetingsRes, reviewsRes, incidentsRes, manualRiskRes] = await Promise.all([
            supabaseClient
                .from('employee_meetings')
                .select('employee_id, meeting_date, meeting_type')
                .order('meeting_date', { ascending: false }),
            supabaseClient
                .from('employee_reviews')
                .select('employee_id, attendance_score, performance_score, teamwork_score, attitude_score, reliability_score, overall_result, created_at, review_date')
                .order('review_date', { ascending: false }),
            supabaseClient
                .from('incident_reports')
                .select('employee_id, status, incident_type, incident_date, created_at')
                .order('incident_date', { ascending: false }),
            supabaseClient
                .from('employee_notes')
                .select('employee_id, note_type, note_text, created_at')
                .in('note_type', ['At-Risk Flag', 'At-Risk Cleared'])
                .order('created_at', { ascending: false })
        ]);

        if (reviewsRes.error) {
            console.error(reviewsRes.error);
            target.innerHTML = '<div class="empty">Could not load at-risk employees.</div>';
            return;
        }

        const latestReviewByEmployee = {};
        (reviewsRes.data || []).forEach(row => {
            const employeeId = String(row.employee_id || '');
            const sortDate = row.review_date || row.created_at || '';
            if (!employeeId) return;

            if (!latestReviewByEmployee[employeeId] || String(sortDate) > String(latestReviewByEmployee[employeeId].sortDate)) {
                const scoreValues = [
                    row.attendance_score,
                    row.performance_score,
                    row.teamwork_score,
                    row.attitude_score,
                    row.reliability_score
                ].filter(v => v !== null && v !== undefined && v !== '');

                const avgScore = scoreValues.length
                    ? scoreValues.reduce((sum, v) => sum + Number(v), 0) / scoreValues.length
                    : null;

                latestReviewByEmployee[employeeId] = {
                    avgScore,
                    overallResult: row.overall_result || '',
                    sortDate
                };
            }
        });
        const openIncidentCountsByEmployee = {};
        (incidentsRes.data || []).forEach(row => {
            const employeeId = String(row.employee_id || '');
            const status = String(row.status || '').toLowerCase();
            if (!employeeId || status === 'closed') return;

            openIncidentCountsByEmployee[employeeId] =
                (openIncidentCountsByEmployee[employeeId] || 0) + 1;
        });

        const manualRiskByEmployee = {};
        (manualRiskRes.data || []).forEach(row => {
            const employeeId = String(row.employee_id || '');
            if (!employeeId) return;
            if (!manualRiskByEmployee[employeeId]) {
                manualRiskByEmployee[employeeId] = row;
            }
        });

        const atRiskEmployees = activeEmployees
            .map(employee => {
                const reasons = [];
                let riskScore = 0;
                const employeeKey = String(employee.dbId || employee.id || '');
                const latestReview = latestReviewByEmployee[employeeKey] || null;
                const openIncidentCount = openIncidentCountsByEmployee[employeeKey] || 0;
                const manualRisk = manualRiskByEmployee[employeeKey] || null;

                if (latestReview && latestReview.avgScore !== null && latestReview.avgScore <= 3) {
                    reasons.push(`low review score (${latestReview.avgScore.toFixed(1)})`);
                    riskScore += latestReview.avgScore <= 2.5 ? 2 : 1;
                }

                if (openIncidentCount > 0) {
                    reasons.push(`${openIncidentCount} open incident report${openIncidentCount === 1 ? '' : 's'}`);
                    riskScore += openIncidentCount;
                }

                if (manualRisk && String(manualRisk.note_type || '') === 'At-Risk Flag') {
                    reasons.push(`manual concern: ${manualRisk.note_text || 'manager concern noted'}`);
                    riskScore += 2;
                }

                return {
                    employee,
                    reasons,
                    riskScore,
                    openIncidentCount
                };
            })
            .filter(item => item.riskScore > 0 && item.reasons.length > 0)
            .sort((a, b) => b.riskScore - a.riskScore || compareText(`${a.employee.last} ${a.employee.first}`, `${b.employee.last} ${b.employee.first}`))
            .slice(0, 6);

        if (!atRiskEmployees.length) {
            target.innerHTML = '<div class="empty">No employees are currently flagged for immediate HR attention.</div>';
            return;
        }

        target.innerHTML = atRiskEmployees.map(item => `
          <div class="history-item" data-risk-employee-id="${esc(item.employee.id)}" style="cursor:pointer;">
            <div class="history-top">
              <div>
                <div class="history-title">${esc(item.employee.first || '')} ${esc(item.employee.last || '')}</div>
                <div class="history-date">${esc(item.employee.dept || 'No department')} • Risk Score: ${esc(item.riskScore)}</div>
              </div>
              <span class="badge ${item.riskScore >= 4 ? 'badge-inactive' : 'badge-leave'}">${item.riskScore >= 4 ? 'High Risk' : 'Watch List'}</span>
            </div>
            <div class="history-body">${esc(item.reasons.join(', '))}</div>
          </div>
        `).join('');

        target.querySelectorAll('[data-risk-employee-id]').forEach(card => {
            card.addEventListener('click', () => {
                const employee = EMPLOYEES.find(e => String(e.id) === String(card.dataset.riskEmployeeId));
                if (employee) openDrawer(employee);
            });
        });
    } catch (err) {
        console.error(err);
        target.innerHTML = '<div class="empty">Could not load at-risk employees.</div>';
    }
}


async function loadRecentActivity() {
    const target = safeGet('recentActivity');
    if (!target) return;

    target.innerHTML = '<div class="empty">Loading activity...</div>';

    try {
        const [notesRes, disciplineRes, meetingsRes, reviewsRes] = await Promise.all([
            supabaseClient.from('employee_notes').select('*').order('created_at', { ascending: false }).limit(5),
            supabaseClient.from('discipline_reports').select('*').order('created_at', { ascending: false }).limit(5),
            supabaseClient.from('employee_meetings').select('*').order('created_at', { ascending: false }).limit(5),
            supabaseClient.from('employee_reviews').select('*').order('created_at', { ascending: false }).limit(5)
        ]);

        const notes = (notesRes.data || []).map(row => ({
            category: 'Note',
            title: row.note_type || 'General Note',
            date: row.note_date || row.created_at || '',
            employeeId: row.employee_id,
            body: row.note_text || ''
        }));

        const discipline = (disciplineRes.data || []).map(row => ({
            category: 'Discipline',
            title: row.issue_type || 'Discipline Report',
            date: row.incident_date || row.created_at || '',
            employeeId: row.employee_id,
            body: row.description || ''
        }));

        const meetings = (meetingsRes.data || []).map(row => ({
            category: 'Meeting',
            title: row.meeting_type || (row.subject || 'Meeting'),
            date: row.meeting_date || row.created_at || '',
            employeeId: row.employee_id,
            body: row.subject || row.notes || ''
        }));

        const reviews = (reviewsRes.data || []).map(row => ({
            category: 'Review',
            title: row.review_type || (row.overall_result || 'Performance Review'),
            date: row.review_date || row.created_at || '',
            employeeId: row.employee_id,
            body: row.manager_comments || row.strengths || row.improvements || ''
        }));

        const combined = [...notes, ...discipline, ...meetings, ...reviews]
            .sort((a, b) => String(b.date).localeCompare(String(a.date)))
            .slice(0, 8);

        if (!combined.length) {
            target.innerHTML = '<div class="empty">No recent HR activity available</div>';
            return;
        }

        target.innerHTML = combined.map(item => `
          <div class="history-item">
            <div class="history-top">
              <div>
                <div class="history-title">${esc(item.title)}</div>
                <div class="history-date">${esc(item.category)} • Employee ID: ${esc(item.employeeId)} • ${esc(item.date)}</div>
              </div>
              <span class="badge badge-soft">${esc(item.category)}</span>
            </div>
            <div class="history-body">${nl2br(item.body)}</div>
          </div>
        `).join('');
    } catch (err) {
        console.error(err);
        target.innerHTML = '<div class="empty">Could not load recent activity</div>';
    }
}


function populateEmployeeAdminForm(employee) {
    if (!employee) return;
    safeGet('employeeIdInput').value = employee.id || '';
    safeGet('employeeFirstNameInput').value = employee.first || '';
    safeGet('employeeLastNameInput').value = employee.last || '';
    safeGet('employeeDepartmentInput').value = employee.dept || '';
    safeGet('employeePositionInput').value = employee.position || '';
    safeGet('employeeSupervisorInput').value = employee.supervisor || '';
    safeGet('employeeStatusInput').value = employee.status || 'ACTIVE';
    safeGet('employeePayTypeInput').value = employee.payType || '';
    safeGet('employeeStandardHoursInput').value = employee.stdHours || '';
    safeGet('employeeBenefitsStatusInput').value = employee.benefitsStatus || '';
    safeGet('employeeHireDateInput').value = toInputDate(employee.hireDate);
    safeGet('employeeNextReviewInput').value = toInputDate(employee.nextReview);
    safeGet('employeeAnniversaryDateInput').value = toInputDate(employee.anniversaryDate);
    safeGet('employeeTenureBracketInput').value = employee.tenureBracket || '';
}

function resetEmployeeAdminForm() {
    safeGet('employeeIdInput').value = '';
    safeGet('employeeFirstNameInput').value = '';
    safeGet('employeeLastNameInput').value = '';
    safeGet('employeeDepartmentInput').value = '';
    safeGet('employeePositionInput').value = '';
    safeGet('employeeSupervisorInput').value = '';
    safeGet('employeeStatusInput').value = 'ACTIVE';
    safeGet('employeePayTypeInput').value = '';
    safeGet('employeeStandardHoursInput').value = '';
    safeGet('employeeBenefitsStatusInput').value = '';
    safeGet('employeeHireDateInput').value = '';
    safeGet('employeeNextReviewInput').value = '';
    safeGet('employeeAnniversaryDateInput').value = '';
    safeGet('employeeTenureBracketInput').value = '';
    if (safeGet('atRiskReasonInput')) safeGet('atRiskReasonInput').value = '';

    currentManualAtRiskState = { flagged: false, reason: '' };
    if (safeGet('impactPlayerReasonInput')) safeGet('impactPlayerReasonInput').value = '';
    currentManualImpactPlayerState = { flagged: false, reason: '' };
}
function setManualAtRiskUi(flagged, reason = '') {

    currentManualAtRiskState = {

        flagged: !!flagged,

        reason: String(reason || '').trim()

    };

    if (safeGet('atRiskReasonInput')) {

        safeGet('atRiskReasonInput').value = currentManualAtRiskState.reason;

    }

}

async function loadEmployeeManualAtRisk(employeeId) {

    const actualEmployeeId = currentEmployee?.dbId || employeeId;

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

    const latest = data?.[0];

    if (!latest || latest.note_type !== 'At-Risk Flag') {

        setManualAtRiskUi(false, '');

        return;

    }

    setManualAtRiskUi(true, latest.note_text || '');

}

async function markEmployeeAtRisk() {

    if (!currentEmployee) {

        showToast('Open an employee first.', 'error');

        return;

    }

    const reason = String(safeGet('atRiskReasonInput')?.value || '').trim();

    if (!reason) {

        showToast('Enter a reason before marking the employee at-risk.', 'error');

        return;

    }

    const employeeDbId = currentEmployee.dbId || currentEmployee.id;

    const { error } = await supabaseClient

        .from('employee_notes')

        .insert([{

            employee_id: employeeDbId,

            note_date: todayInputValue(),

            note_type: 'At-Risk Flag',

            note_text: reason

        }]);

    if (error) {

        console.error(error);

        showToast('Could not mark employee at-risk.', 'error');

        return;

    }

    showToast('Employee marked at-risk.');
    updateEmployeeRowBadges(currentEmployee.id);
    recordAuditEvent('Marked At-Risk', currentEmployee, reason);


    setManualAtRiskUi(true, reason);

    if (typeof loadEmployeeNotes === 'function') await loadEmployeeNotes(currentEmployee.id);

    if (typeof loadSummaryMetrics === 'function') await loadSummaryMetrics();

    if (typeof loadRiskEmployees === 'function') await loadRiskEmployees();

}


async function clearAtRiskStatus() {

    if (!currentEmployee) {

        showToast('Open an employee first.', 'error');

        return;

    }

    const employeeDbId = currentEmployee.dbId || currentEmployee.id;

    const noteText = String(safeGet('atRiskReasonInput')?.value || '').trim() || 'Manual at-risk flag cleared';

    const { error } = await supabaseClient

        .from('employee_notes')

        .insert([{

            employee_id: employeeDbId,

            note_date: todayInputValue(),

            note_type: 'At-Risk Cleared',

            note_text: noteText

        }]);

    if (error) {

        console.error(error);

        showToast('Could not clear at-risk flag.', 'error');

        return;

    }

    showToast('At-risk flag cleared.');
    updateEmployeeRowBadges(currentEmployee.id);
    recordAuditEvent('Cleared At-Risk', currentEmployee, noteText);

    setManualAtRiskUi(false, '');

    if (typeof loadEmployeeNotes === 'function') await loadEmployeeNotes(currentEmployee.id);

    if (typeof loadSummaryMetrics === 'function') await loadSummaryMetrics();

    if (typeof loadRiskEmployees === 'function') await loadRiskEmployees();

}

function setManualImpactPlayerUi(flagged, reason = '') {
    currentManualImpactPlayerState = {
        flagged: !!flagged,
        reason: String(reason || '').trim()
    };

    if (safeGet('impactPlayerReasonInput')) {
        safeGet('impactPlayerReasonInput').value = currentManualImpactPlayerState.reason;
    }
}

async function loadEmployeeManualImpactPlayer(employeeId) {
    const actualEmployeeId = currentEmployee?.dbId || employeeId;
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

    const latest = data?.[0];
    if (!latest || latest.note_type !== 'Impact Player Flag') {
        setManualImpactPlayerUi(false, '');
        return;
    }

    setManualImpactPlayerUi(true, latest.note_text || '');
}

async function markImpactPlayer() {
    if (!currentEmployee) {
        showToast('Open an employee first.', 'error');
        return;
    }

    const reason = String(safeGet('impactPlayerReasonInput')?.value || '').trim();
    if (!reason) {
        showToast('Enter a reason before marking the employee as an Impact Player.', 'error');
        return;
    }

    const employeeDbId = currentEmployee.dbId || currentEmployee.id;

    const { error } = await supabaseClient
        .from('employee_notes')
        .insert([{
            employee_id: employeeDbId,
            note_date: todayInputValue(),
            note_type: 'Impact Player Flag',
            note_text: reason
        }]);

    if (error) {
        console.error(error);
        showToast('Could not mark employee as an Impact Player.', 'error');
        return;
    }

    showToast('Employee marked as an Impact Player.');
    updateEmployeeRowBadges(currentEmployee.id);
    recordAuditEvent('Marked Impact Player', currentEmployee, reason);
    
    setManualImpactPlayerUi(true, reason);
    if (typeof loadEmployeeNotes === 'function') await loadEmployeeNotes(currentEmployee.id);
    if (typeof loadSummaryMetrics === 'function') await loadSummaryMetrics();
}

async function clearImpactPlayerStatus() {
    if (!currentEmployee) {
        showToast('Open an employee first.', 'error');
        return;
    }

    const employeeDbId = currentEmployee.dbId || currentEmployee.id;
    const noteText = String(safeGet('impactPlayerReasonInput')?.value || '').trim() || 'Manual Impact Player flag cleared';

    const { error } = await supabaseClient
        .from('employee_notes')
        .insert([{
            employee_id: employeeDbId,
            note_date: todayInputValue(),
            note_type: 'Impact Player Cleared',
            note_text: noteText
        }]);

    if (error) {
        console.error(error);
        showToast('Could not clear Impact Player flag.', 'error');
        return;
    }

    showToast('Impact Player flag cleared.');
    setManualImpactPlayerUi(false, '');
    if (typeof loadEmployeeNotes === 'function') await loadEmployeeNotes(currentEmployee.id);
    if (typeof loadSummaryMetrics === 'function') await loadSummaryMetrics();
}

function startNewEmployee() {
    resetDrawerForms();
    currentEmployee = null;
    isCreatingEmployee = true;
    applyRolePermissions();
    resetEmployeeAdminForm();
    ensureDeleteEmployeeButton();
    setText('drawerTitle', 'New Employee');
    setText('drawerSub', 'Create employee record');
    const details = safeGet('drawerDetails');
    if (details) details.innerHTML = '<div class="detail-card"><div class="detail-label">New Record</div><div class="detail-value">Complete the Employee Admin tab to create a new employee.</div></div>';
    safeGet('notesHistory').innerHTML = '<div class="empty">Save the employee before adding notes.</div>';
    safeGet('disciplineHistory').innerHTML = '<div class="empty">Save the employee before adding discipline records.</div>';
    safeGet('meetingsHistory').innerHTML = '<div class="empty">Save the employee before adding meetings.</div>';
    safeGet('ecHistory').innerHTML = '<div class="empty">Save the employee before adding an emergency contact.</div>';
    safeGet('drawerBackdrop')?.classList.add('open');
    safeGet('employeeDrawer')?.classList.add('open');
    switchTab('employee');
}

async function saveEmployeeRecord() {
    const id = safeGet('employeeIdInput')?.value.trim() || '';
    const first_name = safeGet('employeeFirstNameInput')?.value.trim() || '';
    const last_name = safeGet('employeeLastNameInput')?.value.trim() || '';
    const department = safeGet('employeeDepartmentInput')?.value.trim() || '';
    const position = safeGet('employeePositionInput')?.value.trim() || '';
    const supervisor = safeGet('employeeSupervisorInput')?.value.trim() || '';
    const status = safeGet('employeeStatusInput')?.value || 'ACTIVE';
    const pay_type = safeGet('employeePayTypeInput')?.value.trim() || null;
    const standard_hours_value = safeGet('employeeStandardHoursInput')?.value;
    const standard_hours = standard_hours_value === '' ? null : Number(standard_hours_value);
    const benefits_status = safeGet('employeeBenefitsStatusInput')?.value.trim() || null;
    const hire_date = safeGet('employeeHireDateInput')?.value || null;
    const next_review_date = safeGet('employeeNextReviewInput')?.value || null;
    const anniversary_date = safeGet('employeeAnniversaryDateInput')?.value || null;
    const tenure_bracket = safeGet('employeeTenureBracketInput')?.value.trim() || null;

    if (!id || !first_name || !last_name) {
        showToast('Employee ID, first name, and last name are required.', 'error');
        return;
    }

    const payload = {
        id,
        first_name,
        last_name,
        department,
        position,
        supervisor,
        status,
        pay_type,
        standard_hours,
        benefits_status,
        hire_date,
        next_review_date,
        anniversary_date,
        tenure_bracket
    };

    let error;

    if (isCreatingEmployee || !currentEmployee) {

        const result = await createEmployee(payload);

        error = result.error;

    } else {

        const result = await updateEmployeeById(currentEmployee.dbId, payload);

        error = result.error;

    }

    if (error) {
        console.error(error);
        showToast(isCreatingEmployee || !currentEmployee ? 'Could not create employee.' : 'Could not update employee.', 'error');
        return;
    }

    showToast(isCreatingEmployee || !currentEmployee ? 'Employee created.' : 'Employee updated.');
    await loadEmployees();
    await loadSummaryMetrics();
    await loadRecentActivity();
    await loadReviewDashboard();

    const savedEmployeeId = id;
    const refreshedEmployee = EMPLOYEES.find(e => String(e.id) === String(savedEmployeeId));
    if (refreshedEmployee) {
        isCreatingEmployee = false;
        openDrawer(refreshedEmployee);
        switchTab('employee');
    }
}

async function deleteEmployeeRecord() {
    if (!currentEmployee || isCreatingEmployee) {
        showToast('Open an existing employee record to delete it.', 'error');
        return;
    }

    const confirmed = window.confirm(`Delete employee ${currentEmployee.first} ${currentEmployee.last}? This cannot be undone.`);
    if (!confirmed) return;

    const { data, error } = await deleteEmployeeById(String(currentEmployee.dbId || currentEmployee.id));

    if (error) {
        console.error(error);
        showToast(`Could not delete employee: ${error.message || 'Unknown error'}`, 'error');
        return;
    }

    showToast('Employee deleted.');
    currentEmployee = null;
    closeDrawer();
    await loadEmployees();
    await loadSummaryMetrics();
    await loadRecentActivity();
    await loadReviewDashboard();
}





function closeDrawer() {
    currentEmployee = null;
    applyRolePermissions();
    safeGet('drawerBackdrop')?.classList.remove('open');
    safeGet('employeeDrawer')?.classList.remove('open');
}









function resetEmergencyContactForm() {
    currentEmergencyContactId = null;
    if (safeGet('ecName')) safeGet('ecName').value = '';
    if (safeGet('ecRelationship')) safeGet('ecRelationship').value = '';
    if (safeGet('ecPhone')) safeGet('ecPhone').value = '';
    if (safeGet('ecAltPhone')) safeGet('ecAltPhone').value = '';
    if (safeGet('ecNotes')) safeGet('ecNotes').value = '';
    safeGet('deleteECBtn')?.classList.add('hidden');
}

async function loadEmergencyContacts(employeeId) {
    const target = safeGet('ecHistory');
    if (!target) return;

    const resolvedEmployeeId = currentEmployee?.dbId || employeeId;

    const { data, error } = await supabaseClient
        .from('emergency_contacts')
        .select('*')
        .eq('employee_id', resolvedEmployeeId)
        .order('created_at', { ascending: false });

    if (error) {
        console.error(error);
        target.innerHTML = '<div class="empty">Could not load emergency contacts</div>';
        return;
    }

    const rows = data || [];

    if (!rows.length) {
        resetEmergencyContactForm();
        target.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
              <div style="font-weight:600;">Emergency Contacts</div>
              <button class="btn btn-secondary" id="addEmergencyContactBtn" type="button">+ Add New</button>
            </div>
            <div class="empty">No emergency contacts on file</div>
        `;
        safeGet('addEmergencyContactBtn')?.addEventListener('click', () => {
            resetEmergencyContactForm();
            applyRolePermissions();
        });
        applyRolePermissions();
        return;
    }

    if (!currentEmergencyContactId || !rows.some(row => String(row.id) === String(currentEmergencyContactId))) {
        resetEmergencyContactForm();
    }

    target.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
          <div style="font-weight:600;">Emergency Contacts</div>
          <button class="btn btn-secondary" id="addEmergencyContactBtn" type="button">+ Add New</button>
        </div>
        ${rows.map((row, index) => `
          <div class="history-item" data-ec-id="${esc(row.id)}" style="cursor:pointer; ${String(currentEmergencyContactId) === String(row.id) ? 'border:1px solid var(--blue, #2e75b6);' : ''}">
            <div class="history-top">
              <div>
                <div class="history-title">${esc(row.contact_name || 'Emergency Contact')}</div>
                <div class="history-date">${esc(row.relationship || '')}</div>
              </div>
              <span class="badge badge-soft">${index === 0 ? 'Primary' : 'Contact'}</span>
            </div>
            <div class="history-body">
              <strong>Phone:</strong> ${esc(row.phone || '')}<br>
              <strong>Alternate:</strong> ${esc(row.alternate_phone || '')}<br><br>
              <strong>Notes:</strong><br>${nl2br(row.notes || '')}
            </div>
          </div>
        `).join('')}
      `;

    safeGet('addEmergencyContactBtn')?.addEventListener('click', () => {
        resetEmergencyContactForm();
        applyRolePermissions();
    });

    target.querySelectorAll('[data-ec-id]').forEach(card => {
        card.addEventListener('click', () => {
            const row = rows.find(item => String(item.id) === String(card.dataset.ecId));
            if (!row) return;
            currentEmergencyContactId = row.id;
            safeGet('deleteECBtn')?.classList.remove('hidden');
            if (safeGet('ecName')) safeGet('ecName').value = row.contact_name || '';
            if (safeGet('ecRelationship')) safeGet('ecRelationship').value = row.relationship || '';
            if (safeGet('ecPhone')) safeGet('ecPhone').value = row.phone || '';
            if (safeGet('ecAltPhone')) safeGet('ecAltPhone').value = row.alternate_phone || '';
            if (safeGet('ecNotes')) safeGet('ecNotes').value = row.notes || '';
            applyRolePermissions();
            loadEmergencyContacts(resolvedEmployeeId);
        });
    });
}



async function deleteEmployeeDocument(docId) {
    console.log('Deleting document id:', docId);

    if (!confirm('Delete this document?')) return;

    const { data: docRows, error: fetchError } = await supabaseClient
        .from('employee_documents')
        .select('id, file_path, employee_id')
        .eq('id', docId);

    console.log('Fetched document row:', docRows, fetchError);

    const docRow = docRows?.[0];

    if (fetchError || !docRow) {
        console.error(fetchError);
        showToast('Could not find document record.', 'error');
        return;
    }

    if (docRow.file_path) {
        const { data: storageData, error: storageError } = await supabaseClient
            .storage
            .from('employee-documents')
            .remove([docRow.file_path]);

        console.log('Storage delete result:', storageData, storageError);

        if (storageError) {
            console.error(storageError);
            showToast('Could not delete file from storage.', 'error');
            return;
        }
    }

    const { error: deleteError } = await supabaseClient
        .from('employee_documents')
        .delete()
        .eq('id', docId);

    console.log('DB delete error:', deleteError);

    if (deleteError) {
        console.error(deleteError);
        showToast('Could not delete document record.', 'error');
        return;
    }

    showToast('Document deleted.');
    await loadEmployeeDocuments(currentEmployee.id);
}




// =========================
// EMERGENCY CONTACT
// =========================

async function saveEmergencyContact() {
    if (!currentEmployee) return;

    const resolvedEmployeeId = currentEmployee.dbId || currentEmployee.id;
    const contact_name = safeGet('ecName')?.value.trim() || '';
    const relationship = safeGet('ecRelationship')?.value.trim() || '';
    const phone = safeGet('ecPhone')?.value.trim() || '';
    const alternate_phone = safeGet('ecAltPhone')?.value.trim() || '';
    const notes = safeGet('ecNotes')?.value.trim() || '';

    if (!contact_name) {
        showToast('Enter the emergency contact name.', 'error');
        return;
    }

    let error;

    if (currentEmergencyContactId) {
        const result = await supabaseClient
            .from('emergency_contacts')
            .update({
                contact_name,
                relationship,
                phone,
                alternate_phone,
                notes,
            })
            .eq('id', currentEmergencyContactId)
            .eq('employee_id', resolvedEmployeeId);

        error = result.error;
    } else {
        const result = await supabaseClient
            .from('emergency_contacts')
            .insert([{
                employee_id: resolvedEmployeeId,
                contact_name,
                relationship,
                phone,
                alternate_phone,
                notes,
            }]);

        error = result.error;
    }

    if (error) {
        console.error(error);
        showToast(`Could not save emergency contact: ${error.message || 'Unknown error'}`, 'error');
        return;
    }

    showToast(currentEmergencyContactId ? 'Emergency contact updated.' : 'Emergency contact saved.');
    resetEmergencyContactForm();
    await loadEmergencyContacts(resolvedEmployeeId);
}


// =========================
// DOCUMENTS
// =========================

async function uploadEmployeeDocument() {
    if (!currentEmployee) {
        showToast('Open an employee first.', 'error');
        return;
    }

    const document_type = safeGet('docType')?.value || '';
    const file = safeGet('docFile')?.files?.[0];

    if (!document_type) {
        showToast('Select a document type.', 'error');
        return;
    }

    if (!file) {
        showToast('Choose a file to upload.', 'error');
        return;
    }

    const fileExt = file.name.includes('.') ? file.name.split('.').pop() : '';
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = `${currentEmployee.id}/${Date.now()}_${safeName}`;

    const { error: uploadError } = await supabaseClient.storage
        .from('employee-documents')
        .upload(filePath, file);

    if (uploadError) {
        console.error(uploadError);
        showToast(`Upload failed: ${uploadError.message}`, 'error');
        return;
    }

    const { data: authData } = await supabaseClient.auth.getUser();

    const { error: insertError } = await supabaseClient
        .from('employee_documents')
        .insert([{
            employee_id: currentEmployee.id,
            document_type,
            file_name: file.name,
            file_path: filePath,
            file_ext: fileExt || null,
            uploaded_by: authData?.user?.id || null
        }]);

    if (insertError) {
        console.error(insertError);
        showToast(`Saved file but DB insert failed: ${insertError.message}`, 'error');
        return;
    }

    showToast('Document uploaded.');
    safeGet('docType').value = '';
    safeGet('docFile').value = '';
    await loadEmployeeDocuments(currentEmployee.id);
}
async function loadEmployeeDocuments(employeeId) {
    const target = safeGet('docHistory');
    if (!target) return;

    const { data, error } = await supabaseClient
        .from('employee_documents')
        .select('*')
        .eq('employee_id', employeeId)
        .order('uploaded_at', { ascending: false });

    if (error) {
        console.error(error);
        target.innerHTML = '<div class="empty">Could not load documents</div>';
        return;
    }

    if (!data || !data.length) {
        target.innerHTML = '<div class="empty">No documents for this employee</div>';
        return;
    }

    const docsWithUrls = await Promise.all(
        data.map(async (row) => {
            const { data: signedData, error: signedError } = await supabaseClient.storage
                .from('employee-documents')
                .createSignedUrl(row.file_path, 3600);

            return {
                ...row,
                signedUrl: signedError ? null : signedData?.signedUrl || null
            };
        })
    );

    target.innerHTML = docsWithUrls.map(row => `
  <div class="history-item">
    <div class="history-top">
      <div>
        <div class="history-title">${esc(row.file_name || 'Document')}</div>
        <div class="history-date">${esc(row.created_at || '')}</div>
      </div>
      <div style="display:flex; gap:8px;">
        <button class="button danger" type="button" data-delete-doc-id="${esc(row.id)}">Delete</button>
        ${row.signedUrl ? `<a href="${row.signedUrl}" target="_blank" class="button soft">View</a>` : ''}
        <span class="badge badge-soft">Document</span>
      </div>
    </div>
  </div>
`).join('');

    target.querySelectorAll('[data-delete-doc-id]').forEach(btn => {
        btn.addEventListener('click', () => {
            deleteEmployeeDocument(btn.dataset.deleteDocId);
        });
    });
}

async function deleteEmergencyContact() {
    if (!currentEmergencyContactId) {
        showToast('No emergency contact to delete.', 'error');
        return;
    }

    if (!confirm('Are you sure you want to delete this emergency contact?')) {
        return;
    }

    try {
        const resolvedEmployeeId = currentEmployee?.dbId || currentEmployee?.id || null;
        const deletingId = String(currentEmergencyContactId);

        const { error } = await supabaseClient
            .from('emergency_contacts')
            .delete()
            .eq('id', deletingId);

        if (error) {
            console.error(error);
            showToast('Could not delete emergency contact.', 'error');
            return;
        }

        const { data: remainingRows, error: verifyError } = await supabaseClient
            .from('emergency_contacts')
            .select('id')
            .eq('id', deletingId)
            .limit(1);

        if (verifyError) {
            console.error(verifyError);
            showToast('Could not verify emergency contact deletion.', 'error');
            return;
        }

        if (remainingRows && remainingRows.length) {
            showToast('Emergency contact was not deleted.', 'error');
            return;
        }

        showToast('Emergency contact deleted.');
        resetEmergencyContactForm();

        if (resolvedEmployeeId) {
            await loadEmergencyContacts(resolvedEmployeeId);
        }

    } catch (err) {
        console.error(err);
        showToast('Error deleting emergency contact.', 'error');
    }
}


async function loadStayInterviews(employeeId) {
    const target = safeGet('stayInterviewHistory');
    if (!target) return;

    const { data, error } = await supabaseClient
        .from('stay_interviews')
        .select('*')
        .eq('employee_id', String(currentEmployee?.dbId || employeeId))
        .order('interview_date', { ascending: false })
        .order('created_at', { ascending: false });

    if (error) {
        console.error(error);
        target.innerHTML = '<div class="empty">Error loading stay interviews</div>';
        return;
    }

    if (!data || !data.length) {
        target.innerHTML = '<div class="empty">No stay interviews yet.</div>';
        return;
    }

    target.innerHTML = data.map(row => {
        const interviewDate = row.interview_date
            ? fmtDate(new Date(`${row.interview_date}T00:00:00`))
            : 'No date';

        return `
      <div class="history-item">
        <div class="history-top">
          <div>
            <div class="history-title">${esc(row.interview_type || 'Stay Interview')}</div>
            <div class="history-date">${esc(interviewDate)}</div>
          </div>
        </div>
        <div class="history-body">
          <strong>What do you look forward to each day?</strong><br>
          ${nl2br(row.q1 || '—')}<br><br>

          <strong>What is going well right now?</strong><br>
          ${nl2br(row.q2 || '—')}<br><br>

          <strong>Frustrations, obstacles, or stress points</strong><br>
          ${nl2br(row.q3 || '—')}<br><br>

          <strong>What would make the job easier or more satisfying?</strong><br>
          ${nl2br(row.q4 || '—')}<br><br>

          <strong>Support from supervisor and team</strong><br>
          ${nl2br(row.q5 || '—')}<br><br>

          <strong>What might cause them to leave?</strong><br>
          ${nl2br(row.q6 || '—')}<br><br>

          <strong>What can we do to help them stay and succeed?</strong><br>
              ${nl2br(row.q7 || '—')}<br><br>

              <strong>HR / Manager Summary</strong><br>
              ${nl2br(row.manager_summary || '—')}
            </div>
            <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:12px;">
              <button class="button soft" type="button" data-edit-stay-id="${esc(row.id)}">Edit</button>
              <button class="button danger" type="button" data-delete-stay-id="${esc(row.id)}">Delete</button>
            </div>
          </div>
        `;
    }).join('');

    target.querySelectorAll('[data-edit-stay-id]').forEach(btn => {
        btn.addEventListener('click', () => editStayInterview(btn.dataset.editStayId));
    });

    target.querySelectorAll('[data-delete-stay-id]').forEach(btn => {
        btn.addEventListener('click', () => deleteStayInterview(btn.dataset.deleteStayId));
    });
}



// =========================
// STAY INTERVIEWS
// =========================

async function saveStayInterview() {
    if (!currentEmployee) {
        showToast('Open an employee first.', 'error');
        return;
    }

    const payload = {
        employee_id: currentEmployee.dbId,
        interview_date: safeGet('stayInterviewDate').value || null,
        interview_type: safeGet('stayInterviewType').value || '',
        q1: safeGet('stayQ1').value || '',
        q2: safeGet('stayQ2').value || '',
        q3: safeGet('stayQ3').value || '',
        q4: safeGet('stayQ4').value || '',
        q5: safeGet('stayQ5').value || '',
        q6: safeGet('stayQ6').value || '',
        q7: safeGet('stayQ7').value || '',
        manager_summary: safeGet('stayManagerSummary').value || ''
    };

    let error = null;

    if (currentStayInterviewId) {
        const result = await supabaseClient
            .from('stay_interviews')
            .update(payload)
            .eq('id', currentStayInterviewId);
        error = result.error;
    } else {
        const result = await supabaseClient
            .from('stay_interviews')
            .insert([payload]);
        error = result.error;
    }

    if (error) {
        console.error(error);
        showToast(`Error saving stay interview: ${error.message || 'Unknown error'}`, 'error');
        return;
    }

    showToast(currentStayInterviewId ? 'Stay interview updated' : 'Stay interview saved');
    currentStayInterviewId = null;
    if (safeGet('saveStayInterviewBtn')) safeGet('saveStayInterviewBtn').textContent = 'Save Stay Interview';

    // ✅ Reset form after save (important for UX)
    if (safeGet('stayInterviewDate')) safeGet('stayInterviewDate').value = todayInputValue();
    if (safeGet('stayInterviewType')) safeGet('stayInterviewType').value = '';
    if (safeGet('stayQ1')) safeGet('stayQ1').value = '';
    if (safeGet('stayQ2')) safeGet('stayQ2').value = '';
    if (safeGet('stayQ3')) safeGet('stayQ3').value = '';
    if (safeGet('stayQ4')) safeGet('stayQ4').value = '';
    if (safeGet('stayQ5')) safeGet('stayQ5').value = '';
    if (safeGet('stayQ6')) safeGet('stayQ6').value = '';
    if (safeGet('stayQ7')) safeGet('stayQ7').value = '';
    if (safeGet('stayManagerSummary')) safeGet('stayManagerSummary').value = '';

    loadStayInterviews(currentEmployee.id);
}
async function editStayInterview(stayInterviewId) {
    const { data, error } = await supabaseClient
        .from('stay_interviews')
        .select('*')
        .eq('id', stayInterviewId);

    const interview = data?.[0];

    if (error || !interview) {
        console.error(error);
        showToast('Could not load stay interview for editing', 'error');
        return;
    }

    currentStayInterviewId = interview.id;
    if (safeGet('stayInterviewDate')) safeGet('stayInterviewDate').value = interview.interview_date || todayInputValue();
    if (safeGet('stayInterviewType')) safeGet('stayInterviewType').value = interview.interview_type || '';
    if (safeGet('stayQ1')) safeGet('stayQ1').value = interview.q1 || '';
    if (safeGet('stayQ2')) safeGet('stayQ2').value = interview.q2 || '';
    if (safeGet('stayQ3')) safeGet('stayQ3').value = interview.q3 || '';
    if (safeGet('stayQ4')) safeGet('stayQ4').value = interview.q4 || '';
    if (safeGet('stayQ5')) safeGet('stayQ5').value = interview.q5 || '';
    if (safeGet('stayQ6')) safeGet('stayQ6').value = interview.q6 || '';
    if (safeGet('stayQ7')) safeGet('stayQ7').value = interview.q7 || '';
    if (safeGet('stayManagerSummary')) safeGet('stayManagerSummary').value = interview.manager_summary || '';
    if (safeGet('saveStayInterviewBtn')) safeGet('saveStayInterviewBtn').textContent = 'Update Stay Interview';
    switchTab('stay-interviews');
    showToast('Editing stay interview');
}

async function deleteStayInterview(stayInterviewId) {
    const confirmed = window.confirm('Delete this stay interview? This cannot be undone.');
    if (!confirmed) return;

    const { error } = await supabaseClient
        .from('stay_interviews')
        .delete()
        .eq('id', stayInterviewId);

    if (error) {
        console.error(error);
        showToast(`Could not delete stay interview: ${error.message || 'Unknown error'}`, 'error');
        return;
    }

    if (String(currentStayInterviewId) === String(stayInterviewId)) {
        currentStayInterviewId = null;
        if (safeGet('stayInterviewDate')) safeGet('stayInterviewDate').value = todayInputValue();
        if (safeGet('stayInterviewType')) safeGet('stayInterviewType').value = '';
        if (safeGet('stayQ1')) safeGet('stayQ1').value = '';
        if (safeGet('stayQ2')) safeGet('stayQ2').value = '';
        if (safeGet('stayQ3')) safeGet('stayQ3').value = '';
        if (safeGet('stayQ4')) safeGet('stayQ4').value = '';
        if (safeGet('stayQ5')) safeGet('stayQ5').value = '';
        if (safeGet('stayQ6')) safeGet('stayQ6').value = '';
        if (safeGet('stayQ7')) safeGet('stayQ7').value = '';
        if (safeGet('stayManagerSummary')) safeGet('stayManagerSummary').value = '';
        if (safeGet('saveStayInterviewBtn')) safeGet('saveStayInterviewBtn').textContent = 'Save Stay Interview';
    }

    showToast('Stay interview deleted');
    if (currentEmployee) await loadStayInterviews(currentEmployee.id);
}


async function loadImpactPlayers() {
    const target = safeGet('impactPlayers');
    if (!target) return;

    try {
        const employeeList = Array.isArray(EMPLOYEES)
            ? EMPLOYEES.filter(e => e.status === 'ACTIVE' && !String(e.payType || '').toLowerCase().includes('contract'))
            : [];

        const impactPlayers = Object.entries(currentImpactPlayerRosterMap || {})
            .map(([employeeKey, impactMeta]) => {
                const emp = employeeList.find(e =>
                    String(e.dbId) === String(employeeKey) ||
                    String(e.id) === String(employeeKey)
                );
                if (!emp || !impactMeta) return null;
                return { emp, impactMeta };
            })
            .filter(Boolean)
            .sort((a, b) => compareText(
                `${a.emp.first || ''} ${a.emp.last || ''}`.trim(),
                `${b.emp.first || ''} ${b.emp.last || ''}`.trim()
            ))
            .slice(0, 6);

        if (!impactPlayers.length) {
            target.innerHTML = '<div class="empty">No impact players currently flagged.</div>';
            return;
        }

        target.innerHTML = impactPlayers.map(({ emp, impactMeta }) => {
            const metaParts = [];
            if (emp.dept) metaParts.push(emp.dept);
            if (impactMeta.highReview && impactMeta.reviewScore !== null && impactMeta.reviewScore !== undefined) {
                metaParts.push(`Avg ${Number(impactMeta.reviewScore).toFixed(1)}`);
            }

            const detailParts = [];
            if (impactMeta.manualReason) detailParts.push(impactMeta.manualReason);
            if (impactMeta.flaggedDate) detailParts.push(String(impactMeta.flaggedDate).slice(0, 10));
            if (!detailParts.length && impactMeta.highReview) {
                detailParts.push('Recognized from recent reviews');
            }

            return `
      <div class="history-item" style="cursor:pointer;" data-id="${esc(emp.id)}">
        <div class="history-top">
          <div>
            <div class="history-title">${esc(emp.first)} ${esc(emp.last)}</div>
            <div class="history-date">${esc(metaParts.join(' • ') || (emp.dept || 'Employee'))}</div>
          </div>
          <span class="badge badge-active">Impact Player</span>
        </div>
        <div class="history-body">${esc(detailParts.join(' • ') || 'Recognized as a high-impact contributor')}</div>
      </div>
    `;
        }).join('');

        target.querySelectorAll('[data-id]').forEach(el => {
            el.onclick = () => {
                const emp = EMPLOYEES.find(e => String(e.id) === String(el.dataset.id));
                if (emp) openDrawer(emp);
            };
        });

    } catch (err) {
        console.error(err);
        target.innerHTML = '<div class="empty">Error loading impact players.</div>';
    }
}
// =========================

// KPI TOOLTIP UI

// =========================

let kpiTooltipEl = null;

function ensureKpiTooltip() {
    return null;
}

function showKpiTooltip() {
    return;
}

function moveKpiTooltip() {
    return;
}

function hideKpiTooltip() {
    return;
}

function setCardTitle(id, lines, emptyText = 'No data available') {
    const el = safeGet(id);
    if (!el) return;

    const cleaned = (lines || []).map(v => String(v || '').trim()).filter(Boolean);
    const text = cleaned.length ? cleaned.join('\n') : emptyText;

    el.removeAttribute('title');
    el.setAttribute('data-tooltip', text);
}

function buildKpiHoverDetails() {
    const activeEmployees = EMPLOYEES.filter(e => String(e.status || '').toUpperCase() === 'ACTIVE');
    const leaveEmployees = EMPLOYEES.filter(e => String(e.status || '').toUpperCase() === 'LEAVE');

    setCardTitle(
        'cardActiveHC',
        activeEmployees.map(e => `${e.first || ''} ${e.last || ''}`.trim()),
        'No active employees'
    );

    const deptCounts = [...new Set(activeEmployees.map(e => e.dept).filter(Boolean))]
        .sort()
        .map(dept => {
            const count = activeEmployees.filter(e => e.dept === dept).length;
            return `${dept}: ${count}`;
        });
    setCardTitle('cardDepartments', deptCounts, 'No departments available');

    const riskEmployees = activeEmployees
        .filter(e => {
            const tenureMonths = Number(e.tenureMonths || 0);
            const overdue = e.nextReview && e.nextReview instanceof Date && !isNaN(e.nextReview) && e.nextReview <= new Date();
            return tenureMonths <= 6 || overdue;
        })
        .map(e => `${`${e.first || ''} ${e.last || ''}`.trim()}${e.tenureMonths != null ? ` • ${e.tenureMonths} mo` : ''}`);
    setCardTitle('cardTurnoverRisk', riskEmployees, 'No employees currently contributing to turnover risk');

    const atRiskNames = Array.from(document.querySelectorAll('#riskEmployees .history-title'))
        .map(el => el.textContent.trim())
        .filter(Boolean);
    setCardTitle('cardAtRiskEmployees', atRiskNames, 'No employees currently flagged');

    const impactPlayerNames = currentFilteredEmployees
        .filter(e => currentImpactPlayerRosterMap[String(e.dbId)] || currentImpactPlayerRosterMap[String(e.id)])
        .map(e => `${e.first || ''} ${e.last || ''}`.trim())
        .filter(Boolean)
        .sort(compareText);

    setCardTitle('cardImpactPlayers', impactPlayerNames, 'No impact players');

    setCardTitle(
        'cardOnLeave',
        leaveEmployees.map(e => `${e.first || ''} ${e.last || ''}`.trim()),
        'No employees currently on leave'
    );

    const disciplineCard = safeGet('cardOpenDiscipline');
    const existingDisciplineTooltip = disciplineCard?.getAttribute('data-tooltip') || '';
    const disciplineCountText = String(safeGet('kOpenDiscipline')?.textContent || '').trim();

    const hasRealDisciplineTooltip = existingDisciplineTooltip
        && existingDisciplineTooltip !== 'No open discipline cases'
        && existingDisciplineTooltip !== 'No discipline cases open'
        && existingDisciplineTooltip !== 'Could not load discipline cases';

    if (!hasRealDisciplineTooltip) {
        if (disciplineCountText === '0') {
            setCardTitle('cardOpenDiscipline', [], 'No open discipline cases');
        } else if (disciplineCountText === '—' || disciplineCountText === '') {
            setCardTitle('cardOpenDiscipline', [], 'Could not load discipline cases');
        }
    }

    const now = new Date();
    const dueReviews = activeEmployees
        .filter(e => e.nextReview && e.nextReview instanceof Date && !isNaN(e.nextReview) && e.nextReview <= now)
        .map(e => `${`${e.first || ''} ${e.last || ''}`.trim()} • ${fmtDate(e.nextReview)}`);
    setCardTitle('cardReviewsDue', dueReviews, 'No overdue reviews');

}

function initKpiHoverUi() {
    buildKpiHoverDetails();
}

window.markEmployeeAtRisk = markEmployeeAtRisk;
window.clearAtRiskStatus = clearAtRiskStatus;
window.markImpactPlayer = markImpactPlayer;
window.clearImpactPlayerStatus = clearImpactPlayerStatus;
// =========================
// SAVE REVIEW HANDLER
// =========================

async function saveReviewRecord() {
    // Read review form fields
    const reviewDate = safeGet('reviewDate')?.value || '';

    const reviewType = safeGet('reviewType')?.value || '';

    const reviewQuality = safeGet('reviewQuality')?.value || '';

    const reviewAttendance = safeGet('reviewAttendance')?.value || '';

    const reviewReliability = safeGet('reviewReliability')?.value || '';

    const reviewCommunication = safeGet('reviewCommunication')?.value || '';

    const reviewJudgement = safeGet('reviewJudgement')?.value || '';

    const reviewInitiative = safeGet('reviewInitiative')?.value || '';

    const reviewTeamwork = safeGet('reviewTeamwork')?.value || '';

    const reviewKnowledge = safeGet('reviewKnowledge')?.value || '';

    const reviewTraining = safeGet('reviewTraining')?.value || '';

    const reviewOverallResult = safeGet('reviewOverallResult')?.value || '';

    const reviewStrengths = safeGet('reviewStrengths')?.value || '';

    const reviewImprovements = safeGet('reviewImprovements')?.value || '';

    const reviewEmployeeComments = safeGet('reviewEmployeeComments')?.value || '';

    const reviewManagerComments = safeGet('reviewManagerComments')?.value || '';

    // Determine employee ID
    const employeeId = currentEmployee?.dbId || currentEmployee?.id;
    if (!employeeId) {
        showToast('No employee selected for review.', 'error');
        return;
    }
    const ratingToScore = (value) => {

        switch (String(value || '').trim()) {

            case 'Exceeds Expectations':

                return 4;

            case 'Meets Expectations':

                return 3;

            case 'Needs Improvement':

                return 2;

            case 'Unacceptable':

                return 1;

            default:

                return null;

        }

    };

    const communicationScore = ratingToScore(reviewCommunication);

    const judgementScore = ratingToScore(reviewJudgement);

    const initiativeScore = ratingToScore(reviewInitiative);

    const knowledgeScore = ratingToScore(reviewKnowledge);

    const trainingScore = ratingToScore(reviewTraining);

    const blendedAttitudeInputs = [

        communicationScore,

        judgementScore,

        initiativeScore,

        knowledgeScore,

        trainingScore

    ].filter(v => v !== null);

    const blendedAttitudeScore = blendedAttitudeInputs.length

        ? Math.round(blendedAttitudeInputs.reduce((sum, v) => sum + v, 0) / blendedAttitudeInputs.length)

        : null;

    const detailedCategorySummary = [

        `Quality of Work: ${reviewQuality || 'Not Rated'}`,

        `Attendance & Punctuality: ${reviewAttendance || 'Not Rated'}`,

        `Reliability / Dependability: ${reviewReliability || 'Not Rated'}`,

        `Communication Skills: ${reviewCommunication || 'Not Rated'}`,

        `Judgement & Decision-Making: ${reviewJudgement || 'Not Rated'}`,

        `Initiative & Flexibility: ${reviewInitiative || 'Not Rated'}`,

        `Cooperation & Teamwork: ${reviewTeamwork || 'Not Rated'}`,

        `Knowledge of Position: ${reviewKnowledge || 'Not Rated'}`,

        `Training & Development: ${reviewTraining || 'Not Rated'}`

    ].join('\n');

    // Prepare payload for Supabase
    const payload = {
        employee_id: employeeId,
        review_date: reviewDate,
        review_type: reviewType,
        attendance_score: ratingToScore(reviewAttendance),

        performance_score: ratingToScore(reviewQuality),

        teamwork_score: ratingToScore(reviewTeamwork),

        attitude_score: blendedAttitudeScore,

        reliability_score: ratingToScore(reviewReliability),
        overall_result: reviewOverallResult,
        strengths: reviewStrengths,
        improvements: reviewImprovements,
        employee_comments: reviewEmployeeComments,
        manager_comments: [reviewManagerComments, detailedCategorySummary].filter(Boolean).join('\n\n')
    };

    let error, data;
    if (currentReviewId) {
        // Update existing review
        const result = await supabaseClient
            .from('employee_reviews')
            .update(payload)
            .eq('id', currentReviewId);
        error = result.error;
        data = result.data;
    } else {
        // Insert new review
        const result = await supabaseClient
            .from('employee_reviews')
            .insert([payload]);
        error = result.error;
        data = result.data;
    }

    if (error) {
        console.error(error);
        showToast(currentReviewId ? 'Could not update review.' : 'Could not save review.', 'error');
        return;
    }

    showToast(currentReviewId ? 'Review updated.' : 'Review saved.');

    // --- Begin Review Auto-Sync Refresh Block ---
    if (typeof loadSummaryMetrics === 'function') {
        await loadSummaryMetrics();
    }
    if (typeof loadRiskEmployees === 'function') {
        await loadRiskEmployees();
    }
    if (typeof loadImpactPlayers === 'function') {
        await loadImpactPlayers();
    }
    if (currentEmployee && typeof openDrawer === 'function') {
        const refreshedEmployee = EMPLOYEES.find(e =>
            String(e.dbId) === String(currentEmployee.dbId) ||
            String(e.id) === String(currentEmployee.id)
        );
        if (refreshedEmployee) {
            openDrawer(refreshedEmployee);
            switchTab('reviews');
        }
    }
    // --- End Review Auto-Sync Refresh Block ---

    // Optionally reload employee reviews list
    if (typeof loadEmployeeReviews === 'function') {
        await loadEmployeeReviews(employeeId);
    }
}