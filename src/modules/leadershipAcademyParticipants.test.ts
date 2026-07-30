import { describe, expect, it } from 'vitest';
import type { LeadershipAcademyFoundationSnapshot } from '../types/leadershipAcademyTypes';
import { renderLeadershipParticipants } from './leadershipAcademyParticipants';

const snapshot: LeadershipAcademyFoundationSnapshot = {
  tablesReady: true,
  tiers: [
    {
      id: 'tier-1',
      name: 'Emerging Leader',
      description: '',
      intendedAudience: '',
      status: 'active',
      displayOrder: 1,
      estimatedHours: 1,
      completionRequirements: '',
      createdByEmail: '',
      updatedByEmail: '',
    },
  ],
  competencies: [],
  courses: [
    {
      id: 'course-1',
      tierId: 'tier-1',
      title: 'What It Means to Lead at BTW',
      description: '',
      status: 'active',
      isRequired: true,
      estimatedMinutes: 60,
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
      title: 'Personal Leadership Reflection',
      instructions: '',
      moduleType: 'reflection',
      isRequired: true,
      displayOrder: 1,
      estimatedMinutes: 10,
      completionRequirements: { questions: ['What will you practice?'] },
      resourceUrl: '',
      storagePath: '',
      allowRetakes: false,
    },
  ],
  philosophy: null,
  employees: [
    {
      id: 'EMP-1',
      firstName: 'Jordan',
      lastName: 'Test',
      department: 'Learning and Development',
      position: 'Test Participant',
      status: 'Active',
      workEmail: 'jordan@example.test',
    },
  ],
  enrollments: [
    {
      id: 'enrollment-1',
      employeeId: 'EMP-1',
      tierId: 'tier-1',
      enrolledByEmail: 'admin@example.test',
      assignedAt: '2026-07-30T12:00:00Z',
      dueDate: '2026-08-30',
      status: 'in_progress',
      completionPercent: 50,
      completedAt: null,
      notes: '',
    },
  ],
  courseAssignments: [
    {
      id: 'assignment-1',
      enrollmentId: 'enrollment-1',
      courseId: 'course-1',
      assignedByEmail: 'admin@example.test',
      assignedAt: '2026-07-30T12:00:00Z',
      dueDate: '2026-08-30',
      status: 'in_progress',
      completionPercent: 50,
      completedAt: null,
    },
  ],
  moduleProgress: [
    {
      id: 'progress-1',
      enrollmentId: 'enrollment-1',
      moduleId: 'module-1',
      status: 'completed',
      startedAt: '2026-07-30T12:00:00Z',
      completedAt: '2026-07-30T12:05:00Z',
      lastActivityAt: '2026-07-30T12:05:00Z',
    },
  ],
  moduleSubmissions: [
    {
      id: 'submission-1',
      enrollmentId: 'enrollment-1',
      moduleId: 'module-1',
      submissionType: 'reflection',
      response: { answers: ['Clarify expectations.'] },
      acknowledgedAt: null,
      updatedAt: '2026-07-30T12:05:00Z',
    },
  ],
  quizAttempts: [],
};

describe('Leadership Academy participants', () => {
  it('renders enrollment status and progress', () => {
    const html = renderLeadershipParticipants(snapshot, {
      canManage: true,
      showEnrollmentForm: false,
      selectedEnrollmentId: null,
      filters: { search: '', status: '' },
    });
    expect(html).toContain('Jordan Test');
    expect(html).toContain('Emerging Leader');
    expect(html).toContain('50%');
    expect(html).toContain('+ Enroll participant');
  });

  it('renders saved reflection responses in participant detail', () => {
    const html = renderLeadershipParticipants(snapshot, {
      canManage: true,
      showEnrollmentForm: false,
      selectedEnrollmentId: 'enrollment-1',
      filters: { search: '', status: '' },
    });
    expect(html).toContain('What will you practice?');
    expect(html).toContain('Clarify expectations.');
    expect(html).toContain('Reset progress');
  });

  it('filters participants without exposing admin actions to supervisors', () => {
    const html = renderLeadershipParticipants(snapshot, {
      canManage: false,
      showEnrollmentForm: false,
      selectedEnrollmentId: null,
      filters: { search: 'missing', status: '' },
    });
    expect(html).toContain('No participants match these filters.');
    expect(html).not.toContain('+ Enroll participant');
  });
});
