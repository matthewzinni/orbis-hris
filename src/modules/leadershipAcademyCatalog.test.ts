import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  renderLeadershipCompetenciesCatalog,
  renderLeadershipPhilosophyPanel,
  renderLeadershipProgramsCatalog,
} from '../modules/leadershipAcademyCatalog';
import type { LeadershipAcademyFoundationSnapshot } from '../types/leadershipAcademyTypes';

const emptySnapshot: LeadershipAcademyFoundationSnapshot = {
  tablesReady: true,
  tiers: [],
  competencies: [],
  courses: [],
  modules: [],
  philosophy: null,
  employees: [],
  enrollments: [],
  courseAssignments: [],
  moduleProgress: [],
  moduleSubmissions: [],
  quizAttempts: [],
};

describe('leadershipAcademyCatalog', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { esc: (value: unknown) => String(value ?? '') });
  });

  it('renders empty program catalog states', () => {
    const html = renderLeadershipProgramsCatalog(emptySnapshot, null);
    expect(html).toContain('No program tiers yet.');
    expect(html).toContain('No courses yet.');
    expect(html).toContain('Select a course to view modules.');
    expect(html).toContain('leadershipAddTierBtn');
  });

  it('renders course module actions when a course is selected', () => {
    const snapshot: LeadershipAcademyFoundationSnapshot = {
      ...emptySnapshot,
      tiers: [
        {
          id: 'tier-1',
          name: 'Emerging Leader',
          description: '',
          intendedAudience: 'New leads',
          status: 'active',
          displayOrder: 1,
          estimatedHours: 8,
          completionRequirements: '',
          createdByEmail: '',
          updatedByEmail: '',
        },
      ],
      courses: [
        {
          id: 'course-1',
          tierId: 'tier-1',
          title: 'Lead at BTW',
          description: '',
          status: 'draft',
          isRequired: true,
          estimatedMinutes: 45,
          displayOrder: 1,
          passingScorePercent: 80,
          dueRuleDays: 30,
          coverIcon: '',
          createdByEmail: '',
          updatedByEmail: '',
        },
      ],
      modules: [
        {
          id: 'module-1',
          courseId: 'course-1',
          title: 'Intro',
          instructions: '',
          moduleType: 'written',
          isRequired: true,
          displayOrder: 1,
          estimatedMinutes: 10,
          completionRequirements: {},
          resourceUrl: '',
          storagePath: '',
          allowRetakes: false,
        },
      ],
    };

    const html = renderLeadershipProgramsCatalog(snapshot, 'course-1');
    expect(html).toContain('Lead at BTW');
    expect(html).toContain('data-leadership-edit-module="module-1"');
    expect(html).toContain('Intro');
  });

  it('renders philosophy create and edit affordances', () => {
    expect(renderLeadershipPhilosophyPanel(null)).toContain('leadershipCreatePhilosophyBtn');
    expect(
      renderLeadershipPhilosophyPanel({
        id: 'phil-1',
        title: 'What Leadership Means at BTW',
        body: 'Serve the team.',
        status: 'draft',
        isSeedDraft: true,
        updatedByEmail: 'admin@example.com',
      })
    ).toContain('leadershipEditPhilosophyBtn');
  });

  it('renders competency table rows', () => {
    const html = renderLeadershipCompetenciesCatalog([
      {
        id: 'comp-1',
        name: 'Ownership',
        definition: 'Own outcomes',
        expectedBehaviors: 'Follow through',
        unacceptableBehaviors: 'Blame shifting',
        applicableTierIds: ['tier-1'],
        status: 'active',
        displayOrder: 1,
      },
    ]);
    expect(html).toContain('Ownership');
    expect(html).toContain('leadershipAddCompetencyBtn');
  });
});
