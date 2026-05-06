// =========================
// SHARED HELPERS / PRINT UTILITIES
// =========================
function safeGet(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  const el = safeGet(id);
  if (el) el.textContent = value ?? '';
}

function setHTML(id, value) {
  const el = safeGet(id);
  if (el) el.innerHTML = value ?? '';
}

function esc(value) {
  if (value === null || value === undefined) return '';
  const d = document.createElement('div');
  d.textContent = String(value);
  return d.innerHTML;
}

function nl2br(value) {
  return esc(value).replace(/\n/g, '<br>');
}

function fmtDateTime(value) {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function fmtDate(value) {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

function toInputDate(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function todayInputValue() {
  return toInputDate(new Date());
}

function getCurrentEmployeeDisplayName() {
  if (!currentEmployee) return '';
  return `${currentEmployee.first || currentEmployee.first_name || ''} ${currentEmployee.last || currentEmployee.last_name || ''}`.trim() || currentEmployee.name || '';
}

function getCurrentEmployeeDisplayId() {
  if (!currentEmployee) return '';
  return currentEmployee.employee_id || currentEmployee.id || currentEmployee.dbId || '';
}

function statusBadge(status) {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'ACTIVE' || normalized === 'OPEN') return 'badge success';
  if (normalized === 'LEAVE' || normalized === 'PENDING') return 'badge warning';
  if (normalized === 'INACTIVE' || normalized === 'TERMINATED' || normalized === 'CLOSED') return 'badge danger';
  return 'badge';
}

function compareText(a, b) {
  return String(a || '').localeCompare(String(b || ''), undefined, { sensitivity: 'base' });
}

function showToast(message, type = 'success') {
  const wrap = safeGet('toastWrap');
  if (!wrap) return;
  const toast = document.createElement('div');
  toast.className = `toast${type === 'error' ? ' error' : ''}`;
  toast.textContent = message;
  wrap.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 250);
  }, 2600);
}

function printField(label, value) {
  return `
    <div style="margin-bottom:10px;">
      <div style="font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; color:#555;">${esc(label)}</div>
      <div style="font-size:14px; line-height:1.5; color:#111;">${value || '&nbsp;'}</div>
    </div>
  `;
}

function printEmployeeInfo(extraFieldsHTML = '') {
  return printSection('Employee Information', `
    ${printField('Employee', esc(getCurrentEmployeeDisplayName()))}
    ${printField('Employee ID', esc(getCurrentEmployeeDisplayId()))}
    ${extraFieldsHTML || ''}
  `);
}

function printSection(title, contentHTML) {
  return `
    <div style="margin-top:18px; padding-top:12px; border-top:1px solid #ddd;">
      <div style="font-size:13px; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; color:#333; margin-bottom:10px;">${esc(title)}</div>
      <div style="font-size:14px; line-height:1.6; color:#111;">${contentHTML || ''}</div>
    </div>
  `;
}

function buildSignatureBlock() {
  return `
    <div style="margin-top:40px;">
      <div style="display:flex; gap:40px; flex-wrap:wrap;">
        <div style="flex:1; min-width:220px;">
          <div style="border-bottom:1px solid #000; height:40px;"></div>
          <div style="font-size:12px; margin-top:4px;">Employee Signature</div>
          <div style="border-bottom:1px solid #000; height:40px; margin-top:20px;"></div>
          <div style="font-size:12px;">Date</div>
        </div>
        <div style="flex:1; min-width:220px;">
          <div style="border-bottom:1px solid #000; height:40px;"></div>
          <div style="font-size:12px; margin-top:4px;">Manager Signature</div>
          <div style="border-bottom:1px solid #000; height:40px; margin-top:20px;"></div>
          <div style="font-size:12px;">Date</div>
        </div>
      </div>
      <div style="margin-top:18px; font-size:12px; color:#333;">
        ☐ Employee refused to sign
      </div>
      <div style="margin-top:24px; display:flex; gap:40px; flex-wrap:wrap;">
        <div style="flex:1; min-width:220px;">
          <div style="border-bottom:1px solid #000; height:40px;"></div>
          <div style="font-size:12px; margin-top:4px;">Witness Signature</div>
        </div>
        <div style="flex:1; min-width:220px;">
          <div style="border-bottom:1px solid #000; height:40px;"></div>
          <div style="font-size:12px; margin-top:4px;">Witness Date</div>
        </div>
      </div>
      <div style="margin-top:20px; font-size:12px; color:#555;">
        Signature acknowledges receipt and discussion, not necessarily agreement.
      </div>
    </div>
  `;
}

function buildDisciplineSignatureBlock() {
  return `
    <div style="margin-top:40px;">
      <div style="display:flex; gap:40px; flex-wrap:wrap;">
        <div style="flex:1; min-width:220px;">
          <div style="border-bottom:1px solid #000; height:40px;"></div>
          <div style="font-size:12px; margin-top:4px;">Employee Signature</div>
          <div style="border-bottom:1px solid #000; height:40px; margin-top:20px;"></div>
          <div style="font-size:12px;">Date</div>
        </div>
        <div style="flex:1; min-width:220px;">
          <div style="border-bottom:1px solid #000; height:40px;"></div>
          <div style="font-size:12px; margin-top:4px;">Manager Signature</div>
          <div style="border-bottom:1px solid #000; height:40px; margin-top:20px;"></div>
          <div style="font-size:12px;">Date</div>
        </div>
      </div>
      <div style="margin-top:18px; font-size:12px; color:#333;">
        ☐ Employee refused to sign
      </div>
      <div style="margin-top:24px; display:flex; gap:40px; flex-wrap:wrap;">
        <div style="flex:1; min-width:220px;">
          <div style="border-bottom:1px solid #000; height:40px;"></div>
          <div style="font-size:12px; margin-top:4px;">Witness Signature</div>
        </div>
        <div style="flex:1; min-width:220px;">
          <div style="border-bottom:1px solid #000; height:40px;"></div>
          <div style="font-size:12px; margin-top:4px;">Witness Date</div>
        </div>
      </div>
      <div style="margin-top:20px; font-size:12px; color:#555;">
        Employee signature confirms receipt of this disciplinary action. It does not imply agreement.
      </div>
    </div>
  `;
}
// =========================
// PRINT / PDF ENGINE
// =========================
function printRecord(title, contentHTML) {
  const container = safeGet('printContent');
  const printArea = safeGet('printArea');
  if (!container || !printArea) return;
  container.innerHTML = `
    <div style="font-family: Arial, sans-serif; color:#111; padding:24px; max-width:800px; margin:0 auto; background:#fff;">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:20px; margin-bottom:18px; border-bottom:2px solid #111; padding-bottom:14px;">
        <div>
          <div style="font-size:24px; font-weight:700; letter-spacing:0.02em;">BTW Global</div>
          <div style="font-size:12px; color:#666; margin-top:4px;">HR Record Export</div>
        </div>
        <div style="text-align:right; font-size:12px; color:#555; line-height:1.5;">
          <div><strong>Generated:</strong> ${new Date().toLocaleDateString()}</div>
          <div><strong>Type:</strong> ${esc(title)}</div>
        </div>
      </div>
      <div style="margin-bottom:16px;">
        <div style="font-size:20px; font-weight:700; margin-bottom:6px;">${esc(title)}</div>
        <div style="font-size:13px; color:#666;">Prepared from the BTW Global HRIS</div>
      </div>
      <div style="font-size:14px; line-height:1.6;">
        ${contentHTML}
      </div>
    </div>
  `;
  printArea.classList.remove('hidden');
  setTimeout(() => {
    window.print();
    printArea.classList.add('hidden');
    container.innerHTML = '';
  }, 150);
}

function printNote() {
  const date = safeGet('noteDate')?.value || '';
  const type = safeGet('noteType')?.value || '';
  const text = safeGet('noteText')?.value || '';
  const content = `
    ${printSection('Note Details', `
      ${printField('Date', esc(date))}
      ${printField('Type', esc(type))}
      ${printField('Note', nl2br(text))}
    `)}
  `;
  printRecord('HR Note', content);
}

function printDiscipline() {
  const date = safeGet('disciplineDate')?.value || '';
  const type = safeGet('disciplineType')?.value || '';
  const level = safeGet('disciplineLevel')?.value || '';
  const description = safeGet('disciplineDescription')?.value || '';
  const action = safeGet('disciplineAction')?.value || '';
  const status = safeGet('disciplineStatus')?.value || '';
  const content = `
    ${printEmployeeInfo()}
    ${printSection('Discipline Details', `
      ${printField('Incident Date', esc(date))}
      ${printField('Issue Type', esc(type))}
      ${printField('Level', esc(level))}
      ${printField('Status', esc(status))}
      ${printField('Description', nl2br(description))}
      ${printField('Action Taken', nl2br(action))}
    `)}
    ${buildDisciplineSignatureBlock()}
  `;
  printRecord('Discipline Report', content);
}

function printIncident() {
  const date = safeGet('incidentDate')?.value || '';
  const type = safeGet('incidentType')?.value || '';
  const location = safeGet('incidentLocation')?.value || '';
  const description = safeGet('incidentDescription')?.value || '';
  const followUp = safeGet('incidentFollowUp')?.value || '';
  const status = safeGet('incidentStatus')?.value || '';
  const content = `
    ${printEmployeeInfo()}
    ${printSection('Incident Details', `
      ${printField('Incident Date', esc(date))}
      ${printField('Incident Type', esc(type))}
      ${printField('Location', esc(location))}
      ${printField('Status', esc(status))}
      ${printField('Description', nl2br(description))}
      ${printField('Follow-Up / Corrective Action', nl2br(followUp))}
    `)}
    ${buildSignatureBlock()}
  `;
  printRecord('Incident Report', content);
}

function printStayInterview() {
  const date = safeGet('stayInterviewDate')?.value || '';
  const type = safeGet('stayInterviewType')?.value || '';
  const q1 = safeGet('stayQ1')?.value || '';
  const q2 = safeGet('stayQ2')?.value || '';
  const q3 = safeGet('stayQ3')?.value || '';
  const q4 = safeGet('stayQ4')?.value || '';
  const q5 = safeGet('stayQ5')?.value || '';
  const q6 = safeGet('stayQ6')?.value || '';
  const q7 = safeGet('stayQ7')?.value || '';
  const summary = safeGet('stayManagerSummary')?.value || '';
  const content = `
    ${printEmployeeInfo(`
      ${printField('Interview Date', esc(date))}
      ${printField('Interview Type', esc(type))}
    `)}
    ${printSection('Interview Responses', `
      ${printField('1. What do you look forward to when you come to work each day?', nl2br(q1))}
      ${printField('2. What is going well in your role right now?', nl2br(q2))}
      ${printField('3. What frustrations, obstacles, or stress points are you experiencing?', nl2br(q3))}
      ${printField('4. What would make your job more satisfying or easier?', nl2br(q4))}
      ${printField('5. Do you feel supported by your supervisor and team? Why or why not?', nl2br(q5))}
      ${printField('6. What might cause you to consider leaving BTW Global?', nl2br(q6))}
      ${printField('7. What can we do to help you stay and succeed here?', nl2br(q7))}
      ${printField('HR / Manager Summary', nl2br(summary))}
    `)}
  `;
  printRecord('Stay Interview', content);
}

function printMeeting() {
  const date = safeGet('meetingDate')?.value || '';
  const type = safeGet('meetingType')?.value || '';
  const subject = safeGet('meetingSubject')?.value || '';
  const notes = safeGet('meetingNotes')?.value || '';
  const content = `
    ${printEmployeeInfo()}
    ${printSection('Meeting Details', `
      ${printField('Meeting Date', esc(date))}
      ${printField('Meeting Type', esc(type))}
      ${printField('Subject', esc(subject))}
      ${printField('Notes', nl2br(notes))}
    `)}
  `;
  printRecord('Meeting Record', content);
}

function printReview() {
  const date = safeGet('reviewDate')?.value || '';
  const type = safeGet('reviewType')?.value || '';
  const attendance = safeGet('attendanceScore')?.value || '';
  const performance = safeGet('performanceScore')?.value || '';
  const teamwork = safeGet('teamworkScore')?.value || '';
  const attitude = safeGet('attitudeScore')?.value || '';
  const reliability = safeGet('reliabilityScore')?.value || '';
  const overall = safeGet('overallResult')?.value || '';
  const strengths = safeGet('reviewStrengths')?.value || '';
  const improvements = safeGet('reviewImprovements')?.value || '';
  const employeeComments = safeGet('employeeComments')?.value || '';
  const managerComments = safeGet('managerComments')?.value || '';
  const content = `
    ${printEmployeeInfo(`
      ${printField('Review Date', esc(date))}
      ${printField('Review Type', esc(type))}
    `)}
    ${printSection('Scores', `
      ${printField('Attendance', esc(attendance))}
      ${printField('Performance', esc(performance))}
      ${printField('Teamwork', esc(teamwork))}
      ${printField('Attitude', esc(attitude))}
      ${printField('Reliability', esc(reliability))}
      ${printField('Overall Result', esc(overall))}
    `)}
    ${printSection('Narrative', `
      ${printField('Strongest Contributions', nl2br(strengths))}
      ${printField('Areas for Improvement', nl2br(improvements))}
      ${printField('Employee Comments / Feedback', nl2br(employeeComments))}
      ${printField('Manager Action Plan / Next Steps', nl2br(managerComments))}
    `)}
    ${buildSignatureBlock()}
  `;
  printRecord('Performance Review', content);
}
// =========================
// GLOBAL EXPORTS
// =========================
window.safeGet = safeGet;
window.setText = setText;
window.setHTML = setHTML;
window.esc = esc;
window.nl2br = nl2br;
window.fmtDate = fmtDate;
window.fmtDateTime = fmtDateTime;
window.toInputDate = toInputDate;
window.todayInputValue = todayInputValue;
window.getCurrentEmployeeDisplayName = getCurrentEmployeeDisplayName;
window.getCurrentEmployeeDisplayId = getCurrentEmployeeDisplayId;
window.statusBadge = statusBadge;
window.compareText = compareText;
window.showToast = showToast;
window.printField = printField;
window.printEmployeeInfo = printEmployeeInfo;
window.printSection = printSection;
window.printRecord = printRecord;
window.printNote = printNote;
window.printDiscipline = printDiscipline;
window.printIncident = printIncident;
window.printStayInterview = printStayInterview;
window.printMeeting = printMeeting;
window.printReview = printReview;
