/**
 * Shared loading skeletons for dashboard polish.
 */

const ROSTER_SKELETON_COLS = 8;

export function showRosterTableSkeleton(rowCount = 8): void {
  const tbody =
    document.getElementById('employeeRosterBody') ||
    document.getElementById('empBody') ||
    document.getElementById('employeeTableBody') ||
    document.getElementById('rosterBody');

  if (!tbody) return;

  tbody.innerHTML = Array.from({ length: rowCount }, () => {
    const cells = Array.from({ length: ROSTER_SKELETON_COLS }, (_, index) => {
      const widthClass = index % 3 === 0 ? 'short' : index % 3 === 1 ? 'medium' : 'long';
      return `<td><span class="skeleton-line ${widthClass}"></span></td>`;
    }).join('');

    return `<tr class="skeleton-row" aria-hidden="true">${cells}</tr>`;
  }).join('');
}

export function showKpiGridLoading(): void {
  document.querySelector('.kpi-grid')?.classList.add('is-loading');
}

export function hideKpiGridLoading(): void {
  document.querySelector('.kpi-grid')?.classList.remove('is-loading');
}

export function showDashboardLoadingSkeletons(): void {
  showKpiGridLoading();
  showRosterTableSkeleton();
}

export function hideDashboardLoadingSkeletons(): void {
  hideKpiGridLoading();
}

window.showRosterTableSkeleton = showRosterTableSkeleton;
window.showKpiGridLoading = showKpiGridLoading;
window.hideKpiGridLoading = hideKpiGridLoading;
window.showDashboardLoadingSkeletons = showDashboardLoadingSkeletons;
window.hideDashboardLoadingSkeletons = hideDashboardLoadingSkeletons;
