import { supabaseClient } from './supabaseClient';
import type { EmployeeLike } from './access';

export type DirectoryEmployee = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  department?: string | null;
  position?: string | null;
  supervisor?: string | null;
  is_remote?: boolean | null;
};

export function directoryEmployeeToRosterRow(row: DirectoryEmployee): EmployeeLike {
  return {
    id: row.id,
    employee_id: row.id,
    first_name: row.first_name || '',
    last_name: row.last_name || '',
    department: row.department || '',
    dept: row.department || '',
    position: row.position || '',
    supervisor: row.supervisor || '',
    status: 'ACTIVE',
    displayStatus: 'ACTIVE',
    is_remote: Boolean(row.is_remote),
  };
}

export async function loadEmployeeDirectory(): Promise<DirectoryEmployee[]> {
  const { data, error } = await supabaseClient.rpc('orbis_list_employee_directory');

  if (error) {
    throw new Error(error.message || 'Could not load company directory.');
  }

  return (data || []) as DirectoryEmployee[];
}

export function filterDirectoryEmployees(
  rows: DirectoryEmployee[],
  query: string
): DirectoryEmployee[] {
  const term = String(query || '').trim().toLowerCase();
  if (!term) return rows;

  return rows.filter((row) => {
    const haystack = [
      row.first_name,
      row.last_name,
      row.department,
      row.position,
      row.supervisor,
    ]
      .map((value) => String(value || '').toLowerCase())
      .join(' ');

    return haystack.includes(term);
  });
}

export function directoryDisplayName(row: DirectoryEmployee): string {
  return `${row.first_name || ''} ${row.last_name || ''}`.trim() || row.id;
}

export function directoryWorkLocation(row: DirectoryEmployee): string {
  return row.is_remote ? 'Overseas / remote' : 'In house';
}
