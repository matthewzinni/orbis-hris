import { collectCandidateInterviewAttentionItems } from './candidates';
import { collectDisciplineAttentionItems } from './discipline';
import { collectMeetingAttentionItems } from './meetings';
import { collectMissingEmployeeInfoAttentionItems } from './missingEmployeeInfo';
import { collectPerformanceReviewAttentionItems } from './performanceReviews';

export type AttentionRule = {
  id: string;
  label: string;
  collect: () => Promise<import('../types').AttentionItem[]>;
};

/** Phase 3 initial rule set — extend in later phases. */
export const ATTENTION_RULES: AttentionRule[] = [
  {
    id: 'performance_review_due',
    label: 'Performance reviews due or overdue',
    collect: collectPerformanceReviewAttentionItems,
  },
  {
    id: 'discipline_open',
    label: 'Open discipline requiring follow-up',
    collect: collectDisciplineAttentionItems,
  },
  {
    id: 'meeting_today',
    label: 'Meetings due today or overdue follow-up',
    collect: collectMeetingAttentionItems,
  },
  {
    id: 'candidate_interview_pending',
    label: 'Candidate interviews awaiting action',
    collect: collectCandidateInterviewAttentionItems,
  },
  {
    id: 'employee_missing_required',
    label: 'Missing required employee information',
    collect: collectMissingEmployeeInfoAttentionItems,
  },
];

export {
  collectCandidateInterviewAttentionItems,
  collectDisciplineAttentionItems,
  collectMeetingAttentionItems,
  collectMissingEmployeeInfoAttentionItems,
  collectPerformanceReviewAttentionItems,
};
