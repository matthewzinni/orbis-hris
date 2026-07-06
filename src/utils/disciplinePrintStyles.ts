/** Self-contained discipline report print CSS (embedded in iframe — no external sheet dependency). */

export const DISCIPLINE_PRINT_CSS = `
  @page {
    size: letter portrait;
    margin: 0.45in;
  }

  html, body {
    margin: 0 !important;
    padding: 0 !important;
    background: #fff !important;
    color: #111827 !important;
    height: auto !important;
    overflow: visible !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  #printArea, #printContent {
    display: block !important;
    width: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
    background: #fff !important;
  }

  .print-discipline-report {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
    font-size: 10pt;
    line-height: 1.4;
    color: #111827;
    max-width: 7.25in;
    margin: 0 auto;
    background: #fff;
    border: 2px solid #1e3a5f;
    box-sizing: border-box;
  }

  .print-discipline-report * {
    box-sizing: border-box;
  }

  .print-discipline-inner {
    padding: 14px 16px 12px;
  }

  .print-discipline-title-bar {
    margin: 0;
    padding: 9px 16px;
    background: #1e3a5f;
    color: #fff;
    text-align: center;
    font-size: 12pt;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .print-discipline-letterhead-wrap {
    padding-bottom: 10px;
    margin-bottom: 12px;
    border-bottom: 2px solid #e2e8f0;
  }

  .print-discipline-info-table {
    width: 100%;
    border-collapse: collapse;
    margin: 0 0 12px;
    table-layout: fixed;
  }

  .print-discipline-info-table th,
  .print-discipline-info-table td {
    border: 1px solid #cbd5e1;
    padding: 6px 9px;
    vertical-align: top;
    text-align: left;
    word-break: break-word;
  }

  .print-discipline-info-table th {
    width: 22%;
    background: #f1f5f9;
    font-size: 7.5pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #475569;
  }

  .print-discipline-info-table td {
    width: 28%;
    font-size: 9.5pt;
    font-weight: 600;
    color: #111827;
  }

  .print-discipline-section {
    margin-bottom: 10px;
    border: 1px solid #cbd5e1;
    border-radius: 2px;
    overflow: hidden;
    page-break-inside: avoid;
    break-inside: avoid;
  }

  .print-discipline-section-head {
    margin: 0;
    padding: 5px 10px;
    background: #f1f5f9;
    border-bottom: 1px solid #cbd5e1;
    font-size: 7.5pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #475569;
  }

  .print-discipline-section-body {
    margin: 0;
    padding: 8px 10px;
    font-size: 9.5pt;
    line-height: 1.45;
    color: #111827;
    white-space: pre-wrap;
    word-break: break-word;
    min-height: 2.5em;
  }

  .print-discipline-signatures {
    margin-top: 12px;
    padding-top: 10px;
    border-top: 2px solid #e2e8f0;
    page-break-inside: avoid;
    break-inside: avoid;
  }

  .print-discipline-signatures-title {
    margin: 0 0 8px;
    font-size: 7.5pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #475569;
  }

  .print-discipline-sig-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 14px 18px;
  }

  .print-discipline-sig-box {
    border: 1px solid #cbd5e1;
    border-radius: 2px;
    padding: 8px 10px 6px;
    min-height: 72px;
    background: #fafbfc;
  }

  .print-discipline-sig-box--wide {
    grid-column: 1 / -1;
  }

  .print-discipline-sig-line {
    border-bottom: 1px solid #111827;
    height: 28px;
    margin-bottom: 4px;
  }

  .print-discipline-sig-image-wrap {
    height: 28px;
    margin-bottom: 4px;
    display: flex;
    align-items: flex-end;
    overflow: hidden;
  }

  .print-discipline-sig-image {
    display: block;
    max-height: 28px;
    max-width: 100%;
    object-fit: contain;
    object-position: left bottom;
  }

  .print-discipline-sig-line--short {
    width: 55%;
    margin-top: 8px;
  }

  .print-discipline-sig-label {
    font-size: 8pt;
    color: #374151;
    font-weight: 600;
  }

  .print-discipline-refused {
    margin: 8px 0 4px;
    padding: 6px 10px;
    border: 1px solid #cbd5e1;
    border-radius: 2px;
    background: #fff;
    font-size: 9pt;
    color: #374151;
  }

  .print-discipline-disclaimer {
    margin: 8px 0 0;
    font-size: 8pt;
    color: #64748b;
    line-height: 1.35;
    font-style: italic;
  }

  .print-discipline-footer {
    margin-top: 10px;
    padding-top: 8px;
    border-top: 1px solid #e2e8f0;
    font-size: 7.5pt;
    color: #94a3b8;
    text-align: center;
  }
`.trim();
