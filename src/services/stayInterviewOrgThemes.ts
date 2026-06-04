import {
  FunctionsHttpError,
  FunctionsRelayError,
} from '@supabase/supabase-js';
import { supabaseClient } from './supabaseClient';
import {
  STAY_INTERVIEW_QUESTION_LABELS,
  type StayInterviewSummaryContext,
} from './stayInterviewSummary';

export class StayInterviewOrgThemesError extends Error {
  readonly code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = 'StayInterviewOrgThemesError';
    this.code = code;
  }
}

export type StayInterviewOrgThemesOptions = {
  monthsBack?: number;
  maxInterviews?: number;
};

export type StayInterviewOrgThemesResult = {
  report: string;
  source: 'ai' | 'template';
  interviewCount: number;
  dateFrom: string;
  dateTo: string;
};

type StayInterviewDbRow = {
  id?: string;
  employee_id?: string;
  interview_date?: string;
  interview_type?: string;
  q1?: string;
  q2?: string;
  q3?: string;
  q4?: string;
  q5?: string;
  q6?: string;
  q7?: string;
  manager_summary?: string;
  created_at?: string;
};

type EmployeeRow = Record<string, unknown>;

type OrgThemesInterviewPacket = {
  label: string;
  department: string;
  interviewDate: string;
  interviewType: string;
  responses: { question: string; answer: string }[];
};

export type OrgThemesInvokePayload = {
  dateFrom: string;
  dateTo: string;
  interviewCount: number;
  departmentsRepresented: string[];
  interviews: OrgThemesInterviewPacket[];
};

const EMPTY_ANSWERS =
  /^(n\/?a|na|none|nothing|no comment|not applicable|—|-|\.)$/i;

const MAX_ANSWER_CHARS = 400;
const DEFAULT_MONTHS_BACK = 12;
const DEFAULT_MAX_INTERVIEWS = 40;

const Q_FIELDS = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7'] as const;

function cleanAnswer(value: string): string {
  const text = String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '';
  if (EMPTY_ANSWERS.test(text)) return '';
  if (text.length > MAX_ANSWER_CHARS) {
    return `${text.slice(0, MAX_ANSWER_CHARS)}…`;
  }
  return text;
}

function isoDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function parseInterviewSortDate(row: StayInterviewDbRow): string {
  const interviewDate = String(row.interview_date || '').trim();
  if (interviewDate) return interviewDate;
  return String(row.created_at || '').trim().slice(0, 10);
}

function buildResponsesFromRow(row: StayInterviewDbRow): { question: string; answer: string }[] {
  const responses: { question: string; answer: string }[] = [];

  Q_FIELDS.forEach((field, index) => {
    const answer = cleanAnswer(String(row[field] || ''));
    if (!answer) return;
    responses.push({
      question: STAY_INTERVIEW_QUESTION_LABELS[index] || `Question ${index + 1}`,
      answer,
    });
  });

  const summary = cleanAnswer(String(row.manager_summary || ''));
  if (summary) {
    responses.push({
      question: 'Prior manager / HR summary (if recorded)',
      answer: summary,
    });
  }

  return responses;
}

function getEmployeeDepartmentMap(): Map<string, string> {
  const map = new Map<string, string>();
  const roster =
    (window as { EMPLOYEES?: EmployeeRow[] }).EMPLOYEES ||
    (Array.isArray(window.currentEmployeeRoster) ? window.currentEmployeeRoster : []);

  roster.forEach((employee) => {
    const id = String(employee.id || employee.employee_id || '').trim();
    if (!id) return;
    const department = String(employee.department || employee.dept || 'Unassigned').trim() || 'Unassigned';
    map.set(id, department);
  });

  return map;
}

export async function loadStayInterviewOrgThemesPayload(
  options: StayInterviewOrgThemesOptions = {}
): Promise<OrgThemesInvokePayload> {
  const monthsBack = Math.min(36, Math.max(1, options.monthsBack ?? DEFAULT_MONTHS_BACK));
  const maxInterviews = Math.min(60, Math.max(5, options.maxInterviews ?? DEFAULT_MAX_INTERVIEWS));

  const dateTo = new Date();
  const dateFrom = new Date(dateTo);
  dateFrom.setMonth(dateFrom.getMonth() - monthsBack);
  const dateFromIso = isoDateOnly(dateFrom);
  const dateToIso = isoDateOnly(dateTo);

  const { data, error } = await supabaseClient
    .from('stay_interviews')
    .select(
      'id, employee_id, interview_date, interview_type, q1, q2, q3, q4, q5, q6, q7, manager_summary, created_at'
    )
    .order('interview_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(150);

  if (error) {
    throw new StayInterviewOrgThemesError(error.message || 'Could not load stay interviews.');
  }

  const deptMap = getEmployeeDepartmentMap();
  const rows = (data || []) as StayInterviewDbRow[];

  const withContent = rows
    .map((row) => {
      const responses = buildResponsesFromRow(row);
      return { row, responses, sortDate: parseInterviewSortDate(row) };
    })
    .filter((item) => item.responses.length > 0 && item.sortDate >= dateFromIso)
    .sort((a, b) => (b.sortDate > a.sortDate ? 1 : b.sortDate < a.sortDate ? -1 : 0));

  const selected = withContent.slice(0, maxInterviews);
  const departmentSet = new Set<string>();

  const interviews: OrgThemesInterviewPacket[] = selected.map((item, index) => {
    const employeeId = String(item.row.employee_id || '').trim();
    const department = deptMap.get(employeeId) || 'Unassigned';
    departmentSet.add(department);

    return {
      label: `Interview ${index + 1}`,
      department,
      interviewDate: String(item.row.interview_date || '').trim(),
      interviewType: String(item.row.interview_type || '').trim() || 'Stay Interview',
      responses: item.responses,
    };
  });

  if (!interviews.length) {
    throw new StayInterviewOrgThemesError(
      `No stay interviews with responses found in the last ${monthsBack} months. Complete interviews with Q&A first.`
    );
  }

  return {
    dateFrom: dateFromIso,
    dateTo: dateToIso,
    interviewCount: interviews.length,
    departmentsRepresented: [...departmentSet].sort((a, b) => a.localeCompare(b)),
    interviews,
  };
}

async function describeInvokeFailure(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    const res = error.context as Response;
    const status = res.status;
    let detail = '';
    try {
      const contentType = res.headers.get('content-type') || '';
      const clone = res.clone();
      if (contentType.includes('application/json')) {
        const json = (await clone.json()) as { error?: string; message?: string };
        detail =
          (typeof json?.error === 'string' && json.error) ||
          (typeof json?.message === 'string' && json.message) ||
          '';
      } else {
        detail = (await clone.text()).trim().slice(0, 240);
      }
    } catch {
      detail = '';
    }
    const suffix = detail ? `: ${detail}` : '.';
    return `Edge function HTTP ${status}${suffix}`;
  }

  if (error instanceof FunctionsRelayError) {
    return 'Supabase relay error (could not run the edge function). Try again or check Supabase status.';
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Could not reach AI themes service.';
}

export async function requestStayInterviewOrgThemesAi(
  payload: OrgThemesInvokePayload
): Promise<string> {
  const { data, error } = await supabaseClient.functions.invoke('analyze-stay-themes', {
    body: payload,
  });

  if (error) {
    throw new StayInterviewOrgThemesError(await describeInvokeFailure(error));
  }

  const body = (data || {}) as { report?: string; error?: string };

  if (body.error) {
    throw new StayInterviewOrgThemesError(body.error);
  }

  const report = String(body.report || '').trim();
  if (!report) {
    throw new StayInterviewOrgThemesError('AI returned an empty themes report.');
  }

  return report;
}

/** Rule-based synthesis when OpenAI / edge function is unavailable. */
export function buildStayInterviewOrgThemesTemplate(payload: OrgThemesInvokePayload): string {
  const positives: string[] = [];
  const concerns: string[] = [];
  const retention: string[] = [];
  const support: string[] = [];
  const byDept = new Map<string, { positives: number; concerns: number }>();

  payload.interviews.forEach((interview) => {
    const dept = interview.department || 'Unassigned';
    const bucket = byDept.get(dept) || { positives: 0, concerns: 0 };
    byDept.set(dept, bucket);

    interview.responses.forEach((item, index) => {
      const answer = item.answer;
      if (index <= 1) {
        positives.push(answer);
        bucket.positives += 1;
      } else if (index === 2 || index === 3 || index === 4) {
        concerns.push(answer);
        bucket.concerns += 1;
      } else if (index === 5) {
        retention.push(answer);
      } else if (index >= 6) {
        support.push(answer);
      }
    });
  });

  const sample = (items: string[], max = 4): string[] => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const item of items) {
      const key = item.toLowerCase().slice(0, 80);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
      if (out.length >= max) break;
    }
    return out;
  };

  const deptLines: string[] = [];
  [...byDept.entries()]
    .sort((a, b) => b[1].concerns - a[1].concerns)
    .slice(0, 6)
    .forEach(([dept, counts]) => {
      if (counts.concerns > 0 || counts.positives > 0) {
        deptLines.push(
          `• ${dept}: ${counts.positives} positive signal(s), ${counts.concerns} concern/obstacle mention(s) in this sample`
        );
      }
    });

  const lines: string[] = [
    'EXECUTIVE SUMMARY',
    `Template synthesis from ${payload.interviewCount} stay interview(s) between ${payload.dateFrom} and ${payload.dateTo}. Deploy the analyze-stay-themes edge function with OPENAI_API_KEY for richer theme clustering.`,
    '',
    "WHAT'S GOING WELL",
    ...sample(positives).map((t) => `• ${t}`),
    '',
    'CONCERNS & OBSTACLES',
    ...sample(concerns).map((t) => `• ${t}`),
    '',
    'RETENTION RISK SIGNALS',
    ...(sample(retention).length
      ? sample(retention).map((t) => `• ${t}`)
      : ['• No explicit retention concerns captured in this date range.']),
    '',
    'DEPARTMENT SPOTLIGHTS',
    ...(deptLines.length ? deptLines : ['• Not enough variation to highlight by department.']),
    '',
    'RECOMMENDED LEADERSHIP ACTIONS',
    '• Review the concern and retention bullets with department leaders; assign owners and dates.',
    '• Reinforce themes from "going well" in team meetings and recognition.',
    '• Follow up on support asks (Q7) within 30 days where feasible.',
    '',
    'DATA NOTE',
    `Qualitative rollup from ${payload.interviewCount} interviews (${payload.departmentsRepresented.length} departments). Not a statistical survey — validate with HR before broad distribution.`,
  ];

  return lines.join('\n');
}

export async function generateStayInterviewOrgThemes(
  options: StayInterviewOrgThemesOptions = {}
): Promise<StayInterviewOrgThemesResult> {
  const payload = await loadStayInterviewOrgThemesPayload(options);

  try {
    const report = await requestStayInterviewOrgThemesAi(payload);
    return {
      report,
      source: 'ai',
      interviewCount: payload.interviewCount,
      dateFrom: payload.dateFrom,
      dateTo: payload.dateTo,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const useTemplate =
      err instanceof StayInterviewOrgThemesError &&
      !/unauthorized|401/i.test(message) &&
      (/not configured|OPENAI|503|502|relay|failed to send|edge function|could not reach|404/i.test(
        message
      ));

    if (!useTemplate) {
      throw err instanceof StayInterviewOrgThemesError
        ? err
        : new StayInterviewOrgThemesError(message);
    }

    return {
      report: buildStayInterviewOrgThemesTemplate(payload),
      source: 'template',
      interviewCount: payload.interviewCount,
      dateFrom: payload.dateFrom,
      dateTo: payload.dateTo,
    };
  }
}

/** Re-export for tests / consistency with per-interview flow. */
export type { StayInterviewSummaryContext };
