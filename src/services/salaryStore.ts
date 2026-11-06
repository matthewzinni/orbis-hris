/**
 * Supabase access for the Matthew-only Salary page. RLS returns no rows and the
 * RPCs raise for anyone except Matthew; the UI gate is only a convenience.
 */
import { supabaseClient } from './supabaseClient';
import { resolveEmployeeNavigatorMatches } from './employeeNavigatorStore';
import type { EnMatchResult } from './employeeNavigatorBenefits';
import type { CompensationExtra, SalaryHistoryRow, StoredSalaryRow } from './salaryData';

export type SalaryImport = {
  id: string;
  imported_at: string;
  source_filename: string | null;
  row_count: number;
  people_count: number;
  matched_count: number;
  unmatched: Array<{ name: string; hire_date: string | null; reason: string }>;
};

export type SalaryData = {
  latestImport: SalaryImport | null;
  history: StoredSalaryRow[];
  extras: CompensationExtra[];
  notes: Map<string, string>;
};

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function loadSalaryData(): Promise<SalaryData> {
  const [imports, history, extras, notes] = await Promise.all([
    supabaseClient.from('employee_salary_imports').select('*')
      .order('imported_at', { ascending: false }).limit(1),
    supabaseClient.from('employee_salary_history').select('*'),
    supabaseClient.from('employee_compensation_extras').select('*'),
    supabaseClient.from('employee_salary_notes').select('employee_id, notes'),
  ]);
  for (const result of [imports, history, extras, notes]) {
    if (result.error) throw new Error(result.error.message);
  }
  return {
    latestImport: ((imports.data || [])[0] as SalaryImport | undefined) || null,
    history: (history.data || []).map((row) => ({
      id: String(row.id),
      person_key: String(row.person_key || ''),
      employee_id: row.employee_id ? String(row.employee_id) : null,
      en_name: String(row.en_name || ''),
      salary_type: String(row.salary_type || ''),
      effective_date: row.effective_date ? String(row.effective_date) : null,
      pay_basis: row.pay_basis === 'hourly' || row.pay_basis === 'annual' ? row.pay_basis : null,
      annual_base_salary: num(row.annual_base_salary),
      hourly_rate: num(row.hourly_rate),
      hours_per_week: num(row.hours_per_week),
      annual_benefit_salary: num(row.annual_benefit_salary),
      change_reason: String(row.change_reason || ''),
    })),
    extras: (extras.data || []).map((row) => ({
      id: String(row.id),
      employee_id: String(row.employee_id),
      comp_type: row.comp_type,
      amount: num(row.amount) || 0,
      effective_date: row.effective_date ? String(row.effective_date) : null,
      note: row.note ? String(row.note) : null,
    })),
    notes: new Map((notes.data || []).map((row) => [String(row.employee_id), String(row.notes || '')])),
  };
}

export async function saveSalarySnapshot(input: {
  sourceFilename: string;
  rowCount: number;
  results: EnMatchResult[];
  history: SalaryHistoryRow[];
  manualPicks: Map<string, string>;
}): Promise<string> {
  const resolved = resolveEmployeeNavigatorMatches(input.results, input.manualPicks);
  const employeeByKey = new Map<string, string>();
  const claimed = new Map<string, string>();
  for (const { result, employeeId } of resolved) {
    if (!employeeId) continue;
    const name = `${result.person.first_name} ${result.person.last_name}`.trim();
    const other = claimed.get(employeeId);
    if (other) throw new Error(`${other} and ${name} are both matched to the same Orbis employee. Pick one.`);
    claimed.set(employeeId, name);
    employeeByKey.set(result.person.person_key, employeeId);
  }

  const payloadHistory = input.history.map((row) => ({
    ...row,
    employee_id: employeeByKey.get(row.person_key) || '',
    effective_date: row.effective_date || '',
    pay_basis: row.pay_basis || '',
    annual_base_salary: row.annual_base_salary ?? '',
    hourly_rate: row.hourly_rate ?? '',
    hours_per_week: row.hours_per_week ?? '',
    annual_benefit_salary: row.annual_benefit_salary ?? '',
  }));
  const payloadLinks = resolved
    .filter(({ method, employeeId }) => method === 'manual' && employeeId)
    .map(({ result, employeeId }) => ({
      person_key: result.person.person_key,
      employee_id: employeeId,
      en_name: `${result.person.first_name} ${result.person.last_name}`.trim(),
    }));
  const unmatched = resolved
    .filter(({ employeeId }) => !employeeId)
    .map(({ result }) => ({
      name: `${result.person.first_name} ${result.person.last_name}`.trim(),
      hire_date: result.person.hire_date,
      reason: result.review_reason || 'skipped',
    }));

  const { data, error } = await supabaseClient.rpc('orbis_replace_salary_snapshot', {
    p_source_filename: input.sourceFilename,
    p_row_count: input.rowCount,
    p_history: payloadHistory,
    p_links: payloadLinks,
    p_unmatched: unmatched,
  });
  if (error) throw new Error(error.message);
  return String(data);
}

export async function saveCompensationExtra(input: {
  id: string | null;
  employeeId: string;
  compType: CompensationExtra['comp_type'];
  amount: number;
  effectiveDate: string | null;
  note: string;
}): Promise<void> {
  const { error } = await supabaseClient.rpc('orbis_save_compensation_extra', {
    p_id: input.id,
    p_employee_id: input.employeeId,
    p_comp_type: input.compType,
    p_amount: input.amount,
    p_effective_date: input.effectiveDate,
    p_note: input.note,
  });
  if (error) throw new Error(error.message);
}

export async function deleteCompensationExtra(id: string): Promise<void> {
  const { error } = await supabaseClient.rpc('orbis_delete_compensation_extra', { p_id: id });
  if (error) throw new Error(error.message);
}

export async function saveSalaryNotes(employeeId: string, notes: string): Promise<void> {
  const { error } = await supabaseClient.rpc('orbis_save_salary_notes', {
    p_employee_id: employeeId,
    p_notes: notes,
  });
  if (error) throw new Error(error.message);
}
