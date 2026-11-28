/**
 * CIC Off-Course rules, shared by the screens and the demo (sandbox) store.
 * The live database enforces the same rules in migration 007, so these checks
 * only give early, friendly feedback — they are not the security boundary.
 *
 *  - Thamheediyya: only Urdu may be opted out, replacement from the Off-Course Pool.
 *  - Aliya: elective subjects may be opted out until the total reaches 3 credits.
 *  - PG: same, up to 6 credits.
 *  - A subject (by code) can be opted out only once; Urdu is the exception.
 */
import type {
  AcademicStage,
  DatabaseSnapshot,
  OffCourseProposal,
  OffCoursePoolItem,
  ProposalStatus,
  StudentOffCourseSelection,
  Subject,
} from '../types/domain';

export const STAGE_MAX_SEMESTER: Record<AcademicStage, number> = {
  thamheediyya: 4,
  aliya: 8,
  pg: 4,
};

export const STAGE_CREDIT_CAP: Partial<Record<AcademicStage, number>> = {
  aliya: 3,
  pg: 6,
};

export const STAGE_LABEL: Record<AcademicStage, string> = {
  thamheediyya: 'തംഹീദിയ്യ (Thamheediyya)',
  aliya: 'ആലിയ (Aliya)',
  pg: 'പി.ജി (PG)',
};

export const PROPOSAL_STATUS_LABEL: Record<ProposalStatus, string> = {
  draft: 'ഡ്രാഫ്റ്റ്',
  principal_approved: 'പ്രിൻസിപ്പൽ അംഗീകരിച്ചു',
  submitted_to_cic: 'CIC-ക്ക് സമർപ്പിച്ചു',
  approved: 'അംഗീകരിച്ചു (മാറ്റമില്ലാതെ)',
  approved_with_changes: 'അംഗീകരിച്ചു (മാറ്റങ്ങളോടെ)',
  approved_conditional: 'നിബന്ധനയോടെ അംഗീകരിച്ചു',
  rewrite: 'വീണ്ടും എഴുതി സമർപ്പിക്കുക',
  rejected: 'തള്ളി',
  withdrawn: 'പിൻവലിച്ചു',
};

/** Allowed next statuses — mirrors trg_proposal_rules in migration 007. */
export const PROPOSAL_NEXT: Record<ProposalStatus, ProposalStatus[]> = {
  draft: ['principal_approved', 'withdrawn'],
  principal_approved: ['submitted_to_cic', 'draft', 'withdrawn'],
  submitted_to_cic: ['approved', 'approved_with_changes', 'approved_conditional', 'rewrite', 'rejected'],
  rewrite: ['draft', 'withdrawn'],
  approved: ['approved_with_changes', 'approved_conditional'],
  approved_with_changes: ['approved', 'approved_conditional'],
  approved_conditional: ['approved', 'approved_with_changes'],
  rejected: [],
  withdrawn: [],
};

export function isProposalApproved(status: ProposalStatus): boolean {
  return status === 'approved' || status === 'approved_with_changes' || status === 'approved_conditional';
}

export function activeSelections(db: DatabaseSnapshot, studentId: string): StudentOffCourseSelection[] {
  return (db.student_offcourse_selections || []).filter(
    (s) => s.student_id === studentId && s.status !== 'cancelled'
  );
}

export function creditsUsed(db: DatabaseSnapshot, studentId: string, stage: AcademicStage, excludeId?: string): number {
  return activeSelections(db, studentId)
    .filter((s) => s.academic_stage === stage && s.id !== excludeId)
    .reduce((acc, s) => acc + Number(s.opted_out_credit || 0), 0);
}

export interface SelectionDraft {
  id?: string;
  student_id: string;
  academic_stage: AcademicStage;
  semester_no: number;
  opted_out_subject_id: string;
  replacement_type: StudentOffCourseSelection['replacement_type'];
  pool_item_id?: string | null;
  proposal_id?: string | null;
  interdisciplinary_subject_id?: string | null;
  notes?: string | null;
}

/** Returns a list of problems (empty = allowed). Messages are in Malayalam for staff. */
export function validateSelection(db: DatabaseSnapshot, d: SelectionDraft): string[] {
  const errors: string[] = [];
  const sub: Subject | undefined = db.subjects.find((s) => s.id === d.opted_out_subject_id);
  if (!sub) return ['ഒഴിവാക്കുന്ന വിഷയം തിരഞ്ഞെടുക്കുക.'];

  if (d.semester_no < 1 || d.semester_no > STAGE_MAX_SEMESTER[d.academic_stage]) {
    errors.push(`${STAGE_LABEL[d.academic_stage]} ഘട്ടത്തിൽ ${STAGE_MAX_SEMESTER[d.academic_stage]} സെമസ്റ്റർ മാത്രമേയുള്ളൂ.`);
  }
  if (sub.academic_stage && sub.academic_stage !== d.academic_stage) {
    errors.push(`"${sub.name}" ഈ ഘട്ടത്തിലെ വിഷയമല്ല.`);
  }
  if (sub.semester_no && sub.semester_no !== d.semester_no) {
    errors.push(`"${sub.name}" സെമസ്റ്റർ ${sub.semester_no}-ലെ വിഷയമാണ്.`);
  }

  const others = activeSelections(db, d.student_id).filter((s) => s.id !== d.id);
  if (!sub.is_urdu) {
    const code = sub.code.trim().toLowerCase();
    const already = others.some((s) => {
      const x = db.subjects.find((y) => y.id === s.opted_out_subject_id);
      return x && x.code.trim().toLowerCase() === code;
    });
    if (already) errors.push(`"${sub.name}" മുമ്പ് ഒരിക്കൽ ഒഴിവാക്കിയതാണ്; ഇനി അത് കോർ വിഷയം പോലെയാണ്.`);
  }

  if (d.academic_stage === 'thamheediyya') {
    if (!sub.is_urdu) errors.push('തംഹീദിയ്യയിൽ ഉറുദു മാത്രമേ ഒഴിവാക്കാനാവൂ.');
    if (d.replacement_type !== 'pool') errors.push('തംഹീദിയ്യക്ക് പകരം വിഷയം Off-Course Pool-ൽ നിന്ന് മാത്രം.');
    const pool: OffCoursePoolItem | undefined = db.offcourse_pool_items.find((p) => p.id === d.pool_item_id);
    if (d.replacement_type === 'pool') {
      if (!pool) errors.push('പൂളിൽ നിന്ന് ഒരു വിഷയം തിരഞ്ഞെടുക്കുക.');
      else {
        if (!pool.is_active) errors.push('ഈ പൂൾ വിഷയം ഇപ്പോൾ ലഭ്യമല്ല.');
        if (!pool.semester_nos.includes(d.semester_no) && !(d.notes || '').trim()) {
          errors.push(
            `"${pool.topic}" സെമസ്റ്റർ ${pool.semester_nos.join('/')}-നുള്ളതാണ്. മറ്റൊരു സെമസ്റ്ററിൽ എടുക്കാൻ കാരണം Notes-ൽ എഴുതുക.`
          );
        }
        if (others.some((s) => s.pool_item_id === pool.id)) {
          errors.push(`"${pool.topic}" ഈ വിദ്യാർത്ഥി മുമ്പ് എടുത്തതാണ്.`);
        }
      }
    }
    return errors;
  }

  if (d.replacement_type === 'pool') errors.push('Off-Course Pool തംഹീദിയ്യക്ക് മാത്രമാണ്.');
  if ((sub.course_type || 'core') !== 'elective') errors.push(`ഇലക്ടീവ് വിഷയങ്ങൾ മാത്രമേ ഒഴിവാക്കാനാവൂ ("${sub.name}").`);
  if (!sub.credit || sub.credit <= 0) errors.push(`കോഴ്സ് ചാർട്ടിൽ "${sub.name}"-ന്റെ ക്രെഡിറ്റ് ആദ്യം നൽകുക.`);

  const cap = STAGE_CREDIT_CAP[d.academic_stage] ?? 0;
  const used = creditsUsed(db, d.student_id, d.academic_stage, d.id);
  if (used + Number(sub.credit || 0) > cap) {
    errors.push(`ക്രെഡിറ്റ് പരിധി ${cap}: ഇതുവരെ ${used}, ഈ വിഷയം ${sub.credit} — പരിധി കവിയും.`);
  }

  if (d.replacement_type === 'off_course') {
    const prop: OffCourseProposal | undefined = db.offcourse_proposals.find((p) => p.id === d.proposal_id);
    if (!prop) errors.push('പ്രൊപ്പോസൽ തിരഞ്ഞെടുക്കുക.');
    else {
      if (prop.academic_stage !== d.academic_stage) errors.push('ഈ പ്രൊപ്പോസൽ മറ്റൊരു ഘട്ടത്തിനുള്ളതാണ്.');
      if (prop.status === 'rejected' || prop.status === 'withdrawn') errors.push('തള്ളിയ/പിൻവലിച്ച പ്രൊപ്പോസൽ ഉപയോഗിക്കാനാവില്ല.');
      if (!db.offcourse_proposal_members.some((m) => m.proposal_id === prop.id && m.student_id === d.student_id)) {
        errors.push('ഈ വിദ്യാർത്ഥി ആ പ്രൊപ്പോസലിലെ അംഗമല്ല.');
      }
    }
  }
  if (d.replacement_type === 'interdisciplinary' && !d.interdisciplinary_subject_id) {
    errors.push('പകരം പഠിക്കുന്ന ഇന്റർഡിസിപ്ലിനറി വിഷയം തിരഞ്ഞെടുക്കുക.');
  }
  return errors;
}

/** Human label of what replaces the opted-out subject. */
export function replacementLabel(db: DatabaseSnapshot, s: StudentOffCourseSelection): string {
  if (s.replacement_type === 'pool') {
    return db.offcourse_pool_items.find((p) => p.id === s.pool_item_id)?.topic || 'Off-Course Pool';
  }
  if (s.replacement_type === 'off_course') {
    return db.offcourse_proposals.find((p) => p.id === s.proposal_id)?.topic || 'Off Course';
  }
  return db.subjects.find((x) => x.id === s.interdisciplinary_subject_id)?.name || 'Interdisciplinary';
}

/** Validation for proposal membership (mirrors trg_proposal_member_rules). */
export function validateProposalMembers(
  db: DatabaseSnapshot,
  proposal: Pick<OffCourseProposal, 'id' | 'proposal_type' | 'academic_stage' | 'topic'>,
  studentIds: string[]
): string[] {
  const errors: string[] = [];
  if (studentIds.length === 0) errors.push('കുറഞ്ഞത് ഒരു വിദ്യാർത്ഥിയെ ചേർക്കുക.');
  if (proposal.proposal_type === 'individual' && studentIds.length > 1) {
    errors.push('ഇൻഡിവിജ്വൽ പ്രൊപ്പോസലിൽ ഒരാൾ മാത്രം. കൂടുതൽ പേരുണ്ടെങ്കിൽ ഗ്രൂപ്പ് ആക്കുക.');
  }
  if (proposal.proposal_type === 'group' && studentIds.length > 6) {
    errors.push('ഒരു ഗ്രൂപ്പിൽ പരമാവധി 6 പേർ.');
  }
  for (const sid of studentIds) {
    const st = db.students.find((s) => s.id === sid);
    const name = db.profiles.find((p) => p.id === st?.profile_id)?.full_name || 'വിദ്യാർത്ഥി';
    if (st?.academic_stage && st.academic_stage !== proposal.academic_stage) {
      errors.push(`${name}: ${st.academic_stage === 'thamheediyya' ? 'തംഹീദിയ്യ വിദ്യാർത്ഥികൾ പ്രൊപ്പോസൽ സമർപ്പിക്കേണ്ടതില്ല' : 'ഘട്ടം വ്യത്യസ്തമാണ്'}.`);
    }
    const dup = db.offcourse_proposal_members.some((m) => {
      if (m.student_id !== sid || m.proposal_id === proposal.id) return false;
      const p = db.offcourse_proposals.find((x) => x.id === m.proposal_id);
      return p && isProposalApproved(p.status) && p.topic.trim().toLowerCase() === proposal.topic.trim().toLowerCase();
    });
    if (dup) errors.push(`${name}: ഇതേ വിഷയത്തിൽ മുമ്പ് അംഗീകാരം ലഭിച്ചതാണ്; വീണ്ടും സമർപ്പിക്കാനാവില്ല.`);
  }
  return errors;
}
