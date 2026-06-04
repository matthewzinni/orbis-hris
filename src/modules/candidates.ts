import { supabaseClient } from '../services/supabaseClient';
import {
  getSupervisorDepartmentScope,
  isAdminUser,
  isSupervisorUser,
} from '../services/access';
import { generateAvailableEmployeeId } from '../services/employeeIds';
import { logNewHirePayrollHandoff } from '../services/payrollHandoff';
import { renderDashboardRetryState } from '../ui/dashboardRetry';
import { showOrbisConfirm } from '../ui/confirmModal';
import {
  mountDrawerIdentityHeader,
  mountLegacyDrawerHeader,
  removeDrawerIdentityHeader,
  restoreDrawerLegacyHeader,
  restoreDrawerTabPlacement,
} from '../ui/drawerIdentityHeader';

interface CandidateRecord {
  id?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  position?: string;
  stage?: string;
  source?: string;
  notes?: string;
  created_at?: string;
  applied_date?: string;
  interview_date?: string;
  interview_time?: string;
  interview_type?: string;
  interview_status?: string;
  interview_notes?: string;
  [key: string]: unknown;
}

declare global {
  interface Window {
    loadCandidates?: () => Promise<void>;

    saveCandidateRecord?: () => Promise<void>;
    saveCandidate?: () => Promise<void>;
    saveCandidateProfile?: () => Promise<void>;

    editCandidateRecord?: (record: CandidateRecord) => void;

    deleteCandidateRecord?: (candidateId?: string) => Promise<void>;

    moveCandidateToStage?: (candidateId: string, newStage: string) => Promise<void>;

    convertCandidateToEmployee?: (candidateId: string) => Promise<void>;

    convertCurrentCandidateToEmployee?: () => Promise<void>;

    refreshCandidatesView?: () => Promise<void>;

    showToast?: (message: string, type?: string) => void;

    safeGet?: (id: string) => HTMLElement | null;

    renderBasicDashboardKpis?: () => void;

    loadRecentActivityFallback?: () => Promise<void>;

    loadEmployees?: () => Promise<void>;
    loadAllDashboardData?: () => Promise<void>;

    openCandidateDrawer?: (candidateId: string) => Promise<void>;
    closeCandidateDrawer?: () => void;
    closeActiveDrawer?: () => void;
    isCandidateDrawerOpen?: () => boolean;
    closeEmployeeDrawer?: () => void;
    switchCandidateTab?: (tabName: string) => void;
    openNewCandidateForm?: () => void;
    inviteCandidateToInterview?: () => void;
    setText?: (id: string, value: unknown) => void;
    todayInputValue?: () => string;
    closeDrawer?: () => void;
  }
}

let currentCandidateId: string | null = null;
let isCandidateSaveInProgress = false;

function safeGet<T extends HTMLElement = HTMLElement>(id: string): T | null {
  if (typeof window.safeGet === 'function') {
    return window.safeGet(id) as T | null;
  }

  return document.getElementById(id) as T | null;
}

function showToast(message: string, type: string = 'success'): void {
  if (typeof window.showToast === 'function') {
    window.showToast(message, type);

    return;
  }

  console.log(`[${type}] ${message}`);
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}


function nl2br(value: unknown): string {
  return escapeHtml(value).replace(/\n/g, '<br>');
}

function normalizeDepartment(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function canAccessCandidate(candidate: CandidateRecord | null | undefined): boolean {
  if (!candidate) return false;
  if (isAdminUser()) return true;
  if (!isSupervisorUser()) return false;

  const department = normalizeDepartment(candidate.department);

  if (!department) return false;

  return getSupervisorDepartmentScope().includes(department);
}

function filterCandidatesForCurrentAccess(rows: CandidateRecord[]): CandidateRecord[] {
  if (isAdminUser()) return rows;
  if (!isSupervisorUser()) return [];

  return rows.filter((row) => canAccessCandidate(row));
}

function resolveCandidateDepartmentForSave(rawDepartment: unknown): string {
  return String(rawDepartment || '').trim();
}

const CANDIDATE_DATE_FIELDS = [
  'applied_date',
  'interview_date',
  'target_start_date',
  'offer_date',
] as const;

const CANDIDATE_TIME_FIELDS = ['interview_time'] as const;

function normalizeCandidateNames(payload: CandidateRecord): CandidateRecord {
  let firstName = String(payload.first_name || '').trim();
  let lastName = String(payload.last_name || '').trim();

  if (!lastName && firstName.includes(' ')) {
    const parts = firstName.split(/\s+/).filter(Boolean);
    firstName = parts.shift() || '';
    lastName = parts.join(' ');
  }

  return {
    ...payload,
    first_name: firstName,
    last_name: lastName,
  };
}

function sanitizeCandidatePayload(payload: CandidateRecord): CandidateRecord {
  const clean: CandidateRecord = { ...payload };

  for (const key of Object.keys(clean)) {
    const value = clean[key];
    if (value !== '') continue;

    if (
      (CANDIDATE_DATE_FIELDS as readonly string[]).includes(key) ||
      (CANDIDATE_TIME_FIELDS as readonly string[]).includes(key)
    ) {
      clean[key] = null;
      continue;
    }

    if (typeof value === 'string') {
      clean[key] = null;
    }
  }

  return clean;
}

function validateCandidateDepartmentForSave(department: string): boolean {
  const normalized = normalizeDepartment(department);

  if (isAdminUser()) {
    return true;
  }

  if (!isSupervisorUser()) {
    showToast('You do not have permission to manage candidates.', 'error');
    return false;
  }

  if (!normalized) {
    showToast('Department is required for candidates in your scope.', 'error');
    return false;
  }

  const scope = getSupervisorDepartmentScope();

  if (!scope.length) {
    showToast('No departments are assigned to your team yet.', 'error');
    return false;
  }

  if (!scope.includes(normalized)) {
    showToast('Candidates must belong to one of your team departments.', 'error');
    return false;
  }

  return true;
}

function getNextCandidateStage(currentStage: unknown): string {
  const stage = String(currentStage || 'Applied').trim();

  if (stage === 'Applied') return 'Screening';
  if (stage === 'Screening') return 'Interviewing';
  if (stage === 'Interviewing') return 'Offer';
  if (stage === 'Offer') return 'Hired';

  return 'Applied';
}

function setInputValue(id: string, value: unknown): void {
  const input = safeGet<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(id);

  if (!input) return;

  input.value = String(value ?? '');
}

function getInputValue(...ids: string[]): string {
  for (const id of ids) {
    const directMatch = document.getElementById(id) as
      | HTMLInputElement
      | HTMLTextAreaElement
      | HTMLSelectElement
      | null;

    if (directMatch && typeof directMatch.value === 'string') {
      const value = directMatch.value.trim();

      console.log(`[Candidates] Direct ID match: ${id}`, value);

      if (value) {
        return value;
      }
    }

    const nameMatch = document.querySelector(
      `[name="${id}"]`
    ) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;

    if (nameMatch && typeof nameMatch.value === 'string') {
      const value = nameMatch.value.trim();

      console.log(`[Candidates] Name match: ${id}`, value);

      if (value) {
        return value;
      }
    }
  }

  return '';
}

function getCandidateDrawerValues(): CandidateRecord {
  const saveButton = document.getElementById('saveCandidateBtn');
  const formRoot =
    saveButton?.closest('.card') ||
    saveButton?.closest('.drawer') ||
    saveButton?.closest('.drawer-panel') ||
    saveButton?.closest('.side-panel') ||
    saveButton?.closest('[id*="candidate" i]') ||
    document;

  const fields = Array.from(
    formRoot.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      'input, textarea, select'
    )
  ).filter((field) => {
    const rect = field.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });

  console.log(
    '[Candidates] Candidate drawer fields by order:',
    fields.map((field, index) => ({
      index,
      id: field.id,
      name: field.name,
      tag: field.tagName,
      value: field.value,
    }))
  );

  return {
    first_name:
      getInputValue('candidateFirstNameInput', 'candidateFirstName') ||
      fields[0]?.value?.trim() ||
      '',
    last_name:
      getInputValue('candidateLastNameInput', 'candidateLastName') ||
      fields[1]?.value?.trim() ||
      '',
    email:
      getInputValue('candidateEmailInput', 'candidateEmail') ||
      fields[2]?.value?.trim() ||
      '',
    phone:
      getInputValue('candidatePhoneInput', 'candidatePhone') ||
      fields[3]?.value?.trim() ||
      '',
    position:
      getInputValue('candidatePositionInput', 'candidatePosition') ||
      fields[4]?.value?.trim() ||
      '',
    department:
      getInputValue('candidateDepartmentInput', 'candidateDepartment') ||
      fields[5]?.value?.trim() ||
      '',
    stage: fields[6]?.value?.trim() || fields[5]?.value?.trim() || 'Applied',
    source: fields[7]?.value?.trim() || '',
    applied_date: fields[8]?.value?.trim() || '',
    notes: fields[9]?.value?.trim() || '',
    interview_date: getInputValue('candidateInterviewDate'),
    interview_time: getInputValue('candidateInterviewTime'),
    interview_type: getInputValue('candidateInterviewType'),
    interview_status: getInputValue('candidateInterviewStatus'),
    interview_notes: getInputValue('candidateInterviewNotes'),
  };
}

function buildInterviewInviteMailto(candidate: CandidateRecord): string {
  const email = String(candidate.email || '').trim();
  const firstName = String(candidate.first_name || '').trim();
  const position = String(candidate.position || '').trim();
  const interviewType = String(candidate.interview_type || '').trim() || 'Interview';
  const interviewDate = String(candidate.interview_date || '').trim();
  const interviewTime = String(candidate.interview_time || '').trim();

  const whenParts = [interviewDate, interviewTime].filter(Boolean);
  const whenText = whenParts.length ? whenParts.join(' at ') : '[date and time]';
  const subject = `Interview Invitation${position ? ` - ${position}` : ''} | BTW Global`;
  const lines = [
    `Hi ${firstName || 'there'},`,
    '',
    'Thank you for your interest in a position with BTW Global.',
    `We would like to invite you to an ${interviewType ? interviewType.toLowerCase() : 'interview'}.`,
    `Proposed schedule: ${whenText}.`,
    '',
    'Please reply to confirm your availability, or share a better time that works for you.',
  ];

  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n'))}`;
}

function shouldOpenInterviewTab(stage: unknown): boolean {
  return String(stage || '').trim().toLowerCase() === 'interviewing';
}

export function inviteCandidateToInterview(): void {
  const candidate = getCandidateDrawerValues();
  const email = String(
    getInputValue('candidateEmailInput', 'candidateEmail') || candidate.email || ''
  ).trim();

  if (!email) {
    showToast('Candidate email is required to send an interview invite.', 'error');
    return;
  }

  const mailtoUrl = buildInterviewInviteMailto(candidate);
  try {
    const link = document.createElement('a');
    link.href = mailtoUrl;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
  } catch (error) {
    console.warn('[Candidates] Could not launch interview invite mailto:', error);
    window.location.assign(mailtoUrl);
  }
}

async function resolveCurrentCandidateId(): Promise<string> {
  const directId = String(
    currentCandidateId ||
      (window as any).currentCandidateId ||
      safeGet<HTMLButtonElement>('deleteCandidateBtn')?.dataset.deleteCandidateId ||
      ''
  ).trim();

  if (directId) return directId;

  const drawerValues = getCandidateDrawerValues();

  let query = supabaseClient
    .from('candidates')
    .select('id, first_name, last_name, email, phone, position, stage, source, applied_date, created_at')
    .order('created_at', { ascending: false })
    .limit(10);

  if (drawerValues.email) {
    query = query.eq('email', drawerValues.email);
  }

  if (drawerValues.first_name) {
    query = query.eq('first_name', drawerValues.first_name);
  }

  if (drawerValues.last_name) {
    query = query.eq('last_name', drawerValues.last_name);
  }

  if (drawerValues.phone) {
    query = query.eq('phone', drawerValues.phone);
  }

  if (drawerValues.position) {
    query = query.eq('position', drawerValues.position);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[Candidates] Could not resolve current candidate:', error);
    return '';
  }

  const resolvedId = String(data?.[0]?.id || '').trim();

  if (resolvedId) {
    currentCandidateId = resolvedId;
    (window as any).currentCandidateId = resolvedId;

    const deleteButton = safeGet<HTMLButtonElement>('deleteCandidateBtn');
    if (deleteButton) {
      deleteButton.dataset.deleteCandidateId = resolvedId;
    }
  }

  return resolvedId;
}

async function refreshCandidatesUi(): Promise<void> {
  await loadCandidates();

  if (typeof window.loadRecentActivityFallback === 'function') {
    await window.loadRecentActivityFallback();
  }

  if (typeof window.renderBasicDashboardKpis === 'function') {
    window.renderBasicDashboardKpis();
  }
}

export async function loadCandidates(): Promise<void> {
    const target =
      safeGet('candidateBody') ||
      safeGet('candidatesList') ||
      safeGet('candidatePipeline') ||
      safeGet('candidatesContainer');

  if (!target) {
    console.warn('[Candidates] candidate container not found.');

    return;
  }

  target.innerHTML = '<div class="empty">Loading candidates...</div>';

  try {
    const { data, error } = await supabaseClient
      .from('candidates')
      .select('*')
      .neq('stage', 'Hired')
      .order('created_at', {
        ascending: false,
      });

    if (error) {
      console.error('[Candidates] Could not load candidates:', error);

      renderDashboardRetryState(target, 'Could not load candidates.', () => loadCandidates());

      return;
    }

    const rows = filterCandidatesForCurrentAccess((data || []) as CandidateRecord[]).sort(
      (a, b) => {
        const dateA = String(a.created_at || '');
        const dateB = String(b.created_at || '');
        return dateB.localeCompare(dateA);
      }
    );

    if (!rows.length) {
      const emptyMessage = isSupervisorUser()
        ? 'No candidates found for your department scope.'
        : 'No candidates found.';

      target.innerHTML = `<div class="empty">${escapeHtml(emptyMessage)}</div>`;

      return;
    }

    if (target.tagName.toLowerCase() === 'tbody') {
      target.innerHTML = rows
        .map(
          (row) => `
            <tr data-candidate-id="${escapeHtml(row.id || '')}">
              <td>
                <button class="link-button" type="button" data-edit-candidate-id="${escapeHtml(row.id || '')}">
                  ${escapeHtml(`${row.first_name || ''} ${row.last_name || ''}`.trim() || 'Unnamed Candidate')}
                </button>
              </td>
              <td>${escapeHtml(row.position || '')}</td>
              <td>${escapeHtml(row.department || '')}</td>
              <td>${escapeHtml(row.stage || '')}</td>
              <td>${escapeHtml(row.source || '')}</td>
              <td>${escapeHtml(row.applied_date || '')}</td>
              <td class="table-actions">
                <button
                  class="button soft sm"
                  type="button"
                  data-move-candidate-id="${escapeHtml(row.id || '')}"
                  data-next-stage="${escapeHtml(getNextCandidateStage(row.stage))}"
                >
                  ${getNextCandidateStage(row.stage) === 'Hired' ? 'Hire' : 'Move'}
                </button>

                <button class="button danger sm" type="button" data-delete-candidate-id="${escapeHtml(row.id || '')}">
                  Delete
                </button>
              </td>
            </tr>
          `
        )
        .join('');
    } else {
      target.innerHTML = rows
        .map(
          (row) => `
            <div class="history-item" data-candidate-id="${escapeHtml(row.id || '')}">
              <div class="history-top">
                <div>
                  <strong>${escapeHtml(`${row.first_name || ''} ${row.last_name || ''}`.trim() || 'Unnamed Candidate')}</strong>
                  <span>${escapeHtml(row.position || '')}</span>
                </div>

                <div class="table-actions">
                  <button class="button soft sm" type="button" data-edit-candidate-id="${escapeHtml(row.id || '')}">Edit</button>
                  <button
                    class="button soft sm"
                    type="button"
                    data-move-candidate-id="${escapeHtml(row.id || '')}"
                    data-next-stage="${escapeHtml(getNextCandidateStage(row.stage))}"
                  >
                    ${getNextCandidateStage(row.stage) === 'Hired' ? 'Hire' : 'Move'}
                  </button>
                  <button class="button danger sm" type="button" data-delete-candidate-id="${escapeHtml(row.id || '')}">Delete</button>
                </div>
              </div>

              <div class="history-body">
                <strong>Stage:</strong> ${escapeHtml(row.stage || '')}<br><br>
                <strong>Status:</strong> ${escapeHtml(row.status || '')}<br><br>
                <strong>Email:</strong><br>${escapeHtml(row.email || '')}<br><br>
                <strong>Phone:</strong><br>${escapeHtml(row.phone || '')}<br><br>
                <strong>Notes:</strong><br>${nl2br(row.notes || '')}
              </div>
            </div>
          `
        )
        .join('');
    }
    

    target.querySelectorAll<HTMLButtonElement>('[data-edit-candidate-id]').forEach((button) => {
      button.addEventListener('click', () => {
        const candidateId = button.dataset.editCandidateId;

        const record = rows.find((row) => String(row.id) === String(candidateId));

        if (!record) return;

        editCandidateRecord(record);
      });
    });

    target.querySelectorAll<HTMLButtonElement>('[data-move-candidate-id]').forEach((button) => {
      button.addEventListener('click', async (event) => {
        event.preventDefault();
        event.stopPropagation();

        const candidateId = button.dataset.moveCandidateId;
        const nextStage = button.dataset.nextStage;

        if (!candidateId || !nextStage) return;

        await moveCandidateToStage(candidateId, nextStage);
      });
    });

    target.querySelectorAll<HTMLButtonElement>('[data-delete-candidate-id]').forEach((button) => {
      button.addEventListener('click', async () => {
        const candidateId = button.dataset.deleteCandidateId;

        if (!candidateId) return;

        await deleteCandidateRecord(candidateId);
      });
    });
  } catch (err) {
    console.error('[Candidates] Unexpected candidate load failure:', err);

    renderDashboardRetryState(target, 'Could not load candidates.', () => loadCandidates());
  }
}

export function editCandidateRecord(record: CandidateRecord): void {
  if (!record?.id || !canAccessCandidate(record)) {
    showToast('Candidate not found.', 'error');
    return;
  }

  void openCandidateDrawer(String(record.id));

  const saveButton = safeGet('saveCandidateBtn');
  if (saveButton) {
    saveButton.textContent = 'Update Candidate';
  }
}

export async function deleteCandidateRecord(candidateId?: string): Promise<void> {
  console.log('[Candidates] Delete requested:', {
    candidateId,
    currentCandidateId,
  });

  const fallbackDeleteButton = safeGet<HTMLButtonElement>('deleteCandidateBtn');

  let idToDelete = String(
    candidateId ||
      fallbackDeleteButton?.dataset.deleteCandidateId ||
      currentCandidateId ||
      ''
  ).trim();

  if (!idToDelete) {
    const drawerValues = getCandidateDrawerValues();

    console.log('[Candidates] Resolving delete by drawer values:', drawerValues);

    let query = supabaseClient
      .from('candidates')
      .select('id, first_name, last_name, email, phone, position, stage, source, applied_date, created_at')
      .order('created_at', { ascending: false })
      .limit(10);

    if (drawerValues.email) {
      query = query.eq('email', drawerValues.email);
    }

    if (drawerValues.first_name) {
      query = query.eq('first_name', drawerValues.first_name);
    }

    if (drawerValues.last_name) {
      query = query.eq('last_name', drawerValues.last_name);
    }

    if (drawerValues.phone) {
      query = query.eq('phone', drawerValues.phone);
    }

    if (drawerValues.position) {
      query = query.eq('position', drawerValues.position);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Candidate lookup for delete failed:', error);
      showToast(error.message || 'Could not find candidate to delete.', 'error');
      return;
    }

    if (!data || data.length === 0) {
      showToast('Could not find this candidate to delete.', 'error');
      return;
    }

    if (data.length > 1) {
      console.warn('[Candidates] Multiple delete matches found. Deleting newest match first:', data);
      showToast('Multiple matching candidates found. Deleting the newest matching record first.', 'error');
    }

    idToDelete = String(data[0].id || '').trim();
  }

  if (!idToDelete) {
    showToast('Open or select a candidate before deleting.', 'error');
    return;
  }

  const candidateToDelete = await fetchCandidateById(idToDelete);

  if (!candidateToDelete || !canAccessCandidate(candidateToDelete)) {
    showToast('Candidate not found.', 'error');
    return;
  }

  if (
    !(await showOrbisConfirm('Delete this candidate?', {
      title: 'Delete candidate',
      confirmLabel: 'Delete',
      danger: true,
    }))
  ) {
    return;
  }

  const { error } = await supabaseClient
    .from('candidates')
    .delete()
    .eq('id', idToDelete);

  if (error) {
    console.error('Candidate delete failed:', error);
    showToast(error.message || 'Could not delete candidate.', 'error');
    return;
  }

  showToast('Candidate deleted.');

  currentCandidateId = null;

  if (fallbackDeleteButton) {
    delete fallbackDeleteButton.dataset.deleteCandidateId;
  }

  const saveButton = safeGet('saveCandidateBtn');

  if (saveButton) {
    saveButton.textContent = 'Save Candidate';
  }

  setInputValue('candidateFirstName', '');
  setInputValue('candidateLastName', '');
  setInputValue('candidateEmail', '');
  setInputValue('candidatePhone', '');
  setInputValue('candidatePosition', '');
  setInputValue('candidateStage', 'Applied');
  setInputValue('candidateSource', '');
  setInputValue('candidateNotes', '');

  await refreshCandidatesUi();
}

export async function saveCandidateRecord(): Promise<void> {
  if (isCandidateSaveInProgress) {
    console.warn('[Candidates] Save already in progress, ignoring duplicate click.');
    return;
  }

  isCandidateSaveInProgress = true;
  console.log('[Candidates] Save candidate clicked.');

  try {
    const drawerValues = getCandidateDrawerValues();

    const candidatePayload: CandidateRecord = {
      first_name:
        getInputValue('candidateFirstNameInput', 'candidateFirstName', 'candidateFirst', 'newCandidateFirstName', 'firstName') ||
        drawerValues.first_name ||
        '',
      last_name:
        getInputValue('candidateLastNameInput', 'candidateLastName', 'candidateLast', 'newCandidateLastName', 'lastName') ||
        drawerValues.last_name ||
        '',
      email:
        getInputValue('candidateEmailInput', 'candidateEmail', 'newCandidateEmail', 'email') ||
        drawerValues.email ||
        '',
      phone:
        getInputValue('candidatePhoneInput', 'candidatePhone', 'newCandidatePhone', 'phone') ||
        drawerValues.phone ||
        '',
      position:
        getInputValue('candidatePositionInput', 'candidatePosition', 'newCandidatePosition', 'position') ||
        drawerValues.position ||
        '',
      department:
        resolveCandidateDepartmentForSave(
          getInputValue('candidateDepartmentInput', 'candidateDepartment') || drawerValues.department
        ),
      stage:
        getInputValue('candidateStageInput', 'candidateStage', 'newCandidateStage', 'stage') ||
        drawerValues.stage ||
        'Applied',
      
      source:
        getInputValue('candidateSourceInput', 'candidateSource', 'newCandidateSource', 'source') ||
        drawerValues.source ||
        '',
      notes:
        getInputValue('candidateNotesInput', 'candidateNotes', 'newCandidateNotes', 'notes') ||
        drawerValues.notes ||
        '',
      interview_date:
        getInputValue('candidateInterviewDate') ||
        drawerValues.interview_date ||
        '',
      interview_time:
        getInputValue('candidateInterviewTime') ||
        drawerValues.interview_time ||
        '',
      interview_type:
        getInputValue('candidateInterviewType') ||
        drawerValues.interview_type ||
        '',
      interview_status:
        getInputValue('candidateInterviewStatus') ||
        drawerValues.interview_status ||
        '',
      interview_notes:
        getInputValue('candidateInterviewNotes') ||
        drawerValues.interview_notes ||
        '',
      applied_date:
        getInputValue('candidateAppliedDateInput', 'candidateAppliedDate', 'appliedDate', 'newCandidateAppliedDate') ||
        drawerValues.applied_date ||
        '',
    };

    const normalizedPayload = sanitizeCandidatePayload(normalizeCandidateNames(candidatePayload));

    console.log('[Candidates] Candidate payload:', normalizedPayload);

    if (!normalizedPayload.first_name || !normalizedPayload.last_name) {
      showToast('First and last name are required.', 'error');
      return;
    }

    if (!validateCandidateDepartmentForSave(String(normalizedPayload.department || ''))) {
      return;
    }
    const existingRows = Array.from(document.querySelectorAll('[data-candidate-id]'));

    const duplicateExists = existingRows.some((row) => {
      const text = row.textContent?.toLowerCase() || '';

      return (
        text.includes(normalizedPayload.first_name?.toLowerCase() || '') &&
        text.includes(normalizedPayload.last_name?.toLowerCase() || '')
      );
    });

    if (duplicateExists && !currentCandidateId) {
      showToast('Candidate already exists.', 'error');
      return;
    }

    const saveCandidatePayload = async (payloadToSave: CandidateRecord) => {
      console.log('[Candidates] Sending candidate payload to Supabase:', payloadToSave);

      if (currentCandidateId) {
        return supabaseClient
          .from('candidates')
          .update(payloadToSave)
          .eq('id', currentCandidateId)
          .select();
      }

      return supabaseClient
        .from('candidates')
        .insert([payloadToSave])
        .select();
    };

    const shouldConvertToEmployee = normalizedPayload.stage === 'Hired';

    const cleanPayload: CandidateRecord = sanitizeCandidatePayload({
      ...normalizedPayload,
      stage: shouldConvertToEmployee ? 'Offer' : normalizedPayload.stage,
    });

    let result = await saveCandidatePayload(cleanPayload);

    while (result.error) {
      const message = String(result.error.message || '');

      if (result.error.code !== 'PGRST204' || !/'([^']+)' column/.test(message)) {
        break;
      }

      const missingColumn = message.match(/'([^']+)' column/)?.[1];

      if (!missingColumn || !(missingColumn in cleanPayload)) {
        break;
      }

      console.warn(`Candidate column missing in Supabase, retrying without: ${missingColumn}`);
      delete cleanPayload[missingColumn];
      result = await saveCandidatePayload(cleanPayload);
    }

    console.log('[Candidates] Supabase save result:', result);

    if (result.error) {
      console.error('Candidate save failed:', result.error);
      const code = String(result.error.code || '');
      const message = String(result.error.message || '');
      let hint = message || 'Could not save candidate.';

      if (code === '23502' && /last_name|first_name/i.test(message)) {
        hint = 'First and last name are required.';
      } else if (code === '22007' || /invalid input syntax for type date|time/i.test(message)) {
        hint = 'Check applied date and interview date/time fields.';
      } else if (code === '42501' || /row-level security/i.test(message)) {
        hint = 'You do not have permission to save candidates in this department.';
      }

      showToast(hint, 'error');
      return;
    }

    const savedCandidateId = String(
      (Array.isArray(result.data) ? result.data[0]?.id : '') || currentCandidateId || ''
    ).trim();

    if (shouldConvertToEmployee && savedCandidateId) {
      const converted = await convertCandidateToEmployee(savedCandidateId);

      if (!converted) {
        await supabaseClient
          .from('candidates')
          .update({ stage: 'Offer' })
          .eq('id', savedCandidateId);

        showToast('Candidate could not be converted. Kept in Offer stage.', 'error');
        await refreshCandidatesUi();
        return;
      }

      currentCandidateId = null;
      (window as any).currentCandidateId = null;
      return;
    }

    showToast(currentCandidateId ? 'Candidate updated.' : 'Candidate saved.');

    if (savedCandidateId) {
      currentCandidateId = savedCandidateId;
      (window as { currentCandidateId?: string | null }).currentCandidateId = savedCandidateId;
    } else {
      currentCandidateId = null;
      (window as { currentCandidateId?: string | null }).currentCandidateId = null;
    }

    const saveButton = safeGet('saveCandidateBtn');

    if (saveButton) {
      saveButton.textContent = 'Save Candidate';
    }

    setInputValue('candidateFirstName', '');
    setInputValue('candidateLastName', '');
    setInputValue('candidateEmail', '');
    setInputValue('candidatePhone', '');
    setInputValue('candidatePosition', '');
    setInputValue('candidateStage', 'Applied');
    setInputValue('candidateSource', '');
    setInputValue('candidateNotes', '');

    await refreshCandidatesUi();
  } catch (err) {
    console.error('[Candidates] Unexpected save failure:', err);
    showToast('Could not save candidate.', 'error');
  } finally {
    isCandidateSaveInProgress = false;
  }
}

export async function moveCandidateToStage(candidateId: string, newStage: string): Promise<void> {
  const candidate = await fetchCandidateById(candidateId);

  if (!candidate || !canAccessCandidate(candidate)) {
    showToast('Candidate not found.', 'error');
    return;
  }

  if (newStage === 'Hired') {
    await convertCandidateToEmployee(candidateId);
    return;
  }

  const { error } = await supabaseClient
    .from('candidates')
    .update({
      stage: newStage,
    })
    .eq('id', candidateId);

  if (error) {
    console.error('Could not update candidate stage:', error);

    showToast(error.message || 'Could not update candidate stage.', 'error');

    return;
  }

  showToast(`Candidate moved to ${newStage}.`);

  await refreshCandidatesUi();
}

export async function convertCandidateToEmployee(candidateId: string): Promise<boolean> {
  const { data, error } = await supabaseClient
    .from('candidates')
    .select('*')
    .eq('id', candidateId)
    .single();

  if (error || !data) {
    console.error('Could not load candidate:', error);

    showToast('Could not load candidate.', 'error');

    return false;
  }

  if (!canAccessCandidate(data as CandidateRecord)) {
    showToast('Candidate not found.', 'error');
    return false;
  }

  const existingEmployee = await supabaseClient
    .from('employees')
    .select('id, first_name, last_name, phone, position')
    .eq('first_name', data.first_name || '')
    .eq('last_name', data.last_name || '')
    .limit(1);

  if (existingEmployee.error) {
    console.warn(
      'Could not check for existing employee before conversion:',
      existingEmployee.error
    );
  }

  if (existingEmployee.data && existingEmployee.data.length > 0) {
    await supabaseClient.from('candidates').update({ stage: 'Hired' }).eq('id', candidateId);

    showToast('Candidate already exists as an employee. Marked as hired.');

    await refreshCandidatesUi();

    if (typeof window.loadEmployees === 'function') {
      await window.loadEmployees();
    } else if (typeof window.loadAllDashboardData === 'function') {
      await window.loadAllDashboardData();
    }

    return true;
  }

  const employeePayload = {
    id: await generateAvailableEmployeeId(),
    first_name: data.first_name || '',
    last_name: data.last_name || '',
    phone: data.phone || '',
    position: data.position || '',
    department: data.department || '',
    status: 'Active',
    hire_date: new Date().toISOString().slice(0, 10),
  };

  const cleanEmployeePayload: Record<string, unknown> = {
    ...employeePayload,
  };

  let employeeInsert = await supabaseClient
    .from('employees')
    .insert([cleanEmployeePayload])
    .select();

  while (employeeInsert.error) {
    const message = String(employeeInsert.error.message || '');

    if (employeeInsert.error.code !== 'PGRST204' || !/'([^']+)' column/.test(message)) {
      break;
    }

    const missingColumn = message.match(/'([^']+)' column/)?.[1];

    if (!missingColumn || !(missingColumn in cleanEmployeePayload)) {
      break;
    }

    console.warn(`Employee column missing in Supabase, retrying without: ${missingColumn}`);
    delete cleanEmployeePayload[missingColumn];

    employeeInsert = await supabaseClient.from('employees').insert([cleanEmployeePayload]).select();
  }

  if (employeeInsert.error) {
    console.error('Could not convert candidate:', employeeInsert.error);

    showToast(employeeInsert.error.message || 'Could not convert candidate.', 'error');

    return false;
  }

  await supabaseClient
    .from('candidates')
    .update({
      stage: 'Hired',
    })
    .eq('id', candidateId);

  showToast('Candidate converted to employee.');

  const newEmployeeId = String(cleanEmployeePayload.id || employeePayload.id || '').trim();
  if (newEmployeeId) {
    try {
      await logNewHirePayrollHandoff(
        newEmployeeId,
        `${data.first_name || ''} ${data.last_name || ''}`.trim(),
        String(employeePayload.hire_date || '')
      );
    } catch (err) {
      console.warn('[Candidates] New hire payroll handoff failed:', err);
    }
  }

  await refreshCandidatesUi();
  if (typeof window.loadEmployees === 'function') {
    await window.loadEmployees();
  } else if (typeof window.loadAllDashboardData === 'function') {
    await window.loadAllDashboardData();
  }

  return true;
}

window.loadCandidates = loadCandidates;

window.refreshCandidatesView = refreshCandidatesUi;

window.saveCandidateRecord = saveCandidateRecord;
window.saveCandidate = saveCandidateRecord;
window.saveCandidateProfile = saveCandidateRecord;

window.editCandidateRecord = editCandidateRecord;

window.deleteCandidateRecord = deleteCandidateRecord;

window.moveCandidateToStage = moveCandidateToStage;

window.convertCandidateToEmployee = convertCandidateToEmployee;

window.openCandidateDrawer = openCandidateDrawer;
window.closeCandidateDrawer = closeCandidateDrawer;
window.closeActiveDrawer = closeActiveDrawer;
window.isCandidateDrawerOpen = isCandidateDrawerOpen;
window.switchCandidateTab = switchCandidateTab;
window.openNewCandidateForm = openNewCandidateForm;
window.inviteCandidateToInterview = inviteCandidateToInterview;

window.convertCurrentCandidateToEmployee = async function convertCurrentCandidateToEmployee(): Promise<void> {
  const candidateId = await resolveCurrentCandidateId();

  if (!candidateId) {
    showToast('Open or select a candidate before converting.', 'error');
    return;
  }

  await convertCandidateToEmployee(candidateId);
};

function setText(id: string, value: unknown): void {
  if (typeof window.setText === 'function') {
    window.setText(id, value);
    return;
  }
  const el = safeGet(id);
  if (el) el.textContent = String(value ?? '');
}

function todayInputValue(): string {
  if (typeof window.todayInputValue === 'function') {
    return window.todayInputValue();
  }
  return new Date().toISOString().slice(0, 10);
}

function applyDrawerOpenStyles(drawer: HTMLElement, backdrop: HTMLElement | null): void {
  if (backdrop) {
    backdrop.classList.add('open');
    backdrop.classList.remove('hidden');
    backdrop.removeAttribute('hidden');
    backdrop.setAttribute('aria-hidden', 'false');
    backdrop.style.setProperty('display', 'block', 'important');
    backdrop.style.setProperty('visibility', 'visible', 'important');
    backdrop.style.setProperty('opacity', '1', 'important');
    backdrop.style.setProperty('z-index', '99998', 'important');
  }

  drawer.classList.add('open');
  drawer.classList.remove('hidden');
  drawer.removeAttribute('hidden');
  drawer.setAttribute('aria-hidden', 'false');
  drawer.style.setProperty('display', 'block', 'important');
  drawer.style.setProperty('visibility', 'visible', 'important');
  drawer.style.setProperty('opacity', '1', 'important');
  drawer.style.setProperty('pointer-events', 'auto', 'important');
  drawer.style.setProperty('position', 'fixed', 'important');
  drawer.style.setProperty('top', '0', 'important');
  drawer.style.setProperty('right', '0', 'important');
  drawer.style.setProperty('bottom', '0', 'important');
  drawer.style.setProperty('height', '100vh', 'important');
  drawer.style.setProperty('width', 'min(760px, 92vw)', 'important');
  drawer.style.setProperty('max-width', '92vw', 'important');
  drawer.style.setProperty('transform', 'translateX(0)', 'important');
  drawer.style.setProperty('z-index', '99999', 'important');
}

function renderCandidateDrawerIdentityHeader(candidate: CandidateRecord | null): void {
  const firstName = candidate?.first_name || '';
  const lastName = candidate?.last_name || '';
  const displayName =
    `${firstName} ${lastName}`.trim() || (candidate?.id ? 'Candidate' : 'New Candidate');
  const position = String(candidate?.position || 'Candidate');
  const stage = String(candidate?.stage || 'Applied');
  const subtitle = candidate?.id ? `${position} • ${stage}` : 'Create candidate record';
  const statusLabel = candidate?.id ? stage : 'Draft';
  const initial = displayName.charAt(0).toUpperCase() || 'C';

  if (!candidate?.id) {
    mountLegacyDrawerHeader('candidateDrawer', {
      title: displayName,
      subtitle,
      onClose: () => closeCandidateDrawer(),
    });
    setText('candidateDrawerTitle', displayName);
    setText('candidateDrawerSub', subtitle);
    return;
  }

  mountDrawerIdentityHeader({
    drawerId: 'candidateDrawer',
    headerId: 'candidateDrawerIdentityHeader',
    closeButtonId: 'candidateDrawerCloseBtn',
    name: displayName,
    meta: subtitle,
    status: statusLabel,
    initial,
    onClose: () => closeCandidateDrawer(),
  });

  setText('candidateDrawerTitle', displayName);
  setText('candidateDrawerSub', subtitle);
}

export function switchCandidateTab(tabName: string): void {
  if (typeof window.activateDrawerTab === 'function') {
    window.activateDrawerTab('candidate', tabName, false);
    return;
  }

  const drawer = document.getElementById('candidateDrawer');

  drawer?.querySelectorAll('[data-candidate-tab]').forEach((btn) => {
    const isSelected = (btn as HTMLElement).dataset.candidateTab === tabName;
    btn.classList.toggle('active', isSelected);
    (btn as HTMLElement).setAttribute('aria-selected', isSelected ? 'true' : 'false');
  });

  drawer?.querySelectorAll('.tab-panel').forEach((panel) => {
    const isSelected = panel.id === `candidate-tab-${tabName}`;
    panel.classList.toggle('active', isSelected);
    (panel as HTMLElement).hidden = !isSelected;
  });
}

export function isCandidateDrawerOpen(): boolean {
  const drawer = safeGet('candidateDrawer');
  if (!drawer) return false;
  if (drawer.classList.contains('hidden')) return false;

  const ariaHidden = drawer.getAttribute('aria-hidden');
  if (ariaHidden === 'true') return false;

  const display = drawer.style.display || getComputedStyle(drawer).display;

  return drawer.classList.contains('open') || display === 'block' || ariaHidden === 'false';
}

export function closeCandidateDrawer(): void {
  const backdrop = safeGet('drawerBackdrop');
  const drawer = safeGet('candidateDrawer');
  const employeeDrawer = safeGet('employeeDrawer');

  if (backdrop) {
    backdrop.classList.remove('open');
    backdrop.classList.add('hidden');
    backdrop.setAttribute('aria-hidden', 'true');
    backdrop.removeAttribute('style');
  }

  if (drawer) {
    removeDrawerIdentityHeader('candidateDrawerIdentityHeader');
    document.getElementById('candidateDrawerChrome')?.replaceChildren();
    restoreDrawerTabPlacement('candidateDrawer');
    restoreDrawerLegacyHeader(drawer);
    drawer.classList.remove('open', 'closing');
    drawer.classList.add('hidden');
    drawer.setAttribute('aria-hidden', 'true');
    drawer.removeAttribute('style');
  }

  if (employeeDrawer) {
    employeeDrawer.classList.remove('hidden');
    employeeDrawer.style.removeProperty('display');
    employeeDrawer.removeAttribute('aria-hidden');
  }

  document.body.style.overflow = '';
  currentCandidateId = null;
}

export function closeActiveDrawer(): void {
  if (typeof window.isInvestigationDrawerOpen === 'function' && window.isInvestigationDrawerOpen()) {
    window.closeInvestigationDrawer?.();
    return;
  }

  if (typeof window.isOperationsIssueDrawerOpen === 'function' && window.isOperationsIssueDrawerOpen()) {
    window.closeOperationsIssueDrawer?.();
    return;
  }

  if (isCandidateDrawerOpen()) {
    closeCandidateDrawer();
    return;
  }

  if (typeof window.closeEmployeeDrawer === 'function') {
    window.closeEmployeeDrawer();
  }
}

async function fetchCandidateById(candidateId: string): Promise<CandidateRecord | null> {
  const { data, error } = await supabaseClient
    .from('candidates')
    .select('*')
    .eq('id', candidateId)
    .maybeSingle();

  if (error) {
    console.error('[Candidates] Could not load candidate:', error);
    return null;
  }

  return (data as CandidateRecord) || null;
}

function fillCandidateDrawerFields(candidate: CandidateRecord): void {
  const fieldValues: Record<string, string> = {
    candidateFirstNameInput: candidate.first_name || '',
    candidateLastNameInput: candidate.last_name || '',
    candidateEmailInput: candidate.email || '',
    candidatePhoneInput: candidate.phone || '',
    candidatePositionInput: candidate.position || '',
    candidateDepartmentInput: String(candidate.department || ''),
    candidateStageInput: candidate.stage || 'Applied',
    candidateSourceInput: String(candidate.source || ''),
    candidateAppliedDateInput: String(candidate.applied_date || todayInputValue()),
    candidateNotesInput: candidate.notes || '',
    candidateInterviewDate: String(candidate.interview_date || ''),
    candidateInterviewTime: String(candidate.interview_time || ''),
    candidateInterviewType: String(candidate.interview_type || ''),
    candidateInterviewStatus: String(candidate.interview_status || ''),
    candidateInterviewNotes: String(candidate.interview_notes || ''),
  };

  Object.entries(fieldValues).forEach(([id, value]) => {
    const field = safeGet<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(id);
    if (!field) return;
    field.value = value;
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

export async function openCandidateDrawer(candidateId: string): Promise<void> {
  const candidate = await fetchCandidateById(candidateId);

  if (!candidate?.id || !canAccessCandidate(candidate)) {
    showToast('Candidate not found.', 'error');
    return;
  }

  currentCandidateId = String(candidate.id);

  const employeeDrawer = safeGet('employeeDrawer');
  if (employeeDrawer) {
    employeeDrawer.classList.remove('open');
    employeeDrawer.classList.add('hidden');
    employeeDrawer.setAttribute('aria-hidden', 'true');
    employeeDrawer.style.setProperty('display', 'none', 'important');
  }

  const backdrop = safeGet('drawerBackdrop');
  const drawer = safeGet('candidateDrawer');

  if (!drawer) {
    console.error('candidateDrawer not found');
    return;
  }

  applyDrawerOpenStyles(drawer, backdrop);
  renderCandidateDrawerIdentityHeader(candidate);

  fillCandidateDrawerFields(candidate);
  (window as { currentCandidateId?: string | null }).currentCandidateId = currentCandidateId;
  switchCandidateTab(shouldOpenInterviewTab(candidate.stage) ? 'interview' : 'profile');

  requestAnimationFrame(() => {
    drawer.scrollTop = 0;
    drawer.style.setProperty('right', '0', 'important');
    drawer.style.setProperty('transform', 'translateX(0)', 'important');
  });

  showToast('Candidate loaded for editing.');
}

export function openNewCandidateForm(): void {
  currentCandidateId = null;

  const backdrop = safeGet('drawerBackdrop');
  const drawer = safeGet('candidateDrawer');

  if (!drawer) {
    console.error('candidateDrawer not found');
    return;
  }

  restoreDrawerTabPlacement('candidateDrawer');

  const scopedDepartments = getSupervisorDepartmentScope();
  const defaultDepartment =
    isSupervisorUser() && scopedDepartments.length === 1 ? scopedDepartments[0] : '';

  fillCandidateDrawerFields({
    stage: 'Applied',
    applied_date: todayInputValue(),
    department: defaultDepartment,
  });

  switchCandidateTab('profile');
  applyDrawerOpenStyles(drawer, backdrop);
  renderCandidateDrawerIdentityHeader(null);
}

function bindCandidateDrawerClicks(): void {
  if ((window as any).__candidateDrawerClickBound) return;
  (window as any).__candidateDrawerClickBound = true;

  document.addEventListener('click', async (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    if (target.closest('#candidateDrawer, #employeeDrawer, #drawerBackdrop, .drawer-close')) {
      return;
    }

    const candidateTrigger = target.closest('[data-candidate-id]');
    if (!candidateTrigger) return;

    const candidateId = candidateTrigger.getAttribute('data-candidate-id');
    if (!candidateId) return;

    event.preventDefault();
    event.stopPropagation();
    await openCandidateDrawer(candidateId);
  });
}

function bindCandidateEvents(): void {
  if ((window as any).__candidateEventsBound) return;
  (window as any).__candidateEventsBound = true;
  bindCandidateDrawerClicks();

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!isCandidateDrawerOpen()) return;
    event.preventDefault();
    closeCandidateDrawer();
  });

  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    const saveButton = target?.closest('#saveCandidateBtn, [data-save-candidate], .save-candidate-btn');

    if (!saveButton) return;

    event.preventDefault();
    void saveCandidateRecord();
  });

  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    const deleteButton = target?.closest(
      '#deleteCandidateBtn, #deleteCandidateRecordBtn, [data-delete-candidate-id], [data-delete-candidate], .delete-candidate-btn'
    ) as HTMLElement | null;

    if (!deleteButton) return;

    event.preventDefault();

    const explicitId =
      deleteButton.dataset.deleteCandidateId ||
      deleteButton.dataset.deleteCandidate ||
      deleteButton.closest('[data-candidate-id]')?.getAttribute('data-candidate-id') ||
      undefined;

    void deleteCandidateRecord(explicitId);
  });

  document.addEventListener('change', (event) => {
    const target = event.target as HTMLElement | null;
    if (!(target instanceof HTMLSelectElement)) return;
    if (target.id !== 'candidateStageInput') return;

    if (shouldOpenInterviewTab(target.value)) {
      const interviewStatus = safeGet<HTMLSelectElement>('candidateInterviewStatus');
      if (interviewStatus && !String(interviewStatus.value || '').trim()) {
        interviewStatus.value = 'Scheduled';
        interviewStatus.dispatchEvent(new Event('input', { bubbles: true }));
        interviewStatus.dispatchEvent(new Event('change', { bubbles: true }));
      }
      switchCandidateTab('interview');
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bindCandidateEvents);
} else {
  bindCandidateEvents();
}