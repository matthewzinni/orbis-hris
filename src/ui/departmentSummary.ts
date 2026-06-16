// Department filter + summary table (legacy app.ts)

type EmployeeRow = Record<string, unknown>;

function safeGet(id: string): HTMLElement | null {
  if (typeof window.safeGet === 'function') {
    return window.safeGet(id);
  }
  return document.getElementById(id);
}

function esc(value: unknown): string {
  if (typeof window.esc === 'function') {
    return window.esc(value);
  }
  return String(value ?? '');
}

function compareText(a: unknown, b: unknown): number {
  if (typeof window.compareText === 'function') {
    return window.compareText(a, b);
  }
  return String(a ?? '').localeCompare(String(b ?? ''), undefined, { sensitivity: 'base' });
}

function getScopedEmployees(): EmployeeRow[] {
  const scoped = window.EMPLOYEES;
  return Array.isArray(scoped) ? scoped : [];
}

export function populateDepartmentFilter(): void {
  const deptSelect = safeGet('deptFilter') as HTMLSelectElement | null;
  if (!deptSelect) return;

  const currentValue = deptSelect.value;
  const employees = getScopedEmployees();
  const depts = [
    ...new Set(
      employees
        .map((e) => String(e.department || e.dept || '').trim())
        .filter(Boolean)
    ),
  ].sort(compareText);

  deptSelect.innerHTML =
    '<option value="">All Departments</option>' +
    depts.map((d) => `<option value="${esc(d)}">${esc(d)}</option>`).join('');

  deptSelect.value = currentValue;
}

export function renderDepartmentSummary(): void {
  const body = safeGet('deptSummaryBody');
  if (!body) return;

  const counts: Record<string, number> = {};

  getScopedEmployees()
    .filter(
      (e) =>
        String(e.status || e.displayStatus || '')
          .trim()
          .toUpperCase() === 'ACTIVE'
    )
    .forEach((e) => {
      const dept = String(e.department || e.dept || 'Unassigned').trim() || 'Unassigned';
      counts[dept] = (counts[dept] || 0) + 1;
    });

  const rows = Object.entries(counts).sort((a, b) => compareText(a[0], b[0]));

  if (!rows.length) {
    body.innerHTML =
      '<tr><td colspan="2" class="empty">No department data available</td></tr>';
    return;
  }

  body.innerHTML = rows
    .map(
      ([dept, count]) => `
        <tr>
          <td>${esc(dept)}</td>
          <td>${count}</td>
        </tr>
      `
    )
    .join('');
}

window.populateDepartmentFilter = populateDepartmentFilter;
window.renderDepartmentSummary = renderDepartmentSummary;
