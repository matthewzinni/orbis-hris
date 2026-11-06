/**
 * Employee Navigator (EN) benefits import: parse EN's Row-Based ad hoc report CSV,
 * match EN people to Orbis employees, and summarize one employee's benefits.
 *
 * Pure functions only (no Supabase / DOM) so the matching rules are unit-tested.
 * SSNs in the export are used only in memory to group dependent rows with their
 * employee and are never returned or stored.
 */

export type EnRelationship = 'Employee' | 'Spouse' | 'Child' | 'Domestic Partner' | string;

export type EnEnrollmentStatus = 'enrolled' | 'waived';

/** One plan election (or waiver) for the employee or a dependent. */
export type EnEnrollmentRow = {
  person_key: string;
  relationship: EnRelationship;
  member_name: string;
  plan_type: string;
  carrier: string;
  plan_name: string;
  coverage_level: string;
  effective_date: string | null;
  end_date: string | null;
  status: EnEnrollmentStatus;
  decline_reason: string;
  cost_per_pay: number | null;
  benefit_amount: number | null;
};

/** One EN employee (legal names as EN has them). */
export type EnPerson = {
  person_key: string;
  first_name: string;
  last_name: string;
  preferred_name: string;
  employment_status: string;
  hire_date: string | null;
  /** Used for matching only; not stored. */
  emails: string[];
  enrollments: EnEnrollmentRow[];
  /** Dependents EN lists for this employee, including ones on no plan. */
  dependents: Array<{ name: string; relationship: string }>;
};

export type EnReportParseResult = {
  people: EnPerson[];
  rowCount: number;
  warnings: string[];
};

export const EN_REQUIRED_COLUMNS = [
  'Relationship', 'First Name', 'Last Name', 'Hire Date', 'Benefit', 'Plan',
  'Decline Reason', 'EE Per Pay Cost',
] as const;

const COLUMN_ALIASES: Record<string, string[]> = {
  ssn: ['employee ssn'],
  relationship: ['relationship'],
  first: ['first name'],
  last: ['last name'],
  preferred: ['preferred name'],
  workEmail: ['work email'],
  personalEmail: ['personal email', 'primary email'],
  employmentStatus: ['employment status'],
  hireDate: ['hire date'],
  benefit: ['benefit'],
  carrier: ['carrier'],
  plan: ['plan'],
  coverage: ['coverage level'],
  startDate: ['start date', 'effective date'],
  endDate: ['end date'],
  declineReason: ['decline reason', 'declined reason'],
  cost: ['ee per pay cost'],
  benefitAmount: ['benefit amount', 'approved benefit amount'],
};

/* ------------------------------------------------------------------ CSV */

/** RFC 4180-style CSV parse (quoted commas, escaped quotes, quoted newlines). */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  const source = String(text || '').replace(/^﻿/, '');

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (inQuotes) {
      if (char === '"' && source[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((value) => value.trim() !== ''));
}

function normalizeHeader(value: string): string {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** MM/DD/YYYY (EN) or YYYY-MM-DD → YYYY-MM-DD. */
export function toIsoDate(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const us = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) return `${us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;
}

/** "$1,234.56" → 1234.56; blank → null. */
export function parseMoney(value: unknown): number | null {
  const raw = String(value ?? '').replace(/[$,\s]/g, '');
  if (!raw) return null;
  const negative = /^\(.*\)$/.test(raw);
  const amount = Number(raw.replace(/[()]/g, ''));
  if (!Number.isFinite(amount)) return null;
  return negative ? -amount : amount;
}

export function normalizeNamePart(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, '')
    .replace(/[^a-z]/g, '');
}

export function enPersonKey(first: string, last: string, hireDateIso: string | null): string {
  return `${normalizeNamePart(first)}|${normalizeNamePart(last)}|${hireDateIso || ''}`;
}

/* ------------------------------------------------------------ Report parse */

export function parseEmployeeNavigatorReport(text: string, today = new Date()): EnReportParseResult {
  const rows = parseCsvRows(text);
  const warnings: string[] = [];
  if (rows.length < 2) {
    return { people: [], rowCount: 0, warnings: ['The file has no data rows.'] };
  }

  const headers = rows[0].map(normalizeHeader);
  const missing = EN_REQUIRED_COLUMNS.filter((column) => !headers.includes(normalizeHeader(column)));
  if (missing.length) {
    throw new Error(
      `This doesn't look like the Orbis Benefits report from Employee Navigator. Missing column(s): ${missing.join(', ')}.`
    );
  }

  const index: Record<string, number> = {};
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    index[field] = aliases.map((alias) => headers.indexOf(alias)).find((position) => position >= 0) ?? -1;
  }
  const read = (cells: string[], field: string) =>
    index[field] >= 0 ? String(cells[index[field]] ?? '').trim() : '';

  const todayIso = today.toISOString().slice(0, 10);
  const peopleByGroup = new Map<string, EnPerson>();
  const order: EnPerson[] = [];
  let lastEmployeeGroup = '';
  let dataRows = 0;

  for (const cells of rows.slice(1)) {
    dataRows += 1;
    const relationship = read(cells, 'relationship') || 'Employee';
    const isEmployeeRow = relationship.toLowerCase() === 'employee';
    const ssn = read(cells, 'ssn').replace(/\D/g, '');
    const hireDate = toIsoDate(read(cells, 'hireDate'));
    const first = read(cells, 'first');
    const last = read(cells, 'last');

    // Group by SSN in memory when present; otherwise dependents follow their employee.
    let group = ssn ? `ssn:${ssn}` : '';
    if (!group) group = isEmployeeRow ? `row:${enPersonKey(first, last, hireDate)}` : lastEmployeeGroup;
    if (!group) {
      warnings.push(`Row ${dataRows + 1}: dependent row with no employee before it was skipped.`);
      continue;
    }

    let person = peopleByGroup.get(group);
    if (isEmployeeRow) {
      lastEmployeeGroup = group;
      if (!person || !person.person_key) {
        const created: EnPerson = person || {
          person_key: '', first_name: '', last_name: '', preferred_name: '',
          employment_status: '', hire_date: null, emails: [], enrollments: [], dependents: [],
        };
        created.person_key = enPersonKey(first, last, hireDate);
        created.first_name = first;
        created.last_name = last;
        created.preferred_name = read(cells, 'preferred');
        created.employment_status = read(cells, 'employmentStatus');
        created.hire_date = hireDate;
        if (!person) {
          peopleByGroup.set(group, created);
          order.push(created);
        }
        person = created;
      }
      for (const email of [read(cells, 'workEmail'), read(cells, 'personalEmail')]) {
        const normalized = email.toLowerCase();
        if (normalized && !person.emails.includes(normalized)) person.emails.push(normalized);
      }
    } else if (!person) {
      // Dependent row arrived before its employee row (SSN grouping): hold a placeholder.
      person = {
        person_key: '', first_name: '', last_name: '', preferred_name: '',
        employment_status: '', hire_date: null, emails: [], enrollments: [], dependents: [],
      };
      peopleByGroup.set(group, person);
      order.push(person);
    }

    const memberName = `${first} ${last}`.trim();
    if (!isEmployeeRow && !person.dependents.some((d) => d.name === memberName)) {
      person.dependents.push({ name: memberName, relationship });
    }

    const benefit = read(cells, 'benefit');
    if (!benefit) continue; // "Not enrolled" row: person with no elections.

    const endDate = toIsoDate(read(cells, 'endDate'));
    if (endDate && endDate < todayIso) continue; // ended coverage is not current

    const declineReason = read(cells, 'declineReason');
    const planName = read(cells, 'plan');
    const status: EnEnrollmentStatus = planName && !declineReason ? 'enrolled' : 'waived';
    // A dependent "declined" row means that dependent is not on the plan; nothing to show.
    if (!isEmployeeRow && status === 'waived') continue;

    person.enrollments.push({
      person_key: '',
      relationship,
      member_name: memberName,
      plan_type: benefit,
      carrier: status === 'enrolled' ? read(cells, 'carrier') : '',
      plan_name: status === 'enrolled' ? planName : '',
      coverage_level: status === 'enrolled' ? read(cells, 'coverage') : '',
      effective_date: toIsoDate(read(cells, 'startDate')),
      end_date: endDate,
      status,
      decline_reason: declineReason,
      cost_per_pay: isEmployeeRow ? parseMoney(read(cells, 'cost')) : null,
      benefit_amount: parseMoney(read(cells, 'benefitAmount')),
    });
  }

  const people = order.filter((person) => {
    if (person.person_key) return true;
    warnings.push('Dependent rows without a matching employee row were skipped.');
    return false;
  });
  for (const person of people) {
    for (const enrollment of person.enrollments) enrollment.person_key = person.person_key;
  }

  return { people, rowCount: dataRows, warnings: [...new Set(warnings)] };
}

/* ---------------------------------------------------------------- Matching */

export type OrbisEmployeeForMatch = {
  id: string;
  first_name: string;
  last_name: string;
  hire_date?: string | null;
  status?: string;
  emails: string[];
};

export type EnMatchMethod = 'link' | 'email' | 'name' | 'manual';

export type EnMatchCandidate = { employee_id: string; label: string; reason: string };

export type EnMatchResult = {
  person: EnPerson;
  employee_id: string | null;
  method: EnMatchMethod | null;
  /** Why the person needs review (only when employee_id is null). */
  review_reason: 'ambiguous' | 'no_match' | 'conflict' | null;
  candidates: EnMatchCandidate[];
};

const NICKNAMES: string[][] = [
  ['alexander', 'alex', 'xander'], ['alexandra', 'alex', 'lexi'], ['robert', 'rob', 'bob', 'bobby'],
  ['william', 'will', 'bill', 'billy', 'liam'], ['james', 'jim', 'jimmy', 'jamie'],
  ['michael', 'mike', 'mikey'], ['christopher', 'chris'], ['christina', 'chris', 'tina'],
  ['katherine', 'kate', 'katie', 'kathy'], ['elizabeth', 'liz', 'beth', 'betsy', 'eliza'],
  ['jennifer', 'jen', 'jenny'], ['joseph', 'joe', 'joey'], ['daniel', 'dan', 'danny'],
  ['anthony', 'tony'], ['thomas', 'tom', 'tommy'], ['richard', 'rick', 'rich', 'dick'],
  ['nicholas', 'nick'], ['matthew', 'matt'], ['benjamin', 'ben'], ['samuel', 'sam'],
  ['samantha', 'sam'], ['jonathan', 'jon'], ['joshua', 'josh'], ['andrew', 'andy', 'drew'],
  ['timothy', 'tim'], ['steven', 'steve'], ['stephen', 'steve'], ['edward', 'ed', 'eddie'],
  ['patricia', 'pat', 'trish'], ['margaret', 'maggie', 'peggy'], ['deborah', 'deb', 'debbie'],
  ['rebecca', 'becky'], ['victoria', 'vicky', 'tori'], ['zachary', 'zach'],
];

function areNicknames(a: string, b: string): boolean {
  if (!a || !b || a === b) return false;
  return NICKNAMES.some((group) => group.includes(a) && group.includes(b));
}

function editDistance(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const above = previous[j];
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      diagonal = above;
    }
  }
  return previous[b.length];
}

function enFirstNames(person: EnPerson): string[] {
  return [person.first_name, person.preferred_name].flatMap(firstNameVariants);
}

/** "Michael (Andrew)" → ["michael", "andrew"]; plain names → [name]. */
export function firstNameVariants(value: unknown): string[] {
  const raw = String(value ?? '');
  const inParens = [...raw.matchAll(/\(([^)]*)\)/g)].map((match) => match[1]);
  const base = raw.replace(/\([^)]*\)/g, ' ');
  return [...new Set([base, ...inParens].map(normalizeNamePart).filter(Boolean))];
}

export function orbisEmployeeLabel(employee: OrbisEmployeeForMatch): string {
  const status = employee.status && !/^active$/i.test(employee.status) ? ` (${employee.status})` : '';
  return `${employee.first_name} ${employee.last_name}`.trim() + status;
}

/** Ranked "did you mean" suggestions; never auto-applied. */
export function suggestEmployees(
  person: EnPerson,
  employees: OrbisEmployeeForMatch[],
  limit = 3
): EnMatchCandidate[] {
  const firsts = enFirstNames(person);
  const last = normalizeNamePart(person.last_name);
  const scored = employees.map((employee) => {
    const eFirsts = firstNameVariants(employee.first_name);
    const eLast = normalizeNamePart(employee.last_name);
    const reasons: string[] = [];
    let score = 0;
    if (eLast && eLast === last) { score += 2; reasons.push('same last name'); }
    else if (eLast && last && Math.min(eLast.length, last.length) >= 4 && editDistance(eLast, last) <= 2) {
      score += 1.5; reasons.push('similar last name');
    }
    const pairs = firsts.flatMap((first) => eFirsts.map((eFirst) => [first, eFirst] as const));
    if (pairs.some(([first, eFirst]) => first === eFirst)) { score += 2; reasons.push('same first name'); }
    else if (pairs.some(([first, eFirst]) => areNicknames(first, eFirst))) { score += 1.5; reasons.push('nickname'); }
    else if (pairs.some(([first, eFirst]) => editDistance(first, eFirst) <= 2 && Math.min(first.length, eFirst.length) >= 4)) {
      score += 1; reasons.push('similar first name');
    }
    if (person.hire_date && employee.hire_date && person.hire_date === String(employee.hire_date).slice(0, 10)) {
      score += 1.5; reasons.push('same hire date');
    }
    return { employee, score, reasons };
  });
  return scored
    .filter((entry) => entry.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => ({
      employee_id: entry.employee.id,
      label: orbisEmployeeLabel(entry.employee),
      reason: entry.reasons.join(', '),
    }));
}

/**
 * Match EN people to Orbis employees. Auto-matches only on a saved link, an exact
 * email, or an exact first+last name (EN legal or preferred first name) that is
 * unique on both sides. Everything else is returned for HR review — never guessed.
 */
export function matchEnPeopleToEmployees(
  people: EnPerson[],
  employees: OrbisEmployeeForMatch[],
  links: Map<string, string>
): EnMatchResult[] {
  const byId = new Map(employees.map((employee) => [employee.id, employee]));
  const results: EnMatchResult[] = people.map((person) => {
    const linked = links.get(person.person_key);
    if (linked && byId.has(linked)) {
      return { person, employee_id: linked, method: 'link', review_reason: null, candidates: [] };
    }

    const emailHits = employees.filter((employee) =>
      employee.emails.some((email) => email && person.emails.includes(email.toLowerCase()))
    );
    if (emailHits.length === 1) {
      return { person, employee_id: emailHits[0].id, method: 'email', review_reason: null, candidates: [] };
    }

    const firsts = enFirstNames(person);
    const last = normalizeNamePart(person.last_name);
    const nameHits = employees.filter(
      (employee) =>
        normalizeNamePart(employee.last_name) === last &&
        firstNameVariants(employee.first_name).some((first) => firsts.includes(first))
    );
    if (nameHits.length === 1) {
      return { person, employee_id: nameHits[0].id, method: 'name', review_reason: null, candidates: [] };
    }

    const candidates = nameHits.length > 1
      ? nameHits.map((employee) => ({ employee_id: employee.id, label: orbisEmployeeLabel(employee), reason: 'same name' }))
      : suggestEmployees(person, employees);
    return {
      person,
      employee_id: null,
      method: null,
      review_reason: nameHits.length > 1 || emailHits.length > 1 ? 'ambiguous' : 'no_match',
      candidates,
    };
  });

  // Two EN people auto-matched to one Orbis employee: send both to review.
  const claims = new Map<string, EnMatchResult[]>();
  for (const result of results) {
    if (!result.employee_id) continue;
    claims.set(result.employee_id, [...(claims.get(result.employee_id) || []), result]);
  }
  for (const [employeeId, claimants] of claims) {
    if (claimants.length < 2) continue;
    const employee = byId.get(employeeId);
    for (const result of claimants) {
      if (result.method === 'link') continue;
      result.employee_id = null;
      result.method = null;
      result.review_reason = 'conflict';
      result.candidates = employee
        ? [{ employee_id: employee.id, label: orbisEmployeeLabel(employee), reason: 'also matched another EN person' }]
        : [];
    }
  }
  return results;
}

/* ----------------------------------------------------------------- Summary */

export type EmployeeBenefitsStatus =
  | 'enrolled'
  | 'waived'
  | 'not_enrolled'
  | 'not_found'
  | 'not_eligible_overseas'
  | 'no_import';

export const BENEFITS_STATUS_LABELS: Record<EmployeeBenefitsStatus, string> = {
  enrolled: 'Enrolled',
  waived: 'Waived',
  not_enrolled: 'Not enrolled',
  not_found: 'Not found in Employee Navigator',
  not_eligible_overseas: 'Not eligible (overseas)',
  no_import: 'No Employee Navigator import yet',
};

export const PLAN_TYPE_ORDER = ['Medical', 'Dental', 'Vision', 'Group Life', 'Voluntary Life'];

/** Group Life is employer-paid and automatic, so it doesn't count as an election. */
const NON_ELECTIVE_PLAN_TYPES = new Set(['group life']);

export type StoredEnPerson = {
  person_key: string;
  first_name: string;
  last_name: string;
  preferred_name?: string | null;
  employment_status?: string | null;
  hire_date?: string | null;
  dependents?: Array<{ name: string; relationship: string }> | null;
};

export type EmployeeBenefitsSummary = {
  status: EmployeeBenefitsStatus;
  enName: string | null;
  enEmploymentStatus: string | null;
  plans: EnEnrollmentRow[];
  waived: EnEnrollmentRow[];
  totalCostPerPay: number;
  dependents: Array<{ name: string; relationship: string; planTypes: string[] }>;
  basicLifeOnly: boolean;
};

function planTypeRank(planType: string): number {
  const rank = PLAN_TYPE_ORDER.indexOf(planType);
  return rank === -1 ? PLAN_TYPE_ORDER.length : rank;
}

export function summarizeEmployeeBenefits(input: {
  hasImport: boolean;
  isOverseas: boolean;
  person: StoredEnPerson | null;
  enrollments: EnEnrollmentRow[];
}): EmployeeBenefitsSummary {
  const empty: EmployeeBenefitsSummary = {
    status: 'no_import', enName: null, enEmploymentStatus: null, plans: [], waived: [],
    totalCostPerPay: 0, dependents: [], basicLifeOnly: false,
  };
  if (!input.hasImport) return empty;
  if (!input.person) {
    return { ...empty, status: input.isOverseas ? 'not_eligible_overseas' : 'not_found' };
  }

  const sortRows = (rows: EnEnrollmentRow[]) =>
    [...rows].sort((a, b) => planTypeRank(a.plan_type) - planTypeRank(b.plan_type));
  const employeeRows = input.enrollments.filter((row) => row.relationship.toLowerCase() === 'employee');
  const plans = sortRows(employeeRows.filter((row) => row.status === 'enrolled'));
  const waived = sortRows(employeeRows.filter((row) => row.status === 'waived'));
  const electivePlans = plans.filter((row) => !NON_ELECTIVE_PLAN_TYPES.has(row.plan_type.toLowerCase()));

  const dependentPlans = new Map<string, Set<string>>();
  for (const row of input.enrollments) {
    if (row.relationship.toLowerCase() === 'employee' || row.status !== 'enrolled') continue;
    const set = dependentPlans.get(row.member_name) || new Set<string>();
    set.add(row.plan_type);
    dependentPlans.set(row.member_name, set);
  }
  const dependentList = [...(input.person.dependents || [])];
  for (const row of input.enrollments) {
    if (row.relationship.toLowerCase() !== 'employee' && !dependentList.some((d) => d.name === row.member_name)) {
      dependentList.push({ name: row.member_name, relationship: row.relationship });
    }
  }
  const dependents = dependentList.map((dependent) => ({
    ...dependent,
    planTypes: [...(dependentPlans.get(dependent.name) || [])].sort((a, b) => planTypeRank(a) - planTypeRank(b)),
  }));

  let status: EmployeeBenefitsStatus = 'not_enrolled';
  if (electivePlans.length) status = 'enrolled';
  else if (waived.length) status = 'waived';

  const totalCostPerPay = Math.round(
    plans.reduce((sum, row) => sum + (row.cost_per_pay || 0), 0) * 100
  ) / 100;

  const preferred = input.person.preferred_name ? ` (${input.person.preferred_name})` : '';
  return {
    status,
    enName: `${input.person.first_name}${preferred} ${input.person.last_name}`.trim(),
    enEmploymentStatus: input.person.employment_status || null,
    plans,
    waived,
    totalCostPerPay,
    dependents,
    basicLifeOnly: status !== 'enrolled' && plans.length > 0,
  };
}
