import { employeeDisplayName, type EmployeeLike } from './employeeUtils';

export type OrgChartNode = {
  employee: EmployeeLike;
  children: OrgChartNode[];
};

export type OrgChartBuildResult = {
  roots: OrgChartNode[];
  /** Active employees whose supervisor field does not match anyone in scope. */
  unlinked: EmployeeLike[];
};

function compactName(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function getOrgChartEmployeeKey(employee: EmployeeLike): string {
  return String(employee.dbId || employee.id || employee.employee_id || employee.employeeId || '')
    .trim()
    .toLowerCase();
}

export function getOrgChartDrawerId(employee: EmployeeLike): string {
  return String(employee.dbId || employee.id || employee.employee_id || employee.employeeId || '')
    .trim();
}

function isActiveEmployee(employee: EmployeeLike): boolean {
  return (
    String(employee.status || employee.displayStatus || '')
      .trim()
      .toUpperCase() === 'ACTIVE'
  );
}

function supervisorLabel(employee: EmployeeLike): string {
  return String(employee.supervisor || employee.displaySupervisor || '').trim();
}

export function resolveManagerInRoster(
  employee: EmployeeLike,
  roster: EmployeeLike[]
): EmployeeLike | null {
  const supervisor = supervisorLabel(employee);
  if (!supervisor) return null;

  const selfKey = getOrgChartEmployeeKey(employee);
  const compactSupervisor = compactName(supervisor);
  const supervisorLower = supervisor.toLowerCase();

  let fuzzyMatch: EmployeeLike | null = null;

  for (const candidate of roster) {
    const candidateKey = getOrgChartEmployeeKey(candidate);
    if (!candidateKey || candidateKey === selfKey) continue;

    const name = employeeDisplayName(candidate);
    const nameLower = name.toLowerCase();
    const compactCandidate = compactName(name);

    if (compactCandidate === compactSupervisor || nameLower === supervisorLower) {
      return candidate;
    }

    if (
      !fuzzyMatch &&
      (supervisorLower.includes(nameLower) ||
        nameLower.includes(supervisorLower) ||
        compactCandidate.includes(compactSupervisor) ||
        compactSupervisor.includes(compactCandidate))
    ) {
      fuzzyMatch = candidate;
    }
  }

  return fuzzyMatch;
}

function sortNodes(a: OrgChartNode, b: OrgChartNode): number {
  const deptA = String(a.employee.department || a.employee.dept || '').toLowerCase();
  const deptB = String(b.employee.department || b.employee.dept || '').toLowerCase();
  if (deptA !== deptB) return deptA.localeCompare(deptB);

  return employeeDisplayName(a.employee).localeCompare(employeeDisplayName(b.employee), undefined, {
    sensitivity: 'base',
  });
}

function buildSubtree(
  employee: EmployeeLike,
  childrenByManager: Map<string, EmployeeLike[]>,
  visited: Set<string>
): OrgChartNode {
  const key = getOrgChartEmployeeKey(employee);
  const nextVisited = new Set(visited);
  if (key) nextVisited.add(key);

  const childEmployees = (childrenByManager.get(key) || []).filter((child) => {
    const childKey = getOrgChartEmployeeKey(child);
    return childKey && !nextVisited.has(childKey);
  });

  const children = childEmployees
    .map((child) => buildSubtree(child, childrenByManager, nextVisited))
    .sort(sortNodes);

  return { employee, children };
}

export function buildOrgChart(
  roster: EmployeeLike[],
  options?: { activeOnly?: boolean }
): OrgChartBuildResult {
  const activeOnly = options?.activeOnly !== false;
  const scoped = roster.filter((employee) => !activeOnly || isActiveEmployee(employee));
  const keysInScope = new Set(
    scoped.map(getOrgChartEmployeeKey).filter(Boolean)
  );

  const managerKeyByEmployee = new Map<string, string | null>();
  const unlinked: EmployeeLike[] = [];

  for (const employee of scoped) {
    const employeeKey = getOrgChartEmployeeKey(employee);
    if (!employeeKey) continue;

    const manager = resolveManagerInRoster(employee, scoped);
    const managerKey = manager ? getOrgChartEmployeeKey(manager) : null;

    if (supervisorLabel(employee) && (!managerKey || !keysInScope.has(managerKey))) {
      unlinked.push(employee);
    }

    managerKeyByEmployee.set(employeeKey, managerKey);
  }

  const childrenByManager = new Map<string, EmployeeLike[]>();

  for (const employee of scoped) {
    const employeeKey = getOrgChartEmployeeKey(employee);
    if (!employeeKey) continue;

    const managerKey = managerKeyByEmployee.get(employeeKey) ?? null;
    if (!managerKey || !keysInScope.has(managerKey)) continue;

    const bucket = childrenByManager.get(managerKey) || [];
    bucket.push(employee);
    childrenByManager.set(managerKey, bucket);
  }

  const roots = scoped
    .filter((employee) => {
      const employeeKey = getOrgChartEmployeeKey(employee);
      if (!employeeKey) return false;

      const managerKey = managerKeyByEmployee.get(employeeKey) ?? null;
      return !managerKey || !keysInScope.has(managerKey);
    })
    .map((employee) => buildSubtree(employee, childrenByManager, new Set()))
    .sort(sortNodes);

  unlinked.sort((a, b) =>
    employeeDisplayName(a).localeCompare(employeeDisplayName(b), undefined, { sensitivity: 'base' })
  );

  return { roots, unlinked };
}
