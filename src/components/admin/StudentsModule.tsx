import React, { useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Edit3,
  Eye,
  FileSpreadsheet,
  Plus,
  Search,
  Upload,
  UserCheck,
  UserX,
  Trash2,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { DAY_NAMES, formatDisplayDate } from '../../lib/dateUtils';
import {
  downloadCsv,
  downloadStudentCsvTemplate,
  downloadStudentExcelTemplate,
  mapMatrixToBulkStudentRows,
  parseCsvText,
  parseStudentSpreadsheetFile,
  type ParsedBulkStudentRow,
} from '../../lib/exportUtils';
import { dataService } from '../../services/dataService';
import { formatStudentSubjects } from '../../lib/studentUtils';
import {
  ACADEMIC_STAGE_META,
  formatOffCourseSlotLabel,
  isSlotOffCourseForStudent,
  resolveStudentTimetableContext,
} from '../../lib/timetableUtils';
import { EmptyState, Modal, PageHeader, PaginationBar, StatusLabel } from '../ui/CommonUI';

interface StudentRow {
  studentId: string;
  profileId: string;
  fullName: string;
  admissionNumber: string;
  batchName: string;
  email: string;
  phone: string;
  username: string;
  isActive: boolean;
  mentorName: string;
  subjectsLabel: string;
  enrolledInActiveYear: boolean;
  // CIC Academic & Subject Details
  cicAdNo?: string;
  clgAdNo?: string;
  academicYearText?: string;
  semesterText?: string;
  semesterPeriod?: string;
  courseStream?: string;
  collegeName?: string;
  subjectTitle?: string;
  proposalAppNo?: string;
  courseCredit?: string;
  guideName?: string;
  whatsappNumber?: string;
  referenceNotes?: string;
}

export const StudentsModule: React.FC = () => {
  const { db, session, activeYear, refresh, notify, confirmAction } = useApp();

  const [search, setSearch] = useState('');
  const [batchFilter, setBatchFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'name' | 'admission'>('admission');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // Create / Edit Modal State (Basic & Credentials)
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [admissionNumber, setAdmissionNumber] = useState('');
  const [batchName, setBatchName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // CIC Academic Details State (matching official CIC form)
  const [cicAdNo, setCicAdNo] = useState('');
  const [clgAdNo, setClgAdNo] = useState('');
  const [academicYearText, setAcademicYearText] = useState('2026-27');
  const [semesterText, setSemesterText] = useState('Semester 1');
  const [semesterPeriod, setSemesterPeriod] = useState<'Nov' | 'May'>('Nov');
  const [courseStream, setCourseStream] = useState<string>('Wafy');
  const [collegeName, setCollegeName] = useState('KKHM Islamic & Arts College');

  // CIC Subject Details State
  const [subjectTitle, setSubjectTitle] = useState('');
  const [proposalAppNo, setProposalAppNo] = useState('');
  const [courseCredit, setCourseCredit] = useState('4');
  const [guideName, setGuideName] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [referenceNotes, setReferenceNotes] = useState('');

  // Bulk Excel / CSV Import Modal State
  const [importOpen, setImportOpen] = useState(false);
  const [importMode, setImportMode] = useState<'excel' | 'paste'>('excel');
  const [uploadedFileName, setUploadedFileName] = useState<string>('');
  const [parsedBulkRows, setParsedBulkRows] = useState<ParsedBulkStudentRow[]>([]);
  const [csvText, setCsvText] = useState(
    'Name of Student *,CIC Ad No,Clg Ad No *,Class / Department *,Academic Year,Semester,Session (Nov/May),Course Stream,College Affl. & Name,Subject Title,Off Course Proposal Application Number,Credit,Name of Guide,Phone Number,Whatsapp Number,Reference,Username *,Password *\nRashid Ali P,CIC2601,KKHM2605,Degree 1st Year,2026-27,Semester 1,Nov,Wafy,KKHM Islamic & Arts College,Tafsir Studies,PROP-2026-088,4,Usthad Rashid,+91 97450 40105,+91 97450 40105,Tafsir al-Qurtubi,student7,Student@2026'
  );
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importingBulk, setImportingBulk] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 7-Tab Student Profile Modal State
  const [viewingStudentId, setViewingStudentId] = useState<string | null>(null);
  const [profileTab, setProfileTab] = useState<
    'overview' | 'enrollments' | 'mentors' | 'timetable' | 'reports' | 'subjects' | 'history'
  >('overview');

  const rows: StudentRow[] = useMemo(() => {
    if (!db || !activeYear) return [];
    return db.students.map((stu) => {
      const prof = db.profiles.find((p) => p.id === stu.profile_id);
      const ma = db.mentor_assignments.find(
        (m) => m.student_id === stu.id && m.academic_year_id === activeYear.id && m.is_active
      );
      const mentor = db.mentors.find((m) => m.id === ma?.mentor_id);
      const mentorProf = db.profiles.find((p) => p.id === mentor?.profile_id);
      const enr = db.student_academic_enrollments.find(
        (e) => e.student_id === stu.id && e.academic_year_id === activeYear.id
      );
      return {
        studentId: stu.id,
        profileId: stu.profile_id,
        fullName: prof?.full_name || 'Unknown',
        admissionNumber: stu.admission_number,
        batchName: enr?.class_batch || stu.batch_name,
        email: prof?.email || '',
        phone: prof?.phone || '',
        username: prof?.username || '',
        isActive: prof?.is_active ?? true,
        mentorName: mentorProf?.full_name || 'Unassigned',
        subjectsLabel: formatStudentSubjects(db, stu.id, activeYear.id),
        enrolledInActiveYear: Boolean(enr),
        cicAdNo: stu.cic_ad_no,
        clgAdNo: stu.clg_ad_no || stu.admission_number,
        academicYearText: stu.academic_year_text,
        semesterText: stu.semester_text,
        semesterPeriod: stu.semester_period,
        courseStream: stu.course_stream,
        collegeName: stu.college_name,
        subjectTitle: stu.subject_title,
        proposalAppNo: stu.proposal_app_no,
        courseCredit: stu.course_credit,
        guideName: stu.guide_name,
        whatsappNumber: stu.whatsapp_number,
        referenceNotes: stu.reference_notes,
      };
    });
  }, [db, activeYear]);

  const batches = useMemo(() => Array.from(new Set(rows.map((r) => r.batchName))).sort(), [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => {
        if (batchFilter !== 'all' && r.batchName !== batchFilter) return false;
        if (statusFilter === 'active' && !r.isActive) return false;
        if (statusFilter === 'inactive' && r.isActive) return false;
        if (statusFilter === 'enrolled' && !r.enrolledInActiveYear) return false;
        if (q) {
          return (
            r.fullName.toLowerCase().includes(q) ||
            r.admissionNumber.toLowerCase().includes(q) ||
            r.username.toLowerCase().includes(q) ||
            r.mentorName.toLowerCase().includes(q) ||
            r.subjectsLabel.toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) =>
        sortBy === 'name'
          ? a.fullName.localeCompare(b.fullName)
          : a.admissionNumber.localeCompare(b.admissionNumber)
      );
  }, [rows, search, batchFilter, statusFilter, sortBy]);

  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  if (!db || !session || !activeYear) return null;

  const openCreate = () => {
    setEditingId(null);
    setFullName('');
    setAdmissionNumber('');
    setBatchName(batches[0] || 'Degree 1st Year');
    setEmail('');
    setPhone('');
    setUsername('');
    setPassword('');
    setIsActive(true);
    // Reset CIC Details
    setCicAdNo('');
    setClgAdNo('');
    setAcademicYearText(activeYear.name || '2026-27');
    setSemesterText('Semester 1');
    setSemesterPeriod('Nov');
    setCourseStream('Wafy');
    setCollegeName('KKHM Islamic & Arts College');
    // Reset Subject Details
    setSubjectTitle('');
    setProposalAppNo('');
    setCourseCredit('4');
    setGuideName('');
    setWhatsappNumber('');
    setReferenceNotes('');
    setFormError(null);
    setEditorOpen(true);
  };

  const openEdit = (row: StudentRow) => {
    setEditingId(row.studentId);
    setFullName(row.fullName);
    setAdmissionNumber(row.admissionNumber);
    setBatchName(row.batchName);
    setEmail(row.email);
    setPhone(row.phone);
    setUsername(row.username);
    setPassword('');
    setIsActive(row.isActive);
    // Populate CIC Details
    setCicAdNo(row.cicAdNo || '');
    setClgAdNo(row.clgAdNo || row.admissionNumber || '');
    setAcademicYearText(row.academicYearText || activeYear.name || '2026-27');
    setSemesterText(row.semesterText || 'Semester 1');
    setSemesterPeriod((row.semesterPeriod === 'May' ? 'May' : 'Nov') as 'Nov' | 'May');
    setCourseStream(row.courseStream || 'Wafy');
    setCollegeName(row.collegeName || 'KKHM Islamic & Arts College');
    // Populate Subject Details
    setSubjectTitle(row.subjectTitle || '');
    setProposalAppNo(row.proposalAppNo || '');
    setCourseCredit(row.courseCredit || '4');
    setGuideName(row.guideName || '');
    setWhatsappNumber(row.whatsappNumber || row.phone || '');
    setReferenceNotes(row.referenceNotes || '');
    setFormError(null);
    setEditorOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    const finalAdmissionNo = clgAdNo.trim() || admissionNumber.trim();
    const finalUsername = username.trim() || finalAdmissionNo.toLowerCase().replace(/[^a-z0-9]/g, '');
    const finalEmail = email.trim() || `${finalUsername}@kkhmcollege.edu.in`;

    try {
      if (editingId) {
        await dataService.updateStudent(session.profile, editingId, {
          full_name: fullName,
          admission_number: finalAdmissionNo,
          batch_name: batchName,
          email: finalEmail,
          phone,
          username: finalUsername,
          new_password: password || undefined,
          is_active: isActive,
          cic_ad_no: cicAdNo,
          clg_ad_no: finalAdmissionNo,
          academic_year_text: academicYearText,
          semester_text: semesterText,
          semester_period: semesterPeriod,
          course_stream: courseStream,
          college_name: collegeName,
          subject_title: subjectTitle,
          proposal_app_no: proposalAppNo,
          course_credit: courseCredit,
          guide_name: guideName,
          whatsapp_number: whatsappNumber,
          reference_notes: referenceNotes,
        });
        notify('success', `Student "${fullName}" updated successfully.`);
      } else {
        await dataService.createStudent(session.profile, {
          full_name: fullName,
          admission_number: finalAdmissionNo,
          batch_name: batchName,
          email: finalEmail,
          phone,
          username: finalUsername,
          password: password || 'Student@2026',
          academic_year_id: activeYear.id,
          is_active: isActive,
          cic_ad_no: cicAdNo,
          clg_ad_no: finalAdmissionNo,
          academic_year_text: academicYearText,
          semester_text: semesterText,
          semester_period: semesterPeriod,
          course_stream: courseStream,
          college_name: collegeName,
          subject_title: subjectTitle,
          proposal_app_no: proposalAppNo,
          course_credit: courseCredit,
          guide_name: guideName,
          whatsapp_number: whatsappNumber,
          reference_notes: referenceNotes,
        });
        notify('success', `Student "${fullName}" created and enrolled in ${activeYear.name}.`);
      }
      await refresh();
      setEditorOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to save student record.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = (row: StudentRow) => {
    confirmAction({
      title: row.isActive ? `Deactivate ${row.fullName}?` : `Activate ${row.fullName}?`,
      description: row.isActive
        ? 'Deactivated students cannot log in, but all historical reports and academic records remain safely preserved.'
        : 'Reactivating this account will restore login access immediately.',
      confirmLabel: row.isActive ? 'Deactivate' : 'Activate',
      tone: row.isActive ? 'danger' : 'primary',
      onConfirm: async () => {
        await dataService.updateUserCredentials(
          session.profile,
          row.profileId,
          row.username,
          undefined,
          !row.isActive
        );
        await refresh();
        notify('success', `${row.fullName} is now ${row.isActive ? 'deactivated' : 'active'}.`);
      },
    });
  };

  const handleDeleteStudent = (row: StudentRow) => {
    confirmAction({
      title: `Delete Student "${row.fullName}"?`,
      description: `Are you sure you want to permanently delete student "${row.fullName}" (Admission No: ${row.admissionNumber}, @${row.username})? This will permanently delete the student account, login access, and all associated academic enrollments and report records. This action cannot be undone.`,
      confirmLabel: 'Delete Student Permanently',
      tone: 'danger',
      onConfirm: async () => {
        try {
          await dataService.deleteStudent(session.profile, row.studentId);
          if (viewingStudentId === row.studentId) {
            setViewingStudentId(null);
          }
          if (editingId === row.studentId) {
            setEditorOpen(false);
          }
          await refresh();
          notify('success', `Student "${row.fullName}" was deleted permanently.`);
        } catch (err) {
          notify('error', err instanceof Error ? err.message : 'Unable to delete student record.');
        }
      },
    });
  };

  const handleExportCsv = () => {
    downloadCsv(
      `kkhm-students-${activeYear.name}.csv`,
      ['Full Name', 'Admission Number', 'Class / Batch', 'Username', 'Email', 'Assigned Mentor', 'Subject', 'Status'],
      filtered.map((r) => [
        r.fullName,
        r.admissionNumber,
        r.batchName,
        r.username,
        r.email,
        r.mentorName,
        r.subjectsLabel || 'Not assigned',
        r.isActive ? 'Active' : 'Inactive',
      ])
    );
    notify('success', `Exported ${filtered.length} student records to CSV.`);
  };

  const validatedBulkRows = useMemo(() => {
    const existingAdmissions = new Set(
      (db?.students || []).map((s) => s.admission_number.toLowerCase())
    );
    const existingUsernames = new Set(
      (db?.profiles || []).map((p) => p.username.toLowerCase())
    );
    const seenAdmissions = new Set<string>();
    const seenUsernames = new Set<string>();

    const sourceRows =
      importMode === 'excel'
        ? parsedBulkRows
        : mapMatrixToBulkStudentRows(parseCsvText(csvText));

    return sourceRows.map((r) => {
      const issues: string[] = [];
      if (!r.full_name) issues.push('Missing Full Name');
      if (!r.admission_number) issues.push('Missing Admission No.');
      if (!r.username) issues.push('Missing Username');
      if (!r.password || r.password.length < 6) issues.push('Password min 6 chars');

      const admKey = r.admission_number.toLowerCase();
      const userKey = r.username.toLowerCase();
      if (admKey) {
        if (existingAdmissions.has(admKey)) issues.push('Admission No. already exists');
        else if (seenAdmissions.has(admKey)) issues.push('Duplicate Admission No. in file');
        seenAdmissions.add(admKey);
      }
      if (userKey) {
        if (existingUsernames.has(userKey)) issues.push('Username already exists');
        else if (seenUsernames.has(userKey)) issues.push('Duplicate Username in file');
        seenUsernames.add(userKey);
      }

      return { ...r, issues, isValid: issues.length === 0 };
    });
  }, [db, importMode, parsedBulkRows, csvText]);

  const validBulkCount = validatedBulkRows.filter((r) => r.isValid).length;

  const handleFilePicked = async (file: File | undefined) => {
    if (!file) return;
    setImportErrors([]);
    try {
      const parsed = await parseStudentSpreadsheetFile(file);
      setUploadedFileName(file.name);
      setParsedBulkRows(parsed);
      if (parsed.length === 0) {
        setImportErrors([
          'No student rows were found in the uploaded file. Please fill in rows below the header row.',
        ]);
      }
    } catch (err) {
      setUploadedFileName(file.name);
      setParsedBulkRows([]);
      setImportErrors([
        err instanceof Error
          ? `Could not read spreadsheet: ${err.message}`
          : 'Could not read the uploaded Excel/CSV file.',
      ]);
    }
  };

  const handleBulkImport = async () => {
    setImportErrors([]);
    const validRows = validatedBulkRows.filter((r) => r.isValid);
    if (!validRows.length) {
      setImportErrors([
        'No valid student rows ready to import. Fix the highlighted validation errors or download the Excel template first.',
      ]);
      return;
    }

    setImportingBulk(true);
    const errs: string[] = [];
    let importedCount = 0;
    try {
      for (const row of validRows) {
        try {
          await dataService.createStudent(session.profile, {
            full_name: row.full_name,
            admission_number: row.admission_number,
            batch_name: row.batch_name || batches[0] || 'Degree 1st Year (Foundation Stream)',
            email: row.email || `${row.username}@kkhmcollege.edu.in`,
            phone: row.phone || '',
            username: row.username,
            password: row.password,
            academic_year_id: activeYear.id,
            is_active: true,
            cic_ad_no: row.cic_ad_no,
            clg_ad_no: row.clg_ad_no || row.admission_number,
            academic_year_text: row.academic_year_text,
            semester_text: row.semester_text,
            semester_period: row.semester_period,
            course_stream: row.course_stream,
            college_name: row.college_name,
            subject_title: row.subject_title,
            proposal_app_no: row.proposal_app_no,
            course_credit: row.course_credit,
            guide_name: row.guide_name,
            whatsapp_number: row.whatsapp_number,
            reference_notes: row.reference_notes,
          });
          importedCount++;
        } catch (err) {
          errs.push(
            `Row ${row.rowNumber} (${row.admission_number}): ${
              err instanceof Error ? err.message : 'Import failed'
            }`
          );
        }
      }
      await refresh();
      setImportErrors(errs);
      if (importedCount > 0) {
        notify('success', `Imported ${importedCount} student(s) into ${activeYear.name}.`);
      }
      if (errs.length === 0) {
        setImportOpen(false);
        setParsedBulkRows([]);
        setUploadedFileName('');
      }
    } finally {
      setImportingBulk(false);
    }
  };

  const viewedRow = rows.find((r) => r.studentId === viewingStudentId);

  return (
    <div>
      <PageHeader
        title="Student Management"
        subtitle={`Manage student records, login usernames & passwords, enrollments, and profiles for ${activeYear.name}.`}
        actions={
          <>
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" /> Export CSV
            </button>
            <button
              type="button"
              onClick={() => {
                setImportErrors([]);
                setParsedBulkRows([]);
                setUploadedFileName('');
                setImportMode('excel');
                setImportOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#1E3A5F] bg-white px-3.5 py-2 text-xs font-semibold text-[#1E3A5F] hover:bg-slate-50 cursor-pointer"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" /> Bulk Add (Excel)
            </button>
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#1E3A5F] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#162C49] cursor-pointer"
            >
              <Plus className="h-4 w-4" /> Add Single Student
            </button>
          </>
        }
      />

      {/* Filters Bar */}
      <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="relative">
          <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search name, admission no, username..."
            className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-xs focus:border-[#1E3A5F] focus:outline-none"
          />
        </div>
        <select
          value={batchFilter}
          onChange={(e) => {
            setBatchFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs focus:border-[#1E3A5F] focus:outline-none"
        >
          <option value="all">All Classes / Batches</option>
          {batches.map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs focus:border-[#1E3A5F] focus:outline-none"
        >
          <option value="all">All Accounts</option>
          <option value="active">Active Only</option>
          <option value="inactive">Inactive Only</option>
          <option value="enrolled">Enrolled in {activeYear.name}</option>
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'name' | 'admission')}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs focus:border-[#1E3A5F] focus:outline-none"
        >
          <option value="admission">Sort by Admission No.</option>
          <option value="name">Sort by Student Name</option>
        </select>
      </div>

      {/* Students Table */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 font-semibold">Student Name</th>
                <th className="px-4 py-3 font-semibold">Admission No.</th>
                <th className="px-4 py-3 font-semibold">Class / Batch</th>
                <th className="px-4 py-3 font-semibold">Login Username</th>
                <th className="px-4 py-3 font-semibold">Assigned Mentor ({activeYear.name})</th>
                <th className="px-4 py-3 font-semibold">Subject</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginated.map((row) => (
                <tr key={row.studentId} className="hover:bg-slate-50/70">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-900">{row.fullName}</div>
                    <div className="text-[11px] text-slate-500">{row.email}</div>
                  </td>
                  <td className="px-4 py-3 font-mono font-medium text-slate-800">{row.admissionNumber}</td>
                  <td className="px-4 py-3 text-slate-700">{row.batchName}</td>
                  <td className="px-4 py-3 font-mono text-slate-600">@{row.username}</td>
                  <td className="px-4 py-3 text-slate-700">{row.mentorName}</td>
                  <td className="px-4 py-3">
                    {row.subjectsLabel ? (
                      <span className="font-medium text-teal-800">{row.subjectsLabel}</span>
                    ) : (
                      <span className="text-slate-400">Not assigned</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusLabel status={row.isActive ? 'active' : 'inactive'} />
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setViewingStudentId(row.studentId);
                          setProfileTab('overview');
                        }}
                        className="rounded-md border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
                        title="View 7-Tab Profile"
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(row)}
                        className="rounded-md border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100 hover:text-[#1E3A5F] cursor-pointer"
                        title="Edit Student & Login Credentials"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleActive(row)}
                        className="rounded-md border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100 cursor-pointer"
                        title={row.isActive ? 'Deactivate Account' : 'Activate Account'}
                      >
                        {row.isActive ? (
                          <UserX className="h-3.5 w-3.5 text-red-600" />
                        ) : (
                          <UserCheck className="h-3.5 w-3.5 text-emerald-600" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteStudent(row)}
                        className="rounded-md border border-red-200 p-1.5 text-red-600 hover:bg-red-50 hover:text-red-700 cursor-pointer"
                        title="Delete Student Permanently"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!paginated.length && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                    No students matched your filter criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <PaginationBar page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} />
      </div>

      {/* Add / Edit Student Modal (with Complete CIC Form & Admin Credentials) */}
      <Modal
        open={editorOpen}
        title={editingId ? 'Edit Student & CIC Form Details' : 'Add New Student (CIC Registration)'}
        subtitle="Complete student academic registration matching the Coordination of Islamic Colleges (CIC) Off-Course Form."
        onClose={() => setEditorOpen(false)}
        maxWidth="xl"
      >
        {formError && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800">
            {formError}
          </div>
        )}
        <form onSubmit={handleSave} className="space-y-6">
          {/* Section 1: CIC Academic & Institutional Details */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-3">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#1E3A5F]">
                  1. Coordination of Islamic Colleges (CIC) — Student Details
                </h4>
                <p className="text-[11px] text-slate-500">Official academic stream, admission and semester information</p>
              </div>
              <span className="text-[10px] font-semibold text-slate-400 bg-white border border-slate-200 rounded px-2 py-0.5">
                ISO 9001:2015
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700">Name of Student *</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Muhammed Rashid P"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium focus:border-[#1E3A5F] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">CIC Ad No</label>
                <input
                  type="text"
                  value={cicAdNo}
                  onChange={(e) => setCicAdNo(e.target.value)}
                  placeholder="e.g. CIC-2026-091"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono focus:border-[#1E3A5F] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Clg Ad No (College Admission No) *</label>
                <input
                  type="text"
                  required
                  value={admissionNumber}
                  onChange={(e) => {
                    setAdmissionNumber(e.target.value);
                    if (!clgAdNo) setClgAdNo(e.target.value);
                  }}
                  placeholder="e.g. KKHM2605"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono font-semibold focus:border-[#1E3A5F] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Class / Department *</label>
                <input
                  type="text"
                  required
                  value={batchName}
                  onChange={(e) => setBatchName(e.target.value)}
                  placeholder="e.g. Degree 1st Year"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-[#1E3A5F] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Academic Year</label>
                <input
                  type="text"
                  value={academicYearText}
                  onChange={(e) => setAcademicYearText(e.target.value)}
                  placeholder="e.g. 2026-27"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono focus:border-[#1E3A5F] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Semester</label>
                <input
                  type="text"
                  value={semesterText}
                  onChange={(e) => setSemesterText(e.target.value)}
                  placeholder="e.g. Semester 1"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-[#1E3A5F] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Semester Session</label>
                <div className="mt-1 flex items-center gap-4 py-1.5">
                  <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-800">
                    <input
                      type="radio"
                      name="semesterSession"
                      checked={semesterPeriod === 'Nov'}
                      onChange={() => setSemesterPeriod('Nov')}
                      className="text-[#1E3A5F] focus:ring-[#1E3A5F]"
                    />
                    Nov Session
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-800">
                    <input
                      type="radio"
                      name="semesterSession"
                      checked={semesterPeriod === 'May'}
                      onChange={() => setSemesterPeriod('May')}
                      className="text-[#1E3A5F] focus:ring-[#1E3A5F]"
                    />
                    May Session
                  </label>
                </div>
              </div>

              <div className="sm:col-span-2 md:col-span-3">
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Course Stream *</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                  {[
                    'Wafy',
                    'Wafy Arts',
                    'Wafiyya',
                    'Wafiyya Day',
                    'Wafiyya Arts',
                    'Wafiyya Distance',
                  ].map((stream) => (
                    <button
                      key={stream}
                      type="button"
                      onClick={() => setCourseStream(stream)}
                      className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all text-center cursor-pointer ${
                        courseStream.toLowerCase() === stream.toLowerCase()
                          ? 'border-[#1E3A5F] bg-[#1E3A5F] text-white shadow-sm'
                          : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'
                      }`}
                    >
                      {courseStream.toLowerCase() === stream.toLowerCase() ? '✓ ' : ''}{stream}
                    </button>
                  ))}
                </div>
              </div>

              <div className="sm:col-span-2 md:col-span-3">
                <label className="block text-xs font-semibold text-slate-700">College Affl. &amp; Name</label>
                <input
                  type="text"
                  value={collegeName}
                  onChange={(e) => setCollegeName(e.target.value)}
                  placeholder="e.g. KKHM Islamic & Arts College"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-[#1E3A5F] focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Subject Details */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
            <div className="border-b border-slate-200 pb-2 mb-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#1E3A5F]">
                2. Subject &amp; Off-Course Research Details
              </h4>
              <p className="text-[11px] text-slate-500">Proposal application, credit weight, assigned guide and reference text</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
              <div className="sm:col-span-2 md:col-span-3">
                <label className="block text-xs font-semibold text-slate-700">Subject Title</label>
                <input
                  type="text"
                  value={subjectTitle}
                  onChange={(e) => setSubjectTitle(e.target.value)}
                  placeholder="e.g. Tafsir Studies & Arabic Grammar Analysis"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-[#1E3A5F] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Off Course Proposal Application Number
                </label>
                <input
                  type="text"
                  value={proposalAppNo}
                  onChange={(e) => setProposalAppNo(e.target.value)}
                  placeholder="e.g. PROP-2026-042"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono focus:border-[#1E3A5F] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Credit</label>
                <input
                  type="text"
                  value={courseCredit}
                  onChange={(e) => setCourseCredit(e.target.value)}
                  placeholder="e.g. 4"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono focus:border-[#1E3A5F] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Name of Guide</label>
                <input
                  type="text"
                  value={guideName}
                  onChange={(e) => setGuideName(e.target.value)}
                  placeholder="e.g. Usthad Rashid Ali"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-[#1E3A5F] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Phone Number</label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. +91 98470 50101"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-[#1E3A5F] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Whatsapp Number</label>
                <input
                  type="text"
                  value={whatsappNumber}
                  onChange={(e) => setWhatsappNumber(e.target.value)}
                  placeholder="e.g. +91 98470 50101"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-[#1E3A5F] focus:outline-none"
                />
              </div>

              <div className="sm:col-span-2 md:col-span-3">
                <label className="block text-xs font-semibold text-slate-700">Reference</label>
                <textarea
                  rows={2}
                  value={referenceNotes}
                  onChange={(e) => setReferenceNotes(e.target.value)}
                  placeholder="e.g. Al-Jami li-Ahkam al-Quran by Imam al-Qurtubi, vol. 3, Cairo edition."
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs focus:border-[#1E3A5F] focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Login Credentials & System Access (Admin Managed) */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
            <div className="border-b border-slate-200 pb-2 mb-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#1E3A5F]">
                3. System Login Access (Admin Controlled)
              </h4>
              <p className="text-[11px] text-slate-500">Student login username, password credentials and active status</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700">Login Username *</label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. kkhm2605"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono focus:border-[#1E3A5F] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  {editingId ? 'Reset Password (optional)' : 'Initial Password * (min 6 chars)'}
                </label>
                <input
                  type="text"
                  required={!editingId}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={editingId ? 'Leave blank to keep current' : 'e.g. Student@2026'}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono focus:border-[#1E3A5F] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Email Address *</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="student@kkhmcollege.edu.in"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-[#1E3A5F] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Account Status</label>
                <select
                  value={isActive ? 'active' : 'inactive'}
                  onChange={(e) => setIsActive(e.target.value === 'active')}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-[#1E3A5F] focus:outline-none"
                >
                  <option value="active">Active (Login Enabled)</option>
                  <option value="inactive">Inactive (Login Blocked)</option>
                </select>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-200">
            {editingId ? (
              <button
                type="button"
                onClick={() => {
                  const targetRow = rows.find((r) => r.studentId === editingId);
                  if (targetRow) {
                    handleDeleteStudent(targetRow);
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 transition-colors cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete Student
              </button>
            ) : <div />}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setEditorOpen(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-[#1E3A5F] px-5 py-2 text-sm font-semibold text-white hover:bg-[#162C49] disabled:opacity-60 cursor-pointer shadow-sm"
              >
                {saving ? 'Saving...' : editingId ? 'Save Student Changes' : 'Register Student'}
              </button>
            </div>
          </div>
        </form>
      </Modal>

      {/* Bulk Excel / CSV Student Upload Modal */}
      <Modal
        open={importOpen}
        title="Bulk Add Students (Excel / CSV)"
        subtitle={`Download the ready Excel template, enter student details, and upload to enroll students in ${activeYear.name}.`}
        onClose={() => setImportOpen(false)}
        maxWidth="xl"
      >
        <div className="space-y-5">
          {/* Step 1: Ready-to-Download Excel Template */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="min-w-0">
              <div className="text-xs font-bold text-slate-900">
                Step 1 · Download Official CIC-Formatted Template
              </div>
              <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                Includes all 18 official CIC fields: <code className="font-mono">Name of Student, CIC Ad No, Clg Ad No, Class / Department, Academic Year, Semester, Session (Nov/May), Course Stream (Wafy/Wafiyya), College Name, Subject Title, Proposal App No, Credit, Guide Name, Phone, Whatsapp, Reference, Username, Password</code>, sample data and an Instructions guide.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  downloadStudentExcelTemplate(
                    batches[0] || 'Degree 1st Year (Foundation Stream)'
                  );
                  notify('success', 'Excel template (.xlsx) downloaded.');
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#0D9488] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#0F766E] cursor-pointer"
              >
                <FileSpreadsheet className="h-4 w-4" /> Download Excel Template (.xlsx)
              </button>
              <button
                type="button"
                onClick={() => {
                  downloadStudentCsvTemplate(
                    batches[0] || 'Degree 1st Year (Foundation Stream)'
                  );
                  notify('success', 'CSV template downloaded.');
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                <Download className="h-3.5 w-3.5" /> CSV Template
              </button>
            </div>
          </div>

          {/* Input Mode Switch */}
          <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
            <button
              type="button"
              onClick={() => setImportMode('excel')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                importMode === 'excel'
                  ? 'bg-[#1E3A5F] text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Upload Excel / CSV File (.xlsx, .xls, .csv)
            </button>
            <button
              type="button"
              onClick={() => setImportMode('paste')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer ${
                importMode === 'paste'
                  ? 'bg-[#1E3A5F] text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Paste CSV Text
            </button>
          </div>

          {/* Step 2: Upload Spreadsheet or Paste CSV */}
          {importMode === 'excel' ? (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  void handleFilePicked(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  void handleFilePicked(e.dataTransfer.files?.[0]);
                }}
                className="rounded-xl border-2 border-dashed border-slate-300 bg-white px-6 py-7 text-center hover:border-[#1E3A5F] hover:bg-slate-50/70 transition-colors cursor-pointer"
              >
                <Upload className="h-7 w-7 text-[#1E3A5F] mx-auto" />
                <div className="mt-2 text-sm font-semibold text-slate-900">
                  {uploadedFileName
                    ? `Selected file: ${uploadedFileName}`
                    : 'Click to upload completed Excel (.xlsx) or CSV file'}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Drag and drop here, or browse from your computer. Supports English and Malayalam text.
                </p>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-xs text-slate-600 mb-2">
                Paste comma-separated rows with header:{' '}
                <code className="font-mono">
                  Full Name, Admission Number, Class Batch, Email, Phone, Username, Password
                </code>
              </p>
              <textarea
                rows={5}
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                className="w-full rounded-lg border border-slate-300 p-3 font-mono text-xs focus:border-[#1E3A5F] focus:outline-none"
              />
            </div>
          )}

          {/* Step 3: Live Validation Preview Table */}
          {validatedBulkRows.length > 0 && (
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <div className="bg-slate-50 border-b border-slate-200 px-4 py-2.5 flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-900">
                  Step 2 · Preview &amp; Validation ({validatedBulkRows.length} rows detected)
                </span>
                <span className="font-mono tabular-nums text-slate-700">
                  <strong className="text-emerald-700">{validBulkCount} valid</strong> ·{' '}
                  <strong className="text-red-700">
                    {validatedBulkRows.length - validBulkCount} with issues
                  </strong>
                </span>
              </div>
              <div className="max-h-64 overflow-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-white text-slate-500 border-b border-slate-200 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Row</th>
                      <th className="px-3 py-2 font-semibold">Full Name</th>
                      <th className="px-3 py-2 font-semibold">CIC / Clg Ad No</th>
                      <th className="px-3 py-2 font-semibold">Stream</th>
                      <th className="px-3 py-2 font-semibold">Subject Title</th>
                      <th className="px-3 py-2 font-semibold">Username</th>
                      <th className="px-3 py-2 font-semibold">Validation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {validatedBulkRows.map((r) => (
                      <tr key={r.rowNumber} className={r.isValid ? 'bg-white' : 'bg-red-50/40'}>
                        <td className="px-3 py-2 font-mono text-slate-500">{r.rowNumber}</td>
                        <td className="px-3 py-2 font-medium text-slate-900">{r.full_name || '—'}</td>
                        <td className="px-3 py-2 font-mono text-slate-700">
                          <div>{r.admission_number || '—'}</div>
                          {r.cic_ad_no && <div className="text-[10px] text-slate-400">CIC: {r.cic_ad_no}</div>}
                        </td>
                        <td className="px-3 py-2 text-slate-700">
                          <span className="inline-block rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium">
                            {r.course_stream || 'Wafy'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-slate-800 max-w-[200px] truncate" title={r.subject_title || ''}>
                          {r.subject_title || '—'}
                        </td>
                        <td className="px-3 py-2 font-mono text-slate-700">
                          {r.username ? `@${r.username}` : '—'}
                        </td>
                        <td className="px-3 py-2">
                          {r.isValid ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Ready
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-red-700 font-medium">
                              <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {r.issues.join(', ')}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {importErrors.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800 space-y-1">
              <div className="font-semibold">Import Messages:</div>
              {importErrors.map((e, i) => (
                <div key={i}>• {e}</div>
              ))}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setImportOpen(false)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={importingBulk || validBulkCount === 0}
              onClick={handleBulkImport}
              className="rounded-lg bg-[#1E3A5F] px-4 py-2 text-sm font-semibold text-white hover:bg-[#162C49] disabled:opacity-50 cursor-pointer"
            >
              {importingBulk
                ? 'Importing Students...'
                : `Import ${validBulkCount} Valid Student${validBulkCount === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      </Modal>

      {/* 7-Tab Student Profile Modal */}
      <Modal
        open={Boolean(viewedRow)}
        title={viewedRow ? `${viewedRow.fullName} (${viewedRow.admissionNumber})` : 'Student Profile'}
        subtitle={viewedRow ? `${viewedRow.batchName} · @${viewedRow.username}` : undefined}
        onClose={() => setViewingStudentId(null)}
        maxWidth="xl"
      >
        {viewedRow && (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3 mb-4">
              <div className="flex flex-wrap gap-1">
                {(
                  [
                    ['overview', 'Overview'],
                    ['enrollments', 'Academic Enrollments'],
                    ['mentors', 'Mentor History'],
                    ['timetable', 'Timetable'],
                    ['reports', 'Activity Reports'],
                    ['subjects', 'Subject History'],
                    ['history', 'Academic History'],
                  ] as const
                ).map(([tabKey, tabLabel]) => (
                  <button
                    key={tabKey}
                    type="button"
                    onClick={() => setProfileTab(tabKey)}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                      profileTab === tabKey
                        ? 'bg-[#1E3A5F] text-white'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {tabLabel}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => handleDeleteStudent(viewedRow)}
                className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 transition-colors cursor-pointer"
                title="Delete Student Record"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete Student
              </button>
            </div>

            {profileTab === 'overview' && (
              <div className="space-y-4 text-xs">
                {/* Official Coordination of Islamic Colleges (CIC) Form Card */}
                <div className="rounded-xl border border-slate-300 bg-white shadow-sm overflow-hidden">
                  <div className="bg-[#1E3A5F] text-white p-4 text-center">
                    <div className="text-sm font-bold tracking-wide uppercase">
                      Coordination of Islamic Colleges CIC
                    </div>
                    <div className="text-[11px] text-slate-200 mt-0.5">
                      Executive Member, Islamic Universities League · ISO 9001:2015 Certified
                    </div>
                    <div className="inline-block mt-2 rounded bg-amber-400/20 px-3 py-0.5 text-xs font-semibold text-amber-200 border border-amber-300/30">
                      OFF-COURSE ACADEMIC REGISTRATION FORM
                    </div>
                  </div>

                  <div className="p-4 space-y-4">
                    {/* Student & Institutional Details Table matching the physical form */}
                    <div className="border border-slate-300 rounded-lg overflow-hidden">
                      <table className="w-full text-left text-xs border-collapse">
                        <tbody>
                          <tr className="border-b border-slate-200">
                            <td className="w-44 bg-slate-50 px-3.5 py-2 font-semibold text-slate-700 border-r border-slate-200">
                              Name of Student
                            </td>
                            <td colSpan={3} className="px-3.5 py-2 font-bold text-slate-900 text-sm">
                              {viewedRow.fullName}
                            </td>
                          </tr>
                          <tr className="border-b border-slate-200">
                            <td className="bg-slate-50 px-3.5 py-2 font-semibold text-slate-700 border-r border-slate-200">
                              CIC Ad No
                            </td>
                            <td className="px-3.5 py-2 font-mono font-medium text-slate-800 border-r border-slate-200">
                              {viewedRow.cicAdNo || '—'}
                            </td>
                            <td className="w-32 bg-slate-50 px-3.5 py-2 font-semibold text-slate-700 border-r border-slate-200">
                              Clg Ad No:
                            </td>
                            <td className="px-3.5 py-2 font-mono font-bold text-slate-900">
                              {viewedRow.clgAdNo || viewedRow.admissionNumber}
                            </td>
                          </tr>
                          <tr className="border-b border-slate-200">
                            <td className="bg-slate-50 px-3.5 py-2 font-semibold text-slate-700 border-r border-slate-200">
                              Class / Department
                            </td>
                            <td colSpan={3} className="px-3.5 py-2 text-slate-800 font-medium">
                              {viewedRow.batchName}
                            </td>
                          </tr>
                          <tr className="border-b border-slate-200">
                            <td className="bg-slate-50 px-3.5 py-2 font-semibold text-slate-700 border-r border-slate-200">
                              Academic Year
                            </td>
                            <td className="px-3.5 py-2 font-medium text-slate-800 border-r border-slate-200">
                              {viewedRow.academicYearText || activeYear.name}
                            </td>
                            <td className="bg-slate-50 px-3.5 py-2 font-semibold text-slate-700 border-r border-slate-200">
                              Semester &amp; Session
                            </td>
                            <td className="px-3.5 py-2">
                              <span className="font-semibold text-slate-900 mr-2">{viewedRow.semesterText || 'Semester 1'}</span>
                              <span
                                className={`inline-block rounded px-2 py-0.5 text-[11px] font-bold ${
                                  viewedRow.semesterPeriod === 'May'
                                    ? 'bg-purple-100 text-purple-800 border border-purple-200'
                                    : 'bg-blue-100 text-blue-800 border border-blue-200'
                                }`}
                              >
                                {viewedRow.semesterPeriod || 'Nov'} Session
                              </span>
                            </td>
                          </tr>
                          <tr className="border-b border-slate-200">
                            <td className="bg-slate-50 px-3.5 py-2 font-semibold text-slate-700 border-r border-slate-200">
                              Course Stream
                            </td>
                            <td colSpan={3} className="px-3.5 py-2">
                              <div className="flex flex-wrap gap-2">
                                {[
                                  'Wafy',
                                  'Wafy Arts',
                                  'Wafiyya',
                                  'Wafiyya Day',
                                  'Wafiyya Arts',
                                  'Wafiyya Distance',
                                ].map((st) => {
                                  const isSelected =
                                    (viewedRow.courseStream || 'Wafy').toLowerCase() === st.toLowerCase();
                                  return (
                                    <span
                                      key={st}
                                      className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold ${
                                        isSelected
                                          ? 'bg-[#1E3A5F] text-white shadow-xs'
                                          : 'bg-slate-100 text-slate-400'
                                      }`}
                                    >
                                      {isSelected ? '✓ ' : '□ '}
                                      {st}
                                    </span>
                                  );
                                })}
                              </div>
                            </td>
                          </tr>
                          <tr>
                            <td className="bg-slate-50 px-3.5 py-2 font-semibold text-slate-700 border-r border-slate-200">
                              College Affl. &amp; Name
                            </td>
                            <td colSpan={3} className="px-3.5 py-2 text-slate-800 font-medium">
                              {viewedRow.collegeName || 'KKHM Islamic & Arts College'}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {/* Subject Details Table matching the physical form */}
                    <div className="border border-slate-300 rounded-lg overflow-hidden">
                      <div className="bg-slate-100 px-3 py-2 font-bold text-slate-800 text-xs border-b border-slate-300 uppercase tracking-wider text-center">
                        Subject Details
                      </div>
                      <table className="w-full text-left text-xs border-collapse">
                        <tbody>
                          <tr className="border-b border-slate-200">
                            <td className="w-44 bg-slate-50 px-3.5 py-2 font-semibold text-slate-700 border-r border-slate-200">
                              Title
                            </td>
                            <td colSpan={3} className="px-3.5 py-2 font-bold text-slate-900">
                              {viewedRow.subjectTitle || '—'}
                            </td>
                          </tr>
                          <tr className="border-b border-slate-200">
                            <td className="bg-slate-50 px-3.5 py-2 font-semibold text-slate-700 border-r border-slate-200">
                              Off Course Proposal Application Number
                            </td>
                            <td className="px-3.5 py-2 font-mono font-medium text-slate-800 border-r border-slate-200">
                              {viewedRow.proposalAppNo || '—'}
                            </td>
                            <td className="w-24 bg-slate-50 px-3.5 py-2 font-semibold text-slate-700 border-r border-slate-200">
                              Credit
                            </td>
                            <td className="px-3.5 py-2 font-bold text-slate-900">
                              {viewedRow.courseCredit || '4'}
                            </td>
                          </tr>
                          <tr className="border-b border-slate-200">
                            <td className="bg-slate-50 px-3.5 py-2 font-semibold text-slate-700 border-r border-slate-200">
                              Name of Guide
                            </td>
                            <td colSpan={3} className="px-3.5 py-2 font-semibold text-slate-800">
                              {viewedRow.guideName || viewedRow.mentorName || '—'}
                            </td>
                          </tr>
                          <tr className="border-b border-slate-200">
                            <td className="bg-slate-50 px-3.5 py-2 font-semibold text-slate-700 border-r border-slate-200">
                              Phone Number
                            </td>
                            <td className="px-3.5 py-2 font-mono text-slate-700 border-r border-slate-200">
                              {viewedRow.phone || '—'}
                            </td>
                            <td className="bg-slate-50 px-3.5 py-2 font-semibold text-slate-700 border-r border-slate-200">
                              Whatsapp Number
                            </td>
                            <td className="px-3.5 py-2 font-mono text-slate-700">
                              {viewedRow.whatsappNumber || viewedRow.phone || '—'}
                            </td>
                          </tr>
                          <tr>
                            <td className="bg-slate-50 px-3.5 py-2 font-semibold text-slate-700 border-r border-slate-200 align-top">
                              Reference
                            </td>
                            <td colSpan={3} className="px-3.5 py-2 text-slate-800 whitespace-pre-wrap">
                              {viewedRow.referenceNotes || '—'}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {/* Login & Account Information */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="rounded-lg border border-slate-200 p-3 space-y-1.5 bg-slate-50/50">
                        <div className="font-semibold text-slate-800 text-[11px] mb-1">Account &amp; Login Details</div>
                        <div><span className="text-slate-500">Username:</span> <strong className="font-mono">@{viewedRow.username}</strong></div>
                        <div><span className="text-slate-500">Email:</span> <strong>{viewedRow.email}</strong></div>
                        <div className="flex items-center gap-2">
                          <span className="text-slate-500">Status:</span>
                          <StatusLabel status={viewedRow.isActive ? 'active' : 'inactive'} />
                        </div>
                      </div>
                      <div className="rounded-lg border border-slate-200 p-3 space-y-1.5 bg-slate-50/50">
                        <div className="font-semibold text-slate-800 text-[11px] mb-1">Academic Mentorship</div>
                        <div><span className="text-slate-500">Assigned Mentor:</span> <strong>{viewedRow.mentorName}</strong></div>
                        <div><span className="text-slate-500">Academic Year:</span> <strong>{activeYear.name}</strong></div>
                        <div><span className="text-slate-500">Enrolled:</span> <strong>{viewedRow.enrolledInActiveYear ? 'Yes (Active)' : 'Pending'}</strong></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {profileTab === 'enrollments' && (
              <div className="space-y-3">
                {!viewedRow.enrolledInActiveYear && (
                  <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                    <span>Not yet enrolled in active academic year {activeYear.name}.</span>
                    <button
                      type="button"
                      onClick={async () => {
                        await dataService.enrollStudentInYear(
                          session.profile,
                          viewedRow.studentId,
                          activeYear.id,
                          viewedRow.batchName
                        );
                        await refresh();
                        notify('success', `Enrolled ${viewedRow.fullName} in ${activeYear.name}.`);
                      }}
                      className="rounded-md bg-[#1E3A5F] px-3 py-1.5 text-xs font-semibold text-white cursor-pointer"
                    >
                      Enroll in {activeYear.name}
                    </button>
                  </div>
                )}
                <table className="w-full text-left text-xs border border-slate-200 rounded-lg overflow-hidden">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Academic Year</th>
                      <th className="px-3 py-2 font-semibold">Class / Batch</th>
                      <th className="px-3 py-2 font-semibold">Enrolled Date</th>
                      <th className="px-3 py-2 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {db.student_academic_enrollments
                      .filter((e) => e.student_id === viewedRow.studentId)
                      .map((e) => {
                        const y = db.academic_years.find((ay) => ay.id === e.academic_year_id);
                        return (
                          <tr key={e.id}>
                            <td className="px-3 py-2 font-semibold">{y?.name}</td>
                            <td className="px-3 py-2">{e.class_batch}</td>
                            <td className="px-3 py-2 font-mono">{formatDisplayDate(e.enrolled_at)}</td>
                            <td className="px-3 py-2"><StatusLabel status={e.status} /></td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}

            {profileTab === 'mentors' && (
              <table className="w-full text-left text-xs border border-slate-200">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Academic Year</th>
                    <th className="px-3 py-2 font-semibold">Mentor</th>
                    <th className="px-3 py-2 font-semibold">Assigned Date</th>
                    <th className="px-3 py-2 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {db.mentor_assignments
                    .filter((ma) => ma.student_id === viewedRow.studentId)
                    .map((ma) => {
                      const y = db.academic_years.find((ay) => ay.id === ma.academic_year_id);
                      const m = db.mentors.find((x) => x.id === ma.mentor_id);
                      const mp = db.profiles.find((p) => p.id === m?.profile_id);
                      return (
                        <tr key={ma.id}>
                          <td className="px-3 py-2 font-semibold">{y?.name}</td>
                          <td className="px-3 py-2">{mp?.full_name}</td>
                          <td className="px-3 py-2 font-mono">{formatDisplayDate(ma.assigned_date)}</td>
                          <td className="px-3 py-2"><StatusLabel status={ma.is_active ? 'active' : 'closed'} /></td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            )}

            {profileTab === 'timetable' && (() => {
              const ttCtx = resolveStudentTimetableContext(db, viewedRow.studentId, activeYear.id);
              const slots = ttCtx.templateSlots;
              if (!ttCtx.template || !slots.length) {
                return <EmptyState title="No Timetable Assigned" description={`Assign or configure a semester timetable for ${viewedRow.fullName} in the Timetable module.`} />;
              }
              return (
                <div className="space-y-2">
                  <div className="text-xs text-slate-600 flex flex-wrap items-center justify-between gap-2">
                    <span>
                      <strong className="text-slate-900">{ttCtx.template.name}</strong>
                      <span className="mx-2 text-slate-300">·</span>
                      <span>{ACADEMIC_STAGE_META[ttCtx.stage].display}</span>
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Highlighted cells show this student&apos;s Off-Course periods
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border border-slate-200">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="px-2.5 py-2 font-semibold">Day</th>
                          {Array.from({ length: 8 }, (_, i) => (
                            <th key={i} className="px-2.5 py-2 font-semibold">P{i + 1}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {[1, 2, 3, 4, 5, 6].map((d) => (
                          <tr key={d}>
                            <td className="px-2.5 py-2 font-semibold text-slate-700">{DAY_NAMES[d].short}</td>
                            {Array.from({ length: 8 }, (_, i) => {
                              const sl = slots.find((s) => s.day_of_week === d && s.period_number === i + 1);
                              const isOffCourse = isSlotOffCourseForStudent(
                                sl,
                                viewedRow.studentId,
                                ttCtx.stage,
                                ttCtx.usesStageConfig
                              );
                              if (!isOffCourse) {
                                return <td key={i} className="px-2.5 py-2 text-slate-400">—</td>;
                              }
                              const label = ttCtx.usesStageConfig
                                ? formatOffCourseSlotLabel(sl, ttCtx.stage, ttCtx.studentSubjectLabel)
                                : sl?.planned_activity || 'Off-Course';
                              return (
                                <td key={i} className="px-2.5 py-2 bg-teal-50/60 font-medium text-teal-900">
                                  {label}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}

            {profileTab === 'reports' && (
              <table className="w-full text-left text-xs border border-slate-200">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Unit</th>
                    <th className="px-3 py-2 font-semibold">Mode</th>
                    <th className="px-3 py-2 font-semibold">Status</th>
                    <th className="px-3 py-2 font-semibold">Submitted</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {db.report_submissions
                    .filter((s) => s.student_id === viewedRow.studentId && s.academic_year_id === activeYear.id)
                    .map((s) => (
                      <tr key={s.id}>
                        <td className="px-3 py-2 font-mono">{s.unit_key}</td>
                        <td className="px-3 py-2 capitalize">{s.entry_mode_snapshot} / {s.approval_mode_snapshot}</td>
                        <td className="px-3 py-2"><StatusLabel status={s.status} /></td>
                        <td className="px-3 py-2 font-mono">{formatDisplayDate(s.submitted_at?.slice(0, 10))}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}

            {profileTab === 'subjects' && (
              <table className="w-full text-left text-xs border border-slate-200">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Year</th>
                    <th className="px-3 py-2 font-semibold">Semester</th>
                    <th className="px-3 py-2 font-semibold">Subject</th>
                    <th className="px-3 py-2 font-semibold">Selection Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {db.student_subject_selections
                    .filter((sel) => sel.student_id === viewedRow.studentId)
                    .map((sel) => {
                      const y = db.academic_years.find((ay) => ay.id === sel.academic_year_id);
                      const sem = db.semesters.find((sm) => sm.id === sel.semester_id);
                      const sub = db.subjects.find((sb) => sb.id === sel.subject_id);
                      return (
                        <tr key={sel.id}>
                          <td className="px-3 py-2 font-semibold">{y?.name}</td>
                          <td className="px-3 py-2">{sem?.name}</td>
                          <td className="px-3 py-2">{sub?.name}</td>
                          <td className="px-3 py-2"><StatusLabel status={sel.selection_status} /></td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            )}

            {profileTab === 'history' && (
              <div className="space-y-3">
                {db.academic_years.map((y) => {
                  const enr = db.student_academic_enrollments.find(
                    (e) => e.student_id === viewedRow.studentId && e.academic_year_id === y.id
                  );
                  const subs = db.report_submissions.filter(
                    (s) => s.student_id === viewedRow.studentId && s.academic_year_id === y.id
                  );
                  return (
                    <div key={y.id} className="rounded-lg border border-slate-200 p-3.5 text-xs flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-semibold text-slate-900">{y.name}</span>
                        <span className="mx-2 text-slate-300">·</span>
                        <span className="text-slate-600">{enr ? enr.class_batch : 'Not Enrolled'}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-slate-600">{subs.length} report(s)</span>
                        <StatusLabel status={y.status} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};
