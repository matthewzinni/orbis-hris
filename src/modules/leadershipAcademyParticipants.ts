import type {
  LeadershipAcademyFoundationSnapshot,
  LeadershipEmployeeSummary,
  LeadershipEnrollment,
  LeadershipEnrollmentStatus,
} from '../types/leadershipAcademyTypes';

export type LeadershipParticipantFilters = {
  search: string;
  status: string;
};

function esc(value: unknown): string {
  if (typeof window.esc === 'function') return window.esc(value);
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function employeeName(employee: LeadershipEmployeeSummary | undefined, fallbackId: string): string {
  if (!employee) return fallbackId;
  const name = `${employee.firstName} ${employee.lastName}`.trim();
  return name || fallbackId;
}

function statusLabel(status: string): string {
  return status
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function statusTone(status: string): string {
  if (status === 'completed') return 'good';
  if (status === 'overdue' || status === 'withdrawn') return 'warn';
  if (status === 'paused') return 'muted';
  return '';
}

function formatDate(value: string): string {
  if (!value) return 'No due date';
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function assignmentName(
  snapshot: LeadershipAcademyFoundationSnapshot,
  enrollment: LeadershipEnrollment
): string {
  if (enrollment.tierId) {
    return snapshot.tiers.find((tier) => tier.id === enrollment.tierId)?.name || 'Program tier';
  }
  const assignments = snapshot.courseAssignments.filter(
    (assignment) => assignment.enrollmentId === enrollment.id
  );
  return assignments
    .map(
      (assignment) =>
        snapshot.courses.find((course) => course.id === assignment.courseId)?.title ||
        'Individual course'
    )
    .join(', ');
}

function progressBar(percent: number): string {
  const safePercent = Math.max(0, Math.min(100, Math.round(percent)));
  return `<div class="leadership-participant-progress" aria-label="${safePercent}% complete">
    <div><span>${safePercent}%</span></div>
    <div class="leadership-progress-track"><span style="width:${safePercent}%"></span></div>
  </div>`;
}

function renderEnrollmentForm(snapshot: LeadershipAcademyFoundationSnapshot): string {
  const activeEmployees = snapshot.employees
    .filter((employee) => !['terminated', 'inactive'].includes(employee.status.toLowerCase()))
    .sort((a, b) =>
      employeeName(a, a.id).localeCompare(employeeName(b, b.id), undefined, {
        sensitivity: 'base',
      })
    );
  const tierOptions = snapshot.tiers
    .filter((tier) => tier.status === 'active')
    .map((tier) => `<option value="tier:${esc(tier.id)}">Program...${esc(tier.name)}</option>`)
    .join('');
  const courseOptions = snapshot.courses
    .filter((course) => course.status !== 'archived')
    .map(
      (course) =>
        `<option value="course:${esc(course.id)}">Individual course...${esc(course.title)}${
          course.status === 'draft' ? ' (Draft)' : ''
        }</option>`
    )
    .join('');

  return `<form class="leadership-enrollment-form" data-leadership-enrollment-form>
    <div class="leadership-enrollment-form-header">
      <div>
        <h3>Enroll a participant</h3>
        <p class="muted">Assign a complete program or one individual course.</p>
      </div>
      <button class="button soft sm" type="button" data-leadership-close-enrollment-form>Cancel</button>
    </div>
    <div class="leadership-enrollment-form-grid">
      <label class="field">
        <span>Employee</span>
        <select name="employeeId" required>
          <option value="">Select an employee</option>
          ${activeEmployees
            .map(
              (employee) =>
                `<option value="${esc(employee.id)}">${esc(
                  employeeName(employee, employee.id)
                )}...${esc(employee.department || employee.position || employee.id)}</option>`
            )
            .join('')}
        </select>
      </label>
      <label class="field">
        <span>Assignment</span>
        <select name="assignment" required>
          <option value="">Select a program or course</option>
          ${tierOptions}
          ${courseOptions}
        </select>
      </label>
      <label class="field">
        <span>Due date</span>
        <input type="date" name="dueDate">
      </label>
      <label class="field leadership-enrollment-notes">
        <span>Notes</span>
        <textarea name="notes" rows="3" placeholder="Optional enrollment notes"></textarea>
      </label>
    </div>
    <div class="leadership-player-actions">
      <button class="button primary" type="submit">Enroll participant</button>
    </div>
  </form>`;
}

function renderParticipantDetail(
  snapshot: LeadershipAcademyFoundationSnapshot,
  enrollment: LeadershipEnrollment,
  canManage: boolean
): string {
  const employee = snapshot.employees.find((item) => item.id === enrollment.employeeId);
  const assignments = snapshot.courseAssignments.filter(
    (assignment) => assignment.enrollmentId === enrollment.id
  );
  const progress = snapshot.moduleProgress.filter(
    (item) => item.enrollmentId === enrollment.id
  );
  const submissions = snapshot.moduleSubmissions.filter(
    (item) => item.enrollmentId === enrollment.id
  );
  const attempts = snapshot.quizAttempts.filter(
    (item) => item.enrollmentId === enrollment.id
  );
  const modulesForEnrollment = snapshot.modules
    .filter((module) =>
      assignments.some((assignment) => assignment.courseId === module.courseId)
    )
    .sort((a, b) => a.displayOrder - b.displayOrder);

  const reflectionSections = submissions
    .filter((submission) => submission.submissionType === 'reflection')
    .map((submission) => {
      const module = snapshot.modules.find((item) => item.id === submission.moduleId);
      const questions = Array.isArray(module?.completionRequirements.questions)
        ? module.completionRequirements.questions.map(String)
        : [];
      const answers = Array.isArray(submission.response.answers)
        ? submission.response.answers.map(String)
        : [];
      return `<section class="leadership-participant-response">
        <h4>${esc(module?.title || 'Reflection')}</h4>
        ${questions
          .map(
            (question, index) => `<div>
              <strong>${esc(question)}</strong>
              <p>${esc(answers[index] || 'No response')}</p>
            </div>`
          )
          .join('')}
      </section>`;
    })
    .join('');

  const quizRows = attempts
    .map((attempt) => {
      const module = snapshot.modules.find((item) => item.id === attempt.moduleId);
      return `<tr>
        <td>${esc(module?.title || 'Knowledge check')}</td>
        <td>${esc(attempt.attemptNumber)}</td>
        <td>${esc(attempt.scorePercent ?? 0)}%</td>
        <td><span class="leadership-status-chip ${attempt.passed ? 'good' : 'warn'}">${
          attempt.passed ? 'Passed' : 'Not passed'
        }</span></td>
        <td>${esc(new Date(attempt.submittedAt).toLocaleString())}</td>
      </tr>`;
    })
    .join('');

  return `<section class="leadership-participant-detail">
    <div class="leadership-participant-detail-header">
      <div>
        <p class="eyebrow">Participant record</p>
        <h3>${esc(employeeName(employee, enrollment.employeeId))}</h3>
        <p class="muted">${esc(employee?.department || '')}${
          employee?.position ? ` · ${esc(employee.position)}` : ''
        }</p>
      </div>
      <button class="button soft sm" type="button" data-leadership-close-participant>Close</button>
    </div>
    <div class="leadership-participant-summary-grid">
      <div><span>Assignment</span><strong>${esc(assignmentName(snapshot, enrollment))}</strong></div>
      <div><span>Status</span><strong>${esc(statusLabel(enrollment.status))}</strong></div>
      <div><span>Progress</span><strong>${esc(Math.round(enrollment.completionPercent))}%</strong></div>
      <div><span>Due date</span><strong>${esc(formatDate(enrollment.dueDate))}</strong></div>
    </div>
    ${
      canManage
        ? `<form class="leadership-enrollment-edit" data-leadership-enrollment-edit="${esc(
            enrollment.id
          )}">
            <label class="field">
              <span>Status</span>
              <select name="status">
                ${(
                  [
                    'not_started',
                    'in_progress',
                    'completed',
                    'overdue',
                    'paused',
                    'withdrawn',
                  ] as LeadershipEnrollmentStatus[]
                )
                  .map(
                    (status) =>
                      `<option value="${status}" ${
                        status === enrollment.status ? 'selected' : ''
                      }>${statusLabel(status)}</option>`
                  )
                  .join('')}
              </select>
            </label>
            <label class="field">
              <span>Due date</span>
              <input type="date" name="dueDate" value="${esc(enrollment.dueDate)}">
            </label>
            <label class="field leadership-enrollment-notes">
              <span>Notes</span>
              <textarea name="notes" rows="3">${esc(enrollment.notes)}</textarea>
            </label>
            <div class="leadership-participant-edit-actions">
              <button class="button primary sm" type="submit">Save enrollment</button>
              <button class="button danger sm" type="button" data-leadership-reset-progress="${esc(
                enrollment.id
              )}">Reset progress</button>
            </div>
          </form>`
        : ''
    }
    <section class="leadership-participant-section">
      <h4>Module progress</h4>
      <div class="leadership-module-status-list">
        ${modulesForEnrollment
          .map((module) => {
            const moduleProgress = progress.find((item) => item.moduleId === module.id);
            return `<div>
              <span>${esc(module.title)}</span>
              <span class="leadership-status-chip ${
                moduleProgress?.status === 'completed' ? 'good' : 'muted'
              }">${esc(statusLabel(moduleProgress?.status || 'not_started'))}</span>
            </div>`;
          })
          .join('') || '<p class="muted">No module progress recorded.</p>'}
      </div>
    </section>
    <section class="leadership-participant-section">
      <h4>Reflection responses</h4>
      ${reflectionSections || '<p class="muted">No reflection responses submitted.</p>'}
    </section>
    <section class="leadership-participant-section">
      <h4>Quiz results</h4>
      ${
        quizRows
          ? `<div class="table-wrap"><table>
              <thead><tr><th>Knowledge check</th><th>Attempt</th><th>Score</th><th>Result</th><th>Submitted</th></tr></thead>
              <tbody>${quizRows}</tbody>
            </table></div>`
          : '<p class="muted">No quiz attempts submitted.</p>'
      }
    </section>
  </section>`;
}

export function renderLeadershipParticipants(
  snapshot: LeadershipAcademyFoundationSnapshot,
  input: {
    canManage: boolean;
    showEnrollmentForm: boolean;
    selectedEnrollmentId: string | null;
    filters: LeadershipParticipantFilters;
  }
): string {
  const normalizedSearch = input.filters.search.trim().toLowerCase();
  const filteredEnrollments = snapshot.enrollments.filter((enrollment) => {
    const employee = snapshot.employees.find((item) => item.id === enrollment.employeeId);
    const haystack = [
      employeeName(employee, enrollment.employeeId),
      employee?.department || '',
      employee?.position || '',
      assignmentName(snapshot, enrollment),
    ]
      .join(' ')
      .toLowerCase();
    return (
      (!normalizedSearch || haystack.includes(normalizedSearch)) &&
      (!input.filters.status || enrollment.status === input.filters.status)
    );
  });
  const selected = snapshot.enrollments.find(
    (enrollment) => enrollment.id === input.selectedEnrollmentId
  );
  const overdueCount = snapshot.enrollments.filter(
    (enrollment) =>
      enrollment.status === 'overdue' ||
      (Boolean(enrollment.dueDate) &&
        enrollment.dueDate < new Date().toISOString().slice(0, 10) &&
        !['completed', 'withdrawn'].includes(enrollment.status))
  ).length;

  return `<div class="leadership-participants">
    <div class="leadership-participant-kpis">
      <div><span>Active participants</span><strong>${snapshot.enrollments.filter(
        (item) => !['withdrawn'].includes(item.status)
      ).length}</strong></div>
      <div><span>Completed</span><strong>${snapshot.enrollments.filter(
        (item) => item.status === 'completed'
      ).length}</strong></div>
      <div><span>Overdue</span><strong>${overdueCount}</strong></div>
      <div><span>Average progress</span><strong>${
        snapshot.enrollments.length
          ? Math.round(
              snapshot.enrollments.reduce(
                (total, enrollment) => total + enrollment.completionPercent,
                0
              ) / snapshot.enrollments.length
            )
          : 0
      }%</strong></div>
    </div>
    <div class="leadership-participant-toolbar">
      <input type="search" value="${esc(input.filters.search)}" placeholder="Search participants" aria-label="Search participants" data-leadership-participant-search>
      <select aria-label="Filter enrollment status" data-leadership-participant-status>
        <option value="">All statuses</option>
        ${(
          [
            'not_started',
            'in_progress',
            'completed',
            'overdue',
            'paused',
            'withdrawn',
          ] as LeadershipEnrollmentStatus[]
        )
          .map(
            (status) =>
              `<option value="${status}" ${
                input.filters.status === status ? 'selected' : ''
              }>${statusLabel(status)}</option>`
          )
          .join('')}
      </select>
      ${
        input.canManage
          ? '<button class="button primary" type="button" data-leadership-open-enrollment-form>+ Enroll participant</button>'
          : ''
      }
    </div>
    ${input.showEnrollmentForm && input.canManage ? renderEnrollmentForm(snapshot) : ''}
    <div class="table-wrap leadership-participant-table">
      <table>
        <thead><tr><th>Participant</th><th>Assignment</th><th>Status</th><th>Progress</th><th>Due date</th><th>Actions</th></tr></thead>
        <tbody>
          ${
            filteredEnrollments
              .map((enrollment) => {
                const employee = snapshot.employees.find(
                  (item) => item.id === enrollment.employeeId
                );
                return `<tr>
                  <td><strong>${esc(employeeName(employee, enrollment.employeeId))}</strong><small>${esc(
                    employee?.department || employee?.position || enrollment.employeeId
                  )}</small></td>
                  <td>${esc(assignmentName(snapshot, enrollment))}</td>
                  <td><span class="leadership-status-chip ${statusTone(
                    enrollment.status
                  )}">${esc(statusLabel(enrollment.status))}</span></td>
                  <td>${progressBar(enrollment.completionPercent)}</td>
                  <td>${esc(formatDate(enrollment.dueDate))}</td>
                  <td><button class="button soft sm" type="button" data-leadership-view-participant="${esc(
                    enrollment.id
                  )}">View</button></td>
                </tr>`;
              })
              .join('') ||
            '<tr><td colspan="6" class="empty">No participants match these filters.</td></tr>'
          }
        </tbody>
      </table>
    </div>
    ${selected ? renderParticipantDetail(snapshot, selected, input.canManage) : ''}
  </div>`;
}
