import { supabaseClient } from '../services/supabaseClient';
import { getCurrentUserAccess } from '../services/access';
import type {
  LeadershipAcademyFoundationSnapshot,
  LeadershipCompetency,
  LeadershipCourse,
  LeadershipCourseAssignment,
  LeadershipEmployeeSummary,
  LeadershipEnrollment,
  LeadershipEnrollmentStatus,
  LeadershipModule,
  LeadershipModuleProgress,
  LeadershipModuleSubmission,
  LeadershipPhilosophyContent,
  LeadershipProgramTier,
  LeadershipQuizAttempt,
  LeadershipQuizQuestion,
} from '../types/leadershipAcademyTypes';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let cachedFoundation: LeadershipAcademyFoundationSnapshot | null = null;

function isUuid(id: string | null | undefined): boolean {
  return Boolean(id && UUID_RE.test(id));
}

export function resolveLeadershipAcademyActorEmail(): string {
  const accessEmail = String(getCurrentUserAccess()?.email || '').trim();
  if (accessEmail) return accessEmail;
  return String((window as { currentUserEmail?: string }).currentUserEmail || '').trim();
}

function isMissingTableError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const code = String(error.code || '');
  const message = String(error.message || '').toLowerCase();
  return (
    code === 'PGRST205' ||
    code === '42P01' ||
    message.includes('does not exist') ||
    message.includes('schema cache')
  );
}

function mapTier(row: Record<string, unknown>): LeadershipProgramTier {
  return {
    id: String(row.id),
    name: String(row.name || ''),
    description: String(row.description || ''),
    intendedAudience: String(row.intended_audience || ''),
    status: String(row.status || 'active') as LeadershipProgramTier['status'],
    displayOrder: Number(row.display_order ?? 0),
    estimatedHours:
      row.estimated_hours === null || row.estimated_hours === undefined
        ? null
        : Number(row.estimated_hours),
    completionRequirements: String(row.completion_requirements || ''),
    createdByEmail: String(row.created_by_email || ''),
    updatedByEmail: String(row.updated_by_email || ''),
  };
}

function mapCompetency(row: Record<string, unknown>): LeadershipCompetency {
  const tierIds = Array.isArray(row.applicable_tier_ids)
    ? row.applicable_tier_ids.map(String)
    : [];
  return {
    id: String(row.id),
    name: String(row.name || ''),
    definition: String(row.definition || ''),
    expectedBehaviors: String(row.expected_behaviors || ''),
    unacceptableBehaviors: String(row.unacceptable_behaviors || ''),
    applicableTierIds: tierIds,
    status: String(row.status || 'active') as LeadershipCompetency['status'],
    displayOrder: Number(row.display_order ?? 0),
  };
}

function mapCourse(row: Record<string, unknown>): LeadershipCourse {
  return {
    id: String(row.id),
    tierId: row.tier_id ? String(row.tier_id) : null,
    title: String(row.title || ''),
    description: String(row.description || ''),
    status: String(row.status || 'draft') as LeadershipCourse['status'],
    isRequired: Boolean(row.is_required),
    estimatedMinutes:
      row.estimated_minutes === null || row.estimated_minutes === undefined
        ? null
        : Number(row.estimated_minutes),
    displayOrder: Number(row.display_order ?? 0),
    passingScorePercent:
      row.passing_score_percent === null || row.passing_score_percent === undefined
        ? null
        : Number(row.passing_score_percent),
    dueRuleDays:
      row.due_rule_days === null || row.due_rule_days === undefined
        ? null
        : Number(row.due_rule_days),
    coverIcon: String(row.cover_icon || ''),
    createdByEmail: String(row.created_by_email || ''),
    updatedByEmail: String(row.updated_by_email || ''),
  };
}

function mapModule(row: Record<string, unknown>): LeadershipModule {
  const requirements = row.completion_requirements;
  return {
    id: String(row.id),
    courseId: String(row.course_id || ''),
    title: String(row.title || ''),
    instructions: String(row.instructions || ''),
    moduleType: String(row.module_type || 'written') as LeadershipModule['moduleType'],
    isRequired: Boolean(row.is_required),
    displayOrder: Number(row.display_order ?? 0),
    estimatedMinutes:
      row.estimated_minutes === null || row.estimated_minutes === undefined
        ? null
        : Number(row.estimated_minutes),
    completionRequirements:
      requirements && typeof requirements === 'object' && !Array.isArray(requirements)
        ? (requirements as Record<string, unknown>)
        : {},
    resourceUrl: String(row.resource_url || ''),
    storagePath: String(row.storage_path || ''),
    allowRetakes: Boolean(row.allow_retakes),
  };
}

function mapPhilosophy(row: Record<string, unknown>): LeadershipPhilosophyContent {
  return {
    id: String(row.id),
    title: String(row.title || ''),
    body: String(row.body || ''),
    status: String(row.status || 'draft') as LeadershipPhilosophyContent['status'],
    isSeedDraft: Boolean(row.is_seed_draft),
    updatedByEmail: String(row.updated_by_email || ''),
  };
}

function mapEnrollment(row: Record<string, unknown>): LeadershipEnrollment {
  return {
    id: String(row.id),
    employeeId: String(row.employee_id || ''),
    tierId: row.tier_id ? String(row.tier_id) : null,
    enrolledByEmail: String(row.enrolled_by_email || ''),
    assignedAt: String(row.assigned_at || ''),
    dueDate: row.due_date ? String(row.due_date) : '',
    status: String(row.status || 'not_started') as LeadershipEnrollment['status'],
    completionPercent: Number(row.completion_percent ?? 0),
    completedAt: row.completed_at ? String(row.completed_at) : null,
    notes: String(row.notes || ''),
  };
}

function mapCourseAssignment(row: Record<string, unknown>): LeadershipCourseAssignment {
  return {
    id: String(row.id),
    enrollmentId: String(row.enrollment_id || ''),
    courseId: String(row.course_id || ''),
    assignedByEmail: String(row.assigned_by_email || ''),
    assignedAt: String(row.assigned_at || ''),
    dueDate: row.due_date ? String(row.due_date) : '',
    status: String(row.status || 'not_started') as LeadershipCourseAssignment['status'],
    completionPercent: Number(row.completion_percent ?? 0),
    completedAt: row.completed_at ? String(row.completed_at) : null,
  };
}

function mapEmployeeSummary(row: Record<string, unknown>): LeadershipEmployeeSummary {
  return {
    id: String(row.id || ''),
    firstName: String(row.first_name || ''),
    lastName: String(row.last_name || ''),
    department: String(row.department || ''),
    position: String(row.position || ''),
    status: String(row.status || ''),
    workEmail: String(row.work_email || ''),
  };
}

function mapModuleProgress(row: Record<string, unknown>): LeadershipModuleProgress {
  return {
    id: String(row.id),
    enrollmentId: String(row.enrollment_id || ''),
    moduleId: String(row.module_id || ''),
    status: String(row.status || 'not_started') as LeadershipModuleProgress['status'],
    startedAt: row.started_at ? String(row.started_at) : null,
    completedAt: row.completed_at ? String(row.completed_at) : null,
    lastActivityAt: row.last_activity_at ? String(row.last_activity_at) : null,
  };
}

function mapModuleSubmission(row: Record<string, unknown>): LeadershipModuleSubmission {
  const response = row.response;
  return {
    id: String(row.id),
    enrollmentId: String(row.enrollment_id || ''),
    moduleId: String(row.module_id || ''),
    submissionType: String(row.submission_type) as LeadershipModuleSubmission['submissionType'],
    response:
      response && typeof response === 'object' && !Array.isArray(response)
        ? (response as Record<string, unknown>)
        : {},
    acknowledgedAt: row.acknowledged_at ? String(row.acknowledged_at) : null,
    updatedAt: String(row.updated_at || ''),
  };
}

function mapQuizAttempt(row: Record<string, unknown>): LeadershipQuizAttempt {
  return {
    id: String(row.id),
    enrollmentId: String(row.enrollment_id || ''),
    moduleId: String(row.module_id || ''),
    attemptNumber: Number(row.attempt_number || 1),
    scorePercent:
      row.score_percent === null || row.score_percent === undefined
        ? null
        : Number(row.score_percent),
    passed: row.passed === null || row.passed === undefined ? null : Boolean(row.passed),
    submittedAt: String(row.submitted_at || ''),
  };
}

export function invalidateLeadershipAcademyCache(): void {
  cachedFoundation = null;
}

export async function fetchLeadershipAcademyFoundation(
  force = false
): Promise<LeadershipAcademyFoundationSnapshot> {
  if (!force && cachedFoundation) {
    return cachedFoundation;
  }

  const empty: LeadershipAcademyFoundationSnapshot = {
    tablesReady: false,
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

  const probe = await supabaseClient.from('leadership_program_tiers').select('id').limit(1);
  if (probe.error) {
    if (isMissingTableError(probe.error)) {
      cachedFoundation = empty;
      return empty;
    }
    throw probe.error;
  }

  const [
    tiersRes,
    competenciesRes,
    coursesRes,
    modulesRes,
    philosophyRes,
    employeesRes,
    enrollmentsRes,
    assignmentsRes,
    progressRes,
    submissionsRes,
    attemptsRes,
  ] =
    await Promise.all([
      supabaseClient
        .from('leadership_program_tiers')
        .select('*')
        .order('display_order', { ascending: true }),
      supabaseClient
        .from('leadership_competencies')
        .select('*')
        .order('display_order', { ascending: true }),
      supabaseClient
        .from('leadership_courses')
        .select('*')
        .order('display_order', { ascending: true }),
      supabaseClient
        .from('leadership_modules')
        .select('*')
        .order('display_order', { ascending: true }),
      supabaseClient
        .from('leadership_philosophy_content')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(1),
      supabaseClient
        .from('employees')
        .select('id, first_name, last_name, department, position, status, work_email')
        .order('last_name', { ascending: true }),
      supabaseClient
        .from('leadership_enrollments')
        .select('*')
        .order('assigned_at', { ascending: false }),
      supabaseClient
        .from('leadership_course_assignments')
        .select('*')
        .order('assigned_at', { ascending: false }),
      supabaseClient.from('leadership_module_progress').select('*'),
      supabaseClient.from('leadership_module_submissions').select('*'),
      supabaseClient
        .from('leadership_quiz_attempts')
        .select('*')
        .order('submitted_at', { ascending: false }),
    ]);

  const responses = [
    tiersRes,
    competenciesRes,
    coursesRes,
    modulesRes,
    philosophyRes,
    employeesRes,
    enrollmentsRes,
    assignmentsRes,
    progressRes,
    submissionsRes,
    attemptsRes,
  ];
  const failed = responses.find((res) => res.error);
  if (failed?.error) {
    throw failed.error;
  }

  cachedFoundation = {
    tablesReady: true,
    tiers: (tiersRes.data || []).map((row) => mapTier(row as Record<string, unknown>)),
    competencies: (competenciesRes.data || []).map((row) =>
      mapCompetency(row as Record<string, unknown>)
    ),
    courses: (coursesRes.data || []).map((row) => mapCourse(row as Record<string, unknown>)),
    modules: (modulesRes.data || []).map((row) => mapModule(row as Record<string, unknown>)),
    philosophy: philosophyRes.data?.[0]
      ? mapPhilosophy(philosophyRes.data[0] as Record<string, unknown>)
      : null,
    employees: (employeesRes.data || []).map((row) =>
      mapEmployeeSummary(row as Record<string, unknown>)
    ),
    enrollments: (enrollmentsRes.data || []).map((row) =>
      mapEnrollment(row as Record<string, unknown>)
    ),
    courseAssignments: (assignmentsRes.data || []).map((row) =>
      mapCourseAssignment(row as Record<string, unknown>)
    ),
    moduleProgress: (progressRes.data || []).map((row) =>
      mapModuleProgress(row as Record<string, unknown>)
    ),
    moduleSubmissions: (submissionsRes.data || []).map((row) =>
      mapModuleSubmission(row as Record<string, unknown>)
    ),
    quizAttempts: (attemptsRes.data || []).map((row) =>
      mapQuizAttempt(row as Record<string, unknown>)
    ),
  };

  return cachedFoundation;
}

export async function createLeadershipEnrollment(input: {
  employeeId: string;
  tierId?: string | null;
  courseId?: string | null;
  dueDate?: string | null;
  notes?: string;
}): Promise<string> {
  const { data, error } = await supabaseClient.rpc('create_leadership_enrollment', {
    p_employee_id: input.employeeId,
    p_tier_id: input.tierId || null,
    p_course_id: input.courseId || null,
    p_due_date: input.dueDate || null,
    p_notes: input.notes || '',
  });
  if (error) throw error;
  invalidateLeadershipAcademyCache();
  return String(data || '');
}

export async function updateLeadershipEnrollment(input: {
  enrollmentId: string;
  status: LeadershipEnrollmentStatus;
  dueDate?: string | null;
  notes?: string;
}): Promise<void> {
  const { error } = await supabaseClient.rpc('update_leadership_enrollment_admin', {
    p_enrollment_id: input.enrollmentId,
    p_status: input.status,
    p_due_date: input.dueDate || null,
    p_notes: input.notes || '',
  });
  if (error) throw error;
  invalidateLeadershipAcademyCache();
}

export async function resetLeadershipEnrollmentProgress(enrollmentId: string): Promise<void> {
  const { error } = await supabaseClient.rpc('reset_leadership_enrollment_progress', {
    p_enrollment_id: enrollmentId,
  });
  if (error) throw error;
  invalidateLeadershipAcademyCache();
}

export async function fetchLeadershipQuiz(moduleId: string): Promise<LeadershipQuizQuestion[]> {
  const { data, error } = await supabaseClient.rpc('get_leadership_quiz', {
    p_module_id: moduleId,
  });
  if (error) throw error;
  const rows = Array.isArray(data) ? data : [];
  return rows.map((row) => {
    const item = row as Record<string, unknown>;
    const options = Array.isArray(item.options) ? item.options : [];
    return {
      id: String(item.id),
      type: String(item.type || 'multiple_choice') as LeadershipQuizQuestion['type'],
      prompt: String(item.prompt || ''),
      displayOrder: Number(item.displayOrder || 0),
      options: options.map((option) => {
        const mapped = option as Record<string, unknown>;
        return {
          id: String(mapped.id),
          text: String(mapped.text || ''),
          displayOrder: Number(mapped.displayOrder || 0),
        };
      }),
    };
  });
}

async function completeInteractiveModule(input: {
  enrollmentId: string;
  moduleId: string;
  submissionType: 'reflection' | 'acknowledgment';
  response: Record<string, unknown>;
}): Promise<void> {
  const { error } = await supabaseClient.rpc('complete_leadership_module', {
    p_enrollment_id: input.enrollmentId,
    p_module_id: input.moduleId,
    p_submission_type: input.submissionType,
    p_response: input.response,
  });
  if (error) throw error;
  invalidateLeadershipAcademyCache();
}

export async function saveLeadershipReflection(
  enrollmentId: string,
  moduleId: string,
  answers: string[]
): Promise<void> {
  await completeInteractiveModule({
    enrollmentId,
    moduleId,
    submissionType: 'reflection',
    response: { answers },
  });
}

export async function saveLeadershipAcknowledgment(
  enrollmentId: string,
  moduleId: string
): Promise<void> {
  await completeInteractiveModule({
    enrollmentId,
    moduleId,
    submissionType: 'acknowledgment',
    response: { acknowledged: true },
  });
}

export async function markLeadershipLessonComplete(
  enrollmentId: string,
  moduleId: string
): Promise<void> {
  const { error } = await supabaseClient.rpc('complete_leadership_lesson', {
    p_enrollment_id: enrollmentId,
    p_module_id: moduleId,
  });
  if (error) throw error;
  invalidateLeadershipAcademyCache();
}

export async function submitLeadershipQuiz(
  enrollmentId: string,
  moduleId: string,
  responses: Array<{ questionId: string; optionId?: string; text?: string }>
): Promise<{ scorePercent: number; passed: boolean; attemptNumber: number }> {
  const { data, error } = await supabaseClient.rpc('submit_leadership_quiz', {
    p_enrollment_id: enrollmentId,
    p_module_id: moduleId,
    p_responses: responses,
  });
  if (error) throw error;
  invalidateLeadershipAcademyCache();
  const result = (data || {}) as Record<string, unknown>;
  return {
    scorePercent: Number(result.scorePercent || 0),
    passed: Boolean(result.passed),
    attemptNumber: Number(result.attemptNumber || 1),
  };
}

export async function recordLeadershipAcademyAuditEvent(input: {
  entityType: string;
  entityId?: string | null;
  employeeId?: string | null;
  actionType: string;
  fieldName?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  note?: string | null;
  actorEmail: string;
}): Promise<void> {
  const { error } = await supabaseClient.from('leadership_audit_events').insert({
    entity_type: input.entityType,
    entity_id: input.entityId || null,
    employee_id: input.employeeId || null,
    action_type: input.actionType,
    field_name: input.fieldName || null,
    old_value: input.oldValue || null,
    new_value: input.newValue || null,
    note: input.note || null,
    actor_email: input.actorEmail,
  });

  if (error && !isMissingTableError(error)) {
    console.warn('[LeadershipAcademy] Audit insert failed:', error.message || error);
  }
}

export async function upsertLeadershipProgramTier(
  tier: LeadershipProgramTier
): Promise<LeadershipProgramTier> {
  const actorEmail = resolveLeadershipAcademyActorEmail();
  const payload = {
    ...(isUuid(tier.id) ? { id: tier.id } : {}),
    name: tier.name,
    description: tier.description,
    intended_audience: tier.intendedAudience,
    status: tier.status,
    display_order: tier.displayOrder,
    estimated_hours: tier.estimatedHours,
    completion_requirements: tier.completionRequirements,
    created_by_email: tier.createdByEmail || actorEmail,
    updated_by_email: actorEmail,
  };

  const { data, error } = await supabaseClient
    .from('leadership_program_tiers')
    .upsert(payload)
    .select('*')
    .single();
  if (error) throw error;
  invalidateLeadershipAcademyCache();
  return mapTier(data as Record<string, unknown>);
}

export async function deleteLeadershipProgramTier(tierId: string): Promise<void> {
  if (!isUuid(tierId)) return;
  const { error } = await supabaseClient.from('leadership_program_tiers').delete().eq('id', tierId);
  if (error) throw error;
  invalidateLeadershipAcademyCache();
}

export async function upsertLeadershipCompetency(
  competency: LeadershipCompetency
): Promise<LeadershipCompetency> {
  const payload = {
    ...(isUuid(competency.id) ? { id: competency.id } : {}),
    name: competency.name,
    definition: competency.definition,
    expected_behaviors: competency.expectedBehaviors,
    unacceptable_behaviors: competency.unacceptableBehaviors,
    applicable_tier_ids: competency.applicableTierIds,
    status: competency.status,
    display_order: competency.displayOrder,
  };

  const { data, error } = await supabaseClient
    .from('leadership_competencies')
    .upsert(payload)
    .select('*')
    .single();
  if (error) throw error;
  invalidateLeadershipAcademyCache();
  return mapCompetency(data as Record<string, unknown>);
}

export async function deleteLeadershipCompetency(competencyId: string): Promise<void> {
  if (!isUuid(competencyId)) return;
  const { error } = await supabaseClient
    .from('leadership_competencies')
    .delete()
    .eq('id', competencyId);
  if (error) throw error;
  invalidateLeadershipAcademyCache();
}

export async function upsertLeadershipCourse(
  course: LeadershipCourse
): Promise<LeadershipCourse> {
  const actorEmail = resolveLeadershipAcademyActorEmail();
  const payload = {
    ...(isUuid(course.id) ? { id: course.id } : {}),
    tier_id: course.tierId || null,
    title: course.title,
    description: course.description,
    status: course.status,
    is_required: course.isRequired,
    estimated_minutes: course.estimatedMinutes,
    display_order: course.displayOrder,
    passing_score_percent: course.passingScorePercent,
    due_rule_days: course.dueRuleDays,
    cover_icon: course.coverIcon,
    created_by_email: course.createdByEmail || actorEmail,
    updated_by_email: actorEmail,
  };

  const { data, error } = await supabaseClient
    .from('leadership_courses')
    .upsert(payload)
    .select('*')
    .single();
  if (error) throw error;
  invalidateLeadershipAcademyCache();
  return mapCourse(data as Record<string, unknown>);
}

export async function deleteLeadershipCourse(courseId: string): Promise<void> {
  if (!isUuid(courseId)) return;
  const { error } = await supabaseClient.from('leadership_courses').delete().eq('id', courseId);
  if (error) throw error;
  invalidateLeadershipAcademyCache();
}

export async function upsertLeadershipModule(module: LeadershipModule): Promise<LeadershipModule> {
  const payload = {
    ...(isUuid(module.id) ? { id: module.id } : {}),
    course_id: module.courseId,
    title: module.title,
    instructions: module.instructions,
    module_type: module.moduleType,
    is_required: module.isRequired,
    display_order: module.displayOrder,
    estimated_minutes: module.estimatedMinutes,
    completion_requirements: module.completionRequirements,
    resource_url: module.resourceUrl || null,
    storage_path: module.storagePath || null,
    allow_retakes: module.allowRetakes,
  };

  const { data, error } = await supabaseClient
    .from('leadership_modules')
    .upsert(payload)
    .select('*')
    .single();
  if (error) throw error;
  invalidateLeadershipAcademyCache();
  return mapModule(data as Record<string, unknown>);
}

export async function deleteLeadershipModule(moduleId: string): Promise<void> {
  if (!isUuid(moduleId)) return;
  const { error } = await supabaseClient.from('leadership_modules').delete().eq('id', moduleId);
  if (error) throw error;
  invalidateLeadershipAcademyCache();
}

export async function upsertLeadershipPhilosophy(
  philosophy: LeadershipPhilosophyContent
): Promise<LeadershipPhilosophyContent> {
  const actorEmail = resolveLeadershipAcademyActorEmail();
  const payload = {
    ...(isUuid(philosophy.id) ? { id: philosophy.id } : {}),
    title: philosophy.title,
    body: philosophy.body,
    status: philosophy.status,
    is_seed_draft: philosophy.isSeedDraft,
    updated_by_email: actorEmail,
  };

  const { data, error } = await supabaseClient
    .from('leadership_philosophy_content')
    .upsert(payload)
    .select('*')
    .single();
  if (error) throw error;
  invalidateLeadershipAcademyCache();
  return mapPhilosophy(data as Record<string, unknown>);
}
