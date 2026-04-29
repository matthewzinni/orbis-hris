// =========================
// ORBIS - Onboarding Module
// Creates default onboarding tasks for newly hired employees.
// =========================

async function createDefaultOnboardingTasks(employeeId) {
    let resolvedEmployeeId = employeeId || currentEmployee?.dbId || currentEmployee?.id || selectedEmployee?.dbId || selectedEmployee?.id;

    if (!resolvedEmployeeId) {
        console.warn('Default onboarding tasks not created because no employee ID was found.');
        return;
    }


    let employeeRecord = null;
    let employeeLookupError = null;

    try {
        if (!window.OrbisServices?.employees?.getAll) {
            throw new Error('OrbisServices.employees.getAll is not available. Employee lookup must go through the service layer.');
        }

        const employeeResult = await OrbisServices.employees.getAll();
        employeeLookupError = employeeResult?.error || null;
        employeeRecord = (employeeResult?.data || []).find(employee =>
            String(employee.id || '') === String(resolvedEmployeeId) ||
            String(employee.employee_id || '') === String(resolvedEmployeeId)
        ) || null;
    } catch (err) {
        employeeLookupError = err;
    }

    if (employeeLookupError) {
        console.warn('Could not load employee hire date for onboarding due dates:', employeeLookupError);
    }

    const hireDate = employeeRecord?.hire_date || new Date().toISOString().slice(0, 10);

    function addDaysToHireDate(daysToAdd) {
        const date = new Date(`${hireDate}T00:00:00`);
        date.setDate(date.getDate() + daysToAdd);
        return date.toISOString().slice(0, 10);
    }

    const today = new Date().toISOString().slice(0, 10);

    function getStatusForDueDate(daysToAdd) {
        const dueDate = addDaysToHireDate(daysToAdd);

        if (dueDate === today) return 'Due Today';
        if (dueDate < today) return 'Overdue';

        return 'Pending';
    }

    const defaultTasks = [
        {
            employee_id: resolvedEmployeeId,
            task_name: 'Complete HR paperwork',
            section: 'HR Setup',
            task_type: 'paperwork',
            due_date: addDaysToHireDate(0),
            status: getStatusForDueDate(0)
        },
        {
            employee_id: resolvedEmployeeId,
            task_name: 'Attend orientation',
            section: 'Orientation',
            task_type: 'orientation',
            due_date: addDaysToHireDate(0),
            status: getStatusForDueDate(0)
        },
        {
            employee_id: resolvedEmployeeId,
            task_name: 'Setup workstation',
            section: 'HR Setup',
            task_type: 'setup',
            due_date: addDaysToHireDate(1),
            status: getStatusForDueDate(1)
        },
        {
            employee_id: resolvedEmployeeId,
            task_name: '3-Day Check-In',
            section: 'Check-Ins',
            task_type: 'checkin',
            due_date: addDaysToHireDate(3),
            status: getStatusForDueDate(3)
        },
        {
            employee_id: resolvedEmployeeId,
            task_name: '30-Day Check-In',
            section: 'Check-Ins',
            task_type: 'checkin',
            due_date: addDaysToHireDate(30),
            status: getStatusForDueDate(30)
        },
        {
            employee_id: resolvedEmployeeId,
            task_name: '60-Day Check-In',
            section: 'Check-Ins',
            task_type: 'checkin',
            due_date: addDaysToHireDate(60),
            status: getStatusForDueDate(60)
        },
        {
            employee_id: resolvedEmployeeId,
            task_name: '90-Day Check-In',
            section: 'Check-Ins',
            task_type: 'checkin',
            due_date: addDaysToHireDate(90),
            status: getStatusForDueDate(90)
        }
    ];

    const { data: existingTasks, error: fetchError } = await supabaseClient

        .from('onboarding_tasks')

        .select('id, employee_id, task_name')

        .eq('employee_id', resolvedEmployeeId);

    if (fetchError) {

        console.error('Error fetching existing onboarding tasks:', fetchError);

        return;

    }

    // Step 2: attach IDs where matches exist

    const tasksWithIds = defaultTasks.map(task => {
        const match = existingTasks?.find(t =>
            String(t.employee_id) === String(task.employee_id) &&
            t.task_name === task.task_name

        );

        return match

            ? { ...task, id: match.id }

            : { ...task }; // let DB handle insert without forcing id

    });

    const { error: upsertError } = await supabaseClient
        .from('onboarding_tasks')
        .upsert(tasksWithIds, {
            onConflict: 'employee_id,task_name',
            ignoreDuplicates: true
        });

    if (upsertError) {

        console.error('Error creating default onboarding tasks:', upsertError);

    }
}

window.createDefaultOnboardingTasks = createDefaultOnboardingTasks;