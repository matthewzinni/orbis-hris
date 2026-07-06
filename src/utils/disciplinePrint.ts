import { orbisLetterheadHtml } from '../brand/letterhead';
import { getCanvasSignature } from '../ui/signaturePads';
import { esc, getCurrentEmployeeDisplayId, getCurrentEmployeeDisplayName, nl2br, safeGet } from './helpers';
import { DISCIPLINE_PRINT_CSS } from './disciplinePrintStyles';

export type DisciplinePrintData = {
  incidentDate: string;
  issueType: string;
  level: string;
  status: string;
  description: string;
  actionTaken: string;
  refusedToSign: boolean;
  employeeSignature: string;
  managerSignature: string;
  witnessSignature: string;
};

export function readDisciplinePrintDataFromForm(): DisciplinePrintData {
  return {
    incidentDate: String((safeGet('disciplineDate') as HTMLInputElement | null)?.value || '').trim(),
    issueType: String((safeGet('disciplineType') as HTMLSelectElement | null)?.value || '').trim(),
    level: String((safeGet('disciplineLevel') as HTMLSelectElement | null)?.value || '').trim(),
    status: String((safeGet('disciplineStatus') as HTMLSelectElement | null)?.value || '').trim(),
    description: String((safeGet('disciplineDescription') as HTMLTextAreaElement | null)?.value || '').trim(),
    actionTaken: String((safeGet('disciplineAction') as HTMLTextAreaElement | null)?.value || '').trim(),
    refusedToSign: Boolean((safeGet('disciplineRefusedToSign') as HTMLInputElement | null)?.checked),
    employeeSignature: getCanvasSignature('disciplineEmployeeSignature'),
    managerSignature: getCanvasSignature('disciplineManagerSignature'),
    witnessSignature: getCanvasSignature('disciplineWitnessSignature'),
  };
}

export function disciplinePrintDataFromRecord(record: {
  incident_date?: string;
  issue_type?: string;
  discipline_level?: string;
  report_status?: string;
  description?: string;
  action_taken?: string;
  refused_to_sign?: boolean;
  employee_signature?: string;
  manager_signature?: string;
  witness_signature?: string;
}): DisciplinePrintData {
  return {
    incidentDate: String(record.incident_date || '').trim(),
    issueType: String(record.issue_type || '').trim(),
    level: String(record.discipline_level || '').trim(),
    status: String(record.report_status || '').trim(),
    description: String(record.description || '').trim(),
    actionTaken: String(record.action_taken || '').trim(),
    refusedToSign: Boolean(record.refused_to_sign),
    employeeSignature: String(record.employee_signature || '').trim(),
    managerSignature: String(record.manager_signature || '').trim(),
    witnessSignature: String(record.witness_signature || '').trim(),
  };
}

function printInfoRow(labelA: string, valueA: string, labelB: string, valueB: string): string {
  return `
    <tr>
      <th scope="row">${esc(labelA)}</th>
      <td>${valueA ? esc(valueA) : '—'}</td>
      <th scope="row">${esc(labelB)}</th>
      <td>${valueB ? esc(valueB) : '—'}</td>
    </tr>
  `;
}

function printSection(title: string, value: string): string {
  const body = value ? nl2br(value) : '—';
  return `
    <section class="print-discipline-section">
      <h2 class="print-discipline-section-head">${esc(title)}</h2>
      <div class="print-discipline-section-body">${body}</div>
    </section>
  `;
}

function printSignatureMarkup(signature: string): string {
  const src = String(signature || '').trim();
  if (!src.startsWith('data:image/')) {
    return '<div class="print-discipline-sig-line"></div>';
  }

  const safeSrc = src.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  return `<div class="print-discipline-sig-image-wrap"><img class="print-discipline-sig-image" src="${safeSrc}" alt="" /></div>`;
}

function printSignatureBox(label: string, signature: string, includeDate = false): string {
  const dateLine = includeDate
    ? `<div class="print-discipline-sig-line print-discipline-sig-line--short"></div><div class="print-discipline-sig-label">Date</div>`
    : '';

  return `
    <div class="print-discipline-sig-box">
      ${printSignatureMarkup(signature)}
      <div class="print-discipline-sig-label">${esc(label)}</div>
      ${dateLine}
    </div>
  `;
}

export function buildDisciplineReportPrintHtml(data: DisciplinePrintData): string {
  const generated = new Date().toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const refusedMark = data.refusedToSign ? '☑' : '☐';
  const employeeName = getCurrentEmployeeDisplayName();
  const employeeId = getCurrentEmployeeDisplayId();

  return `
    <style>${DISCIPLINE_PRINT_CSS}</style>
    <article class="print-discipline-report">
      <h1 class="print-discipline-title-bar">Employee Discipline Report</h1>
      <div class="print-discipline-inner">
        <div class="print-discipline-letterhead-wrap">
          ${orbisLetterheadHtml({
            subtitle: 'HR Intelligence & Operations',
            metaLines: [`<strong>Generated:</strong> ${esc(generated)}`],
          })}
        </div>

        <table class="print-discipline-info-table" aria-label="Employee and incident details">
          <tbody>
            ${printInfoRow('Employee', employeeName, 'Employee ID', employeeId)}
            ${printInfoRow('Incident Date', data.incidentDate, 'Issue Type', data.issueType)}
            <tr>
              <th scope="row">Discipline Level</th>
              <td colspan="3">${data.level ? esc(data.level) : '—'}</td>
            </tr>
            <tr>
              <th scope="row">Status</th>
              <td colspan="3">${data.status ? esc(data.status) : '—'}</td>
            </tr>
          </tbody>
        </table>

        ${printSection('Description of Incident', data.description)}
        ${printSection('Corrective Action Taken', data.actionTaken)}

        <section class="print-discipline-signatures" aria-label="Signatures">
          <h2 class="print-discipline-signatures-title">Signature Acknowledgement</h2>
          <div class="print-discipline-sig-grid">
            ${printSignatureBox('Employee Signature', data.employeeSignature, true)}
            ${printSignatureBox('Manager / Supervisor Signature', data.managerSignature, true)}
            ${printSignatureBox('Witness Signature (if applicable)', data.witnessSignature)}
            <div class="print-discipline-sig-box">
              <div class="print-discipline-sig-line print-discipline-sig-line--short"></div>
              <div class="print-discipline-sig-label">Witness Date</div>
            </div>
          </div>
          <div class="print-discipline-refused">${refusedMark} Employee refused to sign</div>
          <p class="print-discipline-disclaimer">
            Employee signature confirms receipt of this disciplinary action. It does not imply agreement with the action taken.
          </p>
        </section>

        <footer class="print-discipline-footer">
          Copyright © 2026 | BTW Global, LLC · Powered by Orbis
        </footer>
      </div>
    </article>
  `.trim();
}
