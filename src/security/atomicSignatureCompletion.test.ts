import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const migration = readFileSync(
  resolve(root, 'supabase/migrations/20260901100000_atomic_signature_completion.sql'),
  'utf8'
);
const edgeFunction = readFileSync(
  resolve(root, 'supabase/functions/form-signature/index.ts'),
  'utf8'
);

describe('atomic remote signature completion', () => {
  it('locks the request and restricts the transaction function to service_role', () => {
    expect(migration).toMatch(/for update/i);
    expect(migration).toMatch(/security definer/i);
    expect(migration).toMatch(/set search_path = pg_catalog, public/i);
    expect(migration).toMatch(/revoke all[\s\S]*from authenticated/i);
    expect(migration).toMatch(/grant execute[\s\S]*to service_role/i);
  });

  it('completes signatures through the transactional RPC', () => {
    expect(edgeFunction).toContain(".rpc(\n      'orbis_complete_signature_request'");
    expect(edgeFunction).not.toMatch(/\.from\(table\)[\s\S]*\.update\(formUpdate\)/);
  });
});
