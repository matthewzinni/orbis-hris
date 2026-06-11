import type { ManagerHomeSnapshot } from '../services/managerHome';
import {
  buildDepartmentHeadcountSegments,
  buildManagerStayInterviewSegments,
  buildManagerTeamStatusSegments,
  buildStayInterviewSegments,
  buildTenureSegments,
  buildWorkforceStatusSegments,
  type ChartSegment,
} from '../services/dashboardChartData';

type EmployeeRow = Record<string, unknown>;

function esc(value: unknown): string {
  if (typeof window.esc === 'function') {
    return window.esc(value);
  }
  return String(value ?? '');
}

function segmentTotal(segments: ChartSegment[]): number {
  return segments.reduce((sum, segment) => sum + segment.value, 0);
}

function buildConicGradient(segments: ChartSegment[]): string {
  const total = segmentTotal(segments);
  if (!total) return 'conic-gradient(#334155 0deg 360deg)';

  let cursor = 0;
  const stops: string[] = [];

  segments.forEach((segment) => {
    if (segment.value <= 0) return;
    const degrees = (segment.value / total) * 360;
    const start = cursor;
    const end = cursor + degrees;
    stops.push(`${segment.color} ${start}deg ${end}deg`);
    cursor = end;
  });

  return `conic-gradient(${stops.join(', ')})`;
}

function renderLegend(segments: ChartSegment[]): string {
  const total = segmentTotal(segments);
  if (!total) {
    return '<div class="muted orbis-chart-empty">No data</div>';
  }

  return `
    <ul class="orbis-chart-legend" aria-hidden="true">
      ${segments
        .map((segment) => {
          const pct = Math.round((segment.value / total) * 100);
          return `
            <li class="orbis-chart-legend-item">
              <span class="orbis-chart-swatch" style="background:${esc(segment.color)}"></span>
              <span class="orbis-chart-legend-label">${esc(segment.label)}</span>
              <span class="orbis-chart-legend-value">${segment.value} <span class="muted">(${pct}%)</span></span>
            </li>
          `;
        })
        .join('')}
    </ul>
  `;
}

function renderDonutChart(
  title: string,
  segments: ChartSegment[],
  centerLabel: string,
  centerValue: string | number
): string {
  const total = segmentTotal(segments);

  return `
    <article class="dashboard-chart-panel">
      <h3 class="dashboard-chart-title">${esc(title)}</h3>
      <div class="dashboard-chart-body dashboard-chart-body--donut">
        ${
          total
            ? `
              <div class="orbis-chart-donut" style="background:${buildConicGradient(segments)}" role="img" aria-label="${esc(title)}">
                <div class="orbis-chart-donut-center">
                  <strong>${esc(centerValue)}</strong>
                  <span>${esc(centerLabel)}</span>
                </div>
              </div>
              ${renderLegend(segments)}
            `
            : '<div class="muted orbis-chart-empty">No data to chart yet.</div>'
        }
      </div>
    </article>
  `;
}

function renderBarChart(title: string, segments: ChartSegment[]): string {
  const total = segmentTotal(segments);
  const max = segments.reduce((peak, segment) => Math.max(peak, segment.value), 0);

  return `
    <article class="dashboard-chart-panel">
      <h3 class="dashboard-chart-title">${esc(title)}</h3>
      <div class="dashboard-chart-body dashboard-chart-body--bars">
        ${
          total
            ? `
              <div class="orbis-bar-chart">
                ${segments
                  .map((segment) => {
                    const width = max ? Math.round((segment.value / max) * 100) : 0;
                    return `
                      <div class="orbis-bar-row">
                        <span class="orbis-bar-label">${esc(segment.label)}</span>
                        <div class="orbis-bar-track" aria-hidden="true">
                          <div class="orbis-bar-fill" style="width:${width}%; background:${esc(segment.color)}"></div>
                        </div>
                        <span class="orbis-bar-value">${segment.value}</span>
                      </div>
                    `;
                  })
                  .join('')}
              </div>
            `
            : '<div class="muted orbis-chart-empty">No data to chart yet.</div>'
        }
      </div>
    </article>
  `;
}

function getDashboardEmployees(): EmployeeRow[] {
  const scoped = window.EMPLOYEES;
  if (Array.isArray(scoped) && scoped.length) return scoped as EmployeeRow[];

  const roster = window.currentEmployeeRoster;
  if (Array.isArray(roster) && roster.length) return roster as EmployeeRow[];

  return [];
}

export function renderDashboardCharts(employees?: EmployeeRow[]): void {
  const root = document.getElementById('dashboardChartsGrid');
  if (!root) return;

  const roster = employees?.length ? employees : getDashboardEmployees();
  const departments = buildDepartmentHeadcountSegments(roster);
  const workforce = buildWorkforceStatusSegments(roster);
  const tenure = buildTenureSegments(roster);
  const stayInterviews = buildStayInterviewSegments(roster);

  const activeCount = roster.filter(
    (employee) =>
      String(employee.status || employee.displayStatus || '')
        .trim()
        .toUpperCase() === 'ACTIVE'
  ).length;

  root.innerHTML = [
    renderDonutChart(
      'Headcount by department',
      departments,
      'active',
      activeCount
    ),
    renderDonutChart(
      'Workforce status',
      workforce,
      'people',
      segmentTotal(workforce)
    ),
    renderBarChart('Tenure distribution', tenure),
    renderDonutChart(
      'Stay interview status',
      stayInterviews,
      'eligible',
      segmentTotal(stayInterviews)
    ),
  ].join('');
}

export function renderManagerHomeCharts(
  snapshot: ManagerHomeSnapshot,
  team: EmployeeRow[]
): void {
  const root = document.getElementById('managerHomeCharts');
  if (!root) return;

  const teamStatus = buildManagerTeamStatusSegments(snapshot);
  const stayStatus = buildManagerStayInterviewSegments(team);

  root.innerHTML = [
    renderDonutChart('Team status', teamStatus, 'members', snapshot.teamCount),
    renderDonutChart(
      'Stay interviews',
      stayStatus,
      'eligible',
      segmentTotal(stayStatus)
    ),
  ].join('');
}

declare global {
  interface Window {
    renderDashboardCharts?: (employees?: EmployeeRow[]) => void;
  }
}

window.renderDashboardCharts = renderDashboardCharts;
