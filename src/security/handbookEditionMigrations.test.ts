import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(new URL('../../supabase/migrations/20260914180000_handbook_4_1_edition.sql', import.meta.url), 'utf8');

describe('handbook 4.1 edition wording', () => {
  it('names the current handbook on the shared link and unsigned forms only', () => {
    expect(sql).toContain('Employee Handbook 4.1 effective 1 September 2026');
    expect(sql).toContain('Employee Handbook 4.1, effective 1 September 2026');
    expect(sql).toContain("where id = 'employee-handbook'");
    expect(sql).toContain('where signed_at is null');
    expect(sql).not.toMatch(/where signed_at is not null/);
  });
});
