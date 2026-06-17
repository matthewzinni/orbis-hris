import { describe, expect, it } from 'vitest';
import { supervisorNameMatches } from './supervisorNameMatch';

describe('supervisorNameMatches', () => {
  it('matches exact normalized names', () => {
    expect(supervisorNameMatches('Kyle Hodges', 'kyle hodges')).toBe(true);
    expect(supervisorNameMatches('  Kyle Hodges  ', 'Kyle Hodges')).toBe(true);
  });

  it('matches compact punctuation variants', () => {
    expect(supervisorNameMatches("O'Brien, Patrick", 'Patrick O Brien')).toBe(true);
    expect(supervisorNameMatches('Smith-Jones', 'Smith Jones')).toBe(true);
  });

  it('matches when all multi-token scope tokens appear in roster supervisor', () => {
    expect(supervisorNameMatches('Hodges, Kyle', 'Kyle Hodges')).toBe(true);
    expect(supervisorNameMatches('Kyle A. Hodges', 'Kyle Hodges')).toBe(true);
  });

  it('rejects short single-token substring matches', () => {
    expect(supervisorNameMatches('Ashley Lee', 'Lee')).toBe(false);
    expect(supervisorNameMatches('Kimberly Ann', 'Kim')).toBe(false);
  });

  it('rejects unrelated names', () => {
    expect(supervisorNameMatches('Ryan Smith', 'Kyle Hodges')).toBe(false);
    expect(supervisorNameMatches('Matthew Zinni', 'Trent Wynne')).toBe(false);
  });

  it('rejects empty or all scope', () => {
    expect(supervisorNameMatches('', 'Kyle Hodges')).toBe(false);
    expect(supervisorNameMatches('Kyle Hodges', '')).toBe(false);
    expect(supervisorNameMatches('Kyle Hodges', 'all')).toBe(false);
  });
});
