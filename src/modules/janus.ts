import { canAccessJanus, canEditJanus, isAdminUser } from '../services/access';
import {
  launchJanusContactMeetingRequestEmail,
  launchJanusContactOutreachEmail,
} from './janusContactEmailUi';
import { importCopperCsv } from '../services/janusCopperImport';
import {
  deleteJanusAccount,
  fetchJanusAccounts,
  fetchJanusContactsAll,
  fetchJanusDashboardData,
  fetchJanusHomeStats,
  searchJanusGlobal,
  type JanusContactWithAccount,
  type JanusSearchResult,
} from '../services/janusStore';
import type { JanusAccount } from '../types/janusTypes';
import { showOrbisConfirm } from '../ui/confirmModal';
import {
  formatJanusDateLabel,
  janusAccountStatusLabel,
  janusAccountTypeLabel,
  janusContactDisplayName,
  janusFormatAddress,
} from '../types/janusTypes';

let cachedJanusAccounts: JanusAccount[] = [];
let cachedJanusContacts: JanusContactWithAccount[] = [];
let janusListBound = false;
let janusHelpBound = false;
let searchTimer: ReturnType<typeof setTimeout> | null = null;

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

function statusBadgeClass(status: string): string {
  if (status === 'active') return 'badge badge-active';
  if (status === 'prospect') return 'badge badge-leave';
  return 'badge badge-soft';
}

function getJanusSearchQuery(): string {
  return String(safeGet<HTMLInputElement>('janusSearchInput')?.value || '')
    .trim()
    .toLowerCase();
}

function filterAccounts(accounts: JanusAccount[]): JanusAccount[] {
  const query = getJanusSearchQuery();
  const type = String(safeGet<HTMLSelectElement>('janusTypeFilter')?.value || '').trim();
  const status = String(safeGet<HTMLSelectElement>('janusStatusFilter')?.value || '').trim();

  return accounts.filter((account) => {
    if (type && account.account_type !== type) return false;
    if (status && account.status !== status) return false;
    if (!query) return true;

    const haystack = [
      account.name,
      account.owner_email,
      account.phone,
      account.website,
      account.notes,
      janusFormatAddress(account),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return haystack.includes(query);
  });
}

function filterContacts(contacts: JanusContactWithAccount[]): JanusContactWithAccount[] {
  const query = getJanusSearchQuery();
  const type = String(safeGet<HTMLSelectElement>('janusTypeFilter')?.value || '').trim();
  const status = String(safeGet<HTMLSelectElement>('janusStatusFilter')?.value || '').trim();
  const accountById = new Map(cachedJanusAccounts.map((account) => [account.id, account]));

  return contacts.filter((contact) => {
    const account = accountById.get(contact.account_id);
    if (type && account && account.account_type !== type) return false;
    if (status && account && account.status !== status) return false;
    if (!query) return true;

    const haystack = [
      janusContactDisplayName(contact),
      contact.account_name,
      contact.title,
      contact.email,
      contact.phone,
      contact.notes,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return haystack.includes(query);
  });
}

function renderJanusStats(stats: {
  accountCount: number;
  contactCount: number;
  meetingCount: number;
  documentCount: number;
}): void {
  const summary = safeGet('janusHomeSummary');
  if (summary) {
    summary.textContent = `${stats.accountCount} account${stats.accountCount === 1 ? '' : 's'} · ${stats.contactCount} contact${stats.contactCount === 1 ? '' : 's'}`;
  }

  const setText = (id: string, value: number): void => {
    const el = safeGet(id);
    if (el) el.textContent = String(value);
  };

  setText('janusKpiAccounts', stats.accountCount);
  setText('janusKpiContacts', stats.contactCount);
  setText('janusKpiMeetings', stats.meetingCount);
  setText('janusKpiDocuments', stats.documentCount);
}

function renderDashboardPanels(
  recentMeetings: Array<{ id: string; account_id: string; title: string; meeting_date: string; account_name: string }>,
  upcomingFollowUps: Array<{ id: string; account_id: string; title: string; follow_up_date: string | null; account_name: string }>
): void {
  const recentEl = safeGet('janusRecentMeetingsList');
  const followEl = safeGet('janusUpcomingFollowUpsList');

  if (recentEl) {
    if (!recentMeetings.length) {
      recentEl.innerHTML = '<div class="muted janus-empty">No meetings logged yet.</div>';
    } else {
      recentEl.innerHTML = recentMeetings
        .map(
          (meeting) => `
          <div class="history-item" data-janus-open-meeting="${esc(meeting.account_id)}" role="button" tabindex="0">
            <div class="history-top">
              <strong>${esc(meeting.account_name)}</strong>
              <span>${esc(formatJanusDateLabel(meeting.meeting_date))}</span>
            </div>
            <div class="history-body muted">${esc(meeting.title)}</div>
          </div>
        `
        )
        .join('');
    }
  }

  if (followEl) {
    if (!upcomingFollowUps.length) {
      followEl.innerHTML = '<div class="muted janus-empty">No upcoming follow-ups.</div>';
    } else {
      followEl.innerHTML = upcomingFollowUps
        .map(
          (meeting) => `
          <div class="history-item" data-janus-open-meeting="${esc(meeting.account_id)}" role="button" tabindex="0">
            <div class="history-top">
              <strong>${esc(meeting.account_name)}</strong>
              <span>Follow up ${esc(formatJanusDateLabel(meeting.follow_up_date))}</span>
            </div>
            <div class="history-body muted">${esc(meeting.title)}</div>
          </div>
        `
        )
        .join('');
    }
  }
}

function renderGlobalSearchResults(results: JanusSearchResult[]): void {
  const card = safeGet('janusGlobalSearchCard');
  const list = safeGet('janusGlobalSearchList');
  if (!card || !list) return;

  const query = String(safeGet<HTMLInputElement>('janusSearchInput')?.value || '').trim();
  if (query.length < 2 || !results.length) {
    card.classList.add('hidden');
    list.innerHTML = '';
    return;
  }

  card.classList.remove('hidden');
  list.innerHTML = results
    .map((result) => {
      if (result.kind === 'account') {
        return `
          <div class="history-item" data-janus-open-account="${esc(result.account.id)}" role="button" tabindex="0">
            <div class="history-top">
              <strong>${esc(result.account.name)}</strong>
              <span class="badge badge-soft">Account</span>
            </div>
          </div>
        `;
      }
      if (result.kind === 'contact') {
        return `
          <div class="history-item" data-janus-open-account="${esc(result.contact.account_id)}" data-janus-open-tab="contacts" role="button" tabindex="0">
            <div class="history-top">
              <strong>${esc(janusContactDisplayName(result.contact))}</strong>
              <span class="badge badge-soft">Contact</span>
            </div>
            <div class="history-body muted">${esc(result.account_name)}</div>
          </div>
        `;
      }
      return `
        <div class="history-item" data-janus-open-meeting="${esc(result.meeting.account_id)}" role="button" tabindex="0">
          <div class="history-top">
            <strong>${esc(result.meeting.title)}</strong>
            <span class="badge badge-soft">Meeting</span>
          </div>
          <div class="history-body muted">${esc(result.account_name)} · ${esc(formatJanusDateLabel(result.meeting.meeting_date))}</div>
        </div>
      `;
    })
    .join('');
}

function renderAccountsTable(accounts: JanusAccount[]): void {
  const tbody = safeGet('janusAccountsBody');
  const count = safeGet('janusAccountCount');
  const visible = filterAccounts(accounts);

  if (count) {
    count.textContent = `${visible.length} account${visible.length === 1 ? '' : 's'}`;
  }

  if (!tbody) return;

  if (!visible.length) {
    tbody.innerHTML =
      '<tr><td colspan="6" class="empty">No accounts match your filters.</td></tr>';
    return;
  }

  tbody.innerHTML = visible
    .map((account) => {
      const address = janusFormatAddress(account);
      const deleteBtn = isAdminUser()
        ? `<button type="button" class="button soft sm" data-janus-delete-account="${esc(account.id)}" data-janus-delete-account-name="${escAttr(account.name)}">Delete</button>`
        : '';
      return `
        <tr>
          <td><strong>${esc(account.name)}</strong></td>
          <td>${esc(janusAccountTypeLabel(account.account_type))}</td>
          <td><span class="${statusBadgeClass(account.status)}">${esc(janusAccountStatusLabel(account.status))}</span></td>
          <td>${esc(account.owner_email || '—')}</td>
          <td>${esc(account.phone || address || '—')}</td>
          <td>
            <div class="janus-table-actions">
              <button type="button" class="button soft sm" data-janus-open-account="${esc(account.id)}">Open</button>
              ${deleteBtn}
            </div>
          </td>
        </tr>
      `;
    })
    .join('');
}

function escAttr(value: unknown): string {
  return esc(value).replaceAll("'", '&#39;');
}

function renderContactsTable(contacts: JanusContactWithAccount[]): void {
  const tbody = safeGet('janusContactsBody');
  const count = safeGet('janusContactCount');
  const visible = filterContacts(contacts);

  if (count) {
    count.textContent = `${visible.length} contact${visible.length === 1 ? '' : 's'}`;
  }

  if (!tbody) return;

  if (!visible.length) {
    tbody.innerHTML =
      '<tr><td colspan="6" class="empty">No contacts match your filters.</td></tr>';
    return;
  }

  tbody.innerHTML = visible
    .map((contact) => {
      const primaryBadge = contact.is_primary ? '<span class="badge badge-active">Primary</span>' : '';
      const emailActions = contact.email
        ? `<button type="button" class="button soft sm" data-janus-email-contact-row="${esc(contact.id)}">Email</button>
            ${
              canEditJanus()
                ? `<button type="button" class="button soft sm" data-janus-email-contact-meeting-row="${esc(contact.id)}">Meeting</button>`
                : ''
            }`
        : '';
      return `
        <tr>
          <td>
            <div class="janus-contact-name-cell">
              <strong>${esc(janusContactDisplayName(contact))}</strong>
              ${primaryBadge}
            </div>
          </td>
          <td>${esc(contact.account_name)}</td>
          <td>${esc(contact.title || '—')}</td>
          <td>${esc(contact.email || '—')}</td>
          <td>${esc(contact.phone || '—')}</td>
          <td>
            <div class="janus-table-actions">
              ${emailActions}
              <button type="button" class="button soft sm" data-janus-open-account="${esc(contact.account_id)}" data-janus-open-tab="contacts">Open</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');
}

function setJanusLoading(loading: boolean): void {
  const tbody = safeGet('janusAccountsBody');
  const contactsBody = safeGet('janusContactsBody');
  if (loading && tbody) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty">Loading accounts…</td></tr>';
  }
  if (loading && contactsBody) {
    contactsBody.innerHTML = '<tr><td colspan="6" class="empty">Loading contacts…</td></tr>';
  }
}

async function handleDeleteAccount(accountId: string, accountName: string): Promise<void> {
  if (!isAdminUser()) {
    showToast('Only admins can delete accounts.', 'error');
    return;
  }

  const ok = await showOrbisConfirm(
    `Delete "${accountName}" and all related contacts, meetings, documents, and activity? This cannot be undone.`,
    {
      title: 'Delete account',
      confirmLabel: 'Delete',
      danger: true,
    }
  );
  if (!ok) return;

  try {
    await deleteJanusAccount(accountId);
    showToast('Account deleted.');
    if (typeof window.closeJanusAccountDrawer === 'function' && window.isJanusAccountDrawerOpen?.()) {
      window.closeJanusAccountDrawer();
    }
    await loadJanus(true);
  } catch (err) {
    console.error('[Janus] Delete account failed:', err);
    showToast(err instanceof Error ? err.message : 'Could not delete account.', 'error');
  }
}

async function runGlobalSearch(): Promise<void> {
  const query = String(safeGet<HTMLInputElement>('janusSearchInput')?.value || '').trim();
  if (query.length < 2) {
    renderGlobalSearchResults([]);
    renderAccountsTable(cachedJanusAccounts);
    renderContactsTable(cachedJanusContacts);
    return;
  }

  try {
    const results = await searchJanusGlobal(query);
    renderGlobalSearchResults(results);
    renderAccountsTable(cachedJanusAccounts);
    renderContactsTable(cachedJanusContacts);
  } catch (err) {
    console.warn('[Janus] Search failed:', err);
  }
}

function scheduleGlobalSearch(): void {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    void runGlobalSearch();
  }, 250);
}

async function handleCopperImport(file: File): Promise<void> {
  if (!canEditJanus()) {
    showToast('Read-only access.', 'error');
    return;
  }

  const text = await file.text();
  const result = await importCopperCsv(text);
  const summary = `Imported ${result.accountsCreated} accounts and ${result.contactsCreated} contacts. Skipped ${result.rowsSkipped}.`;
  if (result.errors.length) {
    showToast(`${summary} ${result.errors.length} row errors.`, 'error');
    console.warn('[Janus] CSV import errors:', result.errors);
  } else {
    showToast(summary);
  }
  await loadJanus(true);
}

function setJanusHelpExpanded(expanded: boolean): void {
  const card = safeGet('janusHelpCard');
  const toggle = safeGet<HTMLButtonElement>('janusHelpToggleBtn');
  const panel = safeGet('janusHelpPanel');
  const helpBtn = safeGet<HTMLButtonElement>('janusHelpBtn');
  if (!card || !toggle || !panel) return;

  card.classList.toggle('is-expanded', expanded);
  panel.hidden = !expanded;
  toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  toggle.textContent = expanded ? 'Hide guide' : 'Show guide';
  helpBtn?.setAttribute('aria-expanded', expanded ? 'true' : 'false');
}

function initJanusHelpUi(): void {
  if (janusHelpBound) return;
  janusHelpBound = true;

  safeGet('janusHelpToggleBtn')?.addEventListener('click', () => {
    const expanded =
      safeGet<HTMLButtonElement>('janusHelpToggleBtn')?.getAttribute('aria-expanded') === 'true';
    setJanusHelpExpanded(!expanded);
  });

  safeGet('janusHelpBtn')?.addEventListener('click', () => {
    setJanusHelpExpanded(true);
    safeGet('janusHelpCard')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  setJanusHelpExpanded(false);
}

function bindJanusListUi(): void {
  if (janusListBound) return;
  janusListBound = true;

  initJanusHelpUi();

  safeGet('janusRefreshBtn')?.addEventListener('click', () => {
    void loadJanus(true);
  });

  safeGet('janusNewAccountBtn')?.addEventListener('click', () => {
    if (typeof window.openJanusAccountDrawer === 'function') {
      void window.openJanusAccountDrawer();
    }
  });

  safeGet('janusLogMeetingBtn')?.addEventListener('click', () => {
    const accountId = cachedJanusAccounts[0]?.id;
    if (!accountId) {
      showToast('Create an account first, then log a meeting from that account.', 'error');
      return;
    }
    if (typeof window.openJanusAccountDrawer === 'function') {
      void window.openJanusAccountDrawer(accountId, 'meetings');
    }
  });

  ['janusSearchInput', 'janusTypeFilter', 'janusStatusFilter'].forEach((id) => {
    const element = safeGet(id);
    element?.addEventListener('input', () => {
      scheduleGlobalSearch();
    });
    element?.addEventListener('change', () => {
      scheduleGlobalSearch();
    });
  });

  safeGet('janusAccountsBody')?.addEventListener('click', (event) => {
    const deleteBtn = (event.target as Element | null)?.closest<HTMLElement>(
      '[data-janus-delete-account]'
    );
    if (deleteBtn) {
      const accountId = deleteBtn.dataset.janusDeleteAccount || '';
      const accountName = deleteBtn.dataset.janusDeleteAccountName || 'this account';
      if (accountId) void handleDeleteAccount(accountId, accountName);
      return;
    }

    const button = (event.target as Element | null)?.closest<HTMLElement>('[data-janus-open-account]');
    if (!button) return;
    const accountId = button.dataset.janusOpenAccount || '';
    if (!accountId || typeof window.openJanusAccountDrawer !== 'function') return;
    void window.openJanusAccountDrawer(accountId);
  });

  safeGet('janusContactsBody')?.addEventListener('click', (event) => {
    const target = event.target as Element | null;

    const emailBtn = target?.closest<HTMLElement>('[data-janus-email-contact-row]');
    if (emailBtn) {
      const contactId = emailBtn.dataset.janusEmailContactRow || '';
      const contact = cachedJanusContacts.find((row) => row.id === contactId);
      if (!contact) return;
      launchJanusContactOutreachEmail({
        contact,
        accountName: contact.account_name,
      });
      return;
    }

    const meetingEmailBtn = target?.closest<HTMLElement>('[data-janus-email-contact-meeting-row]');
    if (meetingEmailBtn) {
      const contactId = meetingEmailBtn.dataset.janusEmailContactMeetingRow || '';
      const contact = cachedJanusContacts.find((row) => row.id === contactId);
      if (!contact) return;
      launchJanusContactMeetingRequestEmail({
        contact,
        accountName: contact.account_name,
      });
      return;
    }

    const button = target?.closest<HTMLElement>('[data-janus-open-account]');
    if (!button || typeof window.openJanusAccountDrawer !== 'function') return;
    const accountId = button.dataset.janusOpenAccount || '';
    const tab = button.dataset.janusOpenTab || 'contacts';
    if (!accountId) return;
    void window.openJanusAccountDrawer(accountId, tab);
  });

  safeGet('janusGlobalSearchList')?.addEventListener('click', (event) => {
    const item = (event.target as Element | null)?.closest<HTMLElement>(
      '.history-item[data-janus-open-account], .history-item[data-janus-open-meeting]'
    );
    if (!item || typeof window.openJanusAccountDrawer !== 'function') return;
    const accountId = item.dataset.janusOpenAccount || item.dataset.janusOpenMeeting || '';
    if (!accountId) return;
    const tab = item.dataset.janusOpenMeeting
      ? 'meetings'
      : item.dataset.janusOpenTab || 'overview';
    void window.openJanusAccountDrawer(accountId, tab);
  });

  document.getElementById('janusPage')?.addEventListener('click', (event) => {
    const item = (event.target as Element | null)?.closest<HTMLElement>(
      '[data-janus-open-meeting]'
    );
    if (!item || typeof window.openJanusAccountDrawer !== 'function') return;
    const accountId = item.dataset.janusOpenMeeting || '';
    if (!accountId) return;
    void window.openJanusAccountDrawer(accountId, 'meetings');
  });

  safeGet<HTMLInputElement>('janusCopperImportInput')?.addEventListener('change', (event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    void handleCopperImport(file).finally(() => {
      input.value = '';
    });
  });

  const newBtn = safeGet<HTMLButtonElement>('janusNewAccountBtn');
  const logBtn = safeGet<HTMLButtonElement>('janusLogMeetingBtn');
  const importLabel = safeGet('janusCopperImportLabel');
  if (newBtn) newBtn.classList.toggle('hidden', !canEditJanus());
  if (logBtn) logBtn.classList.toggle('hidden', !canEditJanus());
  if (importLabel) importLabel.classList.toggle('hidden', !canEditJanus());
}

export function applyJanusAccess(): void {
  const visible = canAccessJanus();
  document.querySelectorAll<HTMLElement>('[data-janus-access]').forEach((element) => {
    element.classList.toggle('hidden', !visible);
    element.setAttribute('aria-hidden', visible ? 'false' : 'true');
  });

  const newBtn = safeGet<HTMLButtonElement>('janusNewAccountBtn');
  const logBtn = safeGet<HTMLButtonElement>('janusLogMeetingBtn');
  const importLabel = safeGet('janusCopperImportLabel');
  if (newBtn) newBtn.classList.toggle('hidden', !canEditJanus());
  if (logBtn) logBtn.classList.toggle('hidden', !canEditJanus());
  if (importLabel) importLabel.classList.toggle('hidden', !canEditJanus());

  if (typeof window.applyJanusDrawerAccess === 'function') {
    window.applyJanusDrawerAccess();
  }
}

export async function loadJanus(force = false): Promise<void> {
  if (!canAccessJanus()) {
    applyJanusAccess();
    showToast('Janus requires admin or Janus CRM access.', 'error');
    return;
  }

  bindJanusListUi();
  applyJanusAccess();

  if (!force && cachedJanusAccounts.length) {
    renderAccountsTable(cachedJanusAccounts);
    renderContactsTable(cachedJanusContacts);
    return;
  }

  setJanusLoading(true);

  try {
    const [stats, accounts, contacts, dashboard] = await Promise.all([
      fetchJanusHomeStats(),
      fetchJanusAccounts(),
      fetchJanusContactsAll(),
      fetchJanusDashboardData(),
    ]);
    cachedJanusAccounts = accounts;
    cachedJanusContacts = contacts;
    renderJanusStats(stats);
    renderDashboardPanels(dashboard.recentMeetings, dashboard.upcomingFollowUps);
    renderAccountsTable(accounts);
    renderContactsTable(contacts);
    await runGlobalSearch();
  } catch (err) {
    console.error('[Janus] Load failed:', err);
    const message =
      err && typeof err === 'object' && 'message' in err
        ? String((err as { message?: string }).message)
        : 'Could not load Janus.';
    const tbody = safeGet('janusAccountsBody');
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="6" class="empty">${esc(message)}</td></tr>`;
    }
    showToast('Could not load Janus.', 'error');
  }
}

bindJanusListUi();
applyJanusAccess();

window.loadJanus = loadJanus;
window.applyJanusAccess = applyJanusAccess;
