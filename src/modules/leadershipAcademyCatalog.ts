import type {
  LeadershipAcademyFoundationSnapshot,
  LeadershipCompetency,
  LeadershipCourse,
  LeadershipModule,
  LeadershipPhilosophyContent,
  LeadershipProgramTier,
} from '../types/leadershipAcademyTypes';

function esc(value: unknown): string {
  if (typeof window.esc === 'function') {
    return window.esc(value);
  }
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function statusChip(label: string, tone: 'good' | 'warn' | 'muted' = 'muted'): string {
  return `<span class="leadership-status-chip ${tone}">${esc(label)}</span>`;
}

function tierName(tiers: LeadershipProgramTier[], tierId: string | null): string {
  if (!tierId) return '—';
  return tiers.find((tier) => tier.id === tierId)?.name || 'Unknown tier';
}

export function renderLeadershipProgramsCatalog(
  snapshot: LeadershipAcademyFoundationSnapshot,
  selectedCourseId: string | null
): string {
  const tierRows = snapshot.tiers.length
    ? snapshot.tiers
        .map(
          (tier) => `<tr>
            <td>${esc(tier.name)}</td>
            <td>${esc(tier.intendedAudience || '—')}</td>
            <td>${statusChip(tier.status, tier.status === 'active' ? 'good' : 'muted')}</td>
            <td>${esc(tier.displayOrder)}</td>
            <td class="actions">
              <button class="button soft sm" type="button" data-leadership-edit-tier="${esc(tier.id)}">Edit</button>
              <button class="button soft sm" type="button" data-leadership-add-course="${esc(tier.id)}">Add course</button>
            </td>
          </tr>`
        )
        .join('')
    : '<tr><td colspan="5" class="empty">No program tiers yet.</td></tr>';

  const courseRows = snapshot.courses.length
    ? snapshot.courses
        .map((course) => {
          const moduleCount = snapshot.modules.filter((m) => m.courseId === course.id).length;
          const selected = course.id === selectedCourseId ? ' selected-row' : '';
          return `<tr class="${selected.trim()}">
            <td>${esc(course.title)}</td>
            <td>${esc(tierName(snapshot.tiers, course.tierId))}</td>
            <td>${statusChip(course.status, course.status === 'active' ? 'good' : course.status === 'draft' ? 'warn' : 'muted')}</td>
            <td>${esc(moduleCount)}</td>
            <td class="actions">
              <button class="button soft sm" type="button" data-leadership-select-course="${esc(course.id)}">Modules</button>
              <button class="button soft sm" type="button" data-leadership-edit-course="${esc(course.id)}">Edit</button>
              <button class="button soft sm" type="button" data-leadership-add-module="${esc(course.id)}">Add module</button>
            </td>
          </tr>`;
        })
        .join('')
    : '<tr><td colspan="5" class="empty">No courses yet.</td></tr>';

  const modulesForCourse = selectedCourseId
    ? snapshot.modules.filter((module) => module.courseId === selectedCourseId)
    : [];
  const selectedCourse = snapshot.courses.find((course) => course.id === selectedCourseId);

  const moduleRows = modulesForCourse.length
    ? modulesForCourse
        .map(
          (module) => `<tr>
            <td>${esc(module.title)}</td>
            <td>${esc(module.moduleType)}</td>
            <td>${module.isRequired ? 'Required' : 'Optional'}</td>
            <td>${esc(module.displayOrder)}</td>
            <td class="actions">
              <button class="button soft sm" type="button" data-leadership-edit-module="${esc(module.id)}">Edit</button>
            </td>
          </tr>`
        )
        .join('')
    : `<tr><td colspan="5" class="empty">${
        selectedCourseId ? 'No modules for this course yet.' : 'Select a course to view modules.'
      }</td></tr>`;

  return (
    '<div class="leadership-catalog-toolbar">' +
    '<button class="button primary" type="button" id="leadershipAddTierBtn">＋ Add tier</button>' +
    '<button class="button soft" type="button" id="leadershipAddCourseBtn">＋ Add course</button>' +
    '</div>' +
    '<div class="leadership-catalog-grid">' +
    '<div class="card leadership-catalog-card">' +
    '<div class="card-header"><span>Program tiers</span><span class="muted">' +
    esc(snapshot.tiers.length) +
    '</span></div>' +
    '<div class="card-body table-wrap"><table><thead><tr><th>Name</th><th>Audience</th><th>Status</th><th>Order</th><th>Actions</th></tr></thead><tbody>' +
    tierRows +
    '</tbody></table></div></div>' +
    '<div class="card leadership-catalog-card">' +
    '<div class="card-header"><span>Courses</span><span class="muted">' +
    esc(snapshot.courses.length) +
    '</span></div>' +
    '<div class="card-body table-wrap"><table><thead><tr><th>Title</th><th>Tier</th><th>Status</th><th>Modules</th><th>Actions</th></tr></thead><tbody>' +
    courseRows +
    '</tbody></table></div></div>' +
    '<div class="card leadership-catalog-card">' +
    '<div class="card-header"><span>Modules</span><span class="muted">' +
    esc(selectedCourse ? selectedCourse.title : 'Select a course') +
    '</span></div>' +
    '<div class="card-body table-wrap"><table><thead><tr><th>Title</th><th>Type</th><th>Required</th><th>Order</th><th>Actions</th></tr></thead><tbody>' +
    moduleRows +
    '</tbody></table></div></div>' +
    '</div>'
  );
}

export function renderLeadershipCompetenciesCatalog(competencies: LeadershipCompetency[]): string {
  const rows = competencies.length
    ? competencies
        .map(
          (comp) => `<tr>
            <td>${esc(comp.name)}</td>
            <td>${esc(comp.definition || '—')}</td>
            <td>${esc(comp.applicableTierIds.length)} tiers</td>
            <td>${statusChip(comp.status, comp.status === 'active' ? 'good' : 'muted')}</td>
            <td class="actions">
              <button class="button soft sm" type="button" data-leadership-edit-competency="${esc(comp.id)}">Edit</button>
            </td>
          </tr>`
        )
        .join('')
    : '<tr><td colspan="5" class="empty">No competencies yet.</td></tr>';

  return (
    '<div class="leadership-catalog-toolbar">' +
    '<button class="button primary" type="button" id="leadershipAddCompetencyBtn">＋ Add competency</button>' +
    '</div>' +
    '<div class="card"><div class="card-body table-wrap"><table><thead><tr><th>Name</th><th>Definition</th><th>Tiers</th><th>Status</th><th>Actions</th></tr></thead><tbody>' +
    rows +
    '</tbody></table></div></div>'
  );
}

export function renderLeadershipPhilosophyPanel(philosophy: LeadershipPhilosophyContent | null): string {
  if (!philosophy) {
    return (
      '<div class="leadership-academy-empty-state">' +
      '<p class="muted">No leadership philosophy document yet.</p>' +
      '<button class="button primary" type="button" id="leadershipCreatePhilosophyBtn">Create philosophy</button>' +
      '</div>'
    );
  }

  const bodyHtml = esc(philosophy.body).replace(/\n/g, '<br />');
  return (
    '<div class="leadership-philosophy-view">' +
    '<div class="leadership-philosophy-meta">' +
    statusChip(philosophy.status, philosophy.status === 'published' ? 'good' : 'warn') +
    (philosophy.isSeedDraft ? statusChip('Seed draft', 'warn') : '') +
    '</div>' +
    `<h3>${esc(philosophy.title)}</h3>` +
    `<div class="leadership-philosophy-body">${bodyHtml || '<span class="muted">No content yet.</span>'}</div>` +
    '<div class="leadership-catalog-toolbar">' +
    '<button class="button primary" type="button" id="leadershipEditPhilosophyBtn">Edit philosophy</button>' +
    '</div>' +
    '</div>'
  );
}

export function findLeadershipTier(
  snapshot: LeadershipAcademyFoundationSnapshot,
  tierId: string
): LeadershipProgramTier | null {
  return snapshot.tiers.find((tier) => tier.id === tierId) || null;
}

export function findLeadershipCourse(
  snapshot: LeadershipAcademyFoundationSnapshot,
  courseId: string
): LeadershipCourse | null {
  return snapshot.courses.find((course) => course.id === courseId) || null;
}

export function findLeadershipModule(
  snapshot: LeadershipAcademyFoundationSnapshot,
  moduleId: string
): LeadershipModule | null {
  return snapshot.modules.find((module) => module.id === moduleId) || null;
}

export function findLeadershipCompetency(
  snapshot: LeadershipAcademyFoundationSnapshot,
  competencyId: string
): LeadershipCompetency | null {
  return snapshot.competencies.find((comp) => comp.id === competencyId) || null;
}
