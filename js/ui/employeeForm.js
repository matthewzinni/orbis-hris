

// =========================
// EMPLOYEE FORM MODULE
// =========================

function getEmployeeFormData() {
    return {
        first_name: safeGet('firstName')?.value?.trim() || '',
        last_name: safeGet('lastName')?.value?.trim() || '',
        email: safeGet('email')?.value?.trim().toLowerCase() || '',
        phone: safeGet('phone')?.value?.trim() || '',
        department: safeGet('department')?.value || '',
        position: safeGet('position')?.value || '',
        status: safeGet('status')?.value || 'Active',
        hire_date: safeGet('hireDate')?.value || null
    };
}

function populateEmployeeForm(employee) {
    if (!employee) return;

    if (safeGet('firstName')) safeGet('firstName').value = employee.first_name || employee.first || '';
    if (safeGet('lastName')) safeGet('lastName').value = employee.last_name || employee.last || '';
    if (safeGet('email')) safeGet('email').value = employee.email || '';
    if (safeGet('phone')) safeGet('phone').value = employee.phone || '';
    if (safeGet('department')) safeGet('department').value = employee.department || employee.dept || '';
    if (safeGet('position')) safeGet('position').value = employee.position || '';
    if (safeGet('status')) safeGet('status').value = employee.status || 'Active';
    if (safeGet('hireDate')) safeGet('hireDate').value = employee.hire_date || '';
}

function resetEmployeeForm() {
    if (safeGet('firstName')) safeGet('firstName').value = '';
    if (safeGet('lastName')) safeGet('lastName').value = '';
    if (safeGet('email')) safeGet('email').value = '';
    if (safeGet('phone')) safeGet('phone').value = '';
    if (safeGet('department')) safeGet('department').value = '';
    if (safeGet('position')) safeGet('position').value = '';
    if (safeGet('status')) safeGet('status').value = 'Active';
    if (safeGet('hireDate')) safeGet('hireDate').value = '';
}

async function saveEmployeeForm() {
    const payload = getEmployeeFormData();

    if (!payload.first_name || !payload.last_name) {
        showToast('First and last name are required.', 'error');
        return;
    }

    let result;

    try {
        if (currentEmployee?.id || currentEmployee?.dbId) {
            const id = currentEmployee.dbId || currentEmployee.id;
            result = await OrbisServices.employees.update(id, payload);
        } else {
            result = await OrbisServices.employees.create(payload);
        }

        if (result.error) {
            console.error(result.error);
            showToast('Could not save employee.', 'error');
            return;
        }

        showToast('Employee saved.');

        if (typeof loadEmployees === 'function') {
            await loadEmployees();
        }

        if (typeof closeDrawer === 'function') {
            closeDrawer();
        }

    } catch (err) {
        console.error(err);
        showToast('Something went wrong saving employee.', 'error');
    }
}

// =========================
// EXPORTS
// =========================

window.getEmployeeFormData = getEmployeeFormData;
window.populateEmployeeForm = populateEmployeeForm;
window.resetEmployeeForm = resetEmployeeForm;
window.saveEmployeeForm = saveEmployeeForm;