import { canAccessPerformanceReviews, isSupervisorUser } from '../services/access';
import { supabaseClient } from '../services/supabaseClient';
import { showOrbisConfirm } from '../ui/confirmModal';
import { esc, nl2br, safeGet, showToast, todayInputValue } from '../utils/helpers';
import { stopAllDictation } from './dictation';
import { loadPerformanceReviewAttachments } from './employeeDocuments';
import {
  clearCanvasSignature,
  getCanvasSignature,
  setCanvasSignature,
  setSignatureRequestContext,
} from '../ui/signaturePads';

type ReviewScoreLabel =
  | 'Exceeds Expectations'
  | 'Meets Expectations'
  | 'Needs Improvement'
  | 'Below Expectations'
  | '';

interface ReviewRecord {
  id?: string;
  employee_id?: string;
  review_date?: string;
  review_type?: string;
  quality_score?: number | null;
  attendance_score?: number | null;
  reliability_score?: number | null;
  communication_score?: number | null;
  judgement_score?: number | null;
  initiative_score?: number | null;
  teamwork_score?: number | null;
  knowledge_score?: number | null;
  training_score?: number | null;
  strengths?: string;
  improvements?: string;
  employee_comments?: string;
  manager_comments?: string;
  refused_to_sign?: boolean;
  employee_signature?: string;
  manager_signature?: string;
  witness_signature?: string;
  [key: string]: unknown;
}

interface ReviewEmployee {
  id?: string;
  dbId?: string;
  employee_id?: string;
  displayId?: string;
  first_name?: string;
  last_name?: string;
  first?: string;
  last?: string;
  impact_player?: boolean;
  is_impact_player?: boolean;
  impactPlayer?: boolean;
  impact_reason?: string;
  at_risk?: boolean;
  atRisk?: boolean;
  risk_reason?: string;
  [key: string]: unknown;
}

type FlagMeta = {
  highReview?: boolean;
  lowReview?: boolean;
  reviewScore?: number;
  manualReason?: string;
  flaggedDate?: string;
  flaggedBy?: string;
};

declare global {
  interface Window {
    currentEmployee?: ReviewEmployee;
    currentReviewId?: string | null;
    reviewAttachmentContextId?: string | null;
    cancelReviewEdit?: () => void;
    currentImpactPlayerRosterMap?: Record<string, FlagMeta>;
    currentAtRiskRosterMap?: Record<string, FlagMeta>;
    saveReviewRecord?: () => Promise<void>;
    saveEmployeeReview?: () => Promise<void>;
    loadEmployeeReviews?: (employeeId: string) => Promise<void>;
    editReviewRecord?: (review: ReviewRecord) => void;
    deleteReviewRecord?: (reviewId: string, employeeId: string) => Promise<void>;
    loadImpactPlayersFallback?: () => Promise<void>;
    loadRiskEmployeesFallback?: () => Promise<void>;
    loadReviewDashboardFallback?: () => Promise<void>;
    renderBasicDashboardKpis?: () => void;
    buildKpiHoverDetails?: () => void;
    renderRoster?: () => void;
    renderEmployeeRoster?: () => void;
    showToast?: (message: string, type?: string) => void;
    safeGet?: (id: string) => HTMLElement | null;
    todayInputValue?: () => string;
    employeeDisplayName?: (employee: ReviewEmployee | null | undefined) => string;
    getCurrentEmployeeForOrbis?: () => ReviewEmployee | null;
    currentImpactPlayerRosterMap?: Record<string, FlagMeta>;
    currentAtRiskRosterMap?: Record<string, FlagMeta>;
  }
}

let currentReviewId: string | null = null;

function employeeDisplayName(employee: ReviewEmployee | null | undefined): string {
  if (typeof window.employeeDisplayName === 'function') {
    return window.employeeDisplayName(employee);
  }

  const first = String(employee?.first_name || employee?.first || '').trim();
  const last = String(employee?.last_name || employee?.last || '').trim();
  const fullName = `${first} ${last}`.trim();

  return fullName || String(employee?.employee_id || employee?.id || 'Employee');
}

function getCurrentEmployee(): ReviewEmployee | null {
  if (typeof window.getCurrentEmployeeForOrbis === 'function') {
    return window.getCurrentEmployeeForOrbis();
  }

  return window.currentEmployee || null;
}

function assertPerformanceReviewAccess(employee?: ReviewEmployee | null): boolean {
  if (canAccessPerformanceReviews(employee ?? getCurrentEmployee())) {
    return true;
  }

  showToast('You do not have access to performance reviews for this employee.', 'error');
  return false;
}

function setInputValue(id: string, value: unknown): void {
  const input = safeGet<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(id);
  if (!input) return;

  input.value = String(value ?? '');
}

function syncReviewSignatureContext(
  recordId: string | null | undefined,
  employee: ReviewEmployee | null
): void {
  const normalizedRecordId = String(recordId || '').trim();
  const employeeId = String(employee?.dbId || employee?.id || employee?.employee_id || '').trim();

  if (!normalizedRecordId || !employeeId) {
    setSignatureRequestContext(null);
    return;
  }

  setSignatureRequestContext({
    formType: 'review',
    recordId: normalizedRecordId,
    employeeId,
    signerName: [employee?.first_name || employee?.first, employee?.last_name || employee?.last]
      .filter(Boolean)
      .join(' ')
      .trim(),
    signerEmail: String(
      (employee as { work_email?: string; email?: string })?.work_email ||
        (employee as { email?: string })?.email ||
        ''
    ).trim(),
  });
}

function resetPerformanceReviewFormUi(options?: {
  preserveReviewAttachmentContext?: boolean;
  preserveSignatureContext?: boolean;
}): void {
  currentReviewId = null;
  window.currentReviewId = null;

  if (!options?.preserveSignatureContext) {
    setSignatureRequestContext(null);
  }

  if (!options?.preserveReviewAttachmentContext) {
    window.reviewAttachmentContextId = null;
  }

  const saveButton = safeGet('saveReviewBtn');
  if (saveButton) saveButton.textContent = 'Save Review';

  safeGet('cancelReviewEditBtn')?.classList.add('hidden');
  safeGet('reviewEditStatus')?.classList.add('hidden');

  const refused = safeGet<HTMLInputElement>('reviewRefusedToSign');
  if (refused) {
    refused.checked = false;
  }

  clearCanvasSignature('reviewEmployeeSignature', 'reviewEmployeeSigStatus');
  clearCanvasSignature('reviewManagerSignature', 'reviewManagerSigStatus');
  clearCanvasSignature('reviewWitnessSignature', 'reviewWitnessSigStatus');

  setInputValue('reviewDate', todayInputValue());
  setInputValue('reviewType', '');
  setInputValue('reviewQuality', '');
  setInputValue('reviewAttendance', '');
  setInputValue('reviewReliability', '');
  setInputValue('reviewCommunication', '');
  setInputValue('reviewJudgement', '');
  setInputValue('reviewInitiative', '');
  setInputValue('reviewTeamwork', '');
  setInputValue('reviewKnowledge', '');
  setInputValue('reviewTraining', '');
  setInputValue('reviewStrengths', '');
  setInputValue('reviewImprovements', '');
  setInputValue('reviewEmployeeComments', '');
  setInputValue('reviewManagerComments', '');

  const reviewFile = safeGet<HTMLInputElement>('reviewAttachmentFile');
  if (reviewFile) reviewFile.value = '';
}

export function cancelReviewEdit(): void {
  stopAllDictation();
  if (!assertPerformanceReviewAccess()) return;

  resetPerformanceReviewFormUi();

  const active = getCurrentEmployee();
  const employeeId = String(active?.dbId || active?.id || active?.employee_id || '').trim();

  if (employeeId) {
    void loadPerformanceReviewAttachments(employeeId);
  }
}

export function reviewScoreFromValue(value: unknown): number | null {
  const text = String(value || '')
    .trim()
    .toLowerCase();

  if (!text) return null;
  if (text.includes('exceeds')) return 5;
  if (text.includes('meets')) return 3;
  if (text.includes('needs')) return 2;
  if (text.includes('below')) return 1;

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function reviewValueFromScore(score: unknown): ReviewScoreLabel {
  const numeric = Number(score);

  if (!Number.isFinite(numeric)) return '';
  if (numeric >= 5) return 'Exceeds Expectations';
  if (numeric >= 3) return 'Meets Expectations';
  if (numeric >= 2) return 'Needs Improvement';

  return 'Below Expectations';
}

function getEmployeeKeys(employee: ReviewEmployee | null, fallbackId?: string): string[] {
  return [employee?.dbId, employee?.id, employee?.employee_id, employee?.displayId, fallbackId]
    .filter(Boolean)
    .map(String);
}

function getReviewScoreValues(payload: ReviewRecord): number[] {
  return [
    payload.quality_score,
    payload.attendance_score,
    payload.reliability_score,
    payload.communication_score,
    payload.judgement_score,
    payload.initiative_score,
    payload.teamwork_score,
    payload.knowledge_score,
    payload.training_score,
  ].filter((score): score is number => Number.isFinite(Number(score)) && Number(score) > 0);
}

function applyReviewAutoSignals(
  employee: ReviewEmployee | null,
  employeeId: string,
  averageScore: number
): void {
  const employeeKeys = getEmployeeKeys(employee, employeeId);

  window.currentImpactPlayerRosterMap = window.currentImpactPlayerRosterMap || {};
  window.currentAtRiskRosterMap = window.currentAtRiskRosterMap || {};

  window.currentImpactPlayerRosterMap = window.currentImpactPlayerRosterMap;
  window.currentAtRiskRosterMap = window.currentAtRiskRosterMap;

  if (averageScore >= 4 && employeeKeys.length) {
    employeeKeys.forEach((key) => {
      window.currentImpactPlayerRosterMap![key] = {
        highReview: true,
        reviewScore: averageScore,
        manualReason: '',
        flaggedDate: todayInputValue(),
        flaggedBy: 'Review Auto-Signal',
      };
    });

    if (employee) {
      employee.impact_player = true;
      employee.is_impact_player = true;
      employee.impactPlayer = true;
      employee.impact_reason = `Review Auto-Signal: ${averageScore.toFixed(1)}`;
    }

    showToast(`${employeeDisplayName(employee)} flagged as Impact Player.`, 'success');
    return;
  }

  if (averageScore > 0 && averageScore <= 2 && employeeKeys.length) {
    employeeKeys.forEach((key) => {
      window.currentAtRiskRosterMap![key] = {
        lowReview: true,
        reviewScore: averageScore,
        manualReason: '',
        flaggedDate: todayInputValue(),
        flaggedBy: 'Review Auto-Signal',
      };
    });

    if (employee) {
      employee.at_risk = true;
      employee.atRisk = true;
      employee.risk_reason = `Review Auto-Signal: ${averageScore.toFixed(1)}`;
    }

    showToast(`${employeeDisplayName(employee)} flagged as At-Risk.`, 'warning');
    return;
  }
}

async function refreshReviewDependentUi(employeeId: string): Promise<void> {
  window.invalidateEmployeeDrawerTab?.('reviews');
  await loadEmployeeReviews(employeeId);

  if (typeof window.loadImpactPlayersFallback === 'function') {
    await window.loadImpactPlayersFallback();
  }

  if (typeof window.loadRiskEmployeesFallback === 'function') {
    await window.loadRiskEmployeesFallback();
  }

  if (typeof window.loadReviewDashboardFallback === 'function') {
    await window.loadReviewDashboardFallback();
  }

  if (typeof window.renderBasicDashboardKpis === 'function') {
    window.renderBasicDashboardKpis();
  }

  if (typeof window.buildKpiHoverDetails === 'function') {
    window.buildKpiHoverDetails();
  }

  if (typeof window.renderRoster === 'function') {
    window.renderRoster();
  } else if (typeof window.renderEmployeeRoster === 'function') {
    window.renderEmployeeRoster();
  }
}

export async function loadEmployeeReviews(employeeId: string): Promise<void> {
  const target = safeGet('reviewsHistory');
  if (!target) return;

  try {
    if (!assertPerformanceReviewAccess()) {
      target.innerHTML =
        '<div class="empty">Performance reviews are not available for this employee.</div>';
      return;
    }

    const { data, error } = await supabaseClient
      .from('employee_reviews')
      .select('*')
      .eq('employee_id', employeeId)
      .order('review_date', { ascending: false });

    if (error) {
      console.error('Could not load reviews:', error);
      target.innerHTML = '<div class="empty">Could not load reviews.</div>';
      return;
    }

    const rows = (data || []) as ReviewRecord[];

    if (!rows.length) {
      target.innerHTML = '<div class="empty">No reviews found for this employee.</div>';
      return;
    }

    const showReviewDelete = !isSupervisorUser();

    target.innerHTML = rows
      .map(
        (row) => `
      <div class="history-item" data-review-id="${esc(row.id || '')}">
        <div class="history-top">
          <div>
            <strong>${esc(row.review_type || 'Review')}</strong>
            <span>${esc(row.review_date || '')}</span>
          </div>
          <div style="display:flex; gap:6px; align-items:center;">
            <button class="button soft sm" type="button" data-edit-review-id="${esc(row.id || '')}">Edit</button>
            ${
              showReviewDelete
                ? `<button class="button danger sm" type="button" data-delete-review-id="${esc(row.id || '')}">Delete</button>`
                : ''
            }
          </div>
        </div>
        <div class="history-body">
          <strong>Strengths:</strong><br>${nl2br(row.strengths || '')}<br><br>
          <strong>Improvements:</strong><br>${nl2br(row.improvements || '')}<br><br>
          <strong>Employee Comments:</strong><br>${nl2br(row.employee_comments || '')}<br><br>
          <strong>Manager Comments:</strong><br>${nl2br(row.manager_comments || '')}
        </div>
      </div>
    `
      )
      .join('');

    target.querySelectorAll<HTMLButtonElement>('[data-edit-review-id]').forEach((button) => {
      button.addEventListener('click', () => {
        const reviewId = button.dataset.editReviewId;
        const review = rows.find((row) => String(row.id) === String(reviewId));
        if (!review) return;
        editReviewRecord(review);
      });
    });

    target.querySelectorAll<HTMLButtonElement>('[data-delete-review-id]').forEach((button) => {
      button.addEventListener('click', async () => {
        const reviewId = button.dataset.deleteReviewId;
        if (!reviewId) return;
        await deleteReviewRecord(reviewId, employeeId);
      });
    });
  } finally {
    void loadPerformanceReviewAttachments(employeeId);
  }
}

export function editReviewRecord(review: ReviewRecord): void {
  if (!review) return;
  if (!assertPerformanceReviewAccess()) return;

  currentReviewId = review.id || null;
  window.currentReviewId = currentReviewId;

  syncReviewSignatureContext(review.id, getCurrentEmployee());
  window.initReviewSignaturePads?.();

  setInputValue('reviewDate', review.review_date || todayInputValue());
  setInputValue('reviewType', review.review_type || '');
  setInputValue('reviewQuality', reviewValueFromScore(review.quality_score));
  setInputValue('reviewAttendance', reviewValueFromScore(review.attendance_score));
  setInputValue('reviewReliability', reviewValueFromScore(review.reliability_score));
  setInputValue('reviewCommunication', reviewValueFromScore(review.communication_score));
  setInputValue('reviewJudgement', reviewValueFromScore(review.judgement_score));
  setInputValue('reviewInitiative', reviewValueFromScore(review.initiative_score));
  setInputValue('reviewTeamwork', reviewValueFromScore(review.teamwork_score));
  setInputValue('reviewKnowledge', reviewValueFromScore(review.knowledge_score));
  setInputValue('reviewTraining', reviewValueFromScore(review.training_score));
  setInputValue('reviewStrengths', review.strengths || '');
  setInputValue('reviewImprovements', review.improvements || '');
  setInputValue('reviewEmployeeComments', review.employee_comments || '');
  setInputValue('reviewManagerComments', review.manager_comments || '');

  const refused = safeGet<HTMLInputElement>('reviewRefusedToSign');
  if (refused) {
    refused.checked = review.refused_to_sign === true;
  }

  setCanvasSignature(
    'reviewEmployeeSignature',
    'reviewEmployeeSigStatus',
    String(review.employee_signature || '')
  );
  setCanvasSignature(
    'reviewManagerSignature',
    'reviewManagerSigStatus',
    String(review.manager_signature || '')
  );
  setCanvasSignature(
    'reviewWitnessSignature',
    'reviewWitnessSigStatus',
    String(review.witness_signature || '')
  );

  const saveButton = safeGet('saveReviewBtn');
  if (saveButton) saveButton.textContent = 'Update Review';

  const editStatus = safeGet('reviewEditStatus');
  if (editStatus) {
    editStatus.textContent = 'Editing saved review';
    editStatus.classList.remove('hidden');
  }

  safeGet('cancelReviewEditBtn')?.classList.remove('hidden');

  const attachmentReviewId = String(review.id || '').trim();
  if (attachmentReviewId) {
    window.reviewAttachmentContextId = attachmentReviewId;
  }

  const active = getCurrentEmployee();
  const resolvedId = String(active?.dbId || active?.id || active?.employee_id || '').trim();
  if (resolvedId) {
    void loadPerformanceReviewAttachments(resolvedId);
  }

  showToast('Review loaded for editing.');
}

export async function deleteReviewRecord(reviewId: string, employeeId: string): Promise<void> {
  if (!reviewId) return;
  if (!assertPerformanceReviewAccess()) return;
  if (
    !(await showOrbisConfirm('Delete this review?', {
      title: 'Delete review',
      confirmLabel: 'Delete',
      danger: true,
    }))
  ) {
    return;
  }

  const { error } = await supabaseClient.from('employee_reviews').delete().eq('id', reviewId);

  if (error) {
    console.error('Review delete failed:', error);
    showToast(error.message || 'Could not delete review.', 'error');
    return;
  }

  showToast('Review deleted.');

  if (String(window.reviewAttachmentContextId || '') === String(reviewId)) {
    window.reviewAttachmentContextId = null;
  }

  if (String(currentReviewId || '') === String(reviewId)) {
    currentReviewId = null;
    window.currentReviewId = null;
    const saveButton = safeGet('saveReviewBtn');
    if (saveButton) saveButton.textContent = 'Save Review';
  }

  await refreshReviewDependentUi(employeeId);
}

export async function saveReviewRecord(): Promise<void> {
  stopAllDictation();
  const activeEmployee = getCurrentEmployee();

  const employeeId =
    activeEmployee?.dbId || activeEmployee?.id || activeEmployee?.employee_id || '';

  if (!employeeId) {
    showToast('Open an employee before saving a review.', 'error');
    return;
  }

  if (!assertPerformanceReviewAccess(activeEmployee)) return;

  const reviewPayload: ReviewRecord = {
    employee_id: employeeId,
    review_date: safeGet<HTMLInputElement>('reviewDate')?.value || todayInputValue(),
    review_type: safeGet<HTMLInputElement>('reviewType')?.value || 'Review',
    quality_score: reviewScoreFromValue(safeGet<HTMLInputElement>('reviewQuality')?.value),
    attendance_score: reviewScoreFromValue(safeGet<HTMLInputElement>('reviewAttendance')?.value),
    reliability_score: reviewScoreFromValue(safeGet<HTMLInputElement>('reviewReliability')?.value),
    communication_score: reviewScoreFromValue(
      safeGet<HTMLInputElement>('reviewCommunication')?.value
    ),
    judgement_score: reviewScoreFromValue(safeGet<HTMLInputElement>('reviewJudgement')?.value),
    initiative_score: reviewScoreFromValue(safeGet<HTMLInputElement>('reviewInitiative')?.value),
    teamwork_score: reviewScoreFromValue(safeGet<HTMLInputElement>('reviewTeamwork')?.value),
    knowledge_score: reviewScoreFromValue(safeGet<HTMLInputElement>('reviewKnowledge')?.value),
    training_score: reviewScoreFromValue(safeGet<HTMLInputElement>('reviewTraining')?.value),
    strengths: safeGet<HTMLTextAreaElement>('reviewStrengths')?.value || '',
    improvements: safeGet<HTMLTextAreaElement>('reviewImprovements')?.value || '',
    employee_comments: safeGet<HTMLTextAreaElement>('reviewEmployeeComments')?.value || '',
    manager_comments: safeGet<HTMLTextAreaElement>('reviewManagerComments')?.value || '',
    refused_to_sign: safeGet<HTMLInputElement>('reviewRefusedToSign')?.checked || false,
    employee_signature: getCanvasSignature('reviewEmployeeSignature'),
    manager_signature: getCanvasSignature('reviewManagerSignature'),
    witness_signature: getCanvasSignature('reviewWitnessSignature'),
  };

  const reviewId = currentReviewId || window.currentReviewId;

  const saveReviewPayload = async (payloadToSave: ReviewRecord) => {
    if (reviewId) {
      return supabaseClient
        .from('employee_reviews')
        .update(payloadToSave)
        .eq('id', reviewId)
        .select();
    }

    return supabaseClient.from('employee_reviews').insert([payloadToSave]).select();
  };

  const cleanPayload: ReviewRecord = { ...reviewPayload };
  let result = await saveReviewPayload(cleanPayload);

  while (
    result.error &&
    result.error.code === 'PGRST204' &&
    /'([^']+)' column/.test(String(result.error.message || ''))
  ) {
    const missingColumn = String(result.error.message || '').match(/'([^']+)' column/)?.[1];

    if (!missingColumn || !(missingColumn in cleanPayload)) break;

    console.warn(`Review column missing in Supabase, retrying without: ${missingColumn}`);
    delete cleanPayload[missingColumn];
    result = await saveReviewPayload(cleanPayload);
  }

  if (result.error) {
    console.error('Review save failed:', result.error);
    showToast(result.error.message || 'Could not save review.', 'error');
    return;
  }

  const scoreValues = getReviewScoreValues(cleanPayload);
  const averageScore = scoreValues.length
    ? scoreValues.reduce((sum, score) => sum + Number(score), 0) / scoreValues.length
    : 0;

  applyReviewAutoSignals(activeEmployee, employeeId, averageScore);

  const savedRow = (Array.isArray(result.data) ? result.data[0] : result.data) as
    | ReviewRecord
    | undefined;
  const resolvedAttachmentReviewId = savedRow?.id
    ? String(savedRow.id)
    : reviewId
      ? String(reviewId)
      : null;
  if (resolvedAttachmentReviewId) {
    window.reviewAttachmentContextId = resolvedAttachmentReviewId;
    syncReviewSignatureContext(resolvedAttachmentReviewId, activeEmployee);
    currentReviewId = resolvedAttachmentReviewId;
    window.currentReviewId = resolvedAttachmentReviewId;

    const saveButton = safeGet('saveReviewBtn');
    if (saveButton) saveButton.textContent = 'Update Review';

    const editStatus = safeGet('reviewEditStatus');
    if (editStatus) {
      editStatus.textContent = 'Editing saved review';
      editStatus.classList.remove('hidden');
    }

    safeGet('cancelReviewEditBtn')?.classList.remove('hidden');
    showToast('Review saved. You can copy a signing link now.', 'success');
  } else {
    resetPerformanceReviewFormUi({ preserveReviewAttachmentContext: true });
    showToast('Review saved.', 'success');
  }

  await refreshReviewDependentUi(employeeId);

  if (typeof window.loadHrInbox === 'function') {
    void window.loadHrInbox(true);
  }
  if (typeof window.loadMyTasksPortal === 'function') {
    void window.loadMyTasksPortal();
  }
  if (typeof window.refreshPerformanceReviewsDueKpi === 'function') {
    void window.refreshPerformanceReviewsDueKpi();
  }
  if (typeof window.loadPerformanceReviewSupervisorNotify === 'function') {
    void window.loadPerformanceReviewSupervisorNotify();
  }
}

window.loadEmployeeReviews = loadEmployeeReviews;
window.editReviewRecord = editReviewRecord;
window.deleteReviewRecord = deleteReviewRecord;
window.saveReviewRecord = saveReviewRecord;
window.saveEmployeeReview = saveReviewRecord;
window.cancelReviewEdit = cancelReviewEdit;
