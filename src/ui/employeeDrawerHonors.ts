import { getEmployeeIronShiftMeta } from '../services/ironShiftAwards';
import { buildImpactBadgeHtml, buildIronShiftBadgeHtml } from './badges';

function esc(value: unknown): string {
  if (typeof window.esc === 'function') {
    return window.esc(value);
  }
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function formatAwardDate(value: string): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const date = new Date(`${raw.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function buildEmployeeHonorBadgesHtml(
  employee: Record<string, unknown> | null | undefined
): string {
  if (!employee) return '';

  const badges = [
    typeof window.getEmployeeImpactMeta === 'function'
      ? buildImpactBadgeHtml(window.getEmployeeImpactMeta(employee))
      : '',
    buildIronShiftBadgeHtml(getEmployeeIronShiftMeta(employee)),
  ].filter(Boolean);

  if (!badges.length) return '';
  return `<div class="employee-honor-badges">${badges.join('')}</div>`;
}

export function renderEmployeeDrawerHonors(
  employee: Record<string, unknown> | null | undefined
): void {
  const container = document.getElementById('employeeDrawerHonors');
  if (!container) return;

  const meta = getEmployeeIronShiftMeta(employee);
  if (!meta) {
    container.classList.add('hidden');
    container.innerHTML = '';
    return;
  }

  const countLabel =
    meta.awardCount > 1 ? `${meta.awardCount} Iron Shift awards on file` : 'Iron Shift Award recipient';

  container.classList.remove('hidden');
  container.innerHTML = `
    <div class="employee-drawer-honors-inner">
      <div class="employee-drawer-honors-title">${esc(countLabel)}</div>
      <div class="employee-drawer-honor-card employee-drawer-honor-card--iron-shift">
        ${buildIronShiftBadgeHtml(meta)}
        <div class="employee-drawer-honor-copy">
          <strong>${esc(meta.summary || 'Recognized for exceptional shift performance.')}</strong>
          <div class="muted">
            ${esc(formatAwardDate(meta.recognizedOn) || 'Date not recorded')}
            ${meta.recognizedBy ? ` · ${esc(meta.recognizedBy)}` : ''}
          </div>
        </div>
      </div>
    </div>
  `;
}

export function clearEmployeeDrawerHonors(): void {
  const container = document.getElementById('employeeDrawerHonors');
  if (!container) return;
  container.classList.add('hidden');
  container.innerHTML = '';
}

export function refreshEmployeeDrawerHonorsIfOpen(): void {
  const drawer = document.getElementById('employeeDrawer');
  if (!drawer?.classList.contains('open')) return;
  const employee = window.currentEmployee as Record<string, unknown> | undefined;
  if (!employee || window.isCreatingEmployee) {
    clearEmployeeDrawerHonors();
    return;
  }
  renderEmployeeDrawerHonors(employee);
}

window.renderEmployeeDrawerHonors = renderEmployeeDrawerHonors;
window.clearEmployeeDrawerHonors = clearEmployeeDrawerHonors;
window.refreshEmployeeDrawerHonorsIfOpen = refreshEmployeeDrawerHonorsIfOpen;
window.buildEmployeeHonorBadgesHtml = buildEmployeeHonorBadgesHtml;
