import { isAdminUser } from '../services/access';
import {
  generateStayInterviewOrgThemes,
  StayInterviewOrgThemesError,
} from '../services/stayInterviewOrgThemes';
import {
  openStayThemesLeadershipEmail,
  type StayThemesEmailMeta,
} from '../services/stayInterviewThemesEmail';
import '../styles/stay-interview-insights.css';

let lastThemesEmailMeta: StayThemesEmailMeta | null = null;

function esc(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function showToast(message: string, type = 'success'): void {
  if (typeof window.showToast === 'function') {
    window.showToast(message, type);
    return;
  }
  console.log(`[${type}] ${message}`);
}

function readMonthsBack(): number {
  const raw = Number.parseInt(
    String(document.getElementById('stayOrgThemesMonths')?.value || '12'),
    10
  );
  if (!Number.isFinite(raw) || raw < 1) return 12;
  return Math.min(36, raw);
}

function setOrgThemesStatus(message: string, tone: 'muted' | 'error' | 'success' = 'muted'): void {
  const el = document.getElementById('stayOrgThemesStatus');
  if (!el) return;
  el.textContent = message;
  el.classList.remove('stay-org-themes-status--error', 'stay-org-themes-status--success');
  if (tone === 'error') el.classList.add('stay-org-themes-status--error');
  if (tone === 'success') el.classList.add('stay-org-themes-status--success');
}

function renderOrgThemesReport(text: string, meta: { source: string; interviewCount: number }): void {
  const pre = document.getElementById('stayOrgThemesReport');
  const wrap = document.getElementById('stayOrgThemesReportWrap');
  const badge = document.getElementById('stayOrgThemesSourceBadge');

  if (!pre || !wrap) return;

  pre.textContent = text;
  wrap.classList.remove('hidden');
  document.getElementById('stayOrgThemesCopyBtn')?.classList.remove('hidden');
  document.getElementById('stayOrgThemesEmailBtn')?.classList.remove('hidden');

  if (badge) {
    const label =
      meta.source === 'ai'
        ? `AI synthesis · ${meta.interviewCount} interviews`
        : `Template rollup · ${meta.interviewCount} interviews (deploy AI for richer themes)`;
    badge.textContent = label;
  }
}

async function runOrgThemesGeneration(): Promise<void> {
  if (!isAdminUser()) {
    showToast('Admin access required for stay interview themes.', 'error');
    return;
  }

  const btn = document.getElementById('stayOrgThemesGenerateBtn') as HTMLButtonElement | null;
  const monthsBack = readMonthsBack();

  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Analyzing…';
  }

  setOrgThemesStatus('Loading interviews and synthesizing themes…');

  try {
    if (!getScopedEmployeeCount() && typeof window.loadEmployees === 'function') {
      await window.loadEmployees();
    }

    const result = await generateStayInterviewOrgThemes({ monthsBack });

    lastThemesEmailMeta = {
      monthsBack,
      interviewCount: result.interviewCount,
      dateFrom: result.dateFrom,
      dateTo: result.dateTo,
      source: result.source,
    };

    renderOrgThemesReport(result.report, {
      source: result.source,
      interviewCount: result.interviewCount,
    });

    const sourceNote =
      result.source === 'ai'
        ? 'AI themes ready for leadership review.'
        : 'Template themes generated. Run: npx supabase functions deploy analyze-stay-themes';

    setOrgThemesStatus(
      `${sourceNote} ${result.interviewCount} interview(s), ${result.dateFrom} – ${result.dateTo}.`,
      'success'
    );
    showToast('Stay interview themes report generated.');
  } catch (err) {
    const message =
      err instanceof StayInterviewOrgThemesError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'Could not generate themes.';

    setOrgThemesStatus(message, 'error');
    showToast(message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Generate themes';
    }
  }
}

function getScopedEmployeeCount(): number {
  const scoped = (window as { EMPLOYEES?: unknown[] }).EMPLOYEES;
  if (Array.isArray(scoped) && scoped.length) return scoped.length;
  return Array.isArray(window.currentEmployeeRoster) ? window.currentEmployeeRoster.length : 0;
}

function emailOrgThemesToLeadership(): void {
  const pre = document.getElementById('stayOrgThemesReport');
  const text = pre?.textContent?.trim() || '';

  if (!text) {
    showToast('Generate a report first.', 'error');
    return;
  }

  if (!lastThemesEmailMeta) {
    showToast('Report metadata missing — generate themes again, then email.', 'error');
    return;
  }

  try {
    const { recipients, senderEmail } = openStayThemesLeadershipEmail(text, lastThemesEmailMeta);
    showToast(
      `Opening email to ${recipients.join(', ')} (Cc: ${senderEmail}).`
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not open email.';
    showToast(message, 'error');
  }
}

function copyOrgThemesReport(): void {
  const pre = document.getElementById('stayOrgThemesReport');
  const text = pre?.textContent?.trim() || '';

  if (!text) {
    showToast('Generate a report first.', 'error');
    return;
  }

  void navigator.clipboard.writeText(text).then(
    () => showToast('Themes report copied to clipboard.'),
    () => showToast('Could not copy — select the report text manually.', 'error')
  );
}

function bindStayInterviewOrgInsightsEvents(): void {
  if ((window as { __stayOrgThemesBound?: boolean }).__stayOrgThemesBound) {
    return;
  }

  (window as { __stayOrgThemesBound?: boolean }).__stayOrgThemesBound = true;

  document.getElementById('stayOrgThemesGenerateBtn')?.addEventListener('click', () => {
    void runOrgThemesGeneration();
  });

  document.getElementById('stayOrgThemesCopyBtn')?.addEventListener('click', () => {
    copyOrgThemesReport();
  });

  document.getElementById('stayOrgThemesEmailBtn')?.addEventListener('click', () => {
    emailOrgThemesToLeadership();
  });
}

export function initStayInterviewOrgInsights(): void {
  bindStayInterviewOrgInsightsEvents();
}

bindStayInterviewOrgInsightsEvents();

declare global {
  interface Window {
    initStayInterviewOrgInsights?: () => void;
  }
}

window.initStayInterviewOrgInsights = initStayInterviewOrgInsights;
