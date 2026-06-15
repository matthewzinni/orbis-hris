import { getCurrentUserAccess } from './access';

export const JANUS_MAILTO_BODY_MAX = 1200;

export function truncateForJanusMailto(text: string, max = JANUS_MAILTO_BODY_MAX): string {
  const trimmed = String(text || '').trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

export function resolveJanusSenderName(): string {
  const access = getCurrentUserAccess();
  const displayName = String(access?.display_name || '').trim();
  if (displayName) return displayName;

  const email = String(access?.email || '').trim();
  if (email) {
    const local = email.split('@')[0] || '';
    if (local) {
      return local
        .split(/[._-]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
    }
  }

  return 'BTW Global';
}

export function openJanusMailto(mailtoUrl: string): void {
  try {
    const link = document.createElement('a');
    link.href = mailtoUrl;
    link.rel = 'noopener noreferrer';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
  } catch {
    window.location.assign(mailtoUrl);
  }
}
