import { supabaseClient } from './supabaseClient';
import { HANDBOOK_DOCUMENT_TITLE, type HandbookAcknowledgment } from './handbookAcknowledgments';

export type HandbookEmployee = { id: string; first_name: string | null; last_name: string | null; department: string | null; status: string | null };
export type HandbookSignature = Pick<HandbookAcknowledgment, 'id' | 'employee_id' | 'document_title' | 'signed_at' | 'signer_name'>;
export type HandbookStatusRow = { employeeId: string; name: string; department: string; signedAt: string | null; signerName: string | null; recordId: string | null };

export function buildHandbookStatus(employees: HandbookEmployee[], signatures: HandbookSignature[]): HandbookStatusRow[] {
  const signed = new Map<string, HandbookSignature>();
  for (const record of signatures) {
    if (record.document_title !== HANDBOOK_DOCUMENT_TITLE || !record.signed_at) continue;
    const previous = signed.get(record.employee_id);
    if (!previous || Date.parse(record.signed_at) > Date.parse(previous.signed_at!)) signed.set(record.employee_id, record);
  }
  return employees.filter(employee => !['TERMINATED', 'INACTIVE', 'ARCHIVED'].includes(String(employee.status || '').trim().toUpperCase()))
    .map(employee => {
      const record = signed.get(employee.id);
      return { employeeId: employee.id, name: [employee.first_name, employee.last_name].filter(Boolean).join(' ') || employee.id,
        department: employee.department || '—', signedAt: record?.signed_at || null,
        signerName: record?.signer_name || null, recordId: record?.id || null };
    }).sort((a, b) => a.name.localeCompare(b.name));
}

export async function loadHandbookStatus(): Promise<HandbookStatusRow[]> {
  // Read every page so the database's response limit cannot turn signed staff into pending staff.
  async function readPages<T>(table: string, columns: string, currentHandbook = false): Promise<T[]> {
    const rows: T[] = [];
    const size = 500;
    for (let offset = 0; ; offset += size) {
      let query = supabaseClient.from(table).select(columns).order('id').range(offset, offset + size - 1);
      if (currentHandbook) query = query.eq('document_title', HANDBOOK_DOCUMENT_TITLE);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      rows.push(...(data || []) as unknown as T[]);
      if (!data || data.length < size) return rows;
    }
  }
  const [employees, signatures] = await Promise.all([
    readPages<HandbookEmployee>('employees', 'id,first_name,last_name,department,status'),
    readPages<HandbookSignature>('handbook_acknowledgment_forms', 'id,employee_id,document_title,signed_at,signer_name', true),
  ]);
  return buildHandbookStatus(employees, signatures);
}
