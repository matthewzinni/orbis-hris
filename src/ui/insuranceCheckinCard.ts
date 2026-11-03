import { isAdminUser } from '../services/access';
import type { EmployeeLike } from '../services/employeeUtils';
import {
  buildInsuranceCheckinRows,
  loadInsuranceDiscussions,
  setInsuranceDiscussed,
  type InsuranceCheckinRow,
  type InsuranceDiscussion,
} from '../services/insuranceCheckins';

const MODAL_ID = 'insuranceCheckinModal';

let lastEmployees: EmployeeLike[] = [];
let discussions: Record<string, InsuranceDiscussion> | null = null;
let discussionsPromise: Promise<void> | null = null;
let showSpokenWith = false;

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(value: string): string {
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function currentRows(): InsuranceCheckinRow[] {
  return buildInsuranceCheckinRows(lastEmployees, discussions || {});
}

function renderCard(): void {
  const valueEl = document.getElementById('kInsuranceCheckins');
  const subEl = document.getElementById('kInsuranceCheckinsSub');
  const card = document.getElementById('cardInsuranceCheckins');
  if (!valueEl || !subEl || !card) return;

  if (!discussions) {
    valueEl.textContent = '—';
    subEl.textContent = 'Could not load insurance check-offs';
    return;
  }

  const rows = currentRows();
  const pending = rows.filter((row) => !row.discussion).length;
  valueEl.textContent = String(pending);
  subEl.textContent = rows.length
    ? `${pending} of ${rows.length} past 30 days not yet spoken with · click to check off`
    : 'No in-house employees past their first 30 days';
  card.classList.remove('good', 'warn');
  card.classList.add(pending > 0 ? 'warn' : 'good');
}

function ensureModal(): HTMLElement {
  let modal = document.getElementById(MODAL_ID);
  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = MODAL_ID;
  modal.className = 'orbis-modal-backdrop hidden';
  modal.innerHTML = `
    <div class="orbis-modal" role="dialog" aria-modal="true" aria-labelledby="insuranceCheckinModalTitle">
      <div class="orbis-modal-header">
        <h2 id="insuranceCheckinModalTitle">Insurance conversations</h2>
        <button class="button soft sm" type="button" data-insurance-close>Close</button>
      </div>
      <div class="orbis-modal-body">
        <p class="muted insurance-checkin-intro">In-house employees past their first 30 days. Check off each person once you've talked with them about insurance.</p>
        <label class="insurance-checkin-toggle">
          <input type="checkbox" data-insurance-show-done /> Show people already spoken with
        </label>
        <div class="mini-table-wrap">
          <table>
            <thead><tr><th>Spoken with</th><th>Employee</th><th>Department</th><th>Hired</th><th>Days</th></tr></thead>
            <tbody id="insuranceCheckinBody"></tbody>
          </table>
        </div>
      </div>
    </div>`;
  document.body.appendChild(modal);

  modal.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    if (target === modal || target.closest('[data-insurance-close]')) modal?.classList.add('hidden');
  });
  modal.addEventListener('change', (event) => {
    const input = event.target as HTMLInputElement;
    if (input.matches('[data-insurance-show-done]')) {
      showSpokenWith = input.checked;
      renderModalRows();
      return;
    }
    const employeeId = input.dataset.insuranceEmployee;
    if (employeeId) void toggleDiscussed(input, employeeId);
  });
  return modal;
}

function renderModalRows(): void {
  const body = document.getElementById('insuranceCheckinBody');
  if (!body) return;

  const rows = currentRows().filter((row) => showSpokenWith || !row.discussion);
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="5" class="empty">${
      showSpokenWith ? 'No in-house employees past their first 30 days' : 'Everyone past 30 days has been spoken with'
    }</td></tr>`;
    return;
  }

  body.innerHTML = rows
    .map((row) => {
      const done = row.discussion
        ? `<div class="muted insurance-checkin-meta">${esc(formatDate(row.discussion.discussedAt))} · ${esc(row.discussion.discussedBy)}</div>`
        : '';
      return `<tr>
        <td><label class="insurance-checkin-check"><input type="checkbox" data-insurance-employee="${esc(row.employeeId)}" ${
          row.discussion ? 'checked' : ''
        } aria-label="Spoken with ${esc(row.name)} about insurance" />${done}</label></td>
        <td>${esc(row.name)}</td>
        <td>${esc(row.department)}</td>
        <td>${esc(formatDate(row.hireDate))}</td>
        <td>${row.daysEmployed}</td>
      </tr>`;
    })
    .join('');
}

async function toggleDiscussed(input: HTMLInputElement, employeeId: string): Promise<void> {
  input.disabled = true;
  try {
    await setInsuranceDiscussed(employeeId, input.checked);
    discussions = await loadInsuranceDiscussions();
  } catch (err) {
    console.warn('[Insurance] Could not save check-off:', err);
    input.checked = !input.checked;
    window.alert('Could not save that check-off. Please try again.');
  } finally {
    input.disabled = false;
  }
  renderCard();
  renderModalRows();
}

async function openInsuranceCheckinModal(): Promise<void> {
  const modal = ensureModal();
  modal.classList.remove('hidden');
  const body = document.getElementById('insuranceCheckinBody');
  if (!discussions && body) body.innerHTML = '<tr><td colspan="5" class="empty">Loading…</td></tr>';
  if (!discussions) await reloadDiscussions();
  renderModalRows();
}

async function reloadDiscussions(): Promise<void> {
  try {
    discussions = await loadInsuranceDiscussions();
  } catch (err) {
    console.warn('[Insurance] Could not load check-offs:', err);
    discussions = null;
  }
}

function bindCard(card: HTMLElement): void {
  if (card.dataset.insuranceBound) return;
  card.dataset.insuranceBound = 'true';
  card.addEventListener('click', () => void openInsuranceCheckinModal());
  card.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      void openInsuranceCheckinModal();
    }
  });
}

/** Called whenever dashboard KPIs re-render with the scoped employee list. */
export function refreshInsuranceCheckinKpi(employees: EmployeeLike[]): void {
  const card = document.getElementById('cardInsuranceCheckins');
  if (!card) return;

  if (!isAdminUser()) {
    card.classList.add('hidden');
    return;
  }

  card.classList.remove('hidden');
  bindCard(card);
  lastEmployees = Array.isArray(employees) ? employees : [];

  if (!discussions && !discussionsPromise) {
    discussionsPromise = reloadDiscussions().finally(() => {
      discussionsPromise = null;
      renderCard();
    });
  }
  if (discussions) renderCard();
}
