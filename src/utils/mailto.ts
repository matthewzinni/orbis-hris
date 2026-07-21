/** Build mailto query string with %20 spaces (Apple Mail treats + literally). */
export function buildMailtoQuery(params: {
  cc?: string;
  bcc?: string;
  subject?: string;
  body?: string;
}): string {
  const parts: string[] = [];

  if (params.cc) parts.push(`cc=${encodeURIComponent(params.cc)}`);
  if (params.bcc) parts.push(`bcc=${encodeURIComponent(params.bcc)}`);
  if (params.subject) parts.push(`subject=${encodeURIComponent(params.subject)}`);
  if (params.body) parts.push(`body=${encodeURIComponent(params.body)}`);

  return parts.join('&');
}

export function buildMailtoUrl(
  recipients: string | string[],
  params: {
    cc?: string;
    bcc?: string;
    subject?: string;
    body?: string;
  }
): string {
  const to = Array.isArray(recipients) ? recipients.join(',') : recipients;
  const query = buildMailtoQuery(params);
  return query ? `mailto:${to}?${query}` : `mailto:${to}`;
}

/**
 * Chrome / Safari often ignore mailto from a detached or immediately-removed <a>,
 * and silently fail when the encoded URL is very long. Prefer a same-tab navigation
 * under the user gesture, with a short-lived anchor fallback.
 */
export function openMailtoUrl(mailtoUrl: string): void {
  const href = String(mailtoUrl || '').trim();
  if (!href.startsWith('mailto:')) {
    throw new Error('Invalid email link.');
  }

  // Prefer location.assign — keeps the click user-gesture and works when no
  // visible mail client handler is registered for synthetic <a> clicks.
  try {
    window.location.assign(href);
    return;
  } catch {
    // fall through
  }

  const link = document.createElement('a');
  link.href = href;
  link.rel = 'noopener noreferrer';
  link.target = '_self';
  link.style.position = 'fixed';
  link.style.left = '-9999px';
  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => link.remove(), 0);
}
