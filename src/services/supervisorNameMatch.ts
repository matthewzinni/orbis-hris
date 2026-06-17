/** Normalize supervisor labels for roster ↔ access matching (mirrors DB helpers). */
export function normalizeSupervisorLabel(value: string): string {
  return String(value || '').trim().toLowerCase();
}

export function compactSupervisorLabel(value: string): string {
  return normalizeSupervisorLabel(value).replace(/[^a-z0-9]/g, '');
}

/** Tokens with length >= 2 from the scope name (first/last for multi-token match). */
export function supervisorScopeTokens(scopeName: string): string[] {
  return normalizeSupervisorLabel(scopeName)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2);
}

/**
 * Tight supervisor match: exact, compact (no punctuation), or all scope tokens present.
 * Single short tokens no longer match via substring (e.g. "Lee" vs "Ashley Lee").
 */
export function supervisorNameMatches(rosterSupervisor: string, accessSupervisor: string): boolean {
  const employeeNorm = normalizeSupervisorLabel(rosterSupervisor);
  const scopeNorm = normalizeSupervisorLabel(accessSupervisor);

  if (!employeeNorm || !scopeNorm || scopeNorm === 'all') return false;
  if (employeeNorm === scopeNorm) return true;

  const employeeCompact = compactSupervisorLabel(rosterSupervisor);
  const scopeCompact = compactSupervisorLabel(accessSupervisor);
  if (employeeCompact && scopeCompact && employeeCompact === scopeCompact) return true;

  const tokens = supervisorScopeTokens(accessSupervisor);
  if (tokens.length >= 2) {
    return tokens.every((token) => employeeNorm.includes(token));
  }

  return false;
}
