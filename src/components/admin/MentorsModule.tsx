import React, { useMemo, useState } from 'react';
import { Edit3, Plus, Search, UserCheck, UserCog, UserX } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { formatDisplayDate, getTodayIST } from '../../lib/dateUtils';
import { dataService } from '../../services/dataService';
import { Modal, PageHeader, StatusLabel } from '../ui/CommonUI';

export const MentorsModule: React.FC = () => {
  const { db, session, activeYear, refresh, notify, confirmAction } = useApp();
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [employeeCode, setEmployeeCode] = useState('');
  const [designation, setDesignation] = useState('Faculty Mentor');
  const [department, setDepartment] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  if (!db || !session || !activeYear) return null;

  const mentorsList = db.mentors
    .map((m) => {
      const prof = db.profiles.find((p) => p.id === m.profile_id);
      const assigned = db.mentor_assignments.filter(
        (ma) => ma.mentor_id === m.id && ma.academic_year_id === activeYear.id && ma.is_active
      );
      return {
        mentor: m,
        profile: prof,
        assignedCount: assigned.length,
      };
    })
    .filter((item) => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return (
        item.profile?.full_name.toLowerCase().includes(q) ||
        item.mentor.employee_code.toLowerCase().includes(q) ||
        item.profile?.username.toLowerCase().includes(q)
      );
    });

  const openCreate = () => {
    setEditingId(null);
    setFullName('');
    setEmployeeCode('');
    setDesignation('Faculty Mentor');
    setDepartment('');
    setEmail('');
    setPhone('');
    setUsername('');
    setPassword('');
    setIsActive(true);
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (item: (typeof mentorsList)[0]) => {
    setEditingId(item.mentor.id);
    setFullName(item.profile?.full_name || '');
    setEmployeeCode(item.mentor.employee_code);
    setDesignation(item.mentor.designation);
    setDepartment(item.mentor.department || '');
    setEmail(item.profile?.email || '');
    setPhone(item.profile?.phone || '');
    setUsername(item.profile?.username || '');
    setPassword('');
    setIsActive(item.profile?.is_active ?? true);
    setFormError(null);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      if (editingId) {
        await dataService.updateMentor(session.profile, editingId, {
          full_name: fullName,
          employee_code: employeeCode,
          designation,
          department,
          email,
          phone,
          username,
          new_password: password || undefined,
          is_active: isActive,
        });
        notify('success', `Mentor "${fullName}" updated.`);
      } else {
        await dataService.createMentor(session.profile, {
          full_name: fullName,
          employee_code: employeeCode,
          designation,
          department,
          email,
          phone,
          username,
          password,
          is_active: isActive,
        });
        notify('success', `Mentor "${fullName}" created successfully.`);
      }
      await refresh();
      setModalOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to save mentor.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Mentor Management"
        subtitle="Manage faculty mentor profiles, login credentials, and account statuses."
        actions={
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#1E3A5F] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#162C49] cursor-pointer"
          >
            <Plus className="h-4 w-4" /> Add Mentor
          </button>
        }
      />

      <div className="mb-4 max-w-sm relative">
        <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search mentor name, employee code, username..."
          className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-xs focus:border-[#1E3A5F] focus:outline-none"
        />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 font-semibold">Mentor Name</th>
                <th className="px-4 py-3 font-semibold">Employee Code</th>
                <th className="px-4 py-3 font-semibold">Designation &amp; Dept</th>
                <th className="px-4 py-3 font-semibold">Username</th>
                <th className="px-4 py-3 font-semibold text-right">Assigned ({activeYear.name})</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {mentorsList.map((item) => (
                <tr key={item.mentor.id} className="hover:bg-slate-50/70">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-900">{item.profile?.full_name}</div>
                    <div className="text-[11px] text-slate-500">{item.profile?.email}</div>
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-700">{item.mentor.employee_code}</td>
                  <td className="px-4 py-3 text-slate-700">
                    <div>{item.mentor.designation}</div>
                    {item.mentor.department && (
                      <div className="text-[11px] text-slate-500">{item.mentor.department}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-600">@{item.profile?.username}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-[#1E3A5F]">
                    {item.assignedCount}
                  </td>
                  <td className="px-4 py-3">
                    <StatusLabel status={item.profile?.is_active ? 'active' : 'inactive'} />
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => openEdit(item)}
                        className="rounded-md border border-slate-200 p-1.5 text-slate-600 hover:bg-slate-100 hover:text-[#1E3A5F] cursor-pointer"
                        title="Edit Mentor & Credentials"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                      {item.profile && (
                        <button
                          type="button"
                          onClick={() =>
                            confirmAction({
                              title: item.profile!.is_active
                                ? `Deactivate ${item.profile!.full_name}?`
                                : `Activate ${item.profile!.full_name}?`,
                              description: 'Historical review logs and past mentor assignments remain permanently preserved.',
                              confirmLabel: item.profile!.is_active ? 'Deactivate' : 'Activate',
                              tone: item.profile!.is_active ? 'danger' : 'primary',
                              onConfirm: async () => {
                                await dataService.updateUserCredentials(
                                  session.profile,
                                  item.profile!.id,
                                  item.profile!.username,
                                  undefined,
                                  !item.profile!.is_active
                                );
                                await refresh();
                                notify('success', 'Mentor account status updated.');
                              },
                            })
                          }
                          className="rounded-md border border-slate-200 p-1.5 hover:bg-slate-100 cursor-pointer"
                          title={item.profile.is_active ? 'Deactivate' : 'Activate'}
                        >
                          {item.profile.is_active ? (
                            <UserX className="h-3.5 w-3.5 text-red-600" />
                          ) : (
                            <UserCheck className="h-3.5 w-3.5 text-emerald-600" />
                          )}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={modalOpen}
        title={editingId ? 'Edit Mentor & Credentials' : 'Add New Mentor'}
        subtitle="Admin manages mentor usernames and passwords centrally."
        onClose={() => setModalOpen(false)}
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
              <label className="block text-xs font-semibold text-slate-700">Employee Code *</label>
              <input
                type="text"
                required
                value={employeeCode}
                onChange={(e) => setEmployeeCode(e.target.value)}
                placeholder="e.g. KKHM-M004"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:border-[#1E3A5F] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">Designation *</label>
              <input
                type="text"
                required
                value={designation}
                onChange={(e) => setDesignation(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#1E3A5F] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">Department</label>
              <input
                type="text"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#1E3A5F] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">Email *</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#1E3A5F] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700">Phone</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#1E3A5F] focus:outline-none"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700">Login Username *</label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:border-[#1E3A5F] focus:outline-none"
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
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:border-[#1E3A5F] focus:outline-none"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-[#1E3A5F] px-4 py-2 text-sm font-semibold text-white hover:bg-[#162C49] disabled:opacity-60 cursor-pointer"
            >
              {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Create Mentor'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export const MentorAssignmentsModule: React.FC = () => {
  const { db, session, activeYear, refresh, notify } = useApp();
  const [selectedMentorId, setSelectedMentorId] = useState('');
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [assignedDate, setAssignedDate] = useState(getTodayIST());
  const [saving, setSaving] = useState(false);

  const yearAssignments = useMemo(() => {
    if (!db || !activeYear) return [];
    return db.mentor_assignments
      .filter((ma) => ma.academic_year_id === activeYear.id)
      .sort((a, b) => Number(b.is_active) - Number(a.is_active));
  }, [db, activeYear]);

  if (!db || !session || !activeYear) return null;

  const toggleStudent = (sid: string) => {
    setSelectedStudentIds((prev) =>
      prev.includes(sid) ? prev.filter((id) => id !== sid) : [...prev, sid]
    );
  };

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMentorId || selectedStudentIds.length === 0) {
      notify('error', 'Choose a mentor and at least one student to assign.');
      return;
    }
    setSaving(true);
    try {
      await dataService.assignMentorToStudents(session.profile, {
        academic_year_id: activeYear.id,
        mentor_id: selectedMentorId,
        student_ids: selectedStudentIds,
        assigned_date: assignedDate,
      });
      await refresh();
      notify('success', `Assigned ${selectedStudentIds.length} student(s) for ${activeYear.name}. Previous history preserved.`);
      setSelectedStudentIds([]);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to save assignment.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Mentor Assignments"
        subtitle={`Each student has exactly one active primary mentor per academic year (${activeYear.name}). Reassigning archives the previous link without deleting historical records.`}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Bulk Assignment Form */}
        <section className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 mb-4">
            <UserCog className="h-4 w-4 text-[#1E3A5F]" />
            <span>Assign Students to Primary Mentor</span>
          </div>

          <form onSubmit={handleAssign} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700">Academic Year</label>
              <input
                type="text"
                readOnly
                value={`${activeYear.name} (${activeYear.status})`}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">Select Mentor *</label>
              <select
                required
                value={selectedMentorId}
                onChange={(e) => setSelectedMentorId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs focus:border-[#1E3A5F] focus:outline-none"
              >
                <option value="">-- Choose Faculty Mentor --</option>
                {db.mentors.map((m) => {
                  const mp = db.profiles.find((p) => p.id === m.profile_id);
                  return (
                    <option key={m.id} value={m.id}>
                      {mp?.full_name} ({m.employee_code})
                    </option>
                  );
                })}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">Assignment Effective Date</label>
              <input
                type="date"
                value={assignedDate}
                onChange={(e) => setAssignedDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-[#1E3A5F] focus:outline-none"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-700">
                  Select Students ({selectedStudentIds.length} selected)
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setSelectedStudentIds(
                      selectedStudentIds.length === db.students.length
                        ? []
                        : db.students.map((s) => s.id)
                    )
                  }
                  className="text-[11px] font-medium text-[#1E3A5F] hover:underline cursor-pointer"
                >
                  {selectedStudentIds.length === db.students.length ? 'Clear All' : 'Select All'}
                </button>
              </div>
              <div className="max-h-60 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
                {db.students.map((stu) => {
                  const sp = db.profiles.find((p) => p.id === stu.profile_id);
                  const currentMa = db.mentor_assignments.find(
                    (ma) => ma.student_id === stu.id && ma.academic_year_id === activeYear.id && ma.is_active
                  );
                  const currentMentor = db.mentors.find((m) => m.id === currentMa?.mentor_id);
                  const currentMp = db.profiles.find((p) => p.id === currentMentor?.profile_id);
                  const checked = selectedStudentIds.includes(stu.id);
                  return (
                    <label
                      key={stu.id}
                      className={`flex items-center justify-between gap-3 px-3 py-2.5 text-xs cursor-pointer ${
                        checked ? 'bg-[#1E3A5F]/5' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleStudent(stu.id)}
                          className="h-4 w-4 rounded border-slate-300 text-[#1E3A5F]"
                        />
                        <div className="min-w-0">
                          <div className="font-medium text-slate-900 truncate">{sp?.full_name}</div>
                          <div className="text-[11px] font-mono text-slate-500">{stu.admission_number}</div>
                        </div>
                      </div>
                      <span className="text-[11px] text-slate-500 truncate max-w-[120px]">
                        {currentMp ? currentMp.full_name.split(' ')[0] : 'Unassigned'}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <button
              type="submit"
              disabled={saving || activeYear.status === 'closed'}
              className="w-full rounded-lg bg-[#1E3A5F] py-2.5 text-xs font-semibold text-white hover:bg-[#162C49] disabled:opacity-50 cursor-pointer"
            >
              {saving ? 'Assigning...' : `Assign Selected Students (${selectedStudentIds.length})`}
            </button>
          </form>
        </section>

        {/* Active & Historical Assignments Table for Selected Year */}
        <section className="lg:col-span-7 rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <h2 className="text-sm font-semibold text-slate-900">
              Assignment Register ({activeYear.name})
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Active primary assignments and archived reassignments for this academic year.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Student</th>
                  <th className="px-4 py-2.5 font-semibold">Primary Mentor</th>
                  <th className="px-4 py-2.5 font-semibold">Assigned Date</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {yearAssignments.map((ma) => {
                  const stu = db.students.find((s) => s.id === ma.student_id);
                  const sp = db.profiles.find((p) => p.id === stu?.profile_id);
                  const m = db.mentors.find((x) => x.id === ma.mentor_id);
                  const mp = db.profiles.find((p) => p.id === m?.profile_id);
                  return (
                    <tr key={ma.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{sp?.full_name}</div>
                        <div className="text-[11px] font-mono text-slate-500">{stu?.admission_number}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-800 font-medium">{mp?.full_name}</td>
                      <td className="px-4 py-3 font-mono text-slate-600">
                        {formatDisplayDate(ma.assigned_date)}
                        {ma.ended_date ? ` → ${formatDisplayDate(ma.ended_date)}` : ''}
                      </td>
                      <td className="px-4 py-3">
                        <StatusLabel status={ma.is_active ? 'active' : 'closed'} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
};
