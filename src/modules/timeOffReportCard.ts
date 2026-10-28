/**
 * Reports → "Time off this week" card (admins only).
 * Lets an admin email the QuickBooks Time time-off report on demand, to leadership or to themselves.
 * The same report goes out automatically every Monday at 7 AM ET (weekly-time-off-email workflow).
 */
import { isAdminUser } from '../services/access';
import {
  mondayOfWeek,
  sendTimeOffReport,
  TimeOffReportError,
  type TimeOffReportRecipients,
} from '../services/timeOffReport';
import { showOrbisConfirm } from '../ui/confirmModal';

const CARD_ID = 'timeOffReportCard';

function toast(message: string, type = 'success'): void {
  if (typeof window.showToast === 'function') window.showToast(message, type);
}

function formatShort(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function weekOptions(): { value: string; label: string }[] {
  const today = new Date();
  const thisWeek = mondayOfWeek(today);
  const next = new Date(today);
  next.setDate(next.getDate() + 7);
  const nextWeek = mondayOfWeek(next);
  return [
    { value: thisWeek, label: `This week (from ${formatShort(thisWeek)})` },
    { value: nextWeek, label: `Next week (from ${formatShort(nextWeek)})` },
  ];
}

function setStatus(text: string, tone: 'muted' | 'success' | 'error' = 'muted'): void {
  const el = document.getElementById('timeOffReportStatus');
  if (!el) return;
  el.textContent = text;
  el.style.color = tone === 'error' ? 'var(--danger, #b91c1c)' : tone === 'success' ? 'var(--success, #15803d)' : '';
}

function setBusy(busy: boolean): void {
  ['timeOffReportSendLeadershipBtn', 'timeOffReportSendMeBtn'].forEach((id) => {
    const btn = document.getElementById(id) as HTMLButtonElement | null;
    if (btn) btn.disabled = busy;
  });
}

async function send(recipients: TimeOffReportRecipients): Promise<void> {
  if (!isAdminUser()) {
    toast('Admin access required to send the time off report.', 'error');
    return;
  }

  const select = document.getElementById('timeOffReportWeek') as HTMLSelectElement | null;
  const weekOf = select?.value || mondayOfWeek(new Date());

  if (recipients === 'leadership') {
    const ok = await showOrbisConfirm(
      `Email the time off report for the week of ${formatShort(weekOf)} to leadership now?`,
      { title: 'Send time off report', confirmLabel: 'Send to leadership' }
    );
    if (!ok) return;
  }

  setBusy(true);
  setStatus('Pulling time off from QuickBooks Time and sending…');

  try {
    const result = await sendTimeOffReport({ recipients, weekOf });
    const who = recipients === 'me' ? 'you' : `${result.recipients} leadership recipient(s)`;
    const msg =
      `Sent to ${who}: ${result.approved} with approved time off, ${result.pending} pending ` +
      `(week of ${formatShort(result.weekStart)}).`;
    setStatus(msg, 'success');
    toast('Time off report sent.');
  } catch (err) {
    const message =
      err instanceof TimeOffReportError ? err.message : 'Could not send the time off report.';
    setStatus(message, 'error');
    toast(message, 'error');
  } finally {
    setBusy(false);
  }
}

function buildCard(): HTMLElement {
  const card = document.createElement('div');
  card.className = 'card';
  card.id = CARD_ID;
  const options = weekOptions()
    .map((o) => `<option value="${o.value}">${o.label}</option>`)
    .join('');
  card.innerHTML = `
    <div class="card-header">Time off this week (QuickBooks Time)</div>
    <div class="card-body">
      <p class="muted" style="margin: 0 0 12px">
        Emails who is off (approved) and requests still pending, pulled from TSheets.
        Leadership gets this automatically every Monday at 7:00 AM ET — use this to send it on demand.
      </p>
      <div class="stay-org-themes-toolbar">
        <label>
          <span class="muted">Week</span>
          <select id="timeOffReportWeek" aria-label="Week to report">${options}</select>
        </label>
        <button class="button primary" id="timeOffReportSendLeadershipBtn" type="button">
          Send to leadership
        </button>
        <button class="button soft" id="timeOffReportSendMeBtn" type="button">
          Send to me (preview)
        </button>
      </div>
      <p class="muted" id="timeOffReportStatus" style="margin: 10px 0 0"></p>
    </div>`;

  card.querySelector('#timeOffReportSendLeadershipBtn')?.addEventListener('click', () => {
    void send('leadership');
  });
  card.querySelector('#timeOffReportSendMeBtn')?.addEventListener('click', () => {
    void send('me');
  });
  return card;
}

/** Insert the card into Reports (admins only). Safe to call repeatedly. */
export function mountTimeOffReportCard(): void {
  const content = document.getElementById('reportsAdminContent');
  if (!content) return;

  const existing = document.getElementById(CARD_ID);
  if (!isAdminUser()) {
    existing?.remove();
    return;
  }
  if (existing) return;

  const card = buildCard();
  const anchor = document.getElementById('stayOrgThemesCard');
  if (anchor && anchor.parentElement) {
    anchor.parentElement.insertBefore(card, anchor);
  } else {
    content.appendChild(card);
  }
}

function init(): void {
  mountTimeOffReportCard();
  // Reports content and admin role load asynchronously; re-check when the section is shown.
  const section = document.getElementById('orbisSectionReports');
  if (section) {
    new MutationObserver(() => mountTimeOffReportCard()).observe(section, {
      attributes: true,
      attributeFilter: ['class', 'aria-hidden'],
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
