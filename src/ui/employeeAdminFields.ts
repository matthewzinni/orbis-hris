type AdminField = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

export function clearEmployeeAdminDirtyFields(): void {
  window.__employeeDirtyFields = new Set<string>();
}

export function markEmployeeAdminFieldDirty(fieldId: string): void {
  if (!fieldId) return;
  if (!window.__employeeDirtyFields) {
    window.__employeeDirtyFields = new Set<string>();
  }
  window.__employeeDirtyFields.add(fieldId);
}

export function hasEmployeeAdminDirtyFields(): boolean {
  return (window.__employeeDirtyFields?.size ?? 0) > 0;
}

export function shouldSkipEmployeeAdminFieldWrite(
  field: AdminField | null | undefined
): boolean {
  if (!field) return true;
  if (field === document.activeElement) return true;
  if (field.id && window.__employeeDirtyFields?.has(field.id)) return true;
  return false;
}

export function bindEmployeeAdminDirtyFieldTracking(): void {
  if (window.__employeeAdminDirtyTrackingBound) return;
  window.__employeeAdminDirtyTrackingBound = true;
  window.__employeeDirtyFields = window.__employeeDirtyFields || new Set<string>();

  document.addEventListener(
    'input',
    (event) => {
      const target = event.target;
      if (
        !(target instanceof HTMLInputElement) &&
        !(target instanceof HTMLTextAreaElement) &&
        !(target instanceof HTMLSelectElement)
      ) {
        return;
      }

      const drawer = document.getElementById('employeeDrawer');
      if (!drawer?.contains(target)) return;

      const inAdminPanel =
        Boolean(target.closest('#tab-employee, #tab-profile')) ||
        /^employee/i.test(target.id) ||
        /^emp/i.test(target.id);

      if (!inAdminPanel) return;
      if (target.id) markEmployeeAdminFieldDirty(target.id);
    },
    true
  );

  window.addEventListener('orbis:employee-record-saved', () => {
    clearEmployeeAdminDirtyFields();
  });
}
