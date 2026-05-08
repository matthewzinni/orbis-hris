function cleanDrawerEmployeeNameValue(value) {
    return String(value || '')
        .replace(/\bAt[-\s]*Risk\b/gi, '')
        .replace(/\bImpact\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
}



function cleanVisibleDrawerNameInputs() {
    const possibleFirstNameIds = ['empFirstName', 'firstName', 'employeeFirstName', 'firstNameInput'];
    const possibleLastNameIds = ['empLastName', 'lastName', 'employeeLastName', 'lastNameInput'];

    [...possibleFirstNameIds, ...possibleLastNameIds].forEach(id => {
        const field = typeof safeGet === 'function' ? safeGet(id) : document.getElementById(id);

        if (!field || typeof field.value !== 'string') return;

        const cleanedValue = cleanDrawerEmployeeNameValue(field.value);

        if (field.value !== cleanedValue) {
            field.value = cleanedValue;
        }
    });
}

function getTrustedEmployeeDisplayId(employee) {
    if (!employee) return '';

    const possibleIds = [
        employee.employee_id,
        employee.employeeId,
        employee.employeeID,
        employee.employeeCode,
        employee.employee_code,
        employee.id
    ];

    const trustedId = possibleIds.find(value => /^BTW\d+$/i.test(String(value || '').trim()));

    return trustedId ? String(trustedId).trim().toUpperCase() : '';
}

function getDrawerHeaderEmployeeId() {
    const header = document.getElementById('employeeDrawerIdentityHeader');

    if (!header) return '';

    const text = String(header.textContent || '');
    const match = text.match(/BTW\d+/i);

    return match ? match[0].toUpperCase() : '';
}

function setDrawerAdminField(possibleIds, value) {
    possibleIds.forEach(id => {
        const field = typeof safeGet === 'function' ? safeGet(id) : document.getElementById(id);

        if (!field) return;

        if ('value' in field) {
            field.value = value || '';
        } else {
            field.textContent = value || '';
        }
    });
}

function normalizeDrawerLabelText(value) {
    return String(value || '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

function setDrawerAdminFieldByLabel(labelText, value) {
    const drawer = typeof safeGet === 'function' ? safeGet('employeeDrawer') : document.getElementById('employeeDrawer');

    if (!drawer) return;

    const normalizedTarget = normalizeDrawerLabelText(labelText);
    const possibleLabels = Array.from(drawer.querySelectorAll('label, .field-label, .form-label, .detail-label, [class*="label"], div, span'));

    const label = possibleLabels.find(el => normalizeDrawerLabelText(el.textContent) === normalizedTarget);

    if (!label) return;

    const wrapper = label.closest('.field, .form-field, .form-group, .input-group, .detail-card, .admin-field, .control-group') || label.parentElement;

    if (!wrapper) return;

    const field = wrapper.querySelector('input, select, textarea');

    if (!field) return;

    field.value = value || '';
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
}

function forcePopulateEmployeeAdminFieldsByLabels(employee) {
    if (!employee) return;

    const employeeId = getDrawerHeaderEmployeeId() || getTrustedEmployeeDisplayId(employee);
    const firstName = cleanDrawerEmployeeNameValue(employee.first || employee.first_name || '');
    const lastName = cleanDrawerEmployeeNameValue(employee.last || employee.last_name || '');
    const department = employee.dept || employee.department || '';
    const position = employee.position || '';
    const supervisor = employee.supervisor || '';
    const payType = employee.payType || employee.pay_type || '';
    const standardHours = employee.stdHours || employee.standard_hours || '';
    const status = employee.status || 'Active';
    const benefitsStatus = employee.benefitsStatus || employee.benefits_status || '';
    const hireDate = formatDrawerDateForInput(employee.hireDate || employee.hire_date || '');
    const nextReview = formatDrawerDateForInput(employee.nextReview || employee.next_review || employee.next_review_date || '');
    const anniversaryDate = getNextUpcomingAnniversaryDate(employee.anniversaryDate || employee.anniversary_date || employee.hireDate || employee.hire_date || '');

    setDrawerAdminFieldByLabel('Employee ID', employeeId);
    setDrawerAdminFieldByLabel('First Name', firstName);
    setDrawerAdminFieldByLabel('Last Name', lastName);
    setDrawerAdminFieldByLabel('Department', department);
    setDrawerAdminFieldByLabel('Position', position);
    setDrawerAdminFieldByLabel('Supervisor', supervisor);
    setDrawerAdminFieldByLabel('Pay Type', payType);
    setDrawerAdminFieldByLabel('Standard Hours', standardHours);
    setDrawerAdminFieldByLabel('Status', status);
    setDrawerAdminFieldByLabel('Benefits Status', benefitsStatus);
    setDrawerAdminFieldByLabel('Hire Date', hireDate);
    setDrawerAdminFieldByLabel('Next Review Date', nextReview);
    setDrawerAdminFieldByLabel('Anniversary Date', anniversaryDate);
}

function forcePopulateEmployeeAdminPanel(employee) {

    forcePopulateEmployeeAdminFields(employee);

    forcePopulateEmployeeAdminFieldsByLabels(employee);

    forcePopulateVisibleEmployeeAdminPanel(employee);

    setDrawerAdminField(['empAnniversaryDate', 'anniversaryDate', 'employeeAnniversaryDate', 'employeeAnniversaryInput', 'employeeAnniversaryDateInput', 'anniversaryInput', 'anniversaryDateInput', 'adminAnniversaryDate'], getNextUpcomingAnniversaryDate(employee.anniversaryDate || employee.anniversary_date || employee.hireDate || employee.hire_date || ''));

    cleanVisibleDrawerNameInputs();

}

function getVisibleEmployeeAdminPanel() {
    const drawer = typeof safeGet === 'function' ? safeGet('employeeDrawer') : document.getElementById('employeeDrawer');

    if (!drawer) return null;

    const panels = Array.from(drawer.querySelectorAll('.tab-panel, .panel, .card, section, form, div'));

    return panels.find(panel => {
        const text = String(panel.textContent || '').toLowerCase();
        const isVisible = panel.offsetParent !== null;
        return isVisible && text.includes('employee record management');
    }) || null;
}

function formatDrawerDateForInput(value) {

    if (!value) return '';

    const raw = String(value).trim();

    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {

        return raw.slice(0, 10);

    }

    const parsedDate = new Date(raw);

    if (!Number.isNaN(parsedDate.getTime())) {

        const year = parsedDate.getFullYear();

        const month = String(parsedDate.getMonth() + 1).padStart(2, '0');

        const day = String(parsedDate.getDate()).padStart(2, '0');

        return `${year}-${month}-${day}`;

    }

    return '';

}

function formatDrawerDateForDisplay(value) {
    const inputValue = formatDrawerDateForInput(value);

    if (!inputValue) return '';

    const [year, month, day] = inputValue.split('-').map(Number);

    if (!year || !month || !day) return inputValue;

    const localDate = new Date(year, month - 1, day);

    return localDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
}

function getNextUpcomingAnniversaryDate(value) {
    const inputValue = formatDrawerDateForInput(value);

    if (!inputValue) return '';

    const [year, month, day] = inputValue.split('-').map(Number);

    if (!year || !month || !day) return inputValue;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let anniversary = new Date(today.getFullYear(), month - 1, day);

    if (anniversary < today) {
        anniversary = new Date(today.getFullYear() + 1, month - 1, day);
    }

    const nextYear = anniversary.getFullYear();
    const nextMonth = String(anniversary.getMonth() + 1).padStart(2, '0');
    const nextDay = String(anniversary.getDate()).padStart(2, '0');

    return `${nextYear}-${nextMonth}-${nextDay}`;
}

function forcePopulateVisibleEmployeeAdminPanel(employee) {
    if (!employee) return;

    const panel = getVisibleEmployeeAdminPanel();

    if (!panel) return;

    const fields = Array.from(panel.querySelectorAll('input, select, textarea'));

    const values = [
        getDrawerHeaderEmployeeId() || getTrustedEmployeeDisplayId(employee),
        employee.status || 'Active',
        cleanDrawerEmployeeNameValue(employee.first || employee.first_name || ''),
        cleanDrawerEmployeeNameValue(employee.last || employee.last_name || ''),
        employee.dept || employee.department || '',
        employee.position || '',
        employee.supervisor || '',
        employee.payType || employee.pay_type || '',
        employee.stdHours || employee.standard_hours || '',
        employee.benefitsStatus || employee.benefits_status || '',
        formatDrawerDateForInput(employee.hireDate || employee.hire_date || ''),
        formatDrawerDateForInput(employee.nextReview || employee.next_review || employee.next_review_date || ''),
        getNextUpcomingAnniversaryDate(employee.anniversaryDate || employee.anniversary_date || employee.hireDate || employee.hire_date || ''),
        employee.tenureBracket || employee.tenure_bracket || ''
    ];

    fields.forEach((field, index) => {
        if (index >= values.length) return;

        field.value = values[index] || '';
        field.dispatchEvent(new Event('input', { bubbles: true }));
        field.dispatchEvent(new Event('change', { bubbles: true }));
    });
}

function forcePopulateEmployeeAdminFields(employee) {
    if (!employee) return;

    const employeeId = getDrawerHeaderEmployeeId() || getTrustedEmployeeDisplayId(employee);
    const firstName = cleanDrawerEmployeeNameValue(employee.first || employee.first_name || '');
    const lastName = cleanDrawerEmployeeNameValue(employee.last || employee.last_name || '');
    const department = employee.dept || employee.department || '';
    const position = employee.position || '';
    const supervisor = employee.supervisor || '';
    const payType = employee.payType || employee.pay_type || '';
    const standardHours = employee.stdHours || employee.standard_hours || '';
    const status = employee.status || 'Active';
    const benefitsStatus = employee.benefitsStatus || employee.benefits_status || '';
    const hireDate = formatDrawerDateForInput(employee.hireDate || employee.hire_date || '');
    const nextReview = formatDrawerDateForInput(employee.nextReview || employee.next_review || employee.next_review_date || '');
    const anniversaryDate = getNextUpcomingAnniversaryDate(employee.anniversaryDate || employee.anniversary_date || employee.hireDate || employee.hire_date || '');

    setDrawerAdminField(['empId', 'employeeId', 'employeeID', 'employee_id', 'adminEmployeeId'], employeeId);
    setDrawerAdminField(['empFirstName', 'firstName', 'employeeFirstName', 'firstNameInput', 'adminFirstName'], firstName);
    setDrawerAdminField(['empLastName', 'lastName', 'employeeLastName', 'lastNameInput', 'adminLastName'], lastName);
    setDrawerAdminField(['empDepartment', 'department', 'employeeDepartment', 'departmentInput', 'adminDepartment'], department);
    setDrawerAdminField(['empPosition', 'position', 'employeePosition', 'positionInput', 'adminPosition'], position);
    setDrawerAdminField(['empSupervisor', 'supervisor', 'employeeSupervisor', 'supervisorInput', 'adminSupervisor'], supervisor);
    setDrawerAdminField(['empPayType', 'payType', 'employeePayType', 'payTypeInput', 'adminPayType'], payType);
    setDrawerAdminField(['empStandardHours', 'standardHours', 'stdHours', 'employeeStandardHours', 'standardHoursInput', 'adminStandardHours'], standardHours);
    setDrawerAdminField(['empStatus', 'status', 'employeeStatus', 'statusInput', 'adminStatus'], status);
    setDrawerAdminField(['empBenefitsStatus', 'benefitsStatus', 'employeeBenefitsStatus', 'benefitsStatusInput', 'adminBenefitsStatus'], benefitsStatus);
    setDrawerAdminField(['empHireDate', 'hireDate', 'employeeHireDate', 'hireDateInput', 'adminHireDate'], hireDate);
    setDrawerAdminField(['empNextReviewDate', 'nextReviewDate', 'nextReview', 'employeeNextReview', 'nextReviewInput', 'adminNextReview'], nextReview);
    setDrawerAdminField(['empAnniversaryDate', 'anniversaryDate', 'employeeAnniversaryDate', 'employeeAnniversaryInput', 'employeeAnniversaryDateInput', 'anniversaryInput', 'anniversaryDateInput', 'adminAnniversaryDate'], anniversaryDate);
}

function getResolvedDrawerEmployeeId(employee = null) {
    return getTrustedEmployeeDisplayId(employee) ||
        employee?.dbId ||
        window.currentEmployee?.dbId ||
        getTrustedEmployeeDisplayId(window.currentEmployee) ||
        null;
}

function openDrawer(employee) {
    if (!employee) return;

    employee = {
        ...employee,
        first: cleanDrawerEmployeeNameValue(employee.first || employee.first_name || ''),
        last: cleanDrawerEmployeeNameValue(employee.last || employee.last_name || ''),
        first_name: cleanDrawerEmployeeNameValue(employee.first_name || employee.first || ''),
        last_name: cleanDrawerEmployeeNameValue(employee.last_name || employee.last || '')
    };

    if (typeof resetDrawerForms === 'function') {
        resetDrawerForms();
    }

    window.currentEmployee = employee;

    if (typeof window.setCurrentEmployeeForOrbis === 'function') {
        window.setCurrentEmployeeForOrbis(employee);
    }

    window.isCreatingEmployee = false;

    let employeeId = getResolvedDrawerEmployeeId(employee);

    const canonicalEmployee = (window.EMPLOYEES || []).find(item => {
        const sameEmployeeId = item.employee_id && employee.employee_id && String(item.employee_id) === String(employee.employee_id);
        const sameEmployeeIdAlt = item.employee_id && employee.employeeId && String(item.employee_id) === String(employee.employeeId);
        return sameEmployeeId || sameEmployeeIdAlt;
    });

    if (canonicalEmployee) {
        employee = {
            ...canonicalEmployee,
            ...employee,
            employee_id: getTrustedEmployeeDisplayId(employee) || getTrustedEmployeeDisplayId(canonicalEmployee)
        };
        window.currentEmployee = employee;
        employeeId = getResolvedDrawerEmployeeId(employee);
    }

    if (!employeeId) return;

    const displayEmployeeId = getTrustedEmployeeDisplayId(employee) || employeeId;
    const employeeName = `${employee.first || employee.first_name || ''} ${employee.last || employee.last_name || ''}`.trim() || 'Employee Record';
    const employeePosition = employee.position || 'Employee';
    const employeeDepartment = employee.dept || employee.department || 'No department';
    const employeeStatus = employee.status || 'Active';

    const existingHeader = document.getElementById('employeeDrawerIdentityHeader');

    if (existingHeader) {
        existingHeader.remove();
    }

    if (typeof switchTab === 'function') {
        switchTab('profile');
    }

    if (typeof setText === 'function') {
        setText('drawerTitle', `${employee.first} ${employee.last}`);
        setText('drawerSub', `${employee.position || 'Employee'} • ${employee.dept || employee.department || 'No department'}`);
    }

    if (typeof populateEmployeeForm === 'function') {
        populateEmployeeForm(employee);
    }

    forcePopulateEmployeeAdminPanel(employee);
    setTimeout(() => forcePopulateEmployeeAdminPanel(window.currentEmployee), 50);
    setTimeout(() => forcePopulateEmployeeAdminPanel(window.currentEmployee), 250);
    setTimeout(() => forcePopulateEmployeeAdminPanel(window.currentEmployee), 750);

    if (typeof ensureDeleteEmployeeButton === 'function') {
        ensureDeleteEmployeeButton();
    }

    if (typeof safeGet === 'function' && typeof runTerminateEmployee === 'function') {
        const saveBtn = safeGet('saveEmployeeBtn');
        const newBtn = safeGet('newEmployeeBtn');
        const actionsRow = (newBtn && newBtn.parentElement) || (saveBtn && saveBtn.parentElement);
        let terminateBtn = safeGet('terminateEmployeeBtn');

        if (actionsRow && !terminateBtn) {
            terminateBtn = document.createElement('button');
            terminateBtn.type = 'button';
            terminateBtn.id = 'terminateEmployeeBtn';
            terminateBtn.className = 'button danger';
            terminateBtn.textContent = 'Terminate Employee';
            terminateBtn.onclick = () => runTerminateEmployee();
            actionsRow.appendChild(terminateBtn);
        }
    }

    if (typeof applyRolePermissions === 'function') {
        applyRolePermissions();
    }

    const detailRows = [
        ['Employee ID', displayEmployeeId],
        ['Status', employee.status],
        ['Department', employee.dept || employee.department],
        ['Position', employee.position],
        ['Supervisor', employee.supervisor],
        ['Pay Type', employee.payType || employee.pay_type],
        ['Standard Hours', employee.stdHours || employee.standard_hours],
        ['Hire Date', formatDrawerDateForDisplay(employee.hireDate || employee.hire_date)],
        ['Next Review', formatDrawerDateForDisplay(employee.nextReview || employee.next_review || employee.next_review_date)],
        ['Anniversary', formatDrawerDateForDisplay(getNextUpcomingAnniversaryDate(employee.anniversaryDate || employee.anniversary_date || employee.hireDate || employee.hire_date))],
        ['Tenure Months', employee.tenureMonths || employee.tenure_months],
        ['Tenure Years', employee.tenureYears || employee.tenure_years],
        ['Benefits Status', employee.benefitsStatus || employee.benefits_status],
        ['Tenure Bracket', employee.tenureBracket || employee.tenure_bracket]
    ];

    const details = typeof safeGet === 'function' ? safeGet('drawerDetails') : document.getElementById('drawerDetails');

    if (details) {
        details.innerHTML = detailRows.map(([label, value]) => `
      <div class="detail-card">
        <div class="detail-label">${esc(label)}</div>
        <div class="detail-value">${esc(value)}</div>
      </div>
    `).join('');
    }

    const setLoading = (id, text) => {
        const el = typeof safeGet === 'function' ? safeGet(id) : document.getElementById(id);
        if (el) el.innerHTML = `<div class="empty">${text}</div>`;
    };

    setLoading('notesHistory', 'Loading notes...');
    setLoading('disciplineHistory', 'Loading discipline history...');
    setLoading('meetingsHistory', 'Loading meetings...');
    setLoading('incidentsHistory', 'Loading incidents...');
    setLoading('ecHistory', 'Loading emergency contact...');
    setLoading('docHistory', 'Loading documents...');
    setLoading('reviewsHistory', 'Loading reviews...');
    setLoading('stayInterviewsHistory', 'Loading stay interviews...');
    setLoading('onboardingHistory', 'Loading onboarding...');

    const backdrop = typeof safeGet === 'function' ? safeGet('drawerBackdrop') : document.getElementById('drawerBackdrop');
    const drawer = typeof safeGet === 'function' ? safeGet('employeeDrawer') : document.getElementById('employeeDrawer');

    if (drawer) {
        const drawerIdentityHeader = document.createElement('div');

        drawerIdentityHeader.id = 'employeeDrawerIdentityHeader';
        drawerIdentityHeader.className = 'employee-drawer-identity-header';

        drawerIdentityHeader.innerHTML = `
            <div class="employee-drawer-avatar">${esc(employeeName.charAt(0).toUpperCase())}</div>
            <div class="employee-drawer-title-block">
                <div class="employee-drawer-name">${esc(employeeName)}</div>
                <div class="employee-drawer-meta">${esc(displayEmployeeId)} • ${esc(employeePosition)} • ${esc(employeeDepartment)}</div>
            </div>
            <div class="employee-drawer-header-actions">
                <div class="employee-drawer-status-pill">${esc(employeeStatus)}</div>
                <button type="button" class="employee-drawer-close-btn" id="employeeDrawerCloseBtn">×</button>
            </div>
        `;

        drawer.prepend(drawerIdentityHeader);

        const tabRow = drawer.querySelector('.tab-btn')?.parentElement ||
            drawer.querySelector('.drawer-tabs') ||
            drawer.querySelector('.tab-bar') ||
            drawer.querySelector('.tabs') ||
            drawer.querySelector('.tab-nav') ||
            drawer.querySelector('.tab-buttons') ||
            drawer.querySelector('.drawer-tab-row');

        if (tabRow && tabRow.parentElement !== drawer) {
            drawerIdentityHeader.after(tabRow);
        } else if (tabRow) {
            drawerIdentityHeader.after(tabRow);
        }

        const customCloseBtn = drawer.querySelector('#employeeDrawerCloseBtn');

        if (customCloseBtn) {
            customCloseBtn.onclick = () => closeDrawer();
        }

        const oldDrawerHeader = drawer.querySelector('.drawer-header');

        if (oldDrawerHeader) {
            oldDrawerHeader.style.display = 'none';
            oldDrawerHeader.style.height = '0';
            oldDrawerHeader.style.minHeight = '0';
            oldDrawerHeader.style.padding = '0';
            oldDrawerHeader.style.margin = '0';
            oldDrawerHeader.style.overflow = 'hidden';
        }

        const drawerContent = drawer.querySelector('.drawer-content') || drawer.querySelector('.drawer-body');

        if (drawerContent) {
            drawerContent.style.paddingTop = '0';
            drawerContent.style.marginTop = '0';
        }
    }

    backdrop?.classList.add('open');

    if (drawer) {
        drawer.classList.remove('closing');
        requestAnimationFrame(() => {
            drawer.classList.add('open');
        });
    }

    if (typeof loadEmployeeNotes === 'function') loadEmployeeNotes(employeeId);
    if (typeof loadEmployeeDiscipline === 'function') loadEmployeeDiscipline(employeeId);
    if (typeof loadEmployeeMeetings === 'function') loadEmployeeMeetings(employeeId);
    if (typeof loadEmergencyContacts === 'function') loadEmergencyContacts(employeeId);
    if (typeof loadEmployeeDocuments === 'function') loadEmployeeDocuments(employeeId);
    if (typeof loadEmployeeReviews === 'function') loadEmployeeReviews(employeeId);
    if (typeof loadEmployeeIncidents === 'function') loadEmployeeIncidents(employeeId);
    if (typeof loadStayInterviews === 'function') loadStayInterviews(employeeId);
    if (typeof loadEmployeeOnboarding === 'function') loadEmployeeOnboarding(employeeId);
    if (typeof loadEmployeeManualAtRisk === 'function') loadEmployeeManualAtRisk(employeeId);
    if (typeof loadEmployeeManualImpactPlayer === 'function') loadEmployeeManualImpactPlayer(employeeId);
    if (typeof loadEmployeeHistory === 'function') loadEmployeeHistory(employeeId);

    const markAtRiskBtn = typeof safeGet === 'function' ? safeGet('markAtRiskBtn') : document.getElementById('markAtRiskBtn');
    const clearAtRiskBtn = typeof safeGet === 'function' ? safeGet('clearAtRiskBtn') : document.getElementById('clearAtRiskBtn');
    const markImpactPlayerBtn = typeof safeGet === 'function' ? safeGet('markImpactPlayerBtn') : document.getElementById('markImpactPlayerBtn');
    const clearImpactPlayerBtn = typeof safeGet === 'function' ? safeGet('clearImpactPlayerBtn') : document.getElementById('clearImpactPlayerBtn');

    if (markAtRiskBtn && typeof markEmployeeAtRisk === 'function') markAtRiskBtn.onclick = markEmployeeAtRisk;
    if (clearAtRiskBtn && typeof clearAtRiskStatus === 'function') clearAtRiskBtn.onclick = clearAtRiskStatus;
    if (markImpactPlayerBtn && typeof markImpactPlayer === 'function') markImpactPlayerBtn.onclick = markImpactPlayer;
    if (clearImpactPlayerBtn && typeof clearImpactPlayerStatus === 'function') clearImpactPlayerBtn.onclick = clearImpactPlayerStatus;

    cleanVisibleDrawerNameInputs();
}

function closeDrawer() {
    const backdrop = typeof safeGet === 'function' ? safeGet('drawerBackdrop') : document.getElementById('drawerBackdrop');
    const drawer = typeof safeGet === 'function' ? safeGet('employeeDrawer') : document.getElementById('employeeDrawer');

    backdrop?.classList.remove('open');

    if (drawer) {
        drawer.classList.add('closing');
        drawer.classList.remove('open');

        setTimeout(() => {
            drawer.classList.remove('closing');
        }, 250);
    }

    window.currentEmployee = null;

    if (typeof window.setCurrentEmployeeForOrbis === 'function') {
        window.setCurrentEmployeeForOrbis(null);
    }

    if (typeof resetDrawerForms === 'function') {
        resetDrawerForms();
    }
}

function switchDrawerTab(tabName) {
    if (typeof switchTab === 'function') {
        switchTab(tabName);
        if (tabName === 'admin' || tabName === 'employeeAdmin' || tabName === 'employee-admin') {
            setTimeout(() => forcePopulateEmployeeAdminPanel(window.currentEmployee), 25);
            setTimeout(() => forcePopulateEmployeeAdminPanel(window.currentEmployee), 150);
        }
        return;
    }

    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.classList.toggle('active', panel.id === `tab-${tabName}`);
    });
}

function bindDrawerEvents() {
    const closeBtn = document.getElementById('drawerClose');

    if (closeBtn) {
        closeBtn.onclick = closeDrawer;
    }

    const backdrop = document.getElementById('drawerBackdrop');

    if (backdrop) {
        backdrop.onclick = (event) => {
            if (event.target === backdrop) {
                closeDrawer();
            }
        };
    }

    if (!window.drawerEscapeKeyBound) {
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                const drawer = document.getElementById('employeeDrawer');
                if (drawer?.classList.contains('open')) {
                    closeDrawer();
                }
            }
        });

        window.drawerEscapeKeyBound = true;
    }

    document.querySelectorAll('.tab-btn').forEach(tab => {
        tab.onclick = () => {
            const tabName = tab.dataset.tab;
            if (tabName) switchDrawerTab(tabName);

            const tabText = String(tab.textContent || '').trim().toLowerCase();
            const isEmployeeAdminTab = tabText.includes('employee admin') ||
                tabName === 'admin' ||
                tabName === 'employeeAdmin' ||
                tabName === 'employee-admin';

            if (isEmployeeAdminTab) {
                setTimeout(() => forcePopulateEmployeeAdminPanel(window.currentEmployee), 25);
                setTimeout(() => forcePopulateEmployeeAdminPanel(window.currentEmployee), 150);
                setTimeout(() => forcePopulateEmployeeAdminPanel(window.currentEmployee), 500);
                setTimeout(() => forcePopulateEmployeeAdminPanel(window.currentEmployee), 1000);
            }
        };
    });
}


window.getResolvedDrawerEmployeeId = getResolvedDrawerEmployeeId;
window.openDrawer = openDrawer;
window.closeDrawer = closeDrawer;
window.switchDrawerTab = switchDrawerTab;
window.bindDrawerEvents = bindDrawerEvents;
window.forcePopulateEmployeeAdminPanel = forcePopulateEmployeeAdminPanel;
window.drawerEscapeKeyBound = window.drawerEscapeKeyBound || false;
window.getDrawerHeaderEmployeeId = getDrawerHeaderEmployeeId;

window.formatDrawerDateForDisplay = formatDrawerDateForDisplay;
window.getNextUpcomingAnniversaryDate = getNextUpcomingAnniversaryDate;

setInterval(() => {
    const drawer = typeof safeGet === 'function' ? safeGet('employeeDrawer') : document.getElementById('employeeDrawer');
    const adminPanel = typeof getVisibleEmployeeAdminPanel === 'function' ? getVisibleEmployeeAdminPanel() : null;

    if (!drawer?.classList.contains('open') || !adminPanel || !window.currentEmployee) return;

    const nextAnniversary = getNextUpcomingAnniversaryDate(
        window.currentEmployee.anniversaryDate ||
        window.currentEmployee.anniversary_date ||
        window.currentEmployee.hireDate ||
        window.currentEmployee.hire_date ||
        ''
    );

    setDrawerAdminField(
        ['empAnniversaryDate', 'anniversaryDate', 'employeeAnniversaryDate', 'employeeAnniversaryInput', 'employeeAnniversaryDateInput', 'anniversaryInput', 'anniversaryDateInput', 'adminAnniversaryDate'],
        nextAnniversary
    );
}, 1000);
