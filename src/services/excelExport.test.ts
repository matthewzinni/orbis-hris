import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { createExcelBlob } from './excelExport';

describe('Excel exports', () => {
  it('creates a real Excel workbook preserving IDs, text, numbers and frozen headers', async () => {
    const blob = await createExcelBlob(
      ['ID', 'Notes', 'Headcount'],
      [['00123', '=SUM(A1:A2)', 12], ['00234', 'José & "Team"\nWest', 0]],
      'Roster'
    );
    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    expect(files['[Content_Types].xml']).toBeDefined();
    const workbook = strFromU8(files['xl/workbook.xml']);
    const sheet = strFromU8(files['xl/worksheets/sheet1.xml']);
    const strings = strFromU8(files['xl/sharedStrings.xml']);
    expect(workbook).toContain('name="Roster"');
    expect(sheet).toContain('state="frozen"');
    expect(sheet).toMatch(/r="C2"[^>]*><v>12<\/v>/);
    expect(sheet).not.toContain('<f>');
    expect(strings).toContain('00123');
    expect(strings).toContain('=SUM(A1:A2)');
    expect(strings).toContain('José &amp;');
  });
});
