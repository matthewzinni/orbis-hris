/**
 * Text for Attendance → Live from QuickBooks Time: every punch today with the breaks between
 * them (people clock out for lunch and back in), plus hours worked. Pure, no DOM.
 */
import type { LivePunch } from '../services/attendanceLiveStatus';

function formatClockTime(iso: string | null): string {
  if (!iso) return '—';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleTimeString(undefined, { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' });
}

/** "In 7:15 AM · Out 12:30 PM · lunch 30m · In 1:00 PM" — every punch today, with the gaps between them. */
export function describePunches(punches: LivePunch[] | undefined): string {
  if (!punches || !punches.length) return '';
  const parts: string[] = [];
  punches.forEach((p, i) => {
    if (i > 0) {
      const prevOut = punches[i - 1].out;
      const gapMin = prevOut ? Math.round((Date.parse(p.in) - Date.parse(prevOut)) / 60000) : NaN;
      if (Number.isFinite(gapMin) && gapMin > 0) {
        parts.push(`break ${gapMin >= 60 ? `${Math.floor(gapMin / 60)}h ${gapMin % 60}m` : `${gapMin}m`}`);
      }
    }
    parts.push(`In ${formatClockTime(p.in)}`);
    if (p.out) parts.push(`Out ${formatClockTime(p.out)}`);
  });
  return parts.join(' · ');
}

export function formatWorkedHours(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return '—';
  const totalMin = Math.round(seconds / 60);
  return `${Math.floor(totalMin / 60)}h ${String(totalMin % 60).padStart(2, '0')}m`;
}

