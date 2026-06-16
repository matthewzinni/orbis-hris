import { supabaseClient } from './supabaseClient';
import { esc } from '../utils/helpers';

type FormField = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

function getEmployeePublicId(employee: Record<string, unknown>, fallbackName = ''): string {
  if (typeof window.getEmployeePublicId === 'function') {
    return window.getEmployeePublicId(employee, fallbackName);
  }
  return String(employee.employee_id || employee.employeeId || employee.id || '').trim();
}

function cleanRosterEmployeeNameValue(value: unknown): string {
  if (typeof window.cleanRosterEmployeeNameValue === 'function') {
    return window.cleanRosterEmployeeNameValue(value);
  }
  return String(value || '').trim();
}

function eventTargetElement(target: EventTarget | null): Element | null {
  return target instanceof Element ? target : null;
}

async function fetchEmployeeAuditLogs(employeeId: string) {
    if (!employeeId) {
        return [];
    } try {
        let client = null;
        if (window.supabaseClient?.from) {
            client = window.supabaseClient;
        } else if (window.supabase?.from) {
            client = window.supabase;
        } else if (supabaseClient?.from) {
            client = supabaseClient;
        }
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
} function getLocalAuditLogsForEmployee(employeeId) {
    const logs = JSON.parse(localStorage.getItem('orbis_audit_log') || '[]');
    return logs.filter(log => String(log.employee_id || '') === String(employeeId));
} function formatAuditTimestamp(value) {
    if (!value) {
        return 'Unknown time';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }
    return date.toLocaleString();
} function formatAuditFieldName(field) {
    return String(field || '')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, char => char.toUpperCase());
} function renderAuditLogsHtml(logs) {
    if (!logs?.length) {
        return `
            <div class="audit-log-empty" style="padding:16px; border:1px solid #e5e7eb; border-radius:12px; background:#f9fafb; color:#6b7280; font-size:13px;">
                No timeline activity found for this employee yet.
            </div>
        `;
    } const getActionBadge = (actionType) => {
        const normalized = String(actionType || '').toLowerCase();
        if (normalized.includes('create')) {
            return {
                label: 'CREATE',
                bg: '#ecfdf5',
                color: '#047857',
                border: '#a7f3d0'
            };
        }
        if (normalized.includes('delete')) {
            return {
                label: 'DELETE',
                bg: '#fef2f2',
                color: '#b91c1c',
                border: '#fecaca'
            };
        }
        if (normalized.includes('flag')) {
            return {
                label: 'FLAG',
                bg: '#fffbeb',
                color: '#b45309',
                border: '#fde68a'
            };
        }
        if (normalized.includes('signature') || normalized.includes('sign')) {
            return {
                label: 'SIGN',
                bg: '#eef2ff',
                color: '#4338ca',
                border: '#c7d2fe'
            };
        }
        return {
            label: 'UPDATE',
            bg: '#eff6ff',
            color: '#2563eb',
            border: '#bfdbfe'
        };
    }; const getTimelineGroup = (log) => {
        const rawDate = log.changed_at || log.timestamp;
        const date = new Date(rawDate);
        if (Number.isNaN(date.getTime())) {
            return 'Earlier';
        }
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
    }; const renderFieldChangeList = (log) => {
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
    }; const renderTimelineItem = (log) => {
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
    }; const groups = logs.reduce((acc, log) => {
        const group = getTimelineGroup(log);
        if (!acc[group]) acc[group] = [];
        acc[group].push(log);
        return acc;
    }, {
        Today: [],
        Yesterday: [],
        Earlier: []
    }); const renderGroup = (title, items) => {
        if (!items.length) return '';
        return `
            <div class="audit-timeline-group" style="position:relative;">
                <div style="font-size:11px; font-weight:900; letter-spacing:0.08em; text-transform:uppercase; color:#64748b; margin:6px 0 10px;">
                    ${esc(title)}
                </div>
                ${items.map(renderTimelineItem).join('')}
            </div>
        `;
    }; return `
        <div class="audit-timeline" style="position:relative; padding-left:20px;">
            <div style="position:absolute; left:7px; top:8px; bottom:8px; width:2px; background:#dbeafe;"></div>
            ${renderGroup('Today', groups.Today)}
            ${renderGroup('Yesterday', groups.Yesterday)}
            ${renderGroup('Earlier', groups.Earlier)}
        </div>
    `;
} function getHistoryPanelElement() {
    const existing = document.getElementById('employeeAuditLogViewer');
    if (existing) return existing;
    const historyPanel =
        document.getElementById('historyPanel')
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
} async function renderEmployeeAuditLogViewer(employee = window.currentEmployee) {
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
                <button type="button" class="button soft sm" onclick="renderEmployeeAuditLogViewer()">Refresh</button>
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
                <button type="button" class="button soft sm" onclick="renderEmployeeAuditLogViewer()">Refresh</button>
            </div>
            ${renderAuditLogsHtml(logs)}
        </div>
    `;
} function writeEmployeeAuditLogLocal(auditEntry) {
    const existingLogs = JSON.parse(localStorage.getItem('orbis_audit_log') || '[]');
    existingLogs.unshift(auditEntry);
    localStorage.setItem('orbis_audit_log', JSON.stringify(existingLogs.slice(0, 100)));
} function getEmployeeAdminFormSnapshot() {
    const readByLabel = (labelText) => {
        const label = Array.from(document.querySelectorAll('label, div, span')).find(el => {
            const text = (el.textContent || '').trim().toLowerCase();
            return text === labelText.toLowerCase();
        });
        if (!label) return '';
        const wrapper = label.parentElement;
        const field = wrapper?.querySelector('input, select, textarea') as FormField | null;
        return field?.value ?? '';
    };
    return {
        employee_id: readByLabel('EMPLOYEE ID') || window.currentEmployee?.employee_id || window.currentEmployee?.employeeId || '',
        status: readByLabel('STATUS'),
        first_name: cleanRosterEmployeeNameValue(readByLabel('FIRST NAME')),
        last_name: cleanRosterEmployeeNameValue(readByLabel('LAST NAME')),
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
} function getEmployeeAdminFieldByLabel(labelText) {
    const label = Array.from(document.querySelectorAll('label, div, span')).find(el => {
        const text = (el.textContent || '').trim().toLowerCase();
        return text === labelText.toLowerCase();
    });
    if (!label) return null;
    const wrapper = label.parentElement;
    return wrapper?.querySelector('input, select, textarea') as FormField | null;
} function setEmployeeAdminAuditBaseline(snapshot = getEmployeeAdminFormSnapshot()) {
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
} function getEmployeeAdminAuditBaseline() {
    const readOriginalByLabel = (key, labelText) => {
        const field = getEmployeeAdminFieldByLabel(labelText);
        if (!field) return window.__employeeOriginalAuditSnapshot?.[key] ?? '';
        return field.dataset.auditOriginal ?? window.__employeeOriginalAuditSnapshot?.[key] ?? '';
    };
    return {
        employee_id: readOriginalByLabel('employee_id', 'EMPLOYEE ID'),
        status: readOriginalByLabel('status', 'STATUS'),
        first_name: cleanRosterEmployeeNameValue(readOriginalByLabel('first_name', 'FIRST NAME')),
        last_name: cleanRosterEmployeeNameValue(readOriginalByLabel('last_name', 'LAST NAME')),
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
} function getEmployeeAdminFieldKey(field) {
    if (!field) return '';
    const labelText =
        field.closest('div')?.querySelector('label')?.textContent?.trim().toLowerCase()
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
} function cleanEmployeeAdminVisibleNameFields() {
    ['FIRST NAME', 'LAST NAME'].forEach(labelText => {
        const field = getEmployeeAdminFieldByLabel(labelText);
        if (!field || typeof field.value !== 'string') return;
        const cleaned = cleanRosterEmployeeNameValue(field.value);
        if (field.value !== cleaned) {
            const previousSuppress = window.__suppressAuditDirty;
            window.__suppressAuditDirty = true;
            field.value = cleaned;
            field.dispatchEvent(new Event('input', { bubbles: true }));
            field.dispatchEvent(new Event('change', { bubbles: true }));
            window.__suppressAuditDirty = previousSuppress;
        }
    });
} function bindEmployeeAdminDirtyTracking() {
    if (window.__employeeAdminDirtyBind) return;
    window.__employeeAdminDirtyBind = true;
    window.__employeeDirtyFields = window.__employeeDirtyFields || new Set(); document.addEventListener('focusin', (e) => {
        const field = eventTargetElement(e.target)?.closest('input, select, textarea') as FormField | null;
        if (!field) return;
        const key = getEmployeeAdminFieldKey(field);
        if (!key || key === 'employee_id') return;
        if (field.dataset.auditOriginal === undefined) {
            field.dataset.auditOriginal = field.value ?? '';
        }
    }); document.addEventListener('input', (e) => {
        if (window.__suppressAuditDirty) return;
        const field = eventTargetElement(e.target)?.closest('input, select, textarea') as FormField | null;
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
    }); document.addEventListener('change', (e) => {
        if (window.__suppressAuditDirty) return;
        const field = eventTargetElement(e.target)?.closest('input, select, textarea') as FormField | null;
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
} function getMeaningfulEmployeeAuditChanges(before, after) {
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