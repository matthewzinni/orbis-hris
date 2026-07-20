import { isAdminUser } from '../services/access';
import { employeeDisplayName } from '../services/employeeUtils';
import { getEmployeeById, getEmployees, loadEmployees } from './employees';
import {
  closePolicyCampaign,
  createPolicyCampaign,
  loadActivePolicyDocuments,
  loadPolicyCampaignAssignments,
  loadPolicyCampaigns,
  publishPolicyCampaign,
  syncPolicyCampaignRoster,
  updatePolicyCampaign,
  type PolicyCampaignAssignment,
  type PolicyCampaignWithStats,
} from '../services/policyCampaigns';
import { showOrbisConfirm } from '../ui/confirmModal';

function safeGet<T extends HTMLElement = HTMLElement>(id: string): T | null {
  if (typeof window.safeGet === 'function') {
    return window.safeGet(id) as T | null;
  }
  return document.getElementById(id) as T | null;
}

function esc(value: unknown): string {
  if (typeof window.esc === 'function') {
    return window.esc(value);
  }
  return String(value ?? '');
}

function showToast(message: string, type: 'success' | 'error' = 'success'): void {
  if (typeof window.showToast === 'function') {
    window.showToast(message, type);
    return;
  }
  console.log(`[${type}] ${message}`);
}

function formatDateLabel(value: string | null | undefined): string {
  const raw = String(value || '').trim();
  if (!raw) return '—';
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw.slice(0, 10);
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function statusBadge(status: string): string {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'active') return '<span class="badge badge-active">Active</span>';
  if (normalized === 'closed') return '<span class="badge badge-soft">Closed</span>';
  return '<span class="badge badge-leave">Draft</span>';
}

function assignmentBadge(status: string): string {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'completed') return '<span class="badge badge-active">Completed</span>';
  if (normalized === 'overdue') return '<span class="badge badge-absent">Overdue</span>';
  return '<span class="badge badge-leave">Pending</span>';
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
}

function collectTargetOptions(): { departments: string[]; positions: string[] } {
  const departments: string[] = [];
  const positions: string[] = [];

  getEmployees().forEach((employee) => {
    const dept = String(employee.department || employee.dept || '').trim();
    const position = String(employee.position || '').trim();
    if (dept) departments.push(dept);
    if (position) positions.push(position);
  });

  return {
    departments: uniqueSorted(departments),
    positions: uniqueSorted(positions),
  };
}

function renderCheckboxList(
  idPrefix: string,
  options: string[],
  selected: string[]
): string {
  if (!options.length) {
    return '<div class="muted">No values found in the employee roster.</div>';
  }

  return `
    <div class="policy-campaign-checkbox-list">
      ${options
        .map((option) => {
          const checked = selected.includes(option) ? 'checked' : '';
          return `
            <label>
              <input type="checkbox" name="${esc(idPrefix)}" value="${esc(option)}" ${checked} />
              <span>${esc(option)}</span>
            </label>
          `;
        })
        .join('')}
    </div>
  `;
}

function readCheckedValues(root: HTMLElement, name: string): string[] {
  return Array.from(root.querySelectorAll<HTMLInputElement>(`input[name="${name}"]:checked`))
    .map((input) => String(input.value || '').trim())
    .filter(Boolean);
}

function renderCampaignCard(campaign: PolicyCampaignWithStats): string {
  const overdueClass = campaign.overdue > 0 && campaign.status === 'active' ? ' policy-campaign-card--overdue' : '';
  const targets = campaign.target_all_active
    ? 'All active employees'
    : [
        campaign.target_departments.length
          ? `Dept: ${campaign.target_departments.join(', ')}`
          : '',
        campaign.target_positions.length
          ? `Role: ${campaign.target_positions.join(', ')}`
          : '',
      ]
        .filter(Boolean)
        .join(' · ') || 'No targets selected';

  return `
    <article class="policy-campaign-card${overdueClass}" data-campaign-id="${esc(campaign.id)}">
      <div class="policy-campaign-card-top">
        <div>
          <h3>${esc(campaign.title)}</h3>
          <p class="muted" style="margin:0">${esc(campaign.document_title)} · Due ${esc(formatDateLabel(campaign.due_date))}</p>
        </div>
        ${statusBadge(campaign.status)}
      </div>
      <div class="policy-campaign-meta">
        <span class="badge badge-soft">${esc(targets)}</span>
        ${
          campaign.status !== 'draft'
            ? `<span class="badge badge-soft">${campaign.completionPct}% complete (${campaign.completed}/${campaign.total})</span>`
            : ''
        }
        ${
          campaign.overdue > 0
            ? `<span class="badge badge-absent">${campaign.overdue} overdue</span>`
            : ''
        }
      </div>
      ${
        campaign.status !== 'draft'
          ? `
            <div class="policy-campaign-progress" aria-hidden="true">
              <div class="policy-campaign-progress-bar"><span style="width:${campaign.completionPct}%"></span></div>
            </div>
          `
          : ''
      }
      <div class="policy-campaign-actions">
        ${
          campaign.status === 'draft'
            ? `<button type="button" class="button soft sm" data-campaign-edit="${esc(campaign.id)}">Edit</button>
               <button type="button" class="button primary sm" data-campaign-publish="${esc(campaign.id)}">Publish</button>`
            : ''
        }
        ${
          campaign.status === 'active'
            ? `<button type="button" class="button soft sm" data-campaign-roster="${esc(campaign.id)}">View roster</button>
               <button type="button" class="button soft sm" data-campaign-refresh="${esc(campaign.id)}">Refresh roster</button>
               <button type="button" class="button soft sm" data-campaign-close="${esc(campaign.id)}">Close campaign</button>`
            : ''
        }
        ${
          campaign.status === 'closed'
            ? `<button type="button" class="button soft sm" data-campaign-roster="${esc(campaign.id)}">View roster</button>`
            : ''
        }
      </div>
      <div class="policy-campaign-roster hidden" data-campaign-roster-panel="${esc(campaign.id)}"></div>
    </article>
  `;
}

function renderRosterTable(assignments: PolicyCampaignAssignment[]): string {
  if (!assignments.length) {
    return '<div class="muted">No assignments yet.</div>';
  }

  const rows = assignments
    .map((row) => {
      const employee = getEmployeeById(row.employee_id);
      const name = employee ? employeeDisplayName(employee) : row.employee_id;
      return `
        <tr>
          <td>${esc(name)}</td>
          <td>${esc(row.employee_id)}</td>
          <td>${assignmentBadge(row.status)}</td>
          <td>${esc(formatDateLabel(row.due_date))}</td>
          <td>${row.completed_at ? esc(formatDateLabel(row.completed_at)) : '—'}</td>
        </tr>
      `;
    })
    .join('');

  return `
    <table>
      <thead>
        <tr>
          <th>Employee</th>
          <th>ID</th>
          <th>Status</th>
          <th>Due</th>
          <th>Completed</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

async function showCampaignEditor(campaign?: PolicyCampaignWithStats): Promise<void> {
  const editor = safeGet('policyCampaignEditor');
  if (!editor) return;

  if (!getEmployees().length) {
    try {
      await loadEmployees();
    } catch (err) {
      console.warn('[PolicyCampaigns] Could not load employees:', err);
    }
  }

  const [documents, targetOptions] = await Promise.all([
    loadActivePolicyDocuments(),
    Promise.resolve(collectTargetOptions()),
  ]);

  const selectedDepartments = campaign?.target_departments || [];
  const selectedPositions = campaign?.target_positions || [];

  editor.classList.remove('hidden');
  editor.innerHTML = `
    <div class="policy-campaign-editor">
      <h3 style="margin-top:0">${campaign ? 'Edit campaign' : 'New policy campaign'}</h3>
      <form id="policyCampaignForm" class="detail-grid">
        <div class="field">
          <label for="policyCampaignTitle">Campaign title</label>
          <input id="policyCampaignTitle" type="text" required value="${esc(campaign?.title || '')}" placeholder="2026 Code of Conduct acknowledgment" />
        </div>
        <div class="field">
          <label for="policyCampaignDueDate">Due date</label>
          <input id="policyCampaignDueDate" type="date" required value="${esc(campaign?.due_date || '')}" />
        </div>
        <div class="field" style="grid-column:1 / -1">
          <label for="policyCampaignDocument">Document</label>
          <select id="policyCampaignDocument" required>
            <option value="">Select a document…</option>
            ${documents
              .map((doc) => {
                const selected =
                  campaign?.document_library_id === doc.id ? 'selected' : '';
                return `<option value="${esc(doc.id)}" data-title="${esc(doc.title)}" ${selected}>${esc(doc.title)} (${esc(doc.category)})</option>`;
              })
              .join('')}
          </select>
        </div>
        <div class="field" style="grid-column:1 / -1">
          <label for="policyCampaignDescription">Notes for employees (optional)</label>
          <textarea id="policyCampaignDescription" rows="2" placeholder="Read and acknowledge by the due date.">${esc(campaign?.description || '')}</textarea>
        </div>
        <div class="field" style="grid-column:1 / -1">
          <label>
            <input id="policyCampaignAllActive" type="checkbox" ${campaign?.target_all_active ? 'checked' : ''} />
            Assign to all active employees
          </label>
        </div>
        <div class="policy-campaign-target-grid" id="policyCampaignTargetGrid" style="grid-column:1 / -1;${campaign?.target_all_active ? 'opacity:0.55' : ''}">
          <div>
            <label>Departments</label>
            ${renderCheckboxList('policyCampaignDept', targetOptions.departments, selectedDepartments)}
          </div>
          <div>
            <label>Positions / roles</label>
            ${renderCheckboxList('policyCampaignPosition', targetOptions.positions, selectedPositions)}
          </div>
        </div>
        <div class="policy-campaign-actions" style="grid-column:1 / -1">
          <button type="submit" class="button primary">${campaign ? 'Save draft' : 'Create draft'}</button>
          <button type="button" class="button soft" id="policyCampaignEditorCancel">Cancel</button>
        </div>
      </form>
    </div>
  `;

  const allActiveCheckbox = safeGet<HTMLInputElement>('policyCampaignAllActive');
  const targetGrid = safeGet('policyCampaignTargetGrid');
  allActiveCheckbox?.addEventListener('change', () => {
    if (targetGrid) {
      targetGrid.style.opacity = allActiveCheckbox.checked ? '0.55' : '1';
    }
  });

  safeGet('policyCampaignEditorCancel')?.addEventListener('click', () => {
    editor.classList.add('hidden');
    editor.innerHTML = '';
  });

  safeGet<HTMLFormElement>('policyCampaignForm')?.addEventListener('submit', (event) => {
    event.preventDefault();
    void saveCampaignDraft(campaign?.id);
  });
}

async function saveCampaignDraft(campaignId?: string): Promise<void> {
  const form = safeGet('policyCampaignForm');
  if (!form) return;

  const title = String(safeGet<HTMLInputElement>('policyCampaignTitle')?.value || '').trim();
  const dueDate = String(safeGet<HTMLInputElement>('policyCampaignDueDate')?.value || '').trim();
  const description = String(safeGet<HTMLTextAreaElement>('policyCampaignDescription')?.value || '').trim();
  const documentSelect = safeGet<HTMLSelectElement>('policyCampaignDocument');
  const documentLibraryId = String(documentSelect?.value || '').trim();
  const documentTitle =
    documentSelect?.selectedOptions?.[0]?.dataset.title ||
    documentSelect?.selectedOptions?.[0]?.textContent ||
    '';
  const targetAllActive = Boolean(safeGet<HTMLInputElement>('policyCampaignAllActive')?.checked);
  const targetDepartments = readCheckedValues(form, 'policyCampaignDept');
  const targetPositions = readCheckedValues(form, 'policyCampaignPosition');

  if (!title || !dueDate || !documentLibraryId) {
    showToast('Title, due date, and document are required.', 'error');
    return;
  }

  if (!targetAllActive && !targetDepartments.length && !targetPositions.length) {
    showToast('Select at least one department or position, or assign to all active employees.', 'error');
    return;
  }

  try {
    if (campaignId) {
      await updatePolicyCampaign(campaignId, {
        title,
        description,
        document_library_id: documentLibraryId,
        document_title: String(documentTitle).trim(),
        due_date: dueDate,
        target_all_active: targetAllActive,
        target_departments: targetDepartments,
        target_positions: targetPositions,
      });
      showToast('Campaign draft updated.');
    } else {
      const access = window.currentUserAccess as { email?: string } | null;
      await createPolicyCampaign({
        title,
        description,
        documentLibraryId,
        documentTitle: String(documentTitle).trim(),
        dueDate,
        targetAllActive,
        targetDepartments,
        targetPositions,
        createdByEmail: access?.email || undefined,
      });
      showToast('Campaign draft created.');
    }

    safeGet('policyCampaignEditor')?.classList.add('hidden');
    await loadPolicyCampaignsAdmin();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not save campaign.';
    showToast(message, 'error');
  }
}

async function toggleRoster(campaignId: string): Promise<void> {
  const panel = document.querySelector<HTMLElement>(`[data-campaign-roster-panel="${campaignId}"]`);
  if (!panel) return;

  if (!panel.classList.contains('hidden') && panel.innerHTML.trim()) {
    panel.classList.add('hidden');
    panel.innerHTML = '';
    return;
  }

  panel.classList.remove('hidden');
  panel.innerHTML = '<div class="muted">Loading roster…</div>';

  try {
    const assignments = await loadPolicyCampaignAssignments(campaignId);
    panel.innerHTML = renderRosterTable(assignments);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not load roster.';
    panel.innerHTML = `<div class="muted">${esc(message)}</div>`;
  }
}

function bindCampaignActions(campaigns: PolicyCampaignWithStats[]): void {
  const root = safeGet('policyCampaignsList');
  if (!root) return;

  root.querySelectorAll<HTMLButtonElement>('[data-campaign-edit]').forEach((button) => {
    button.addEventListener('click', () => {
      const campaign = campaigns.find((row) => row.id === button.dataset.campaignEdit);
      if (campaign) void showCampaignEditor(campaign);
    });
  });

  root.querySelectorAll<HTMLButtonElement>('[data-campaign-publish]').forEach((button) => {
    button.addEventListener('click', () => {
      const campaignId = button.dataset.campaignPublish || '';
      if (!campaignId) return;

      void (async () => {
        const ok = await showOrbisConfirm(
          'This will create assignments for every matching active employee. Employees will see the policy in My Tasks.',
          { title: 'Publish campaign?', confirmLabel: 'Publish' }
        );
        if (!ok) return;

        try {
          const count = await publishPolicyCampaign(campaignId);
          showToast(`Campaign published to ${count} employee${count === 1 ? '' : 's'}.`);
          await loadPolicyCampaignsAdmin();
          const { refreshDerivedUiProfile } = await import('../services/derivedDataRefresh');
          await refreshDerivedUiProfile('policyCampaigns');
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Could not publish campaign.';
          showToast(message, 'error');
        }
      })();
    });
  });

  root.querySelectorAll<HTMLButtonElement>('[data-campaign-roster]').forEach((button) => {
    button.addEventListener('click', () => {
      void toggleRoster(button.dataset.campaignRoster || '');
    });
  });

  root.querySelectorAll<HTMLButtonElement>('[data-campaign-refresh]').forEach((button) => {
    button.addEventListener('click', () => {
      const campaignId = button.dataset.campaignRefresh || '';
      if (!campaignId) return;

      void (async () => {
        const ok = await showOrbisConfirm(
          'Adds assignments for newly hired or transferred employees who now match this campaign. Existing assignments are kept.',
          { title: 'Refresh roster?', confirmLabel: 'Refresh' }
        );
        if (!ok) return;

        try {
          const count = await syncPolicyCampaignRoster(campaignId);
          showToast(`Roster refreshed (${count} matching employees).`);
          await loadPolicyCampaignsAdmin();
          const { refreshDerivedUiProfile } = await import('../services/derivedDataRefresh');
          await refreshDerivedUiProfile('policyCampaigns');
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Could not refresh roster.';
          showToast(message, 'error');
        }
      })();
    });
  });

  root.querySelectorAll<HTMLButtonElement>('[data-campaign-close]').forEach((button) => {
    button.addEventListener('click', () => {
      const campaignId = button.dataset.campaignClose || '';
      if (!campaignId) return;

      void (async () => {
        const ok = await showOrbisConfirm(
          'Employees will no longer see pending assignments from this campaign.',
          { title: 'Close campaign?', confirmLabel: 'Close campaign' }
        );
        if (!ok) return;

        try {
          await closePolicyCampaign(campaignId);
          showToast('Campaign closed.');
          await loadPolicyCampaignsAdmin();
          const { refreshDerivedUiProfile } = await import('../services/derivedDataRefresh');
          await refreshDerivedUiProfile('policyCampaigns');
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Could not close campaign.';
          showToast(message, 'error');
        }
      })();
    });
  });
}

export async function loadPolicyCampaignsAdmin(): Promise<void> {
  const panel = safeGet('policyCampaignsPanel');
  const list = safeGet('policyCampaignsList');
  if (!panel || !list) return;

  if (!isAdminUser()) {
    panel.classList.add('hidden');
    return;
  }

  panel.classList.remove('hidden');
  list.innerHTML = '<div class="muted">Loading policy campaigns…</div>';

  try {
    const campaigns = await loadPolicyCampaigns();
    if (!campaigns.length) {
      list.innerHTML =
        '<div class="muted">No campaigns yet. Create one to assign handbook or policy acknowledgments by department or role.</div>';
    } else {
      list.innerHTML = `<div class="policy-campaigns-list">${campaigns.map(renderCampaignCard).join('')}</div>`;
      bindCampaignActions(campaigns);
    }
  } catch (err) {
    console.error('[PolicyCampaigns]', err);
    list.innerHTML = '<div class="muted">Could not load policy campaigns.</div>';
    showToast('Could not load policy campaigns.', 'error');
  }
}

export function initializePolicyCampaignsAdmin(): void {
  const panel = safeGet('policyCampaignsPanel');
  if (!panel || !isAdminUser()) return;

  safeGet('policyCampaignNewBtn')?.addEventListener('click', () => {
    void showCampaignEditor();
  });
}

window.loadPolicyCampaignsAdmin = loadPolicyCampaignsAdmin;
