// =====================================================
// ORBIS - Candidate Pipeline Module
// Handles candidate loading, stage updates, deletion, and conversion.
// =====================================================

window.orbisModuleLoadCandidates = loadCandidates;
window.convertCandidateToEmployee = convertCandidateToEmployee;
window.updateCandidateStage = updateCandidateStage;
window.deleteCandidate = deleteCandidate;
window.openCandidateDetails = openCandidateDetails;
window.closeCandidateDetails = closeCandidateDetails;
window.saveCandidateDetails = saveCandidateDetails;
window.saveCandidateStageFromDrawer = saveCandidateStageFromDrawer;
window.moveCandidateToNextStage = moveCandidateToNextStage;
window.convertCurrentCandidateToEmployee = convertCurrentCandidateToEmployee;
window.deleteCurrentCandidate = deleteCurrentCandidate;
window.sendCandidateInterviewInvite = sendCandidateInterviewInvite;
window.switchCandidateDrawerTab = switchCandidateDrawerTab;
window.saveCandidateNotes = saveCandidateNotes;
window.saveCandidateInterview = saveCandidateInterview;
window.saveCandidateOffer = saveCandidateOffer;
window.saveCandidateDocument = saveCandidateDocument;

function getCandidatesTableBody() {
    return (
        document.getElementById('candidatesTableBody') ||
        document.getElementById('candidateTableBody') ||
        document.querySelector('[data-candidates-table-body]') ||
        document.querySelector('#candidatePipeline tbody') ||
        document.querySelector('#candidatesTable tbody') ||
        document.querySelector('.candidate-pipeline tbody') ||
        [...document.querySelectorAll('table tbody')].find(tbody =>
            (tbody.closest('section')?.textContent || '').includes('Candidate Pipeline') ||
            (tbody.closest('.card')?.textContent || '').includes('Candidate Pipeline') ||
            (tbody.parentElement?.textContent || '').includes('NAME')
        )
    );
}

function candidateDisplay(value) {
    return value || '—';
}

function candidateToast(message, type = 'success') {
    if (typeof showToast === 'function') {
        showToast(message, type);
    } else {
        console.log(`${type.toUpperCase()}: ${message}`);
    }
}

function ensureLegacyCandidateMoveButton() {
    const convertButton = Array.from(document.querySelectorAll('button'))
        .find(button => (button.textContent || '').trim().toLowerCase() === 'convert to employee');

    if (!convertButton) return;

    const actionsContainer = convertButton.parentElement;
    if (!actionsContainer) return;

    if (document.getElementById('legacyCandidateNextStageBtn')) return;

    const moveButton = document.createElement('button');
    moveButton.id = 'legacyCandidateNextStageBtn';
    moveButton.type = 'button';
    moveButton.className = convertButton.className || 'button soft';
    moveButton.textContent = 'Move to Next Stage';

    moveButton.addEventListener('click', async event => {
        event.preventDefault();
        event.stopPropagation();
        console.log('Legacy Move to Next Stage button clicked');
        await moveCandidateToNextStage();
    });

    actionsContainer.insertBefore(moveButton, convertButton);
}

async function resolveCurrentCandidateIdFromDrawer(db) {
    const hiddenId = document.getElementById('candidateDetailId')?.value;
    if (hiddenId) return hiddenId;

    const firstName = document.getElementById('candidateDetailFirstName')?.value?.trim()
        || document.getElementById('candidateFirstNameInput')?.value?.trim()
        || '';
    const lastName = document.getElementById('candidateDetailLastName')?.value?.trim()
        || document.getElementById('candidateLastNameInput')?.value?.trim()
        || '';
    const stage = document.getElementById('candidateDetailStage')?.value?.trim()
        || document.getElementById('candidateStageInput')?.value?.trim()
        || '';
    const email = document.getElementById('candidateDetailEmail')?.value?.trim()
        || document.getElementById('candidateEmailInput')?.value?.trim()
        || '';
    const phone = document.getElementById('candidateDetailPhone')?.value?.trim()
        || document.getElementById('candidatePhoneInput')?.value?.trim()
        || '';

    console.log('Resolving candidate from drawer fields:', { firstName, lastName, stage, email, phone });

    let query = db.from('candidates').select('*');

    if (email) {
        query = query.eq('email', email);
    } else if (phone) {
        query = query.eq('phone', phone);
    } else if (firstName || lastName) {
        // Match by name only (stage can change and break lookup)
        query = query
            .ilike('first_name', firstName || '%')
            .ilike('last_name', lastName || '%');
    } else {
        console.warn('No candidate lookup fields found in drawer.');
        return '';
    }

    const { data, error } = await query.limit(1).maybeSingle();

    if (error) {
        console.error('Could not resolve candidate from drawer:', error);
        return '';
    }

    if (data?.id) {
        let hiddenInput = document.getElementById('candidateDetailId');
        if (!hiddenInput) {
            hiddenInput = document.createElement('input');
            hiddenInput.type = 'hidden';
            hiddenInput.id = 'candidateDetailId';
            const drawer = document.getElementById('candidateDetailsDrawer') || document.body;
            drawer.appendChild(hiddenInput);
        }
        hiddenInput.value = data.id;
        return data.id;
    }

    return '';
}

function getOrbisSupabaseClient() {
    if (typeof supabaseClient !== 'undefined' && supabaseClient && typeof supabaseClient.from === 'function') {
        return supabaseClient;
    }

    if (window.supabaseClient && typeof window.supabaseClient.from === 'function') {
        return window.supabaseClient;
    }

    if (window.db && typeof window.db.from === 'function') {
        return window.db;
    }

    if (window.orbisDb && typeof window.orbisDb.from === 'function') {
        return window.orbisDb;
    }

    return null;
}

// Helper function to refresh candidates list from main app
async function refreshCandidatesFromMainApp() {
    if (typeof window.loadCandidates === 'function') {
        await window.loadCandidates();
        return;
    }

    if (typeof window.renderCandidates === 'function') {
        window.renderCandidates();
    }
}

async function loadCandidates() {
    const tbody = getCandidatesTableBody();


    if (!tbody) {
        console.warn('Candidate table body not found. Check the Candidate Pipeline table ID.');
        const allBodies = [...document.querySelectorAll('tbody')];
        console.log('Available table bodies:', allBodies.map((body, index) => ({ index, text: body.innerText.slice(0, 120) })));
        return;
    }

    tbody.innerHTML = '<tr><td colspan="5">Loading candidates...</td></tr>';

    const db = getOrbisSupabaseClient();

    if (!db) {
        console.error('Supabase client not found for candidates module.');
        tbody.innerHTML = '<tr><td colspan="5">Supabase connection not found.</td></tr>';
        return;
    }

    const { data, error } = await db
        .from('candidates')
        .select('*');


    if (error) {
        console.error('Error loading candidates:', error);
        tbody.innerHTML = '<tr><td colspan="5">Unable to load candidates.</td></tr>';
        return;
    }

    const visibleCandidates = (data || []).filter(candidate => (candidate.stage || '').toLowerCase() !== 'hired');

    if (visibleCandidates.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5">No active candidates found.</td></tr>';
        return;
    }

    tbody.innerHTML = visibleCandidates.map(candidate => {
        const id = candidate.id;
        const name = candidate.name || candidate.candidate_name || `${candidate.first_name || ''} ${candidate.last_name || ''}`.trim();
        const position = candidate.position || candidate.position_applied_for || candidate.role;
        const stage = candidate.stage || candidate.status || 'Applied';
        const source = candidate.source || candidate.referral_source;
        const appliedDate = candidate.applied_date || candidate.created_at || candidate.inserted_at || '';

        let interviewAlert = '';

        if (candidate.interview_date && candidate.interview_time) {
            const interviewDateTime = new Date(`${candidate.interview_date}T${candidate.interview_time}`);
            const now = new Date();

            if (interviewDateTime > now) {
                interviewAlert = `<div class="candidate-interview-alert">Upcoming Interview: ${interviewDateTime.toLocaleString()}</div>`;
            }
        }

        return `
      <tr class="candidate-row" onclick="openCandidateDetails('${id}')" style="cursor:pointer;">
        <td>
          <button type="button" class="link-button" onclick="event.stopPropagation(); openCandidateDetails('${id}')">${candidateDisplay(name)}</button>
          ${interviewAlert}
        </td>
        <td>${candidateDisplay(position)}</td>
        <td>${candidateDisplay(stage)}</td>
        <td>${candidateDisplay(source)}</td>
        <td>${appliedDate ? new Date(appliedDate).toLocaleDateString() : '—'}</td>
      </tr>
    `;
    }).join('');
}
function ensureCandidateModal() {
    let drawer = document.getElementById('candidateDetailsDrawer');
    if (drawer) return drawer;

    drawer = document.createElement('aside');
    drawer.id = 'candidateDetailsDrawer';
    drawer.className = 'drawer candidate-drawer hidden';
    drawer.style.display = 'none';
    drawer.style.position = 'fixed';
    drawer.style.top = '0';
    drawer.style.right = '0';
    drawer.style.width = '720px';
    drawer.style.maxWidth = '96vw';
    drawer.style.height = '100vh';
    drawer.style.background = '#f8fafc';
    drawer.style.zIndex = '99999';
    drawer.style.boxShadow = '-18px 0 40px rgba(15, 23, 42, 0.25)';
    drawer.style.overflowY = 'auto';
    drawer.style.padding = '0';

    drawer.innerHTML = `
    <div class="drawer-header" style="background:#0f3554; color:#fff; padding:22px 28px; display:flex; justify-content:space-between; align-items:flex-start; gap:16px;">
      <div>
        <p class="eyebrow" style="margin:0 0 8px; color:#dbeafe; letter-spacing:.08em; text-transform:uppercase; font-size:11px;">Candidate File</p>
        <h2 id="candidateDrawerName" style="margin:0; font-size:22px; color:#fff;">Candidate Details</h2>
        <p id="candidateDrawerSubtext" style="margin:8px 0 0; color:#dbeafe;">Pipeline record</p>
      </div>
      <button type="button" class="button soft" onclick="closeCandidateDetails()">Close</button>
    </div>

    <input type="hidden" id="candidateDetailId" />

    <div style="padding:20px 28px;">
      <div class="drawer-tabs" style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:18px;">
        <button type="button" class="tab-btn active" data-candidate-tab="profile">Profile</button>
        <button type="button" class="tab-btn" data-candidate-tab="notes">Notes</button>
        <button type="button" class="tab-btn" data-candidate-tab="interview">Interview</button>
        <button type="button" class="tab-btn" data-candidate-tab="offer">Offer</button>
        <button type="button" class="tab-btn" data-candidate-tab="documents">Documents</button>
      </div>

      <div class="drawer-section candidate-tab-panel" data-candidate-panel="profile" style="background:#fff; border:1px solid #e5edf5; border-radius:18px; padding:20px; box-shadow:0 10px 24px rgba(15,23,42,.06); margin-bottom:18px;">
        <h3 style="margin:0 0 16px;">Candidate Profile</h3>
        <div class="candidate-profile-grid" style="display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px;">
          <label class="candidate-field">First Name
            <input id="candidateDetailFirstName" class="candidate-input" type="text" />
          </label>
          <label class="candidate-field">Last Name
            <input id="candidateDetailLastName" class="candidate-input" type="text" />
          </label>
          <label class="candidate-field">Position
            <input id="candidateDetailPosition" class="candidate-input" type="text" />
          </label>
          <label class="candidate-field">Stage
            <select id="candidateDetailStage" class="candidate-input">
              <option value="Applied">Applied</option>
              <option value="Screening">Screening</option>
              <option value="Interviewing">Interviewing</option>
              <option value="Interview">Interview</option>
              <option value="Offer">Offer</option>
              <option value="Hired">Hired</option>
              <option value="Rejected">Rejected</option>
            </select>
          </label>
          <label class="candidate-field">Source
            <input id="candidateDetailSource" class="candidate-input" type="text" />
          </label>
          <label class="candidate-field">Email
            <input id="candidateDetailEmail" class="candidate-input" type="email" />
          </label>
          <label class="candidate-field">Phone
            <input id="candidateDetailPhone" class="candidate-input" type="text" />
          </label>
        </div>
      </div>

      <div class="drawer-section candidate-tab-panel hidden" data-candidate-panel="notes" style="background:#fff; border:1px solid #e5edf5; border-radius:18px; padding:20px; box-shadow:0 10px 24px rgba(15,23,42,.06); margin-bottom:18px; display:none;">
        <h3 style="margin:0 0 16px;">Candidate Notes</h3>
        <label class="candidate-field">Notes
          <textarea id="candidateDetailNotes" class="candidate-input candidate-textarea" rows="8" placeholder="Add screening notes, recruiter observations, availability, or follow-up items."></textarea>
        </label>
        <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:14px;">
          <button id="candidateSaveNotesBtn" type="button" class="button primary">Save Notes</button>
        </div>
      </div>

      <div class="drawer-section candidate-tab-panel hidden" data-candidate-panel="interview" style="background:#fff; border:1px solid #e5edf5; border-radius:18px; padding:20px; box-shadow:0 10px 24px rgba(15,23,42,.06); margin-bottom:18px; display:none;">
        <h3 style="margin:0 0 16px;">Interview</h3>
        <div class="candidate-profile-grid" style="display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px;">
          <label class="candidate-field">Interview Date
            <input id="candidateInterviewDate" class="candidate-input" type="date" />
          </label>
          <label class="candidate-field">Interview Time
            <input id="candidateInterviewTime" class="candidate-input" type="time" />
          </label>
          <label class="candidate-field">Interview Type
            <select id="candidateInterviewType" class="candidate-input">
              <option value="">Select type</option>
              <option value="Phone Screen">Phone Screen</option>
              <option value="Video Interview">Video Interview</option>
              <option value="In-Person Interview">In-Person Interview</option>
              <option value="Second Interview">Second Interview</option>
            </select>
          </label>
          <label class="candidate-field">Interview Status
            <select id="candidateInterviewStatus" class="candidate-input">
              <option value="Not Scheduled">Not Scheduled</option>
              <option value="Scheduled">Scheduled</option>
              <option value="Completed">Completed</option>
              <option value="Cancelled">Cancelled</option>
              <option value="No Show">No Show</option>
            </select>
          </label>
        </div>
        <div class="drawer-section" style="background:#f8fafc; border:1px solid #e5edf5; border-radius:16px; padding:16px; margin-top:16px;">
          <h4 style="margin:0 0 12px;">Interview Evaluation</h4>
          <div class="candidate-profile-grid" style="display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px;">
            <label class="candidate-field">Communication
              <select id="candidateInterviewCommunication" class="candidate-input">
                <option value="">Select rating</option>
                <option value="Excellent">Excellent</option>
                <option value="Good">Good</option>
                <option value="Fair">Fair</option>
                <option value="Concern">Concern</option>
              </select>
            </label>
            <label class="candidate-field">Experience Fit
              <select id="candidateInterviewExperience" class="candidate-input">
                <option value="">Select rating</option>
                <option value="Excellent">Excellent</option>
                <option value="Good">Good</option>
                <option value="Fair">Fair</option>
                <option value="Concern">Concern</option>
              </select>
            </label>
            <label class="candidate-field">Culture / Team Fit
              <select id="candidateInterviewCulture" class="candidate-input">
                <option value="">Select rating</option>
                <option value="Excellent">Excellent</option>
                <option value="Good">Good</option>
                <option value="Fair">Fair</option>
                <option value="Concern">Concern</option>
              </select>
            </label>
            <label class="candidate-field">Reliability / Availability
              <select id="candidateInterviewReliability" class="candidate-input">
                <option value="">Select rating</option>
                <option value="Excellent">Excellent</option>
                <option value="Good">Good</option>
                <option value="Fair">Fair</option>
                <option value="Concern">Concern</option>
              </select>
            </label>
            <label class="candidate-field">Overall Recommendation
              <select id="candidateInterviewRecommendation" class="candidate-input">
                <option value="">Select recommendation</option>
                <option value="Strong Hire">Strong Hire</option>
                <option value="Hire">Hire</option>
                <option value="Maybe / Needs Follow-Up">Maybe / Needs Follow-Up</option>
                <option value="Do Not Move Forward">Do Not Move Forward</option>
              </select>
            </label>
            <label class="candidate-field">Next Step
              <select id="candidateInterviewNextStep" class="candidate-input">
                <option value="">Select next step</option>
                <option value="Move to Offer">Move to Offer</option>
                <option value="Second Interview">Second Interview</option>
                <option value="Hold for Review">Hold for Review</option>
                <option value="Reject Candidate">Reject Candidate</option>
              </select>
            </label>
          </div>

          <label class="candidate-field" style="margin-top:14px;">Strengths
            <textarea id="candidateInterviewStrengths" class="candidate-input candidate-textarea" rows="4" placeholder="What stood out positively?"></textarea>
          </label>
          <label class="candidate-field" style="margin-top:14px;">Concerns / Follow-Up Questions
            <textarea id="candidateInterviewConcerns" class="candidate-input candidate-textarea" rows="4" placeholder="Any concerns, gaps, or questions to revisit?"></textarea>
          </label>
        </div>

        <label class="candidate-field" style="margin-top:14px;">Live Interview Notes
          <textarea id="candidateInterviewNotes" class="candidate-input candidate-textarea" rows="6" placeholder="Add live interview notes, key answers, strengths, concerns, and next steps."></textarea>
        </label>
        <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:14px;">
          <button id="candidateSaveInterviewBtn" type="button" class="button primary">Save Interview</button>
          <button id="candidateSendInviteFromInterviewBtn" type="button" class="button soft">Send Interview Invite</button>
        </div>
      </div>

      <div class="drawer-section candidate-tab-panel hidden" data-candidate-panel="offer" style="background:#fff; border:1px solid #e5edf5; border-radius:18px; padding:20px; box-shadow:0 10px 24px rgba(15,23,42,.06); margin-bottom:18px; display:none;">
        <h3 style="margin:0 0 16px;">Offer</h3>
        <div class="candidate-profile-grid" style="display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px;">
          <label class="candidate-field">Offer Status
            <select id="candidateOfferStatus" class="candidate-input">
              <option value="Not Started">Not Started</option>
              <option value="Preparing">Preparing</option>
              <option value="Sent">Sent</option>
              <option value="Accepted">Accepted</option>
              <option value="Declined">Declined</option>
            </select>
          </label>
          <label class="candidate-field">Offer Amount
            <input id="candidateOfferAmount" class="candidate-input" type="text" placeholder="$0.00" />
          </label>
          <label class="candidate-field">Target Start Date
            <input id="candidateStartDate" class="candidate-input" type="date" />
          </label>
          <label class="candidate-field">Offer Sent Date
            <input id="candidateOfferDate" class="candidate-input" type="date" />
          </label>
        </div>
        <label class="candidate-field" style="margin-top:14px;">Offer Notes
          <textarea id="candidateOfferNotes" class="candidate-input candidate-textarea" rows="6" placeholder="Add offer details, approvals, start date notes, or compensation notes."></textarea>
        </label>

        <div id="candidateOfferSummary" style="display:none; margin-top:14px; padding:14px 16px; border-radius:14px; background:#ecfdf5; border:1px solid #bbf7d0; color:#064e3b; font-size:13px; line-height:1.5;"></div>

        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center; margin-top:14px;">
          <button id="candidateSaveOfferBtn" type="button" class="button primary">Save Offer</button>
          <button id="candidateHireFromOfferBtn" type="button" class="button soft">Hire</button>
          <span id="candidateOfferSaveStatus" style="display:none; font-size:12px; font-weight:800; color:#047857;">Offer saved.</span>
        </div>
      </div>

      <div class="drawer-section candidate-tab-panel hidden" data-candidate-panel="documents" style="background:#fff; border:1px solid #e5edf5; border-radius:18px; padding:20px; box-shadow:0 10px 24px rgba(15,23,42,.06); margin-bottom:18px; display:none;">
        <h3 style="margin:0 0 16px;">Documents</h3>
        <p class="muted-text" style="margin-top:0;">Track document status for this candidate. File uploads can be connected later.</p>
        <div class="candidate-profile-grid" style="display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px;">
          <label class="candidate-field">Resume
            <select id="candidateResumeStatus" class="candidate-input">
              <option value="Not Received">Not Received</option>
              <option value="Received">Received</option>
              <option value="Reviewed">Reviewed</option>
            </select>
          </label>
          <label class="candidate-field">Application
            <select id="candidateApplicationStatus" class="candidate-input">
              <option value="Not Started">Not Started</option>
              <option value="Received">Received</option>
              <option value="Reviewed">Reviewed</option>
            </select>
          </label>
          <label class="candidate-field">Background Check
            <select id="candidateBackgroundStatus" class="candidate-input">
              <option value="Not Started">Not Started</option>
              <option value="Pending">Pending</option>
              <option value="Clear">Clear</option>
              <option value="Review Needed">Review Needed</option>
            </select>
          </label>
          <label class="candidate-field">ID / Eligibility
            <select id="candidateEligibilityStatus" class="candidate-input">
              <option value="Not Started">Not Started</option>
              <option value="Pending">Pending</option>
              <option value="Complete">Complete</option>
            </select>
          </label>
        </div>
        <label class="candidate-field" style="margin-top:14px;">Document Notes
          <textarea id="candidateDocumentNotes" class="candidate-input candidate-textarea" rows="6" placeholder="Add notes about documents received, missing items, or follow-up needed."></textarea>
        </label>
        <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:14px;">
          <button id="candidateSaveDocumentBtn" type="button" class="button primary">Save Document Status</button>
        </div>
      </div>

      <div class="drawer-section" style="background:#fff; border:1px solid #e5edf5; border-radius:18px; padding:20px; box-shadow:0 10px 24px rgba(15,23,42,.06);">
        <h3 style="margin:0 0 16px;">Candidate Actions</h3>
        <div class="drawer-actions" style="display:flex; flex-wrap:wrap; gap:10px;">
          <button id="candidateSaveBtn" type="button" class="button primary">Save Candidate</button>
          <button id="candidateNextStageBtn" type="button" class="button soft">Move to Next Stage</button>
          <button id="candidateInviteBtn" type="button" class="button soft">Send Interview Invite</button>
          <button id="candidateHireBtn" type="button" class="button soft">Hire</button>
          <button id="candidateDeleteBtn" type="button" class="button danger">Delete Candidate</button>
        </div>
      </div>
    </div>
  `;

    const style = document.createElement('style');
    style.id = 'candidateDrawerStyles';
    style.textContent = `
      .candidate-drawer .candidate-field {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 14px 16px;
        border: 1px solid #e6edf4;
        border-radius: 14px;
        background: #ffffff;
        color: #64748b;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: .08em;
        text-transform: uppercase;
      }

      .candidate-drawer .candidate-input {
        width: 100%;
        min-height: 28px;
        border: 0;
        outline: none;
        background: transparent;
        color: #0f172a;
        font-size: 14px;
        font-weight: 700;
        text-transform: none;
        letter-spacing: 0;
      }

      .candidate-drawer select.candidate-input {
        appearance: auto;
      }

      .candidate-drawer .candidate-textarea {
        resize: vertical;
        min-height: 110px;
        font-weight: 500;
        line-height: 1.5;
      }

      .candidate-drawer .candidate-tab-panel.hidden {
        display: none !important;
      }

      .candidate-drawer .tab-btn.active {
        background: #0f3554;
        color: #ffffff;
        border-color: #0f3554;
      }
    `;

    if (!document.getElementById('candidateDrawerStyles')) {
        document.head.appendChild(style);
    }

    drawer.querySelector('#candidateSaveBtn')?.addEventListener('click', async () => {
        await saveCandidateDetails();
    });

    drawer.querySelector('#candidateNextStageBtn')?.addEventListener('click', async event => {
        event.preventDefault();
        event.stopPropagation();
        console.log('Move to Next Stage button clicked');
        const candidateId = drawer.querySelector('#candidateDetailId')?.value;

        await moveCandidateToNextStage(candidateId);
    });

    drawer.querySelector('#candidateInviteBtn')?.addEventListener('click', () => {
        sendCandidateInterviewInvite();
    });

    drawer.querySelector('#candidateHireBtn')?.addEventListener('click', async event => {
        event.preventDefault();
        event.stopPropagation();

        const candidateId = drawer.querySelector('#candidateDetailId')?.value;

        if (!candidateId) {
            candidateToast('No candidate is selected to hire.', 'error');
            return;
        }

        await convertCandidateToEmployee(candidateId);
    });

    drawer.querySelector('#candidateDeleteBtn')?.addEventListener('click', async () => {
        await deleteCurrentCandidate();
    });

    drawer.querySelectorAll('[data-candidate-tab]').forEach(button => {
        button.addEventListener('click', () => {
            switchCandidateDrawerTab(button.dataset.candidateTab);
        });
    });

    drawer.querySelector('#candidateSaveNotesBtn')?.addEventListener('click', async () => {
        await saveCandidateNotes();
    });

    drawer.querySelector('#candidateSaveInterviewBtn')?.addEventListener('click', async () => {
        await saveCandidateInterview();
    });

    drawer.querySelector('#candidateSendInviteFromInterviewBtn')?.addEventListener('click', () => {
        sendCandidateInterviewInvite();
    });

    drawer.querySelector('#candidateSaveOfferBtn')?.addEventListener('click', async event => {

        event.preventDefault();

        event.stopPropagation();

        console.log('Save Offer button clicked');

        await saveCandidateOffer();

    });


    drawer.querySelector('#candidateSaveDocumentBtn')?.addEventListener('click', async () => {
        await saveCandidateDocument();
    });

    document.body.appendChild(drawer);
    return drawer;
}

async function openCandidateDetails(candidateId) {
    if (!candidateId) return;

    const db = getOrbisSupabaseClient();
    if (!db) {
        console.error('Supabase client not found for candidates module.');
        return;
    }

    const { data: candidate, error } = await db
        .from('candidates')
        .select('*')
        .eq('id', candidateId)
        .single();

    if (error || !candidate) {
        console.error('Error opening candidate:', error);
        if (typeof showToast === 'function') showToast('Candidate could not be opened.', 'error');
        return;
    }

    const drawer = ensureCandidateModal();

    document.getElementById('candidateDetailId').value = candidate.id || '';
    document.getElementById('candidateDetailFirstName').value = candidate.first_name || '';
    document.getElementById('candidateDetailLastName').value = candidate.last_name || '';
    document.getElementById('candidateDetailPosition').value = candidate.position || candidate.position_applied_for || candidate.role || '';
    document.getElementById('candidateDetailStage').value = candidate.stage || 'Applied';
    document.getElementById('candidateDetailSource').value = candidate.source || '';
    document.getElementById('candidateDetailEmail').value = candidate.email || '';
    document.getElementById('candidateDetailPhone').value = candidate.phone || '';

    if (document.getElementById('candidateDetailNotes')) document.getElementById('candidateDetailNotes').value = candidate.notes || '';
    if (document.getElementById('candidateInterviewDate')) document.getElementById('candidateInterviewDate').value = candidate.interview_date || '';
    if (document.getElementById('candidateInterviewTime')) document.getElementById('candidateInterviewTime').value = candidate.interview_time || '';
    if (document.getElementById('candidateInterviewType')) document.getElementById('candidateInterviewType').value = candidate.interview_type || '';
    if (document.getElementById('candidateInterviewStatus')) document.getElementById('candidateInterviewStatus').value = candidate.interview_status || 'Not Scheduled';
    if (document.getElementById('candidateInterviewNotes')) document.getElementById('candidateInterviewNotes').value = candidate.interview_notes || '';
    if (document.getElementById('candidateInterviewCommunication')) document.getElementById('candidateInterviewCommunication').value = '';
    if (document.getElementById('candidateInterviewExperience')) document.getElementById('candidateInterviewExperience').value = '';
    if (document.getElementById('candidateInterviewCulture')) document.getElementById('candidateInterviewCulture').value = '';
    if (document.getElementById('candidateInterviewReliability')) document.getElementById('candidateInterviewReliability').value = '';
    if (document.getElementById('candidateInterviewRecommendation')) document.getElementById('candidateInterviewRecommendation').value = '';
    if (document.getElementById('candidateInterviewNextStep')) document.getElementById('candidateInterviewNextStep').value = '';
    if (document.getElementById('candidateInterviewStrengths')) document.getElementById('candidateInterviewStrengths').value = '';
    if (document.getElementById('candidateInterviewConcerns')) document.getElementById('candidateInterviewConcerns').value = '';

    if (document.getElementById('candidateOfferStatus')) document.getElementById('candidateOfferStatus').value = candidate.offer_status || 'Not Started';
    if (document.getElementById('candidateOfferAmount')) document.getElementById('candidateOfferAmount').value = candidate.offer_amount || '';
    if (document.getElementById('candidateStartDate')) document.getElementById('candidateStartDate').value = candidate.target_start_date || '';
    if (document.getElementById('candidateOfferDate')) document.getElementById('candidateOfferDate').value = candidate.offer_date || '';
    if (document.getElementById('candidateOfferNotes')) document.getElementById('candidateOfferNotes').value = candidate.offer_notes || '';

    const offerSummary = document.getElementById('candidateOfferSummary');
    if (offerSummary) {
        const hasOffer = candidate.offer_status || candidate.offer_amount || candidate.target_start_date || candidate.offer_date || candidate.offer_notes;
        if (hasOffer) {
            offerSummary.innerHTML = `
                <strong>Saved Offer</strong><br>
                Status: ${candidateDisplay(candidate.offer_status || 'Not Started')}<br>
                Amount: ${candidateDisplay(candidate.offer_amount)}<br>
                Target Start Date: ${candidate.target_start_date ? new Date(candidate.target_start_date + 'T00:00:00').toLocaleDateString() : '—'}<br>
                Offer Sent Date: ${candidate.offer_date ? new Date(candidate.offer_date + 'T00:00:00').toLocaleDateString() : '—'}
                ${candidate.offer_notes ? `<br>Notes: ${candidateDisplay(candidate.offer_notes)}` : ''}
            `;
            offerSummary.style.display = 'block';
        } else {
            offerSummary.innerHTML = '';
            offerSummary.style.display = 'none';
        }
    }

    const offerSaveStatus = document.getElementById('candidateOfferSaveStatus');
    if (offerSaveStatus) {
        offerSaveStatus.style.display = 'none';
        offerSaveStatus.textContent = '';
    }

    if (document.getElementById('candidateResumeStatus')) document.getElementById('candidateResumeStatus').value = candidate.resume_status || 'Not Received';
    if (document.getElementById('candidateApplicationStatus')) document.getElementById('candidateApplicationStatus').value = candidate.application_status || 'Not Started';
    if (document.getElementById('candidateBackgroundStatus')) document.getElementById('candidateBackgroundStatus').value = candidate.background_status || 'Not Started';
    if (document.getElementById('candidateEligibilityStatus')) document.getElementById('candidateEligibilityStatus').value = candidate.eligibility_status || 'Not Started';
    if (document.getElementById('candidateDocumentNotes')) document.getElementById('candidateDocumentNotes').value = candidate.document_notes || '';

    const candidateName = `${candidate.first_name || ''} ${candidate.last_name || ''}`.trim() || candidate.name || candidate.candidate_name || 'Candidate Details';
    document.getElementById('candidateDrawerName').textContent = candidateName;
    document.getElementById('candidateDrawerSubtext').textContent = `${candidate.stage || 'Applied'} • ${candidate.position || candidate.position_applied_for || candidate.role || 'No position listed'}`;

    drawer.classList.remove('hidden');
    drawer.classList.add('open');
    drawer.style.display = 'block';
    drawer.style.pointerEvents = 'auto';
    switchCandidateDrawerTab('profile');
    setTimeout(ensureLegacyCandidateMoveButton, 100);
}

function switchCandidateDrawerTab(tabName) {
    const drawer = document.getElementById('candidateDetailsDrawer');
    if (!drawer) return;

    drawer.querySelectorAll('[data-candidate-tab]').forEach(button => {
        button.classList.toggle('active', button.dataset.candidateTab === tabName);
    });

    drawer.querySelectorAll('[data-candidate-panel]').forEach(panel => {
        const isActive = panel.dataset.candidatePanel === tabName;
        panel.classList.toggle('hidden', !isActive);
        panel.style.display = isActive ? 'block' : 'none';
    });
}

async function updateCandidateFields(fields, successMessage, returnTab = null) {
    const db = getOrbisSupabaseClient();
    if (!db) {
        candidateToast('Supabase connection not found.', 'error');
        return;
    }

    const candidateId = document.getElementById('candidateDetailId')?.value;
    if (!candidateId) {
        candidateToast('No candidate is selected.', 'error');
        return;
    }

    const activeTab = returnTab || document.querySelector('#candidateDetailsDrawer .tab-btn.active')?.dataset.candidateTab || 'profile';

    const { error } = await db
        .from('candidates')
        .update(fields)
        .eq('id', candidateId);

    if (error) {
        console.error('Error updating candidate fields:', error);
        candidateToast(`Could not save candidate update: ${error.message || 'Unknown error'}`, 'error');
        return;
    }

    candidateToast(successMessage, 'success');
    await refreshCandidatesFromMainApp();
    await openCandidateDetails(candidateId);
    switchCandidateDrawerTab(activeTab);
}

async function saveCandidateNotes() {
    await updateCandidateFields({
        notes: document.getElementById('candidateDetailNotes')?.value || ''
    }, 'Candidate notes saved.', 'notes');
}


async function saveCandidateInterview() {
    const liveNotes = document.getElementById('candidateInterviewNotes')?.value || '';
    const communication = document.getElementById('candidateInterviewCommunication')?.value || '';
    const experience = document.getElementById('candidateInterviewExperience')?.value || '';
    const culture = document.getElementById('candidateInterviewCulture')?.value || '';
    const reliability = document.getElementById('candidateInterviewReliability')?.value || '';
    const recommendation = document.getElementById('candidateInterviewRecommendation')?.value || '';
    const nextStep = document.getElementById('candidateInterviewNextStep')?.value || '';
    const strengths = document.getElementById('candidateInterviewStrengths')?.value || '';
    const concerns = document.getElementById('candidateInterviewConcerns')?.value || '';

    const evaluationSummary = [
        communication ? `Communication: ${communication}` : '',
        experience ? `Experience Fit: ${experience}` : '',
        culture ? `Culture / Team Fit: ${culture}` : '',
        reliability ? `Reliability / Availability: ${reliability}` : '',
        recommendation ? `Overall Recommendation: ${recommendation}` : '',
        nextStep ? `Next Step: ${nextStep}` : '',
        strengths ? `Strengths:\n${strengths}` : '',
        concerns ? `Concerns / Follow-Up:\n${concerns}` : '',
        liveNotes ? `Interview Notes:\n${liveNotes}` : ''
    ].filter(Boolean).join('\n\n');

    const nextStage = nextStep === 'Move to Offer'
        ? 'Offer'
        : nextStep === 'Reject Candidate'
            ? 'Rejected'
            : 'Interviewing';

    await updateCandidateFields({
        interview_date: document.getElementById('candidateInterviewDate')?.value || null,
        interview_time: document.getElementById('candidateInterviewTime')?.value || null,
        interview_type: document.getElementById('candidateInterviewType')?.value || '',
        interview_status: document.getElementById('candidateInterviewStatus')?.value || 'Completed',
        interview_notes: evaluationSummary,
        stage: nextStage
    }, 'Interview evaluation saved.', 'interview');
}

async function saveCandidateOffer() {
    const candidateId = document.getElementById('candidateDetailId')?.value;
    if (!candidateId) {
        candidateToast('No candidate is selected.', 'error');
        return;
    }

    const db = getOrbisSupabaseClient();
    if (!db) {
        candidateToast('Supabase connection not found.', 'error');
        return;
    }

    const offerStatus = document.getElementById('candidateOfferStatus')?.value || 'Not Started';
    const fields = {
        offer_status: offerStatus,
        offer_amount: document.getElementById('candidateOfferAmount')?.value || '',
        target_start_date: document.getElementById('candidateStartDate')?.value || null,
        offer_date: document.getElementById('candidateOfferDate')?.value || null,
        offer_notes: document.getElementById('candidateOfferNotes')?.value || '',
        stage: 'Offer'
    };

    const { error } = await db
        .from('candidates')
        .update(fields)
        .eq('id', candidateId);

    if (error) {
        console.error('Error saving candidate offer:', error);
        candidateToast(`Offer could not be saved: ${error.message || 'Unknown error'}`, 'error');
        return;
    }

    candidateToast(`Offer saved: ${offerStatus}.`, 'success');

    await refreshCandidatesFromMainApp();
    await openCandidateDetails(candidateId);
    switchCandidateDrawerTab('offer');

    const offerSaveStatus = document.getElementById('candidateOfferSaveStatus');
    if (offerSaveStatus) {
        offerSaveStatus.textContent = `Offer saved: ${offerStatus}.`;
        offerSaveStatus.style.display = 'inline-block';
    }

    const offerSummary = document.getElementById('candidateOfferSummary');
    if (offerSummary) {
        offerSummary.innerHTML = `
            <strong>Saved Offer</strong><br>
            Status: ${candidateDisplay(fields.offer_status || 'Not Started')}<br>
            Amount: ${candidateDisplay(fields.offer_amount)}<br>
            Target Start Date: ${fields.target_start_date ? new Date(fields.target_start_date + 'T00:00:00').toLocaleDateString() : '—'}<br>
            Offer Sent Date: ${fields.offer_date ? new Date(fields.offer_date + 'T00:00:00').toLocaleDateString() : '—'}
            ${fields.offer_notes ? `<br>Notes: ${candidateDisplay(fields.offer_notes)}` : ''}
        `;
        offerSummary.style.display = 'block';
    }
}

async function saveCandidateDocument() {
    await updateCandidateFields({
        resume_status: document.getElementById('candidateResumeStatus')?.value || 'Not Received',
        application_status: document.getElementById('candidateApplicationStatus')?.value || 'Not Started',
        background_status: document.getElementById('candidateBackgroundStatus')?.value || 'Not Started',
        eligibility_status: document.getElementById('candidateEligibilityStatus')?.value || 'Not Started',
        document_notes: document.getElementById('candidateDocumentNotes')?.value || ''
    }, 'Candidate document status saved.', 'documents');
}

function closeCandidateDetails() {
    const drawer = document.getElementById('candidateDetailsDrawer');
    if (drawer) {
        drawer.classList.add('hidden');
        drawer.classList.remove('open');
        drawer.style.display = 'none';
        drawer.style.pointerEvents = 'none';
    }
}

function removeCandidateDrawerAfterHire() {
    const drawer = document.getElementById('candidateDetailsDrawer');
    if (drawer) {
        drawer.classList.add('hidden');
        drawer.classList.remove('open');
        drawer.style.display = 'none';
        drawer.style.pointerEvents = 'none';
    }
}

async function saveCandidateDetails() {
    const db = getOrbisSupabaseClient();
    if (!db) return;

    const candidateId = document.getElementById('candidateDetailId')?.value;
    if (!candidateId) return;

    const updatedCandidate = {
        first_name: document.getElementById('candidateDetailFirstName')?.value || '',
        last_name: document.getElementById('candidateDetailLastName')?.value || '',
        position: document.getElementById('candidateDetailPosition')?.value || '',
        stage: document.getElementById('candidateDetailStage')?.value || 'Applied',
        source: document.getElementById('candidateDetailSource')?.value || '',
        email: document.getElementById('candidateDetailEmail')?.value || '',
        phone: document.getElementById('candidateDetailPhone')?.value || ''
    };

    const { error } = await db
        .from('candidates')
        .update(updatedCandidate)
        .eq('id', candidateId);

    if (error) {
        console.error('Error saving candidate:', error);
        candidateToast(`Candidate could not be saved: ${error.message || 'Unknown error'}`, 'error');
        return;
    }

    candidateToast('Candidate updated.', 'success');
    await refreshCandidatesFromMainApp();
    await openCandidateDetails(candidateId);
    setTimeout(ensureLegacyCandidateMoveButton, 100);
}

async function saveCandidateStageFromDrawer(newStage) {
    const candidateId = document.getElementById('candidateDetailId')?.value;
    if (!candidateId) return;

    const stageInput = document.getElementById('candidateDetailStage');
    if (stageInput) stageInput.value = newStage;

    await updateCandidateStage(candidateId, newStage);
    await openCandidateDetails(candidateId);
}

async function moveCandidateToNextStage(passedId = null) {
    const db = getOrbisSupabaseClient();
    if (!db) {
        candidateToast('Supabase connection not found.', 'error');
        return;
    }

    let candidateId = passedId;

    if (!candidateId) {

        candidateId = document.getElementById('candidateDetailId')?.value;

    }

    if (!candidateId) {

        candidateId = await resolveCurrentCandidateIdFromDrawer(db);

    }
    if (!candidateId) {
        candidateToast('No candidate is selected.', 'error');
        console.warn('Move to Next Stage could not resolve candidate ID from drawer fields.');
        return;
    }

    const stageInput = document.getElementById('candidateDetailStage');
    const currentStage = String(stageInput?.value || 'Applied').trim();
    const normalizedStage = currentStage.toLowerCase().replace(/\s+/g, '');

    // Normalization fix for Interviewing/Interview
    const normalizedMap = {
        interviewing: 'interview'
    };

    const safeStage = normalizedMap[normalizedStage] || normalizedStage;

    console.log('Moving candidate to next stage:', { candidateId, currentStage, normalizedStage });

    const stages = ['Applied', 'Screening', 'Interview', 'Offer'];
    const currentIndex = stages.findIndex(stage => stage.toLowerCase().replace(/\s+/g, '') === safeStage);

    let nextStage;

    if (currentIndex === -1) {
        nextStage = 'Applied';
    } else if (currentIndex === stages.length - 1) {
        nextStage = 'Hired';
    } else {
        nextStage = stages[currentIndex + 1];
    }

    if (stageInput) stageInput.value = nextStage;

    await updateCandidateStage(candidateId, nextStage);

    await openCandidateDetails(candidateId);
}

async function convertCurrentCandidateToEmployee() {
    const db = getOrbisSupabaseClient();
    if (!db) {
        candidateToast('Supabase connection not found.', 'error');
        return;
    }

    const candidateId = await resolveCurrentCandidateIdFromDrawer(db);

    if (!candidateId) {
        candidateToast('No candidate is selected to hire.', 'error');
        console.warn('Convert to Employee could not resolve candidate ID from drawer fields.');
        return;
    }

    await convertCandidateToEmployee(candidateId);
}

async function deleteCurrentCandidate() {
    const candidateId = document.getElementById('candidateDetailId')?.value;
    if (!candidateId) return;

    await deleteCandidate(candidateId);
    closeCandidateDetails();
}

function sendCandidateInterviewInvite() {
    const email = document.getElementById('candidateDetailEmail')?.value || '';
    const name = `${document.getElementById('candidateDetailFirstName')?.value || ''} ${document.getElementById('candidateDetailLastName')?.value || ''}`.trim() || 'Candidate';
    const position = document.getElementById('candidateDetailPosition')?.value || 'the position';

    if (!email) {
        candidateToast('Add the candidate email before sending an interview invite.', 'error');
        return;
    }

    const subject = encodeURIComponent('BTW Global - Interview Request');
    const body = encodeURIComponent(`Hello ${name},\n\nThank you for your interest in the ${position} position with BTW Global. We enjoyed reviewing your application and would like to invite you to interview with us.\n\nWe would love to learn more about your experience, answer any questions you may have, and share more about the role and our team.\n\nPlease reply with a few dates and times that work well for you, and we will do our best to coordinate a convenient interview time.\n\nThank you again for your interest in joining BTW Global. We look forward to speaking with you.`);

    window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
    candidateToast('Opening email invite.', 'success');
}

async function updateCandidateStage(candidateId, newStage) {
    if (!candidateId) return;

    const db = getOrbisSupabaseClient();

    if (!db) {
        console.error('Supabase client not found for candidates module.');
        candidateToast('Supabase connection not found.', 'error');
        return;
    }

    const { error } = await db
        .from('candidates')
        .update({ stage: newStage })
        .eq('id', candidateId);

    if (error) {
        console.error('Error updating candidate stage:', error);
        candidateToast(`Candidate stage could not be updated: ${error.message || 'Unknown error'}`, 'error');
        return;
    }

    candidateToast(`Candidate moved to ${newStage}.`, 'success');
    await refreshCandidatesFromMainApp();
}

async function getNextEmployeeId() {
    let data = [];

    try {
        if (window.OrbisServices?.employees?.getAll) {
            const result = await OrbisServices.employees.getAll();
            data = result?.data || [];
        } else {
            console.warn('OrbisServices.employees.getAll not found, falling back to empty dataset');
        }
    } catch (err) {
        console.warn('Could not read existing employee IDs. Falling back to timestamp ID.', err);
        return `BTW${String(Date.now()).slice(-4)}`;
    }

    const maxNumber = (data || [])
        .map(row => String(row.employee_id || '').replace(/\D/g, ''))
        .map(value => Number(value))
        .filter(value => Number.isFinite(value))
        .reduce((max, value) => Math.max(max, value), 2500);

    return `BTW${maxNumber + 1}`;
}

async function convertCandidateToEmployee(candidateId) {
    // 🔒 Prevent double execution (fixes duplicate onboarding + hire bug)
    if (window.__isHiringCandidate === true) {
        console.warn('BLOCKED: duplicate hire execution');
        return;
    }

    window.__isHiringCandidate = true;

    setTimeout(() => {
        window.__isHiringCandidate = false;
    }, 3000);

    try {
        if (!candidateId) return;

        const db = getOrbisSupabaseClient();

        if (!db) {
            console.error('Supabase client not found for candidates module.');
            candidateToast('Supabase connection not found.', 'error');
            return;
        }

        const confirmed = confirm('Hire this candidate, create an employee record, and remove them from the candidate pipeline?');
        if (!confirmed) {
            return;
        }

        const { data: candidate, error: fetchError } = await db
            .from('candidates')
            .select('*')
            .eq('id', candidateId)
            .single();

        if (fetchError || !candidate) {
            console.error('Error finding candidate:', fetchError);
            candidateToast(`Candidate could not be found: ${fetchError?.message || 'Unknown error'}`, 'error');
            return;
        }

        const nextEmployeeId = await getNextEmployeeId();

        const drawerCandidateId = document.getElementById('candidateDetailId')?.value || '';
        const drawerMatchesCandidate = String(drawerCandidateId) === String(candidateId);

        const drawerFirstName = drawerMatchesCandidate ? (document.getElementById('candidateDetailFirstName')?.value || '').trim() : '';
        const drawerLastName = drawerMatchesCandidate ? (document.getElementById('candidateDetailLastName')?.value || '').trim() : '';
        const drawerPosition = drawerMatchesCandidate ? (document.getElementById('candidateDetailPosition')?.value || '').trim() : '';
        const drawerEmail = drawerMatchesCandidate ? (document.getElementById('candidateDetailEmail')?.value || '').trim() : '';
        const drawerPhone = drawerMatchesCandidate ? (document.getElementById('candidateDetailPhone')?.value || '').trim() : '';

        const candidateFullName = `${drawerFirstName || candidate.first_name || ''} ${drawerLastName || candidate.last_name || ''}`.trim()
            || candidate.name
            || candidate.candidate_name
            || '';
        const nameParts = candidateFullName.trim().split(/\s+/).filter(Boolean);
        const firstName = drawerFirstName || candidate.first_name || nameParts[0] || '';
        const lastName = drawerLastName || candidate.last_name || nameParts.slice(1).join(' ') || '';
        const fullName = `${firstName} ${lastName}`.trim() || candidateFullName || 'New Employee';
        const position = drawerPosition || candidate.position || candidate.position_applied_for || candidate.role || '';
        const today = new Date().toISOString().slice(0, 10);

        const employeeRecord = {
            employee_id: nextEmployeeId,
            first_name: firstName,
            last_name: lastName,
            name: fullName,
            department: candidate.department || '',
            position,
            status: 'Active',
            pay_type: candidate.pay_type || '',
            standard_hours: candidate.standard_hours || 40,
            hire_date: today,
            personal_email: drawerEmail || candidate.email || '',
            work_email: candidate.work_email || '',
            phone: drawerPhone || candidate.phone || '',
            benefits_status: candidate.benefits_status || 'Not Eligible'
        };

        console.log('Creating employee from candidate:', employeeRecord);

        // 🔥 CREATE employee USING THE SAME PATH AS MANUAL EMPLOYEE SAVE
        let newEmployee = null;
        let insertError = null;

        try {
            if (window.OrbisServices?.employees?.create) {
                const result = await window.OrbisServices.employees.create(employeeRecord);
                newEmployee = Array.isArray(result?.data) ? result.data[0] : result?.data;
                insertError = result?.error || null;
                // 🔥 Ensure employee is immediately reflected in global state
                if (newEmployee) {
                    if (!Array.isArray(window.EMPLOYEES)) {
                        window.EMPLOYEES = [];
                    }

                    const exists = window.EMPLOYEES.some(e =>
                        String(e.employee_id || '') === String(newEmployee.employee_id || employeeRecord.employee_id)
                    );

                    if (!exists) {
                        window.EMPLOYEES.unshift(newEmployee);
                    }
                }
            } else {
                throw new Error('OrbisServices.employees.create not available');
            }
        } catch (err) {
            insertError = err;
        }



        if (insertError) {
            const isDuplicateEmployee =
                insertError.code === '23505' ||
                String(insertError.message || '').toLowerCase().includes('duplicate key') ||
                String(insertError.message || '').toLowerCase().includes('conflict') ||
                String(insertError.details || '').toLowerCase().includes('already exists');

            if (!isDuplicateEmployee) {
                console.error('Error converting candidate to employee:', insertError);
                candidateToast(`Candidate could not be converted: ${insertError.message || 'Unknown error'}`, 'error');
                return;
            }

            console.warn('Employee appears to already exist. Continuing hire cleanup instead of failing:', insertError);
        }

        let onboardingEmployeeId = nextEmployeeId;

        if (!newEmployee?.id && window.OrbisServices?.employees?.getAll) {
            try {
                const employeeResult = await OrbisServices.employees.getAll();
                const existingEmployee = (employeeResult?.data || []).find(employee =>
                    String(employee.employee_id || '') === String(nextEmployeeId) ||
                    (
                        String(employee.first_name || '').trim().toLowerCase() === String(firstName || '').trim().toLowerCase() &&
                        String(employee.last_name || '').trim().toLowerCase() === String(lastName || '').trim().toLowerCase()
                    )
                );

                if (existingEmployee?.employee_id || existingEmployee?.id) {
                    onboardingEmployeeId = existingEmployee.employee_id || existingEmployee.id || nextEmployeeId;
                }
            } catch (lookupError) {
                console.warn('Could not resolve employee DB ID for onboarding:', lookupError);
            }
        }

        if (typeof createDefaultOnboardingTasks === 'function') {
            try {
                // Check if onboarding tasks already exist (prevents duplicate constraint errors)
                const { data: existingTasks, error: existingError } = await db
                    .from('onboarding_tasks')
                    .select('id')
                    .eq('employee_id', onboardingEmployeeId)
                    .limit(1);

                if (existingError) {
                    console.warn('Could not check existing onboarding tasks:', existingError);
                }

                if (!existingTasks || existingTasks.length === 0) {
                    await createDefaultOnboardingTasks(onboardingEmployeeId);
                } else {
                    console.log('Onboarding tasks already exist. Skipping creation.');
                }

            } catch (onboardingError) {
                const isDuplicate =
                    onboardingError?.code === '23505' ||
                    String(onboardingError?.message || '').toLowerCase().includes('duplicate');

                if (!isDuplicate) {
                    console.warn('Employee was created, but onboarding task creation failed:', onboardingError);
                } else {
                    console.log('Duplicate onboarding tasks prevented. Continuing.');
                }
            }
        } else {
            console.warn('createDefaultOnboardingTasks is not available. Onboarding tasks were not auto-created.');
        }

        const { error: deleteError } = await db
            .from('candidates')
            .delete()
            .eq('id', candidateId);

        if (deleteError) {
            console.error('Candidate converted, but could not be removed from pipeline:', deleteError);
            candidateToast('Employee created, but candidate remains in pipeline.', 'warning');
            return;
        }

        candidateToast(`${fullName} was hired and removed from the candidate pipeline.`, 'success');
        closeCandidateDetails();
        removeCandidateDrawerAfterHire();
        await refreshCandidatesFromMainApp();

        // 🔥 Ensure roster updates exactly like manual Save Employee
        if (typeof window.refreshEmployeeRoster === 'function') {
            await window.refreshEmployeeRoster();
        }

        if (typeof window.loadDashboardData === 'function') {
            await window.loadDashboardData();
        }

        if (typeof window.loadOnboardingTasks === 'function') {
            await window.loadOnboardingTasks(onboardingEmployeeId);
        }

    } finally {
        window.__isHiringCandidate = false;
    }

}

async function deleteCandidate(candidateId) {
    if (!candidateId) return;

    const db = getOrbisSupabaseClient();

    if (!db) {
        console.error('Supabase client not found for candidates module.');
        candidateToast('Supabase connection not found.', 'error');
        return;
    }

    const confirmed = confirm('Delete this candidate from the pipeline?');
    if (!confirmed) return;

    const { error } = await db
        .from('candidates')
        .delete()
        .eq('id', candidateId);

    if (error) {
        console.error('Error deleting candidate:', error);
        candidateToast(`Candidate could not be deleted: ${error.message || 'Unknown error'}`, 'error');
        return;
    }

    candidateToast('Candidate deleted.', 'success');
    await refreshCandidatesFromMainApp();
}