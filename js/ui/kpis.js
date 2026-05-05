function getCurrentAtRiskRosterMap() {
    return window.currentAtRiskRosterMap || {};
}
function getKpiEmployees() {
    if (Array.isArray(window.ALL_EMPLOYEES)) return window.ALL_EMPLOYEES;
    if (Array.isArray(window.EMPLOYEES)) return window.EMPLOYEES;
    return [];
}

function compareKpiText(a, b) {
    if (typeof window.compareText === 'function') return window.compareText(a, b);
    if (typeof compareText === 'function') return compareText(a, b);
    return String(a || '').localeCompare(String(b || ''));
}
function renderKpiEmployeeMetrics() {
    // ... other code ...

    const turnoverRiskEmployees = reviewEligibleActive.filter(e => {
        const tenureMonths = Number(e.tenureMonths) || 0;
        const isFirstThreeMonths = tenureMonths > 0 && tenureMonths <= 3;
        const employeeKey = String(e.dbId || e.id || '');
        const riskMeta = getCurrentAtRiskRosterMap()?.[employeeKey] || null;
        const isAtRisk = !!riskMeta && (
            riskMeta.lowReview === true ||
            Number(riskMeta.openIncidentCount || 0) > 0 ||
            String(riskMeta.manualReason || '').trim() !== ''
        );

        return isFirstThreeMonths && isAtRisk;
    });

    // ... other code ...

    /*
    const employees = Array.isArray(window.ALL_EMPLOYEES)
        ? window.ALL_EMPLOYEES
        : (Array.isArray(window.EMPLOYEES) ? window.EMPLOYEES : (Array.isArray(EMPLOYEES) ? EMPLOYEES : []));

    const getEmployeeStatus = (employee) =>
        String(employee.status || employee.displayStatus || employee.employee_status || '')
            .trim()
            .toUpperCase();

    const terminatedEmployees = employees.filter(e => {
        const status = getEmployeeStatus(e);
        return status === 'TERMINATED';
    });

    const activeEmployees = employees.filter(e =>
        getEmployeeStatus(e) === 'ACTIVE'
    );

    const totalWorkforce = activeEmployees.length + terminatedEmployees.length;

    const turnoverRate = totalWorkforce
        ? ((terminatedEmployees.length / totalWorkforce) * 100).toFixed(1)
        : '0.0';

    if (typeof safeSet === 'function') {
        safeSet('kTurnover', `${turnoverRate}%`);
    } else {
        const turnoverEl = document.getElementById('kTurnover');
        if (turnoverEl) turnoverEl.textContent = `${turnoverRate}%`;
    }

    const turnoverSubtext = document.getElementById('turnoverSubtext') || document.getElementById('kTurnoverSubtext');
    if (turnoverSubtext) {
        turnoverSubtext.textContent = `${terminatedEmployees.length} terminated employee${terminatedEmployees.length === 1 ? '' : 's'} retained for turnover tracking`;
    }

    const newHireTerminatedEmployees = terminatedEmployees.filter(e => {
        const tenureMonths = Number(e.tenureMonths || e.tenure_months || 0);
        return tenureMonths > 0 && tenureMonths <= 3;
    });

    const newHirePopulation = employees.filter(e => {
        const tenureMonths = Number(e.tenureMonths || e.tenure_months || 0);
        const status = getEmployeeStatus(e);
        return tenureMonths > 0 && tenureMonths <= 3 && (status === 'ACTIVE' || status === 'TERMINATED');
    });

    const newHireTurnoverRate = newHirePopulation.length
        ? ((newHireTerminatedEmployees.length / newHirePopulation.length) * 100).toFixed(1)
        : '0.0';

    if (typeof safeSet === 'function') {
        safeSet('kNewHireTurnover', `${newHireTurnoverRate}%`);
    } else {
        const newHireTurnoverEl = document.getElementById('kNewHireTurnover');
        if (newHireTurnoverEl) newHireTurnoverEl.textContent = `${newHireTurnoverRate}%`;
    }

    const newHireTurnoverSubtext = document.getElementById('newHireTurnoverSubtext') || document.getElementById('kNewHireTurnoverSubtext');
    if (newHireTurnoverSubtext) {
        newHireTurnoverSubtext.textContent = `${newHireTerminatedEmployees.length} terminated new hire${newHireTerminatedEmployees.length === 1 ? '' : 's'} in first 90 days`;
    }
    */

    // ... other code ...

    if (typeof refreshTurnoverKpisFromSupabase === 'function') {
        refreshTurnoverKpisFromSupabase();
    }
}

async function refreshTurnoverKpisFromSupabase() {
    const db = window.supabaseClient || (typeof supabaseClient !== 'undefined' ? supabaseClient : null);

    if (!db) return;

    const { data, error } = await db
        .from('employees')
        .select('id, first_name, last_name, status, hire_date, tenure_months');

    if (error) {
        console.warn('Could not refresh turnover KPIs from Supabase:', error);
        return;
    }

    const employees = Array.isArray(data) ? data : [];
    console.log('[Turnover KPI] employees:', employees.length, employees.map(e => ({ id: e.id, name: `${e.first_name || ''} ${e.last_name || ''}`.trim(), status: e.status })));

    const getStatus = employee => String(employee.status || '').trim().toUpperCase();

    const activeEmployees = employees.filter(employee => getStatus(employee) === 'ACTIVE');

    const terminatedEmployees = employees.filter(employee => {
        const status = getStatus(employee);
        return status === 'TERMINATED';
    });

    const totalWorkforce = activeEmployees.length + terminatedEmployees.length;

    const turnoverRate = totalWorkforce
        ? ((terminatedEmployees.length / totalWorkforce) * 100).toFixed(1)
        : '0.0';

    if (typeof safeSet === 'function') {
        safeSet('kTurnover', `${turnoverRate}%`);
    } else {
        const turnoverEl = document.getElementById('kTurnover');
        if (turnoverEl) turnoverEl.textContent = `${turnoverRate}%`;
    }

    const turnoverSubtext = document.getElementById('turnoverSubtext') || document.getElementById('kTurnoverSubtext');
    if (turnoverSubtext) {
        turnoverSubtext.textContent = `${terminatedEmployees.length} terminated employee${terminatedEmployees.length === 1 ? '' : 's'} retained for turnover tracking`;
    }

    const getTenureMonths = employee => {
        const storedTenure = Number(employee.tenureMonths || employee.tenure_months || 0);
        if (storedTenure > 0) return storedTenure;

        if (!employee.hire_date) return 0;

        const hiredAt = new Date(employee.hire_date);
        if (Number.isNaN(hiredAt.getTime())) return 0;

        const now = new Date();
        return Math.max(0, ((now.getFullYear() - hiredAt.getFullYear()) * 12) + (now.getMonth() - hiredAt.getMonth()));
    };

    const newHireTerminatedEmployees = terminatedEmployees.filter(employee => {
        const tenureMonths = getTenureMonths(employee);
        return tenureMonths >= 0 && tenureMonths <= 3;
    });

    const newHirePopulation = employees.filter(employee => {
        const status = getStatus(employee);
        const tenureMonths = getTenureMonths(employee);
        return tenureMonths >= 0 && tenureMonths <= 3 && (status === 'ACTIVE' || status === 'TERMINATED');
    });

    const newHireTurnoverRate = newHirePopulation.length
        ? ((newHireTerminatedEmployees.length / newHirePopulation.length) * 100).toFixed(1)
        : '0.0';

    if (typeof safeSet === 'function') {
        safeSet('kNewHireTurnover', `${newHireTurnoverRate}%`);
    } else {
        const newHireTurnoverEl = document.getElementById('kNewHireTurnover');
        if (newHireTurnoverEl) newHireTurnoverEl.textContent = `${newHireTurnoverRate}%`;
    }

    const newHireTurnoverSubtext = document.getElementById('newHireTurnoverSubtext') || document.getElementById('kNewHireTurnoverSubtext');
    if (newHireTurnoverSubtext) {
        newHireTurnoverSubtext.textContent = `${newHireTerminatedEmployees.length} terminated new hire${newHireTerminatedEmployees.length === 1 ? '' : 's'} in first 90 days`;
    }

    window.ALL_EMPLOYEES = employees;
}

window.refreshTurnoverKpisFromSupabase = refreshTurnoverKpisFromSupabase;
setTimeout(refreshTurnoverKpisFromSupabase, 500);
setTimeout(refreshTurnoverKpisFromSupabase, 1500);

function buildKpiHoverDetails() {
    // ... other code ...

    const turnoverRiskEmployees = getKpiEmployees().filter(e => {
        const isActive = String(e.status || e.displayStatus || e.employee_status || '').trim().toUpperCase() === 'ACTIVE';
        const isContract = String(e.payType || '').toLowerCase().includes('contract');
        const tenureMonths = Number(e.tenureMonths) || 0;
        const isFirstThreeMonths = tenureMonths > 0 && tenureMonths <= 3;
        const employeeKey = String(e.dbId || e.id || '');
        const riskMeta = getCurrentAtRiskRosterMap()?.[employeeKey] || null;
        const isAtRisk = !!riskMeta && (
            riskMeta.lowReview === true ||
            Number(riskMeta.openIncidentCount || 0) > 0 ||
            String(riskMeta.manualReason || '').trim() !== ''
        );

        return isActive && !isContract && isFirstThreeMonths && isAtRisk;
    });

    // ... other code ...

    const terminatedNames = getKpiEmployees()
        .filter(e => String(e.status || e.displayStatus || e.employee_status || '').trim().toUpperCase() === 'TERMINATED')
        .map(e => `${e.first || e.first_name || ''} ${e.last || e.last_name || ''}`.trim() || e.displayName || e.name)
        .filter(Boolean)
        .sort(compareKpiText);

    const turnoverCard = document.getElementById('cardTurnover') || document.getElementById('kTurnover')?.closest('.kpi-card, .card, [class*="kpi"]');
    if (turnoverCard) {
        turnoverCard.title = terminatedNames.length
            ? `Terminated Employees: ${terminatedNames.join(', ')}`
            : 'No terminated employees retained for turnover tracking';
        turnoverCard.setAttribute('data-tooltip', turnoverCard.title);
        turnoverCard.setAttribute('aria-label', turnoverCard.title);
    }

    const turnoverRiskCard = document.getElementById('cardTurnoverRisk') || document.getElementById('kTurnoverRisk')?.closest('.kpi-card, .card, [class*="kpi"]');
    if (turnoverRiskCard) {
        const turnoverRiskNames = getKpiEmployees()
            .map(e => `${e.first || e.first_name || ''} ${e.last || e.last_name || ''}`.trim() || e.displayName || e.name)
            .filter(Boolean)
            .sort(compareKpiText);

        turnoverRiskCard.title = turnoverRiskNames.length
            ? `Turnover Risk: ${turnoverRiskNames.join(', ')}`
            : 'No at-risk employees in their first 3 months';
        turnoverRiskCard.setAttribute('data-tooltip', turnoverRiskCard.title);
        turnoverRiskCard.setAttribute('aria-label', turnoverRiskCard.title);
    }

    const newHireTerminatedNames = getKpiEmployees()
        .filter(e => {
            const status = String(e.status || e.displayStatus || e.employee_status || '').trim().toUpperCase();
            const tenureMonths = Number(e.tenureMonths || e.tenure_months || 0);
            return status === 'TERMINATED' && tenureMonths > 0 && tenureMonths <= 3;
        })
        .map(e => `${e.first || e.first_name || ''} ${e.last || e.last_name || ''}`.trim() || e.displayName || e.name)
        .filter(Boolean)
        .sort(compareKpiText);

    const newHireTurnoverCard = document.getElementById('cardNewHireTurnover') || document.getElementById('kNewHireTurnover')?.closest('.kpi-card, .card, [class*="kpi"]');
    if (newHireTurnoverCard) {
        newHireTurnoverCard.title = newHireTerminatedNames.length
            ? `New Hire Turnover: ${newHireTerminatedNames.join(', ')}`
            : 'No terminated new hires in their first 90 days';
        newHireTurnoverCard.setAttribute('data-tooltip', newHireTurnoverCard.title);
        newHireTurnoverCard.setAttribute('aria-label', newHireTurnoverCard.title);
    }

    // ... other code ...

    // Ensure this is present exactly once at the end:
    window.buildKpiHoverDetails = buildKpiHoverDetails;
}