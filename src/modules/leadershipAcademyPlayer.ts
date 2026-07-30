import type {
  LeadershipAcademyFoundationSnapshot,
  LeadershipCourse,
  LeadershipEnrollment,
  LeadershipModule,
  LeadershipQuizQuestion,
} from '../types/leadershipAcademyTypes';

function esc(value: unknown): string {
  if (typeof window.esc === 'function') return window.esc(value);
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderLeadershipLessonContent(content: string): string {
  const lines = String(content || '').split(/\r?\n/);
  const html: string[] = [];
  let listOpen = false;

  const closeList = () => {
    if (listOpen) html.push('</ul>');
    listOpen = false;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      closeList();
      continue;
    }
    if (line.startsWith('### ')) {
      closeList();
      html.push(`<h4>${esc(line.slice(4))}</h4>`);
      continue;
    }
    if (line.startsWith('## ')) {
      closeList();
      html.push(`<h3>${esc(line.slice(3))}</h3>`);
      continue;
    }
    if (line.startsWith('# ')) {
      closeList();
      html.push(`<h2>${esc(line.slice(2))}</h2>`);
      continue;
    }
    if (line.startsWith('* ') || line.startsWith('- ')) {
      if (!listOpen) html.push('<ul>');
      listOpen = true;
      html.push(`<li>${esc(line.slice(2))}</li>`);
      continue;
    }
    if (line.startsWith('> ')) {
      closeList();
      html.push(`<blockquote>${esc(line.slice(2))}</blockquote>`);
      continue;
    }
    closeList();
    html.push(`<p>${esc(line)}</p>`);
  }
  closeList();
  return html.join('');
}

function moduleButton(
  module: LeadershipModule,
  activeModuleId: string | null,
  completed: boolean
): string {
  const active = module.id === activeModuleId ? ' active' : '';
  const completeClass = completed ? ' completed' : '';
  return `<button class="leadership-player-module${active}" type="button" data-leadership-open-module="${esc(module.id)}">
    <span class="leadership-player-module-order${completeClass}">${completed ? '✓' : esc(module.displayOrder)}</span>
    <span><strong>${esc(module.title)}</strong><small>${esc(module.estimatedMinutes || 0)} minutes · ${esc(module.moduleType)}</small></span>
  </button>`;
}

function reflectionForm(module: LeadershipModule, answers: string[], completed: boolean): string {
  const questions = Array.isArray(module.completionRequirements.questions)
    ? module.completionRequirements.questions.map(String)
    : [];
  return `<form class="leadership-interactive-form" data-leadership-reflection-form>
    ${questions
      .map(
        (question, index) => `<label class="leadership-form-question">
          <span>${index + 1}. ${esc(question)}</span>
          <textarea name="reflection-${index}" rows="4" required>${esc(answers[index] || '')}</textarea>
        </label>`
      )
      .join('')}
    <div class="leadership-player-actions">
      <button class="button primary" type="submit">${completed ? 'Update reflection' : 'Save reflection'}</button>
    </div>
  </form>`;
}

export function renderLeadershipQuizForm(
  questions: LeadershipQuizQuestion[],
  completed: boolean
): string {
  if (!questions.length) {
    return '<div class="leadership-academy-empty-state"><p class="muted">Knowledge check questions are loading…</p></div>';
  }
  return `<form class="leadership-interactive-form" data-leadership-quiz-form>
    ${questions
      .map(
        (question, index) => `<fieldset class="leadership-quiz-question">
          <legend>${index + 1}. ${esc(question.prompt)}</legend>
          ${
            question.type === 'short_answer'
              ? `<textarea name="quiz-${esc(question.id)}" rows="3" required></textarea>`
              : question.options
                  .map(
                    (option) => `<label class="leadership-quiz-option">
                      <input type="radio" name="quiz-${esc(question.id)}" value="${esc(option.id)}" required>
                      <span>${esc(option.text)}</span>
                    </label>`
                  )
                  .join('')
          }
        </fieldset>`
      )
      .join('')}
    <div class="leadership-player-actions">
      <button class="button primary" type="submit">${completed ? 'Retake knowledge check' : 'Submit knowledge check'}</button>
    </div>
  </form>`;
}

function acknowledgmentForm(module: LeadershipModule, completed: boolean): string {
  const statement = String(module.completionRequirements.statement || '');
  return `<form class="leadership-interactive-form" data-leadership-acknowledgment-form>
    <label class="leadership-acknowledgment">
      <input type="checkbox" name="acknowledged" required ${completed ? 'checked' : ''}>
      <span>${esc(statement)}</span>
    </label>
    <div class="leadership-player-actions">
      <button class="button primary" type="submit">${completed ? 'Acknowledged' : 'Complete acknowledgment'}</button>
    </div>
  </form>`;
}

export type LeadershipCoursePlayerContext = {
  enrollment: LeadershipEnrollment | null;
  quizQuestions?: LeadershipQuizQuestion[];
};

export function renderLeadershipCoursePlayer(
  snapshot: LeadershipAcademyFoundationSnapshot,
  course: LeadershipCourse | null,
  activeModule: LeadershipModule | null,
  previewMode: boolean,
  context: LeadershipCoursePlayerContext = { enrollment: null }
): string {
  if (!course) {
    return `<div class="leadership-academy-empty-state">
      <p><strong>No leadership course is assigned yet.</strong></p>
      <p class="muted">Assigned courses will appear here after enrollment.</p>
    </div>`;
  }

  const modules = snapshot.modules
    .filter((module) => module.courseId === course.id)
    .sort((a, b) => a.displayOrder - b.displayOrder);
  const selected = activeModule || modules[0] || null;
  const enrollment = context.enrollment;
  const progress = enrollment
    ? snapshot.moduleProgress.filter((item) => item.enrollmentId === enrollment.id)
    : [];
  const completedModuleIds = new Set(
    progress.filter((item) => item.status === 'completed').map((item) => item.moduleId)
  );
  const completedCount = modules.filter((module) => completedModuleIds.has(module.id)).length;
  const coursePercent = modules.length ? Math.round((completedCount / modules.length) * 100) : 0;
  const selectedCompleted = selected ? completedModuleIds.has(selected.id) : false;
  const submission =
    enrollment && selected
      ? snapshot.moduleSubmissions.find(
          (item) => item.enrollmentId === enrollment.id && item.moduleId === selected.id
        )
      : null;
  const reflectionAnswers = Array.isArray(submission?.response.answers)
    ? submission.response.answers.map(String)
    : [];
  const latestAttempt =
    enrollment && selected
      ? snapshot.quizAttempts.find(
          (item) => item.enrollmentId === enrollment.id && item.moduleId === selected.id
        )
      : null;

  let interaction = '';
  if (selected) {
    if (previewMode) {
      interaction = `<div class="leadership-player-actions">
        <button class="button primary" type="button" disabled>Preview only</button>
      </div>`;
    } else if (!enrollment) {
      interaction = `<div class="alert info">Enrollment is required before this module can be completed.</div>`;
    } else if (selected.moduleType === 'reflection') {
      interaction = reflectionForm(selected, reflectionAnswers, selectedCompleted);
    } else if (selected.moduleType === 'quiz') {
      interaction = `${
        latestAttempt
          ? `<div class="alert ${latestAttempt.passed ? 'success' : 'warning'}">
              Latest score: ${esc(latestAttempt.scorePercent ?? 0)}% · ${latestAttempt.passed ? 'Passed' : 'Retake required'}
            </div>`
          : ''
      }${renderLeadershipQuizForm(context.quizQuestions || [], selectedCompleted)}`;
    } else if (selected.moduleType === 'acknowledgment') {
      interaction = acknowledgmentForm(selected, selectedCompleted);
    } else {
      interaction = `<div class="leadership-player-actions">
        <button class="button primary" type="button" data-leadership-complete-lesson ${
          selectedCompleted ? 'disabled' : ''
        }>${selectedCompleted ? 'Completed' : 'Mark lesson complete'}</button>
      </div>`;
    }
  }

  return `<div class="leadership-player">
    <aside class="leadership-player-sidebar">
      <div class="leadership-player-course-heading">
        <span class="leadership-player-icon">${esc(course.coverIcon || '◆')}</span>
        <div>
          <h3>${esc(course.title)}</h3>
          <p>${esc(course.estimatedMinutes || 0)} minutes</p>
        </div>
      </div>
      ${previewMode ? '<div class="alert info">Administrator preview</div>' : ''}
      <div class="leadership-course-progress">
        <div><span>Course progress</span><strong>${esc(coursePercent)}%</strong></div>
        <div class="leadership-progress-track"><span style="width:${esc(coursePercent)}%"></span></div>
      </div>
      <div class="leadership-player-module-list">
        ${modules
          .map((module) =>
            moduleButton(module, selected?.id || null, completedModuleIds.has(module.id))
          )
          .join('')}
      </div>
    </aside>
    <article class="leadership-player-lesson">
      ${
        selected
          ? `<div class="leadership-player-lesson-meta">
              <span>Module ${esc(selected.displayOrder)}</span>
              <span>${esc(selected.estimatedMinutes || 0)} minutes</span>
            </div>
            <h2>${esc(selected.title)}</h2>
            ${selectedCompleted ? '<div class="leadership-complete-banner">✓ Completed</div>' : ''}
            <div class="leadership-player-content">${renderLeadershipLessonContent(selected.instructions)}</div>
            ${interaction}`
          : '<div class="leadership-academy-empty-state"><p class="muted">This course has no modules yet.</p></div>'
      }
    </article>
  </div>`;
}
