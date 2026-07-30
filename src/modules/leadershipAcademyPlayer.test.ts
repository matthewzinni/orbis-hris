import { describe, expect, it } from 'vitest';
import {
  renderLeadershipLessonContent,
  renderLeadershipQuizForm,
} from './leadershipAcademyPlayer';

describe('Leadership Academy lesson renderer', () => {
  it('escapes HTML while rendering lesson structure', () => {
    const html = renderLeadershipLessonContent('## Purpose\n* Lead fairly\n<script>alert(1)</script>');
    expect(html).toContain('<h3>Purpose</h3>');
    expect(html).toContain('<li>Lead fairly</li>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>');
  });

  it('renders quiz options without exposing correctness', () => {
    const html = renderLeadershipQuizForm(
      [
        {
          id: 'question-1',
          type: 'multiple_choice',
          prompt: 'What is leadership?',
          displayOrder: 1,
          options: [
            { id: 'option-1', text: 'Responsibility', displayOrder: 1 },
            { id: 'option-2', text: 'A title', displayOrder: 2 },
          ],
        },
      ],
      false
    );
    expect(html).toContain('What is leadership?');
    expect(html).toContain('Responsibility');
    expect(html).not.toContain('isCorrect');
    expect(html).not.toContain('is_correct');
  });
});
