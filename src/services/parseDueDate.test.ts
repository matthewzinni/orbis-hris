import { describe, expect, it } from 'vitest';
import { parseDueDate } from './employeeUtils';

describe('parseDueDate', () => {
  it('parses YYYY-MM-DD as a local calendar date', () => {
    const date = parseDueDate('2026-07-20');
    expect(date).not.toBeNull();
    expect(date?.getFullYear()).toBe(2026);
    expect(date?.getMonth()).toBe(6);
    expect(date?.getDate()).toBe(20);
  });

  it('does not shift when given a UTC midnight ISO timestamp', () => {
    const date = parseDueDate('2026-07-20T00:00:00.000Z');
    expect(date?.getFullYear()).toBe(2026);
    expect(date?.getMonth()).toBe(6);
    expect(date?.getDate()).toBe(20);
  });
});
