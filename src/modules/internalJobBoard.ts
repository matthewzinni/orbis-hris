import { supabaseClient } from '../services/supabaseClient';
import {
  canDeleteInternalJobPostings,
  canManageInternalJobPostings,
  canManageInternalJobPosting,
  canSubmitInternalJobInterest,
  canViewInternalJobInterest,
  resolveCurrentUserDisplayName,
} from '../services/internalJobBoardAccess';
import { getLinkedEmployeeId, isAdminUser, isEmployeeUser, isSupervisorUser } from '../services/access';
import { isMobileLayout } from '../mobile/mobileLayout';
import { showOrbisConfirm } from '../ui/confirmModal';
import { recordInternalJobPostingEvent } from './internalJobBoardEvents';
import {
  formatInternalJobStatus,
  INTERNAL_JOB_EMPLOYMENT_TYPES,
  INTERNAL_JOB_INTEREST_STATUSES,
  INTERNAL_JOB_STATUSES,
  type InternalJobInterest,
  type InternalJobPosting,
  type InternalJobPostingStatus,
  type InternalJobInterestStatus,
} from '../types/internalJobBoardTypes';

type InternalJobTab = 'openings' | 'manage' | 'pipeline';

let cachedPostings: InternalJobPosting[] = [];
let cachedInterests: InternalJobInterest[] = [];
let myInterestPostingIds = new Set<string>();
let activeTab: InternalJobTab = 'openings';
let editingPostingId: string | null = null;
let boardHydrated = false;
let bindingsReady = false;

function safeGet<T extends HTMLElement = HTMLElement>(id: string): T | null {
  if (typeof window.safeGet === 'function') {
    return window.safeGet(id) as T | null;
  }
  return document.getElementById(id) as T | null;
}

function syncInternalJobMobileList(listId: string, html: string): void {
  const mobileList = safeGet(listId);
  if (!mobileList) return;
  const show = isMobileLayout();
  mobileList.classList.toggle('hidden', !show);
  mobileList.innerHTML = show ? html : '';
}

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

function showToast(message: string, type = 'success'): void {
  if (typeof window.showToast === 'function') {
    window.showToast(message, type);
    return;
  }
  console.log(`[${type}] ${message}`);
}

function todayInputValue(): string {
  if (typeof window.todayInputValue === 'function') {
    return window.todayInputValue();
  }
  return new Date().toISOString().slice(0, 10);
}

function formatDateLabel(value: string | null | undefined): string {
  const raw = String(value || '').trim();
  if (!raw) return '—';
  const date = new Date(`${raw}T12:00:00`);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString();
}

function formatDateTimeLabel(value: string | null | undefined): string {
  const raw = String(value || '').trim();
  if (!raw) return '—';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleString();
}

function statusBadgeClass(status: string): string {
  return `internal-job-status-badge ${esc(String(status || '').toLowerCase())}`;
}

function openPostings(): InternalJobPosting[] {
  return cachedPostings.filter((posting) => posting.status === 'open');
}

function interestCountForPosting(postingId: string): number {
  return cachedInterests.filter((row) => row.posting_id === postingId).length;
}

function applyInternalJobBoardAccessUi(): void {
  const canManage = canManageInternalJobPostings();

  document.querySelectorAll('[data-internal-job-manage]').forEach((element) => {
    (element as HTMLElement).classList.toggle('hidden', !canManage);
  });

  const subtitle = safeGet('internalJobBoardSubtitle');
  if (subtitle) {
    subtitle.textContent = canManage
      ? 'Post openings, track internal candidates, and help employees grow within BTW Global.'
      : 'Explore open roles at BTW Global and express your interest in growing with us.';
  }

  if (!canManage && activeTab !== 'openings') {
    setInternalJobTab('openings');
  }
}

function setInternalJobTab(tab: InternalJobTab): void {
  activeTab = tab;

  document.querySelectorAll('[data-internal-job-tab]').forEach((button) => {
    const isActive = String((button as HTMLElement).dataset.internalJobTab || '') === tab;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });

  safeGet('internalJobOpeningsCard')?.classList.toggle('hidden', tab !== 'openings');
  safeGet('internalJobManageCard')?.classList.toggle('hidden', tab !== 'manage');
  safeGet('internalJobPipelineCard')?.classList.toggle('hidden', tab !== 'pipeline');
}

function populateStatusFilters(): void {
  const manageFilter = safeGet<HTMLSelectElement>('internalJobManageStatusFilter');
  if (manageFilter && manageFilter.options.length <= 1) {
    INTERNAL_JOB_STATUSES.forEach((status) => {
      const option = document.createElement('option');
      option.value = status;
      option.textContent = formatInternalJobStatus(status);
      manageFilter.appendChild(option);
    });
  }

  const pipelineFilter = safeGet<HTMLSelectElement>('internalJobPipelineStatusFilter');
  if (pipelineFilter && pipelineFilter.options.length <= 1) {
    INTERNAL_JOB_INTEREST_STATUSES.forEach((status) => {
      const option = document.createElement('option');
      option.value = status;
      option.textContent = formatInternalJobStatus(status);
      pipelineFilter.appendChild(option);
    });
  }
}

function renderOpenPostings(): void {
  const list = safeGet('internalJobOpeningsList');
  const countEl = safeGet('internalJobOpeningsCount');
  const openings = openPostings();

  if (countEl) {
    countEl.textContent = `${openings.length} open position${openings.length === 1 ? '' : 's'}`;
  }

  if (!list) return;

  if (!openings.length) {
    list.innerHTML =
      '<div class="empty">No internal openings right now. Check back soon — new opportunities are posted here first.</div>';
    return;
  }

  const canSubmit = canSubmitInternalJobInterest();

  list.innerHTML = openings
    .map((posting) => {
      const alreadySubmitted = myInterestPostingIds.has(posting.id);
      const interestBlock = canSubmit
        ? alreadySubmitted
          ? `<button class="button soft" type="button" disabled>Interest submitted</button>`
          : `<div class="internal-job-interest-form" id="internalJobInterestForm-${esc(posting.id)}">
              <div class="field">
                <label for="internalJobInterestNote-${esc(posting.id)}">Why are you interested? (optional)</label>
                <textarea class="input" id="internalJobInterestNote-${esc(posting.id)}" rows="2" placeholder="Share what excites you about this role…"></textarea>
              </div>
              <button class="button primary" type="button" data-internal-job-interest="${esc(posting.id)}">
                I'm Interested
              </button>
            </div>`
        : '';

      return `
        <article class="internal-job-opening-card" data-posting-id="${esc(posting.id)}">
          <div class="internal-job-opening-top">
            <div>
              <div class="internal-job-opening-title">${esc(posting.title)}</div>
              <div class="internal-job-opening-meta">
                <span class="badge badge-soft">${esc(posting.department)}</span>
                <span class="muted">Hiring manager: ${esc(posting.hiring_manager_name)}</span>
                ${
                  posting.location
                    ? `<span class="muted">Location: ${esc(posting.location)}</span>`
                    : ''
                }
                <span class="muted">${esc(formatInternalJobStatus(posting.employment_type))}</span>
              </div>
            </div>
            <span class="${statusBadgeClass('open')}">Open</span>
          </div>
          <div class="internal-job-opening-description">${esc(posting.short_description)}</div>
          <div class="muted" style="font-size:0.85rem;margin-bottom:10px">
            ${
              posting.closing_date
                ? `Apply by ${esc(formatDateLabel(posting.closing_date))}`
                : 'Open until filled'
            }
          </div>
          <div class="internal-job-opening-actions">
            <button class="button soft sm" type="button" data-internal-job-details="${esc(posting.id)}">
              View details
            </button>
            ${interestBlock}
          </div>
        </article>
      `;
    })
    .join('');
}

function filteredManagePostings(): InternalJobPosting[] {
  const search = String(safeGet<HTMLInputElement>('internalJobManageSearch')?.value || '')
    .trim()
    .toLowerCase();
  const status = String(safeGet<HTMLSelectElement>('internalJobManageStatusFilter')?.value || '')
    .trim()
    .toLowerCase();

  return cachedPostings.filter((posting) => {
    if (!canManageInternalJobPosting(posting) && !isAdminUser()) return false;
    if (status && posting.status !== status) return false;
    if (!search) return true;

    const haystack = [
      posting.title,
      posting.department,
      posting.hiring_manager_name,
      posting.location,
      posting.short_description,
    ]
      .join(' ')
      .toLowerCase();

    return haystack.includes(search);
  });
}

function renderManagePostings(): void {
  const tbody = safeGet<HTMLTableSectionElement>('internalJobManageBody');
  const countEl = safeGet('internalJobManageCount');
  const postings = filteredManagePostings();

  if (countEl) {
    countEl.textContent = `${postings.length} posting${postings.length === 1 ? '' : 's'}`;
  }

  if (!tbody) return;

  if (!postings.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty">No postings match your filters.</td></tr>';
    syncInternalJobMobileList(
      'mobileInternalJobManageList',
      '<div class="orbis-mobile-empty muted">No postings match your filters.</div>'
    );
    window.refreshMobileTables?.();
    return;
  }

  tbody.innerHTML = postings
    .map((posting) => {
      const canManage = canManageInternalJobPosting(posting);
      const actions = canManage
        ? `<div class="table-actions">
            <button class="button soft sm" type="button" data-internal-job-edit="${esc(posting.id)}">Edit</button>
            ${
              posting.status === 'open'
                ? `<button class="button soft sm" type="button" data-internal-job-close="${esc(posting.id)}">Close</button>`
                : posting.status === 'closed'
                  ? `<button class="button soft sm" type="button" data-internal-job-reopen="${esc(posting.id)}">Reopen</button>`
                  : ''
            }
            ${
              canDeleteInternalJobPostings()
                ? `<button class="button danger sm" type="button" data-internal-job-delete="${esc(posting.id)}">Delete</button>`
                : ''
            }
          </div>`
        : '<span class="muted">View only</span>';

      return `
        <tr data-posting-row="${esc(posting.id)}">
          <td>${esc(posting.title)}</td>
          <td>${esc(posting.department)}</td>
          <td>${esc(posting.hiring_manager_name)}</td>
          <td><span class="${statusBadgeClass(posting.status)}">${esc(formatInternalJobStatus(posting.status))}</span></td>
          <td>${esc(formatDateLabel(posting.posting_date))}</td>
          <td>${esc(formatDateLabel(posting.closing_date))}</td>
          <td>${interestCountForPosting(posting.id)}</td>
          <td>${actions}</td>
        </tr>
      `;
    })
    .join('');

  syncInternalJobMobileList(
    'mobileInternalJobManageList',
    postings
      .map(
        (posting) => `
        <article class="orbis-mobile-module-card">
          <strong>${esc(posting.title)}</strong>
          <div class="muted">${esc(posting.department)} · ${esc(posting.hiring_manager_name)}</div>
          <div style="margin-top:8px"><span class="${statusBadgeClass(posting.status)}">${esc(formatInternalJobStatus(posting.status))}</span></div>
          <div class="muted" style="margin-top:8px">${interestCountForPosting(posting.id)} interested</div>
          <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
            <button class="button soft sm" type="button" data-internal-job-edit="${esc(posting.id)}">Edit</button>
            <button class="button soft sm" type="button" data-internal-job-pipeline-posting="${esc(posting.id)}">View interest</button>
          </div>
        </article>
      `
      )
      .join('')
  );

  window.refreshMobileTables?.();
}

function filteredPipelineInterests(): InternalJobInterest[] {
  const status = String(safeGet<HTMLSelectElement>('internalJobPipelineStatusFilter')?.value || '')
    .trim()
    .toLowerCase();

  return cachedInterests.filter((interest) => {
    if (!canViewInternalJobInterest(interest)) return false;
    if (status && interest.status !== status) return false;
    return true;
  });
}

function renderPipeline(): void {
  const tbody = safeGet<HTMLTableSectionElement>('internalJobPipelineBody');
  const countEl = safeGet('internalJobPipelineCount');
  const interests = filteredPipelineInterests();

  if (countEl) {
    countEl.textContent = `${interests.length} submission${interests.length === 1 ? '' : 's'}`;
  }

  if (!tbody) return;

  if (!interests.length) {
    tbody.innerHTML =
      '<tr><td colspan="7" class="empty">No internal interest submissions yet.</td></tr>';
    syncInternalJobMobileList(
      'mobileInternalJobPipelineList',
      '<div class="orbis-mobile-empty muted">No internal interest submissions yet.</div>'
    );
    window.refreshMobileTables?.();
    return;
  }

  tbody.innerHTML = interests
    .map((interest) => {
      const postingTitle =
        interest.internal_job_postings?.title ||
        cachedPostings.find((posting) => posting.id === interest.posting_id)?.title ||
        'Opening';

      const statusOptions = INTERNAL_JOB_INTEREST_STATUSES.map(
        (status) =>
          `<option value="${esc(status)}" ${status === interest.status ? 'selected' : ''}>${esc(formatInternalJobStatus(status))}</option>`
      ).join('');

      return `
        <tr data-interest-row="${esc(interest.id)}">
          <td>
            <strong>${esc(interest.employee_name)}</strong>
            <div class="muted">${esc(interest.employee_id)}</div>
          </td>
          <td>${esc(postingTitle)}</td>
          <td>${esc(interest.employee_department)}</td>
          <td>${esc(interest.employee_supervisor)}</td>
          <td>${esc(formatDateTimeLabel(interest.submitted_at))}</td>
          <td><span class="${statusBadgeClass(interest.status)}">${esc(formatInternalJobStatus(interest.status))}</span></td>
          <td>
            <select class="select" data-internal-job-interest-status="${esc(interest.id)}" aria-label="Candidate status">
              ${statusOptions}
            </select>
            ${
              interest.interest_note
                ? `<div class="muted" style="margin-top:6px;font-size:0.82rem">"${esc(interest.interest_note)}"</div>`
                : ''
            }
          </td>
        </tr>
      `;
    })
    .join('');

  syncInternalJobMobileList(
    'mobileInternalJobPipelineList',
    interests
      .map((interest) => {
        const postingTitle =
          interest.internal_job_postings?.title ||
          cachedPostings.find((posting) => posting.id === interest.posting_id)?.title ||
          'Opening';
        const statusOptions = INTERNAL_JOB_INTEREST_STATUSES.map(
          (status) =>
            `<option value="${esc(status)}" ${status === interest.status ? 'selected' : ''}>${esc(formatInternalJobStatus(status))}</option>`
        ).join('');
        return `
          <article class="orbis-mobile-module-card">
            <strong>${esc(interest.employee_name)}</strong>
            <div class="muted">${esc(postingTitle)}</div>
            <div class="muted">${esc(formatDateTimeLabel(interest.submitted_at))}</div>
            <div class="field" style="margin-top:10px">
              <label for="mobileInterestStatus-${esc(interest.id)}">Status</label>
              <select
                class="select"
                id="mobileInterestStatus-${esc(interest.id)}"
                data-internal-job-interest-status="${esc(interest.id)}"
                aria-label="Candidate status"
              >
                ${statusOptions}
              </select>
            </div>
            ${
              interest.interest_note
                ? `<div class="muted" style="margin-top:6px;font-size:0.82rem">"${esc(interest.interest_note)}"</div>`
                : ''
            }
          </article>
        `;
      })
      .join('')
  );

  window.refreshMobileTables?.();
}

function updateDashboardMetrics(): void {
  if (!canManageInternalJobPostings()) return;

  const openCount = cachedPostings.filter((posting) => posting.status === 'open').length;
  const newInterest = cachedInterests.filter(
    (row) => row.status === 'new' && canViewInternalJobInterest(row)
  ).length;
  const inReview = cachedInterests.filter(
    (row) =>
      (row.status === 'reviewed' || row.status === 'interviewing') &&
      canViewInternalJobInterest(row)
  ).length;

  const setValue = (id: string, value: string) => {
    const el = safeGet(id);
    if (el) el.textContent = value;
  };

  setValue('kInternalJobsOpen', String(openCount));
  setValue('kInternalJobsNewInterest', String(newInterest));
  setValue('kInternalJobsInReview', String(inReview));
}

async function loadMyInterestIds(): Promise<void> {
  myInterestPostingIds = new Set();
  const linkedId = getLinkedEmployeeId();
  if (!linkedId) return;

  const { data, error } = await supabaseClient
    .from('internal_job_interest')
    .select('posting_id')
    .eq('employee_id', linkedId);

  if (error) {
    console.warn('[InternalJobBoard] Could not load my interest:', error);
    return;
  }

  myInterestPostingIds = new Set(
    (data || []).map((row) => String(row.posting_id || '')).filter(Boolean)
  );
}

export async function loadInternalJobBoard(force = false): Promise<void> {
  applyInternalJobBoardAccessUi();
  populateStatusFilters();

  if (!force && boardHydrated) {
    renderOpenPostings();
    if (canManageInternalJobPostings()) {
      renderManagePostings();
      renderPipeline();
      updateDashboardMetrics();
    }
    return;
  }

  const openingsList = safeGet('internalJobOpeningsList');
  if (openingsList) {
    openingsList.innerHTML = '<div class="muted">Loading openings…</div>';
  }

  const postingPromise = supabaseClient
    .from('internal_job_postings')
    .select('*')
    .order('posting_date', { ascending: false });

  const interestPromise = canManageInternalJobPostings()
    ? supabaseClient
        .from('internal_job_interest')
        .select('*, internal_job_postings(title, department, hiring_manager_name, status)')
        .order('submitted_at', { ascending: false })
    : Promise.resolve({ data: [], error: null });

  const [postingsRes, interestsRes] = await Promise.all([postingPromise, interestPromise]);

  if (postingsRes.error) {
    console.error('[InternalJobBoard] Postings load failed:', postingsRes.error);
    if (openingsList) {
      openingsList.innerHTML =
        '<div class="empty">Could not load openings. Try refreshing the page.</div>';
    }
    showToast('Could not load internal job postings.', 'error');
    return;
  }

  cachedPostings = (postingsRes.data || []) as InternalJobPosting[];

  if (interestsRes.error) {
    console.warn('[InternalJobBoard] Interest load failed:', interestsRes.error);
    cachedInterests = [];
  } else {
    cachedInterests = (interestsRes.data || []) as InternalJobInterest[];
  }

  await loadMyInterestIds();

  boardHydrated = true;
  renderOpenPostings();

  if (canManageInternalJobPostings()) {
    renderManagePostings();
    renderPipeline();
    updateDashboardMetrics();
  }
}

function readPostingFormValues(): Partial<InternalJobPosting> | null {
  const title = String(safeGet<HTMLInputElement>('internalJobFormTitle')?.value || '').trim();
  const department = String(safeGet<HTMLInputElement>('internalJobFormDepartment')?.value || '').trim();
  const hiringManager = String(
    safeGet<HTMLInputElement>('internalJobFormHiringManager')?.value || ''
  ).trim();
  const location = String(safeGet<HTMLInputElement>('internalJobFormLocation')?.value || '').trim();
  const employmentType = String(
    safeGet<HTMLSelectElement>('internalJobFormEmploymentType')?.value || 'full_time'
  ).trim() as InternalJobPosting['employment_type'];
  const shortDescription = String(
    safeGet<HTMLTextAreaElement>('internalJobFormShortDescription')?.value || ''
  ).trim();
  const responsibilities = String(
    safeGet<HTMLTextAreaElement>('internalJobFormResponsibilities')?.value || ''
  ).trim();
  const qualifications = String(
    safeGet<HTMLTextAreaElement>('internalJobFormQualifications')?.value || ''
  ).trim();
  const payRange = String(safeGet<HTMLInputElement>('internalJobFormPayRange')?.value || '').trim();
  const postingDate = String(safeGet<HTMLInputElement>('internalJobFormPostingDate')?.value || '').trim();
  const closingDate = String(safeGet<HTMLInputElement>('internalJobFormClosingDate')?.value || '').trim();
  const status = String(safeGet<HTMLSelectElement>('internalJobFormStatus')?.value || 'draft').trim() as InternalJobPostingStatus;

  if (!title || !department || !hiringManager) {
    showToast('Title, department, and hiring manager are required.', 'error');
    return null;
  }

  return {
    title,
    department,
    hiring_manager_name: hiringManager,
    location,
    employment_type: employmentType,
    short_description: shortDescription,
    responsibilities,
    qualifications,
    pay_range: payRange || null,
    posting_date: postingDate || todayInputValue(),
    closing_date: closingDate || null,
    status,
  };
}

function ensurePostingFormModal(): HTMLElement {
  let modal = document.getElementById('internalJobPostingModal');
  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = 'internalJobPostingModal';
  modal.className = 'orbis-modal-backdrop hidden';
  modal.innerHTML = `
    <div class="orbis-modal" role="dialog" aria-modal="true" aria-labelledby="internalJobPostingModalTitle">
      <div class="orbis-modal-header">
        <h2 id="internalJobPostingModalTitle">New Internal Posting</h2>
        <button class="button soft sm" type="button" id="internalJobPostingModalClose">Close</button>
      </div>
      <div class="orbis-modal-body">
        <div class="field-grid two-col">
          <div class="field">
            <label for="internalJobFormTitle">Job title</label>
            <input class="input" id="internalJobFormTitle" type="text" />
          </div>
          <div class="field">
            <label for="internalJobFormDepartment">Department</label>
            <input class="input" id="internalJobFormDepartment" type="text" />
          </div>
          <div class="field">
            <label for="internalJobFormHiringManager">Hiring manager</label>
            <input class="input" id="internalJobFormHiringManager" type="text" />
          </div>
          <div class="field">
            <label for="internalJobFormLocation">Location</label>
            <input class="input" id="internalJobFormLocation" type="text" />
          </div>
          <div class="field">
            <label for="internalJobFormEmploymentType">Employment type</label>
            <select class="select" id="internalJobFormEmploymentType">
              ${INTERNAL_JOB_EMPLOYMENT_TYPES.map(
                (type) =>
                  `<option value="${esc(type)}">${esc(formatInternalJobStatus(type))}</option>`
              ).join('')}
            </select>
          </div>
          <div class="field">
            <label for="internalJobFormStatus">Status</label>
            <select class="select" id="internalJobFormStatus">
              ${INTERNAL_JOB_STATUSES.map(
                (status) =>
                  `<option value="${esc(status)}">${esc(formatInternalJobStatus(status))}</option>`
              ).join('')}
            </select>
          </div>
          <div class="field">
            <label for="internalJobFormPostingDate">Posting date</label>
            <input class="input" id="internalJobFormPostingDate" type="date" />
          </div>
          <div class="field">
            <label for="internalJobFormClosingDate">Closing date (optional)</label>
            <input class="input" id="internalJobFormClosingDate" type="date" />
          </div>
          <div class="field">
            <label for="internalJobFormPayRange">Pay range (optional)</label>
            <input class="input" id="internalJobFormPayRange" type="text" placeholder="e.g. $55,000 – $65,000" />
          </div>
        </div>
        <div class="field">
          <label for="internalJobFormShortDescription">Short description</label>
          <textarea class="input" id="internalJobFormShortDescription" rows="3"></textarea>
        </div>
        <div class="field">
          <label for="internalJobFormResponsibilities">Responsibilities</label>
          <textarea class="input" id="internalJobFormResponsibilities" rows="4"></textarea>
        </div>
        <div class="field">
          <label for="internalJobFormQualifications">Qualifications</label>
          <textarea class="input" id="internalJobFormQualifications" rows="4"></textarea>
        </div>
      </div>
      <div class="orbis-modal-footer">
        <button class="button soft" type="button" id="internalJobPostingModalCancel">Cancel</button>
        <button class="button primary" type="button" id="internalJobPostingModalSave">Save posting</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  return modal;
}

function closePostingModal(): void {
  const modal = document.getElementById('internalJobPostingModal');
  if (!modal) return;
  modal.classList.add('hidden');
  editingPostingId = null;
}

function openPostingModal(posting?: InternalJobPosting | null): void {
  if (!canManageInternalJobPostings()) return;

  const modal = ensurePostingFormModal();
  editingPostingId = posting?.id || null;

  const title = modal.querySelector('#internalJobPostingModalTitle');
  if (title) {
    title.textContent = posting ? 'Edit Internal Posting' : 'New Internal Posting';
  }

  safeGet<HTMLInputElement>('internalJobFormTitle')!.value = posting?.title || '';
  safeGet<HTMLInputElement>('internalJobFormDepartment')!.value = posting?.department || '';
  safeGet<HTMLInputElement>('internalJobFormHiringManager')!.value =
    posting?.hiring_manager_name || resolveCurrentUserDisplayName();
  safeGet<HTMLInputElement>('internalJobFormLocation')!.value = posting?.location || '';
  safeGet<HTMLSelectElement>('internalJobFormEmploymentType')!.value =
    posting?.employment_type || 'full_time';
  safeGet<HTMLTextAreaElement>('internalJobFormShortDescription')!.value =
    posting?.short_description || '';
  safeGet<HTMLTextAreaElement>('internalJobFormResponsibilities')!.value =
    posting?.responsibilities || '';
  safeGet<HTMLTextAreaElement>('internalJobFormQualifications')!.value =
    posting?.qualifications || '';
  safeGet<HTMLInputElement>('internalJobFormPayRange')!.value = posting?.pay_range || '';
  safeGet<HTMLInputElement>('internalJobFormPostingDate')!.value =
    posting?.posting_date || todayInputValue();
  safeGet<HTMLInputElement>('internalJobFormClosingDate')!.value = posting?.closing_date || '';
  safeGet<HTMLSelectElement>('internalJobFormStatus')!.value = posting?.status || 'draft';

  modal.classList.remove('hidden');
}

async function savePostingRecord(): Promise<void> {
  const values = readPostingFormValues();
  if (!values) return;

  const {
    data: { user },
  } = await supabaseClient.auth.getUser();

  const payload = {
    ...values,
    updated_by: user?.id || null,
  };

  if (editingPostingId) {
    const existing = cachedPostings.find((posting) => posting.id === editingPostingId);
    if (!existing || !canManageInternalJobPosting(existing)) {
      showToast('You do not have permission to edit this posting.', 'error');
      return;
    }

    const { error } = await supabaseClient
      .from('internal_job_postings')
      .update(payload)
      .eq('id', editingPostingId);

    if (error) {
      console.error('[InternalJobBoard] Update failed:', error);
      showToast('Could not save posting.', 'error');
      return;
    }

    await recordInternalJobPostingEvent(editingPostingId, 'posting_edited', {
      note: `Updated ${values.title}`,
    });

    showToast('Posting updated.');
  } else {
    const { data, error } = await supabaseClient
      .from('internal_job_postings')
      .insert({ ...payload, created_by: user?.id || null })
      .select('*')
      .single();

    if (error || !data) {
      console.error('[InternalJobBoard] Insert failed:', error);
      showToast('Could not create posting.', 'error');
      return;
    }

    await recordInternalJobPostingEvent(String(data.id), 'posting_created', {
      note: values.title || '',
    });

    showToast('Posting created.');
  }

  closePostingModal();
  boardHydrated = false;
  await loadInternalJobBoard(true);

  const { refreshDerivedUiProfile } = await import('../services/derivedDataRefresh');
  await refreshDerivedUiProfile('jobBoard');
  if (typeof window.updateWorkspaceAlerts === 'function') {
    window.updateWorkspaceAlerts();
  }
}

async function updatePostingStatus(
  postingId: string,
  status: InternalJobPostingStatus,
  confirmMessage: string
): Promise<void> {
  const posting = cachedPostings.find((row) => row.id === postingId);
  if (!posting || !canManageInternalJobPosting(posting)) {
    showToast('You do not have permission to update this posting.', 'error');
    return;
  }

  const confirmed = await showOrbisConfirm(confirmMessage);
  if (!confirmed) return;

  const {
    data: { user },
  } = await supabaseClient.auth.getUser();

  const { error } = await supabaseClient
    .from('internal_job_postings')
    .update({ status, updated_by: user?.id || null })
    .eq('id', postingId);

  if (error) {
    console.error('[InternalJobBoard] Status update failed:', error);
    showToast('Could not update posting status.', 'error');
    return;
  }

  await recordInternalJobPostingEvent(postingId, status === 'closed' ? 'posting_closed' : 'posting_edited', {
    fieldName: 'status',
    oldValue: posting.status,
    newValue: status,
  });

  showToast(`Posting marked ${formatInternalJobStatus(status).toLowerCase()}.`);
  boardHydrated = false;
  await loadInternalJobBoard(true);
}

async function deletePosting(postingId: string): Promise<void> {
  const posting = cachedPostings.find((row) => row.id === postingId);
  if (!posting || !canDeleteInternalJobPostings()) {
    showToast('You do not have permission to delete postings.', 'error');
    return;
  }

  const confirmed = await showOrbisConfirm(
    `Delete "${posting.title}"? This will remove all interest submissions for this opening.`
  );
  if (!confirmed) return;

  const { error } = await supabaseClient.from('internal_job_postings').delete().eq('id', postingId);

  if (error) {
    console.error('[InternalJobBoard] Delete failed:', error);
    showToast('Could not delete posting.', 'error');
    return;
  }

  showToast('Posting deleted.');
  boardHydrated = false;
  await loadInternalJobBoard(true);
}

async function submitInterest(postingId: string): Promise<void> {
  if (!canSubmitInternalJobInterest()) {
    showToast('Your account is not linked to an employee record.', 'error');
    return;
  }

  if (myInterestPostingIds.has(postingId)) {
    showToast('You have already expressed interest in this opening.', 'info');
    return;
  }

  const note = String(
    safeGet<HTMLTextAreaElement>(`internalJobInterestNote-${postingId}`)?.value || ''
  ).trim();

  const { data, error } = await supabaseClient.rpc('orbis_submit_internal_job_interest', {
    p_posting_id: postingId,
    p_interest_note: note || null,
  });

  if (error) {
    console.error('[InternalJobBoard] Interest submit failed:', error);
    showToast(error.message || 'Could not submit interest.', 'error');
    return;
  }

  if (data) {
    myInterestPostingIds.add(postingId);
    showToast('Interest submitted — HR and your hiring manager have been notified.');
    renderOpenPostings();

    const { refreshDerivedUiProfile } = await import('../services/derivedDataRefresh');
    await refreshDerivedUiProfile('jobBoard');
    if (typeof window.updateWorkspaceAlerts === 'function') {
      window.updateWorkspaceAlerts();
    }
  }
}

async function updateInterestStatus(interestId: string, status: InternalJobInterestStatus): Promise<void> {
  const interest = cachedInterests.find((row) => row.id === interestId);
  if (!interest || !canViewInternalJobInterest(interest)) {
    showToast('You do not have permission to update this candidate.', 'error');
    return;
  }

  const previous = interest.status;
  if (previous === status) return;

  const {
    data: { user },
  } = await supabaseClient.auth.getUser();

  const { error } = await supabaseClient
    .from('internal_job_interest')
    .update({ status, updated_by: user?.id || null })
    .eq('id', interestId);

  if (error) {
    console.error('[InternalJobBoard] Interest status update failed:', error);
    showToast('Could not update candidate status.', 'error');
    return;
  }

  await recordInternalJobPostingEvent(interest.posting_id, 'interest_status_changed', {
    interestId,
    fieldName: 'status',
    oldValue: previous,
    newValue: status,
    note: `${interest.employee_name} → ${formatInternalJobStatus(status)}`,
  });

  interest.status = status;
  renderPipeline();
  updateDashboardMetrics();

  const { refreshDerivedUiProfile } = await import('../services/derivedDataRefresh');
  await refreshDerivedUiProfile('jobBoard');
}

async function showPostingDetails(postingId: string): Promise<void> {
  const posting = cachedPostings.find((row) => row.id === postingId);
  if (!posting) return;

  const details = [
    `Department: ${posting.department}`,
    `Hiring manager: ${posting.hiring_manager_name}`,
    posting.location ? `Location: ${posting.location}` : '',
    `Employment type: ${formatInternalJobStatus(posting.employment_type)}`,
    posting.pay_range ? `Pay range: ${posting.pay_range}` : '',
    '',
    posting.short_description,
    '',
    'Responsibilities:',
    posting.responsibilities,
    '',
    'Qualifications:',
    posting.qualifications,
  ]
    .filter(Boolean)
    .join('\n');

  await showOrbisConfirm(`${posting.title}\n\n${details}`, {
    title: 'Opening details',
    confirmLabel: 'Close',
    cancelLabel: '',
  });
}

export async function loadEmployeeInternalJobInterests(employeeId: string): Promise<void> {
  const container = safeGet('employeeInternalJobInterestsList');
  const card = safeGet('employeeInternalJobInterestsCard');
  if (!container || !card) return;

  if (isEmployeeUser() || (!isAdminUser() && !isSupervisorUser())) {
    card.classList.add('hidden');
    return;
  }

  card.classList.remove('hidden');
  container.innerHTML = '<div class="muted">Loading internal job interest…</div>';

  const { data, error } = await supabaseClient
    .from('internal_job_interest')
    .select('*, internal_job_postings(title, status)')
    .eq('employee_id', employeeId)
    .order('submitted_at', { ascending: false });

  if (error) {
    console.warn('[InternalJobBoard] Employee interest load failed:', error);
    container.innerHTML = '<div class="empty">Could not load internal job interest.</div>';
    return;
  }

  const rows = (data || []) as InternalJobInterest[];
  if (!rows.length) {
    container.innerHTML =
      '<div class="empty">No internal job interest recorded for this employee.</div>';
    return;
  }

  container.innerHTML = rows
    .map((row) => {
      const title = row.internal_job_postings?.title || 'Opening';
      return `
        <div class="internal-job-drawer-item">
          <strong>${esc(title)}</strong>
          <div class="muted">${esc(formatDateTimeLabel(row.submitted_at))}</div>
          <div style="margin-top:6px"><span class="${statusBadgeClass(row.status)}">${esc(formatInternalJobStatus(row.status))}</span></div>
          ${row.interest_note ? `<div class="muted" style="margin-top:6px">"${esc(row.interest_note)}"</div>` : ''}
        </div>
      `;
    })
    .join('');
}

export function openInternalJobBoardView(postingId?: string, tab: InternalJobTab = 'openings'): void {
  if (typeof window.switchMainView === 'function') {
    window.switchMainView('internalJobBoardView');
  }

  if (canManageInternalJobPostings()) {
    setInternalJobTab(tab);
  }

  void loadInternalJobBoard(true).then(() => {
    if (postingId && tab === 'pipeline') {
      const filter = safeGet<HTMLSelectElement>('internalJobPipelineStatusFilter');
      if (filter) filter.value = '';
      renderPipeline();
    }
  });
}

function bindInternalJobBoardEvents(): void {
  if (bindingsReady) return;
  bindingsReady = true;

  safeGet('refreshInternalJobBoardBtn')?.addEventListener('click', () => {
    boardHydrated = false;
    void loadInternalJobBoard(true);
  });

  safeGet('newInternalJobPostingBtn')?.addEventListener('click', () => openPostingModal());

  document.querySelectorAll('[data-internal-job-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      const tab = String((button as HTMLElement).dataset.internalJobTab || 'openings') as InternalJobTab;
      setInternalJobTab(tab);
    });
  });

  safeGet('internalJobManageSearch')?.addEventListener('input', () => renderManagePostings());
  safeGet('internalJobManageStatusFilter')?.addEventListener('change', () => renderManagePostings());
  safeGet('internalJobPipelineStatusFilter')?.addEventListener('change', () => renderPipeline());

  document.body.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;

    if (target.id === 'internalJobPostingModalClose' || target.id === 'internalJobPostingModalCancel') {
      closePostingModal();
      return;
    }

    if (target.id === 'internalJobPostingModalSave') {
      void savePostingRecord();
      return;
    }

    const interestBtn = target.closest('[data-internal-job-interest]') as HTMLElement | null;
    if (interestBtn?.dataset.internalJobInterest) {
      void submitInterest(interestBtn.dataset.internalJobInterest);
      return;
    }

    const editBtn = target.closest('[data-internal-job-edit]') as HTMLElement | null;
    if (editBtn?.dataset.internalJobEdit) {
      const posting = cachedPostings.find((row) => row.id === editBtn.dataset.internalJobEdit);
      openPostingModal(posting || null);
      return;
    }

    const closeBtn = target.closest('[data-internal-job-close]') as HTMLElement | null;
    if (closeBtn?.dataset.internalJobClose) {
      void updatePostingStatus(
        closeBtn.dataset.internalJobClose,
        'closed',
        'Close this posting? Employees will no longer see it on the job board.'
      );
      return;
    }

    const reopenBtn = target.closest('[data-internal-job-reopen]') as HTMLElement | null;
    if (reopenBtn?.dataset.internalJobReopen) {
      void updatePostingStatus(
        reopenBtn.dataset.internalJobReopen,
        'open',
        'Reopen this posting for employee interest?'
      );
      return;
    }

    const deleteBtn = target.closest('[data-internal-job-delete]') as HTMLElement | null;
    if (deleteBtn?.dataset.internalJobDelete) {
      void deletePosting(deleteBtn.dataset.internalJobDelete);
      return;
    }

    const detailsBtn = target.closest('[data-internal-job-details]') as HTMLElement | null;
    if (detailsBtn?.dataset.internalJobDetails) {
      void showPostingDetails(detailsBtn.dataset.internalJobDetails);
      return;
    }

    const pipelineBtn = target.closest('[data-internal-job-pipeline-posting]') as HTMLElement | null;
    if (pipelineBtn?.dataset.internalJobPipelinePosting) {
      setInternalJobTab('pipeline');
    }
  });

  document.body.addEventListener('change', (event) => {
    const target = event.target as HTMLSelectElement | null;
    if (!target?.dataset.internalJobInterestStatus) return;
    void updateInterestStatus(
      target.dataset.internalJobInterestStatus,
      target.value as InternalJobInterestStatus
    );
  });
}

export function ensureInternalJobBoardLoaded(force = false): void {
  bindInternalJobBoardEvents();
  applyInternalJobBoardAccessUi();

  if (!force && boardHydrated) return;
  void loadInternalJobBoard(force);
}

function registerWindowGlobals(): void {
  const globalRef = globalThis as typeof globalThis & {
    loadInternalJobBoard?: typeof loadInternalJobBoard;
    ensureInternalJobBoardLoaded?: typeof ensureInternalJobBoardLoaded;
    openInternalJobBoardView?: typeof openInternalJobBoardView;
    loadEmployeeInternalJobInterests?: typeof loadEmployeeInternalJobInterests;
  };

  globalRef.loadInternalJobBoard = loadInternalJobBoard;
  globalRef.ensureInternalJobBoardLoaded = ensureInternalJobBoardLoaded;
  globalRef.openInternalJobBoardView = openInternalJobBoardView;
  globalRef.loadEmployeeInternalJobInterests = loadEmployeeInternalJobInterests;
}

registerWindowGlobals();
bindInternalJobBoardEvents();
