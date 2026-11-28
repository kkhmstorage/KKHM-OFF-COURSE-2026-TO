import React from 'react';
import { useApp } from '../../context/AppContext';
import {
  creditsUsed,
  isProposalApproved,
  PROPOSAL_STATUS_LABEL,
  replacementLabel,
  STAGE_CREDIT_CAP,
  STAGE_LABEL,
} from '../../lib/offCourseRules';
import { EmptyState, PageHeader } from '../ui/CommonUI';

/** Student: what I opted out, what I study instead, credits used, proposal status. */
export const MyOffCourseView: React.FC = () => {
  const { db, session } = useApp();
  if (!db || !session?.student) return null;
  const student = db.students.find((s) => s.id === session.student!.id) || session.student;
  const stage = student.academic_stage || undefined;
  const sels = db.student_offcourse_selections.filter((s) => s.student_id === student.id && s.status !== 'cancelled');
  const proposals = db.offcourse_proposals.filter((p) =>
    db.offcourse_proposal_members.some((m) => m.proposal_id === p.id && m.student_id === student.id)
  );
  const cap = stage ? STAGE_CREDIT_CAP[stage] : undefined;
  const used = stage ? creditsUsed(db, student.id, stage) : 0;

  return (
    <div>
      <PageHeader
        title="എന്റെ Off-Course"
        subtitle={
          stage
            ? `${STAGE_LABEL[stage]} · സെമസ്റ്റർ ${student.stage_semester_no || '—'}${
                cap ? ` · ${used} / ${cap} ക്രെഡിറ്റ് ഉപയോഗിച്ചു` : ' · ഉറുദുവിന് പകരം പൂളിൽ നിന്ന്'
              }`
            : 'ഘട്ടം ഇതുവരെ രേഖപ്പെടുത്തിയിട്ടില്ല — ഓഫീസുമായി ബന്ധപ്പെടുക.'
        }
      />
      <h2 className="mb-2 text-sm font-semibold text-slate-900">ഒഴിവാക്കിയ വിഷയങ്ങളും പകരം പഠിക്കുന്നവയും</h2>
      {!sels.length ? (
        <EmptyState title="ഒന്നുമില്ല" description="ഒഴിവാക്കിയ വിഷയങ്ങൾ ഓഫീസ് രേഖപ്പെടുത്തുമ്പോൾ ഇവിടെ കാണാം." />
      ) : (
        <div className="mb-6 rounded-xl border border-slate-200 bg-white overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-700 border-b border-slate-200">
              <tr>
                <th className="px-3 py-2.5">സെമസ്റ്റർ</th>
                <th className="px-3 py-2.5">ഒഴിവാക്കിയത്</th>
                <th className="px-3 py-2.5">ക്രെഡിറ്റ്</th>
                <th className="px-3 py-2.5">പകരം</th>
                <th className="px-3 py-2.5">സ്ഥിതി</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sels.map((sel) => {
                const sub = db.subjects.find((x) => x.id === sel.opted_out_subject_id);
                return (
                  <tr key={sel.id}>
                    <td className="px-3 py-2">
                      {sel.semester_no}
                      {sel.semester_period ? ` (${sel.semester_period})` : ''}
                    </td>
                    <td className="px-3 py-2">{sub?.name}</td>
                    <td className="px-3 py-2 tabular-nums">{sel.opted_out_credit}</td>
                    <td className="px-3 py-2 font-medium text-teal-800">{replacementLabel(db, sel)}</td>
                    <td className="px-3 py-2">{sel.status === 'completed' ? 'പൂർത്തിയായി' : 'പഠിക്കുന്നു'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {stage !== 'thamheediyya' && (
        <>
          <h2 className="mb-2 text-sm font-semibold text-slate-900">എന്റെ പ്രൊപ്പോസലുകൾ</h2>
          {!proposals.length ? (
            <EmptyState title="പ്രൊപ്പോസലുകളില്ല" description="ഗൈഡിനോട് സംസാരിച്ച് പ്രൊപ്പോസൽ തയ്യാറാക്കാം." />
          ) : (
            <div className="space-y-2">
              {proposals.map((p) => (
                <div key={p.id} className="rounded-xl border border-slate-200 bg-white p-3 text-xs">
                  <div className="flex flex-wrap justify-between gap-2">
                    <span className="font-semibold text-slate-900">{p.topic}</span>
                    <span className={isProposalApproved(p.status) ? 'font-semibold text-emerald-700' : 'text-slate-600'}>
                      {PROPOSAL_STATUS_LABEL[p.status]}
                    </span>
                  </div>
                  <div className="mt-1 text-slate-500">
                    {p.guide_name ? `ഗൈഡ്: ${p.guide_name} · ` : ''}
                    {p.approved_credit ? `${p.approved_credit} ക്രെഡിറ്റ്` : `നിർദ്ദേശിച്ചത് ${p.proposed_credit} ക്രെഡിറ്റ്`}
                    {p.exam_modes.length ? ` · പരീക്ഷ: ${p.exam_modes.join(', ')}` : ''}
                  </div>
                  {p.work_submission_due && (
                    <div className="mt-1 font-medium text-amber-700">വർക്ക് സമർപ്പിക്കേണ്ട അവസാന തീയതി: {p.work_submission_due}</div>
                  )}
                  {p.remarks && <div className="mt-1 text-slate-600">CIC കുറിപ്പ്: {p.remarks}</div>}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};
