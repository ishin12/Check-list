/**
 * Excel export for finance (§14). The writer is loaded only when someone
 * exports, so it adds nothing to the app's first load.
 */
import type { Language } from '@/domain/models/types';

export type CellValue = string | number | null | undefined;

export interface ExportSheet {
  name: string;
  header: string[];
  rows: CellValue[][];
  /** Rows appended after the data in bold (e.g. totals). */
  footer?: CellValue[][];
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function cell(v: CellValue, bold = false) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return { value: v, type: Number, fontWeight: bold ? 'bold' as const : undefined };
  // Calendar dates are real Excel dates, so they sort and filter (UAT D-27).
  const m = ISO_DATE.exec(v);
  if (m) return { value: new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])), type: Date, format: 'yyyy-mm-dd', fontWeight: bold ? 'bold' as const : undefined };
  return { value: String(v), type: String, fontWeight: bold ? 'bold' as const : undefined };
}

/** Builds the workbook and downloads it. Throws if the browser cannot write it. */
export async function exportExcel(fileName: string, sheets: ExportSheet[], language: Language): Promise<void> {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const rtl = language !== 'en';
  const data = sheets.map((s) => ({
    sheet: s.name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31),
    rightToLeft: rtl,
    stickyRowsCount: 1,
    columns: s.header.map((h, i) => ({
      width: Math.min(40, Math.max(10, h.length + 2, ...s.rows.map((r) => String(r[i] ?? '').length + 2))),
    })),
    data: [
      s.header.map((h) => ({ value: h, type: String, fontWeight: 'bold' as const })),
      ...s.rows.map((r) => r.map((v) => cell(v))),
      ...(s.footer ?? []).map((r) => r.map((v) => cell(v, true))),
    ],
  }));
  const blob = await writeXlsxFile(data as never).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
