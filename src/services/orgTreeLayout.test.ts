import { describe, expect, it } from 'vitest';
import { buildOrgChart } from './orgChartBuilder';
import {
  buildOrgTreeModel,
  countReports,
  groupTeamByTitle,
  showEveryReportAsBox,
  teamGroupLabel,
} from './orgTreeLayout';

const emp = (id: string, first: string, last: string, position: string, supervisor = '') => ({
  id,
  first_name: first,
  last_name: last,
  position,
  department: 'Ops',
  supervisor,
  status: 'ACTIVE',
});

const roster = [
  emp('1', 'Brent', 'Wynne', 'Owner / CEO'),
  emp('2', 'Trent', 'Wynne', 'Owner / CEO'),
  emp('3', 'Cole', 'Woolard', 'COO', 'Trent & Brent Wynne'),
  emp('4', 'Dean', 'McLean', 'FBA Manager', 'Cole Woolard'),
  emp('5', 'Leah', 'Payne', 'FBA Associate', 'Dean McLean'),
  emp('6', 'Will', 'Respess', 'Fulfillment Manager', 'Cole Woolard'),
  emp('7', 'Angel', 'Ledezma', 'Fulfillment Associate', 'Will Respess'),
  emp('8', 'Austin', 'Woolard', 'Fulfillment Associate', 'Will Respess'),
  emp('9', 'James', 'Gruber', 'Facility Director', 'Cole Woolard'),
  emp('10', 'Pat', 'Nobody', 'Associate', 'Someone Gone'),
  emp('11', 'Sam', 'Montgomery', 'Technology Associate', 'Brent Wynne'),
  emp('12', 'Matthew', 'Zinni', 'HR Director', 'Trent Wynne'),
];

describe('buildOrgTreeModel', () => {
  it('puts people with no supervisor on top and pools their reports', () => {
    const { roots } = buildOrgChart(roster);
    const model = buildOrgTreeModel(roots);
    expect(model.leaders.map((p) => p.name).sort()).toEqual(['Brent Wynne', 'Trent Wynne']);
    expect(model.topReports.map((p) => p.name)).toEqual(['Sam Montgomery', 'Cole Woolard', 'Matthew Zinni']);
    expect(model.unmatched.map((p) => p.name)).toEqual(['Pat Nobody']);
  });

  it('tags people who report to only one leader', () => {
    const { roots } = buildOrgChart(roster);
    const byName = Object.fromEntries(buildOrgTreeModel(roots).topReports.map((p) => [p.name, p.reportsTo]));
    expect(byName).toEqual({
      'Sam Montgomery': 'Brent Wynne',
      'Cole Woolard': undefined,
      'Matthew Zinni': 'Trent Wynne',
    });
  });

  it('counts everyone under a manager', () => {
    const { roots } = buildOrgChart(roster);
    const cole = buildOrgTreeModel(roots).topReports.find((p) => p.name === 'Cole Woolard')!;
    expect(countReports(cole)).toBe(6);
  });
});

describe('showEveryReportAsBox', () => {
  it('boxes every report for a manager of managers', () => {
    const { roots } = buildOrgChart(roster);
    const cole = buildOrgTreeModel(roots).topReports.find((p) => p.name === 'Cole Woolard')!;
    expect(showEveryReportAsBox(cole)).toBe(true);
  });

  it('uses a team card for a manager of individual contributors', () => {
    const { roots } = buildOrgChart(roster);
    const will = buildOrgTreeModel(roots).topReports.find((p) => p.name === 'Cole Woolard')!.children.find((p) => p.name === 'Will Respess')!;
    expect(showEveryReportAsBox(will)).toBe(false);
  });
});

describe('groupTeamByTitle', () => {
  it('groups by title and labels plurals with counts', () => {
    const { roots } = buildOrgChart(roster);
    const will = buildOrgTreeModel(roots).topReports.find((p) => p.name === 'Cole Woolard')!.children.find((p) => p.name === 'Will Respess')!;
    const groups = groupTeamByTitle(will.children);
    expect(groups).toHaveLength(1);
    expect(teamGroupLabel(groups[0])).toBe('Fulfillment Associates (2)');
  });
});
