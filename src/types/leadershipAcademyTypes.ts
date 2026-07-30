export type LeadershipRecordStatus = 'active' | 'archived';
export type LeadershipCourseStatus = 'draft' | 'active' | 'archived';
export type LeadershipPhilosophyStatus = 'draft' | 'published';

export type LeadershipModuleType =
  | 'written'
  | 'video'
  | 'document'
  | 'quiz'
  | 'reflection'
  | 'assignment'
  | 'acknowledgment';

export type LeadershipQuizQuestionType = 'multiple_choice' | 'true_false' | 'short_answer';

export type LeadershipEnrollmentStatus =
  | 'not_started'
  | 'in_progress'
  | 'completed'
  | 'overdue'
  | 'paused'
  | 'withdrawn';

export type LeadershipModuleProgressStatus = 'not_started' | 'in_progress' | 'completed';

export type LeadershipWorkshopStatus = 'scheduled' | 'completed' | 'cancelled';

export type LeadershipWorkshopAttendanceStatus =
  | 'registered'
  | 'attended'
  | 'absent'
  | 'excused'
  | 'cancelled';

export type LeadershipCoachingConfidentiality = 'standard' | 'restricted' | 'hr_only';

export type LeadershipGoalStatus = 'not_started' | 'in_progress' | 'completed' | 'cancelled';

export type LeadershipProgramTier = {
  id: string;
  name: string;
  description: string;
  intendedAudience: string;
  status: LeadershipRecordStatus;
  displayOrder: number;
  estimatedHours: number | null;
  completionRequirements: string;
  createdByEmail: string;
  updatedByEmail: string;
};

export type LeadershipCompetency = {
  id: string;
  name: string;
  definition: string;
  expectedBehaviors: string;
  unacceptableBehaviors: string;
  applicableTierIds: string[];
  status: LeadershipRecordStatus;
  displayOrder: number;
};

export type LeadershipCourse = {
  id: string;
  tierId: string | null;
  title: string;
  description: string;
  status: LeadershipCourseStatus;
  isRequired: boolean;
  estimatedMinutes: number | null;
  displayOrder: number;
  passingScorePercent: number | null;
  dueRuleDays: number | null;
  coverIcon: string;
  createdByEmail: string;
  updatedByEmail: string;
};

export type LeadershipModule = {
  id: string;
  courseId: string;
  title: string;
  instructions: string;
  moduleType: LeadershipModuleType;
  isRequired: boolean;
  displayOrder: number;
  estimatedMinutes: number | null;
  completionRequirements: Record<string, unknown>;
  resourceUrl: string;
  storagePath: string;
  allowRetakes: boolean;
};

export type LeadershipPhilosophyContent = {
  id: string;
  title: string;
  body: string;
  status: LeadershipPhilosophyStatus;
  isSeedDraft: boolean;
  updatedByEmail: string;
};

export type LeadershipEnrollment = {
  id: string;
  employeeId: string;
  tierId: string | null;
  enrolledByEmail: string;
  assignedAt: string;
  dueDate: string;
  status: LeadershipEnrollmentStatus;
  completionPercent: number;
  completedAt: string | null;
  notes: string;
};

export type LeadershipModuleProgress = {
  id: string;
  enrollmentId: string;
  moduleId: string;
  status: LeadershipModuleProgressStatus;
  startedAt: string | null;
  completedAt: string | null;
  lastActivityAt: string | null;
};

export type LeadershipModuleSubmission = {
  id: string;
  enrollmentId: string;
  moduleId: string;
  submissionType: 'reflection' | 'acknowledgment';
  response: Record<string, unknown>;
  acknowledgedAt: string | null;
  updatedAt: string;
};

export type LeadershipQuizOption = {
  id: string;
  text: string;
  displayOrder: number;
};

export type LeadershipQuizQuestion = {
  id: string;
  type: LeadershipQuizQuestionType;
  prompt: string;
  displayOrder: number;
  options: LeadershipQuizOption[];
};

export type LeadershipQuizAttempt = {
  id: string;
  enrollmentId: string;
  moduleId: string;
  attemptNumber: number;
  scorePercent: number | null;
  passed: boolean | null;
  submittedAt: string;
};

export type LeadershipAcademyFoundationSnapshot = {
  tablesReady: boolean;
  tiers: LeadershipProgramTier[];
  competencies: LeadershipCompetency[];
  courses: LeadershipCourse[];
  modules: LeadershipModule[];
  philosophy: LeadershipPhilosophyContent | null;
  enrollments: LeadershipEnrollment[];
  moduleProgress: LeadershipModuleProgress[];
  moduleSubmissions: LeadershipModuleSubmission[];
  quizAttempts: LeadershipQuizAttempt[];
};

export type LeadershipAcademyTab =
  | 'dashboard'
  | 'my-development'
  | 'programs'
  | 'participants'
  | 'workshops'
  | 'coaching'
  | 'goals'
  | 'competencies'
  | 'philosophy'
  | 'reports';

export const LEADERSHIP_PROGRAM_TIER_LABELS = [
  'Emerging Leader',
  'Supervisor Academy',
  'Manager Development',
  'Executive Leadership',
] as const;

export const LEADERSHIP_ACADEMY_MODULE_VERSION = 'phase-1-slice-4-interactive-module-1';
