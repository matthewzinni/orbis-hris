import { supabaseClient } from '../services/supabaseClient';
import { getCurrentUserAccess } from '../services/access';
import type {
  LeadershipAcademyFoundationSnapshot,
  LeadershipCompetency,
  LeadershipCourse,
  LeadershipEnrollment,
  LeadershipModule,
  LeadershipPhilosophyContent,
  LeadershipProgramTier,
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
    enrollments: [],
  };

  const probe = await supabaseClient.from('leadership_program_tiers').select('id').limit(1);
  if (probe.error) {
    if (isMissingTableError(probe.error)) {
      cachedFoundation = empty;
      return empty;
    }
    throw probe.error;
  }

  const [tiersRes, competenciesRes, coursesRes, modulesRes, philosophyRes, enrollmentsRes] =
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
        .from('leadership_enrollments')
        .select('*')
        .order('assigned_at', { ascending: false }),
    ]);

  const responses = [tiersRes, competenciesRes, coursesRes, modulesRes, philosophyRes, enrollmentsRes];
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
    enrollments: (enrollmentsRes.data || []).map((row) =>
      mapEnrollment(row as Record<string, unknown>)
    ),
  };

  return cachedFoundation;
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
