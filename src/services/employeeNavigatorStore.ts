/**
 * Supabase access for the Employee Navigator benefits snapshot (HR admins only).
 */
import { supabaseClient } from './supabaseClient';
import type {
  EnEnrollmentRow,
  EnMatchResult,
  EnPerson,
  StoredEnPerson,
} from './employeeNavigatorBenefits';

export type EmployeeNavigatorImport = {
  id: string;
  imported_at: string;
  source_filename: string | null;
  row_count: number;
  people_count: number;
  matched_count: number;
  unmatched: Array<{ name: string; hire_date: string | null; employment_status: string; reason: string }>;
};

export type StoredEnPersonRow = StoredEnPerson & {
  employee_id: string | null;
  match_method: string | null;
};

export async function loadLatestEmployeeNavigatorImport(): Promise<EmployeeNavigatorImport | null> {
  const { data, error } = await supabaseClient
    .from('employee_navigator_imports')
    .select('*')
    .order('imported_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as EmployeeNavigatorImport | null) || null;
}

export async function loadEmployeeNavigatorLinks(): Promise<Map<string, string>> {
  const { data, error } = await supabaseClient
    .from('employee_navigator_links')
    .select('person_key, employee_id');
  if (error) throw new Error(error.message);
  return new Map(
    (data || []).map((row) => [String(row.person_key), String(row.employee_id)])
  );
}

export async function loadEmployeeBenefitsSnapshot(
  importId: string,
  employeeId: string
): Promise<{ person: StoredEnPersonRow | null; enrollments: EnEnrollmentRow[] }> {
  const { data: people, error } = await supabaseClient
    .from('employee_navigator_people')
    .select('*')
    .eq('import_id', importId)
    .eq('employee_id', employeeId)
    .limit(1);
  if (error) throw new Error(error.message);
  const person = (people?.[0] as StoredEnPersonRow | undefined) || null;
  if (!person) return { person: null, enrollments: [] };

  const { data: rows, error: rowsError } = await supabaseClient
    .from('employee_benefit_enrollments')
    .select('*')
    .eq('import_id', importId)
    .eq('person_key', person.person_key);
  if (rowsError) throw new Error(rowsError.message);
  const enrollments = (rows || []).map((row) => ({
    ...(row as EnEnrollmentRow),
    cost_per_pay: row.cost_per_pay === null ? null : Number(row.cost_per_pay),
    benefit_amount: row.benefit_amount === null ? null : Number(row.benefit_amount),
  }));
  return { person, enrollments };
}

/**
 * HR's review choices override automatic matching: person_key → Orbis employee id,
 * or '' to leave that EN person unmatched.
 */
export function resolveEmployeeNavigatorMatches(
  results: EnMatchResult[],
  manualPicks: Map<string, string>
): Array<{ result: EnMatchResult; employeeId: string | null; method: EnMatchResult['method'] }> {
  return results.map((result) => {
    if (manualPicks.has(result.person.person_key)) {
      const picked = manualPicks.get(result.person.person_key) || '';
      return { result, employeeId: picked || null, method: picked ? ('manual' as const) : null };
    }
    return { result, employeeId: result.employee_id, method: result.method };
  });
}

export async function saveEmployeeNavigatorSnapshot(input: {
  sourceFilename: string;
  rowCount: number;
  results: EnMatchResult[];
  manualPicks: Map<string, string>;
}): Promise<string> {
  const people: EnPerson[] = input.results.map((result) => result.person);
  const resolved = resolveEmployeeNavigatorMatches(input.results, input.manualPicks);
  const claimed = new Map<string, string>();
  for (const { result, employeeId } of resolved) {
    if (!employeeId) continue;
    const name = `${result.person.first_name} ${result.person.last_name}`.trim();
    const other = claimed.get(employeeId);
    if (other) throw new Error(`${other} and ${name} are both matched to the same Orbis employee. Pick one.`);
    claimed.set(employeeId, name);
  }

  const payloadPeople = resolved.map(({ result, employeeId, method }) => ({
    person_key: result.person.person_key,
    employee_id: employeeId || '',
    match_method: employeeId ? method : '',
    first_name: result.person.first_name,
    last_name: result.person.last_name,
    preferred_name: result.person.preferred_name,
    employment_status: result.person.employment_status,
    hire_date: result.person.hire_date || '',
    dependents: result.person.dependents,
  }));
  const payloadEnrollments = people.flatMap((person) =>
    person.enrollments.map((row) => ({
      ...row,
      effective_date: row.effective_date || '',
      end_date: row.end_date || '',
      cost_per_pay: row.cost_per_pay ?? '',
      benefit_amount: row.benefit_amount ?? '',
    }))
  );
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
      employment_status: result.person.employment_status,
      reason: result.review_reason || 'skipped',
    }));

  const { data, error } = await supabaseClient.rpc('orbis_replace_employee_navigator_snapshot', {
    p_source_filename: input.sourceFilename,
    p_row_count: input.rowCount,
    p_people: payloadPeople,
    p_enrollments: payloadEnrollments,
    p_links: payloadLinks,
    p_unmatched: unmatched,
  });
  if (error) throw new Error(error.message);
  return String(data);
}
