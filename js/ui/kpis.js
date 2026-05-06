// =========================
// KPI UI HELPERS
// =========================

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

function setKpiText(id, value) {
    if (typeof safeSet === 'function') {
        safeSet(id, value);
        return;
    }

    if (typeof setText === 'function') {
        setText(id, value);
        return;
    }

    const element = document.getElementById(id);
    if (element) element.textContent = value;
}

function getEmployeeStatus(employee) {
    return String(employee.status || employee.displayStatus || employee.employee_status || '')
        .trim()
        .toUpperCase();
}

function getEmployeeDisplayName(employee) {
    const fullName = `${employee.first || employee.first_name || ''} ${employee.last || employee.last_name || ''}`.trim();

    return fullName ||
        employee.displayName ||
        employee.name ||
        'Employee';
}

function getEmployeeTenureMonths(employee) {
    const storedTenure = Number(employee.tenureMonths || employee.tenure_months || 0);
    if (storedTenure > 0) return storedTenure;

    const hireDate = employee.hireDate || employee.hire_date;
    if (!hireDate) return 0;

    const hiredAt = new Date(hireDate);
    if (Number.isNaN(hiredAt.getTime())) return 0;

    const now = new Date();
    return Math.max(
        0,
        ((now.getFullYear() - hiredAt.getFullYear()) * 12) +
        (now.getMonth() - hiredAt.getMonth())
    );
}

function employeeHasAtRiskMeta(employee) {
    const employeeKey = String(employee.dbId || employee.id || employee.employee_id || '');
    const riskMeta = getCurrentAtRiskRosterMap()?.[employeeKey] || null;

    return !!riskMeta &&
        (
            riskMeta.lowReview === true ||
            riskMeta.disciplineRisk === true ||
            Number(riskMeta.openIncidentCount || 0) > 0 ||
            String(riskMeta.manualReason || '').trim() !== ''
        );
}

function renderKpiEmployeeMetrics() {
    const employees = getKpiEmployees();
    const activeEmployees = employees.filter(employee => getEmployeeStatus(employee) === 'ACTIVE');
    const reviewEligibleActive = activeEmployees.filter(employee =>
        !String(employee.payType || employee.pay_type || '').toLowerCase().includes('contract')
    );

    const turnoverRiskEmployees = reviewEligibleActive.filter(employee => employeeHasAtRiskMeta(employee));
    const turnoverRiskContributors = turnoverRiskEmployees.length;

    const turnoverRisk = reviewEligibleActive.length
        ? Math.round(Math.min(100, (turnoverRiskContributors / reviewEligibleActive.length) * 100) * 10) / 10
        : 0;

    if (typeof window.updateTurnoverRiskKpi === 'function') {
        window.updateTurnoverRiskKpi(
            turnoverRisk,
            `${turnoverRiskContributors} at-risk employee${turnoverRiskContributors === 1 ? '' : 's'} identified`
        );
    } else {
        setKpiText('kTurnoverRisk', `${Number(turnoverRisk || 0).toFixed(1)}%`);
        setKpiText(
            'kTurnoverRiskSub',
            `${turnoverRiskContributors} at-risk employee${turnoverRiskContributors === 1 ? '' : 's'} identified`
        );
    }

    buildKpiHoverDetails();
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
    const activeEmployees = employees.filter(employee => getEmployeeStatus(employee) === 'ACTIVE');
    const terminatedEmployees = employees.filter(employee => getEmployeeStatus(employee) === 'TERMINATED');
    const totalWorkforce = activeEmployees.length + terminatedEmployees.length;

    const turnoverRate = totalWorkforce
        ? ((terminatedEmployees.length / totalWorkforce) * 100).toFixed(1)
        : '0.0';

    setKpiText('kTurnover', `${turnoverRate}%`);

    const turnoverSubtext =
        document.getElementById('turnoverSubtext') ||
        document.getElementById('kTurnoverSubtext');

    if (turnoverSubtext) {
        turnoverSubtext.textContent = `${terminatedEmployees.length} terminated employee${terminatedEmployees.length === 1 ? '' : 's'} retained for turnover tracking`;
    }

    const newHireTerminatedEmployees = terminatedEmployees.filter(employee => {
        const tenureMonths = getEmployeeTenureMonths(employee);
        return tenureMonths >= 0 && tenureMonths <= 3;
    });

    const newHirePopulation = employees.filter(employee => {
        const status = getEmployeeStatus(employee);
        const tenureMonths = getEmployeeTenureMonths(employee);
        return tenureMonths >= 0 && tenureMonths <= 3 && (status === 'ACTIVE' || status === 'TERMINATED');
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

    window.ALL_EMPLOYEES = employees;
    buildKpiHoverDetails();
}

function applyTooltip(card, text) {
    if (!card) return;

    card.title = text;
    card.setAttribute('data-tooltip', text);
    card.setAttribute('aria-label', text);
}

function buildKpiHoverDetails() {
    const employees = getKpiEmployees();

    const terminatedNames = employees
        .filter(employee => getEmployeeStatus(employee) === 'TERMINATED')
        .map(getEmployeeDisplayName)
        .filter(Boolean)
        .sort(compareKpiText);

    const turnoverCard =
        document.getElementById('cardTurnover') ||
        document.getElementById('kTurnover')?.closest('.kpi-card, .card, [class*="kpi"]');

    applyTooltip(
        turnoverCard,
        terminatedNames.length
            ? `Terminated Employees: ${terminatedNames.join(', ')}`
            : 'No terminated employees retained for turnover tracking'
    );

    const turnoverRiskNames = employees
        .filter(employee => getEmployeeStatus(employee) === 'ACTIVE' && employeeHasAtRiskMeta(employee))
        .map(getEmployeeDisplayName)
        .filter(Boolean)
        .sort(compareKpiText);

    const turnoverRiskCard =
        document.getElementById('cardTurnoverRisk') ||
        document.getElementById('kTurnoverRisk')?.closest('.kpi-card, .card, [class*="kpi"]');

    applyTooltip(
        turnoverRiskCard,
        turnoverRiskNames.length
            ? `Turnover Risk: ${turnoverRiskNames.join(', ')}`
            : 'No at-risk employees identified'
    );

    const newHireTerminatedNames = employees
        .filter(employee => {
            const status = getEmployeeStatus(employee);
            const tenureMonths = getEmployeeTenureMonths(employee);
            return status === 'TERMINATED' && tenureMonths >= 0 && tenureMonths <= 3;
        })
        .map(getEmployeeDisplayName)
        .filter(Boolean)
        .sort(compareKpiText);

    const newHireTurnoverCard =
        document.getElementById('cardNewHireTurnover') ||
        document.getElementById('kNewHireTurnover')?.closest('.kpi-card, .card, [class*="kpi"]');

    applyTooltip(
        newHireTurnoverCard,
        newHireTerminatedNames.length
            ? `New Hire Turnover: ${newHireTerminatedNames.join(', ')}`
            : 'No terminated new hires in their first 90 days'
    );
}

// =========================
// GLOBAL EXPORTS
// =========================

window.renderKpiEmployeeMetrics = renderKpiEmployeeMetrics;
window.refreshTurnoverKpisFromSupabase = refreshTurnoverKpisFromSupabase;
window.buildKpiHoverDetails = buildKpiHoverDetails;

setTimeout(refreshTurnoverKpisFromSupabase, 500);
setTimeout(refreshTurnoverKpisFromSupabase, 1500);
