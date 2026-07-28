import { getEmployeeMapKeys } from '../ui/badges';
import { supabaseClient } from './supabaseClient';

export type IronShiftAwardMeta = {
  summary: string;
  recognizedOn: string;
  recognizedBy: string;
  awardCount: number;
};

type IronShiftRow = {
  employee_id?: string;
  summary?: string;
  recognized_on?: string;
  recognized_by?: string;
};

function normalizeMap(
  rows: IronShiftRow[]
): Record<string, IronShiftAwardMeta> {
  const grouped = new Map<string, IronShiftRow[]>();

  rows.forEach((row) => {
    const employeeId = String(row.employee_id || '').trim();
    if (!employeeId) return;
    const bucket = grouped.get(employeeId) || [];
    bucket.push(row);
    grouped.set(employeeId, bucket);
  });

  const map: Record<string, IronShiftAwardMeta> = {};

  grouped.forEach((entries, employeeId) => {
    const sorted = [...entries].sort((left, right) =>
      String(right.recognized_on || '').localeCompare(String(left.recognized_on || ''))
    );
    const latest = sorted[0];
    map[employeeId] = {
      summary: String(latest.summary || '').trim(),
      recognizedOn: String(latest.recognized_on || '').trim(),
      recognizedBy: String(latest.recognized_by || '').trim(),
      awardCount: sorted.length,
    };
  });

  return map;
}

export function applyIronShiftAwardRosterMap(
  map: Record<string, IronShiftAwardMeta>
): Record<string, IronShiftAwardMeta> {
  window.currentIronShiftRosterMap = map;
  return map;
}

export async function loadIronShiftAwardRosterMap(): Promise<Record<string, IronShiftAwardMeta>> {
  const { data, error } = await supabaseClient
    .from('care_recognition')
    .select('employee_id, summary, recognized_on, recognized_by, recognition_type')
    .eq('recognition_type', 'iron_shift')
    .order('recognized_on', { ascending: false });

  if (error) {
    console.warn('[IronShift] Could not load awards:', error.message || error);
    return applyIronShiftAwardRosterMap({});
  }

  return applyIronShiftAwardRosterMap(normalizeMap((data || []) as IronShiftRow[]));
}

export function getIronShiftAwardMap(): Record<string, IronShiftAwardMeta> {
  return (window.currentIronShiftRosterMap || {}) as Record<string, IronShiftAwardMeta>;
}

export function getEmployeeIronShiftMeta(
  employee: Record<string, unknown> | null | undefined
): IronShiftAwardMeta | null {
  if (!employee) return null;

  const map = getIronShiftAwardMap();
  for (const key of getEmployeeMapKeys(employee)) {
    const meta = map[key];
    if (meta) return meta;
  }

  return null;
}

export function hasIronShiftAward(employee: Record<string, unknown> | null | undefined): boolean {
  return Boolean(getEmployeeIronShiftMeta(employee));
}

export async function refreshIronShiftAwardRosterMap(): Promise<void> {
  await loadIronShiftAwardRosterMap();
  if (typeof window.updateEmployeeRowBadges === 'function') {
    window.updateEmployeeRowBadges();
  }
  if (typeof window.renderEmployeeDrawerHonors === 'function') {
    window.renderEmployeeDrawerHonors(window.currentEmployee as Record<string, unknown> | null);
  }
  if (typeof window.renderEmployeeIronShiftAdminSection === 'function') {
    window.renderEmployeeIronShiftAdminSection(window.currentEmployee as Record<string, unknown> | null);
  }
}

window.getEmployeeIronShiftMeta = getEmployeeIronShiftMeta;
window.hasIronShiftAward = hasIronShiftAward;
window.loadIronShiftAwardRosterMap = loadIronShiftAwardRosterMap;
window.refreshIronShiftAwardRosterMap = refreshIronShiftAwardRosterMap;
