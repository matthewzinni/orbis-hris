// Pure time helpers for qbt-clock (no Deno / network), shared with vitest.

export type ClockTimesheet = {
  id?: number;
  start?: string;
  end?: string;
  duration?: number;
  on_the_clock?: boolean;
  type?: string;
};

export const DEFAULT_TIME_ZONE = 'America/New_York';

/** A valid IANA zone from the browser, else Eastern. */
export function resolveTimeZone(tz: unknown): string {
  const zone = String(tz || '').trim();
  if (!zone) return DEFAULT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return zone;
  } catch {
    return DEFAULT_TIME_ZONE;
  }
}

function parts(date: Date, tz: string): Record<string, string> {
  const out: Record<string, string> = {};
  new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
    .formatToParts(date)
    .forEach((p) => {
      out[p.type] = p.value;
    });
  return out;
}

/** YYYY-MM-DD in the zone. */
export function localDate(date: Date, tz: string): string {
  const p = parts(date, tz);
  return `${p.year}-${p.month}-${p.day}`;
}

/** ISO 8601 with the zone's offset, seconds precision, e.g. 2026-11-16T11:00:38-05:00 (QBT format). */
export function localIso(date: Date, tz: string): string {
  const p = parts(date, tz);
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  const offsetMin = Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
  const sign = offsetMin < 0 ? '-' : '+';
  const abs = Math.abs(offsetMin);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${sign}${hh}:${mm}`;
}

/** Seconds worked today: closed timesheets' durations plus the open one up to now. */
export function sumWorkedSeconds(sheets: ClockTimesheet[], now: Date): number {
  return sheets.reduce((sum, t) => {
    const open = t.on_the_clock || (t.start && !t.end);
    if (open && t.start) {
      const started = Date.parse(t.start);
      return Number.isNaN(started) ? sum : sum + Math.max(0, Math.round((now.getTime() - started) / 1000));
    }
    return sum + Math.max(0, Number(t.duration || 0));
  }, 0);
}

export type PunchLocation = { latitude: number; longitude: number; accuracy: number | null };

/** Location the browser sent with a punch; null when missing or not a real coordinate. */
export function parsePunchLocation(raw: unknown): PunchLocation | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const latitude = Number(r.latitude);
  const longitude = Number(r.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  if (latitude === 0 && longitude === 0) return null; // "null island": a failed fix, not a place
  const acc = Number(r.accuracy);
  return { latitude, longitude, accuracy: Number.isFinite(acc) && acc >= 0 ? Math.round(acc * 10) / 10 : null };
}
