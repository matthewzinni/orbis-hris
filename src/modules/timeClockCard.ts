/**
 * My Profile → "Time clock" card. Employees (and supervisors/admins with their own employee
 * record) clock in and out; each punch is a real QuickBooks Time timesheet.
 */
import { getLinkedEmployeeId, hasPersonalEmployeePortal } from '../services/access';
import {
  callTimeClock,
  formatClockTime,
  getPunchLocation,
  formatWorked,
  liveWorkedSeconds,
  type TimeClockAction,
  type TimeClockState,
} from '../services/timeClock';

let state: TimeClockState | null = null;
let busy = false;
let ticker: number | null = null;

function el<T extends HTMLElement = HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function toast(message: string, type = 'success'): void {
  if (typeof window.showToast === 'function') window.showToast(message, type);
}

function render(error = ''): void {
  const stateEl = el('timeClockState');
  const detail = el('timeClockDetail');
  const inBtn = el<HTMLButtonElement>('timeClockInBtn');
  const outBtn = el<HTMLButtonElement>('timeClockOutBtn');
  if (!stateEl || !detail || !inBtn || !outBtn) return;

  if (error && !state) {
    stateEl.textContent = 'Time clock unavailable';
    detail.textContent = error;
    inBtn.classList.add('hidden');
    outBtn.classList.add('hidden');
    return;
  }
  if (!state) return;

  const worked = formatWorked(liveWorkedSeconds(state));
  if (state.onClock) {
    const since = formatClockTime(state.clockedInAt);
    stateEl.textContent = since ? `On the clock since ${since}` : 'On the clock';
    detail.textContent = `Worked today: ${worked}`;
  } else {
    stateEl.textContent = 'Not clocked in';
    detail.textContent = state.workedSecondsToday > 0 ? `Worked today: ${worked}` : '';
  }
  if (error) detail.textContent = `${detail.textContent ? `${detail.textContent} · ` : ''}${error}`;

  inBtn.classList.toggle('hidden', state.onClock);
  outBtn.classList.toggle('hidden', !state.onClock);
  inBtn.disabled = busy;
  outBtn.disabled = busy;
}

function startTicker(): void {
  if (ticker != null) return;
  ticker = window.setInterval(() => {
    if (!document.getElementById('timeClockCard')?.offsetParent) return; // not visible
    if (state?.onClock) render();
  }, 30_000);
}

async function run(action: TimeClockAction): Promise<void> {
  if (busy) return;
  busy = true;
  render();
  try {
    if (action !== 'status') {
      const detail = el('timeClockDetail');
      if (detail) detail.textContent = 'Getting your location…';
    }
    const location = action === 'status' ? undefined : await getPunchLocation();
    state = await callTimeClock(action, location);
    if (state.message) toast(state.message, 'success');
    render();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not reach the time clock.';
    if (action !== 'status') toast(message, 'error');
    render(message);
  } finally {
    busy = false;
    render();
  }
}

function bind(): void {
  const inBtn = el<HTMLButtonElement>('timeClockInBtn');
  const outBtn = el<HTMLButtonElement>('timeClockOutBtn');
  if (inBtn && inBtn.dataset.bound !== '1') {
    inBtn.dataset.bound = '1';
    inBtn.addEventListener('click', () => void run('clock_in'));
  }
  if (outBtn && outBtn.dataset.bound !== '1') {
    outBtn.dataset.bound = '1';
    outBtn.addEventListener('click', () => void run('clock_out'));
  }
}

/** Show and refresh the card. Safe to call repeatedly (every time My Profile opens). */
export async function loadTimeClockCard(): Promise<void> {
  const card = el('timeClockCard');
  if (!card) return;
  const eligible = hasPersonalEmployeePortal() && Boolean(getLinkedEmployeeId());
  card.classList.toggle('hidden', !eligible);
  if (!eligible) return;
  bind();
  startTicker();
  await run('status');
}

window.loadTimeClockCard = loadTimeClockCard;
