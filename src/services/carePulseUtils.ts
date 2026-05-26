import type { CarePulseSurveySnapshot } from '../types/careEngagementTypes';

export function isPulseDemoSnapshot(pulse: Pick<CarePulseSurveySnapshot, 'periodLabel'>): boolean {
  const label = String(pulse.periodLabel || '').trim().toLowerCase();
  return label.includes('demo') || label.includes('preview') || label.includes('sample');
}

export function pickDisplayPulseSnapshot(
  snapshots: CarePulseSurveySnapshot[]
): CarePulseSurveySnapshot | null {
  if (!snapshots.length) return null;
  return snapshots.find((row) => !isPulseDemoSnapshot(row)) || snapshots[0];
}

export function clampPulseScore(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(5, Math.max(0, Math.round(numeric * 10) / 10));
}
