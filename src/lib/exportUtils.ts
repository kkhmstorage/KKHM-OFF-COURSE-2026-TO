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
  // CIC Academic & Subject Fields
  cic_ad_no?: string;
  clg_ad_no?: string;
  academic_year_text?: string;
  semester_text?: string;
  semester_period?: string;
  course_stream?: string;
  college_name?: string;
  subject_title?: string;
  proposal_app_no?: string;
  course_credit?: string;
  guide_name?: string;
  whatsapp_number?: string;
  reference_notes?: string;
}

export const STUDENT_TEMPLATE_HEADERS = [
  'Name of Student *',
  'CIC Ad No',
  'Clg Ad No *',
  'Class / Department *',
  'Academic Year',
  'Semester',
  'Session (Nov/May)',
  'Course Stream',
  'College Affl. & Name',
  'Subject Title',
  'Off Course Proposal Application Number',
  'Credit',
  'Name of Guide',
  'Phone Number',
  'Whatsapp Number',
  'Reference',
  'Username *',
  'Password *',
];

export function downloadStudentExcelTemplate(defaultBatch = 'Degree 1st Year (Foundation Stream)'): void {
  const wb = XLSX.utils.book_new();

  const studentRows = [
    STUDENT_TEMPLATE_HEADERS,
    [
      'Muhammed Rashid P',
      'CIC-2026-091',
      'KKHM2611',
      defaultBatch,
      '2026-27',
      'Semester 1',
      'Nov',
      'Wafy',
      'KKHM Islamic & Arts College',
      'Tafsir Studies & Arabic Grammar Analysis',
      'PROP-2026-042',
      '4',
      'Usthad Muhammed Rashid P',
      '+91 98470 50101',
      '+91 98470 50101',
      'Al-Jami li-Ahkam al-Quran by Imam al-Qurtubi',
      'kkhm2611',
      'Student@2026',
    ],
    [
      'Abdul Basith K',
      'CIC-2026-092',
      'KKHM2612',
      defaultBatch,
      '2026-27',
      'Semester 1',
      'May',
      'Wafy Arts',
      'KKHM Islamic & Arts College',
      'Hadith Terminology and Methodology',
      'PROP-2026-043',
      '3',
      'Prof. Basheer Ahmed M',
      '+91 98470 50102',
      '+91 98470 50102',
      'Nukhbat al-Fikar by Ibn Hajar al-Asqalani',
      'kkhm2612',
      'Student@2026',
    ],
  ];

  const wsStudents = XLSX.utils.aoa_to_sheet(studentRows);
  wsStudents['!cols'] = [
    { wch: 26 }, // Name of Student
    { wch: 18 }, // CIC Ad No
    { wch: 18 }, // Clg Ad No
    { wch: 32 }, // Class / Department
    { wch: 16 }, // Academic Year
    { wch: 16 }, // Semester
    { wch: 18 }, // Session
    { wch: 22 }, // Course Stream
    { wch: 32 }, // College Affl. & Name
    { wch: 38 }, // Subject Title
    { wch: 36 }, // Proposal App No
    { wch: 10 }, // Credit
    { wch: 28 }, // Name of Guide
    { wch: 18 }, // Phone
    { wch: 18 }, // Whatsapp
    { wch: 42 }, // Reference
    { wch: 18 }, // Username
    { wch: 18 }, // Password
  ];
  XLSX.utils.book_append_sheet(wb, wsStudents, 'Students');

  const instructionRows = [
    ['COORDINATION OF ISLAMIC COLLEGES (CIC) — Bulk Student Import Template Guide'],
    ['Executive Member, Islamic Universities League | ISO 9001:2015 Certified'],
    [''],
    ['Field Name', 'Required', 'Description / Permitted Values'],
    ['Name of Student *', 'Yes', 'Student full name (supports English and Malayalam Unicode text).'],
    ['CIC Ad No', 'Optional', 'CIC Central Admission Number (e.g. CIC-2026-091).'],
    ['Clg Ad No *', 'Yes', 'College Admission Number (e.g. KKHM2611). Must be unique.'],
    ['Class / Department *', 'Yes', 'Class or Academic Department (e.g. Degree 1st Year).'],
    ['Academic Year', 'Optional', 'Academic Year span (e.g. 2026-27).'],
    ['Semester', 'Optional', 'Semester (e.g. Semester 1, Semester 2).'],
    ['Session (Nov/May)', 'Optional', 'Exam / Evaluation session: "Nov" or "May".'],
    ['Course Stream', 'Optional', 'One of: Wafy, Wafy Arts, Wafiyya, Wafiyya Day, Wafiyya Arts, Wafiyya Distance.'],
    ['College Affl. & Name', 'Optional', 'College Affiliation & Name (e.g. KKHM Islamic & Arts College).'],
    ['Subject Title', 'Optional', 'Off-course subject or research proposal title.'],
    ['Off Course Proposal Application Number', 'Optional', 'Official proposal application number (e.g. PROP-2026-042).'],
    ['Credit', 'Optional', 'Assigned credit value (e.g. 4).'],
    ['Name of Guide', 'Optional', 'Name of assigned supervising mentor/guide.'],
    ['Phone Number', 'Optional', 'Contact mobile number.'],
    ['Whatsapp Number', 'Optional', 'WhatsApp contact number.'],
    ['Reference', 'Optional', 'Prescribed text, reference literature or study materials.'],
    ['Username *', 'Optional', 'Login username. If left blank, automatically generated from Clg Ad No.'],
    ['Password *', 'Required', 'Initial password (min 8 chars, required, different for every student).'],
    [''],
    ['Instructions:'],
    ['1. Fill student records in the "Students" sheet using the template columns.'],
    ['2. You can upload the saved .xlsx or .csv directly in Admin -> Students -> Bulk Add Students.'],
    ['3. All CIC details will appear automatically in the student profile and reports.'],
  ];
  const wsGuide = XLSX.utils.aoa_to_sheet(instructionRows);
  wsGuide['!cols'] = [{ wch: 34 }, { wch: 12 }, { wch: 80 }];
  XLSX.utils.book_append_sheet(wb, wsGuide, 'Instructions');

  const wbArray = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([wbArray], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  triggerDownload(blob, 'KKHM_CIC_Student_Bulk_Upload_Template.xlsx');
}

export function downloadStudentCsvTemplate(defaultBatch = 'Degree 1st Year (Foundation Stream)'): void {
  downloadCsv('KKHM_CIC_Student_Bulk_Upload_Template.csv', STUDENT_TEMPLATE_HEADERS, [
    [
      'Muhammed Rashid P',
      'CIC-2026-091',
      'KKHM2611',
      defaultBatch,
      '2026-27',
      'Semester 1',
      'Nov',
      'Wafy',
      'KKHM Islamic & Arts College',
      'Tafsir Studies & Arabic Grammar Analysis',
      'PROP-2026-042',
      '4',
      'Usthad Muhammed Rashid P',
      '+91 98470 50101',
      '+91 98470 50101',
      'Al-Jami li-Ahkam al-Quran by Imam al-Qurtubi',
      'kkhm2611',
      'Student@2026',
    ],
    [
      'Abdul Basith K',
      'CIC-2026-092',
      'KKHM2612',
      defaultBatch,
      '2026-27',
      'Semester 1',
      'May',
      'Wafy Arts',
      'KKHM Islamic & Arts College',
      'Hadith Terminology and Methodology',
      'PROP-2026-043',
      '3',
      'Prof. Basheer Ahmed M',
      '+91 98470 50102',
      '+91 98470 50102',
      'Nukhbat al-Fikar by Ibn Hajar al-Asqalani',
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
  const findCol = (candidates: string[], fallbackIndex = -1): number => {
    const idx = headerRow.findIndex((h) => candidates.some((c) => h.includes(c)));
    return idx >= 0 ? idx : fallbackIndex;
  };

  const colFullName = findCol(['name of student', 'student name', 'full name', 'name'], 0);
  const colCicAd = findCol(['cic ad', 'cic admission', 'cic'], -1);
  const colClgAd = findCol(['clg ad', 'college ad', 'admission number', 'admission'], 1);
  const colBatch = findCol(['class department', 'department', 'batch', 'class'], 2);
  const colAcademicYear = findCol(['academic year', 'year'], -1);
  const colSemester = findCol(['semester', 'sem'], -1);
  const colSession = findCol(['session', 'nov may', 'nov', 'may'], -1);
  const colStream = findCol(['course stream', 'stream', 'course', 'wafy'], -1);
  const colCollege = findCol(['college affl', 'college name', 'college'], -1);
  const colSubjectTitle = findCol(['subject title', 'title', 'subject'], -1);
  const colProposalApp = findCol(['proposal application', 'proposal app', 'proposal', 'application number'], -1);
  const colCredit = findCol(['credit'], -1);
  const colGuide = findCol(['name of guide', 'guide name', 'guide', 'mentor'], -1);
  const colPhone = findCol(['phone number', 'contact', 'mobile', 'phone'], -1);
  const colWhatsapp = findCol(['whatsapp number', 'whatsapp', 'wa'], -1);
  const colReference = findCol(['reference', 'ref', 'notes', 'bibliography'], -1);
  const colEmail = findCol(['email address', 'email', 'mail'], -1);
  const colUsername = findCol(['username', 'user name', 'login'], -1);
  const colPassword = findCol(['password', 'pass'], -1);

  const parsed: ParsedBulkStudentRow[] = [];
  for (let i = 1; i < matrix.length; i++) {
    const row = matrix[i];
    if (!row || !row.some((c) => String(c ?? '').trim().length > 0)) continue;

    const get = (idx: number) => (idx >= 0 && row[idx] !== undefined ? String(row[idx] ?? '').trim() : '');

    const fullName = get(colFullName);
    const clgAd = get(colClgAd);
    const cicAd = get(colCicAd);
    const admissionNo = clgAd || cicAd || `STU-${i}`;
    const batch = get(colBatch) || 'Degree Year 1';
    let username = get(colUsername);
    if (!username) {
      username = admissionNo.toLowerCase().replace(/[^a-z0-9]/g, '');
    }
    const password = get(colPassword) || 'Student@2026';
    const email = get(colEmail) || `${username}@kkhmcollege.edu.in`;
    const phone = get(colPhone) || get(colWhatsapp);

    parsed.push({
      rowNumber: i + 1,
      full_name: fullName,
      admission_number: admissionNo,
      batch_name: batch,
      email,
      phone,
      username,
      password,
      cic_ad_no: cicAd,
      clg_ad_no: clgAd,
      academic_year_text: get(colAcademicYear),
      semester_text: get(colSemester),
      semester_period: get(colSession),
      course_stream: get(colStream),
      college_name: get(colCollege),
      subject_title: get(colSubjectTitle),
      proposal_app_no: get(colProposalApp),
      course_credit: get(colCredit),
      guide_name: get(colGuide),
      whatsapp_number: get(colWhatsapp),
      reference_notes: get(colReference),
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

