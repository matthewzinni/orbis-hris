import { isAdminUser } from '../services/accessState';
import { supabaseClient } from '../services/supabaseClient';
import { generateLeadershipBriefing, saveLeadershipBriefing, listLeadershipBriefings, getLeadershipBriefing } from '../services/leadershipBriefing';
import { briefingText, shiftDate, type LeadershipBriefing } from '../services/leadershipBriefingModel';
import { printDocument } from '../utils/printDocument';
import '../styles/leadership-briefing.css';

const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] || char));
const localDate = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

export function initLeadershipBriefing(): void {
  const root = document.getElementById('leadershipBriefing');
  if (!root || root.dataset.bound || !isAdminUser()) return;
  root.dataset.bound = 'true';
  let brief: LeadershipBriefing | null = null;
  let dirty = false;
  let busy = false;
  let generation = 0;
  let sessionOwner: string | null | undefined;
  const today = localDate();
  const weekday = new Date(`${today}T12:00:00`).getDay();
  const start = shiftDate(today, -((weekday + 6) % 7) - 7);
  root.innerHTML = `<div class="card-header">Weekly Leadership Briefing</div>
    <div class="card-body">
      <p class="muted">Generate a seven-day briefing, review the evidence, and edit your narrative. Saved versions are visible to Orbis admins only.</p>
      <div class="briefing-controls">
        <label>Week starting <input type="date" data-start value="${start}" required></label>
        <label>Week ending <input type="date" data-end value="${shiftDate(start, 6)}" readonly></label>
        <button type="button" class="button" data-action="generate">Generate draft</button>
      </div>
      <p role="status" aria-live="polite" data-status>Choose a week to begin. Last completed Monday–Sunday week is selected.</p>
      <div data-draft></div>
      <details><summary>Saved versions (latest 30)</summary>
        <button type="button" class="button soft" data-action="history">Refresh saved versions</button>
        <div data-history aria-live="polite">Select Refresh to load saved versions.</div>
      </details>
    </div>`;
  const status = root.querySelector<HTMLElement>('[data-status]')!;
  const draft = root.querySelector<HTMLElement>('[data-draft]')!;
  const startInput = root.querySelector<HTMLInputElement>('[data-start]')!;
  const endInput = root.querySelector<HTMLInputElement>('[data-end]')!;
  const setBusy = (value: boolean) => {
    busy = value;
    root.setAttribute('aria-busy', String(value));
    root.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLTextAreaElement>('button,input,textarea').forEach(el => { el.disabled = value; });
  };
  const render = () => {
    if (!brief) { draft.replaceChildren(); return; }
    draft.innerHTML = `<h3>Briefing: ${escapeHtml(brief.start)} – ${escapeHtml(brief.end)}</h3>
      <p class="muted">Snapshot generated ${escapeHtml(brief.generatedAt)}. Zero means no matching accessible records, not proof of complete data.</p>
      <div class="briefing-metrics">${brief.metrics.map((m, i) => `<a href="#briefing-source-${i}" data-source="${i}" class="detail-card"><span>${escapeHtml(m.label)}</span><strong>${escapeHtml(m.value)}</strong><small>View supporting records</small></a>`).join('')}</div>
      <label class="briefing-editor">Editable leadership narrative<textarea data-narrative rows="18" maxlength="30000"></textarea></label>
      <p class="muted">Keep investigation, medical, and employee-care details out of this briefing. No AI service or email delivery is used.</p>
      <div class="briefing-controls">
        <button type="button" class="button" data-action="save">Save new version</button>
        <button type="button" class="button soft" data-action="download">Download text</button>
        <button type="button" class="button soft" data-action="print">Print / Save PDF</button>
      </div>
      <details open><summary>Data coverage and limitations</summary><ul>${brief.warnings.map(w => `<li>${escapeHtml(w)}</li>`).join('')}</ul></details>
      <h4>Supporting records</h4>
      ${brief.metrics.map((m, i) => `<details id="briefing-source-${i}"><summary>${escapeHtml(m.label)} — ${escapeHtml(m.value)}</summary><p class="muted">Source: ${escapeHtml(m.source)}. These are the exact records included in this saved metric.</p>${m.rows.length ? `<div class="table-wrap"><table><thead><tr><th>Record / employee</th><th>Evidence</th></tr></thead><tbody>${m.rows.map(row => `<tr><td>${escapeHtml(row.id || row.date || '—')}</td><td>${escapeHtml(Object.entries(row).filter(([key]) => key !== 'id').map(([key, value]) => `${key}: ${value ?? 'not recorded'}`).join(' · '))}</td></tr>`).join('')}</tbody></table></div>` : '<p>No supporting records loaded for this metric. Check its value and the coverage notes.</p>'}</details>`).join('')}`;
    draft.querySelector<HTMLTextAreaElement>('[data-narrative]')!.value = brief.narrative;
  };
  const mayReplace = () => !dirty || window.confirm('Replace this draft? Unsaved edits will be lost.');
  startInput.addEventListener('change', () => {
    try { endInput.value = shiftDate(startInput.value, 6); }
    catch { endInput.value = ''; }
    if (brief) status.textContent = 'Dates changed. Generate a new draft to use this period; the existing draft is unchanged.';
  });
  root.addEventListener('input', event => {
    if ((event.target as HTMLElement).matches('[data-narrative]') && brief) {
      brief.narrative = (event.target as HTMLTextAreaElement).value;
      dirty = true;
      status.textContent = 'Unsaved changes.';
    }
  });
  root.addEventListener('click', event => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action],[data-source]');
    if (!target || busy || !isAdminUser()) return;
    if (target.dataset.source !== undefined) {
      event.preventDefault();
      const details = document.getElementById(`briefing-source-${target.dataset.source}`) as HTMLDetailsElement | null;
      if (details) { details.open = true; details.scrollIntoView({ block: 'nearest' }); }
      return;
    }
    const action = target.dataset.action;
    void (async () => {
      if ((action === 'generate' || action === 'open') && !mayReplace()) return;
      const token = generation;
      setBusy(true);
      status.textContent = 'Working…';
      try {
        if (action === 'generate' || action === 'open') {
          const result = action === 'generate'
            ? await generateLeadershipBriefing(startInput.value, endInput.value, localDate())
            : await getLeadershipBriefing(target.dataset.id || '');
          if (token !== generation || !isAdminUser()) return;
          brief = result; dirty = action === 'generate';
          startInput.value = brief.start; endInput.value = brief.end;
          render();
          status.textContent = action === 'generate' ? 'Draft generated. Review coverage and edit before saving.' : 'Saved version opened. Saving edits creates a new version.';
        } else if (action === 'history') {
          const saved = await listLeadershipBriefings();
          if (token !== generation || !isAdminUser()) return;
          root.querySelector<HTMLElement>('[data-history]')!.innerHTML = saved.length
            ? saved.map(s => `<p><button type="button" class="button soft" data-action="open" data-id="${escapeHtml(s.id)}">${escapeHtml(s.period_start)} – ${escapeHtml(s.period_end)} · saved ${escapeHtml(s.created_at)}</button></p>`).join('')
            : '<p>No saved briefings yet.</p>';
          status.textContent = 'Saved versions loaded.';
        } else if (brief && action === 'save') {
          await saveLeadershipBriefing(brief);
          if (token !== generation || !isAdminUser()) return;
          dirty = false; status.textContent = 'Saved as a new version in Orbis. Refresh saved versions to open it later.';
        } else if (brief && action === 'download') {
          const url = URL.createObjectURL(new Blob([briefingText(brief)], { type: 'text/plain;charset=utf-8' }));
          const link = document.createElement('a'); link.href = url;
          link.download = `orbis-leadership-${brief.start}-to-${brief.end}.txt`;
          link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
          status.textContent = 'Text download prepared. This does not save a version in Orbis.';
        } else if (brief && action === 'print') {
          printDocument(`<style>@page{margin:18mm}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:11pt/1.5 Arial,sans-serif;color:#111}</style><pre>${escapeHtml(briefingText(brief))}</pre>`, 'orbis-briefing-print', { standalone: true });
          status.textContent = 'Print preview prepared. Choose Save as PDF in the print dialog if needed.';
        }
      } catch (error) {
        if (token === generation) status.textContent = error instanceof Error ? error.message : 'Could not complete this action. Please retry.';
      } finally { if (token === generation) setBusy(false); }
    })();
  });
  window.addEventListener('beforeunload', event => {
    if (dirty && isAdminUser()) { event.preventDefault(); event.returnValue = ''; }
  });
  // Never retain an admin's draft or saved-version listing across sign-out.
  supabaseClient.auth.onAuthStateChange((event, session) => {
    const owner = session?.user.id ?? null;
    const changedUser = sessionOwner !== undefined && owner !== sessionOwner;
    sessionOwner = owner;
    if (event === 'SIGNED_OUT' || changedUser) {
      generation++; brief = null; dirty = false; render(); setBusy(false);
      root.querySelector<HTMLElement>('[data-history]')!.textContent = 'Select Refresh to load saved versions.';
      status.textContent = 'Choose a week to generate a briefing.';
    }
  });
}
