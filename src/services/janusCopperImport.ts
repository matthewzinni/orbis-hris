import {
  upsertJanusAccountByCopperId,
  upsertJanusContactByCopperId,
  type JanusAccountDraft,
} from './janusStore';

export type CopperImportResult = {
  accountsCreated: number;
  contactsCreated: number;
  rowsSkipped: number;
  errors: string[];
};

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function parseCsv(text: string): Array<Record<string, string>> {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, '_'));
  const rows: Array<Record<string, string>> = [];

  for (let i = 1; i < lines.length; i += 1) {
    const cells = parseCsvLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = String(cells[index] || '').trim();
    });
    rows.push(row);
  }

  return rows;
}

function pick(row: Record<string, string>, keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (value) return value;
  }
  return '';
}

function splitName(full: string): { first: string; last: string } {
  const parts = String(full || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { first: '', last: '' };
  if (parts.length === 1) return { first: parts[0], last: '' };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

function inferAccountType(row: Record<string, string>): JanusAccountDraft['account_type'] {
  const raw = pick(row, ['account_type', 'type', 'company_type']).toLowerCase();
  if (raw.includes('vendor')) return 'vendor';
  if (raw.includes('partner')) return 'partner';
  if (raw.includes('publish')) return 'publisher';
  if (raw.includes('client')) return 'client';
  return 'client';
}

export async function importCopperCsv(text: string): Promise<CopperImportResult> {
  const rows = parseCsv(text);
  const result: CopperImportResult = {
    accountsCreated: 0,
    contactsCreated: 0,
    rowsSkipped: 0,
    errors: [],
  };

  const accountIdByName = new Map<string, string>();

  for (const row of rows) {
    const companyName = pick(row, [
      'company',
      'company_name',
      'account',
      'account_name',
      'organization',
      'name',
    ]);
    const contactName = pick(row, ['contact', 'contact_name', 'full_name', 'person']);
    const email = pick(row, ['email', 'email_address', 'work_email']);
    const phone = pick(row, ['phone', 'phone_number', 'work_phone', 'mobile']);
    const copperCompanyId = pick(row, ['company_id', 'account_id', 'copper_company_id', 'id']);
    const copperContactId = pick(row, ['contact_id', 'copper_contact_id', 'person_id']);

    if (!companyName && !contactName && !email) {
      result.rowsSkipped += 1;
      continue;
    }

    try {
      let accountId = companyName ? accountIdByName.get(companyName.toLowerCase()) : '';

      if (!accountId && companyName) {
        const account = await upsertJanusAccountByCopperId(copperCompanyId, {
          name: companyName,
          account_type: inferAccountType(row),
          status: 'active',
          phone: phone || null,
          notes: pick(row, ['notes', 'description']) || null,
        });
        accountId = account.id;
        accountIdByName.set(companyName.toLowerCase(), accountId);
        result.accountsCreated += 1;
      }

      if (!accountId) {
        result.rowsSkipped += 1;
        continue;
      }

      if (contactName || email) {
        const { first, last } = splitName(contactName || email.split('@')[0] || 'Contact');
        await upsertJanusContactByCopperId(copperContactId, {
          account_id: accountId,
          first_name: first,
          last_name: last,
          email: email || null,
          phone: phone || null,
          title: pick(row, ['title', 'job_title', 'role']) || null,
        });
        result.contactsCreated += 1;
      }
    } catch (err) {
      result.errors.push(err instanceof Error ? err.message : 'Import row failed');
    }
  }

  return result;
}
