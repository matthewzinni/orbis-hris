// Pure matching for punch-locations (no Deno / network), shared with vitest.
//
// A timesheet's clock-in / clock-out location comes from:
//   1. an Orbis punch for that timesheet (time_clock_punches, exact GPS at the tap), else
//   2. the QuickBooks Time app's GPS point closest in time (within MAX_GAP_MINUTES), else
//   3. nothing ("no location").

export const MAX_GAP_MINUTES = 15;

export type GeoPoint = {
  user_id: number | string;
  created: string;
  latitude: number;
  longitude: number;
  accuracy?: number | null;
};

export type OrbisPunch = {
  employee_id: string;
  qbt_timesheet_id: number | string | null;
  action: 'clock_in' | 'clock_out';
  punched_at: string;
  latitude: number;
  longitude: number;
  accuracy_m: number | null;
};

export type Sheet = { id: number | string; user_id: number | string; start?: string; end?: string; type?: string };

export type PunchSpot = {
  at: string;
  source: 'orbis' | 'qbt_app' | 'none';
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  /** Minutes between the punch and the QBT GPS point used (qbt_app only). */
  gapMinutes: number | null;
};

function ms(iso: string | undefined | null): number {
  const t = Date.parse(String(iso || ''));
  return Number.isNaN(t) ? NaN : t;
}

/** Closest GPS point for this user to the given time, within MAX_GAP_MINUTES. */
export function nearestPoint(points: GeoPoint[], userId: string, atIso: string): { point: GeoPoint; gap: number } | null {
  const at = ms(atIso);
  if (Number.isNaN(at)) return null;
  let best: { point: GeoPoint; gap: number } | null = null;
  for (const p of points) {
    if (String(p.user_id) !== userId) continue;
    const t = ms(p.created);
    if (Number.isNaN(t)) continue;
    const gap = Math.abs(t - at) / 60000;
    if (gap <= MAX_GAP_MINUTES && (!best || gap < best.gap)) best = { point: p, gap };
  }
  return best;
}

export function spotFor(
  sheet: Sheet,
  which: 'clock_in' | 'clock_out',
  punches: OrbisPunch[],
  points: GeoPoint[]
): PunchSpot | null {
  const at = which === 'clock_in' ? sheet.start : sheet.end;
  if (!at) return null; // still on the clock: no clock-out yet

  const orbis = punches.find((p) => p.action === which && String(p.qbt_timesheet_id ?? '') === String(sheet.id));
  if (orbis) {
    return {
      at,
      source: 'orbis',
      latitude: orbis.latitude,
      longitude: orbis.longitude,
      accuracy: orbis.accuracy_m,
      gapMinutes: null,
    };
  }

  const near = nearestPoint(points, String(sheet.user_id), at);
  if (near) {
    return {
      at,
      source: 'qbt_app',
      latitude: near.point.latitude,
      longitude: near.point.longitude,
      accuracy: near.point.accuracy ?? null,
      gapMinutes: Math.round(near.gap * 10) / 10,
    };
  }
  return { at, source: 'none', latitude: null, longitude: null, accuracy: null, gapMinutes: null };
}

/** Google Maps link for a point (opened only when someone clicks it). */
export function mapUrl(latitude: number | null, longitude: number | null): string {
  if (latitude == null || longitude == null) return '';
  return `https://www.google.com/maps?q=${latitude.toFixed(6)},${longitude.toFixed(6)}`;
}
