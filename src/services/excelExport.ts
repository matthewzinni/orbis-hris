import type { SheetData } from 'write-excel-file/browser';

export type ExcelValue = string | number | boolean | null | undefined;

/** Keep IDs and free text as text; only explicit numeric values become Excel numbers. */
export async function createExcelBlob(
  headers: string[],
  rows: ExcelValue[][],
  sheet = 'Report'
): Promise<Blob> {
  const { default: writeExcelFile } = await import('write-excel-file/browser');
  const data: SheetData = [
    headers.map((value) => ({ value, type: String, fontWeight: 'bold' })),
    ...rows.map((row) => row.map((value) => {
      if (typeof value === 'number' && Number.isFinite(value)) return { value, type: Number };
      if (typeof value === 'boolean') return { value, type: Boolean };
      return { value: String(value ?? ''), type: String };
    })),
  ];
  const columns = headers.map((header, index) => ({
    width: Math.min(40, Math.max(14, header.length + 2,
      ...rows.slice(0, 200).map((row) => String(row[index] ?? '').length + 2))),
  }));
  return writeExcelFile(data, { sheet, columns, stickyRowsCount: 1 }).toBlob();
}

export async function downloadExcel(
  filename: string,
  headers: string[],
  rows: ExcelValue[][],
  sheet = 'Report'
): Promise<boolean> {
  try {
    const blob = await createExcelBlob(headers, rows, sheet);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename.replace(/\.(csv|xlsx)$/i, '') + '.xlsx';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch (error) {
    console.error('[Excel export] Could not create workbook:', error);
    window.showToast?.('Could not download the Excel file. Please try again.', 'error');
    return false;
  }
}
