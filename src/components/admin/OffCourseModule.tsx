import React, { useMemo, useState } from 'react';
import { BookOpen, CalendarRange, FileText, Layers, Printer, Users } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { dataService } from '../../services/dataService';
import {
  creditsUsed,
  isProposalApproved,
  PROPOSAL_NEXT,
  PROPOSAL_STATUS_LABEL,
  replacementLabel,
  STAGE_CREDIT_CAP,
  STAGE_LABEL,
  STAGE_MAX_SEMESTER,
  validateProposalMembers,
  validateSelection,
} from '../../lib/offCourseRules';
import type { SelectionDraft } from '../../lib/offCourseRules';
import { EXAM_MODES } from '../../types/domain';
import type {
  AcademicStage,
  CourseType,
  DatabaseSnapshot,
  OffCourseProposal,
  ProposalStatus,
  Student,
  StudentOffCourseSelection,
} from '../../types/domain';
import { EmptyState, Modal, PageHeader } from '../ui/CommonUI';
import { StudentTimetableGrid } from '../shared/StudentTimetableGrid';

type Tab = 'students' | 'proposals' | 'pool' | 'chart';
const STAGES: AcademicStage[] = ['thamheediyya', 'aliya', 'pg'];
const inputCls =
  'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#1E3A5F] focus:outline-none';
const btn =
  'rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer disabled:opacity-50';
const btnPrimary =
  'rounded-lg bg-[#1E3A5F] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#162C49] cursor-pointer disabled:opacity-50';

function studentName(db: DatabaseSnapshot, st?: Student): string {
  return db.profiles.find((p) => p.id === st?.profile_id)?.full_name || st?.admission_number || '—';
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong.';
}

const CreditMeter: React.FC<{ used: number; cap?: number }> = ({ used, cap }) => {
  if (!cap) return <span className="text-xs text-slate-500">ഉറുദു മാത്രം</span>;
  const pct = Math.min(100, (used / cap) * 100);
  const full = used >= cap;
  return (
    <div className="min-w-[110px]">
      <div className="flex justify-between text-[11px] text-slate-600">
        <span className="tabular-nums">
          {used} / {cap} cr
        </span>
        {full && <span className="font-semibold text-amber-700">പൂർണം</span>}
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-slate-100">
        <div
          className={`h-1.5 rounded-full ${full ? 'bg-amber-500' : 'bg-teal-600'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};

export const OffCourseModule: React.FC = () => {
  const { db, activeYear } = useApp();
  const [tab, setTab] = useState<Tab>('students');
  if (!db || !activeYear) return null;

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'students', label: 'വിദ്യാർത്ഥികൾ & ക്രെഡിറ്റ്', icon: Users },
    { id: 'proposals', label: 'പ്രൊപ്പോസലുകൾ', icon: FileText },
    { id: 'pool', label: 'തംഹീദിയ്യ പൂൾ', icon: Layers },
    { id: 'chart', label: 'കോഴ്സ് ചാർട്ട്', icon: BookOpen },
  ];

  return (
    <div>
      <div className="no-print">
        <PageHeader
          title="Off-Course (CIC)"
          subtitle="തംഹീദിയ്യ: ഉറുദു മാത്രം, പൂളിൽ നിന്ന് · ആലിയ: 3 ക്രെഡിറ്റ് വരെ · പി.ജി: 6 ക്രെഡിറ്റ് വരെ"
        />
        <div className="mb-5 flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold cursor-pointer ${
                tab === t.id ? 'bg-[#1E3A5F] text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <t.icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {tab === 'students' && <StudentsTab />}
      {tab === 'proposals' && <ProposalsTab />}
      {tab === 'pool' && <PoolTab />}
      {tab === 'chart' && <CourseChartTab />}
    </div>
  );
};

// ------------------------------------------------------------------------------
// Students & credits
// ------------------------------------------------------------------------------
const StudentsTab: React.FC = () => {
  const { db, activeYear, activeYearSettings, session, notify, refresh, confirmAction } = useApp();
  const [stageFilter, setStageFilter] = useState<'all' | AcademicStage | 'unset'>('all');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [addFor, setAddFor] = useState<Student | null>(null);
  const [stageFor, setStageFor] = useState<Student | null>(null);
  const [ttFor, setTtFor] = useState<Student | null>(null);
  const [printAll, setPrintAll] = useState(false);

  const students = useMemo(() => {
    if (!db) return [];
    const q = search.trim().toLowerCase();
    return db.students
      .filter((st) => {
        if (stageFilter === 'unset') return !st.academic_stage;
        if (stageFilter !== 'all') return st.academic_stage === stageFilter;
        return true;
      })
      .filter((st) => {
        if (!q) return true;
        const name = studentName(db, st).toLowerCase();
        return name.includes(q) || st.admission_number.toLowerCase().includes(q) || st.batch_name.toLowerCase().includes(q);
      })
      .sort((a, b) => a.batch_name.localeCompare(b.batch_name) || studentName(db, a).localeCompare(studentName(db, b)));
  }, [db, search, stageFilter]);

  if (!db || !activeYear || !session) return null;
  const workingDays = activeYearSettings?.working_days || [1, 2, 3, 4, 5, 6];
  const periodCount = activeYearSettings?.period_count || 8;

  if (printAll) {
    return (
      <div>
        <div className="no-print mb-4 flex gap-2">
          <button type="button" className={btn} onClick={() => setPrintAll(false)}>
            ← തിരികെ
          </button>
          <button type="button" className={btnPrimary} onClick={() => window.print()}>
            <Printer className="inline h-3.5 w-3.5 mr-1" /> Print / PDF
          </button>
          <span className="self-center text-xs text-slate-500">{students.length} വിദ്യാർത്ഥികൾ</span>
        </div>
        <div className="space-y-6">
          {students.map((st, i) => (
            <div key={st.id} className={i % 2 === 1 ? 'print-page-break' : ''}>
              <StudentTimetableGrid
                db={db}
                studentId={st.id}
                academicYearId={activeYear.id}
                workingDays={workingDays}
                periodCount={periodCount}
                showHeader
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const cancel = (sel: StudentOffCourseSelection) =>
    confirmAction({
      title: 'ഈ ഒഴിവാക്കൽ റദ്ദാക്കണോ?',
      description: 'ക്രെഡിറ്റ് തിരികെ ലഭിക്കും. രേഖ ചരിത്രത്തിൽ "cancelled" ആയി നിലനിൽക്കും.',
      confirmLabel: 'റദ്ദാക്കുക',
      tone: 'danger',
      onConfirm: async () => {
        try {
          await dataService.setOffCourseSelectionStatus(session.profile, sel.id, 'cancelled');
          await refresh();
          notify('success', 'റദ്ദാക്കി.');
        } catch (err) {
          notify('error', errMsg(err));
        }
      },
    });

  const setStatus = async (sel: StudentOffCourseSelection, status: StudentOffCourseSelection['status']) => {
    try {
      await dataService.setOffCourseSelectionStatus(session.profile, sel.id, status);
      await refresh();
      notify('success', 'മാറ്റം സേവ് ചെയ്തു.');
    } catch (err) {
      notify('error', errMsg(err));
    }
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="text-xs font-medium text-slate-700">
          ഘട്ടം
          <select className={inputCls} value={stageFilter} onChange={(e) => setStageFilter(e.target.value as typeof stageFilter)}>
            <option value="all">എല്ലാം</option>
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABEL[s]}
              </option>
            ))}
            <option value="unset">ഘട്ടം നൽകാത്തവർ</option>
          </select>
        </label>
        <label className="text-xs font-medium text-slate-700 flex-1 min-w-[200px]">
          തിരയുക
          <input className={inputCls} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="പേര്, അഡ്മിഷൻ നമ്പർ, ക്ലാസ്" />
        </label>
        <button type="button" className={btn} onClick={() => setPrintAll(true)} disabled={!students.length}>
          <CalendarRange className="inline h-3.5 w-3.5 mr-1" />
          ലിസ്റ്റിലെ എല്ലാവരുടെയും ടൈംടേബിൾ പ്രിന്റ്
        </button>
      </div>

      {!students.length ? (
        <EmptyState title="വിദ്യാർത്ഥികളില്ല" description="ഫിൽട്ടർ മാറ്റി നോക്കുക." />
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-700 border-b border-slate-200">
              <tr>
                <th className="px-3 py-2.5 font-semibold">വിദ്യാർത്ഥി</th>
                <th className="px-3 py-2.5 font-semibold">ഘട്ടം / സെമസ്റ്റർ</th>
                <th className="px-3 py-2.5 font-semibold">ക്രെഡിറ്റ്</th>
                <th className="px-3 py-2.5 font-semibold">ഒഴിവാക്കലുകൾ</th>
                <th className="px-3 py-2.5 font-semibold text-right">നടപടികൾ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {students.map((st) => {
                const sels = db.student_offcourse_selections.filter((x) => x.student_id === st.id);
                const act = sels.filter((x) => x.status !== 'cancelled');
                const stage = st.academic_stage || undefined;
                const open = expanded === st.id;
                return (
                  <React.Fragment key={st.id}>
                    <tr className="hover:bg-slate-50/60">
                      <td className="px-3 py-2.5">
                        <div className="font-semibold text-slate-900">{studentName(db, st)}</div>
                        <div className="text-[11px] text-slate-500">
                          {st.admission_number} · {st.batch_name}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        {stage ? (
                          <span>
                            {STAGE_LABEL[stage]} · സെം {st.stage_semester_no || '—'}
                            {st.scheme ? ` · ${st.scheme}` : ''}
                          </span>
                        ) : (
                          <span className="text-amber-700">നൽകിയിട്ടില്ല</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        {stage ? <CreditMeter used={creditsUsed(db, st.id, stage)} cap={STAGE_CREDIT_CAP[stage]} /> : '—'}
                      </td>
                      <td className="px-3 py-2.5">
                        <button type="button" className="text-[#1E3A5F] underline cursor-pointer" onClick={() => setExpanded(open ? null : st.id)}>
                          {act.length} സജീവം{sels.length > act.length ? ` · ${sels.length - act.length} റദ്ദാക്കിയത്` : ''}
                        </button>
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap space-x-1.5">
                        <button type="button" className={btn} onClick={() => setStageFor(st)}>
                          ഘട്ടം
                        </button>
                        <button type="button" className={btnPrimary} onClick={() => setAddFor(st)} disabled={!stage}>
                          + ഒഴിവാക്കൽ
                        </button>
                        <button type="button" className={btn} onClick={() => setTtFor(st)}>
                          ടൈംടേബിൾ
                        </button>
                      </td>
                    </tr>
                    {open && (
                      <tr>
                        <td colSpan={5} className="bg-slate-50/70 px-3 py-3">
                          {!sels.length ? (
                            <div className="text-slate-500">ഒന്നുമില്ല.</div>
                          ) : (
                            <table className="w-full text-[11px]">
                              <thead className="text-slate-500">
                                <tr>
                                  <th className="py-1 text-left">സെം</th>
                                  <th className="py-1 text-left">ഒഴിവാക്കിയ വിഷയം</th>
                                  <th className="py-1 text-left">ക്രെഡിറ്റ്</th>
                                  <th className="py-1 text-left">പകരം</th>
                                  <th className="py-1 text-left">സ്ഥിതി</th>
                                  <th />
                                </tr>
                              </thead>
                              <tbody>
                                {sels.map((sel) => {
                                  const sub = db.subjects.find((x) => x.id === sel.opted_out_subject_id);
                                  return (
                                    <tr key={sel.id} className={sel.status === 'cancelled' ? 'text-slate-400 line-through' : ''}>
                                      <td className="py-1">
                                        {sel.semester_no}
                                        {sel.semester_period ? ` (${sel.semester_period})` : ''}
                                      </td>
                                      <td className="py-1">
                                        {sub?.code} — {sub?.name}
                                      </td>
                                      <td className="py-1 tabular-nums">{sel.opted_out_credit}</td>
                                      <td className="py-1">
                                        <span className="text-slate-500">
                                          {sel.replacement_type === 'pool' ? 'Pool' : sel.replacement_type === 'off_course' ? 'Off Course' : 'Interdisciplinary'}:
                                        </span>{' '}
                                        {replacementLabel(db, sel)}
                                      </td>
                                      <td className="py-1">{sel.status}</td>
                                      <td className="py-1 text-right space-x-1 no-underline">
                                        {sel.status === 'active' && (
                                          <>
                                            <button type="button" className={btn} onClick={() => setStatus(sel, 'completed')}>
                                              പൂർത്തിയായി
                                            </button>
                                            <button type="button" className={btn} onClick={() => cancel(sel)}>
                                              റദ്ദാക്കുക
                                            </button>
                                          </>
                                        )}
                                        {sel.status === 'cancelled' && (
                                          <button type="button" className={btn} onClick={() => setStatus(sel, 'active')}>
                                            പുനഃസ്ഥാപിക്കുക
                                          </button>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {addFor && <SelectionModal student={addFor} onClose={() => setAddFor(null)} />}
      {stageFor && <StageModal student={stageFor} onClose={() => setStageFor(null)} />}
      {ttFor && (
        <Modal open title={`${studentName(db, ttFor)} — ടൈംടേബിൾ`} onClose={() => setTtFor(null)} maxWidth="xl">
          <StudentTimetableGrid
            db={db}
            studentId={ttFor.id}
            academicYearId={activeYear.id}
            workingDays={workingDays}
            periodCount={periodCount}
          />
          <p className="mt-3 text-[11px] text-slate-500">
            ക്ലാസ് ടൈംടേബിളിൽ ഒഴിവാക്കിയ വിഷയത്തിന്റെ പീരിയഡുകൾ ഈ വിദ്യാർത്ഥിക്ക് സ്വയം Off-Course ആയി മാറും (സ്ലോട്ടിൽ വിഷയം നൽകിയിട്ടുണ്ടെങ്കിൽ).
          </p>
        </Modal>
      )}
    </div>
  );
};

const StageModal: React.FC<{ student: Student; onClose: () => void }> = ({ student, onClose }) => {
  const { db, session, notify, refresh } = useApp();
  const [stage, setStage] = useState<AcademicStage | ''>(student.academic_stage || '');
  const [sem, setSem] = useState<number>(student.stage_semester_no || 1);
  const [scheme, setScheme] = useState(student.scheme || '');
  const [saving, setSaving] = useState(false);
  if (!db || !session) return null;
  const max = stage ? STAGE_MAX_SEMESTER[stage] : 8;
  const save = async () => {
    setSaving(true);
    try {
      await dataService.updateStudentStage(session.profile, student.id, stage || null, stage ? Math.min(sem, max) : null, scheme.trim() || null);
      await refresh();
      notify('success', 'സേവ് ചെയ്തു.');
      onClose();
    } catch (err) {
      notify('error', errMsg(err));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal open title={`${studentName(db, student)} — ഘട്ടം`} subtitle="8 വർഷം: തംഹീദിയ്യ 4 + ആലിയ 8 + പി.ജി 4 സെമസ്റ്റർ" onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs font-medium text-slate-700 col-span-2">
          ഘട്ടം
          <select className={inputCls} value={stage} onChange={(e) => setStage(e.target.value as AcademicStage | '')}>
            <option value="">—</option>
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-700">
          ഈ ഘട്ടത്തിലെ സെമസ്റ്റർ
          <select className={inputCls} value={sem} onChange={(e) => setSem(Number(e.target.value))}>
            {Array.from({ length: max }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {i + 1}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-700">
          സ്കീം (ആലിയ)
          <input className={inputCls} value={scheme} onChange={(e) => setScheme(e.target.value)} placeholder="General / Arts / Prime / Advanced" />
        </label>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className={btn} onClick={onClose}>
          റദ്ദാക്കുക
        </button>
        <button type="button" className={btnPrimary} onClick={save} disabled={saving}>
          സേവ്
        </button>
      </div>
    </Modal>
  );
};

const SelectionModal: React.FC<{ student: Student; onClose: () => void }> = ({ student, onClose }) => {
  const { db, session, activeYear, notify, refresh } = useApp();
  const stage = student.academic_stage as AcademicStage;
  const [semester, setSemester] = useState<number>(student.stage_semester_no || 1);
  const [period, setPeriod] = useState<'' | 'Nov' | 'May'>('');
  const [subjectId, setSubjectId] = useState('');
  const [rtype, setRtype] = useState<SelectionDraft['replacement_type']>(stage === 'thamheediyya' ? 'pool' : 'off_course');
  const [poolId, setPoolId] = useState('');
  const [proposalId, setProposalId] = useState('');
  const [idcId, setIdcId] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  if (!db || !session || !activeYear) return null;

  const candidates = db.subjects.filter(
    (s) =>
      s.is_active !== false &&
      (!s.academic_stage || s.academic_stage === stage) &&
      (!s.semester_no || s.semester_no === semester) &&
      (stage === 'thamheediyya' ? s.is_urdu : s.course_type === 'elective')
  );
  const pool = db.offcourse_pool_items.filter((p) => p.is_active);
  const myProposals = db.offcourse_proposals.filter(
    (p) =>
      p.academic_stage === stage &&
      p.status !== 'rejected' &&
      p.status !== 'withdrawn' &&
      db.offcourse_proposal_members.some((m) => m.proposal_id === p.id && m.student_id === student.id)
  );
  const idcSubjects = db.subjects.filter((s) => s.course_type === 'interdisciplinary' || (s.academic_stage && s.academic_stage !== stage) || (s.semester_no && s.semester_no !== semester));

  const draft: SelectionDraft = {
    student_id: student.id,
    academic_stage: stage,
    semester_no: semester,
    opted_out_subject_id: subjectId,
    replacement_type: rtype,
    pool_item_id: poolId || null,
    proposal_id: proposalId || null,
    interdisciplinary_subject_id: idcId || null,
    notes,
  };
  const problems = subjectId ? validateSelection(db, draft) : [];
  const cap = STAGE_CREDIT_CAP[stage];
  const used = creditsUsed(db, student.id, stage);
  const chosen = db.subjects.find((s) => s.id === subjectId);

  const save = async () => {
    setSaving(true);
    try {
      await dataService.saveOffCourseSelection(session.profile, {
        ...draft,
        academic_year_id: activeYear.id,
        semester_period: period || null,
      });
      await refresh();
      notify('success', 'ഒഴിവാക്കൽ രേഖപ്പെടുത്തി.');
      onClose();
    } catch (err) {
      notify('error', errMsg(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title={`${studentName(db, student)} — വിഷയം ഒഴിവാക്കൽ`}
      subtitle={`${STAGE_LABEL[stage]}${cap ? ` · ഉപയോഗിച്ചത് ${used}/${cap} ക്രെഡിറ്റ്` : ' · ഉറുദു മാത്രം, പൂളിൽ നിന്ന്'}`}
      onClose={onClose}
      maxWidth="lg"
    >
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs font-medium text-slate-700">
          സെമസ്റ്റർ
          <select className={inputCls} value={semester} onChange={(e) => { setSemester(Number(e.target.value)); setSubjectId(''); }}>
            {Array.from({ length: STAGE_MAX_SEMESTER[stage] }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {i + 1}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-700">
          സെഷൻ
          <select className={inputCls} value={period} onChange={(e) => setPeriod(e.target.value as '' | 'Nov' | 'May')}>
            <option value="">—</option>
            <option value="Nov">November</option>
            <option value="May">May</option>
          </select>
        </label>
        <label className="text-xs font-medium text-slate-700 col-span-2">
          ഒഴിവാക്കുന്ന വിഷയം {stage === 'thamheediyya' ? '(ഉറുദു)' : '(ഇലക്ടീവ്)'}
          <select className={inputCls} value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
            <option value="">— തിരഞ്ഞെടുക്കുക —</option>
            {candidates.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} — {s.name} ({s.credit || 0} cr)
              </option>
            ))}
          </select>
          {!candidates.length && (
            <span className="mt-1 block text-[11px] text-amber-700">
              കോഴ്സ് ചാർട്ടിൽ ഈ സെമസ്റ്ററിന്റെ {stage === 'thamheediyya' ? 'ഉറുദു' : 'ഇലക്ടീവ്'} വിഷയം ചേർക്കുക ("കോഴ്സ് ചാർട്ട്" ടാബ്).
            </span>
          )}
        </label>

        {stage !== 'thamheediyya' && (
          <label className="text-xs font-medium text-slate-700 col-span-2">
            പകരം
            <select className={inputCls} value={rtype} onChange={(e) => setRtype(e.target.value as SelectionDraft['replacement_type'])}>
              <option value="off_course">Off Course (അംഗീകൃത പ്രൊപ്പോസൽ)</option>
              <option value="interdisciplinary">Interdisciplinary (സിലബസിലെ മറ്റൊരു വിഷയം)</option>
            </select>
          </label>
        )}

        {rtype === 'pool' && (
          <label className="text-xs font-medium text-slate-700 col-span-2">
            Off-Course Pool വിഷയം
            <select className={inputCls} value={poolId} onChange={(e) => setPoolId(e.target.value)}>
              <option value="">— തിരഞ്ഞെടുക്കുക —</option>
              {pool.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.topic} · സെം {p.semester_nos.join('/')}
                  {p.semester_nos.includes(semester) ? '' : ' (മറ്റൊരു സെമസ്റ്റർ)'}
                </option>
              ))}
            </select>
          </label>
        )}
        {rtype === 'off_course' && (
          <label className="text-xs font-medium text-slate-700 col-span-2">
            പ്രൊപ്പോസൽ
            <select className={inputCls} value={proposalId} onChange={(e) => setProposalId(e.target.value)}>
              <option value="">— തിരഞ്ഞെടുക്കുക —</option>
              {myProposals.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.topic} · {PROPOSAL_STATUS_LABEL[p.status]}
                  {p.approved_credit ? ` · ${p.approved_credit} cr` : ''}
                </option>
              ))}
            </select>
            {!myProposals.length && (
              <span className="mt-1 block text-[11px] text-amber-700">ഈ വിദ്യാർത്ഥി അംഗമായ പ്രൊപ്പോസൽ ഇല്ല. "പ്രൊപ്പോസലുകൾ" ടാബിൽ ആദ്യം ഉണ്ടാക്കുക.</span>
            )}
          </label>
        )}
        {rtype === 'interdisciplinary' && (
          <label className="text-xs font-medium text-slate-700 col-span-2">
            ഇന്റർഡിസിപ്ലിനറി വിഷയം
            <select className={inputCls} value={idcId} onChange={(e) => setIdcId(e.target.value)}>
              <option value="">— തിരഞ്ഞെടുക്കുക —</option>
              {idcSubjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} — {s.name}
                  {s.academic_stage ? ` (${s.academic_stage} ${s.semester_no || ''})` : ''}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="text-xs font-medium text-slate-700 col-span-2">
          കുറിപ്പ് (Notes)
          <input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="ഉദാ: മറ്റൊരു സെമസ്റ്ററിലെ പൂൾ വിഷയം എടുക്കാനുള്ള കാരണം" />
        </label>
      </div>

      {chosen && cap && (
        <div className="mt-3 text-[11px] text-slate-600">
          ഇത് സേവ് ചെയ്താൽ: {used + Number(chosen.credit || 0)} / {cap} ക്രെഡിറ്റ്
        </div>
      )}
      {problems.length > 0 && (
        <ul className="mt-3 list-disc pl-5 text-[12px] text-red-700 space-y-0.5">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className={btn} onClick={onClose}>
          റദ്ദാക്കുക
        </button>
        <button type="button" className={btnPrimary} onClick={save} disabled={saving || !subjectId || problems.length > 0}>
          സേവ്
        </button>
      </div>
    </Modal>
  );
};

// ------------------------------------------------------------------------------
// Proposals
// ------------------------------------------------------------------------------
const ProposalsTab: React.FC = () => {
  const { db, session, notify, refresh, confirmAction } = useApp();
  const [editing, setEditing] = useState<OffCourseProposal | 'new' | null>(null);
  const [decide, setDecide] = useState<{ p: OffCourseProposal; status: ProposalStatus } | null>(null);
  const [printing, setPrinting] = useState<OffCourseProposal | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | ProposalStatus>('all');
  if (!db || !session) return null;

  if (printing) return <ProposalPrint proposal={printing} onBack={() => setPrinting(null)} />;

  const list = db.offcourse_proposals.filter((p) => statusFilter === 'all' || p.status === statusFilter);

  const move = async (p: OffCourseProposal, status: ProposalStatus) => {
    if (isProposalApproved(status) || status === 'rewrite' || status === 'rejected') {
      setDecide({ p, status });
      return;
    }
    try {
      await dataService.setProposalStatus(session.profile, p.id, status);
      await refresh();
      notify('success', PROPOSAL_STATUS_LABEL[status]);
    } catch (err) {
      notify('error', errMsg(err));
    }
  };

  const remove = (p: OffCourseProposal) =>
    confirmAction({
      title: 'പ്രൊപ്പോസൽ ഡിലീറ്റ് ചെയ്യണോ?',
      description: `"${p.topic}" — ഇത് തിരികെ കൊണ്ടുവരാനാവില്ല. ഇതുമായി ബന്ധിപ്പിച്ച ഒഴിവാക്കലുകൾ ഉണ്ടെങ്കിൽ ഡിലീറ്റ് അനുവദിക്കില്ല; പകരം "പിൻവലിക്കുക".`,
      confirmLabel: 'ഡിലീറ്റ്',
      tone: 'danger',
      onConfirm: async () => {
        try {
          await dataService.deleteProposal(session.profile, p.id);
          await refresh();
          notify('success', 'ഡിലീറ്റ് ചെയ്തു.');
        } catch (err) {
          notify('error', errMsg(err));
        }
      },
    });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="text-xs font-medium text-slate-700">
          സ്ഥിതി
          <select className={inputCls} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}>
            <option value="all">എല്ലാം</option>
            {(Object.keys(PROPOSAL_STATUS_LABEL) as ProposalStatus[]).map((s) => (
              <option key={s} value={s}>
                {PROPOSAL_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <div className="flex-1" />
        <button type="button" className={btnPrimary} onClick={() => setEditing('new')}>
          + പുതിയ പ്രൊപ്പോസൽ
        </button>
      </div>
      <p className="mb-3 text-[11px] text-slate-500">
        ആലിയ, പി.ജി വിദ്യാർത്ഥികൾക്ക് മാത്രം. ഗ്രൂപ്പിൽ പരമാവധി 6 പേർ. ക്രമം: ഡ്രാഫ്റ്റ് → പ്രിൻസിപ്പൽ അംഗീകാരം → CIC സമർപ്പണം → CIC തീരുമാനം.
      </p>
      {!list.length ? (
        <EmptyState title="പ്രൊപ്പോസലുകളില്ല" description="പുതിയ പ്രൊപ്പോസൽ ചേർക്കുക." />
      ) : (
        <div className="space-y-3">
          {list.map((p) => {
            const members = db.offcourse_proposal_members
              .filter((m) => m.proposal_id === p.id)
              .map((m) => studentName(db, db.students.find((s) => s.id === m.student_id)));
            return (
              <div key={p.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900">{p.topic}</div>
                    <div className="mt-0.5 text-[11px] text-slate-500">
                      {p.proposal_type === 'group' ? `ഗ്രൂപ്പ് (${members.length})` : 'ഇൻഡിവിജ്വൽ'} · {STAGE_LABEL[p.academic_stage]}
                      {p.model_code ? ` · ${p.model_code}` : ''} · നിർദ്ദേശിച്ചത് {p.proposed_credit} cr
                      {p.approved_credit ? ` · അംഗീകരിച്ചത് ${p.approved_credit} cr` : ''}
                      {p.application_no ? ` · App No ${p.application_no}` : ''}
                    </div>
                    <div className="mt-1 text-[11px] text-slate-700">{members.join(', ') || 'അംഗങ്ങളില്ല'}</div>
                    {p.guide_name && <div className="text-[11px] text-slate-500">ഗൈഡ്: {p.guide_name}</div>}
                    {p.exam_modes.length > 0 && <div className="text-[11px] text-slate-500">പരീക്ഷ: {p.exam_modes.join(', ')}</div>}
                    {p.work_submission_due && <div className="text-[11px] text-amber-700">സമർപ്പണം: {p.work_submission_due} ന് മുമ്പ്</div>}
                    {p.remarks && <div className="text-[11px] text-slate-500">കുറിപ്പ്: {p.remarks}</div>}
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                      isProposalApproved(p.status)
                        ? 'bg-emerald-50 text-emerald-800'
                        : p.status === 'rejected'
                          ? 'bg-red-50 text-red-700'
                          : p.status === 'rewrite'
                            ? 'bg-amber-50 text-amber-800'
                            : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {PROPOSAL_STATUS_LABEL[p.status]}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {PROPOSAL_NEXT[p.status].map((ns) => (
                    <button key={ns} type="button" className={btn} onClick={() => move(p, ns)}>
                      → {PROPOSAL_STATUS_LABEL[ns]}
                    </button>
                  ))}
                  <button type="button" className={btn} onClick={() => setEditing(p)}>
                    തിരുത്തുക
                  </button>
                  <button type="button" className={btn} onClick={() => setPrinting(p)}>
                    <Printer className="inline h-3 w-3 mr-1" /> CIC ഫോം
                  </button>
                  {(p.status === 'draft' || p.status === 'withdrawn') && (
                    <button type="button" className={btn} onClick={() => remove(p)}>
                      ഡിലീറ്റ്
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {editing && <ProposalModal proposal={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {decide && <DecisionModal proposal={decide.p} status={decide.status} onClose={() => setDecide(null)} />}
    </div>
  );
};

const ProposalModal: React.FC<{ proposal: OffCourseProposal | null; onClose: () => void }> = ({ proposal, onClose }) => {
  const { db, session, activeYear, notify, refresh } = useApp();
  const [type, setType] = useState<'individual' | 'group'>(proposal?.proposal_type || 'individual');
  const [stage, setStage] = useState<'aliya' | 'pg'>(proposal?.academic_stage || 'aliya');
  const [period, setPeriod] = useState<'' | 'Nov' | 'May'>(proposal?.semester_period || '');
  const [model, setModel] = useState(proposal?.model_code || '');
  const [topic, setTopic] = useState(proposal?.topic || '');
  const [credit, setCredit] = useState<string>(proposal ? String(proposal.proposed_credit) : '');
  const [guideMentor, setGuideMentor] = useState(proposal?.guide_mentor_id || '');
  const [guideName, setGuideName] = useState(proposal?.guide_name || '');
  const [guidePhone, setGuidePhone] = useState(proposal?.guide_phone || '');
  const [guideEmail, setGuideEmail] = useState(proposal?.guide_email || '');
  const [lang, setLang] = useState(proposal?.exam_language || '');
  const [modes, setModes] = useState<string[]>(proposal?.exam_modes || []);
  const [appNo, setAppNo] = useState(proposal?.application_no || '');
  const [due, setDue] = useState(proposal?.work_submission_due || '');
  const [remarks, setRemarks] = useState(proposal?.remarks || '');
  const [members, setMembers] = useState<string[]>(
    proposal && db ? db.offcourse_proposal_members.filter((m) => m.proposal_id === proposal.id).map((m) => m.student_id) : []
  );
  const [memberSearch, setMemberSearch] = useState('');
  const [saving, setSaving] = useState(false);
  if (!db || !session || !activeYear) return null;

  const eligible = db.students
    .filter((s) => !s.academic_stage || s.academic_stage === stage)
    .filter((s) => {
      const q = memberSearch.trim().toLowerCase();
      if (!q) return true;
      return studentName(db, s).toLowerCase().includes(q) || s.admission_number.toLowerCase().includes(q);
    })
    .slice(0, 60);
  const problems = validateProposalMembers(db, { id: proposal?.id || '', proposal_type: type, academic_stage: stage, topic }, members);

  const pickModel = (code: string) => {
    setModel(code);
    const m = db.offcourse_proposal_models.find((x) => x.code === code);
    if (m) {
      if (!topic.trim()) setTopic(m.title);
      if (!credit && m.max_credit) setCredit(String(m.max_credit));
    }
  };
  const pickGuide = (id: string) => {
    setGuideMentor(id);
    const m = db.mentors.find((x) => x.id === id);
    const p = db.profiles.find((x) => x.id === m?.profile_id);
    if (p) {
      setGuideName(p.full_name);
      setGuidePhone(p.phone || '');
      setGuideEmail(p.email || '');
    }
  };
  const toggleMember = (id: string) =>
    setMembers((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const save = async () => {
    setSaving(true);
    try {
      await dataService.saveProposal(
        session.profile,
        {
          id: proposal?.id,
          academic_year_id: proposal?.academic_year_id || activeYear.id,
          proposal_type: type,
          academic_stage: stage,
          semester_period: period || null,
          topic,
          model_code: model || null,
          proposed_credit: Number(credit),
          guide_mentor_id: guideMentor || null,
          guide_name: guideName,
          guide_phone: guidePhone,
          guide_email: guideEmail,
          exam_language: lang,
          exam_modes: modes,
          application_no: appNo,
          work_submission_due: due || null,
          remarks,
        },
        members
      );
      await refresh();
      notify('success', 'പ്രൊപ്പോസൽ സേവ് ചെയ്തു.');
      onClose();
    } catch (err) {
      notify('error', errMsg(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open title={proposal ? 'പ്രൊപ്പോസൽ തിരുത്തുക' : 'പുതിയ Off Course പ്രൊപ്പോസൽ'} onClose={onClose} maxWidth="xl">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="text-xs font-medium text-slate-700">
          തരം
          <select className={inputCls} value={type} onChange={(e) => setType(e.target.value as 'individual' | 'group')}>
            <option value="individual">Individual</option>
            <option value="group">Group (പരമാവധി 6)</option>
          </select>
        </label>
        <label className="text-xs font-medium text-slate-700">
          ഘട്ടം
          <select className={inputCls} value={stage} onChange={(e) => { setStage(e.target.value as 'aliya' | 'pg'); setMembers([]); }}>
            <option value="aliya">ആലിയ</option>
            <option value="pg">പി.ജി</option>
          </select>
        </label>
        <label className="text-xs font-medium text-slate-700">
          സെമസ്റ്റർ
          <select className={inputCls} value={period} onChange={(e) => setPeriod(e.target.value as '' | 'Nov' | 'May')}>
            <option value="">—</option>
            <option value="Nov">November</option>
            <option value="May">May</option>
          </select>
        </label>
        <label className="text-xs font-medium text-slate-700 sm:col-span-3">
          CIC മോഡൽ (ഉണ്ടെങ്കിൽ)
          <select className={inputCls} value={model} onChange={(e) => pickModel(e.target.value)}>
            <option value="">— സ്വന്തം വിഷയം —</option>
            {db.offcourse_proposal_models.map((m) => (
              <option key={m.code} value={m.code}>
                {m.code} — {m.title} ({m.exam_mode}, പരമാവധി {m.max_credit} cr)
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-700 sm:col-span-2">
          Proposed Topic (English)
          <input className={inputCls} value={topic} onChange={(e) => setTopic(e.target.value)} />
        </label>
        <label className="text-xs font-medium text-slate-700">
          Proposed Credit
          <input className={inputCls} type="number" step="0.5" min="0.5" max="6" value={credit} onChange={(e) => setCredit(e.target.value)} />
        </label>
        <label className="text-xs font-medium text-slate-700">
          ഗൈഡ് (മെന്റർ)
          <select className={inputCls} value={guideMentor} onChange={(e) => pickGuide(e.target.value)}>
            <option value="">— പുറത്തുനിന്നുള്ളയാൾ —</option>
            {db.mentors.map((m) => (
              <option key={m.id} value={m.id}>
                {db.profiles.find((p) => p.id === m.profile_id)?.full_name || m.employee_code}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-700">
          ഗൈഡിന്റെ പേര്
          <input className={inputCls} value={guideName} onChange={(e) => setGuideName(e.target.value)} />
        </label>
        <label className="text-xs font-medium text-slate-700">
          ഗൈഡ് ഫോൺ / ഇമെയിൽ
          <div className="flex gap-1">
            <input className={inputCls} value={guidePhone} onChange={(e) => setGuidePhone(e.target.value)} placeholder="Phone" />
            <input className={inputCls} value={guideEmail} onChange={(e) => setGuideEmail(e.target.value)} placeholder="Email" />
          </div>
        </label>
        <label className="text-xs font-medium text-slate-700">
          പരീക്ഷാ ഭാഷ
          <input className={inputCls} value={lang} onChange={(e) => setLang(e.target.value)} />
        </label>
        <label className="text-xs font-medium text-slate-700">
          Application No
          <input className={inputCls} value={appNo} onChange={(e) => setAppNo(e.target.value)} />
        </label>
        <label className="text-xs font-medium text-slate-700">
          വർക്ക് സമർപ്പണ തീയതി (പരീക്ഷയ്ക്ക് 15 ദിവസം മുമ്പ്)
          <input className={inputCls} type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </label>
        <div className="text-xs font-medium text-slate-700 sm:col-span-3">
          പരീക്ഷാ രീതി (CIC നിശ്ചയിച്ചത്)
          <div className="mt-1 flex flex-wrap gap-2">
            {EXAM_MODES.map((m) => (
              <label key={m} className="inline-flex items-center gap-1 rounded border border-slate-200 px-2 py-1 font-normal">
                <input
                  type="checkbox"
                  checked={modes.includes(m)}
                  onChange={() => setModes((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]))}
                />
                {m}
              </label>
            ))}
          </div>
        </div>
        <label className="text-xs font-medium text-slate-700 sm:col-span-3">
          കുറിപ്പ്
          <input className={inputCls} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
        </label>
        <div className="sm:col-span-3">
          <div className="text-xs font-medium text-slate-700">
            വിദ്യാർത്ഥികൾ ({members.length}) — ആദ്യത്തെയാൾ ഗ്രൂപ്പ് ലീഡർ
          </div>
          <input className={inputCls} value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)} placeholder="പേര് / അഡ്മിഷൻ നമ്പർ തിരയുക" />
          <div className="mt-2 max-h-44 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
            {eligible.map((s) => (
              <label key={s.id} className="flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer hover:bg-slate-50">
                <input type="checkbox" checked={members.includes(s.id)} onChange={() => toggleMember(s.id)} />
                <span className="font-medium">{studentName(db, s)}</span>
                <span className="text-slate-500">
                  {s.admission_number} · {s.batch_name}
                </span>
              </label>
            ))}
          </div>
        </div>
      </div>
      {problems.length > 0 && (
        <ul className="mt-3 list-disc pl-5 text-[12px] text-red-700">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className={btn} onClick={onClose}>
          റദ്ദാക്കുക
        </button>
        <button type="button" className={btnPrimary} onClick={save} disabled={saving || problems.length > 0 || !topic.trim() || !(Number(credit) > 0)}>
          സേവ്
        </button>
      </div>
    </Modal>
  );
};

const DecisionModal: React.FC<{ proposal: OffCourseProposal; status: ProposalStatus; onClose: () => void }> = ({
  proposal,
  status,
  onClose,
}) => {
  const { session, notify, refresh } = useApp();
  const [credit, setCredit] = useState<string>(String(proposal.approved_credit || proposal.proposed_credit || ''));
  const [remarks, setRemarks] = useState(proposal.remarks || '');
  const [appNo, setAppNo] = useState(proposal.application_no || '');
  const [saving, setSaving] = useState(false);
  if (!session) return null;
  const approve = isProposalApproved(status);
  const save = async () => {
    setSaving(true);
    try {
      await dataService.setProposalStatus(session.profile, proposal.id, status, {
        approved_credit: approve ? Number(credit) : null,
        remarks,
        application_no: appNo,
      });
      await refresh();
      notify('success', PROPOSAL_STATUS_LABEL[status]);
      onClose();
    } catch (err) {
      notify('error', errMsg(err));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal open title={`CIC തീരുമാനം: ${PROPOSAL_STATUS_LABEL[status]}`} subtitle={proposal.topic} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        {approve && (
          <label className="text-xs font-medium text-slate-700">
            Approved Credit
            <input className={inputCls} type="number" step="0.5" min="0.5" max="6" value={credit} onChange={(e) => setCredit(e.target.value)} />
          </label>
        )}
        <label className="text-xs font-medium text-slate-700">
          Application No
          <input className={inputCls} value={appNo} onChange={(e) => setAppNo(e.target.value)} />
        </label>
        <label className="text-xs font-medium text-slate-700 col-span-2">
          Remarks
          <input className={inputCls} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
        </label>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className={btn} onClick={onClose}>
          റദ്ദാക്കുക
        </button>
        <button type="button" className={btnPrimary} onClick={save} disabled={saving || (approve && !(Number(credit) > 0))}>
          സേവ്
        </button>
      </div>
    </Modal>
  );
};

/** Printable cover page in the layout of the CIC Off Course Proposal form. */
const ProposalPrint: React.FC<{ proposal: OffCourseProposal; onBack: () => void }> = ({ proposal: p, onBack }) => {
  const { db } = useApp();
  if (!db) return null;
  const settings = db.app_settings;
  const members = db.offcourse_proposal_members
    .filter((m) => m.proposal_id === p.id)
    .map((m) => db.students.find((s) => s.id === m.student_id))
    .filter((s): s is Student => Boolean(s));
  const optedOut = db.student_offcourse_selections.filter((s) => s.proposal_id === p.id && s.status !== 'cancelled');
  const cell = 'border border-slate-400 px-2 py-1.5 align-top';
  return (
    <div>
      <div className="no-print mb-4 flex gap-2">
        <button type="button" className={btn} onClick={onBack}>
          ← തിരികെ
        </button>
        <button type="button" className={btnPrimary} onClick={() => window.print()}>
          <Printer className="inline h-3.5 w-3.5 mr-1" /> Print / PDF
        </button>
        <span className="self-center text-[11px] text-slate-500">CIC-യുടെ ഔദ്യോഗിക Word ഫോം ആണ് സമർപ്പിക്കേണ്ടത്; ഇത് പൂരിപ്പിക്കാനുള്ള വിവരപ്പട്ടിക.</span>
      </div>
      <div className="mx-auto max-w-3xl bg-white p-6 text-[12px] text-slate-900">
        <div className="text-center text-base font-bold">OFF COURSE PROPOSAL ({p.proposal_type === 'group' ? 'GROUP' : 'INDIVIDUAL'})</div>
        <div className="mb-3 text-center text-[11px]">{settings.institution_name}</div>
        <table className="w-full border-collapse">
          <tbody>
            <tr>
              <td className={cell}>College: {settings.institution_name}</td>
              <td className={cell}>Class: {STAGE_LABEL[p.academic_stage]}</td>
              <td className={cell}>Semester: {p.semester_period || '☐ November ☐ May'}</td>
            </tr>
            <tr>
              <td className={cell} colSpan={2}>
                Proposed Topic (English): <b>{p.topic}</b>
              </td>
              <td className={cell}>Proposed Credit: {p.proposed_credit}</td>
            </tr>
            <tr>
              <td className={cell}>Proposal Code: {p.model_code || ''}</td>
              <td className={cell} colSpan={2}>
                Name of Supervisor/ Guide: {p.guide_name || ''}
              </td>
            </tr>
            <tr>
              <td className={cell}>Phone: {p.guide_phone || ''}</td>
              <td className={cell} colSpan={2}>
                Email: {p.guide_email || ''}
              </td>
            </tr>
          </tbody>
        </table>
        <div className="mt-3 font-semibold">Students</div>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={cell}>#</th>
              <th className={cell}>Name</th>
              <th className={cell}>CIC Ad No</th>
              <th className={cell}>Phone</th>
              <th className={cell}>Opted Out Elective (Code, Credit)</th>
            </tr>
          </thead>
          <tbody>
            {members.map((st, i) => {
              const prof = db.profiles.find((x) => x.id === st.profile_id);
              const opts = optedOut
                .filter((o) => o.student_id === st.id)
                .map((o) => {
                  const sub = db.subjects.find((x) => x.id === o.opted_out_subject_id);
                  return `${sub?.name || ''} (${sub?.code || ''}, ${o.opted_out_credit})`;
                })
                .join('; ');
              return (
                <tr key={st.id}>
                  <td className={cell}>{i + 1}</td>
                  <td className={cell}>
                    {prof?.full_name}
                    {i === 0 && p.proposal_type === 'group' ? ' (Leader)' : ''}
                  </td>
                  <td className={cell}>{st.cic_ad_no || ''}</td>
                  <td className={cell}>{prof?.phone || st.whatsapp_number || ''}</td>
                  <td className={cell}>{opts}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="mt-6 border border-slate-400 p-3">
          <div className="font-semibold">Approval of Principal</div>
          <p className="mt-1">
            I examined this Off Course study proposal prepared by the students and found that it is relevant for study and assure
            that college will provide sufficient facilities for completing the study.
          </p>
          <div className="mt-8">Name and signature of Principal: ______________________</div>
        </div>
      </div>
    </div>
  );
};

// ------------------------------------------------------------------------------
// Thamheediyya pool
// ------------------------------------------------------------------------------
const PoolTab: React.FC = () => {
  const { db, session, notify, refresh } = useApp();
  if (!db || !session) return null;
  const toggle = async (id: string, active: boolean) => {
    try {
      await dataService.setPoolItemActive(session.profile, id, active);
      await refresh();
    } catch (err) {
      notify('error', errMsg(err));
    }
  };
  const takenCount = (id: string) =>
    db.student_offcourse_selections.filter((s) => s.pool_item_id === id && s.status !== 'cancelled').length;
  return (
    <div>
      <p className="mb-3 text-[11px] text-slate-500">
        CIC Board of Studies — Off Course Pool 2026 (Thamheediyya). ടോപ്പിക് CIC ഫോമിൽ ഇതേപടി എഴുതണം. ഒരു ഭാഗം ഒരു വിദ്യാർത്ഥി ഒരിക്കൽ മാത്രം
        (Soft Skills / Event Management സെം 1–2-ൽ പഠിച്ചവർ 3–4-ൽ വീണ്ടും എടുക്കരുത്).
      </p>
      <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-slate-700 border-b border-slate-200">
            <tr>
              <th className="px-3 py-2.5">Topic</th>
              <th className="px-3 py-2.5">സെമസ്റ്റർ</th>
              <th className="px-3 py-2.5">പരീക്ഷ</th>
              <th className="px-3 py-2.5">ഭാഷ</th>
              <th className="px-3 py-2.5">എടുത്തവർ</th>
              <th className="px-3 py-2.5">ലഭ്യം</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {db.offcourse_pool_items.map((p) => (
              <tr key={p.id} className={p.is_active ? '' : 'text-slate-400'}>
                <td className="px-3 py-2">
                  <div className="font-medium">{p.topic}</div>
                  {p.note && <div className="text-[10px] text-slate-500">{p.note}</div>}
                </td>
                <td className="px-3 py-2">{p.semester_nos.join(' / ')}</td>
                <td className="px-3 py-2">
                  {p.exam_mode} · {p.mark}
                </td>
                <td className="px-3 py-2">{p.exam_language}</td>
                <td className="px-3 py-2 tabular-nums">{takenCount(p.id)}</td>
                <td className="px-3 py-2">
                  <input type="checkbox" checked={p.is_active} onChange={(e) => toggle(p.id, e.target.checked)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ------------------------------------------------------------------------------
// Course chart (syllabus subjects with credit and type)
// ------------------------------------------------------------------------------
const CourseChartTab: React.FC = () => {
  const { db, session, notify, refresh } = useApp();
  const [stage, setStage] = useState<AcademicStage>('aliya');
  const [sem, setSem] = useState<number | 0>(0);
  const [showUnassigned, setShowUnassigned] = useState(false);
  const [form, setForm] = useState({ code: '', name: '', course_type: 'elective' as CourseType, credit: '1', is_urdu: false, semester_no: 1, scheme: '' });
  if (!db || !session) return null;

  const rows = db.subjects
    .filter((s) => (showUnassigned ? !s.academic_stage : s.academic_stage === stage))
    .filter((s) => showUnassigned || !sem || s.semester_no === sem)
    .sort((a, b) => (a.semester_no || 0) - (b.semester_no || 0) || a.code.localeCompare(b.code));

  const update = async (id: string, patch: Partial<{ academic_stage: AcademicStage | null; semester_no: number | null; course_type: CourseType; is_urdu: boolean; credit: number }>) => {
    const s = db.subjects.find((x) => x.id === id);
    if (!s) return;
    try {
      await dataService.updateSubjectCourseChart(session.profile, id, {
        academic_stage: (patch.academic_stage !== undefined ? patch.academic_stage : s.academic_stage) || null,
        semester_no: (patch.semester_no !== undefined ? patch.semester_no : s.semester_no) || null,
        course_type: patch.course_type || s.course_type || 'core',
        is_urdu: patch.is_urdu ?? Boolean(s.is_urdu),
        credit: patch.credit ?? Number(s.credit || 0),
        scheme: s.scheme || null,
      });
      await refresh();
    } catch (err) {
      notify('error', errMsg(err));
    }
  };

  const add = async () => {
    try {
      await dataService.createCourseSubject(session.profile, {
        code: form.code,
        name: form.name,
        academic_stage: stage,
        semester_no: form.semester_no,
        course_type: form.course_type,
        is_urdu: form.is_urdu,
        credit: Number(form.credit || 0),
        scheme: form.scheme.trim() || null,
      });
      setForm({ ...form, code: '', name: '', is_urdu: false });
      await refresh();
      notify('success', 'വിഷയം ചേർത്തു.');
    } catch (err) {
      notify('error', errMsg(err));
    }
  };

  return (
    <div>
      <p className="mb-3 text-[11px] text-slate-500">
        ഓരോ സെമസ്റ്ററിലെയും വിഷയങ്ങൾ, ഇനം (Core / Elective / Interdisciplinary), ക്രെഡിറ്റ്. ക്രെഡിറ്റ് പരിധി കണക്കാക്കുന്നതും ടൈംടേബിളിൽ പകരം വിഷയം കാണിക്കുന്നതും ഇതിൽ നിന്നാണ്.
        തംഹീദിയ്യയിലെ ഉറുദുവിന് "ഉറുദു" ടിക്ക് ചെയ്യുക.
      </p>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="text-xs font-medium text-slate-700">
          ഘട്ടം
          <select className={inputCls} value={stage} onChange={(e) => { setStage(e.target.value as AcademicStage); setSem(0); setShowUnassigned(false); }}>
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-700">
          സെമസ്റ്റർ
          <select className={inputCls} value={sem} onChange={(e) => setSem(Number(e.target.value))}>
            <option value={0}>എല്ലാം</option>
            {Array.from({ length: STAGE_MAX_SEMESTER[stage] }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {i + 1}
              </option>
            ))}
          </select>
        </label>
        <label className="inline-flex items-center gap-1.5 text-xs text-slate-700">
          <input type="checkbox" checked={showUnassigned} onChange={(e) => setShowUnassigned(e.target.checked)} />
          ഘട്ടം നൽകാത്ത പഴയ വിഷയങ്ങൾ
        </label>
      </div>

      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-3">
        <div className="mb-2 text-xs font-semibold text-slate-800">പുതിയ വിഷയം ({STAGE_LABEL[stage]})</div>
        <div className="grid grid-cols-2 sm:grid-cols-7 gap-2 items-end">
          <input className={inputCls} placeholder="Code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          <input className={`${inputCls} sm:col-span-2`} placeholder="Subject name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <select className={inputCls} value={form.semester_no} onChange={(e) => setForm({ ...form, semester_no: Number(e.target.value) })}>
            {Array.from({ length: STAGE_MAX_SEMESTER[stage] }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                Sem {i + 1}
              </option>
            ))}
          </select>
          <select className={inputCls} value={form.course_type} onChange={(e) => setForm({ ...form, course_type: e.target.value as CourseType })}>
            <option value="core">Core</option>
            <option value="elective">Elective</option>
            <option value="interdisciplinary">Interdisciplinary</option>
          </select>
          <input className={inputCls} type="number" step="0.5" min="0" placeholder="Credit" value={form.credit} onChange={(e) => setForm({ ...form, credit: e.target.value })} />
          <div className="flex items-center gap-2">
            <label className="inline-flex items-center gap-1 text-xs">
              <input type="checkbox" checked={form.is_urdu} onChange={(e) => setForm({ ...form, is_urdu: e.target.checked })} /> ഉറുദു
            </label>
            <button type="button" className={btnPrimary} onClick={add} disabled={!form.code.trim() || !form.name.trim()}>
              ചേർക്കുക
            </button>
          </div>
        </div>
      </div>

      {!rows.length ? (
        <EmptyState title="വിഷയങ്ങളില്ല" description="മുകളിൽ ചേർക്കുക, അല്ലെങ്കിൽ പഴയ വിഷയങ്ങൾക്ക് ഘട്ടം നൽകുക." />
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-700 border-b border-slate-200">
              <tr>
                <th className="px-3 py-2.5">Code</th>
                <th className="px-3 py-2.5">വിഷയം</th>
                <th className="px-3 py-2.5">ഘട്ടം</th>
                <th className="px-3 py-2.5">സെം</th>
                <th className="px-3 py-2.5">ഇനം</th>
                <th className="px-3 py-2.5">ക്രെഡിറ്റ്</th>
                <th className="px-3 py-2.5">ഉറുദു</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((s) => (
                <tr key={s.id}>
                  <td className="px-3 py-1.5 font-mono">{s.code}</td>
                  <td className="px-3 py-1.5">{s.name}</td>
                  <td className="px-3 py-1.5">
                    <select className="rounded border border-slate-200 px-1 py-1" value={s.academic_stage || ''} onChange={(e) => update(s.id, { academic_stage: (e.target.value || null) as AcademicStage | null })}>
                      <option value="">—</option>
                      {STAGES.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-1.5">
                    <select className="rounded border border-slate-200 px-1 py-1" value={s.semester_no || ''} onChange={(e) => update(s.id, { semester_no: e.target.value ? Number(e.target.value) : null })}>
                      <option value="">—</option>
                      {Array.from({ length: 8 }, (_, i) => (
                        <option key={i + 1} value={i + 1}>
                          {i + 1}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-1.5">
                    <select className="rounded border border-slate-200 px-1 py-1" value={s.course_type || 'core'} onChange={(e) => update(s.id, { course_type: e.target.value as CourseType })}>
                      <option value="core">Core</option>
                      <option value="elective">Elective</option>
                      <option value="interdisciplinary">Interdisciplinary</option>
                      <option value="off_course">Off Course</option>
                    </select>
                  </td>
                  <td className="px-3 py-1.5">
                    <input
                      className="w-16 rounded border border-slate-200 px-1 py-1 tabular-nums"
                      type="number"
                      step="0.5"
                      min="0"
                      defaultValue={s.credit || 0}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (v !== Number(s.credit || 0)) void update(s.id, { credit: v });
                      }}
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <input type="checkbox" checked={Boolean(s.is_urdu)} onChange={(e) => update(s.id, { is_urdu: e.target.checked })} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

