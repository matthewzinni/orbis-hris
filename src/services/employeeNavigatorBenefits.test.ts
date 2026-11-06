import { describe, expect, it } from 'vitest';
import {
  matchEnPeopleToEmployees,
  parseCsvRows,
  parseEmployeeNavigatorReport,
  summarizeEmployeeBenefits,
  type OrbisEmployeeForMatch,
} from './employeeNavigatorBenefits';

const HEADER = [
  '', 'Employee SSN', 'Relationship', 'First Name', 'Last Name', 'Preferred Name', 'Employee ID',
  'Payroll ID', 'Work Email', 'Personal Email', 'Employment Status', 'Hire Date', 'Plan Type',
  'Benefit', 'Carrier', 'Plan', 'Coverage Level', 'Enrollment Type', 'Start Date', 'End Date',
  'Decline Reason', 'EE Per Pay Cost', 'Benefit Amount',
].join(',');

type RowInput = {
  ssn: string; rel?: string; first: string; last: string; preferred?: string; email?: string;
  status?: string; hire: string; benefit?: string; carrier?: string; plan?: string;
  coverage?: string; start?: string; end?: string; decline?: string; cost?: string; amount?: string;
};

function row(r: RowInput): string {
  const quote = (value: string | undefined) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  return [
    'contact', r.ssn, r.rel ?? 'Employee', r.first, r.last, r.preferred ?? '', '', '', r.email ?? '', '',
    r.status ?? 'Active', r.hire, '', r.benefit ?? '', r.carrier ?? '', r.plan ?? '', r.coverage ?? '',
    r.benefit ? 'Current' : '', r.start ?? '', r.end ?? '', r.decline ?? '', r.cost ?? '', r.amount ?? '',
  ].map(quote).join(',');
}

const TODAY = new Date('2026-11-06T12:00:00Z');

const SAMPLE = [
  HEADER,
  row({ ssn: '000-00-0001', first: 'Pat', last: 'Example', email: 'pat@example.com', hire: '02/22/2021',
    benefit: 'Medical', carrier: 'Blue Cross Blue Shield of North Carolina',
    plan: '2026 Blue Options Gold 2500 (Buy-Up Plan)', coverage: 'Employee + Child(ren)',
    start: '07/01/2026', cost: '$412.18' }),
  row({ ssn: '000-00-0001', first: 'Pat', last: 'Example', hire: '02/22/2021', benefit: 'Group Life',
    carrier: 'Mutual of Omaha', plan: '2026 Mutual of Omaha Basic Life', coverage: 'Employee',
    start: '03/01/2026', cost: '$0.00', amount: '$50,000.00' }),
  row({ ssn: '000-00-0001', first: 'Pat', last: 'Example', hire: '02/22/2021', benefit: 'Vision',
    decline: 'Not Interested', start: '03/01/2026' }),
  row({ ssn: '000-00-0001', rel: 'Child', first: 'Riley', last: 'Example', hire: '02/22/2021',
    benefit: 'Medical', carrier: 'Blue Cross Blue Shield of North Carolina',
    plan: '2026 Blue Options Gold 2500 (Buy-Up Plan)', coverage: 'Employee + Child(ren)', start: '07/01/2026' }),
  row({ ssn: '000-00-0001', rel: 'Spouse', first: 'Sam', last: 'Example', hire: '02/22/2021',
    benefit: 'Medical', plan: '2026 Blue Options Gold 2500 (Buy-Up Plan)', coverage: 'Employee',
    decline: "Covered under spouse's plan", start: '07/01/2026' }),
  row({ ssn: '000-00-0002', first: 'Alexander', last: 'Doe', hire: '01/01/2018', benefit: 'Medical',
    decline: 'Covered under spouse\'s plan', start: '03/01/2026' }),
  row({ ssn: '000-00-0002', first: 'Alexander', last: 'Doe', hire: '01/01/2018', benefit: 'Group Life',
    carrier: 'Mutual of Omaha', plan: '2026 Mutual of Omaha Basic Life', coverage: 'Employee',
    start: '03/01/2026', cost: '$0.00', amount: '$50,000.00' }),
  row({ ssn: '000-00-0003', first: 'Jordan', last: 'Lilley', hire: '09/14/2026' }),
  row({ ssn: '000-00-0004', first: 'Old', last: 'Timer', status: 'Terminated', hire: '09/21/2023',
    benefit: 'Medical', plan: '2024 BCBS Base Medical Plan', coverage: 'Employee', start: '03/01/2024',
    end: '06/30/2024', cost: '$61.31' }),
].join('\r\n');

describe('parseCsvRows', () => {
  it('handles quoted commas, escaped quotes and newlines inside quotes', () => {
    expect(parseCsvRows('a,b\r\n"x, y","he said ""hi""\nthere"\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'he said "hi"\nthere'],
    ]);
  });
});

describe('parseEmployeeNavigatorReport', () => {
  const parsed = parseEmployeeNavigatorReport(SAMPLE, TODAY);

  it('groups dependents with their employee and never keeps SSNs', () => {
    expect(parsed.people.map((p) => p.person_key)).toEqual([
      'pat|example|2021-02-22', 'alexander|doe|2018-01-01', 'jordan|lilley|2026-09-14', 'old|timer|2023-09-21',
    ]);
    expect(JSON.stringify(parsed.people)).not.toMatch(/000-00|00000000/);
  });

  it('classifies enrolled, waived and dependent rows', () => {
    const pat = parsed.people[0];
    expect(pat.enrollments.filter((e) => e.status === 'enrolled').map((e) => e.plan_type))
      .toEqual(['Medical', 'Group Life', 'Medical']);
    expect(pat.enrollments.find((e) => e.status === 'waived')?.decline_reason).toBe('Not Interested');
    expect(pat.enrollments[0].cost_per_pay).toBe(412.18);
    expect(pat.enrollments[0].effective_date).toBe('2026-07-01');
    expect(pat.dependents).toEqual([
      { name: 'Riley Example', relationship: 'Child' },
      { name: 'Sam Example', relationship: 'Spouse' },
    ]);
  });

  it('drops coverage that already ended', () => {
    expect(parsed.people[3].enrollments).toEqual([]);
  });

  it('rejects a CSV that is not the EN report', () => {
    expect(() => parseEmployeeNavigatorReport('Name,Plan\nA,B')).toThrow(/Missing column/);
  });
});

describe('matchEnPeopleToEmployees', () => {
  const people = parseEmployeeNavigatorReport(SAMPLE, TODAY).people;
  const employees: OrbisEmployeeForMatch[] = [
    { id: 'BTW1', first_name: 'Pat', last_name: 'Example', emails: ['PAT@example.com'], hire_date: '2021-02-22' },
    { id: 'BTW2', first_name: 'Alex', last_name: 'Doe', emails: [], hire_date: '2018-01-01' },
    { id: 'BTW3', first_name: 'Jordan', last_name: 'Lilly', emails: [], hire_date: '2026-09-14' },
  ];

  it('auto-matches only on email or exact name and surfaces the rest with suggestions', () => {
    const results = matchEnPeopleToEmployees(people, employees, new Map());
    expect(results.map((r) => [r.employee_id, r.method, r.review_reason])).toEqual([
      ['BTW1', 'email', null],
      [null, null, 'no_match'],
      [null, null, 'no_match'],
      [null, null, 'no_match'],
    ]);
    expect(results[1].candidates[0]).toMatchObject({ employee_id: 'BTW2' });
    expect(results[1].candidates[0].reason).toContain('nickname');
    expect(results[2].candidates[0]).toMatchObject({ employee_id: 'BTW3' });
    expect(results[3].candidates).toEqual([]);
  });

  it('uses saved links first', () => {
    const results = matchEnPeopleToEmployees(people, employees, new Map([['alexander|doe|2018-01-01', 'BTW2']]));
    expect(results[1]).toMatchObject({ employee_id: 'BTW2', method: 'link' });
  });

  it('matches on EN preferred name and flags duplicate names as ambiguous', () => {
    const twins: OrbisEmployeeForMatch[] = [
      { id: 'A', first_name: 'Jordan', last_name: 'Lilley', emails: [] },
      { id: 'B', first_name: 'Jordan', last_name: 'Lilley', emails: [] },
    ];
    const [result] = matchEnPeopleToEmployees([people[2]], twins, new Map());
    expect(result.review_reason).toBe('ambiguous');
    expect(result.candidates.map((c) => c.employee_id)).toEqual(['A', 'B']);

    const preferred = { ...people[1], preferred_name: 'Alex' };
    const [byPreferred] = matchEnPeopleToEmployees([preferred], employees, new Map());
    expect(byPreferred).toMatchObject({ employee_id: 'BTW2', method: 'name' });
  });

  it('reads parenthetical first names in Orbis and suggests close last-name spellings', () => {
    const roster: OrbisEmployeeForMatch[] = [
      { id: 'L1', first_name: 'Jordan (Jo)', last_name: 'Lilly', emails: [] },
    ];
    const [result] = matchEnPeopleToEmployees([people[2]], roster, new Map());
    expect(result.employee_id).toBeNull();
    expect(result.candidates[0]).toMatchObject({ employee_id: 'L1' });
    expect(result.candidates[0].reason).toContain('same first name');
    const [exact] = matchEnPeopleToEmployees(
      [people[2]], [{ id: 'L2', first_name: 'Jordan (Jo)', last_name: 'Lilley', emails: [] }], new Map()
    );
    expect(exact).toMatchObject({ employee_id: 'L2', method: 'name' });
  });

  it('sends two EN people claiming one employee to review', () => {
    const clone = { ...people[0], person_key: 'pat|example|1999-01-01' };
    const results = matchEnPeopleToEmployees([people[0], clone], employees, new Map());
    expect(results.every((r) => r.review_reason === 'conflict')).toBe(true);
  });
});

describe('summarizeEmployeeBenefits', () => {
  const people = parseEmployeeNavigatorReport(SAMPLE, TODAY).people;

  it('summarizes an enrolled employee like the EN Benefits Summary page', () => {
    const summary = summarizeEmployeeBenefits({
      hasImport: true, isOverseas: false, person: people[0], enrollments: people[0].enrollments,
    });
    expect(summary.status).toBe('enrolled');
    expect(summary.plans.map((p) => p.plan_type)).toEqual(['Medical', 'Group Life']);
    expect(summary.waived.map((p) => p.plan_type)).toEqual(['Vision']);
    expect(summary.totalCostPerPay).toBe(412.18);
    expect(summary.dependents).toEqual([
      { name: 'Riley Example', relationship: 'Child', planTypes: ['Medical'] },
      { name: 'Sam Example', relationship: 'Spouse', planTypes: [] },
    ]);
  });

  it('treats basic life plus waivers as waived and no rows as not enrolled', () => {
    const waived = summarizeEmployeeBenefits({
      hasImport: true, isOverseas: false, person: people[1], enrollments: people[1].enrollments,
    });
    expect(waived).toMatchObject({ status: 'waived', basicLifeOnly: true });
    expect(summarizeEmployeeBenefits({
      hasImport: true, isOverseas: false, person: people[2], enrollments: [],
    }).status).toBe('not_enrolled');
  });

  it('distinguishes not found, overseas and no import', () => {
    const base = { person: null, enrollments: [] };
    expect(summarizeEmployeeBenefits({ ...base, hasImport: true, isOverseas: false }).status).toBe('not_found');
    expect(summarizeEmployeeBenefits({ ...base, hasImport: true, isOverseas: true }).status).toBe('not_eligible_overseas');
    expect(summarizeEmployeeBenefits({ ...base, hasImport: false, isOverseas: true }).status).toBe('no_import');
  });
});
