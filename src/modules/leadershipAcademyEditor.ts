import {
  deleteLeadershipCompetency,
  deleteLeadershipCourse,
  deleteLeadershipModule,
  deleteLeadershipProgramTier,
  recordLeadershipAcademyAuditEvent,
  resolveLeadershipAcademyActorEmail,
  upsertLeadershipCompetency,
  upsertLeadershipCourse,
  upsertLeadershipModule,
  upsertLeadershipPhilosophy,
  upsertLeadershipProgramTier,
} from '../data/leadershipAcademyStore';
import {
  applySharedDrawerOpenStyles,
  isAnySiblingModuleDrawerOpen,
  unlockBodyScrollIfIdle,
} from '../mobile/mobileOverlays';
import { canManageLeadershipAcademy } from '../services/leadershipAcademyAccess';
import { showOrbisConfirm } from '../ui/confirmModal';
import type {
  LeadershipAcademyFoundationSnapshot,
  LeadershipCompetency,
  LeadershipCourse,
  LeadershipCourseStatus,
  LeadershipModule,
  LeadershipModuleType,
  LeadershipPhilosophyContent,
  LeadershipProgramTier,
  LeadershipRecordStatus,
} from '../types/leadershipAcademyTypes';

export type LeadershipEditorMode = 'tier' | 'course' | 'module' | 'competency' | 'philosophy';

type EditorState = {
  mode: LeadershipEditorMode;
  recordId: string | null;
  parentId?: string;
};

let editorState: EditorState | null = null;
let onSavedCallback: (() => void) | null = null;
let catalogSnapshot: LeadershipAcademyFoundationSnapshot | null = null;

function safeGet<T extends HTMLElement = HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function showToast(message: string, type: 'success' | 'error' = 'success'): void {
  if (typeof window.showToast === 'function') {
    window.showToast(message, type);
    return;
  }
  console.log(`[${type}] ${message}`);
}

function readInput(id: string): string {
  const el = safeGet<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(id);
  return String(el?.value ?? '').trim();
}

function readCheckbox(id: string): boolean {
  return Boolean(safeGet<HTMLInputElement>(id)?.checked);
}

function readNumberInput(id: string): number | null {
  const raw = readInput(id);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function setInput(id: string, value: string | number | boolean): void {
  const el = safeGet<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(id);
  if (!el) return;
  if (el instanceof HTMLInputElement && el.type === 'checkbox') {
    el.checked = Boolean(value);
    return;
  }
  el.value = String(value ?? '');
}

function hideAllEditorFieldGroups(): void {
  [
    'leadershipEditorTierFields',
    'leadershipEditorCourseFields',
    'leadershipEditorModuleFields',
    'leadershipEditorCompetencyFields',
    'leadershipEditorPhilosophyFields',
  ].forEach((id) => safeGet(id)?.classList.add('hidden'));
}

function assertCanMutateLeadershipEditor(): boolean {
  if (!canManageLeadershipAcademy()) {
    showToast('HR admin access is required to change Leadership Academy catalog records.', 'error');
    return false;
  }
  return Boolean(editorState);
}

function setDrawerOpen(open: boolean): void {
  const drawer = safeGet<HTMLElement>('leadershipAcademyDrawer');
  if (!drawer) {
    if (open) showToast('Leadership Academy editor drawer is not available.', 'error');
    return;
  }

  const backdrop = safeGet('drawerBackdrop');
  if (open) {
    applySharedDrawerOpenStyles(drawer, backdrop, {
      desktopMaxWidth: 'min(760px, 94vw)',
      drawerId: 'leadershipAcademyDrawer',
    });
    drawer.classList.remove('hidden');
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    return;
  }

  drawer.classList.remove('open');
  drawer.classList.add('hidden');
  drawer.setAttribute('aria-hidden', 'true');
  drawer.removeAttribute('style');

  const anotherDrawerOpen = isAnySiblingModuleDrawerOpen('leadershipAcademyDrawer');
  if (backdrop && !anotherDrawerOpen) {
    backdrop.classList.remove('open');
    backdrop.classList.add('hidden');
    backdrop.setAttribute('aria-hidden', 'true');
    backdrop.removeAttribute('style');
  }
  unlockBodyScrollIfIdle();
}

function setDrawerHeader(title: string, subtitle: string): void {
  const titleEl = safeGet('leadershipAcademyDrawerTitle');
  const subEl = safeGet('leadershipAcademyDrawerSub');
  if (titleEl) titleEl.textContent = title;
  if (subEl) subEl.textContent = subtitle;
  const cardTitle = safeGet('leadershipEditorCardTitle');
  if (cardTitle) cardTitle.textContent = title;
}

function populateTierSelect(selectedId = ''): void {
  const select = safeGet<HTMLSelectElement>('leadershipCourseTierInput');
  if (!select) return;
  const tiers = catalogSnapshot?.tiers || [];
  select.innerHTML =
    '<option value="">No tier</option>' +
    tiers
      .map(
        (tier) =>
          `<option value="${tier.id}"${tier.id === selectedId ? ' selected' : ''}>${tier.name}</option>`
      )
      .join('');
}

function populateCourseSelect(selectedId = ''): void {
  const select = safeGet<HTMLSelectElement>('leadershipModuleCourseInput');
  if (!select) return;
  const courses = catalogSnapshot?.courses || [];
  select.innerHTML =
    '<option value="">Select course</option>' +
    courses
      .map(
        (course) =>
          `<option value="${course.id}"${course.id === selectedId ? ' selected' : ''}>${course.title}</option>`
      )
      .join('');
}

function populateCompetencyTierCheckboxes(selectedIds: string[] = []): void {
  const container = safeGet('leadershipCompetencyTierChecks');
  if (!container) return;
  const tiers = catalogSnapshot?.tiers || [];
  if (!tiers.length) {
    container.innerHTML = '<p class="muted">Add program tiers first.</p>';
    return;
  }
  container.innerHTML = tiers
    .map(
      (tier) =>
        `<label class="leadership-tier-check"><input type="checkbox" value="${tier.id}"${
          selectedIds.includes(tier.id) ? ' checked' : ''
        } /> ${tier.name}</label>`
    )
    .join('');
}

function readCompetencyTierIds(): string[] {
  const container = safeGet('leadershipCompetencyTierChecks');
  if (!container) return [];
  return Array.from(container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]:checked')).map(
    (input) => input.value
  );
}

function notifySaved(): void {
  onSavedCallback?.();
}

export function setLeadershipEditorCatalog(snapshot: LeadershipAcademyFoundationSnapshot): void {
  catalogSnapshot = snapshot;
}

export function setLeadershipEditorOnSaved(callback: (() => void) | null): void {
  onSavedCallback = callback;
}

export function closeLeadershipAcademyDrawer(): void {
  editorState = null;
  setDrawerOpen(false);
}

function openEditor(mode: LeadershipEditorMode, title: string, subtitle: string): void {
  hideAllEditorFieldGroups();
  const deleteBtn = safeGet<HTMLButtonElement>('deleteLeadershipAcademyBtn');
  if (deleteBtn) {
    deleteBtn.classList.toggle('hidden', mode === 'philosophy');
  }

  const fieldGroupId = {
    tier: 'leadershipEditorTierFields',
    course: 'leadershipEditorCourseFields',
    module: 'leadershipEditorModuleFields',
    competency: 'leadershipEditorCompetencyFields',
    philosophy: 'leadershipEditorPhilosophyFields',
  }[mode];
  safeGet(fieldGroupId)?.classList.remove('hidden');

  setDrawerHeader(title, subtitle);
  setDrawerOpen(true);
}

export function openLeadershipTierEditor(tier: LeadershipProgramTier | null): void {
  if (!canManageLeadershipAcademy()) return;
  editorState = { mode: 'tier', recordId: tier?.id || null };
  openEditor('tier', tier ? 'Edit Program Tier' : 'New Program Tier', 'Leadership Academy · Catalog');
  setInput('leadershipTierNameInput', tier?.name || '');
  setInput('leadershipTierAudienceInput', tier?.intendedAudience || '');
  setInput('leadershipTierDescriptionInput', tier?.description || '');
  setInput('leadershipTierRequirementsInput', tier?.completionRequirements || '');
  setInput('leadershipTierHoursInput', tier?.estimatedHours ?? '');
  setInput('leadershipTierOrderInput', tier?.displayOrder ?? 0);
  setInput('leadershipTierStatusInput', tier?.status || 'active');
}

export function openLeadershipCourseEditor(
  course: LeadershipCourse | null,
  tierId?: string | null
): void {
  if (!canManageLeadershipAcademy()) return;
  editorState = { mode: 'course', recordId: course?.id || null, parentId: tierId || course?.tierId || undefined };
  populateTierSelect(course?.tierId || tierId || '');
  openEditor('course', course ? 'Edit Course' : 'New Course', 'Leadership Academy · Catalog');
  setInput('leadershipCourseTitleInput', course?.title || '');
  setInput('leadershipCourseDescriptionInput', course?.description || '');
  setInput('leadershipCourseStatusInput', course?.status || 'draft');
  setInput('leadershipCourseRequiredInput', course?.isRequired ?? true);
  setInput('leadershipCourseMinutesInput', course?.estimatedMinutes ?? '');
  setInput('leadershipCourseOrderInput', course?.displayOrder ?? 0);
  setInput('leadershipCoursePassingInput', course?.passingScorePercent ?? '');
  setInput('leadershipCourseDueDaysInput', course?.dueRuleDays ?? '');
  setInput('leadershipCourseIconInput', course?.coverIcon || '');
}

export function openLeadershipModuleEditor(
  module: LeadershipModule | null,
  courseId?: string | null
): void {
  if (!canManageLeadershipAcademy()) return;
  editorState = {
    mode: 'module',
    recordId: module?.id || null,
    parentId: courseId || module?.courseId || undefined,
  };
  populateCourseSelect(module?.courseId || courseId || '');
  openEditor('module', module ? 'Edit Module' : 'New Module', 'Leadership Academy · Catalog');
  setInput('leadershipModuleTitleInput', module?.title || '');
  setInput('leadershipModuleInstructionsInput', module?.instructions || '');
  setInput('leadershipModuleTypeInput', module?.moduleType || 'written');
  setInput('leadershipModuleRequiredInput', module?.isRequired ?? true);
  setInput('leadershipModuleMinutesInput', module?.estimatedMinutes ?? '');
  setInput('leadershipModuleOrderInput', module?.displayOrder ?? 0);
  setInput('leadershipModuleResourceInput', module?.resourceUrl || '');
  setInput('leadershipModuleRetakesInput', module?.allowRetakes ?? false);
}

export function openLeadershipCompetencyEditor(competency: LeadershipCompetency | null): void {
  if (!canManageLeadershipAcademy()) return;
  editorState = { mode: 'competency', recordId: competency?.id || null };
  populateCompetencyTierCheckboxes(competency?.applicableTierIds || []);
  openEditor(
    'competency',
    competency ? 'Edit Competency' : 'New Competency',
    'Leadership Academy · Catalog'
  );
  setInput('leadershipCompetencyNameInput', competency?.name || '');
  setInput('leadershipCompetencyDefinitionInput', competency?.definition || '');
  setInput('leadershipCompetencyExpectedInput', competency?.expectedBehaviors || '');
  setInput('leadershipCompetencyUnacceptableInput', competency?.unacceptableBehaviors || '');
  setInput('leadershipCompetencyOrderInput', competency?.displayOrder ?? 0);
  setInput('leadershipCompetencyStatusInput', competency?.status || 'active');
}

export function openLeadershipPhilosophyEditor(philosophy: LeadershipPhilosophyContent | null): void {
  if (!canManageLeadershipAcademy()) return;
  editorState = { mode: 'philosophy', recordId: philosophy?.id || null };
  openEditor('philosophy', 'Leadership Philosophy', 'Leadership Academy · Philosophy');
  setInput('leadershipPhilosophyTitleInput', philosophy?.title || 'What Leadership Means at BTW');
  setInput('leadershipPhilosophyBodyInput', philosophy?.body || '');
  setInput('leadershipPhilosophyStatusInput', philosophy?.status || 'draft');
}

export async function saveLeadershipAcademyEditor(): Promise<void> {
  if (!assertCanMutateLeadershipEditor() || !editorState) return;
  const actorEmail = resolveLeadershipAcademyActorEmail();
  const { mode, recordId } = editorState;

  try {
    if (mode === 'tier') {
      const name = readInput('leadershipTierNameInput');
      if (!name) {
        showToast('Tier name is required.', 'error');
        return;
      }
      const tier = await upsertLeadershipProgramTier({
        id: recordId || '',
        name,
        description: readInput('leadershipTierDescriptionInput'),
        intendedAudience: readInput('leadershipTierAudienceInput'),
        status: readInput('leadershipTierStatusInput') as LeadershipRecordStatus,
        displayOrder: readNumberInput('leadershipTierOrderInput') ?? 0,
        estimatedHours: readNumberInput('leadershipTierHoursInput'),
        completionRequirements: readInput('leadershipTierRequirementsInput'),
        createdByEmail: actorEmail,
        updatedByEmail: actorEmail,
      });
      await recordLeadershipAcademyAuditEvent({
        entityType: 'tier',
        entityId: tier.id,
        actionType: recordId ? 'updated' : 'created',
        actorEmail,
        note: tier.name,
      });
      showToast('Program tier saved.');
    }

    if (mode === 'course') {
      const title = readInput('leadershipCourseTitleInput');
      if (!title) {
        showToast('Course title is required.', 'error');
        return;
      }
      const course = await upsertLeadershipCourse({
        id: recordId || '',
        tierId: readInput('leadershipCourseTierInput') || null,
        title,
        description: readInput('leadershipCourseDescriptionInput'),
        status: readInput('leadershipCourseStatusInput') as LeadershipCourseStatus,
        isRequired: readCheckbox('leadershipCourseRequiredInput'),
        estimatedMinutes: readNumberInput('leadershipCourseMinutesInput'),
        displayOrder: readNumberInput('leadershipCourseOrderInput') ?? 0,
        passingScorePercent: readNumberInput('leadershipCoursePassingInput'),
        dueRuleDays: readNumberInput('leadershipCourseDueDaysInput'),
        coverIcon: readInput('leadershipCourseIconInput'),
        createdByEmail: actorEmail,
        updatedByEmail: actorEmail,
      });
      await recordLeadershipAcademyAuditEvent({
        entityType: 'course',
        entityId: course.id,
        actionType: recordId ? 'updated' : 'created',
        actorEmail,
        note: course.title,
      });
      showToast('Course saved.');
    }

    if (mode === 'module') {
      const courseId = readInput('leadershipModuleCourseInput');
      const title = readInput('leadershipModuleTitleInput');
      if (!courseId || !title) {
        showToast('Course and module title are required.', 'error');
        return;
      }
      const module = await upsertLeadershipModule({
        id: recordId || '',
        courseId,
        title,
        instructions: readInput('leadershipModuleInstructionsInput'),
        moduleType: readInput('leadershipModuleTypeInput') as LeadershipModuleType,
        isRequired: readCheckbox('leadershipModuleRequiredInput'),
        displayOrder: readNumberInput('leadershipModuleOrderInput') ?? 0,
        estimatedMinutes: readNumberInput('leadershipModuleMinutesInput'),
        completionRequirements: {},
        resourceUrl: readInput('leadershipModuleResourceInput'),
        storagePath: '',
        allowRetakes: readCheckbox('leadershipModuleRetakesInput'),
      });
      await recordLeadershipAcademyAuditEvent({
        entityType: 'module',
        entityId: module.id,
        actionType: recordId ? 'updated' : 'created',
        actorEmail,
        note: module.title,
      });
      showToast('Module saved.');
    }

    if (mode === 'competency') {
      const name = readInput('leadershipCompetencyNameInput');
      if (!name) {
        showToast('Competency name is required.', 'error');
        return;
      }
      const competency = await upsertLeadershipCompetency({
        id: recordId || '',
        name,
        definition: readInput('leadershipCompetencyDefinitionInput'),
        expectedBehaviors: readInput('leadershipCompetencyExpectedInput'),
        unacceptableBehaviors: readInput('leadershipCompetencyUnacceptableInput'),
        applicableTierIds: readCompetencyTierIds(),
        status: readInput('leadershipCompetencyStatusInput') as LeadershipRecordStatus,
        displayOrder: readNumberInput('leadershipCompetencyOrderInput') ?? 0,
      });
      await recordLeadershipAcademyAuditEvent({
        entityType: 'competency',
        entityId: competency.id,
        actionType: recordId ? 'updated' : 'created',
        actorEmail,
        note: competency.name,
      });
      showToast('Competency saved.');
    }

    if (mode === 'philosophy') {
      const title = readInput('leadershipPhilosophyTitleInput');
      if (!title) {
        showToast('Philosophy title is required.', 'error');
        return;
      }
      const philosophy = await upsertLeadershipPhilosophy({
        id: recordId || '',
        title,
        body: readInput('leadershipPhilosophyBodyInput'),
        status: readInput('leadershipPhilosophyStatusInput') as LeadershipPhilosophyContent['status'],
        isSeedDraft: false,
        updatedByEmail: actorEmail,
      });
      await recordLeadershipAcademyAuditEvent({
        entityType: 'philosophy',
        entityId: philosophy.id,
        actionType: recordId ? 'updated' : 'created',
        actorEmail,
        note: philosophy.title,
      });
      showToast('Philosophy saved.');
    }

    closeLeadershipAcademyDrawer();
    notifySaved();
  } catch (err) {
    console.error('[LeadershipAcademy] Save failed:', err);
    showToast('Could not save Leadership Academy record.', 'error');
  }
}

export async function deleteLeadershipAcademyEditor(): Promise<void> {
  if (!assertCanMutateLeadershipEditor() || !editorState?.recordId) return;
  const { mode, recordId } = editorState;
  const actorEmail = resolveLeadershipAcademyActorEmail();

  const confirmed = await showOrbisConfirm(
    'This cannot be undone. Related modules may also be removed.',
    {
      title: 'Delete catalog record?',
      confirmLabel: 'Delete',
      danger: true,
    }
  );
  if (!confirmed) return;

  try {
    if (mode === 'tier') await deleteLeadershipProgramTier(recordId);
    if (mode === 'course') await deleteLeadershipCourse(recordId);
    if (mode === 'module') await deleteLeadershipModule(recordId);
    if (mode === 'competency') await deleteLeadershipCompetency(recordId);

    await recordLeadershipAcademyAuditEvent({
      entityType: mode,
      entityId: recordId,
      actionType: 'deleted',
      actorEmail,
    });

    closeLeadershipAcademyDrawer();
    notifySaved();
    showToast('Record deleted.');
  } catch (err) {
    console.error('[LeadershipAcademy] Delete failed:', err);
    showToast('Could not delete record.', 'error');
  }
}

export function bindLeadershipAcademyEditorEvents(): void {
  document.getElementById('leadershipAcademyDrawerClose')?.addEventListener('click', closeLeadershipAcademyDrawer);
  document.getElementById('cancelLeadershipAcademyBtn')?.addEventListener('click', closeLeadershipAcademyDrawer);
  document.getElementById('saveLeadershipAcademyBtn')?.addEventListener('click', () => {
    void saveLeadershipAcademyEditor();
  });
  document.getElementById('deleteLeadershipAcademyBtn')?.addEventListener('click', () => {
    void deleteLeadershipAcademyEditor();
  });
}
