import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from 'pdf-lib';
import { supabaseClient } from './supabaseClient';
import type { SignatureFormType } from './signatureRequests';
import { buildReviewAcknowledgmentSummary } from './reviewAcknowledgmentSummary';

type ErRecord = Record<string, unknown>;

type AcknowledgmentDocument = {
  title: string;
  subtitle: string;
  date: string;
  summary: string;
  employeeName: string;
  employeeSignature?: string;
};

const TABLE_BY_FORM: Record<SignatureFormType, string> = {
  discipline: 'discipline_reports',
  incident: 'incident_reports',
  review: 'employee_reviews',
};

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 54;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
/** Reserve bottom of the last page for the signature block (always visible). */
const SIGNATURE_BLOCK_HEIGHT = 280;

const PDF_UNICODE_REPLACEMENTS: Array<[string, string]> = [
  ['\u2192', '->'],
  ['\u2190', '<-'],
  ['\u2194', '<->'],
  ['\u2022', '-'],
  ['\u00b7', '-'],
  ['\u2013', '-'],
  ['\u2014', '-'],
  ['\u2018', "'"],
  ['\u2019', "'"],
  ['\u201c', '"'],
  ['\u201d', '"'],
  ['\u2026', '...'],
  ['\u00a0', ' '],
  ['\u200b', ''],
];

function toPdfSafeText(value: unknown): string {
  let text = String(value ?? '');
  PDF_UNICODE_REPLACEMENTS.forEach(([from, to]) => {
    text = text.split(from).join(to);
  });

  return text
    .split('')
    .map((char) => {
      const code = char.charCodeAt(0);
      if (code >= 0x20 && code <= 0x7e) return char;
      if (code >= 0xa0 && code <= 0xff) return char;
      if (code === 0x09 || code === 0x0a || code === 0x0d) return char;
      return '?';
    })
    .join('');
}

function formatDateLabel(value: unknown): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw.slice(0, 10);
  return parsed.toLocaleDateString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1] || '';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function downloadPdf(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  const paragraphs = String(text || '').split(/\n/);
  const lines: string[] = [];

  paragraphs.forEach((paragraph, index) => {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (!words.length) {
      if (index < paragraphs.length - 1) lines.push('');
      return;
    }

    let line = '';
    words.forEach((word) => {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
        line = candidate;
        return;
      }
      if (line) lines.push(line);
      line = word;
    });
    if (line) lines.push(line);
    if (index < paragraphs.length - 1) lines.push('');
  });

  return lines.length ? lines : [''];
}

function buildSummary(formType: SignatureFormType, record: ErRecord): string {
  if (formType === 'discipline') {
    const parts = [record.description, record.action_taken]
      .map((value) => String(value || '').trim())
      .filter(Boolean);
    return parts.join('\n\n');
  }

  if (formType === 'incident') {
    const parts = [record.description, record.follow_up, record.corrective_action]
      .map((value) => String(value || '').trim())
      .filter(Boolean);
    return parts.join('\n\n');
  }

  return buildReviewAcknowledgmentSummary(record);
}

function buildDocumentMeta(
  formType: SignatureFormType,
  record: ErRecord,
  employeeName: string
): AcknowledgmentDocument {
  const safeName = toPdfSafeText(employeeName);

  const signature = String(record.employee_signature || '').trim();
  const employeeSignature = signature.startsWith('data:image/') ? signature : undefined;

  if (formType === 'discipline') {
    return {
      title: 'Discipline acknowledgment',
      subtitle: toPdfSafeText(String(record.issue_type || 'Discipline report').trim()),
      date: toPdfSafeText(formatDateLabel(record.incident_date || record.created_at)),
      summary: toPdfSafeText(buildSummary(formType, record)),
      employeeName: safeName,
      employeeSignature,
    };
  }

  if (formType === 'incident') {
    return {
      title: 'Incident acknowledgment',
      subtitle: toPdfSafeText(
        String(record.incident_type || record.issue_type || 'Incident report').trim()
      ),
      date: toPdfSafeText(formatDateLabel(record.incident_date || record.created_at)),
      summary: toPdfSafeText(buildSummary(formType, record)),
      employeeName: safeName,
      employeeSignature,
    };
  }

  return {
    title: 'Performance review acknowledgment',
    subtitle: toPdfSafeText(String(record.review_type || 'Performance review').trim()),
    date: toPdfSafeText(formatDateLabel(record.review_date || record.created_at)),
    summary: toPdfSafeText(buildSummary(formType, record)),
    employeeName: safeName,
    employeeSignature,
  };
}

function drawHeader(page: PDFPage, doc: AcknowledgmentDocument, regular: PDFFont, bold: PDFFont): number {
  let y = PAGE_HEIGHT - MARGIN;

  page.drawText('Orbis - BTW Global', {
    x: MARGIN,
    y,
    size: 11,
    font: regular,
    color: rgb(0.42, 0.447, 0.502),
  });
  y -= 22;

  page.drawText(doc.title, {
    x: MARGIN,
    y,
    size: 20,
    font: bold,
    color: rgb(0.067, 0.094, 0.153),
  });
  y -= 18;

  const metaLine = [doc.subtitle, doc.date].filter(Boolean).join(' - ');
  page.drawText(metaLine, {
    x: MARGIN,
    y,
    size: 11,
    font: regular,
    color: rgb(0.42, 0.447, 0.502),
  });

  return y - 28;
}

function drawSummaryPages(
  pdfDoc: PDFDocument,
  page: PDFPage,
  startY: number,
  summary: string,
  regular: PDFFont,
  reserveBottom: number
): { page: PDFPage; y: number } {
  const fontSize = 11;
  const lineHeight = 15;
  const padding = 12;
  const innerWidth = CONTENT_WIDTH - padding * 2;
  const lines = wrapText(summary || 'No document summary on file.', regular, fontSize, innerWidth);

  let currentPage = page;
  let y = startY;
  let lineIndex = 0;

  while (lineIndex < lines.length) {
    const minY = MARGIN + reserveBottom;
    const available = y - minY - padding * 2;
    const maxLines = Math.max(1, Math.floor(available / lineHeight));
    const chunk = lines.slice(lineIndex, lineIndex + maxLines);
    const boxHeight = chunk.length * lineHeight + padding * 2;

    currentPage.drawRectangle({
      x: MARGIN,
      y: y - boxHeight,
      width: CONTENT_WIDTH,
      height: boxHeight,
      color: rgb(0.973, 0.98, 0.988),
      borderColor: rgb(0.886, 0.91, 0.941),
      borderWidth: 1,
    });

    let textY = y - padding - fontSize;
    chunk.forEach((line) => {
      if (line) {
        currentPage.drawText(line, {
          x: MARGIN + padding,
          y: textY,
          size: fontSize,
          font: regular,
          color: rgb(0.122, 0.161, 0.216),
        });
      }
      textY -= lineHeight;
    });

    lineIndex += chunk.length;
    y -= boxHeight + 16;

    if (lineIndex < lines.length) {
      currentPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
    }
  }

  return { page: currentPage, y };
}

function drawDashedSignatureFrame(
  page: PDFPage,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  page.drawRectangle({
    x,
    y,
    width,
    height,
    borderColor: rgb(0.796, 0.835, 0.882),
    borderWidth: 1,
    color: rgb(1, 1, 1),
  });

  const dash = 6;
  const gap = 4;
  const right = x + width;
  const top = y + height;

  for (let px = x; px < right; px += dash + gap) {
    const w = Math.min(dash, right - px);
    page.drawRectangle({ x: px, y, width: w, height: 1, color: rgb(0.796, 0.835, 0.882) });
    page.drawRectangle({ x: px, y: top - 1, width: w, height: 1, color: rgb(0.796, 0.835, 0.882) });
  }
  for (let py = y; py < top; py += dash + gap) {
    const h = Math.min(dash, top - py);
    page.drawRectangle({ x, y: py, width: 1, height: h, color: rgb(0.796, 0.835, 0.882) });
    page.drawRectangle({ x: right - 1, y: py, width: 1, height: h, color: rgb(0.796, 0.835, 0.882) });
  }

}

async function drawSignatureBlock(
  pdfDoc: PDFDocument,
  page: PDFPage,
  doc: AcknowledgmentDocument,
  regular: PDFFont,
  bold: PDFFont
): Promise<void> {
  const blockTop = MARGIN + SIGNATURE_BLOCK_HEIGHT;
  const signed = Boolean(doc.employeeSignature);

  page.drawLine({
    start: { x: MARGIN, y: blockTop + 8 },
    end: { x: MARGIN + CONTENT_WIDTH, y: blockTop + 8 },
    thickness: 1,
    color: rgb(0.886, 0.91, 0.941),
  });

  page.drawText('Digital signature', {
    x: MARGIN,
    y: blockTop - 4,
    size: 13,
    font: bold,
    color: rgb(0.067, 0.094, 0.153),
  });

  let y = blockTop - 28;

  page.drawText(
    signed
      ? 'Signed electronically in Orbis.'
      : 'Pending employee signature via signing link.',
    {
      x: MARGIN,
      y,
      size: 9,
      font: regular,
      color: rgb(0.42, 0.447, 0.502),
      maxWidth: CONTENT_WIDTH,
    }
  );
  y -= 22;

  page.drawText(
    signed
      ? '[x] I have reviewed this document and agree to sign electronically.'
      : '[ ] I have reviewed this document and agree to sign electronically.',
    {
      x: MARGIN,
      y,
      size: 10,
      font: regular,
      color: rgb(0.122, 0.161, 0.216),
      maxWidth: CONTENT_WIDTH,
    }
  );
  y -= 26;

  page.drawText('FULL LEGAL NAME', {
    x: MARGIN,
    y,
    size: 8,
    font: bold,
    color: rgb(0.42, 0.447, 0.502),
  });
  y -= 14;

  page.drawText(doc.employeeName || '', {
    x: MARGIN,
    y: y - 2,
    size: 12,
    font: regular,
    color: rgb(0.067, 0.094, 0.153),
  });
  y -= 10;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: MARGIN + CONTENT_WIDTH, y },
    thickness: 1,
    color: rgb(0.067, 0.094, 0.153),
  });
  y -= 24;

  page.drawText('EMPLOYEE SIGNATURE', {
    x: MARGIN,
    y,
    size: 8,
    font: bold,
    color: rgb(0.42, 0.447, 0.502),
  });

  const signatureHeight = 96;
  const sigBoxY = y - 8 - signatureHeight;

  if (signed && doc.employeeSignature) {
    page.drawRectangle({
      x: MARGIN,
      y: sigBoxY,
      width: CONTENT_WIDTH,
      height: signatureHeight,
      borderColor: rgb(0.796, 0.835, 0.882),
      borderWidth: 1,
      color: rgb(1, 1, 1),
    });

    const bytes = dataUrlToBytes(doc.employeeSignature);
    const image = doc.employeeSignature.includes('image/png')
      ? await pdfDoc.embedPng(bytes)
      : await pdfDoc.embedJpg(bytes);
    const dims = image.scale(1);
    const maxW = CONTENT_WIDTH - 24;
    const maxH = signatureHeight - 16;
    const scale = Math.min(maxW / dims.width, maxH / dims.height, 1);
    const width = dims.width * scale;
    const height = dims.height * scale;

    page.drawImage(image, {
      x: MARGIN + (CONTENT_WIDTH - width) / 2,
      y: sigBoxY + (signatureHeight - height) / 2,
      width,
      height,
    });
  } else {
    drawDashedSignatureFrame(page, MARGIN, sigBoxY, CONTENT_WIDTH, signatureHeight);
    page.drawText('Awaiting Orbis signature', {
      x: MARGIN + CONTENT_WIDTH / 2 - 52,
      y: sigBoxY + 12,
      size: 9,
      font: regular,
      color: rgb(0.58, 0.639, 0.722),
    });
  }

  y = sigBoxY - 20;

  page.drawText('DATE SIGNED', {
    x: MARGIN,
    y,
    size: 8,
    font: bold,
    color: rgb(0.42, 0.447, 0.502),
  });
  y -= 14;

  if (signed) {
    page.drawText(toPdfSafeText(formatDateLabel(new Date().toISOString())), {
      x: MARGIN,
      y: y - 2,
      size: 11,
      font: regular,
      color: rgb(0.067, 0.094, 0.153),
    });
  }

  y -= 10;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: MARGIN + 220, y },
    thickness: 1,
    color: rgb(0.067, 0.094, 0.153),
  });

  const footer =
    'Employee signature confirms receipt of this document. It does not imply agreement. ' +
    'Signatures are collected in the Orbis employee portal.';
  let footerY = MARGIN + 8;
  wrapText(footer, regular, 8, CONTENT_WIDTH).forEach((line) => {
    page.drawText(line, {
      x: MARGIN,
      y: footerY,
      size: 8,
      font: regular,
      color: rgb(0.42, 0.447, 0.502),
    });
    footerY += 11;
  });
}

async function buildAcknowledgmentPdfBytes(doc: AcknowledgmentDocument): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = drawHeader(page, doc, regular, bold);

  const summaryLayout = drawSummaryPages(
    pdfDoc,
    page,
    y,
    doc.summary,
    regular,
    SIGNATURE_BLOCK_HEIGHT + 24
  );
  page = summaryLayout.page;
  y = summaryLayout.y;

  const minYForSignature = MARGIN + SIGNATURE_BLOCK_HEIGHT + 16;
  if (y < minYForSignature) {
    page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  }

  await drawSignatureBlock(pdfDoc, page, doc, regular, bold);

  return pdfDoc.save();
}

function buildPdfFilename(formType: SignatureFormType, doc: AcknowledgmentDocument): string {
  const slug = doc.employeeName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const datePart = doc.date.replace(/\//g, '-');
  return `${formType}-acknowledgment-${datePart || 'document'}${slug ? `-${slug}` : ''}.pdf`;
}

async function resolveEmployeeName(employeeId: string): Promise<string> {
  const id = String(employeeId || '').trim();
  if (!id) return '';

  const { data } = await supabaseClient
    .from('employees')
    .select('first_name, last_name, preferred_name')
    .eq('id', id)
    .maybeSingle();

  if (!data) return '';

  const row = data as { first_name?: string; last_name?: string; preferred_name?: string };
  const preferred = String(row.preferred_name || '').trim();
  const legal = `${String(row.first_name || '').trim()} ${String(row.last_name || '').trim()}`.trim();
  return preferred || legal;
}

export async function openErAcknowledgmentPdf(
  formType: SignatureFormType,
  recordId: string
): Promise<void> {
  const table = TABLE_BY_FORM[formType];
  const id = String(recordId || '').trim();
  if (!id) {
    throw new Error('Save the record before generating a PDF.');
  }

  const { data, error } = await supabaseClient.from(table).select('*').eq('id', id).maybeSingle();

  if (error || !data) {
    throw new Error(error?.message || 'Could not load the record for PDF export.');
  }

  const record = data as ErRecord;
  const employeeName = await resolveEmployeeName(String(record.employee_id || ''));
  const document = buildDocumentMeta(formType, record, employeeName);

  const bytes = await buildAcknowledgmentPdfBytes(document);
  downloadPdf(bytes, buildPdfFilename(formType, document));
}
