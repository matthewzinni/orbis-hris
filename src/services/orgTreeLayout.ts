import { employeeDisplayName } from './employeeUtils';
import { getOrgChartEmployeeKey, type OrgChartNode } from './orgChartBuilder';

/** One person in the printable top-down org tree. */
export type OrgTreePerson = {
  key: string;
  name: string;
  title: string;
  department: string;
  /** Supervisor exactly as entered on the roster. */
  supervisor: string;
  /** For a direct report of the top row: the one leader they report to, when not shared. */
  reportsTo?: string;
  children: OrgTreePerson[];
};

/** People who report to the same manager and share a title, shown together in a team card. */
export type OrgTreeTeamGroup = {
  title: string;
  people: OrgTreePerson[];
};

export type OrgTreeModel = {
  /** Top of the chart: everyone with no supervisor on file (e.g. the owners). */
  leaders: OrgTreePerson[];
  /** Direct reports of the leaders, merged when several leaders share one team. */
  topReports: OrgTreePerson[];
  /** Employees whose supervisor on file does not match anyone in the roster. */
  unmatched: OrgTreePerson[];
};

function text(value: unknown): string {
  return String(value ?? '').trim();
}

export function toOrgTreePerson(node: OrgChartNode): OrgTreePerson {
  const e = node.employee;
  return {
    key: getOrgChartEmployeeKey(e),
    name: employeeDisplayName(e),
    title: text(e.position || e.displayPosition) || '—',
    department: text(e.department || e.dept || e.displayDepartment) || '—',
    supervisor: text(e.supervisor || e.displaySupervisor),
    children: node.children.map(toOrgTreePerson),
  };
}

function compact(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Splits builder roots into the chart's top row and anything that could not be matched.
 * Roots with no supervisor are leaders; their reports are pooled so co-owners share one team.
 * Someone whose supervisor names exactly one leader is tagged with that leader and placed on
 * that leader's side: first leader's reports, then shared reports, then each other leader's.
 */
export function buildOrgTreeModel(roots: OrgChartNode[]): OrgTreeModel {
  const leaders: OrgTreePerson[] = [];
  const unmatched: OrgTreePerson[] = [];
  const pooled: OrgTreePerson[] = [];
  const seen = new Set<string>();

  for (const root of roots) {
    const person = toOrgTreePerson(root);
    if (person.supervisor) {
      unmatched.push(person);
      continue;
    }
    leaders.push({ ...person, children: [] });
    for (const child of person.children) {
      if (seen.has(child.key)) continue;
      seen.add(child.key);
      pooled.push(child);
    }
  }

  if (leaders.length < 2) return { leaders, topReports: pooled, unmatched };

  const soleLeader = (person: OrgTreePerson): string | undefined => {
    const sup = compact(person.supervisor);
    return leaders.find((leader) => compact(leader.name) === sup)?.name;
  };
  const tagged = pooled.map((person) => ({ ...person, reportsTo: soleLeader(person) }));
  const ofLeader = (name: string) => tagged.filter((p) => p.reportsTo === name);
  const [first, ...rest] = leaders;
  const topReports = [
    ...ofLeader(first.name),
    ...centerStaffBetweenLeaders(tagged.filter((p) => !p.reportsTo)),
    ...rest.flatMap((leader) => ofLeader(leader.name)),
  ];

  return { leaders, topReports, unmatched };
}

/**
 * Shared reports with no team (e.g. a director without staff) go in the middle, between the
 * leaders who run organizations, so the outer ends of the bar belong to those leaders and
 * lines drawn out to the sides (diagonals) never cross it.
 */
function centerStaffBetweenLeaders(people: OrgTreePerson[]): OrgTreePerson[] {
  const leadersWithTeams = people.filter((p) => p.children.length > 0);
  const staff = people.filter((p) => p.children.length === 0);
  const half = Math.ceil(leadersWithTeams.length / 2);
  return [...leadersWithTeams.slice(0, half), ...staff, ...leadersWithTeams.slice(half)];
}

export function isManager(person: OrgTreePerson): boolean {
  return person.children.length > 0;
}

const LEADERSHIP_TITLE =
  /\b(chief|officer|director|president|vp|owner|ceo|cfo|coo|cto|manager|head|lead)\b/i;

/**
 * Someone who reports straight to the top row but leads no one and holds no leadership title
 * (e.g. a junior specialist under an owner) is drawn one row below the senior leaders,
 * on its own line from the leader they report to.
 */
export function sitsBelowLeadershipRow(person: OrgTreePerson): boolean {
  return !isManager(person) && !LEADERSHIP_TITLE.test(person.title);
}

const HR_DEPARTMENT = /^(human resources|hr|people( operations)?)$/i;

/**
 * HR reporting to the top row is drawn as an island: a box with no connecting lines,
 * set apart from the management chain it may need to document independently.
 */
export function isIsland(person: OrgTreePerson): boolean {
  return HR_DEPARTMENT.test(person.department.trim());
}

export function countReports(person: OrgTreePerson): number {
  return person.children.reduce((sum, child) => sum + 1 + countReports(child), 0);
}

/**
 * A manager whose team is mostly other managers (an executive) shows every report as its own box.
 * Otherwise only sub-managers get boxes and everyone else is listed in one team card.
 */
export function showEveryReportAsBox(person: OrgTreePerson): boolean {
  const managers = person.children.filter(isManager).length;
  const others = person.children.length - managers;
  return managers >= 2 && others <= managers;
}

/** Groups non-managers by title, keeping the order titles first appear in. */
export function groupTeamByTitle(people: OrgTreePerson[]): OrgTreeTeamGroup[] {
  const groups = new Map<string, OrgTreePerson[]>();
  for (const person of people) {
    const bucket = groups.get(person.title) || [];
    bucket.push(person);
    groups.set(person.title, bucket);
  }
  return [...groups.entries()].map(([title, members]) => ({ title, people: members }));
}

/** "Coiling Associate" → "Coiling Associates (9)" for a group heading. */
export function teamGroupLabel(group: OrgTreeTeamGroup): string {
  if (group.people.length === 1) return group.title;
  const plural = /s$/i.test(group.title) ? group.title : `${group.title}s`;
  return `${plural} (${group.people.length})`;
}
