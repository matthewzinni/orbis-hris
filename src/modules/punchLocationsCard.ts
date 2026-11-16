/**
 * Attendance → "Clock-in locations" (punch-locations Edge Function). Admins see everyone,
 * supervisors their team — enforced by the database. Each punch shows its time, a map link and
 * where the location came from (Orbis tap, QuickBooks Time app GPS, or none).
 */
import { FunctionsHttpError } from '@supabase/supabase-js';
import { isAdminUser, isSupervisorUser } from '../services/access';
import { supabaseClient } from '../services/supabaseClient';
import { formatClockTime } from '../services/timeClock';

type Spot = {
  at: string;
  source: 'orbis' | 'qbt_app' | 'none';
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  gapMinutes: number | null;
  map_url: string;
};

type Row = { employee_id: string; name: string; timesheet_id: string | number; clock_in: Spot | null; clock_out: Spot | null };

function el<T extends HTMLElement = HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;'
  );
}

function todayEt(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
}

export function describeSpot(spot: Spot | null, stillOnClock: boolean): string {
  if (!spot) return stillOnClock ? '<span class="muted">Still on the clock</span>' : '<span class="muted">—</span>';
  const time = esc(formatClockTime(spot.at));
  if (spot.source === 'none' || !spot.map_url) {
    return `${time}<div class="punch-loc-missing">No location recorded</div>`;
  }
  const source = spot.source === 'orbis' ? 'Orbis' : 'QuickBooks Time app';
  const accuracy = spot.accuracy != null ? ` · ±${Math.round(spot.accuracy)} m` : '';
  const gap = spot.source === 'qbt_app' && spot.gapMinutes ? ` · GPS ${spot.gapMinutes} min off` : '';
  return `${time}<div><a href="${esc(spot.map_url)}" target="_blank" rel="noopener noreferrer">View on map</a></div>
    <div class="muted punch-loc-meta">${esc(source)}${esc(accuracy)}${esc(gap)}</div>`;
}

async function describeFailure(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const json = (await (error.context as Response).clone().json()) as { error?: string };
      if (json?.error) return json.error;
    } catch {
      /* fall through */
    }
    return `Could not load locations (HTTP ${(error.context as Response).status}).`;
  }
  return error instanceof Error ? error.message : 'Could not load locations.';
}

async function load(): Promise<void> {
  const body = el('punchLocationsBody');
  const date = el<HTMLInputElement>('punchLocationsDate')?.value || todayEt();
  const btn = el<HTMLButtonElement>('punchLocationsLoadBtn');
  if (!body) return;
  body.innerHTML = '<tr><td colspan="3" class="empty">Loading…</td></tr>';
  if (btn) btn.disabled = true;
  try {
    const { data, error } = await supabaseClient.functions.invoke('punch-locations', { body: { date } });
    if (error) throw new Error(await describeFailure(error));
    const payload = (data || {}) as { error?: string; rows?: Row[] };
    if (payload.error) throw new Error(payload.error);
    const rows = payload.rows || [];
    body.innerHTML = rows.length
      ? rows
          .map(
            (r) => `<tr>
              <td>${esc(r.name)}</td>
              <td>${describeSpot(r.clock_in, false)}</td>
              <td>${describeSpot(r.clock_out, Boolean(r.clock_in))}</td>
            </tr>`
          )
          .join('')
      : '<tr><td colspan="3" class="empty">No clock-ins that day.</td></tr>';
  } catch (err) {
    body.innerHTML = `<tr><td colspan="3" class="empty">${esc(err instanceof Error ? err.message : String(err))}</td></tr>`;
  } finally {
    if (btn) btn.disabled = false;
  }
}

export function initPunchLocationsCard(): void {
  const card = el('punchLocationsCard');
  if (!card) return;
  const allowed = isAdminUser() || isSupervisorUser();
  card.classList.toggle('hidden', !allowed);
  if (!allowed) return;

  const dateInput = el<HTMLInputElement>('punchLocationsDate');
  if (dateInput && !dateInput.value) dateInput.value = todayEt();
  const btn = el<HTMLButtonElement>('punchLocationsLoadBtn');
  if (btn && btn.dataset.bound !== '1') {
    btn.dataset.bound = '1';
    btn.addEventListener('click', () => void load());
  }
}

window.initPunchLocationsCard = initPunchLocationsCard;
