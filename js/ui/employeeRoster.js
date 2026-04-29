// =========================
// EMPLOYEE ROSTER MODULE
// =========================

let rosterSearchTimer = null;
if (typeof currentSort === 'undefined') {
    window.currentSort = { column: 'name', direction: 'asc' };
}

function formatRosterStatus(status) {
    const value = String(status || '').trim();
    if (!value) return 'Active';
    return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function normalizeEmployeeForRoster(employee) {
    if (!employee) return null;

    const firstName = employee.first_name || employee.firstName || employee.first || '';
    const lastName = employee.last_name || employee.lastName || employee.last || '';
    const department = employee.department || employee.dept || employee.displayDepartment || '';
    const position = employee.position || employee.title || employee.displayPosition || '';
    const supervisor = employee.supervisor || employee.displaySupervisor || '';
    const hireDate = employee.hire_date || employee.hireDate || employee.displayHireDate || '';
    const employeeId = employee.employee_id || employee.employeeId || employee.employee_number || employee.employeeNumber || employee.btw_id || employee.btwId || employee.displayId || '';
    const status = employee.status || employee.displayStatus || 'ACTIVE';
    const payType = employee.pay_type || employee.payType || '';
    const standardHours = employee.standard_hours || employee.standardHours || '';
    const benefitsStatus = employee.benefits_status || employee.benefitsStatus || '';
    const nextReviewDate = employee.next_review_date || employee.nextReviewDate || '';
    const anniversaryDate = employee.anniversary_date || employee.anniversaryDate || '';
    const tenureBracket = employee.tenure_bracket || employee.tenureBracket || '';

    return {
        ...employee,
        first_name: firstName,
        last_name: lastName,
        firstName,
        lastName,
        department,
        dept: department,
        position,
        supervisor,
        hire_date: hireDate,
        hireDate,
        employee_id: employeeId,
        employeeId,
        displayId: employeeId,
        displayName: `${firstName} ${lastName}`.trim() || employee.displayName || employee.name || 'Employee',
        displayDepartment: department,
        displayPosition: position,
        displaySupervisor: supervisor,
        displayHireDate: hireDate,
        displayStatus: status,
        displayStatusLabel: formatRosterStatus(status),
        pay_type: payType,
        payType,
        standard_hours: standardHours,
        standardHours,
        benefits_status: benefitsStatus,
        benefitsStatus,
        next_review_date: nextReviewDate,
        nextReviewDate,
        anniversary_date: anniversaryDate,
        anniversaryDate,
        tenure_bracket: tenureBracket,
        tenureBracket
    };
}

function getEmployeePublicId(employee, fallbackName = '') {
    const directId = employee?.employee_id
        || employee?.employeeId
        || employee?.employee_number
        || employee?.employeeNumber
        || employee?.employee_no
        || employee?.employeeNo
        || employee?.emp_id
        || employee?.empId
        || employee?.btw_id
        || employee?.btwId
        || employee?.displayId
        || '';

    if (String(directId).trim()) return String(directId).trim();

    const targetName = String(
        fallbackName
        || employee?.displayName
        || employee?.name
        || `${employee?.first_name || employee?.firstName || employee?.first || ''} ${employee?.last_name || employee?.lastName || employee?.last || ''}`
    ).trim().toLowerCase();

    if (!targetName) return '';

    const matchedRow = Array.from(document.querySelectorAll('tr.employee-row')).find(row => {
        const rowName = row.querySelector('.link-button')?.textContent?.trim().toLowerCase() || '';
        return rowName === targetName;
    });

    const rowId = matchedRow?.querySelector('td')?.textContent?.trim() || '';
    if (rowId) return rowId;

    const matchedEmployee = (EMPLOYEES || []).find(item => {
        const itemName = `${item.first_name || item.firstName || item.first || ''} ${item.last_name || item.lastName || item.last || ''}`.trim().toLowerCase();
        return itemName === targetName;
    });

    return String(
        matchedEmployee?.employee_id
        || matchedEmployee?.employeeId
        || matchedEmployee?.employee_number
        || matchedEmployee?.employeeNumber
        || matchedEmployee?.employee_no
        || matchedEmployee?.employeeNo
        || matchedEmployee?.emp_id
        || matchedEmployee?.empId
        || matchedEmployee?.btw_id
        || matchedEmployee?.btwId
        || matchedEmployee?.displayId
        || ''
    ).trim();
}

function populateEmployeeAdminFallback(employee) {
    if (!employee) return;

    const valueFrom = (...keys) => {
        for (const key of keys) {
            if (employee[key] !== undefined && employee[key] !== null && employee[key] !== '') {
                return employee[key];
            }
        }
        return '';
    };

    const drawerTitleName = String(document.getElementById('drawerTitle')?.textContent || '').trim();
    const drawerSubParts = String(document.getElementById('drawerSub')?.textContent || '')
        .split('•')
        .map(part => part.trim());

    const nameParts = String(
        valueFrom('displayName', 'name', 'full_name', 'fullName') || drawerTitleName
    ).trim().split(/\s+/).filter(Boolean);
    const employeePublicId = getEmployeePublicId(employee, drawerTitleName);
    const fallbackFirstName = nameParts[0] || '';
    const fallbackLastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

    const isVisibleField = (el) => {
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    };

    const applyValue = (el, value) => {
        if (!el) return;
        const previousSuppress = window.__suppressAuditDirty;
        window.__suppressAuditDirty = true;
        el.value = value ?? '';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        window.__suppressAuditDirty = previousSuppress;
    };

    const setBySelector = (selector, value) => {
        const fields = Array.from(document.querySelectorAll(selector));
        const el = fields.find(isVisibleField) || fields[0];
        applyValue(el, value);
    };

    const setByPlaceholder = (placeholder, value) => {
        setBySelector(`input[placeholder="${placeholder}"], select[placeholder="${placeholder}"], textarea[placeholder="${placeholder}"]`, value);
    };

    const setByLabelText = (labelText, value) => {
        const labels = Array.from(document.querySelectorAll('label'));
        const label = labels.find(item => item.textContent.trim().toLowerCase() === labelText.toLowerCase());
        if (!label) return;

        let field = null;
        if (label.htmlFor) {
            field = document.getElementById(label.htmlFor);
        }

        if (!field) {
            const wrapper = label.closest('div') || label.parentElement;
            field = wrapper?.querySelector('input, select, textarea') || null;
        }

        if (!field) {
            field = label.nextElementSibling?.matches?.('input, select, textarea') ? label.nextElementSibling : null;
        }

        applyValue(field, value);
    };

    setByPlaceholder('Employee ID', employeePublicId);
    setByLabelText('EMPLOYEE ID', employeePublicId);
    const visibleEmployeeIdField = Array.from(document.querySelectorAll('input')).find(input => {
        const label = input.closest('div')?.querySelector('label')?.textContent?.trim().toLowerCase() || '';
        return label === 'employee id' || input.placeholder?.trim().toLowerCase() === 'employee id';
    });
    lockEmployeeIdField(visibleEmployeeIdField);
    setByPlaceholder('First name', valueFrom('first_name', 'firstName', 'first') || fallbackFirstName);
    setByLabelText('FIRST NAME', valueFrom('first_name', 'firstName', 'first') || fallbackFirstName);
    setByPlaceholder('Last name', valueFrom('last_name', 'lastName', 'last') || fallbackLastName);
    setByLabelText('LAST NAME', valueFrom('last_name', 'lastName', 'last') || fallbackLastName);
    setByPlaceholder('Department', valueFrom('department', 'dept', 'displayDepartment') || drawerSubParts[1] || '');
    setByLabelText('DEPARTMENT', valueFrom('department', 'dept', 'displayDepartment') || drawerSubParts[1] || '');
    setByPlaceholder('Position', valueFrom('position', 'title', 'displayPosition') || drawerSubParts[0] || '');
    setByLabelText('POSITION', valueFrom('position', 'title', 'displayPosition') || drawerSubParts[0] || '');
    setByPlaceholder('Supervisor', valueFrom('supervisor'));
    setByLabelText('SUPERVISOR', valueFrom('supervisor', 'displaySupervisor'));
    setByPlaceholder('Hourly, Salary, etc.', valueFrom('pay_type', 'payType'));
    setByLabelText('PAY TYPE', valueFrom('pay_type', 'payType'));
    setByPlaceholder('40', valueFrom('standard_hours', 'standardHours'));
    setByLabelText('STANDARD HOURS', valueFrom('standard_hours', 'standardHours'));
    setByPlaceholder('Benefits status', valueFrom('benefits_status', 'benefitsStatus'));
    setByLabelText('BENEFITS STATUS', valueFrom('benefits_status', 'benefitsStatus'));

    const hireDateValue = valueFrom('hire_date', 'hireDate');
    const nextReviewValue = valueFrom('next_review_date', 'nextReviewDate');
    const dateInputs = Array.from(document.querySelectorAll('input[type="date"]'));
    if (dateInputs[0]) dateInputs[0].value = hireDateValue || '';
    if (dateInputs[1]) dateInputs[1].value = nextReviewValue || '';

    const statusValue = formatRosterStatus(valueFrom('status', 'displayStatus') || 'Active');
    const statusSelect = Array.from(document.querySelectorAll('select')).find(select => {
        return Array.from(select.options || []).some(option => option.textContent.trim().toLowerCase() === 'active' || option.textContent.trim().toLowerCase() === 'inactive');
    });

    if (statusSelect) {
        const matchingOption = Array.from(statusSelect.options || []).find(option => {
            return option.value.toLowerCase() === statusValue.toLowerCase() || option.textContent.trim().toLowerCase() === statusValue.toLowerCase();
        });

        statusSelect.value = matchingOption ? matchingOption.value : statusValue;
        statusSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }
}

function populateEmployeeAdminByVisibleOrder(employee) {
    if (!employee) return;

    const drawerTitleName = String(document.getElementById('drawerTitle')?.textContent || '').trim();
    const drawerSubParts = String(document.getElementById('drawerSub')?.textContent || '')
        .split('•')
        .map(part => part.trim());

    const nameText = employee.displayName || employee.name || drawerTitleName || '';
    const nameParts = String(nameText).trim().split(/\s+/).filter(Boolean);
    const firstName = employee.first_name || employee.firstName || employee.first || nameParts[0] || '';
    const lastName = employee.last_name || employee.lastName || employee.last || (nameParts.length > 1 ? nameParts.slice(1).join(' ') : '');

    const employeeIdValue = getEmployeePublicId(employee, drawerTitleName);
    const statusValue = formatRosterStatus(employee.status || employee.displayStatus || 'Active');

    const valuesByLabel = {
        'employee id': employeeIdValue,
        'status': statusValue,
        'first name': firstName,
        'last name': lastName,
        'department': employee.department || employee.dept || employee.displayDepartment || drawerSubParts[1] || '',
        'position': employee.position || employee.title || employee.displayPosition || drawerSubParts[0] || '',
        'supervisor': employee.supervisor || employee.displaySupervisor || '',
        'pay type': employee.pay_type || employee.payType || '',
        'standard hours': employee.standard_hours || employee.standardHours || '',
        'benefits status': employee.benefits_status || employee.benefitsStatus || '',
        'hire date': employee.hire_date || employee.hireDate || employee.displayHireDate || '',
        'next review date': employee.next_review_date || employee.nextReviewDate || '',
        'anniversary date': employee.anniversary_date || employee.anniversaryDate || '',
        'tenure bracket': employee.tenure_bracket || employee.tenureBracket || ''
    };

    const isVisible = (el) => {
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
    };

    const setValue = (field, value) => {
        if (!field) return;
        const previousSuppress = window.__suppressAuditDirty;
        window.__suppressAuditDirty = true;
        const nextValue = value ?? '';

        if (field.tagName === 'SELECT') {
            const match = Array.from(field.options || []).find(option => {
                return String(option.value).toLowerCase() === String(nextValue).toLowerCase()
                    || String(option.textContent).trim().toLowerCase() === String(nextValue).toLowerCase();
            });
            field.value = match ? match.value : nextValue;
        } else {
            field.value = nextValue;
        }

        field.dispatchEvent(new Event('input', { bubbles: true }));
        field.dispatchEvent(new Event('change', { bubbles: true }));
        window.__suppressAuditDirty = previousSuppress;
    };

    const adminButton = Array.from(document.querySelectorAll('button, .tab, [data-tab]'))
        .find(item => (item.textContent || '').trim().toLowerCase().includes('employee admin'));

    const drawer = adminButton?.closest('#employeeDrawer, .drawer, .drawer-panel, aside, section, div') || document;
    const fields = Array.from(drawer.querySelectorAll('input, select, textarea')).filter(isVisible);

    const labels = Array.from(drawer.querySelectorAll('*')).filter(el => {
        const text = (el.textContent || '').trim().toLowerCase();
        return Object.keys(valuesByLabel).includes(text) && !['input', 'select', 'textarea', 'button'].includes(el.tagName.toLowerCase());
    });

    labels.forEach(label => {
        const labelText = (label.textContent || '').trim().toLowerCase();
        const value = valuesByLabel[labelText];
        const wrapper = label.parentElement;
        const field = wrapper?.querySelector('input, select, textarea') || label.nextElementSibling?.querySelector?.('input, select, textarea') || label.nextElementSibling;
        if (field && ['INPUT', 'SELECT', 'TEXTAREA'].includes(field.tagName)) {
            setValue(field, value);
        }
    });

    const fieldByLabel = (labelText) => {
        const label = Array.from(drawer.querySelectorAll('*')).find(el => {
            const text = (el.textContent || '').trim().toLowerCase();
            return text === labelText.toLowerCase() && !['input', 'select', 'textarea', 'button'].includes(el.tagName.toLowerCase());
        });

        if (!label) return null;

        const wrapper = label.parentElement;
        return wrapper?.querySelector('input, select, textarea') || null;
    };

    setValue(fieldByLabel('EMPLOYEE ID'), valuesByLabel['employee id']);
    setValue(fieldByLabel('STATUS'), valuesByLabel['status']);
    setValue(fieldByLabel('FIRST NAME'), valuesByLabel['first name']);
    setValue(fieldByLabel('LAST NAME'), valuesByLabel['last name']);
    setValue(fieldByLabel('DEPARTMENT'), valuesByLabel['department']);
    setValue(fieldByLabel('POSITION'), valuesByLabel['position']);
    setValue(fieldByLabel('SUPERVISOR'), valuesByLabel['supervisor']);
    setValue(fieldByLabel('PAY TYPE'), valuesByLabel['pay type']);
    setValue(fieldByLabel('STANDARD HOURS'), valuesByLabel['standard hours']);
    setValue(fieldByLabel('BENEFITS STATUS'), valuesByLabel['benefits status']);
    setValue(fieldByLabel('HIRE DATE'), valuesByLabel['hire date']);
    setValue(fieldByLabel('NEXT REVIEW DATE'), valuesByLabel['next review date']);
    setValue(fieldByLabel('ANNIVERSARY DATE'), valuesByLabel['anniversary date']);
    setValue(fieldByLabel('TENURE BRACKET'), valuesByLabel['tenure bracket']);

    const adminFields = Array.from(drawer.querySelectorAll('input, select, textarea')).filter(isVisible);
    if (adminFields[0] && valuesByLabel['employee id']) {
        setValue(adminFields[0], valuesByLabel['employee id']);
        lockEmployeeIdField(adminFields[0]);
    }
    if (adminFields[1]) setValue(adminFields[1], valuesByLabel['status']);
}


function lockEmployeeIdField(field) {
    if (!field) return;

    field.readOnly = true;
    field.setAttribute('readonly', 'readonly');
    field.setAttribute('aria-readonly', 'true');
    field.classList.add('locked-field');
    field.title = 'Employee ID is locked and cannot be edited.';
}

// === AUDIT LOG HELPERS ===

async function writeEmployeeAuditLogToSupabase(auditEntry) {
    if (!auditEntry) return { error: new Error('Missing audit entry') };

    const payload = {
        employee_id: auditEntry.employee_id || '',
        employee_name: auditEntry.name || '',
        action_type: auditEntry.action_type || 'employee_update',
        fields_changed: auditEntry.fields_changed || [],
        changed_at: auditEntry.timestamp || new Date().toISOString(),
        changed_by: auditEntry.changed_by || 'Current user',
        metadata: auditEntry
    };

    try {
        if (window.supabaseClient?.from) {
            return await window.supabaseClient
                .from('employee_audit_logs')
                .insert([payload]);
        }

        if (window.supabase?.from) {
            return await window.supabase
                .from('employee_audit_logs')
                .insert([payload]);
        }

        if (typeof supabaseClient !== 'undefined' && supabaseClient?.from) {
            return await supabaseClient
                .from('employee_audit_logs')
                .insert([payload]);
        }

        return { error: new Error('Supabase client not available') };
    } catch (error) {
        console.error('Audit log Supabase insert failed:', error);
        return { error };
    }
}

// === Employee Audit Log Viewer & Fetchers ===
async function fetchEmployeeAuditLogs(employeeId) {
    if (!employeeId) return [];

    try {
        let client = null;

        if (window.supabaseClient?.from) client = window.supabaseClient;
        else if (window.supabase?.from) client = window.supabase;
        else if (typeof supabaseClient !== 'undefined' && supabaseClient?.from) client = supabaseClient;

        if (!client) {
            console.warn('[Orbis Audit] Supabase client not available. Showing local audit logs only.');
            return getLocalAuditLogsForEmployee(employeeId);
        }

        const { data, error } = await client
            .from('employee_audit_logs')
            .select('*')
            .eq('employee_id', employeeId)
            .order('changed_at', { ascending: false })
            .limit(25);

        if (error) {
            console.warn('[Orbis Audit] Could not fetch Supabase audit logs. Showing local audit logs instead:', error);
            return getLocalAuditLogsForEmployee(employeeId);
        }

        return data || [];
    } catch (error) {
        console.error('[Orbis Audit] Audit log fetch failed:', error);
        return getLocalAuditLogsForEmployee(employeeId);
    }
}

function getLocalAuditLogsForEmployee(employeeId) {
    const logs = JSON.parse(localStorage.getItem('orbis_audit_log') || '[]');
    return logs.filter(log => String(log.employee_id || '') === String(employeeId));
}

function formatAuditTimestamp(value) {
    if (!value) return 'Unknown time';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
}

function formatAuditFieldName(field) {
    return String(field || '')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, char => char.toUpperCase());
}

function renderAuditLogsHtml(logs) {
    if (!logs?.length) {
        return `
            <div class="audit-log-empty" style="padding:16px; border:1px solid #e5e7eb; border-radius:12px; background:#f9fafb; color:#6b7280; font-size:13px;">
                No timeline activity found for this employee yet.
            </div>
        `;
    }

    const getActionBadge = (actionType) => {
        const normalized = String(actionType || '').toLowerCase();

        if (normalized.includes('create')) {
            return { label: 'CREATE', bg: '#ecfdf5', color: '#047857', border: '#a7f3d0' };
        }
        if (normalized.includes('delete')) {
            return { label: 'DELETE', bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' };
        }
        if (normalized.includes('flag')) {
            return { label: 'FLAG', bg: '#fffbeb', color: '#b45309', border: '#fde68a' };
        }
        if (normalized.includes('signature') || normalized.includes('sign')) {
            return { label: 'SIGN', bg: '#eef2ff', color: '#4338ca', border: '#c7d2fe' };
        }

        return { label: 'UPDATE', bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' };
    };

    const getTimelineGroup = (log) => {
        const rawDate = log.changed_at || log.timestamp;
        const date = new Date(rawDate);
        if (Number.isNaN(date.getTime())) return 'Earlier';

        const today = new Date();
        const yesterday = new Date();
        yesterday.setDate(today.getDate() - 1);

        const sameDay = (a, b) => {
            return a.getFullYear() === b.getFullYear()
                && a.getMonth() === b.getMonth()
                && a.getDate() === b.getDate();
        };

        if (sameDay(date, today)) return 'Today';
        if (sameDay(date, yesterday)) return 'Yesterday';
        return 'Earlier';
    };

    const renderFieldChangeList = (log) => {
        const fieldsChanged = log.fields_changed || log.metadata?.fields_changed || [];
        const before = log.metadata?.before || log.before || {};
        const after = log.metadata?.after || log.after || {};

        if (!Array.isArray(fieldsChanged) || !fieldsChanged.length) {
            return `<div style="color:#475569; font-size:13px;">Employee record updated.</div>`;
        }

        return `
            <div style="display:flex; flex-direction:column; gap:6px; margin-top:8px;">
                ${fieldsChanged.map(field => {
            const beforeValue = before?.[field];
            const afterValue = after?.[field];
            const hasBeforeAfter = beforeValue !== undefined || afterValue !== undefined;

            if (hasBeforeAfter) {
                return `
                            <div style="font-size:13px; color:#334155; line-height:1.35;">
                                <strong>${esc(formatAuditFieldName(field))}:</strong>
                                <span style="color:#64748b;">${esc(beforeValue || 'Blank')}</span>
                                <span style="color:#94a3b8; padding:0 4px;">→</span>
                                <span style="color:#0f172a; font-weight:700;">${esc(afterValue || 'Blank')}</span>
                            </div>
                        `;
            }

            return `
                        <div style="font-size:13px; color:#334155; line-height:1.35;">
                            <strong>${esc(formatAuditFieldName(field))}</strong> changed
                        </div>
                    `;
        }).join('')}
            </div>
        `;
    };

    const renderTimelineItem = (log) => {
        const changedAt = formatAuditTimestamp(log.changed_at || log.timestamp);
        const changedBy = log.changed_by
            || log.metadata?.changed_by
            || window.currentUser?.name
            || window.currentUser?.email
            || 'System';
        const actionType = log.action_type || log.metadata?.action_type || 'employee_update';
        const actionTitle = formatAuditFieldName(actionType);
        const badge = getActionBadge(actionType);

        return `
            <div class="audit-timeline-item" style="position:relative; margin-bottom:14px;">
                <div style="position:absolute; left:-18px; top:16px; width:12px; height:12px; border-radius:999px; background:${badge.color}; border:3px solid #ffffff; box-shadow:0 0 0 2px ${badge.border};"></div>

                <div class="audit-log-card" style="padding:14px 16px; border:1px solid #e5e7eb; border-radius:14px; background:#fff; box-shadow:0 6px 16px rgba(15,23,42,0.05);">
                    <div style="display:flex; justify-content:space-between; gap:12px; align-items:flex-start;">
                        <div>
                            <div style="font-weight:800; color:#111827; font-size:14px;">${esc(actionTitle)}</div>
                            <div style="color:#64748b; font-size:12px; margin-top:3px;">${esc(changedAt)} • ${esc(changedBy)}</div>
                        </div>
                        <span style="font-size:11px; font-weight:800; color:${badge.color}; background:${badge.bg}; border:1px solid ${badge.border}; padding:4px 8px; border-radius:999px; white-space:nowrap;">${badge.label}</span>
                    </div>

                    <div style="margin-top:10px; padding-top:10px; border-top:1px solid #f1f5f9;">
                        ${renderFieldChangeList(log)}
                    </div>
                </div>
            </div>
        `;
    };

    const groups = logs.reduce((acc, log) => {
        const group = getTimelineGroup(log);
        if (!acc[group]) acc[group] = [];
        acc[group].push(log);
        return acc;
    }, { Today: [], Yesterday: [], Earlier: [] });

    const renderGroup = (title, items) => {
        if (!items.length) return '';

        return `
            <div class="audit-timeline-group" style="position:relative;">
                <div style="font-size:11px; font-weight:900; letter-spacing:0.08em; text-transform:uppercase; color:#64748b; margin:6px 0 10px;">
                    ${esc(title)}
                </div>
                ${items.map(renderTimelineItem).join('')}
            </div>
        `;
    };

    return `
        <div class="audit-timeline" style="position:relative; padding-left:20px;">
            <div style="position:absolute; left:7px; top:8px; bottom:8px; width:2px; background:#dbeafe;"></div>
            ${renderGroup('Today', groups.Today)}
            ${renderGroup('Yesterday', groups.Yesterday)}
            ${renderGroup('Earlier', groups.Earlier)}
        </div>
    `;
}

function getHistoryPanelElement() {
    const existing = document.getElementById('employeeAuditLogViewer');
    if (existing) return existing;

    const historyPanel = document.getElementById('historyPanel')
        || document.getElementById('tab-history')
        || document.getElementById('historyTab')
        || document.querySelector('[data-panel="history"]')
        || document.querySelector('[data-tab-panel="history"]')
        || document.querySelector('.tab-panel.active')
        || document.querySelector('.drawer-content')
        || document.querySelector('#employeeDrawer')
        || document.body;

    const viewer = document.createElement('div');
    viewer.id = 'employeeAuditLogViewer';
    viewer.style.marginTop = '16px';
    viewer.innerHTML = `
        <div style="padding:16px; border:1px solid #e5e7eb; border-radius:14px; background:#fff;">
            <div style="font-weight:800; color:#111827; margin-bottom:8px;">Employee Timeline</div>
            <div style="color:#6b7280; font-size:13px;">Loading employee timeline...</div>
        </div>
    `;

    historyPanel.appendChild(viewer);
    return viewer;
}

async function renderEmployeeAuditLogViewer(employee = window.currentEmployee) {
    const employeeId = getEmployeePublicId(employee || {}, document.getElementById('drawerTitle')?.textContent || '');
    const viewer = getHistoryPanelElement();

    if (!employeeId) {
        viewer.innerHTML = `
            <div style="padding:16px; border:1px solid #e5e7eb; border-radius:14px; background:#fff; color:#6b7280; font-size:13px;">
                Audit History could not load because this employee does not have an Employee ID.
            </div>
        `;
        return;
    }

    viewer.innerHTML = `
        <div style="padding:16px; border:1px solid #e5e7eb; border-radius:14px; background:#fff;">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:12px;">
                <div>
                    <div style="font-weight:800; color:#111827;">Employee Timeline</div>
                    <div style="color:#6b7280; font-size:12px;">Employee ID: ${esc(employeeId)}</div>
                </div>
                <button type="button" class="mini-btn" onclick="renderEmployeeAuditLogViewer()">Refresh</button>
            </div>
            <div style="color:#6b7280; font-size:13px;">Loading employee timeline...</div>
        </div>
    `;

    const logs = await fetchEmployeeAuditLogs(employeeId);

    viewer.innerHTML = `
        <div style="padding:16px; border:1px solid #e5e7eb; border-radius:14px; background:#fff;">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:12px;">
                <div>
                    <div style="font-weight:800; color:#111827;">Employee Timeline</div>
                    <div style="color:#6b7280; font-size:12px;">Employee ID: ${esc(employeeId)} • ${logs.length} timeline event${logs.length === 1 ? '' : 's'}</div>
                </div>
                <button type="button" class="mini-btn" onclick="renderEmployeeAuditLogViewer()">Refresh</button>
            </div>
            ${renderAuditLogsHtml(logs)}
        </div>
    `;
}

function writeEmployeeAuditLogLocal(auditEntry) {
    const existingLogs = JSON.parse(localStorage.getItem('orbis_audit_log') || '[]');
    existingLogs.unshift(auditEntry);
    localStorage.setItem('orbis_audit_log', JSON.stringify(existingLogs.slice(0, 100)));
}


function getEmployeeAdminFormSnapshot() {
    const readByLabel = (labelText) => {
        const label = Array.from(document.querySelectorAll('label, div, span')).find(el => {
            const text = (el.textContent || '').trim().toLowerCase();
            return text === labelText.toLowerCase();
        });

        if (!label) return '';

        const wrapper = label.parentElement;
        const field = wrapper?.querySelector('input, select, textarea') || null;
        return field?.value ?? '';
    };

    return {
        employee_id: readByLabel('EMPLOYEE ID') || window.currentEmployee?.employee_id || window.currentEmployee?.employeeId || '',
        status: readByLabel('STATUS'),
        first_name: readByLabel('FIRST NAME'),
        last_name: readByLabel('LAST NAME'),
        department: readByLabel('DEPARTMENT'),
        position: readByLabel('POSITION'),
        supervisor: readByLabel('SUPERVISOR'),
        pay_type: readByLabel('PAY TYPE'),
        standard_hours: readByLabel('STANDARD HOURS'),
        benefits_status: readByLabel('BENEFITS STATUS'),
        hire_date: readByLabel('HIRE DATE'),
        next_review_date: readByLabel('NEXT REVIEW DATE'),
        anniversary_date: readByLabel('ANNIVERSARY DATE'),
        tenure_bracket: readByLabel('TENURE BRACKET')
    };
}
function getEmployeeAdminFieldByLabel(labelText) {
    const label = Array.from(document.querySelectorAll('label, div, span')).find(el => {
        const text = (el.textContent || '').trim().toLowerCase();
        return text === labelText.toLowerCase();
    });

    if (!label) return null;

    const wrapper = label.parentElement;
    return wrapper?.querySelector('input, select, textarea') || null;
}

function setEmployeeAdminAuditBaseline(snapshot = getEmployeeAdminFormSnapshot()) {
    const fieldLabels = {
        employee_id: 'EMPLOYEE ID',
        status: 'STATUS',
        first_name: 'FIRST NAME',
        last_name: 'LAST NAME',
        department: 'DEPARTMENT',
        position: 'POSITION',
        supervisor: 'SUPERVISOR',
        pay_type: 'PAY TYPE',
        standard_hours: 'STANDARD HOURS',
        benefits_status: 'BENEFITS STATUS',
        hire_date: 'HIRE DATE',
        next_review_date: 'NEXT REVIEW DATE',
        anniversary_date: 'ANNIVERSARY DATE',
        tenure_bracket: 'TENURE BRACKET'
    };

    Object.entries(fieldLabels).forEach(([key, labelText]) => {
        const field = getEmployeeAdminFieldByLabel(labelText);
        if (field) field.dataset.auditOriginal = snapshot?.[key] ?? '';
    });
    window.__employeeOriginalAuditSnapshot = snapshot;
    window.__employeeDirtyFields = new Set();
}

function getEmployeeAdminAuditBaseline() {
    const readOriginalByLabel = (key, labelText) => {
        const field = getEmployeeAdminFieldByLabel(labelText);
        if (!field) return window.__employeeOriginalAuditSnapshot?.[key] ?? '';
        return field.dataset.auditOriginal ?? window.__employeeOriginalAuditSnapshot?.[key] ?? '';
    };

    return {
        employee_id: readOriginalByLabel('employee_id', 'EMPLOYEE ID'),
        status: readOriginalByLabel('status', 'STATUS'),
        first_name: readOriginalByLabel('first_name', 'FIRST NAME'),
        last_name: readOriginalByLabel('last_name', 'LAST NAME'),
        department: readOriginalByLabel('department', 'DEPARTMENT'),
        position: readOriginalByLabel('position', 'POSITION'),
        supervisor: readOriginalByLabel('supervisor', 'SUPERVISOR'),
        pay_type: readOriginalByLabel('pay_type', 'PAY TYPE'),
        standard_hours: readOriginalByLabel('standard_hours', 'STANDARD HOURS'),
        benefits_status: readOriginalByLabel('benefits_status', 'BENEFITS STATUS'),
        hire_date: readOriginalByLabel('hire_date', 'HIRE DATE'),
        next_review_date: readOriginalByLabel('next_review_date', 'NEXT REVIEW DATE'),
        anniversary_date: readOriginalByLabel('anniversary_date', 'ANNIVERSARY DATE'),
        tenure_bracket: readOriginalByLabel('tenure_bracket', 'TENURE BRACKET')
    };
}

function getEmployeeAdminFieldKey(field) {
    if (!field) return '';

    const labelText = field.closest('div')?.querySelector('label')?.textContent?.trim().toLowerCase()
        || field.previousElementSibling?.textContent?.trim().toLowerCase()
        || field.placeholder?.trim().toLowerCase()
        || '';

    const map = {
        'employee id': 'employee_id',
        'status': 'status',
        'first name': 'first_name',
        'last name': 'last_name',
        'department': 'department',
        'position': 'position',
        'supervisor': 'supervisor',
        'pay type': 'pay_type',
        'standard hours': 'standard_hours',
        'benefits status': 'benefits_status',
        'hire date': 'hire_date',
        'next review date': 'next_review_date',
        'anniversary date': 'anniversary_date',
        'tenure bracket': 'tenure_bracket'
    };

    return map[labelText] || '';
}

function bindEmployeeAdminDirtyTracking() {
    if (window.__employeeAdminDirtyBind) return;
    window.__employeeAdminDirtyBind = true;
    window.__employeeDirtyFields = window.__employeeDirtyFields || new Set();

    document.addEventListener('focusin', (e) => {
        const field = e.target.closest('input, select, textarea');
        if (!field) return;

        const key = getEmployeeAdminFieldKey(field);
        if (!key || key === 'employee_id') return;

        if (field.dataset.auditOriginal === undefined) {
            field.dataset.auditOriginal = field.value ?? '';
        }
    });

    document.addEventListener('input', (e) => {
        if (window.__suppressAuditDirty) return;

        const field = e.target.closest('input, select, textarea');
        if (!field) return;

        const key = getEmployeeAdminFieldKey(field);
        if (!key || key === 'employee_id') return;

        const original = String(field.dataset.auditOriginal ?? '').trim();
        const current = String(field.value ?? '').trim();

        if (original !== current) {
            window.__employeeDirtyFields.add(key);
        } else {
            window.__employeeDirtyFields.delete(key);
        }
    });

    document.addEventListener('change', (e) => {
        if (window.__suppressAuditDirty) return;

        const field = e.target.closest('input, select, textarea');
        if (!field) return;

        const key = getEmployeeAdminFieldKey(field);
        if (!key || key === 'employee_id') return;

        const original = String(field.dataset.auditOriginal ?? '').trim();
        const current = String(field.value ?? '').trim();

        if (original !== current) {
            window.__employeeDirtyFields.add(key);
        } else {
            window.__employeeDirtyFields.delete(key);
        }
    });
}


function getMeaningfulEmployeeAuditChanges(before, after) {
    const trackedFields = [
        'status',
        'first_name',
        'last_name',
        'department',
        'position',
        'supervisor',
        'pay_type',
        'standard_hours',
        'benefits_status',
        'hire_date',
        'next_review_date',
        'anniversary_date',
        'tenure_bracket'
    ];

    return trackedFields.filter(key => {
        const beforeValue = String(before?.[key] ?? '').trim();
        const afterValue = String(after?.[key] ?? '').trim();

        if (beforeValue === afterValue) return false;
        return true;
    });
}

function bindEmployeeUpdateToast() {
    if (window.__employeeUpdateToastBind) return;
    window.__employeeUpdateToastBind = true;
    console.log('[Orbis Audit] Employee update audit listener bound.');
    bindEmployeeAdminDirtyTracking();

    document.addEventListener('click', (e) => {
        const clickedButton = e.target.closest('button');
        const saveButton = e.target.closest('#saveEmployeeBtn') || clickedButton;
        const buttonText = (saveButton?.textContent || '').trim().toLowerCase();
        const isUpdateButton = !!saveButton && (saveButton.id === 'saveEmployeeBtn' || buttonText.includes('update employee'));

        if (!isUpdateButton) return;

        const isExistingEmployee = !!window.currentEmployee && !window.isCreatingEmployee;
        if (!isExistingEmployee) return;

        console.log('[Orbis Audit] Update Employee click detected. Preparing audit log.');

        window.__employeeUpdateToastPending = true;
        window.__employeeBeforeUpdate = getEmployeeAdminAuditBaseline();

        setTimeout(async () => {
            if (!window.__employeeUpdateToastPending) return;
            window.__employeeUpdateToastPending = false;

            const before = window.__employeeBeforeUpdate || {};
            const after = getEmployeeAdminFormSnapshot();

            const dirtyChanges = Array.from(window.__employeeDirtyFields || []);
            const snapshotChanges = getMeaningfulEmployeeAuditChanges(before, after);
            const changes = dirtyChanges.length ? dirtyChanges : snapshotChanges;

            const auditEntry = {
                id: `audit-${Date.now()}`,
                employee_id: after.employee_id || before.employee_id || before.employeeId || '',
                name: `${after.first_name || before.first_name || ''} ${after.last_name || before.last_name || ''}`.trim(),
                timestamp: new Date().toISOString(),
                action_type: 'employee_update',
                changed_by: window.currentUser?.email || window.currentUser?.name || 'Current user',
                fields_changed: changes,
                before,
                after
            };

            console.log('[Orbis Audit] Audit entry created:', auditEntry);

            const { error } = await writeEmployeeAuditLogToSupabase(auditEntry);

            if (error) {
                writeEmployeeAuditLogLocal(auditEntry);
                console.warn('[Orbis Audit] Supabase insert failed. Saved locally instead:', error);
            } else {
                console.log('[Orbis Audit] Audit log saved to Supabase.');
                if (document.getElementById('employeeAuditLogViewer')) {
                    renderEmployeeAuditLogViewer(window.currentEmployee);
                }
            }

            if (typeof showToast === 'function') {
                showToast(`Employee updated (${changes.length} change${changes.length === 1 ? '' : 's'})`, 'success');
            }
            setEmployeeAdminAuditBaseline(after);
            window.__employeeDirtyFields = new Set();

            if (typeof loadEmployees === 'function') {
                loadEmployees();
            } else if (typeof renderEmployeeRoster === 'function') {
                renderEmployeeRoster();
            }
        }, 750);
    });

    window.addEventListener('error', () => {
        if (!window.__employeeUpdateToastPending) return;
        window.__employeeUpdateToastPending = false;

        if (typeof showToast === 'function') {
            showToast('Employee update failed. Please check the form and try again.', 'error');
        }
    });

    window.addEventListener('unhandledrejection', () => {
        if (!window.__employeeUpdateToastPending) return;
        window.__employeeUpdateToastPending = false;

        if (typeof showToast === 'function') {
            showToast('Employee update failed. Please check the form and try again.', 'error');
        }
    });
}

function getEmployeeSnapshotFromRosterRow(employeeId) {
    const row = document.querySelector(`tr.employee-row[data-id="${employeeId}"]`);
    if (!row) return {};

    const cells = Array.from(row.querySelectorAll('td'));
    const nameText = cells[1]?.querySelector('.link-button')?.textContent?.trim() || cells[1]?.textContent?.trim() || '';
    const nameParts = nameText.split(/\s+/).filter(Boolean);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

    return {
        employee_id: cells[0]?.textContent?.trim() || employeeId || '',
        employeeId: cells[0]?.textContent?.trim() || employeeId || '',
        displayId: cells[0]?.textContent?.trim() || employeeId || '',
        employee_number: cells[0]?.textContent?.trim() || employeeId || '',
        employeeNumber: cells[0]?.textContent?.trim() || employeeId || '',
        first_name: firstName,
        firstName,
        last_name: lastName,
        lastName,
        displayName: nameText,
        department: cells[2]?.textContent?.trim() || '',
        dept: cells[2]?.textContent?.trim() || '',
        displayDepartment: cells[2]?.textContent?.trim() || '',
        position: cells[3]?.textContent?.trim() || '',
        displayPosition: cells[3]?.textContent?.trim() || '',
        supervisor: cells[4]?.textContent?.trim() || '',
        displaySupervisor: cells[4]?.textContent?.trim() || '',
        displayHireDate: cells[5]?.textContent?.trim() || '',
        status: cells[6]?.textContent?.trim() || '',
        displayStatus: cells[6]?.textContent?.trim() || ''
    };
}

function getFilteredRosterEmployees() {
    const searchTerm = safeGet('globalSearch')?.value?.toLowerCase().trim() || '';
    const departmentFilter = safeGet('deptFilter')?.value || '';
    const statusFilter = safeGet('statusFilter')?.value || '';

    const employees = Array.isArray(EMPLOYEES) ? EMPLOYEES : [];

    return employees
        .map(normalizeEmployeeForRoster)
        .filter(Boolean)
        .filter(employee => {
            const searchableText = [
                employee.displayId,
                employee.displayName,
                employee.displayDepartment,
                employee.displayPosition,
                employee.displaySupervisor,
                employee.displayStatus
            ].join(' ').toLowerCase();

            const matchesSearch = !searchTerm || searchableText.includes(searchTerm);
            const matchesDepartment = !departmentFilter || employee.displayDepartment === departmentFilter;
            const matchesStatus = !statusFilter || employee.displayStatus === statusFilter;

            return matchesSearch && matchesDepartment && matchesStatus;
        })
        .sort((a, b) => {
            let valA;
            let valB;

            switch (currentSort?.column) {
                case 'id':
                    valA = a.displayId || '';
                    valB = b.displayId || '';
                    break;
                case 'name':
                    valA = `${(a.last || a.last_name || '').toLowerCase()} ${(a.first || a.first_name || '').toLowerCase()}`;
                    valB = `${(b.last || b.last_name || '').toLowerCase()} ${(b.first || b.first_name || '').toLowerCase()}`;
                    break;
                case 'dept':
                    valA = a.displayDepartment || '';
                    valB = b.displayDepartment || '';
                    break;
                case 'position':
                    valA = a.displayPosition || '';
                    valB = b.displayPosition || '';
                    break;
                case 'supervisor':
                    valA = a.displaySupervisor || '';
                    valB = b.displaySupervisor || '';
                    break;
                case 'hireDate': {
                    const timeA = a.displayHireDate ? new Date(a.displayHireDate).getTime() : 0;
                    const timeB = b.displayHireDate ? new Date(b.displayHireDate).getTime() : 0;
                    return currentSort?.direction === 'desc' ? timeB - timeA : timeA - timeB;
                }
                case 'status':
                    valA = a.displayStatus || '';
                    valB = b.displayStatus || '';
                    break;
                default:
                    valA = a.displayName || '';
                    valB = b.displayName || '';
            }

            const result = compareText(valA, valB);
            return currentSort?.direction === 'desc' ? -result : result;
        });
}

function renderEmployeeRoster() {
    const tbody = safeGet('empBody') || safeGet('employeeTableBody') || safeGet('rosterBody');
    if (!tbody) return;

    const employees = getFilteredRosterEmployees();
    currentFilteredEmployees = employees;
    if (safeGet('empCount')) {
        const total = Array.isArray(EMPLOYEES) ? EMPLOYEES.length : employees.length;
        safeGet('empCount').textContent = `Showing ${employees.length} of ${total} employee${total === 1 ? '' : 's'}`;
    }

    if (!employees.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="empty">
                    <div style="padding:20px; text-align:center;">
                        <strong>No employees found</strong><br>
                        <span style="color:#6b7280; font-size:13px;">
                            Try adjusting your filters or search.
                        </span>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = employees.map(employee => {
        const drawerId = esc(employee.dbId || employee.id || employee.employee_id || '');
        const hireDate = employee.displayHireDate ? fmtDate(employee.displayHireDate) : '—';

        return `
            <tr class="employee-row" data-id="${drawerId}" title="Open ${esc(employee.displayName)}" style="cursor:pointer;" onclick="openDrawerByEmployeeId('${drawerId}')">
                <td>${esc(employee.displayId)}</td>
                <td>
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:12px;">
                        <button type="button" class="link-button" onclick="event.stopPropagation(); openDrawerByEmployeeId('${drawerId}')">
                            
                            ${esc(employee.displayName)}
                            ${(
                (typeof currentAtRiskRosterMap !== 'undefined' && currentAtRiskRosterMap?.[String(employee.dbId || employee.id || employee.employee_id || '')]) ||
                window.currentAtRiskRosterMap?.[String(employee.dbId || employee.id || employee.employee_id || '')]
            )
                ? '<span class="badge badge-danger" style="margin-left:6px; font-size:10px; padding:3px 7px; border-radius:999px; background:#fee2e2; color:#991b1b; font-weight:800;">At-Risk</span>'
                : ''}
                            ${(
                (typeof currentImpactPlayerRosterMap !== 'undefined' && currentImpactPlayerRosterMap?.[String(employee.dbId || employee.id || employee.employee_id || '')]) ||
                window.currentImpactPlayerRosterMap?.[String(employee.dbId || employee.id || employee.employee_id || '')]
            )
                ? '<span class="badge badge-success" style="margin-left:6px; font-size:10px; padding:3px 7px; border-radius:999px; background:#dcfce7; color:#166534; font-weight:800;">Impact</span>'
                : ''}
                            
                        </button>
                        <div class="row-actions" style="display:flex; gap:6px; opacity:0; transition:opacity 0.15s ease;">
                            <button type="button" class="mini-btn" onclick="event.stopPropagation(); openDrawerByEmployeeId('${drawerId}')">Edit</button>
                            <button type="button" class="mini-btn danger" onclick="event.stopPropagation(); deleteEmployeeQuick('${drawerId}')">Delete</button>
                        </div>
                    </div>
                </td>
                <td>${esc(employee.displayDepartment)}</td>
                <td>${esc(employee.displayPosition)}</td>
                <td>${esc(employee.displaySupervisor)}</td>
                <td>${hireDate}</td>
                <td><span class="${statusBadge(employee.displayStatus)}">${esc(employee.displayStatusLabel)}</span></td>
            </tr>
        `;
    }).join('');

    if (typeof updateEmployeeRowBadges === 'function') {
        updateEmployeeRowBadges();
    }
}

function openDrawerByEmployeeId(employeeId) {
    const employee = (EMPLOYEES || []).find(item =>
        String(item.dbId || item.id || item.employee_id) === String(employeeId)
    );

    if (!employee) {
        showToast('Employee could not be found.', 'error');
        return;
    }
    let rosterSnapshot = getEmployeeSnapshotFromRosterRow(employeeId);
    if (!rosterSnapshot.employee_id) {
        rosterSnapshot = {
            ...rosterSnapshot,
            employee_id: employee.employee_id || employee.employeeId || employee.employee_number || employee.employeeNumber || employee.btw_id || employee.btwId || '',
            employeeId: employee.employee_id || employee.employeeId || employee.employee_number || employee.employeeNumber || employee.btw_id || employee.btwId || '',
            displayId: employee.employee_id || employee.employeeId || employee.employee_number || employee.employeeNumber || employee.btw_id || employee.btwId || ''
        };
    }
    const drawerEmployee = normalizeEmployeeForRoster({
        ...employee,
        ...rosterSnapshot
    });
    const finalEmployeeId = getEmployeePublicId(drawerEmployee, drawerEmployee.displayName);

    drawerEmployee.employee_id = finalEmployeeId;
    drawerEmployee.employeeId = finalEmployeeId;
    drawerEmployee.displayId = finalEmployeeId;

    if (typeof openDrawer === 'function') {
        isCreatingEmployee = false;
        window.currentEmployee = drawerEmployee;
        openDrawer(drawerEmployee);

        if (typeof populateEmployeeAdminForm === 'function') {
            populateEmployeeAdminForm(drawerEmployee);
        }

        populateEmployeeAdminFallback(drawerEmployee);
        populateEmployeeAdminByVisibleOrder(drawerEmployee);
        [50, 150, 300, 600, 1000, 1500].forEach(delay => {
            setTimeout(() => {
                populateEmployeeAdminFallback(drawerEmployee);
                populateEmployeeAdminByVisibleOrder(drawerEmployee);
                const visibleEmployeeIdField = Array.from(document.querySelectorAll('input')).find(input => {
                    const label = input.closest('div')?.querySelector('label')?.textContent?.trim().toLowerCase() || '';
                    return label === 'employee id' || input.placeholder?.trim().toLowerCase() === 'employee id';
                });
                if (visibleEmployeeIdField && finalEmployeeId) {
                    visibleEmployeeIdField.value = finalEmployeeId;
                    visibleEmployeeIdField.dispatchEvent(new Event('input', { bubbles: true }));
                    visibleEmployeeIdField.dispatchEvent(new Event('change', { bubbles: true }));
                    lockEmployeeIdField(visibleEmployeeIdField);
                }

                if (delay === 1500 && typeof setEmployeeAdminAuditBaseline === 'function') {
                    setEmployeeAdminAuditBaseline(getEmployeeAdminFormSnapshot());
                }
            }, delay);
        });

        if (safeGet('saveEmployeeBtn')) {
            safeGet('saveEmployeeBtn').textContent = 'Update Employee';
        }
    }
}

async function deleteEmployeeQuick(employeeId) {
    if (!employeeId) {
        showToast('No employee selected.', 'error');
        return;
    }

    const confirmed = confirm('Are you sure you want to delete this employee? This cannot be undone.');
    if (!confirmed) return;

    const { error } = await OrbisServices.employees.delete(employeeId);

    if (error) {
        console.error(error);
        showToast(`Could not delete employee: ${error.message || 'Unknown error'}`, 'error');
        return;
    }

    showToast('Employee deleted.');

    if (typeof loadEmployees === 'function') {
        await loadEmployees();
    } else {
        renderEmployeeRoster();
    }
}

function bindRosterEvents() {
    bindEmployeeUpdateToast();
    const searchInput = safeGet('globalSearch');
    const departmentFilter = safeGet('deptFilter');
    const statusFilter = safeGet('statusFilter');
    const clearFiltersBtn = safeGet('clearFiltersBtn');

    if (searchInput) {
        searchInput.oninput = () => {
            clearTimeout(rosterSearchTimer);
            rosterSearchTimer = setTimeout(renderEmployeeRoster, 150);
        };
    }
    if (departmentFilter) departmentFilter.onchange = renderEmployeeRoster;
    if (statusFilter) statusFilter.onchange = renderEmployeeRoster;

    if (clearFiltersBtn) {
        clearFiltersBtn.onclick = () => {
            if (searchInput) searchInput.value = '';
            if (departmentFilter) departmentFilter.value = '';
            if (statusFilter) statusFilter.value = '';
            currentSort = { column: 'name', direction: 'asc' };
            renderEmployeeRoster();
        };
    }
}

// Ensure Employee Admin tab repopulates after UI switches/reset
if (!window.__employeeAdminBind) {
    window.__employeeAdminBind = true;
    document.addEventListener('click', (e) => {
        const tab = e.target.closest('button, .tab, [data-tab]');
        if (!tab) return;

        const text = (tab.textContent || '').toLowerCase();
        const isEmployeeAdmin = text.includes('employee admin') || tab.getAttribute('data-tab') === 'employee-admin';
        const isHistoryTab = text.includes('history') || tab.getAttribute('data-tab') === 'history';

        if (isEmployeeAdmin && window.currentEmployee && typeof populateEmployeeAdminForm === 'function') {
            setTimeout(() => {
                populateEmployeeAdminForm(window.currentEmployee);
                if (typeof populateEmployeeAdminFallback === 'function') {
                    populateEmployeeAdminFallback(window.currentEmployee);
                }
                if (typeof populateEmployeeAdminByVisibleOrder === 'function') {
                    populateEmployeeAdminByVisibleOrder(window.currentEmployee);
                }
                const currentEmployeeId = window.currentEmployee?.employee_id || window.currentEmployee?.employeeId || window.currentEmployee?.displayId || '';
                const visibleEmployeeIdField = Array.from(document.querySelectorAll('input')).find(input => {
                    const label = input.closest('div')?.querySelector('label')?.textContent?.trim().toLowerCase() || '';
                    return label === 'employee id' || input.placeholder?.trim().toLowerCase() === 'employee id';
                });
                if (visibleEmployeeIdField && currentEmployeeId) {
                    visibleEmployeeIdField.value = currentEmployeeId;
                    visibleEmployeeIdField.dispatchEvent(new Event('input', { bubbles: true }));
                    visibleEmployeeIdField.dispatchEvent(new Event('change', { bubbles: true }));
                    lockEmployeeIdField(visibleEmployeeIdField);
                }
                if (typeof setEmployeeAdminAuditBaseline === 'function') {
                    setEmployeeAdminAuditBaseline(getEmployeeAdminFormSnapshot());
                }
            }, 50);
        }

        if (isHistoryTab && window.currentEmployee) {
            setTimeout(() => {
                renderEmployeeAuditLogViewer(window.currentEmployee);
            }, 100);
        }
    });
}

// 🔥 Unified roster refresh (used by ALL creation flows)
window.refreshEmployeeRoster = async function () {
    try {
        if (typeof window.loadEmployees === 'function') {
            await window.loadEmployees();
        } else if (window.OrbisServices?.employees?.getAll) {
            const result = await window.OrbisServices.employees.getAll();
            window.EMPLOYEES = result?.data || [];
            if (typeof window.renderEmployeeRoster === 'function') {
                window.renderEmployeeRoster();
            }
        } else if (typeof window.renderEmployeeRoster === 'function') {
            window.renderEmployeeRoster();
        }
    } catch (err) {
        console.error('Roster refresh failed:', err);
    }
};

// =========================
// EXPORTS
// =========================

window.formatRosterStatus = formatRosterStatus;
window.normalizeEmployeeForRoster = normalizeEmployeeForRoster;
window.getEmployeePublicId = getEmployeePublicId;
window.populateEmployeeAdminFallback = populateEmployeeAdminFallback;
window.populateEmployeeAdminByVisibleOrder = populateEmployeeAdminByVisibleOrder;
window.getEmployeeSnapshotFromRosterRow = getEmployeeSnapshotFromRosterRow;
window.getFilteredRosterEmployees = getFilteredRosterEmployees;
window.renderEmployeeRoster = renderEmployeeRoster;
window.openDrawerByEmployeeId = openDrawerByEmployeeId;
window.deleteEmployeeQuick = deleteEmployeeQuick;
window.bindRosterEvents = bindRosterEvents;
window.lockEmployeeIdField = lockEmployeeIdField;
window.bindEmployeeUpdateToast = bindEmployeeUpdateToast;
window.getEmployeeAdminFormSnapshot = getEmployeeAdminFormSnapshot;
window.getEmployeeAdminFieldByLabel = getEmployeeAdminFieldByLabel;
window.setEmployeeAdminAuditBaseline = setEmployeeAdminAuditBaseline;
window.getEmployeeAdminAuditBaseline = getEmployeeAdminAuditBaseline;
window.getEmployeeAdminFieldKey = getEmployeeAdminFieldKey;
window.bindEmployeeAdminDirtyTracking = bindEmployeeAdminDirtyTracking;
window.getMeaningfulEmployeeAuditChanges = getMeaningfulEmployeeAuditChanges;
window.getAuditLog = () => JSON.parse(localStorage.getItem('orbis_audit_log') || '[]');
window.writeEmployeeAuditLogToSupabase = writeEmployeeAuditLogToSupabase;
window.writeEmployeeAuditLogLocal = writeEmployeeAuditLogLocal;
window.fetchEmployeeAuditLogs = fetchEmployeeAuditLogs;
window.getLocalAuditLogsForEmployee = getLocalAuditLogsForEmployee;
window.renderEmployeeAuditLogViewer = renderEmployeeAuditLogViewer;

// Initialize audit/update listener immediately in case bindRosterEvents is not called.
bindEmployeeUpdateToast();