import * as XLSX from 'xlsx';

/**
 * Export & Excel Template utilities supporting English and Malayalam UTF-8 text
 */

function escapeCsvCell(value: unknown): string {
  const str = String(value ?? '');
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function downloadCsv(filename: string, headers: string[], rows: unknown[][]): void {
  // Include UTF-8 BOM so Microsoft Excel properly renders Malayalam Unicode characters
  const bom = '\uFEFF';
  const csvLines = [
    headers.map(escapeCsvCell).join(','),
    ...rows.map((row) => row.map(escapeCsvCell).join(',')),
  ];
  const blob = new Blob([bom + csvLines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, filename.endsWith('.csv') ? filename : `${filename}.csv`);
}

export function downloadExcel(
  filename: string,
  sheetTitle: string,
  headers: string[],
  rows: unknown[][]
): void {
  const escapeHtml = (val: unknown) =>
    String(val ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  const html = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office"
          xmlns:x="urn:schemas-microsoft-com:office:excel"
          xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="UTF-8" />
        <style>
          table { border-collapse: collapse; font-family: Arial, 'Noto Sans Malayalam', sans-serif; }
          th { background-color: #1E3A5F; color: #FFFFFF; font-weight: bold; padding: 6px 10px; border: 1px solid #CBD5E1; text-align: left; }
          td { padding: 6px 10px; border: 1px solid #CBD5E1; }
        </style>
      </head>
      <body>
        <h3>${escapeHtml(sheetTitle)}</h3>
        <table>
          <thead>
            <tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr>
          </thead>
          <tbody>
            ${rows
              .map(
                (r) =>
                  `<tr>${r.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`
              )
              .join('')}
          </tbody>
        </table>
      </body>
    </html>
  `;

  const blob = new Blob(['\uFEFF' + html], {
    type: 'application/vnd.ms-excel;charset=utf-8;',
  });
  triggerDownload(blob, filename.endsWith('.xls') ? filename : `${filename}.xls`);
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function triggerPrintReport(): void {
  window.print();
}

export function parseCsvText(csvText: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const clean = csvText.replace(/^\uFEFF/, '');

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    const next = clean[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(field.trim());
        field = '';
      } else if (ch === '\r' && next === '\n') {
        row.push(field.trim());
        if (row.some((cell) => cell.length > 0)) rows.push(row);
        row = [];
        field = '';
        i++;
      } else if (ch === '\n' || ch === '\r') {
        row.push(field.trim());
        if (row.some((cell) => cell.length > 0)) rows.push(row);
        row = [];
        field = '';
      } else {
        field += ch;
      }
    }
  }
  row.push(field.trim());
  if (row.some((cell) => cell.length > 0)) rows.push(row);
  return rows;
}

export interface ParsedBulkStudentRow {
  rowNumber: number;
  full_name: string;
  admission_number: string;
  batch_name: string;
  email: string;
  phone: string;
  username: string;
  password: string;
}

export const STUDENT_TEMPLATE_HEADERS = [
  'Full Name *',
  'Admission Number *',
  'Class / Batch *',
  'Email',
  'Phone',
  'Username *',
  'Password *',
];

export function downloadStudentExcelTemplate(defaultBatch = 'Degree 1st Year (Foundation Stream)'): void {
  const wb = XLSX.utils.book_new();

  const studentRows = [
    STUDENT_TEMPLATE_HEADERS,
    [
      'Muhammed Rashid P',
      'KKHM2611',
      defaultBatch,
      'rashid.2611@kkhmcollege.edu.in',
      '+91 98470 50101',
      'kkhm2611',
      'Student@2026',
    ],
    [
      'Abdul Basith K',
      'KKHM2612',
      defaultBatch,
      'basith.2612@kkhmcollege.edu.in',
      '+91 98470 50102',
      'kkhm2612',
      'Student@2026',
    ],
  ];

  const wsStudents = XLSX.utils.aoa_to_sheet(studentRows);
  wsStudents['!cols'] = [
    { wch: 26 },
    { wch: 20 },
    { wch: 34 },
    { wch: 30 },
    { wch: 18 },
    { wch: 18 },
    { wch: 18 },
  ];
  XLSX.utils.book_append_sheet(wb, wsStudents, 'Students');

  const instructionRows = [
    ['KKHM Islamic & Arts College — Bulk Student Import Template Guide'],
    [''],
    ['Column Name', 'Required', 'Description / Notes'],
    ['Full Name *', 'Yes', 'Student full name (supports English and Malayalam Unicode text).'],
    ['Admission Number *', 'Yes', 'Unique college admission number (e.g. KKHM2611). Duplicates are rejected.'],
    ['Class / Batch *', 'Yes', 'Class or Batch name (e.g. Degree 1st Year (Foundation Stream)).'],
    ['Email', 'Optional', 'Student email address. If left blank, auto-generated from username.'],
    ['Phone', 'Optional', 'Contact mobile number.'],
    ['Username *', 'Yes', 'Unique login username assigned by Admin for the unified login page.'],
    ['Password *', 'Yes', 'Initial login password (minimum 6 characters). Admin can reset anytime.'],
    [''],
    ['How to use:'],
    ['1. Open the "Students" sheet and replace the 2 sample rows with your real student records.'],
    ['2. Do not rename or delete the first header row.'],
    ['3. Save the file as .xlsx (or .csv) and upload it in Admin -> Students -> Bulk Add Students.'],
  ];
  const wsGuide = XLSX.utils.aoa_to_sheet(instructionRows);
  wsGuide['!cols'] = [{ wch: 24 }, { wch: 12 }, { wch: 74 }];
  XLSX.utils.book_append_sheet(wb, wsGuide, 'Instructions');

  const wbArray = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbArray], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  triggerDownload(blob, 'KKHM_Student_Bulk_Upload_Template.xlsx');
}

export function downloadStudentCsvTemplate(defaultBatch = 'Degree 1st Year (Foundation Stream)'): void {
  downloadCsv('KKHM_Student_Bulk_Upload_Template.csv', STUDENT_TEMPLATE_HEADERS, [
    [
      'Muhammed Rashid P',
      'KKHM2611',
      defaultBatch,
      'rashid.2611@kkhmcollege.edu.in',
      '+91 98470 50101',
      'kkhm2611',
      'Student@2026',
    ],
    [
      'Abdul Basith K',
      'KKHM2612',
      defaultBatch,
      'basith.2612@kkhmcollege.edu.in',
      '+91 98470 50102',
      'kkhm2612',
      'Student@2026',
    ],
  ]);
}

function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .replace(/[*()/_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function mapMatrixToBulkStudentRows(matrix: unknown[][]): ParsedBulkStudentRow[] {
  if (matrix.length < 2) return [];

  const headerRow = matrix[0].map((cell) => normalizeHeader(String(cell ?? '')));
  const findCol = (candidates: string[], fallbackIndex: number): number => {
    const idx = headerRow.findIndex((h) => candidates.some((c) => h.includes(c)));
    return idx >= 0 ? idx : fallbackIndex;
  };

  const colFullName = findCol(['full name', 'student name', 'name'], 0);
  const colAdmission = findCol(['admission'], 1);
  const colBatch = findCol(['batch', 'class'], 2);
  const colEmail = findCol(['email', 'mail'], 3);
  const colPhone = findCol(['phone', 'mobile', 'contact'], 4);
  const colUsername = findCol(['username', 'user name', 'login'], 5);
  const colPassword = findCol(['password', 'pass'], 6);

  const parsed: ParsedBulkStudentRow[] = [];
  for (let i = 1; i < matrix.length; i++) {
    const row = matrix[i];
    if (!row || !row.some((c) => String(c ?? '').trim().length > 0)) continue;

    const get = (idx: number) => String(row[idx] ?? '').trim();
    parsed.push({
      rowNumber: i + 1,
      full_name: get(colFullName),
      admission_number: get(colAdmission),
      batch_name: get(colBatch),
      email: get(colEmail),
      phone: get(colPhone),
      username: get(colUsername),
      password: get(colPassword),
    });
  }
  return parsed;
}

export async function parseStudentSpreadsheetFile(file: File): Promise<ParsedBulkStudentRow[]> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.csv')) {
    const text = await file.text();
    const rows = parseCsvText(text);
    return mapMatrixToBulkStudentRows(rows);
  }

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const targetSheetName =
    workbook.SheetNames.find((n) => n.toLowerCase() === 'students') || workbook.SheetNames[0];
  if (!targetSheetName) return [];
  const sheet = workbook.Sheets[targetSheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
  return mapMatrixToBulkStudentRows(matrix);
}

