import {
  canManageLeadershipAcademy,
  canViewLeadershipAcademyOrg,
} from '../services/leadershipAcademyAccess';
import {
  createLeadershipEnrollment,
  fetchLeadershipAcademyFoundation,
  fetchLeadershipQuiz,
  markLeadershipLessonComplete,
  saveLeadershipAcknowledgment,
  saveLeadershipReflection,
  submitLeadershipQuiz,
  resetLeadershipEnrollmentProgress,
  updateLeadershipEnrollment,
} from '../data/leadershipAcademyStore';
import { switchMainView } from '../ui/navigation';
import {
  LEADERSHIP_ACADEMY_MODULE_VERSION,
  type LeadershipAcademyFoundationSnapshot,
  type LeadershipAcademyTab,
  type LeadershipEnrollment,
  type LeadershipModule,
  type LeadershipQuizQuestion,
} from '../types/leadershipAcademyTypes';
import {
  findLeadershipCompetency,
  findLeadershipCourse,
  findLeadershipModule,
  findLeadershipTier,
  renderLeadershipCompetenciesCatalog,
  renderLeadershipPhilosophyPanel,
  renderLeadershipProgramsCatalog,
} from './leadershipAcademyCatalog';
import {
  bindLeadershipAcademyEditorEvents,
  openLeadershipCompetencyEditor,
  openLeadershipCourseEditor,
  openLeadershipModuleEditor,
  openLeadershipPhilosophyEditor,
  openLeadershipTierEditor,
  setLeadershipEditorCatalog,
  setLeadershipEditorOnSaved,
} from './leadershipAcademyEditor';
import { renderLeadershipCoursePlayer } from './leadershipAcademyPlayer';
import {
  renderLeadershipParticipants,
  type LeadershipParticipantFilters,
} from './leadershipAcademyParticipants';

let activeTab: LeadershipAcademyTab = 'dashboard';
let moduleHydrated = false;
let bindingsReady = false;
let catalogBindingsReady = false;
let selectedCourseId: string | null = null;
let selectedPlayerModuleId: string | null = null;
let selectedParticipantEnrollmentId: string | null = null;
let showParticipantEnrollmentForm = false;
let participantFilters: LeadershipParticipantFilters = { search: '', status: '' };
let cachedFoundation: LeadershipAcademyFoundationSnapshot | null = null;
const quizQuestionsByModule = new Map<string, LeadershipQuizQuestion[]>();
const loadingQuizModules = new Set<string>();

function safeGet<T extends HTMLElement = HTMLElement>(id: string): T | null {
  if (typeof window.safeGet === 'function') {
    return window.safeGet(id) as T | null;
  }
  return document.getElementById(id) as T | null;
}

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

function setText(id: string, value: string): void {
  if (typeof window.setText === 'function') {
    window.setText(id, value);
    return;
  }
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function setHtml(id: string, html: string): void {
  const el = safeGet(id);
  if (el) el.innerHTML = html;
}

function showToast(message: string, type: 'success' | 'error' = 'success'): void {
  if (typeof window.showToast === 'function') {
    window.showToast(message, type);
    return;
  }
  console.log(`[${type}] ${message}`);
}

export function applyLeadershipAcademyAccessUi(): void {
  const canManage = canManageLeadershipAcademy();
  const canViewOrg = canViewLeadershipAcademyOrg();

  document.querySelectorAll('[data-leadership-academy-manage]').forEach((element) => {
    element.classList.toggle('hidden', !canManage);
  });

  document.querySelectorAll('[data-leadership-academy-org]').forEach((element) => {
    element.classList.toggle('hidden', !canViewOrg);
  });

  const readOnlyBanner = document.getElementById('leadershipAcademyReadOnlyBanner');
  if (readOnlyBanner) {
    readOnlyBanner.textContent = canViewOrg
      ? 'You can view organization progress. Program configuration requires HR admin access.'
      : 'Your assigned leadership courses and progress appear under My Development.';
    readOnlyBanner.classList.toggle('hidden', canManage);
  }

  document.querySelectorAll('[data-leadership-academy-tab]').forEach((button) => {
    const tab = String((button as HTMLElement).dataset.leadershipAcademyTab || '') as LeadershipAcademyTab;
    const manageTabs: LeadershipAcademyTab[] = [
      'programs',
      'participants',
      'workshops',
      'coaching',
      'goals',
      'competencies',
      'philosophy',
      'reports',
    ];
    const orgTabs: LeadershipAcademyTab[] = ['participants', 'workshops', 'coaching', 'goals', 'reports'];

    let allowed = true;
    if (manageTabs.includes(tab) && !canManage) {
      allowed = orgTabs.includes(tab) ? canViewOrg : false;
    }

    (button as HTMLElement).classList.toggle('hidden', !allowed);
    (button as HTMLButtonElement).disabled = !allowed;
  });
}

function renderActiveTabPanel(): void {
  document.querySelectorAll('[data-leadership-academy-panel]').forEach((panel) => {
    const panelTab = String((panel as HTMLElement).dataset.leadershipAcademyPanel || '');
    panel.classList.toggle('hidden', panelTab !== activeTab);
  });

  document.querySelectorAll('[data-leadership-academy-tab]').forEach((button) => {
    const tab = String((button as HTMLElement).dataset.leadershipAcademyTab || '');
    button.classList.toggle('active', tab === activeTab);
  });
}

function renderFoundationSummary(input: {
  tablesReady: boolean;
  tierCount: number;
  courseCount: number;
  competencyCount: number;
  enrollmentCount: number;
}): void {
  const statusEl = safeGet('leadershipAcademyFoundationStatus');
  if (!statusEl) return;

  if (!input.tablesReady) {
    statusEl.innerHTML =
      '<div class="leadership-academy-empty-state">' +
      '<p><strong>Database setup pending.</strong></p>' +
      '<p class="muted">Leadership Academy tables are not available yet. Run the latest Supabase migration, then refresh.</p>' +
      '</div>';
    return;
  }

  statusEl.innerHTML =
    '<div class="leadership-academy-summary-grid">' +
    `<div class="leadership-academy-summary-card"><div class="label">Program tiers</div><div class="value">${esc(input.tierCount)}</div></div>` +
    `<div class="leadership-academy-summary-card"><div class="label">Courses</div><div class="value">${esc(input.courseCount)}</div></div>` +
    `<div class="leadership-academy-summary-card"><div class="label">Competencies</div><div class="value">${esc(input.competencyCount)}</div></div>` +
    `<div class="leadership-academy-summary-card"><div class="label">Enrollments</div><div class="value">${esc(input.enrollmentCount)}</div></div>` +
    '</div>' +
    '<p class="muted leadership-academy-phase-note">Catalog authoring and the interactive Module 1 participant experience are ready for review.</p>';
}

function renderCatalogPanels(snapshot: LeadershipAcademyFoundationSnapshot): void {
  if (!canManageLeadershipAcademy()) return;
  setLeadershipEditorCatalog(snapshot);
  setHtml('leadershipAcademyProgramsBody', renderLeadershipProgramsCatalog(snapshot, selectedCourseId));
  setHtml('leadershipAcademyCompetenciesBody', renderLeadershipCompetenciesCatalog(snapshot.competencies));
  setHtml('leadershipAcademyPhilosophyBody', renderLeadershipPhilosophyPanel(snapshot.philosophy));
}

function renderParticipantPanel(snapshot: LeadershipAcademyFoundationSnapshot): void {
  setHtml(
    'leadershipAcademyParticipantsBody',
    renderLeadershipParticipants(snapshot, {
      canManage: canManageLeadershipAcademy(),
      showEnrollmentForm: showParticipantEnrollmentForm,
      selectedEnrollmentId: selectedParticipantEnrollmentId,
      filters: participantFilters,
    })
  );
}

function renderMyDevelopment(snapshot: LeadershipAcademyFoundationSnapshot): void {
  const previewMode = canManageLeadershipAcademy();
  const activeEnrollments = snapshot.enrollments.filter(
    (enrollment) => !['paused', 'withdrawn'].includes(enrollment.status)
  );
  const enrolledTierIds = new Set(
    activeEnrollments.map((enrollment) => enrollment.tierId).filter(Boolean)
  );
  const activeEnrollmentIds = new Set(activeEnrollments.map((enrollment) => enrollment.id));
  const assignedCourseIds = new Set(
    snapshot.courseAssignments
      .filter((assignment) => activeEnrollmentIds.has(assignment.enrollmentId))
      .map((assignment) => assignment.courseId)
  );
  const availableCourses = previewMode
    ? snapshot.courses
    : snapshot.courses.filter(
        (item) =>
          assignedCourseIds.has(item.id) ||
          Boolean(item.tierId && enrolledTierIds.has(item.tierId))
      );
  const course =
    availableCourses.find((item) => item.id === selectedCourseId) ||
    availableCourses.find((item) => item.title === 'What It Means to Lead at BTW') ||
    availableCourses[0] ||
    null;
  const activeModule =
    snapshot.modules.find((module) => module.id === selectedPlayerModuleId) ||
    snapshot.modules
      .filter((module) => module.courseId === course?.id)
      .sort((a, b) => a.displayOrder - b.displayOrder)[0] ||
    null;
  if (course) selectedCourseId = course.id;
  if (activeModule) selectedPlayerModuleId = activeModule.id;
  const assignedEnrollmentId = course
    ? snapshot.courseAssignments.find(
        (assignment) =>
          assignment.courseId === course.id &&
          activeEnrollmentIds.has(assignment.enrollmentId)
      )?.enrollmentId
    : null;
  const enrollment =
    (assignedEnrollmentId
      ? activeEnrollments.find((item) => item.id === assignedEnrollmentId)
      : course
        ? activeEnrollments.find((item) => item.tierId === course.tierId)
        : null) || null;
  setHtml(
    'leadershipAcademyMyDevelopmentBody',
    renderLeadershipCoursePlayer(snapshot, course, activeModule, previewMode, {
      enrollment,
      quizQuestions: activeModule ? quizQuestionsByModule.get(activeModule.id) : undefined,
    })
  );

  if (
    activeModule?.moduleType === 'quiz' &&
    !quizQuestionsByModule.has(activeModule.id) &&
    !loadingQuizModules.has(activeModule.id)
  ) {
    loadingQuizModules.add(activeModule.id);
    void fetchLeadershipQuiz(activeModule.id)
      .then((questions) => {
        quizQuestionsByModule.set(activeModule.id, questions);
        if (cachedFoundation) renderMyDevelopment(cachedFoundation);
      })
      .catch((error) => {
        console.error('[LeadershipAcademy] Quiz load failed:', error);
        showToast('Could not load the knowledge check.', 'error');
      })
      .finally(() => loadingQuizModules.delete(activeModule.id));
  }
}

function getActiveParticipantContext(): {
  enrollment: LeadershipEnrollment;
  module: LeadershipModule;
} | null {
  if (!cachedFoundation || canManageLeadershipAcademy()) return null;
  const module = cachedFoundation.modules.find((item) => item.id === selectedPlayerModuleId);
  if (!module) return null;
  const course = cachedFoundation.courses.find((item) => item.id === module.courseId);
  const enrollment = cachedFoundation.enrollments.find(
    (item) =>
      item.tierId === course?.tierId &&
      !['paused', 'withdrawn'].includes(item.status)
  );
  return enrollment ? { enrollment, module } : null;
}

async function refreshParticipantExperience(message: string): Promise<void> {
  showToast(message);
  await loadLeadershipAcademy(true);
}

function bindCatalogActionEvents(): void {
  if (catalogBindingsReady) return;
  catalogBindingsReady = true;

  const root = safeGet('leadershipAcademyTop');
  if (!root) return;

  root.addEventListener('click', (event) => {
    if (!cachedFoundation) return;
    const target = event.target as HTMLElement | null;
    if (!target) return;

    const openModule = target.closest('[data-leadership-open-module]') as HTMLElement | null;
    if (openModule) {
      selectedPlayerModuleId = String(openModule.dataset.leadershipOpenModule || '') || null;
      renderMyDevelopment(cachedFoundation);
      return;
    }

    const completeLesson = target.closest('[data-leadership-complete-lesson]');
    if (completeLesson) {
      const context = getActiveParticipantContext();
      if (!context) return;
      (completeLesson as HTMLButtonElement).disabled = true;
      void markLeadershipLessonComplete(context.enrollment.id, context.module.id)
        .then(() => refreshParticipantExperience('Lesson completed.'))
        .catch((error) => {
          console.error(
            `[LeadershipAcademy] Lesson completion failed: ${
              error instanceof Error ? error.message : JSON.stringify(error)
            }`
          );
          (completeLesson as HTMLButtonElement).disabled = false;
          showToast('Could not save lesson completion.', 'error');
        });
      return;
    }

    if (target.closest('[data-leadership-open-enrollment-form]')) {
      showParticipantEnrollmentForm = true;
      renderParticipantPanel(cachedFoundation);
      return;
    }

    if (target.closest('[data-leadership-close-enrollment-form]')) {
      showParticipantEnrollmentForm = false;
      renderParticipantPanel(cachedFoundation);
      return;
    }

    const viewParticipant = target.closest(
      '[data-leadership-view-participant]'
    ) as HTMLElement | null;
    if (viewParticipant) {
      selectedParticipantEnrollmentId =
        String(viewParticipant.dataset.leadershipViewParticipant || '') || null;
      renderParticipantPanel(cachedFoundation);
      return;
    }

    if (target.closest('[data-leadership-close-participant]')) {
      selectedParticipantEnrollmentId = null;
      renderParticipantPanel(cachedFoundation);
      return;
    }

    const resetProgress = target.closest(
      '[data-leadership-reset-progress]'
    ) as HTMLButtonElement | null;
    if (resetProgress) {
      if (!canManageLeadershipAcademy()) return;
      const enrollmentId = String(resetProgress.dataset.leadershipResetProgress || '');
      if (!enrollmentId) return;
      if (
        !window.confirm(
          'Reset all module progress, reflection responses, acknowledgments, and quiz attempts for this enrollment?'
        )
      ) {
        return;
      }
      resetProgress.disabled = true;
      void resetLeadershipEnrollmentProgress(enrollmentId)
        .then(async () => {
          showToast('Participant progress reset.');
          await loadLeadershipAcademy(true);
        })
        .catch((error) => {
          console.error('[LeadershipAcademy] Progress reset failed:', error);
          resetProgress.disabled = false;
          showToast('Could not reset participant progress.', 'error');
        });
      return;
    }

    if (!canManageLeadershipAcademy()) return;

    const previewCourse = target.closest('[data-leadership-preview-course]') as HTMLElement | null;
    if (previewCourse) {
      selectedCourseId = String(previewCourse.dataset.leadershipPreviewCourse || '') || null;
      selectedPlayerModuleId = null;
      activeTab = 'my-development';
      renderMyDevelopment(cachedFoundation);
      renderActiveTabPanel();
      return;
    }

    const tierEdit = target.closest('[data-leadership-edit-tier]') as HTMLElement | null;
    if (tierEdit) {
      const tier = findLeadershipTier(cachedFoundation, String(tierEdit.dataset.leadershipEditTier || ''));
      if (tier) openLeadershipTierEditor(tier);
      return;
    }

    const addCourse = target.closest('[data-leadership-add-course]') as HTMLElement | null;
    if (addCourse) {
      openLeadershipCourseEditor(null, String(addCourse.dataset.leadershipAddCourse || ''));
      return;
    }

    const courseEdit = target.closest('[data-leadership-edit-course]') as HTMLElement | null;
    if (courseEdit) {
      const course = findLeadershipCourse(
        cachedFoundation,
        String(courseEdit.dataset.leadershipEditCourse || '')
      );
      if (course) openLeadershipCourseEditor(course);
      return;
    }

    const selectCourse = target.closest('[data-leadership-select-course]') as HTMLElement | null;
    if (selectCourse) {
      selectedCourseId = String(selectCourse.dataset.leadershipSelectCourse || '') || null;
      renderCatalogPanels(cachedFoundation);
      return;
    }

    const addModule = target.closest('[data-leadership-add-module]') as HTMLElement | null;
    if (addModule) {
      openLeadershipModuleEditor(null, String(addModule.dataset.leadershipAddModule || ''));
      return;
    }

    const moduleEdit = target.closest('[data-leadership-edit-module]') as HTMLElement | null;
    if (moduleEdit) {
      const module = findLeadershipModule(
        cachedFoundation,
        String(moduleEdit.dataset.leadershipEditModule || '')
      );
      if (module) openLeadershipModuleEditor(module);
      return;
    }

    const competencyEdit = target.closest('[data-leadership-edit-competency]') as HTMLElement | null;
    if (competencyEdit) {
      const competency = findLeadershipCompetency(
        cachedFoundation,
        String(competencyEdit.dataset.leadershipEditCompetency || '')
      );
      if (competency) openLeadershipCompetencyEditor(competency);
    }

    if (target.id === 'leadershipAddTierBtn') {
      openLeadershipTierEditor(null);
      return;
    }
    if (target.id === 'leadershipAddCourseBtn') {
      openLeadershipCourseEditor(null, selectedCourseId ? findLeadershipCourse(cachedFoundation, selectedCourseId)?.tierId : null);
      return;
    }
    if (target.id === 'leadershipAddCompetencyBtn') {
      openLeadershipCompetencyEditor(null);
      return;
    }
    if (target.id === 'leadershipCreatePhilosophyBtn' || target.id === 'leadershipEditPhilosophyBtn') {
      openLeadershipPhilosophyEditor(cachedFoundation.philosophy);
    }
  });

  root.addEventListener('submit', (event) => {
    const form = event.target as HTMLFormElement | null;
    if (!form) return;
    const context = getActiveParticipantContext();

    if (form.matches('[data-leadership-enrollment-form]')) {
      event.preventDefault();
      if (!canManageLeadershipAcademy()) return;
      const data = new FormData(form);
      const employeeId = String(data.get('employeeId') || '').trim();
      const assignment = String(data.get('assignment') || '').trim();
      const dueDate = String(data.get('dueDate') || '').trim();
      const notes = String(data.get('notes') || '').trim();
      const [assignmentType, assignmentId] = assignment.split(':', 2);
      if (!employeeId || !assignmentId || !['tier', 'course'].includes(assignmentType)) {
        showToast('Select an employee and assignment.', 'error');
        return;
      }
      const button = form.querySelector('button[type="submit"]') as HTMLButtonElement | null;
      if (button) button.disabled = true;
      void createLeadershipEnrollment({
        employeeId,
        tierId: assignmentType === 'tier' ? assignmentId : null,
        courseId: assignmentType === 'course' ? assignmentId : null,
        dueDate: dueDate || null,
        notes,
      })
        .then(async (enrollmentId) => {
          selectedParticipantEnrollmentId = enrollmentId;
          showParticipantEnrollmentForm = false;
          showToast('Participant enrolled.');
          await loadLeadershipAcademy(true);
        })
        .catch((error) => {
          console.error('[LeadershipAcademy] Enrollment failed:', error);
          if (button) button.disabled = false;
          showToast(error?.message || 'Could not enroll participant.', 'error');
        });
      return;
    }

    const enrollmentEdit = form.matches('[data-leadership-enrollment-edit]')
      ? form
      : null;
    if (enrollmentEdit) {
      event.preventDefault();
      if (!canManageLeadershipAcademy()) return;
      const enrollmentId = String(enrollmentEdit.dataset.leadershipEnrollmentEdit || '');
      const data = new FormData(form);
      const status = String(data.get('status') || '') as LeadershipEnrollment['status'];
      const dueDate = String(data.get('dueDate') || '').trim();
      const notes = String(data.get('notes') || '').trim();
      const button = form.querySelector('button[type="submit"]') as HTMLButtonElement | null;
      if (button) button.disabled = true;
      void updateLeadershipEnrollment({
        enrollmentId,
        status,
        dueDate: dueDate || null,
        notes,
      })
        .then(async () => {
          showToast('Enrollment updated.');
          await loadLeadershipAcademy(true);
        })
        .catch((error) => {
          console.error('[LeadershipAcademy] Enrollment update failed:', error);
          if (button) button.disabled = false;
          showToast('Could not update enrollment.', 'error');
        });
      return;
    }

    if (!context) return;

    if (form.matches('[data-leadership-reflection-form]')) {
      event.preventDefault();
      const questions = Array.isArray(context.module.completionRequirements.questions)
        ? context.module.completionRequirements.questions
        : [];
      const data = new FormData(form);
      const answers = questions.map((_, index) =>
        String(data.get(`reflection-${index}`) || '').trim()
      );
      if (answers.some((answer) => !answer)) {
        showToast('Please answer every reflection question.', 'error');
        return;
      }
      const button = form.querySelector('button[type="submit"]') as HTMLButtonElement | null;
      if (button) button.disabled = true;
      void saveLeadershipReflection(context.enrollment.id, context.module.id, answers)
        .then(() => refreshParticipantExperience('Reflection saved.'))
        .catch((error) => {
          console.error('[LeadershipAcademy] Reflection save failed:', error);
          if (button) button.disabled = false;
          showToast('Could not save the reflection.', 'error');
        });
      return;
    }

    if (form.matches('[data-leadership-acknowledgment-form]')) {
      event.preventDefault();
      const data = new FormData(form);
      if (data.get('acknowledged') !== 'on') {
        showToast('Please select the acknowledgment checkbox.', 'error');
        return;
      }
      const button = form.querySelector('button[type="submit"]') as HTMLButtonElement | null;
      if (button) button.disabled = true;
      void saveLeadershipAcknowledgment(context.enrollment.id, context.module.id)
        .then(() => refreshParticipantExperience('Acknowledgment completed.'))
        .catch((error) => {
          console.error('[LeadershipAcademy] Acknowledgment save failed:', error);
          if (button) button.disabled = false;
          showToast('Could not save the acknowledgment.', 'error');
        });
      return;
    }

    if (form.matches('[data-leadership-quiz-form]')) {
      event.preventDefault();
      const questions = quizQuestionsByModule.get(context.module.id) || [];
      const data = new FormData(form);
      const responses = questions.map((question) => {
        const value = String(data.get(`quiz-${question.id}`) || '').trim();
        return question.type === 'short_answer'
          ? { questionId: question.id, text: value }
          : { questionId: question.id, optionId: value };
      });
      if (responses.some((response) => !response.optionId && !response.text)) {
        showToast('Please answer every knowledge-check question.', 'error');
        return;
      }
      const button = form.querySelector('button[type="submit"]') as HTMLButtonElement | null;
      if (button) button.disabled = true;
      void submitLeadershipQuiz(context.enrollment.id, context.module.id, responses)
        .then((result) =>
          refreshParticipantExperience(
            result.passed
              ? `Knowledge check passed with ${result.scorePercent}%.`
              : `Score: ${result.scorePercent}%. An 80% score is required...please try again.`
          )
        )
        .catch((error) => {
          console.error('[LeadershipAcademy] Quiz submission failed:', error);
          if (button) button.disabled = false;
          showToast('Could not submit the knowledge check.', 'error');
        });
    }
  });

  root.addEventListener('input', (event) => {
    if (!cachedFoundation) return;
    const target = event.target as HTMLInputElement | null;
    if (!target?.matches('[data-leadership-participant-search]')) return;
    participantFilters = { ...participantFilters, search: target.value };
    renderParticipantPanel(cachedFoundation);
    const replacement = root.querySelector(
      '[data-leadership-participant-search]'
    ) as HTMLInputElement | null;
    replacement?.focus();
    replacement?.setSelectionRange(replacement.value.length, replacement.value.length);
  });

  root.addEventListener('change', (event) => {
    if (!cachedFoundation) return;
    const target = event.target as HTMLSelectElement | null;
    if (!target?.matches('[data-leadership-participant-status]')) return;
    participantFilters = { ...participantFilters, status: target.value };
    renderParticipantPanel(cachedFoundation);
  });
}

function bindLeadershipAcademyEvents(): void {
  if (bindingsReady) return;
  bindingsReady = true;

  setLeadershipEditorOnSaved(() => {
    void loadLeadershipAcademy(true);
  });
  bindLeadershipAcademyEditorEvents();
  bindCatalogActionEvents();

  document.getElementById('refreshLeadershipAcademyBtn')?.addEventListener('click', () => {
    void loadLeadershipAcademy(true);
  });

  document.querySelectorAll('[data-leadership-academy-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      const tab = String((button as HTMLElement).dataset.leadershipAcademyTab || '') as LeadershipAcademyTab;
      if (!tab || (button as HTMLButtonElement).disabled) return;
      activeTab = tab;
      renderActiveTabPanel();
    });
  });
}

export async function loadLeadershipAcademy(force = false): Promise<void> {
  applyLeadershipAcademyAccessUi();
  bindLeadershipAcademyEvents();

  if (moduleHydrated && !force) {
    renderActiveTabPanel();
    return;
  }

  setText('leadershipAcademyFoundationStatus', 'Loading Leadership Academy…');

  try {
    const foundation = await fetchLeadershipAcademyFoundation(force);
    cachedFoundation = foundation;

    renderFoundationSummary({
      tablesReady: foundation.tablesReady,
      tierCount: foundation.tiers.length,
      courseCount: foundation.courses.length,
      competencyCount: foundation.competencies.length,
      enrollmentCount: foundation.enrollments.length,
    });
    renderCatalogPanels(foundation);
    renderParticipantPanel(foundation);
    renderMyDevelopment(foundation);

    setText(
      'leadershipAcademyModuleVersion',
      `Module ${LEADERSHIP_ACADEMY_MODULE_VERSION}${foundation.tablesReady ? '' : ' · tables pending'}`
    );

    moduleHydrated = true;
    renderActiveTabPanel();
  } catch (err) {
    console.error('[LeadershipAcademy] Load failed:', err);
    setText('leadershipAcademyFoundationStatus', 'Could not load Leadership Academy.');
    showToast('Could not load Leadership Academy.', 'error');
  }
}

export function ensureLeadershipAcademyLoaded(force = false): void {
  applyLeadershipAcademyAccessUi();
  void loadLeadershipAcademy(force);
}

export function openLeadershipAcademyView(tab: LeadershipAcademyTab = 'dashboard'): void {
  activeTab = tab;
  switchMainView('leadershipAcademyView');
  ensureLeadershipAcademyLoaded(true);
}

const globalRef = globalThis as typeof globalThis & {
  loadLeadershipAcademy?: typeof loadLeadershipAcademy;
  ensureLeadershipAcademyLoaded?: typeof ensureLeadershipAcademyLoaded;
  openLeadershipAcademyView?: typeof openLeadershipAcademyView;
  applyLeadershipAcademyAccessUi?: typeof applyLeadershipAcademyAccessUi;
};

globalRef.loadLeadershipAcademy = loadLeadershipAcademy;
globalRef.ensureLeadershipAcademyLoaded = ensureLeadershipAcademyLoaded;
globalRef.openLeadershipAcademyView = openLeadershipAcademyView;
globalRef.applyLeadershipAcademyAccessUi = applyLeadershipAcademyAccessUi;
