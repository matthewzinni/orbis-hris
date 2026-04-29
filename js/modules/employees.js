// =========================

// EMPLOYEES DATA MODULE

// =========================

function normalizeEmployeeFromDatabase(row) {

    if (!row) return null;

    return {

        dbId: row.id,

        id: row.employee_id || row.id,

        employee_id: row.employee_id || row.id,

        first: row.first_name || '',

        last: row.last_name || '',

        first_name: row.first_name || '',

        last_name: row.last_name || '',

        name: `${row.first_name || ''} ${row.last_name || ''}`.trim(),

        dept: row.department || '',

        department: row.department || '',

        position: row.position || '',

        supervisor: row.supervisor || '',

        hireDate: row.hire_date ? new Date(row.hire_date + 'T00:00:00') : null,

        hire_date: row.hire_date || null,

        status: String(row.status || '').toUpperCase(),

        payType: row.pay_type || '',

        stdHours: Number(row.standard_hours) || 0,

        nextReview: row.next_review_date ? new Date(row.next_review_date + 'T00:00:00') : null,

        benefitsStatus: row.benefits_status || '',

        anniversaryDate: row.anniversary_date ? new Date(row.anniversary_date + 'T00:00:00') : null,

        tenureBracket: row.tenure_bracket || '',

        raw: row

    };

}

async function loadEmployeesData() {

    const db = getOrbisSupabaseClient();

    if (!db) {
        console.error('No Supabase client');
        return [];
    }

    const { data, error } = await db
        .from('employees')
        .select('*');

    if (error) {
        console.error('Error loading employees:', error);
        setText('empCount', 'Error loading employees');
        showToast('Could not load employees from Supabase.', 'error');
        return [];
    }

    console.log('🔥 Fresh employees from DB:', data);

    EMPLOYEES = (data || [])
        .map(normalizeEmployeeFromDatabase)
        .filter(Boolean);

    return EMPLOYEES;
}

async function loadEmployeesAndRefreshUi() {

    await loadEmployeesData();

    if (typeof populateDepartmentFilter === 'function') populateDepartmentFilter();

    if (typeof renderRoster === 'function') renderRoster();

    if (typeof renderDepartmentSummary === 'function') renderDepartmentSummary();

    if (typeof renderKpiEmployeeMetrics === 'function') renderKpiEmployeeMetrics();

    if (typeof loadReviewDashboard === 'function') await loadReviewDashboard();

    if (typeof loadExecutiveInsight === 'function') await loadExecutiveInsight();

    if (typeof loadRiskEmployees === 'function') await loadRiskEmployees();

    if (typeof loadImpactPlayers === 'function') await loadImpactPlayers();

    return EMPLOYEES;

}

window.normalizeEmployeeFromDatabase = normalizeEmployeeFromDatabase;

window.loadEmployeesData = loadEmployeesData;

window.loadEmployeesAndRefreshUi = loadEmployeesAndRefreshUi;