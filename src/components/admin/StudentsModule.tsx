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
  enrolledInActiveYear: boolean;
}

export const StudentsModule: React.FC = () => {
  const { db, session, activeYear, refresh, notify, confirmAction } = useApp();

  const [search, setSearch] = useState('');
  const [batchFilter, setBatchFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'name' | 'admission'>('admission');
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // Create / Edit Modal State
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

  // Bulk Excel / CSV Import Modal State
  const [importOpen, setImportOpen] = useState(false);
  const [importMode, setImportMode] = useState<'excel' | 'paste'>('excel');
  const [uploadedFileName, setUploadedFileName] = useState<string>('');
  const [parsedBulkRows, setParsedBulkRows] = useState<ParsedBulkStudentRow[]>([]);
  const [csvText, setCsvText] = useState(
    'Full Name *,Admission Number *,Class / Batch *,Email,Phone,Username *,Password *\nRashid Ali P,KKHM2605,Degree 1st Year (Foundation Stream),rashid.2605@kkhmcollege.edu.in,+91 97450 40105,student7,Student@2026'
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
        enrolledInActiveYear: Boolean(enr),
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
            r.mentorName.toLowerCase().includes(q)
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
    setBatchName(batches[0] || 'Degree 1st Year (Foundation Stream)');
    setEmail('');
    setPhone('');
    setUsername('');
    setPassword('');
    setIsActive(true);
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
    setFormError(null);
    setEditorOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      if (editingId) {
        await dataService.updateStudent(session.profile, editingId, {
          full_name: fullName,
          admission_number: admissionNumber,
          batch_name: batchName,
          email,
          phone,
          username,
          new_password: password || undefined,
          is_active: isActive,
        });
        notify('success', `Student "${fullName}" updated successfully.`);
      } else {
        await dataService.createStudent(session.profile, {
          full_name: fullName,
          admission_number: admissionNumber,
          batch_name: batchName,
          email,
          phone,
          username,
          password,
          academic_year_id: activeYear.id,
          is_active: isActive,
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

  const handleExportCsv = () => {
    downloadCsv(
      `kkhm-students-${activeYear.name}.csv`,
      ['Full Name', 'Admission Number', 'Class / Batch', 'Username', 'Email', 'Assigned Mentor', 'Status'],
      filtered.map((r) => [
        r.fullName,
        r.admissionNumber,
        r.batchName,
        r.username,
        r.email,
        r.mentorName,
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
                    </div>
                  </td>
                </tr>
              ))}
              {!paginated.length && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                    No students matched your filter criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <PaginationBar page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} />
      </div>

      {/* Add / Edit Student Modal (with Admin Username & Password Control) */}
      <Modal
        open={editorOpen}
        title={editingId ? 'Edit Student & Login Credentials' : 'Add New Student'}
        subtitle="Admin controls the student's login username and password directly."
        onClose={() => setEditorOpen(false)}
        maxWidth="lg"
      >
        {formError && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800">
            {formError}
          </div>
        )}
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700">Full Name *</label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#1E3A5F] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">Admission Number *</label>
              <input
                type="text"
                required
                value={admissionNumber}
                onChange={(e) => setAdmissionNumber(e.target.value)}
                placeholder="e.g. KKHM2605"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:border-[#1E3A5F] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">Class / Batch *</label>
              <input
                type="text"
                required
                value={batchName}
                onChange={(e) => setBatchName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#1E3A5F] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">Email Address *</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#1E3A5F] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">Contact Phone</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#1E3A5F] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">Account Status</label>
              <select
                value={isActive ? 'active' : 'inactive'}
                onChange={(e) => setIsActive(e.target.value === 'active')}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#1E3A5F] focus:outline-none"
              >
                <option value="active">Active (Login Enabled)</option>
                <option value="inactive">Inactive (Login Blocked)</option>
              </select>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200">
            <div className="text-xs font-semibold text-slate-900 mb-3">
              Login Credentials (Admin Controlled)
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700">Login Username *</label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. student7"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:border-[#1E3A5F] focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  {editingId ? 'Reset Password (leave blank to keep current)' : 'Initial Password * (min 6 chars)'}
                </label>
                <input
                  type="text"
                  required={!editingId}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={editingId ? 'Enter new password to reset' : 'e.g. Student@2026'}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:border-[#1E3A5F] focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
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
              className="rounded-lg bg-[#1E3A5F] px-4 py-2 text-sm font-semibold text-white hover:bg-[#162C49] disabled:opacity-60 cursor-pointer"
            >
              {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Create Student'}
            </button>
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
                Step 1 · Download Ready Excel Template
              </div>
              <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                Includes formatted headers (<code className="font-mono">Full Name, Admission Number, Class / Batch, Email, Phone, Username, Password</code>), sample rows, and an Instructions sheet.
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
              <div className="max-h-56 overflow-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-white text-slate-500 border-b border-slate-200 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Row</th>
                      <th className="px-3 py-2 font-semibold">Full Name</th>
                      <th className="px-3 py-2 font-semibold">Admission No.</th>
                      <th className="px-3 py-2 font-semibold">Class / Batch</th>
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
                          {r.admission_number || '—'}
                        </td>
                        <td className="px-3 py-2 text-slate-600">{r.batch_name || 'Default'}</td>
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
            <div className="flex flex-wrap gap-1 border-b border-slate-200 pb-3 mb-4">
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

            {profileTab === 'overview' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="rounded-lg border border-slate-200 p-4 space-y-2">
                  <div><span className="text-slate-500">Full Name:</span> <strong>{viewedRow.fullName}</strong></div>
                  <div><span className="text-slate-500">Admission Number:</span> <strong className="font-mono">{viewedRow.admissionNumber}</strong></div>
                  <div><span className="text-slate-500">Class / Batch:</span> <strong>{viewedRow.batchName}</strong></div>
                  <div><span className="text-slate-500">Assigned Mentor ({activeYear.name}):</span> <strong>{viewedRow.mentorName}</strong></div>
                </div>
                <div className="rounded-lg border border-slate-200 p-4 space-y-2">
                  <div><span className="text-slate-500">Login Username:</span> <strong className="font-mono">@{viewedRow.username}</strong></div>
                  <div><span className="text-slate-500">Email:</span> <strong>{viewedRow.email}</strong></div>
                  <div><span className="text-slate-500">Phone:</span> <strong>{viewedRow.phone || '—'}</strong></div>
                  <div className="flex items-center gap-2"><span className="text-slate-500">Status:</span> <StatusLabel status={viewedRow.isActive ? 'active' : 'inactive'} /></div>
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
              const assign = db.student_timetable_assignments.find(
                (a) => a.student_id === viewedRow.studentId && a.academic_year_id === activeYear.id && a.is_active
              );
              const slots = assign ? db.timetable_slots.filter((s) => s.template_id === assign.template_id) : [];
              if (!assign) {
                return <EmptyState title="No Timetable Assigned" description={`Assign a timetable template to ${viewedRow.fullName} in the Timetable module.`} />;
              }
              return (
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
                            return <td key={i} className="px-2.5 py-2 text-slate-600">{sl?.planned_activity || '—'}</td>;
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
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
