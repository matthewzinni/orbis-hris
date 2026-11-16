import { describe, expect, it, vi } from 'vitest';

vi.mock('../services/supabaseClient', () => ({ supabaseClient: { auth: {} } }));

import { readPasswordLink, validateNewPassword } from './passwordSetup';

describe('readPasswordLink', () => {
  it('reads a recovery link', () => {
    expect(readPasswordLink('#access_token=aaa&expires_in=3600&refresh_token=bbb&token_type=bearer&type=recovery')).toEqual({
      kind: 'recovery',
      accessToken: 'aaa',
      refreshToken: 'bbb',
    });
  });

  it('accepts an invite link too', () => {
    expect(readPasswordLink('#access_token=a&refresh_token=b&type=invite')?.kind).toBe('recovery');
  });

  it('explains an expired link', () => {
    const link = readPasswordLink('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
    expect(link?.kind).toBe('error');
    expect(link && 'message' in link ? link.message : '').toMatch(/expired/);
  });

  it('ignores ordinary hashes and sign-in links without tokens', () => {
    expect(readPasswordLink('')).toBeNull();
    expect(readPasswordLink('#reports')).toBeNull();
    expect(readPasswordLink('#type=recovery')).toBeNull();
    expect(readPasswordLink('#access_token=a&refresh_token=b&type=signup')).toBeNull();
  });
});

describe('validateNewPassword', () => {
  it('requires 8+ characters and a matching confirmation', () => {
    expect(validateNewPassword('short', 'short')).toMatch(/at least 8/);
    expect(validateNewPassword('longenough', 'different1')).toMatch(/do not match/);
    expect(validateNewPassword('longenough', 'longenough')).toBe('');
  });
});
