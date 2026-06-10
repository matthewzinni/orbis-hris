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
