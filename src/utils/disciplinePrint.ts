import { esc, getCurrentEmployeeDisplayId, getCurrentEmployeeDisplayName, nl2br, safeGet } from './helpers';

export type DisciplinePrintData = {
  incidentDate: string;
  issueType: string;
  level: string;
  status: string;
  description: string;
  actionTaken: string;
  refusedToSign: boolean;
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
}): DisciplinePrintData {
  return {
    incidentDate: String(record.incident_date || '').trim(),
    issueType: String(record.issue_type || '').trim(),
    level: String(record.discipline_level || '').trim(),
    status: String(record.report_status || '').trim(),
    description: String(record.description || '').trim(),
    actionTaken: String(record.action_taken || '').trim(),
    refusedToSign: Boolean(record.refused_to_sign),
  };
}

function printFieldCell(label: string, value: string): string {
  return `
    <div class="print-discipline-field">
      <span class="print-discipline-field-label">${esc(label)}</span>
      <span class="print-discipline-field-value">${value ? esc(value) : '—'}</span>
    </div>
  `;
}

function printTextBlock(title: string, value: string): string {
  const body = value ? nl2br(value) : '—';
  return `
    <section class="print-discipline-block">
      <h2 class="print-discipline-block-title">${esc(title)}</h2>
      <div class="print-discipline-block-body">${body}</div>
    </section>
  `;
}

export function buildDisciplineReportPrintHtml(data: DisciplinePrintData): string {
  const generated = new Date().toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const refusedMark = data.refusedToSign ? '☑' : '☐';

  return `
    <article class="print-discipline-report">
      <header class="print-discipline-letterhead">
        <div class="print-discipline-letterhead-brand">
          <img src="/orbis-logo.svg" alt="" width="40" height="40" />
          <div>
            <div class="print-discipline-letterhead-title">ORBIS</div>
            <div class="print-discipline-letterhead-tagline">Build • Solve • Elevate</div>
            <div class="print-discipline-letterhead-subtitle">HR Intelligence &amp; Operations</div>
            <div class="print-discipline-letterhead-company">BTW Global, LLC</div>
            <div class="print-discipline-letterhead-doc-title">Discipline Report</div>
          </div>
        </div>
        <div class="print-discipline-letterhead-meta">
          <div><strong>Generated:</strong> ${esc(generated)}</div>
        </div>
      </header>

      <section class="print-discipline-meta-grid" aria-label="Employee and incident details">
        ${printFieldCell('Employee', getCurrentEmployeeDisplayName())}
        ${printFieldCell('Employee ID', getCurrentEmployeeDisplayId())}
        ${printFieldCell('Incident Date', data.incidentDate)}
        ${printFieldCell('Issue Type', data.issueType)}
        ${printFieldCell('Discipline Level', data.level)}
        ${printFieldCell('Status', data.status)}
      </section>

      ${printTextBlock('Description', data.description)}
      ${printTextBlock('Action Taken', data.actionTaken)}

      <section class="print-discipline-signatures" aria-label="Signatures">
        <div class="print-discipline-sig-row">
          <div class="print-discipline-sig-cell">
            <div class="print-discipline-sig-line"></div>
            <div class="print-discipline-sig-label">Employee Signature</div>
            <div class="print-discipline-sig-line print-discipline-sig-line--date"></div>
            <div class="print-discipline-sig-label">Date</div>
          </div>
          <div class="print-discipline-sig-cell">
            <div class="print-discipline-sig-line"></div>
            <div class="print-discipline-sig-label">Manager Signature</div>
            <div class="print-discipline-sig-line print-discipline-sig-line--date"></div>
            <div class="print-discipline-sig-label">Date</div>
          </div>
        </div>
        <div class="print-discipline-refused">${refusedMark} Employee refused to sign</div>
        <div class="print-discipline-sig-row">
          <div class="print-discipline-sig-cell">
            <div class="print-discipline-sig-line"></div>
            <div class="print-discipline-sig-label">Witness Signature</div>
          </div>
          <div class="print-discipline-sig-cell">
            <div class="print-discipline-sig-line"></div>
            <div class="print-discipline-sig-label">Witness Date</div>
          </div>
        </div>
        <p class="print-discipline-disclaimer">
          Employee signature confirms receipt of this disciplinary action. It does not imply agreement.
        </p>
      </section>

      <footer class="print-discipline-footer">
        Copyright © 2026 | BTW Global, LLC · Powered by Orbis
      </footer>
    </article>
  `.trim();
}
