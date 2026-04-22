

function openDrawer(employee) {
    if (!employee) return;

    if (typeof resetDrawerForms === 'function') {
        resetDrawerForms();
    }

    currentEmployee = employee;
    isCreatingEmployee = false;

    if (typeof applyRolePermissions === 'function') {
        applyRolePermissions();
    }

    if (typeof switchTab === 'function') {
        switchTab('profile');
    }

    if (typeof setText === 'function') {
        setText('drawerTitle', `${esc(employee.first)} ${esc(employee.last)}`);
        setText('drawerSub', `${esc(employee.position || 'Employee')} • ${esc(employee.dept || 'No department')}`);
    }

    if (typeof populateEmployeeAdminForm === 'function') {
        populateEmployeeAdminForm(employee);
    }

    if (typeof ensureDeleteEmployeeButton === 'function') {
        ensureDeleteEmployeeButton();
    }

    const detailRows = [
        ['Employee ID', employee.id],
        ['Status', employee.status],
        ['Department', employee.dept],
        ['Position', employee.position],
        ['Supervisor', employee.supervisor],
        ['Pay Type', employee.payType],
        ['Standard Hours', employee.stdHours],
        ['Hire Date', typeof fmtDate === 'function' ? fmtDate(employee.hireDate) : (employee.hireDate || '')],
        ['Next Review', typeof fmtDate === 'function' ? fmtDate(employee.nextReview) : (employee.nextReview || '')],
        ['Anniversary', typeof fmtDate === 'function' ? fmtDate(employee.anniversaryDate) : (employee.anniversaryDate || '')],
        ['Tenure Months', employee.tenureMonths],
        ['Tenure Years', employee.tenureYears],
        ['Benefits Status', employee.benefitsStatus],
        ['Tenure Bracket', employee.tenureBracket]
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
    setLoading('ecHistory', 'Loading emergency contact...');
    setLoading('docHistory', 'Loading documents...');
    setLoading('reviewsHistory', 'Loading reviews...');

    const backdrop = typeof safeGet === 'function' ? safeGet('drawerBackdrop') : document.getElementById('drawerBackdrop');
    const drawer = typeof safeGet === 'function' ? safeGet('employeeDrawer') : document.getElementById('employeeDrawer');
    backdrop?.classList.add('open');
    drawer?.classList.add('open');

    if (typeof loadEmployeeNotes === 'function') loadEmployeeNotes(employee.id);
    if (typeof loadEmployeeDiscipline === 'function') loadEmployeeDiscipline(employee.id);
    if (typeof loadEmployeeMeetings === 'function') loadEmployeeMeetings(employee.id);
    if (typeof loadEmergencyContacts === 'function') loadEmergencyContacts(employee.id);
    if (typeof loadEmployeeDocuments === 'function') loadEmployeeDocuments(employee.id);
    if (typeof loadEmployeeReviews === 'function') loadEmployeeReviews(employee.id);
    if (typeof loadEmployeeIncidents === 'function') loadEmployeeIncidents(employee.id);
    if (typeof loadStayInterviews === 'function') loadStayInterviews(employee.id);
    if (typeof loadEmployeeManualAtRisk === 'function') loadEmployeeManualAtRisk(employee.id);
    if (typeof loadEmployeeManualImpactPlayer === 'function') loadEmployeeManualImpactPlayer(employee.id);

    const markAtRiskBtn = typeof safeGet === 'function' ? safeGet('markAtRiskBtn') : document.getElementById('markAtRiskBtn');
    const clearAtRiskBtn = typeof safeGet === 'function' ? safeGet('clearAtRiskBtn') : document.getElementById('clearAtRiskBtn');
    const markImpactPlayerBtn = typeof safeGet === 'function' ? safeGet('markImpactPlayerBtn') : document.getElementById('markImpactPlayerBtn');
    const clearImpactPlayerBtn = typeof safeGet === 'function' ? safeGet('clearImpactPlayerBtn') : document.getElementById('clearImpactPlayerBtn');

    if (markAtRiskBtn && typeof markEmployeeAtRisk === 'function') markAtRiskBtn.onclick = markEmployeeAtRisk;
    if (clearAtRiskBtn && typeof clearAtRiskStatus === 'function') clearAtRiskBtn.onclick = clearAtRiskStatus;
    if (markImpactPlayerBtn && typeof markImpactPlayer === 'function') markImpactPlayerBtn.onclick = markImpactPlayer;
    if (clearImpactPlayerBtn && typeof clearImpactPlayerStatus === 'function') clearImpactPlayerBtn.onclick = clearImpactPlayerStatus;
}

function closeDrawer() {
    const backdrop = typeof safeGet === 'function' ? safeGet('drawerBackdrop') : document.getElementById('drawerBackdrop');
    const drawer = typeof safeGet === 'function' ? safeGet('employeeDrawer') : document.getElementById('employeeDrawer');

    backdrop?.classList.remove('open');
    drawer?.classList.remove('open');

    currentEmployee = null;
}

function switchDrawerTab(tabName) {
    if (typeof switchTab === 'function') {
        switchTab(tabName);
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
        closeBtn.addEventListener('click', closeDrawer);
    }

    document.querySelectorAll('.tab-btn').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;
            switchDrawerTab(tabName);
        });
    });
}

window.openDrawer = openDrawer;
window.closeDrawer = closeDrawer;
window.switchDrawerTab = switchDrawerTab;
window.bindDrawerEvents = bindDrawerEvents;