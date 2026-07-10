function esc(value: string): string {
  if (typeof window.esc === 'function') {
    return window.esc(value);
  }
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function mobileLoadingMarkup(message = 'Loading…'): string {
  return `
    <div class="orbis-mobile-loading" role="status" aria-live="polite">
      <span class="orbis-mobile-loading-spinner" aria-hidden="true"></span>
      <span>${esc(message)}</span>
    </div>`;
}

export function mobileEmptyMarkup(title: string, detail?: string): string {
  const detailHtml = detail ? `<p class="muted" style="margin: 8px 0 0">${esc(detail)}</p>` : '';
  return `
    <div class="orbis-mobile-empty">
      <strong>${esc(title)}</strong>
      ${detailHtml}
    </div>`;
}
