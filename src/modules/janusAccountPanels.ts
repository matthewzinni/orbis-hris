import { canEditJanus, isAdminUser } from '../services/access';
import { initJanusMeetingDictation, stopJanusMeetingDictation } from './dictation';
import {
  buildFallbackMeetingSummary,
  requestJanusMeetingSummary,
} from '../services/janusMeetingAi';
import {
  deleteJanusDocument,
  getJanusDocumentSignedUrl,
  uploadJanusDocument,
} from '../services/janusDocuments';
import { openJanusMeetingRequestEmail } from '../services/janusMeetingEmail';
import {
  createJanusActivity,
  createJanusMeeting,
  fetchJanusAccount,
  fetchJanusActivities,
  fetchJanusContacts,
  fetchJanusDocuments,
  fetchJanusMeetings,
  deleteJanusMeeting,
  updateJanusMeeting,
} from '../services/janusStore';
import { showOrbisConfirm } from '../ui/confirmModal';
import {
  type JanusAccount,
  type JanusActivity,
  type JanusContact,
  type JanusDocument,
  type JanusMeeting,
  JANUS_ACTIVITY_TYPES,
  formatJanusDateLabel,
  janusActivityTypeLabel,
  janusContactDisplayName,
  janusDocumentTypeLabel,
} from '../types/janusTypes';

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

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseAttendees(raw: string): string[] {
  return String(raw || '')
    .split(/[,;\n]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function clearActivityForm(): void {
  safeGet<HTMLSelectElement>('janusActivityTypeInput')!.value = 'call';
  safeGet<HTMLInputElement>('janusActivityDateInput')!.value = todayIso();
  safeGet<HTMLInputElement>('janusActivitySubjectInput')!.value = '';
  safeGet<HTMLSelectElement>('janusActivityContactInput')!.value = '';
  safeGet<HTMLTextAreaElement>('janusActivityBodyInput')!.value = '';
}

function populateActivityTypeSelect(): void {
  const select = safeGet<HTMLSelectElement>('janusActivityTypeInput');
  if (!select || select.options.length) return;

  JANUS_ACTIVITY_TYPES.forEach((type) => {
    const option = document.createElement('option');
    option.value = type;
    option.textContent = janusActivityTypeLabel(type);
    select.appendChild(option);
  });
}

function populateActivityContactSelect(contacts: JanusContact[]): void {
  const select = safeGet<HTMLSelectElement>('janusActivityContactInput');
  if (!select) return;

  const current = select.value;
  select.innerHTML = '<option value="">—</option>';
  contacts.forEach((contact) => {
    const option = document.createElement('option');
    option.value = contact.id;
    option.textContent = janusContactDisplayName(contact);
    select.appendChild(option);
  });
  if (current && contacts.some((contact) => contact.id === current)) {
    select.value = current;
  }
}

async function saveActivityRecord(accountId: string): Promise<void> {
  if (!canEditJanus()) {
    showToast('Read-only access.', 'error');
    return;
  }

  const subject = String(safeGet<HTMLInputElement>('janusActivitySubjectInput')?.value || '').trim();
  if (!subject) {
    showToast('Subject is required.', 'error');
    return;
  }

  const contactId = String(safeGet<HTMLSelectElement>('janusActivityContactInput')?.value || '').trim();

  try {
    await createJanusActivity({
      account_id: accountId,
      contact_id: contactId || null,
      activity_type: (safeGet<HTMLSelectElement>('janusActivityTypeInput')?.value ||
        'note') as JanusActivity['activity_type'],
      activity_date: safeGet<HTMLInputElement>('janusActivityDateInput')?.value || todayIso(),
      subject,
      body: safeGet<HTMLTextAreaElement>('janusActivityBodyInput')?.value || null,
    });
    clearActivityForm();
    await refreshJanusAccountPanels(accountId, 'activity');
    showToast('Activity saved.');
    if (typeof window.loadJanus === 'function') {
      void window.loadJanus(true);
    }
  } catch (err) {
    showToast(err instanceof Error ? err.message : 'Could not save activity.', 'error');
  }
}

function renderMeetingsList(meetings: JanusMeeting[]): void {
  const list = safeGet('janusMeetingsList');
  if (!list) return;

  meetingCache.clear();
  meetings.forEach((meeting) => meetingCache.set(meeting.id, meeting));

  if (!meetings.length) {
    list.innerHTML = '<div class="muted janus-empty">No meetings logged yet.</div>';
    return;
  }

  list.innerHTML = meetings
    .map(
      (meeting) => `
      <article class="janus-meeting-row${meeting.id === editingMeetingId ? ' is-selected' : ''}">
        <div class="janus-meeting-row-main">
          <div class="janus-meeting-row-top">
            <strong>${esc(meeting.title)}</strong>
            <span class="badge badge-soft">${esc(formatJanusDateLabel(meeting.meeting_date))}</span>
          </div>
          ${meeting.summary ? `<p class="janus-meeting-summary">${esc(meeting.summary)}</p>` : ''}
          ${
            meeting.action_items
              ? `<pre class="janus-meeting-actions muted">${esc(meeting.action_items)}</pre>`
              : ''
          }
          ${
            meeting.follow_up_date
              ? `<p class="muted janus-meeting-followup">Follow up ${esc(formatJanusDateLabel(meeting.follow_up_date))}</p>`
              : ''
          }
        </div>
        <div class="janus-meeting-row-actions">
          <button type="button" class="button soft sm" data-janus-open-meeting-id="${esc(meeting.id)}">Open</button>
          ${
            canEditJanus()
              ? `<button type="button" class="button soft sm" data-janus-delete-meeting="${esc(meeting.id)}">Delete</button>`
              : ''
          }
        </div>
      </article>
    `
    )
    .join('');
}

function renderDocumentsList(documents: JanusDocument[]): void {
  const list = safeGet('janusDocumentsList');
  if (!list) return;

  if (!documents.length) {
    list.innerHTML = '<div class="muted janus-empty">No documents uploaded yet.</div>';
    return;
  }

  list.innerHTML = documents
    .map(
      (doc) => `
      <article class="janus-document-row">
        <div class="janus-document-row-main">
          <strong>${esc(doc.title)}</strong>
          <div class="muted">${esc(janusDocumentTypeLabel(doc.document_type))} · ${esc(doc.file_name)}</div>
          ${
            doc.effective_date
              ? `<div class="muted">Effective ${esc(formatJanusDateLabel(doc.effective_date))}</div>`
              : ''
          }
        </div>
        <div class="janus-document-actions">
          <button type="button" class="button soft sm" data-janus-open-doc="${esc(doc.id)}" data-janus-doc-path="${esc(doc.file_path)}">Open</button>
          ${
            canEditJanus()
              ? `<button type="button" class="button soft sm" data-janus-delete-doc="${esc(doc.id)}">Delete</button>`
              : ''
          }
        </div>
      </article>
    `
    )
    .join('');
}

function renderActivityTimeline(
  activities: JanusActivity[],
  meetings: JanusMeeting[]
): void {
  const list = safeGet('janusActivityList');
  if (!list) return;

  type TimelineItem = {
    sortKey: string;
    html: string;
  };

  const items: TimelineItem[] = [];

  activities.forEach((activity) => {
    items.push({
      sortKey: `${activity.activity_date}T${activity.created_at}`,
      html: `
        <article class="janus-activity-row">
          <div class="janus-activity-top">
            <span class="badge badge-soft">${esc(janusActivityTypeLabel(activity.activity_type))}</span>
            <span class="muted">${esc(formatJanusDateLabel(activity.activity_date))}</span>
          </div>
          <strong>${esc(activity.subject)}</strong>
          ${activity.body ? `<p class="muted">${esc(activity.body)}</p>` : ''}
        </article>
      `,
    });
  });

  meetings.forEach((meeting) => {
    items.push({
      sortKey: `${meeting.meeting_date}T${meeting.created_at}`,
      html: `
        <article class="janus-activity-row">
          <div class="janus-activity-top">
            <span class="badge badge-soft">Meeting</span>
            <span class="muted">${esc(formatJanusDateLabel(meeting.meeting_date))}</span>
          </div>
          <strong>${esc(meeting.title)}</strong>
          ${meeting.summary ? `<p class="muted">${esc(meeting.summary)}</p>` : ''}
        </article>
      `,
    });
  });

  items.sort((a, b) => (a.sortKey < b.sortKey ? 1 : -1));

  if (!items.length) {
    list.innerHTML = '<div class="muted janus-empty">No activity yet.</div>';
    return;
  }

  list.innerHTML = items.map((item) => item.html).join('');
}

function clearMeetingForm(): void {
  editingMeetingId = null;
  safeGet<HTMLInputElement>('janusMeetingDateInput')!.value = todayIso();
  safeGet<HTMLInputElement>('janusMeetingTimeInput')!.value = '';
  safeGet<HTMLInputElement>('janusMeetingTitleInput')!.value = '';
  safeGet<HTMLInputElement>('janusMeetingAttendeesInput')!.value = '';
  safeGet<HTMLTextAreaElement>('janusMeetingTranscriptInput')!.value = '';
  safeGet<HTMLTextAreaElement>('janusMeetingSummaryInput')!.value = '';
  safeGet<HTMLTextAreaElement>('janusMeetingActionsInput')!.value = '';
  safeGet<HTMLInputElement>('janusMeetingFollowUpInput')!.value = '';
  updateMeetingFormUi();
}

function fillMeetingForm(meeting: JanusMeeting): void {
  editingMeetingId = meeting.id;
  safeGet<HTMLInputElement>('janusMeetingDateInput')!.value = meeting.meeting_date || todayIso();
  safeGet<HTMLInputElement>('janusMeetingTimeInput')!.value = '';
  safeGet<HTMLInputElement>('janusMeetingTitleInput')!.value = meeting.title || '';
  safeGet<HTMLInputElement>('janusMeetingAttendeesInput')!.value = (meeting.attendees || []).join(', ');
  safeGet<HTMLTextAreaElement>('janusMeetingTranscriptInput')!.value = meeting.transcript || '';
  safeGet<HTMLTextAreaElement>('janusMeetingSummaryInput')!.value = meeting.summary || '';
  safeGet<HTMLTextAreaElement>('janusMeetingActionsInput')!.value = meeting.action_items || '';
  safeGet<HTMLInputElement>('janusMeetingFollowUpInput')!.value = meeting.follow_up_date || '';
  updateMeetingFormUi();
  safeGet('janusMeetingFormCard')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function updateMeetingFormUi(): void {
  const isEditing = Boolean(editingMeetingId);
  const titleEl = safeGet('janusMeetingFormTitle');
  const saveBtn = safeGet<HTMLButtonElement>('janusSaveMeetingBtn');
  const clearBtn = safeGet<HTMLButtonElement>('janusClearMeetingBtn');

  if (titleEl) {
    titleEl.textContent = isEditing ? 'Meeting details' : 'Log meeting';
  }
  if (saveBtn) {
    saveBtn.textContent = isEditing ? 'Update meeting' : 'Save meeting';
  }
  clearBtn?.classList.toggle('hidden', !isEditing);
  safeGet<HTMLButtonElement>('janusDeleteMeetingBtn')?.classList.toggle('hidden', !isEditing || !canEditJanus());
}

export function resetJanusMeetingEditor(): void {
  clearMeetingForm();
}

export function clearJanusMeetingEmailContext(): void {
  cachedMeetingAccount = null;
  cachedMeetingContacts = [];
}

let panelsBound = false;
let editingMeetingId: string | null = null;
let cachedMeetingAccount: JanusAccount | null = null;
let cachedMeetingContacts: JanusContact[] = [];
const documentCache = new Map<string, JanusDocument>();
const meetingCache = new Map<string, JanusMeeting>();

export function syncJanusMeetingEmailContext(
  account: JanusAccount | null,
  contacts: JanusContact[]
): void {
  cachedMeetingAccount = account;
  cachedMeetingContacts = contacts;
}

function resolveMeetingEmailContact(): JanusContact | null {
  const primary =
    cachedMeetingContacts.find((contact) => contact.is_primary && contact.email) ||
    cachedMeetingContacts.find((contact) => contact.email) ||
    null;
  if (primary?.email) return primary;

  const attendees = safeGet<HTMLInputElement>('janusMeetingAttendeesInput')?.value || '';
  const emailMatch = attendees.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (!emailMatch) return null;

  return {
    id: '',
    account_id: cachedMeetingAccount?.id || '',
    first_name: '',
    last_name: '',
    title: null,
    email: emailMatch[0],
    phone: null,
    address_street: null,
    address_city: null,
    address_state: null,
    address_zip: null,
    notes: null,
    is_primary: false,
    copper_id: null,
    created_at: '',
    updated_at: '',
  };
}

export function launchJanusMeetingRequestEmail(): boolean {
  if (!canEditJanus()) {
    showToast('Read-only access.', 'error');
    return false;
  }

  const accountName =
    safeGet<HTMLInputElement>('janusAccountNameInput')?.value?.trim() ||
    cachedMeetingAccount?.name ||
    '';
  if (!accountName) {
    showToast('Save the account before emailing a meeting request.', 'error');
    return false;
  }

  const contact = resolveMeetingEmailContact();
  if (!contact?.email) {
    showToast('Add a contact with an email on this account, or include an email in Attendees.', 'error');
    return false;
  }

  openJanusMeetingRequestEmail({
    account: { name: accountName },
    contact,
    meetingDate: safeGet<HTMLInputElement>('janusMeetingDateInput')?.value || '',
    meetingTime: safeGet<HTMLInputElement>('janusMeetingTimeInput')?.value || '',
    title: safeGet<HTMLInputElement>('janusMeetingTitleInput')?.value || '',
    attendees: safeGet<HTMLInputElement>('janusMeetingAttendeesInput')?.value || '',
    notes: safeGet<HTMLTextAreaElement>('janusMeetingTranscriptInput')?.value || '',
  });

  showToast(`Opening email to ${contact.email}.`);
  return true;
}

export async function refreshJanusAccountPanels(
  accountId: string,
  tab?: 'meetings' | 'documents' | 'activity'
): Promise<void> {
  if (!accountId) return;

  const loadMeetings = !tab || tab === 'meetings' || tab === 'activity';
  const loadDocuments = !tab || tab === 'documents';
  const loadActivity = !tab || tab === 'activity';

  const meetingsPromise = loadMeetings ? fetchJanusMeetings(accountId) : Promise.resolve(null);
  const documentsPromise = loadDocuments ? fetchJanusDocuments(accountId) : Promise.resolve(null);
  const activitiesPromise = loadActivity ? fetchJanusActivities(accountId) : Promise.resolve(null);
  const contactsPromise = loadActivity ? fetchJanusContacts(accountId) : Promise.resolve(null);

  const [meetings, documents, activities, contacts] = await Promise.all([
    meetingsPromise,
    documentsPromise,
    activitiesPromise,
    contactsPromise,
  ]);

  if (meetings) renderMeetingsList(meetings);
  if (documents) {
    documentCache.clear();
    documents.forEach((doc) => documentCache.set(doc.id, doc));
    renderDocumentsList(documents);
  }
  if (contacts) {
    populateActivityContactSelect(contacts);
  }
  if (activities && meetings) {
    renderActivityTimeline(activities, meetings);
  }
}

async function generateMeetingSummary(accountId: string): Promise<void> {
  const account = await fetchJanusAccount(accountId);
  if (!account) {
    showToast('Account not found.', 'error');
    return;
  }

  const meetingDate = safeGet<HTMLInputElement>('janusMeetingDateInput')?.value || todayIso();
  const title = safeGet<HTMLInputElement>('janusMeetingTitleInput')?.value || 'Meeting';
  const attendees = parseAttendees(safeGet<HTMLInputElement>('janusMeetingAttendeesInput')?.value || '');
  const transcript = safeGet<HTMLTextAreaElement>('janusMeetingTranscriptInput')?.value || '';

  if (!transcript.trim()) {
    showToast('Paste transcript or notes first.', 'error');
    return;
  }

  const btn = safeGet<HTMLButtonElement>('janusGenerateMeetingSummaryBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Generating…';
  }

  try {
    const context = {
      accountName: account.name,
      meetingDate,
      title,
      attendees,
      transcript,
    };

    let result;
    try {
      result = await requestJanusMeetingSummary(context);
      showToast('AI summary generated.');
    } catch {
      result = buildFallbackMeetingSummary(context);
      showToast('AI unavailable — saved a basic summary draft.', 'error');
    }

    const summaryField = safeGet<HTMLTextAreaElement>('janusMeetingSummaryInput');
    const actionsField = safeGet<HTMLTextAreaElement>('janusMeetingActionsInput');
    const followField = safeGet<HTMLInputElement>('janusMeetingFollowUpInput');
    if (summaryField) summaryField.value = result.summary;
    if (actionsField) actionsField.value = result.action_items;
    if (followField && result.follow_up_date) followField.value = result.follow_up_date;
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Generate summary';
    }
  }
}

async function saveMeetingRecord(accountId: string): Promise<void> {
  if (!canEditJanus()) {
    showToast('Read-only access.', 'error');
    return;
  }

  const meetingDate = safeGet<HTMLInputElement>('janusMeetingDateInput')?.value || '';
  const title = safeGet<HTMLInputElement>('janusMeetingTitleInput')?.value || '';
  const attendees = parseAttendees(safeGet<HTMLInputElement>('janusMeetingAttendeesInput')?.value || '');
  const transcript = safeGet<HTMLTextAreaElement>('janusMeetingTranscriptInput')?.value || '';
  const summary = safeGet<HTMLTextAreaElement>('janusMeetingSummaryInput')?.value || '';
  const action_items = safeGet<HTMLTextAreaElement>('janusMeetingActionsInput')?.value || '';
  const follow_up_date = safeGet<HTMLInputElement>('janusMeetingFollowUpInput')?.value || null;

  if (!meetingDate || !title.trim()) {
    showToast('Meeting date and title are required.', 'error');
    return;
  }

  if (!transcript.trim() && !summary.trim()) {
    showToast('Add transcript/notes or a summary.', 'error');
    return;
  }

  try {
    if (editingMeetingId) {
      await updateJanusMeeting(editingMeetingId, {
        meeting_date: meetingDate,
        title: title.trim(),
        attendees,
        transcript: transcript.trim() || null,
        summary: summary.trim() || null,
        action_items: action_items.trim() || null,
        follow_up_date: follow_up_date || null,
      });
      clearMeetingForm();
      await refreshJanusAccountPanels(accountId);
      showToast('Meeting updated.');
    } else {
      await createJanusMeeting({
        account_id: accountId,
        meeting_date: meetingDate,
        title: title.trim(),
        attendees,
        transcript: transcript.trim() || null,
        summary: summary.trim() || null,
        action_items: action_items.trim() || null,
        follow_up_date: follow_up_date || null,
      });

      await createJanusActivity({
        account_id: accountId,
        activity_type: 'meeting',
        activity_date: meetingDate,
        subject: `Meeting — ${title.trim()}`,
        body: summary.trim() || transcript.trim().slice(0, 500),
      });

      if (follow_up_date) {
        await createJanusActivity({
          account_id: accountId,
          activity_type: 'follow_up',
          activity_date: follow_up_date,
          subject: `Follow up — ${title.trim()}`,
          body: action_items.trim() || 'Scheduled from meeting log.',
        });
      }

      clearMeetingForm();
      await refreshJanusAccountPanels(accountId);
      showToast('Meeting saved.');
    }

    if (typeof window.loadJanus === 'function') {
      void window.loadJanus(true);
    }
  } catch (err) {
    showToast(err instanceof Error ? err.message : 'Could not save meeting.', 'error');
  }
}

async function uploadDocumentRecord(accountId: string): Promise<void> {
  if (!canEditJanus()) {
    showToast('Read-only access.', 'error');
    return;
  }

  const fileInput = safeGet<HTMLInputElement>('janusDocumentFileInput');
  const file = fileInput?.files?.[0];
  const title = safeGet<HTMLInputElement>('janusDocumentTitleInput')?.value || '';
  const document_type = (safeGet<HTMLSelectElement>('janusDocumentTypeInput')?.value ||
    'other') as 'agreement' | 'sow' | 'nda' | 'other';
  const effective_date = safeGet<HTMLInputElement>('janusDocumentEffectiveInput')?.value || null;

  if (!file) {
    showToast('Choose a file to upload.', 'error');
    return;
  }

  try {
    await uploadJanusDocument(accountId, file, {
      title: title.trim() || file.name,
      document_type,
      effective_date,
    });

    if (fileInput) fileInput.value = '';
    const titleInput = safeGet<HTMLInputElement>('janusDocumentTitleInput');
    if (titleInput) titleInput.value = '';
    await refreshJanusAccountPanels(accountId, 'documents');
    showToast('Document uploaded.');
    if (typeof window.loadJanus === 'function') {
      void window.loadJanus(true);
    }
  } catch (err) {
    showToast(err instanceof Error ? err.message : 'Could not upload document.', 'error');
  }
}

export function syncJanusPanelsEditAccess(): void {
  const editable = canEditJanus();
  safeGet<HTMLButtonElement>('janusGenerateMeetingSummaryBtn')?.classList.toggle('hidden', !editable);
  safeGet<HTMLButtonElement>('janusSaveMeetingBtn')?.classList.toggle('hidden', !editable);
  safeGet<HTMLButtonElement>('janusSaveActivityBtn')?.classList.toggle('hidden', !editable);
  safeGet<HTMLButtonElement>('janusUploadDocumentBtn')?.classList.toggle('hidden', !editable);
  safeGet<HTMLButtonElement>('janusEmailMeetingRequestBtn')?.classList.toggle('hidden', !editable);
  safeGet('janusDocumentUploadForm')?.classList.toggle('hidden', !editable);
  safeGet('janusActivityFormCard')?.classList.toggle('hidden', !editable);

  document
    .querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      '[data-janus-meeting-field], [data-janus-activity-field]'
    )
    .forEach((field) => {
      field.disabled = !editable;
    });
}

export function initJanusAccountPanels(getAccountId: () => string | null): void {
  if (panelsBound) return;
  panelsBound = true;

  syncJanusPanelsEditAccess();
  initJanusMeetingDictation();
  populateActivityTypeSelect();
  clearActivityForm();

  safeGet('janusEmailMeetingRequestBtn')?.addEventListener('click', () => {
    launchJanusMeetingRequestEmail();
  });

  safeGet('janusGenerateMeetingSummaryBtn')?.addEventListener('click', () => {
    const accountId = getAccountId();
    if (!accountId) return;
    void generateMeetingSummary(accountId);
  });

  safeGet('janusSaveMeetingBtn')?.addEventListener('click', () => {
    const accountId = getAccountId();
    if (!accountId) return;
    void saveMeetingRecord(accountId);
  });

  safeGet('janusSaveActivityBtn')?.addEventListener('click', () => {
    const accountId = getAccountId();
    if (!accountId) return;
    void saveActivityRecord(accountId);
  });

  safeGet('janusClearMeetingBtn')?.addEventListener('click', () => {
    clearMeetingForm();
    const accountId = getAccountId();
    if (accountId) void refreshJanusAccountPanels(accountId, 'meetings');
  });

  safeGet('janusDeleteMeetingBtn')?.addEventListener('click', () => {
    const accountId = getAccountId();
    const meetingId = editingMeetingId;
    const meeting = meetingId ? meetingCache.get(meetingId) : null;
    if (!accountId || !meetingId || !meeting) return;

    void (async () => {
      const ok = await showOrbisConfirm(`Delete "${meeting.title}"?`, {
        title: 'Delete meeting',
        confirmLabel: 'Delete',
        danger: true,
      });
      if (!ok) return;

      try {
        await deleteJanusMeeting(meetingId);
        clearMeetingForm();
        await refreshJanusAccountPanels(accountId);
        showToast('Meeting deleted.');
        if (typeof window.loadJanus === 'function') {
          void window.loadJanus(true);
        }
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Could not delete meeting.', 'error');
      }
    })();
  });

  safeGet('janusMeetingsList')?.addEventListener('click', (event) => {
    const target = event.target as Element | null;

    const openBtn = target?.closest<HTMLElement>('[data-janus-open-meeting-id]');
    if (openBtn) {
      const meetingId = openBtn.dataset.janusOpenMeetingId || '';
      const meeting = meetingCache.get(meetingId);
      if (!meeting) return;
      fillMeetingForm(meeting);
      const accountId = getAccountId();
      if (accountId) void refreshJanusAccountPanels(accountId, 'meetings');
      return;
    }

    const deleteBtn = target?.closest<HTMLElement>('[data-janus-delete-meeting]');
    if (!deleteBtn) return;
    const meetingId = deleteBtn.dataset.janusDeleteMeeting || '';
    const meeting = meetingCache.get(meetingId);
    if (!meeting) return;

    void (async () => {
      const ok = await showOrbisConfirm(`Delete "${meeting.title}"?`, {
        title: 'Delete meeting',
        confirmLabel: 'Delete',
        danger: true,
      });
      if (!ok) return;

      try {
        await deleteJanusMeeting(meetingId);
        if (editingMeetingId === meetingId) {
          clearMeetingForm();
        }
        const accountId = getAccountId();
        if (accountId) await refreshJanusAccountPanels(accountId);
        showToast('Meeting deleted.');
        if (typeof window.loadJanus === 'function') {
          void window.loadJanus(true);
        }
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Could not delete meeting.', 'error');
      }
    })();
  });

  safeGet('janusUploadDocumentBtn')?.addEventListener('click', () => {
    const accountId = getAccountId();
    if (!accountId) return;
    void uploadDocumentRecord(accountId);
  });

  safeGet('janusDocumentsList')?.addEventListener('click', (event) => {
    const target = event.target as Element | null;
    const openBtn = target?.closest<HTMLElement>('[data-janus-open-doc]');
    if (openBtn) {
      const path = openBtn.dataset.janusDocPath || '';
      if (!path) return;
      void getJanusDocumentSignedUrl(path).then((url) => {
        if (url) window.open(url, '_blank', 'noopener,noreferrer');
        else showToast('Could not open document.', 'error');
      });
      return;
    }

    const deleteBtn = target?.closest<HTMLElement>('[data-janus-delete-doc]');
    if (!deleteBtn) return;
    const docId = deleteBtn.dataset.janusDeleteDoc || '';
    const doc = documentCache.get(docId);
    if (!doc) return;

    void (async () => {
      const ok = await showOrbisConfirm('Delete this document?', {
        title: 'Delete document',
        confirmLabel: 'Delete',
        danger: true,
      });
      if (!ok) return;
      try {
        await deleteJanusDocument(doc);
        const accountId = getAccountId();
        if (accountId) await refreshJanusAccountPanels(accountId, 'documents');
        showToast('Document deleted.');
        if (typeof window.loadJanus === 'function') {
          void window.loadJanus(true);
        }
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Could not delete document.', 'error');
      }
    })();
  });

  clearMeetingForm();
}

