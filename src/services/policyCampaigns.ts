import { supabaseClient } from './supabaseClient';
import { isActiveDashboardEmployee } from './employeeUtils';

export type PolicyCampaignStatus = 'draft' | 'active' | 'closed';
export type PolicyAssignmentStatus = 'pending' | 'completed' | 'overdue';

export type PolicyCampaign = {
  id: string;
  title: string;
  description?: string;
  document_library_id?: string | null;
  document_title: string;
  due_date: string;
  status: PolicyCampaignStatus;
  target_all_active: boolean;
  target_departments: string[];
  target_positions: string[];
  created_by_email?: string | null;
  published_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type PolicyCampaignAssignment = {
  id: string;
  campaign_id: string;
  employee_id: string;
  due_date: string;
  status: PolicyAssignmentStatus;
  completed_at?: string | null;
  acknowledgment_id?: string | null;
  reminded_at?: string | null;
  created_at?: string;
};

export type PolicyCampaignStats = {
  total: number;
  completed: number;
  pending: number;
  overdue: number;
  completionPct: number;
};

export type PolicyCampaignWithStats = PolicyCampaign & PolicyCampaignStats;

type EmployeeRow = Record<string, unknown>;

function normalizeStringArray(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => String(value || '').trim())
    .filter(Boolean);
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function employeeMatchesCampaignTargets(
  employee: EmployeeRow,
  campaign: Pick<PolicyCampaign, 'target_all_active' | 'target_departments' | 'target_positions'>
): boolean {
  if (!isActiveDashboardEmployee(employee)) return false;

  if (campaign.target_all_active) return true;

  const departments = normalizeStringArray(campaign.target_departments);
  const positions = normalizeStringArray(campaign.target_positions);

  if (!departments.length && !positions.length) return false;

  const dept = String(employee.department || employee.dept || '').trim();
  const position = String(employee.position || '').trim();

  const deptMatch =
    !departments.length ||
    departments.some((value) => value.localeCompare(dept, undefined, { sensitivity: 'base' }) === 0);

  const positionMatch =
    !positions.length ||
    positions.some((value) => value.localeCompare(position, undefined, { sensitivity: 'base' }) === 0);

  return deptMatch && positionMatch;
}

export function computeCampaignStats(
  assignments: Array<Pick<PolicyCampaignAssignment, 'status'>>
): PolicyCampaignStats {
  const total = assignments.length;
  const completed = assignments.filter((row) => row.status === 'completed').length;
  const overdue = assignments.filter((row) => row.status === 'overdue').length;
  const pending = assignments.filter((row) => row.status === 'pending').length;
  const completionPct = total ? Math.round((completed / total) * 100) : 0;

  return { total, completed, pending, overdue, completionPct };
}

export async function refreshPolicyCampaignOverdueStatuses(): Promise<void> {
  const today = todayIsoDate();

  const { error } = await supabaseClient
    .from('policy_campaign_assignments')
    .update({ status: 'overdue' })
    .in('status', ['pending'])
    .lt('due_date', today);

  if (error) {
    console.warn('[PolicyCampaigns] Could not refresh overdue statuses:', error);
  }
}

export async function loadPolicyCampaigns(): Promise<PolicyCampaignWithStats[]> {
  await refreshPolicyCampaignOverdueStatuses();

  const { data: campaigns, error } = await supabaseClient
    .from('policy_campaigns')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message || 'Could not load policy campaigns.');
  }

  const rows = (campaigns || []) as PolicyCampaign[];
  if (!rows.length) return [];

  const ids = rows.map((row) => row.id);
  const { data: assignments, error: assignmentError } = await supabaseClient
    .from('policy_campaign_assignments')
    .select('campaign_id, status')
    .in('campaign_id', ids);

  if (assignmentError) {
    throw new Error(assignmentError.message || 'Could not load campaign assignments.');
  }

  const byCampaign = new Map<string, Array<{ status: PolicyAssignmentStatus }>>();
  (assignments || []).forEach((row) => {
    const campaignId = String((row as { campaign_id?: string }).campaign_id || '');
    const bucket = byCampaign.get(campaignId) || [];
    bucket.push({ status: String((row as { status?: string }).status || 'pending') as PolicyAssignmentStatus });
    byCampaign.set(campaignId, bucket);
  });

  return rows.map((campaign) => ({
    ...campaign,
    target_departments: normalizeStringArray(campaign.target_departments),
    target_positions: normalizeStringArray(campaign.target_positions),
    ...computeCampaignStats(byCampaign.get(campaign.id) || []),
  }));
}

export async function loadPolicyCampaignAssignments(
  campaignId: string
): Promise<PolicyCampaignAssignment[]> {
  await refreshPolicyCampaignOverdueStatuses();

  const { data, error } = await supabaseClient
    .from('policy_campaign_assignments')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('status', { ascending: true })
    .order('due_date', { ascending: true });

  if (error) {
    throw new Error(error.message || 'Could not load campaign roster.');
  }

  return (data || []) as PolicyCampaignAssignment[];
}

export async function loadEmployeePolicyCampaignAssignments(
  employeeId: string
): Promise<Array<PolicyCampaignAssignment & { campaign?: PolicyCampaign }>> {
  const id = String(employeeId || '').trim();
  if (!id) return [];

  await refreshPolicyCampaignOverdueStatuses();

  const { data, error } = await supabaseClient
    .from('policy_campaign_assignments')
    .select('*, policy_campaigns(*)')
    .eq('employee_id', id)
    .in('status', ['pending', 'overdue'])
    .order('due_date', { ascending: true });

  if (error) {
    throw new Error(error.message || 'Could not load policy assignments.');
  }

  return (data || []).map((row) => {
    const record = row as PolicyCampaignAssignment & { policy_campaigns?: PolicyCampaign };
    const campaign = record.policy_campaigns;
    delete (record as { policy_campaigns?: PolicyCampaign }).policy_campaigns;

    if (!campaign || campaign.status !== 'active') {
      return null;
    }

    return { ...record, campaign };
  }).filter(Boolean) as Array<PolicyCampaignAssignment & { campaign?: PolicyCampaign }>;
}

export async function loadActivePolicyDocuments(): Promise<
  Array<{ id: string; title: string; category: string }>
> {
  const { data, error } = await supabaseClient
    .from('document_library')
    .select('id, title, category')
    .eq('is_active', true)
    .order('title', { ascending: true });

  if (error) {
    throw new Error(error.message || 'Could not load documents.');
  }

  return (data || []) as Array<{ id: string; title: string; category: string }>;
}

export async function createPolicyCampaign(input: {
  title: string;
  description?: string;
  documentLibraryId?: string;
  documentTitle: string;
  dueDate: string;
  targetAllActive: boolean;
  targetDepartments: string[];
  targetPositions: string[];
  createdByEmail?: string;
}): Promise<PolicyCampaign> {
  const { data, error } = await supabaseClient
    .from('policy_campaigns')
    .insert([
      {
        title: input.title.trim(),
        description: String(input.description || '').trim(),
        document_library_id: input.documentLibraryId || null,
        document_title: input.documentTitle.trim(),
        due_date: input.dueDate,
        status: 'draft',
        target_all_active: input.targetAllActive,
        target_departments: input.targetDepartments,
        target_positions: input.targetPositions,
        created_by_email: input.createdByEmail || null,
      },
    ])
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message || 'Could not create policy campaign.');
  }

  return data as PolicyCampaign;
}

export async function updatePolicyCampaign(
  campaignId: string,
  patch: Partial<{
    title: string;
    description: string;
    document_library_id: string | null;
    document_title: string;
    due_date: string;
    target_all_active: boolean;
    target_departments: string[];
    target_positions: string[];
  }>
): Promise<void> {
  const { error } = await supabaseClient
    .from('policy_campaigns')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', campaignId)
    .eq('status', 'draft');

  if (error) {
    throw new Error(error.message || 'Could not update policy campaign.');
  }
}

async function loadActiveEmployeesForCampaign(): Promise<EmployeeRow[]> {
  const { data, error } = await supabaseClient
    .from('employees')
    .select('id, department, position, status, displayStatus');

  if (error) {
    throw new Error(error.message || 'Could not load employees for campaign.');
  }

  return (data || []) as EmployeeRow[];
}

export async function publishPolicyCampaign(campaignId: string): Promise<number> {
  const { data: campaign, error } = await supabaseClient
    .from('policy_campaigns')
    .select('*')
    .eq('id', campaignId)
    .maybeSingle();

  if (error || !campaign) {
    throw new Error(error?.message || 'Campaign not found.');
  }

  const record = campaign as PolicyCampaign;
  if (record.status !== 'draft') {
    throw new Error('Only draft campaigns can be published.');
  }

  const employees = await loadActiveEmployeesForCampaign();
  const matched = employees.filter((employee) =>
    employeeMatchesCampaignTargets(employee, record)
  );

  if (!matched.length) {
    throw new Error('No active employees match the selected department/position filters.');
  }

  const rows = matched.map((employee) => ({
    campaign_id: campaignId,
    employee_id: String(employee.id || '').trim(),
    due_date: record.due_date,
    status: 'pending' as const,
  }));

  const { error: insertError } = await supabaseClient
    .from('policy_campaign_assignments')
    .upsert(rows, { onConflict: 'campaign_id,employee_id', ignoreDuplicates: true });

  if (insertError) {
    throw new Error(insertError.message || 'Could not create campaign assignments.');
  }

  const { error: publishError } = await supabaseClient
    .from('policy_campaigns')
    .update({
      status: 'active',
      published_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', campaignId);

  if (publishError) {
    throw new Error(publishError.message || 'Could not publish campaign.');
  }

  await refreshPolicyCampaignOverdueStatuses();
  return rows.length;
}

export async function closePolicyCampaign(campaignId: string): Promise<void> {
  const { error } = await supabaseClient
    .from('policy_campaigns')
    .update({ status: 'closed', updated_at: new Date().toISOString() })
    .eq('id', campaignId);

  if (error) {
    throw new Error(error.message || 'Could not close campaign.');
  }
}

export async function syncPolicyCampaignRoster(campaignId: string): Promise<number> {
  const { data: campaign, error } = await supabaseClient
    .from('policy_campaigns')
    .select('*')
    .eq('id', campaignId)
    .maybeSingle();

  if (error || !campaign) {
    throw new Error(error?.message || 'Campaign not found.');
  }

  const record = campaign as PolicyCampaign;
  if (record.status !== 'active') {
    throw new Error('Only active campaigns can be refreshed.');
  }

  const employees = await loadActiveEmployeesForCampaign();
  const matched = employees.filter((employee) =>
    employeeMatchesCampaignTargets(employee, record)
  );

  const rows = matched.map((employee) => ({
    campaign_id: campaignId,
    employee_id: String(employee.id || '').trim(),
    due_date: record.due_date,
    status: 'pending' as const,
  }));

  if (!rows.length) return 0;

  const { error: upsertError } = await supabaseClient
    .from('policy_campaign_assignments')
    .upsert(rows, { onConflict: 'campaign_id,employee_id', ignoreDuplicates: true });

  if (upsertError) {
    throw new Error(upsertError.message || 'Could not refresh campaign roster.');
  }

  return rows.length;
}

export async function recordPolicyCampaignAcknowledgment(input: {
  employeeId: string;
  assignmentId: string;
  notes?: string;
}): Promise<void> {
  const employeeId = String(input.employeeId || '').trim();
  const assignmentId = String(input.assignmentId || '').trim();

  if (!employeeId || !assignmentId) {
    throw new Error('Employee and assignment are required.');
  }

  const { data: assignment, error: assignmentError } = await supabaseClient
    .from('policy_campaign_assignments')
    .select('*, policy_campaigns(*)')
    .eq('id', assignmentId)
    .eq('employee_id', employeeId)
    .maybeSingle();

  if (assignmentError || !assignment) {
    throw new Error(assignmentError?.message || 'Policy assignment not found.');
  }

  const row = assignment as PolicyCampaignAssignment & { policy_campaigns?: PolicyCampaign };
  const campaign = row.policy_campaigns;
  if (!campaign || campaign.status !== 'active') {
    throw new Error('This policy campaign is no longer active.');
  }

  const { data: ack, error: ackError } = await supabaseClient
    .from('employee_acknowledgments')
    .insert([
      {
        employee_id: employeeId,
        acknowledgment_type: 'policy',
        document_library_id: campaign.document_library_id || null,
        document_title: campaign.document_title || campaign.title,
        notes: String(input.notes || 'Acknowledged in Orbis employee portal').trim(),
      },
    ])
    .select('id')
    .single();

  if (ackError) {
    if (ackError.code === '23505') {
      const completedAt = new Date().toISOString();
      await supabaseClient
        .from('policy_campaign_assignments')
        .update({ status: 'completed', completed_at: completedAt })
        .eq('id', assignmentId);
      return;
    }
    throw new Error(ackError.message || 'Could not save policy acknowledgment.');
  }

  const completedAt = new Date().toISOString();
  const { error: updateError } = await supabaseClient
    .from('policy_campaign_assignments')
    .update({
      status: 'completed',
      completed_at: completedAt,
      acknowledgment_id: (ack as { id?: string }).id || null,
    })
    .eq('id', assignmentId)
    .eq('employee_id', employeeId);

  if (updateError) {
    throw new Error(updateError.message || 'Could not complete policy assignment.');
  }
}

export async function loadPolicyCampaignInboxAssignments(): Promise<
  Array<PolicyCampaignAssignment & { campaign: PolicyCampaign }>
> {
  await refreshPolicyCampaignOverdueStatuses();

  const { data, error } = await supabaseClient
    .from('policy_campaign_assignments')
    .select('*, policy_campaigns!inner(*)')
    .in('status', ['pending', 'overdue'])
    .eq('policy_campaigns.status', 'active');

  if (error) {
    throw new Error(error.message || 'Could not load policy campaign inbox items.');
  }

  return (data || []).map((row) => {
    const record = row as PolicyCampaignAssignment & { policy_campaigns: PolicyCampaign };
    const campaign = record.policy_campaigns;
    return { ...record, campaign };
  });
}
