// Shared DOM helpers, toast, and print utilities (ported from js/utils/helpers.js)

import { orbisLetterheadHtml, orbisPrintFooterHtml } from '../brand/letterhead';

type EmployeeLike = {
  id?: string;
  dbId?: string;
  employee_id?: string;
  first?: string;
  first_name?: string;
  last?: string;
  last_name?: string;
  name?: string;
};

export function safeGet<T extends HTMLElement = HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

export function setText(id: string, value: unknown): void {
  const el = safeGet(id);
  if (el) {
    el.textContent = value == null ? '' : String(value);
  }
}

export function setHTML(id: string, value: unknown): void {
  const el = safeGet(id);
  if (el) {
    el.innerHTML = value == null ? '' : String(value);
  }
}

export function esc(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  const element = document.createElement('div');
  element.textContent = String(value);
  return element.innerHTML;
}

export function nl2br(value: unknown): string {
  return esc(value).replace(/\n/g, '<br>');
}

export function fmtDateTime(value: unknown): string {
  if (!value) return '—';

  const date = value instanceof Date ? value : new Date(String(value));

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function fmtDate(value: unknown): string {
  if (!value) return '—';

  const date = value instanceof Date ? value : new Date(String(value));

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function toInputDate(value: unknown): string {
  if (!value) return '';

  const date = value instanceof Date ? value : new Date(String(value));

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function todayInputValue(): string {
  return toInputDate(new Date());
}

export type DebouncedFunction<T extends (...args: never[]) => void> = T & {
  flush: () => void;
  cancel: () => void;
};

/** Coalesce rapid calls; optional flush runs the pending invocation immediately. */
export function debounce<T extends (...args: never[]) => void>(
  fn: T,
  waitMs: number
): DebouncedFunction<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pendingArgs: Parameters<T> | null = null;

  const debounced = ((...args: Parameters<T>) => {
    pendingArgs = args;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      const argsToUse = pendingArgs;
      pendingArgs = null;
      if (argsToUse) fn(...argsToUse);
    }, waitMs);
  }) as DebouncedFunction<T>;

  debounced.flush = () => {
    if (!timer && !pendingArgs) return;
    if (timer) clearTimeout(timer);
    timer = null;
    const argsToUse = pendingArgs;
    pendingArgs = null;
    if (argsToUse) fn(...argsToUse);
  };

  debounced.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    pendingArgs = null;
  };

  return debounced;
}

export function getCurrentEmployeeDisplayName(): string {
  const employee = window.currentEmployee;

  if (!employee) {
    return '';
  }

  return (
    `${employee.first || employee.first_name || ''} ${employee.last || employee.last_name || ''}`.trim() ||
    employee.name ||
    ''
  );
}

export function getCurrentEmployeeDisplayId(): string {
  const employee = window.currentEmployee;

  if (!employee) {
    return '';
  }

  return String(employee.employee_id || employee.id || employee.dbId || '');
}

export function statusBadge(status: unknown): string {
  const normalized = String(status || '').toUpperCase();

  if (normalized === 'ACTIVE' || normalized === 'OPEN') {
    return 'badge success';
  }

  if (normalized === 'LEAVE' || normalized === 'PENDING') {
    return 'badge warning';
  }

  if (normalized === 'INACTIVE' || normalized === 'TERMINATED' || normalized === 'CLOSED') {
    return 'badge danger';
  }

  return 'badge';
}

export function compareText(a: unknown, b: unknown): number {
  return String(a || '').localeCompare(String(b || ''), undefined, { sensitivity: 'base' });
}

export function showToast(message: string, type: string = 'success'): void {
  const wrap = safeGet('toastWrap');

  if (!wrap) {
    return;
  }

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

export function printField(label: string, value: string): string {
  return `
    <div style="margin-bottom:10px;">
      <div style="font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; color:#555;">${esc(label)}</div>
      <div style="font-size:14px; line-height:1.5; color:#111;">${value || '&nbsp;'}</div>
    </div>
  `;
}

export function printEmployeeInfo(extraFieldsHTML: string = ''): string {
  return printSection(
    'Employee Information',
    `
    ${printField('Employee', esc(getCurrentEmployeeDisplayName()))}
    ${printField('Employee ID', esc(getCurrentEmployeeDisplayId()))}
    ${extraFieldsHTML || ''}
  `
  );
}

export function printSection(title: string, contentHTML: string): string {
  return `
    <div style="margin-top:18px; padding-top:12px; border-top:1px solid #ddd;">
      <div style="font-size:13px; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; color:#333; margin-bottom:10px;">${esc(title)}</div>
      <div style="font-size:14px; line-height:1.6; color:#111;">${contentHTML || ''}</div>
    </div>
  `;
}

function buildSignatureBlock(): string {
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

function buildDisciplineSignatureBlock(): string {
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

export function printRecord(title: string, contentHTML: string): void {
  const container = safeGet('printContent');
  const printArea = safeGet('printArea');

  if (!container || !printArea) {
    return;
  }

  container.innerHTML = `
    <div style="font-family: Arial, sans-serif; color:#111; padding:24px; max-width:800px; margin:0 auto; background:#fff;">
      ${orbisLetterheadHtml({
        documentTitle: title,
        subtitle: 'HR Intelligence & Operations',
        metaLines: [
          `<strong>Generated:</strong> ${new Date().toLocaleDateString()}`,
          `<strong>Type:</strong> ${esc(title)}`,
        ],
      })}
      <div style="font-size:14px; line-height:1.6;">
        ${contentHTML}
      </div>
      ${orbisPrintFooterHtml()}
    </div>
  `;

  printArea.classList.remove('hidden');

  setTimeout(() => {
    window.print();
    printArea.classList.add('hidden');
    container.innerHTML = '';
  }, 150);
}

export function printNote(): void {
  const date = (safeGet('noteDate') as HTMLInputElement | null)?.value || '';
  const type = (safeGet('noteType') as HTMLInputElement | null)?.value || '';
  const text = (safeGet('noteText') as HTMLTextAreaElement | null)?.value || '';

  const content = printSection(
    'Note Details',
    `
      ${printField('Date', esc(date))}
      ${printField('Type', esc(type))}
      ${printField('Note', nl2br(text))}
    `
  );

  printRecord('HR Note', content);
}

export function printDiscipline(): void {
  const date = (safeGet('disciplineDate') as HTMLInputElement | null)?.value || '';
  const type = (safeGet('disciplineType') as HTMLInputElement | null)?.value || '';
  const level = (safeGet('disciplineLevel') as HTMLInputElement | null)?.value || '';
  const description = (safeGet('disciplineDescription') as HTMLTextAreaElement | null)?.value || '';
  const action = (safeGet('disciplineAction') as HTMLTextAreaElement | null)?.value || '';
  const status = (safeGet('disciplineStatus') as HTMLInputElement | null)?.value || '';

  const content = `
    ${printEmployeeInfo()}
    ${printSection(
      'Discipline Details',
      `
      ${printField('Incident Date', esc(date))}
      ${printField('Issue Type', esc(type))}
      ${printField('Level', esc(level))}
      ${printField('Status', esc(status))}
      ${printField('Description', nl2br(description))}
      ${printField('Action Taken', nl2br(action))}
    `
    )}
    ${buildDisciplineSignatureBlock()}
  `;

  printRecord('Discipline Report', content);
}

export function printIncident(): void {
  const date = (safeGet('incidentDate') as HTMLInputElement | null)?.value || '';
  const type = (safeGet('incidentType') as HTMLInputElement | null)?.value || '';
  const location = (safeGet('incidentLocation') as HTMLInputElement | null)?.value || '';
  const description = (safeGet('incidentDescription') as HTMLTextAreaElement | null)?.value || '';
  const followUp = (safeGet('incidentFollowUp') as HTMLTextAreaElement | null)?.value || '';
  const status = (safeGet('incidentStatus') as HTMLInputElement | null)?.value || '';

  const content = `
    ${printEmployeeInfo()}
    ${printSection(
      'Incident Details',
      `
      ${printField('Incident Date', esc(date))}
      ${printField('Incident Type', esc(type))}
      ${printField('Location', esc(location))}
      ${printField('Status', esc(status))}
      ${printField('Description', nl2br(description))}
      ${printField('Follow-Up / Corrective Action', nl2br(followUp))}
    `
    )}
    ${buildSignatureBlock()}
  `;

  printRecord('Incident Report', content);
}

export function printStayInterview(): void {
  const date = (safeGet('stayInterviewDate') as HTMLInputElement | null)?.value || '';
  const type = (safeGet('stayInterviewType') as HTMLInputElement | null)?.value || '';
  const q1 = (safeGet('stayQ1') as HTMLTextAreaElement | null)?.value || '';
  const q2 = (safeGet('stayQ2') as HTMLTextAreaElement | null)?.value || '';
  const q3 = (safeGet('stayQ3') as HTMLTextAreaElement | null)?.value || '';
  const q4 = (safeGet('stayQ4') as HTMLTextAreaElement | null)?.value || '';
  const q5 = (safeGet('stayQ5') as HTMLTextAreaElement | null)?.value || '';
  const q6 = (safeGet('stayQ6') as HTMLTextAreaElement | null)?.value || '';
  const q7 = (safeGet('stayQ7') as HTMLTextAreaElement | null)?.value || '';
  const summary = (safeGet('stayManagerSummary') as HTMLTextAreaElement | null)?.value || '';

  const content = `
    ${printEmployeeInfo(`
      ${printField('Interview Date', esc(date))}
      ${printField('Interview Type', esc(type))}
    `)}
    ${printSection(
      'Interview Responses',
      `
      ${printField('1. What do you look forward to when you come to work each day?', nl2br(q1))}
      ${printField('2. What is going well in your role right now?', nl2br(q2))}
      ${printField('3. What frustrations, obstacles, or stress points are you experiencing?', nl2br(q3))}
      ${printField('4. What would make your job more satisfying or easier?', nl2br(q4))}
      ${printField('5. Do you feel supported by your supervisor and team? Why or why not?', nl2br(q5))}
      ${printField('6. What might cause you to consider leaving BTW Global?', nl2br(q6))}
      ${printField('7. What can we do to help you stay and succeed here?', nl2br(q7))}
      ${printField('HR / Manager Summary', nl2br(summary))}
    `
    )}
  `;

  printRecord('Stay Interview', content);
}

export function printMeeting(): void {
  const date = (safeGet('meetingDate') as HTMLInputElement | null)?.value || '';
  const type = (safeGet('meetingType') as HTMLInputElement | null)?.value || '';
  const subject = (safeGet('meetingSubject') as HTMLInputElement | null)?.value || '';
  const notes = (safeGet('meetingNotes') as HTMLTextAreaElement | null)?.value || '';

  const content = `
    ${printEmployeeInfo()}
    ${printSection(
      'Meeting Details',
      `
      ${printField('Meeting Date', esc(date))}
      ${printField('Meeting Type', esc(type))}
      ${printField('Subject', esc(subject))}
      ${printField('Notes', nl2br(notes))}
    `
    )}
  `;

  printRecord('Meeting Record', content);
}

export function printReview(): void {
  const employee =
    typeof window.getCurrentEmployeeForOrbis === 'function'
      ? window.getCurrentEmployeeForOrbis()
      : window.currentEmployee ?? null;

  if (
    typeof window.canAccessPerformanceReviews === 'function' &&
    !window.canAccessPerformanceReviews(employee)
  ) {
    showToast('You do not have access to print performance reviews for this employee.', 'error');
    return;
  }

  const date = (safeGet('reviewDate') as HTMLInputElement | null)?.value || '';
  const type = (safeGet('reviewType') as HTMLInputElement | null)?.value || '';
  const attendance = (safeGet('attendanceScore') as HTMLInputElement | null)?.value || '';
  const performance = (safeGet('performanceScore') as HTMLInputElement | null)?.value || '';
  const teamwork = (safeGet('teamworkScore') as HTMLInputElement | null)?.value || '';
  const attitude = (safeGet('attitudeScore') as HTMLInputElement | null)?.value || '';
  const reliability = (safeGet('reliabilityScore') as HTMLInputElement | null)?.value || '';
  const overall = (safeGet('overallResult') as HTMLInputElement | null)?.value || '';
  const strengths = (safeGet('reviewStrengths') as HTMLTextAreaElement | null)?.value || '';
  const improvements = (safeGet('reviewImprovements') as HTMLTextAreaElement | null)?.value || '';
  const employeeComments = (safeGet('employeeComments') as HTMLTextAreaElement | null)?.value || '';
  const managerComments = (safeGet('managerComments') as HTMLTextAreaElement | null)?.value || '';

  const content = `
    ${printEmployeeInfo(`
      ${printField('Review Date', esc(date))}
      ${printField('Review Type', esc(type))}
    `)}
    ${printSection(
      'Scores',
      `
      ${printField('Attendance', esc(attendance))}
      ${printField('Performance', esc(performance))}
      ${printField('Teamwork', esc(teamwork))}
      ${printField('Attitude', esc(attitude))}
      ${printField('Reliability', esc(reliability))}
      ${printField('Overall Result', esc(overall))}
    `
    )}
    ${printSection(
      'Narrative',
      `
      ${printField('Strongest Contributions', nl2br(strengths))}
      ${printField('Areas for Improvement', nl2br(improvements))}
      ${printField('Employee Comments / Feedback', nl2br(employeeComments))}
      ${printField('Manager Action Plan / Next Steps', nl2br(managerComments))}
    `
    )}
    ${buildSignatureBlock()}
  `;

  printRecord('Performance Review', content);
}

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
