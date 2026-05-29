/** Shared Orbis letterhead markup (print, exports, inline HTML). */

export type OrbisLetterheadOptions = {
  documentTitle?: string;
  subtitle?: string;
  metaLines?: string[];
  dark?: boolean;
};

const LOGO_SRC = '/orbis-logo.svg';

export function orbisLetterheadHtml(options: OrbisLetterheadOptions = {}): string {
  const {
    documentTitle = '',
    subtitle = 'HR Intelligence & Operations',
    metaLines = [],
    dark = false,
  } = options;

  const textColor = dark ? '#ffffff' : '#0f172a';
  const muted = dark ? 'rgba(255,255,255,0.72)' : '#64748b';
  const border = dark ? 'rgba(255,255,255,0.14)' : '#e2e8f0';
  const company = 'BTW Global, LLC';

  const metaHtml = metaLines
    .map(
      (line) =>
        `<div style="font-size:12px;color:${muted};line-height:1.5;">${line}</div>`
    )
    .join('');

  const titleHtml = documentTitle
    ? `<div style="margin-top:14px;font-size:18px;font-weight:700;color:${textColor};">${documentTitle}</div>`
    : '';

  return `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:24px;padding-bottom:16px;margin-bottom:18px;border-bottom:2px solid ${border};">
      <div style="display:flex;align-items:center;gap:14px;min-width:0;">
        <img src="${LOGO_SRC}" alt="" width="56" height="56" style="display:block;flex-shrink:0;" />
        <div>
          <div style="font-size:26px;font-weight:700;letter-spacing:0.32em;color:${textColor};line-height:1;">ORBIS</div>
          <div style="margin-top:6px;font-size:10px;font-weight:600;letter-spacing:0.28em;color:${muted};text-transform:uppercase;">BUILD • SOLVE • ELEVATE</div>
          <div style="margin-top:8px;font-size:12px;color:${muted};">${subtitle}</div>
          <div style="margin-top:4px;font-size:11px;color:${muted};">${company}</div>
          ${titleHtml}
        </div>
      </div>
      <div style="text-align:right;flex-shrink:0;">${metaHtml}</div>
    </div>
  `.trim();
}

export function orbisPrintFooterHtml(): string {
  return `
    <div style="margin-top:28px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;text-align:center;">
      Copyright © 2026 | BTW Global, LLC · Powered by Orbis
    </div>
  `.trim();
}
