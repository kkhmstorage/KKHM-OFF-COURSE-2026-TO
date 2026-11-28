import {
  buildUnitSpecForDate,
  checkSequentialLock,
  getDefaultPeriodTimings,
  getEffectiveDaySlots,
  getTodayIST,
} from '../lib/dateUtils';
import {
  encodeSlotFallbackActivity,
  encodeTemplateStageInDescription,
  hydrateTimetableSlot,
  hydrateTimetableTemplate,
  inferSemesterStage,
  isValidAcademicStage,
  readLocalSemesterStageMap,
  resolveStudentTimetableContext,
  stripSlotFallbackMarker,
  writeLocalSemesterStage,
} from '../lib/timetableUtils';
import { hashPassword } from '../lib/cryptoUtils';
import { getSupabaseClient, isSupabaseConfigured, setSupabaseSessionToken } from '../lib/supabase';
import type {
  AcademicCalendarException,
  AcademicStage,
  AcademicYear,
  AcademicYearSettings,
  AppSettings,
  AuthSession,
  DatabaseSnapshot,
  PeriodActivityStatus,
  PeriodApprovalStatus,
  PeriodTiming,
  Profile,
  ReportSubmissionStatus,
  Semester,
  StudentSubjectSelection,
  Subject,
  SubjectSelectionStatus,
  TimetableSlot,
  WorkflowMode,
} from '../types/domain';
import { createIsolatedSandboxSeed } from './sandboxSeed';
import { PROPOSAL_MODELS, seedPoolItems } from '../lib/offCourseCatalog';
import { validateProposalMembers, validateSelection, PROPOSAL_NEXT, isProposalApproved } from '../lib/offCourseRules';
import type { SelectionDraft } from '../lib/offCourseRules';
import type {
  CourseType,
  OffCourseProposal,
  ProposalStatus,
  StudentOffCourseSelection,
} from '../types/domain';

export interface PasswordRow {
  profile_id: string;
  username: string;
  full_name: string;
  password: string | null;
  uses_default?: boolean;
}

/** Older demo stores (and the seed) may lack the Off-Course tables: fill them in. */
function normalizeSnapshot(db: DatabaseSnapshot): DatabaseSnapshot {
  const now = new Date().toISOString();
  if (!Array.isArray(db.offcourse_pool_items) || db.offcourse_pool_items.length === 0) {
    db.offcourse_pool_items = seedPoolItems(now);
  }
  if (!Array.isArray(db.offcourse_proposal_models) || db.offcourse_proposal_models.length === 0) {
    db.offcourse_proposal_models = PROPOSAL_MODELS.map((m) => ({ ...m }));
  }
  if (!Array.isArray(db.offcourse_proposals)) db.offcourse_proposals = [];
  if (!Array.isArray(db.offcourse_proposal_members)) db.offcourse_proposal_members = [];
  if (!Array.isArray(db.student_offcourse_selections)) db.student_offcourse_selections = [];
  return db;
}

type AnyQuery = { range: (a: number, b: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }> };

/** Reads every row of a table in pages of 1000 (Supabase returns at most 1000 per request). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAllRows<T = any>(
  build: () => AnyQuery,
  optional = false
): Promise<{ data: T[]; error: { message: string } | null }> {
  const PAGE = 1000;
  const out: T[] = [];
  for (let from = 0; from < 200000; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) {
      return optional ? { data: [], error: null } : { data: out, error };
    }
    const rows = (data || []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return { data: out, error: null };
}

function uid(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Dual-mode repository:
 * - Production Mode (when VITE_SUPABASE_URL & VITE_SUPABASE_ANON_KEY are configured):
 *   Executes live PostgreSQL queries & RLS-enforced RPCs against Supabase.
 * - Isolated Sandbox Preview Mode (when Supabase credentials are not yet configured):
 *   Runs complete relational business logic in-memory with zero fake "connected" claims.
 */
const SANDBOX_STORAGE_KEY = 'kkhm_ams_sandbox_store_v1';

class DataService {
  private sandboxDb: DatabaseSnapshot | null = null;
  private lastSupabaseSnapshot: DatabaseSnapshot | null = null;

  private getSandbox(): DatabaseSnapshot {
    if (!this.sandboxDb) {
      if (typeof window !== 'undefined' && window.localStorage) {
        try {
          const cached = window.localStorage.getItem(SANDBOX_STORAGE_KEY);
          if (cached) {
            this.sandboxDb = JSON.parse(cached);
          }
        } catch {
          // Ignore cache parse failures
        }
      }
      if (!this.sandboxDb) {
        this.sandboxDb = createIsolatedSandboxSeed();
      }
      normalizeSnapshot(this.sandboxDb);
      this.saveSandbox();
    }
    return this.sandboxDb;
  }

  private saveSandbox(): void {
    if (this.sandboxDb && typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem(SANDBOX_STORAGE_KEY, JSON.stringify(this.sandboxDb));
      } catch {
        // Handle storage quota limits gracefully
      }
    }
  }

  public isProductionSupabase(): boolean {
    return isSupabaseConfigured();
  }

  public async fetchSnapshot(): Promise<DatabaseSnapshot> {
    if (isSupabaseConfigured()) {
      try {
        const sb = getSupabaseClient();
        if (!sb) {
          throw new Error('Database connection is not available.');
        }

        const [
          profiles,
          students,
          mentors,
          academic_years,
          app_settings,
          academic_year_settings,
          student_academic_enrollments,
          mentor_assignments,
          semesters,
          subjects,
          semester_subjects,
          student_subject_selections,
          timetable_templates,
          timetable_slots,
          student_timetable_assignments,
          timetable_overrides,
          academic_calendar_exceptions,
          report_submissions,
          period_activity_entries,
          report_review_history,
          notifications,
          audit_logs,
          offcourse_pool_items,
          offcourse_proposal_models,
          offcourse_proposals,
          offcourse_proposal_members,
          student_offcourse_selections,
        ] = await Promise.all([
          fetchAllRows(() => sb.from('profiles').select('id,role,full_name,username,email,phone,is_active,last_login_at,created_at,updated_at,must_change_password').order('id', { ascending: true }) as unknown as AnyQuery).then(
            // before migration 006 the must_change_password column does not exist yet
            (r) => (r.error ? fetchAllRows(() => sb.from('profiles').select('id,role,full_name,username,email,phone,is_active,last_login_at,created_at,updated_at').order('id', { ascending: true }) as unknown as AnyQuery) : r)
          ),
          fetchAllRows(() => sb.from('students').select('*').order('id', { ascending: true }) as unknown as AnyQuery),
          fetchAllRows(() => sb.from('mentors').select('*').order('id', { ascending: true }) as unknown as AnyQuery),
          fetchAllRows(() => sb.from('academic_years').select('*').order('start_date', { ascending: false }).order('id', { ascending: true }) as unknown as AnyQuery),
          sb.from('app_settings').select('*').eq('id', 1).maybeSingle(),
          fetchAllRows(() => sb.from('academic_year_settings').select('*').order('id', { ascending: true }) as unknown as AnyQuery),
          fetchAllRows(() => sb.from('student_academic_enrollments').select('*').order('id', { ascending: true }) as unknown as AnyQuery),
          fetchAllRows(() => sb.from('mentor_assignments').select('*').order('id', { ascending: true }) as unknown as AnyQuery),
          fetchAllRows(() => sb.from('semesters').select('*').order('start_date', { ascending: true }).order('id', { ascending: true }) as unknown as AnyQuery),
          fetchAllRows(() => sb.from('subjects').select('*').order('code', { ascending: true }) as unknown as AnyQuery),
          fetchAllRows(() => sb.from('semester_subjects').select('*').order('id', { ascending: true }) as unknown as AnyQuery),
          fetchAllRows(() => sb.from('student_subject_selections').select('*').order('id', { ascending: true }) as unknown as AnyQuery),
          fetchAllRows(() => sb.from('timetable_templates').select('*').order('id', { ascending: true }) as unknown as AnyQuery),
          fetchAllRows(() => sb.from('timetable_slots').select('*').order('id', { ascending: true }) as unknown as AnyQuery),
          fetchAllRows(() => sb.from('student_timetable_assignments').select('*').order('id', { ascending: true }) as unknown as AnyQuery),
          fetchAllRows(() => sb.from('timetable_overrides').select('*').order('id', { ascending: true }) as unknown as AnyQuery),
          fetchAllRows(() => sb.from('academic_calendar_exceptions').select('*').order('exception_date', { ascending: false }).order('id', { ascending: true }) as unknown as AnyQuery),
          fetchAllRows(() => sb.from('report_submissions').select('*').order('start_date', { ascending: false }).order('id', { ascending: true }) as unknown as AnyQuery),
          fetchAllRows(() => sb.from('period_activity_entries').select('*').order('activity_date', { ascending: false }).order('id', { ascending: true }) as unknown as AnyQuery),
          fetchAllRows(() => sb.from('report_review_history').select('*').order('created_at', { ascending: false }).order('id', { ascending: true }) as unknown as AnyQuery),
          fetchAllRows(() => sb.from('notifications').select('*').order('created_at', { ascending: false }).order('id', { ascending: true }) as unknown as AnyQuery),
          sb.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(200),
          fetchAllRows(() => sb.from('offcourse_pool_items').select('*').order('topic', { ascending: true }).order('id', { ascending: true }) as unknown as AnyQuery, true),
          fetchAllRows(() => sb.from('offcourse_proposal_models').select('*').order('code', { ascending: true }).order('id', { ascending: true }) as unknown as AnyQuery, true),
          fetchAllRows(() => sb.from('offcourse_proposals').select('*').order('created_at', { ascending: false }).order('id', { ascending: true }) as unknown as AnyQuery, true),
          fetchAllRows(() => sb.from('offcourse_proposal_members').select('*').order('proposal_id', { ascending: true }).order('student_id', { ascending: true }) as unknown as AnyQuery, true),
          fetchAllRows(() => sb.from('student_offcourse_selections').select('*').order('created_at', { ascending: false }).order('id', { ascending: true }) as unknown as AnyQuery, true),
        ]);

        const err =
          profiles.error ||
          academic_years.error ||
          app_settings.error ||
          report_submissions.error;
        if (err) {
          throw new Error(`Database error: ${err.message}`);
        }

        const fallbackSettings: AppSettings = app_settings.data || {
          id: 1,
          institution_name: 'KKHM Islamic & Arts College',
          application_name: 'KKHM Off-Course Activity Management System',
          timezone: 'Asia/Kolkata',
          default_language: 'en',
          selected_academic_year_id: academic_years.data?.[0]?.id || '',
          in_app_notifications_enabled: true,
          reminder_hour: 17,
          session_timeout_hours: 168,
          updated_at: new Date().toISOString(),
        };

        const hydratedTemplates = (timetable_templates.data || []).map(hydrateTimetableTemplate);
        const hydratedSlots = (timetable_slots.data || []).map(hydrateTimetableSlot);
        const localStageMap = readLocalSemesterStageMap();
        const hydratedSemesters: Semester[] = (semesters.data || []).map((sem: Semester) => {
          const linkedTplStage = hydratedTemplates.find(
            (t) => t.semester_id === sem.id && isValidAcademicStage(t.academic_stage)
          )?.academic_stage;
          const stage = isValidAcademicStage(sem.academic_stage)
            ? sem.academic_stage
            : linkedTplStage || localStageMap[sem.id] || inferSemesterStage(sem);
          return { ...sem, academic_stage: stage };
        });

        const snapshot: DatabaseSnapshot = {
          profiles: (profiles.data || []) as Profile[],
          students: students.data || [],
          mentors: mentors.data || [],
          academic_years: academic_years.data || [],
          app_settings: fallbackSettings,
          academic_year_settings: academic_year_settings.data || [],
          student_academic_enrollments: student_academic_enrollments.data || [],
          mentor_assignments: mentor_assignments.data || [],
          semesters: hydratedSemesters,
          subjects: subjects.data || [],
          semester_subjects: semester_subjects.data || [],
          student_subject_selections: student_subject_selections.data || [],
          timetable_templates: hydratedTemplates,
          timetable_slots: hydratedSlots,
          student_timetable_assignments: student_timetable_assignments.data || [],
          timetable_overrides: timetable_overrides.data || [],
          academic_calendar_exceptions: academic_calendar_exceptions.data || [],
          report_submissions: report_submissions.data || [],
          period_activity_entries: period_activity_entries.data || [],
          report_review_history: report_review_history.data || [],
          notifications: notifications.data || [],
          audit_logs: audit_logs.data || [],
          offcourse_pool_items: (offcourse_pool_items.data || []).map((p: any) => ({ ...p, semester_nos: p.semester_nos || [] })),
          offcourse_proposal_models: offcourse_proposal_models.data || [],
          offcourse_proposals: (offcourse_proposals.data || []).map((p: any) => ({
            ...p,
            proposed_credit: Number(p.proposed_credit),
            approved_credit: p.approved_credit == null ? null : Number(p.approved_credit),
            exam_modes: p.exam_modes || [],
          })),
          offcourse_proposal_members: offcourse_proposal_members.data || [],
          student_offcourse_selections: (student_offcourse_selections.data || []).map((x: any) => ({
            ...x,
            opted_out_credit: Number(x.opted_out_credit),
          })),
        };
        snapshot.subjects = snapshot.subjects.map((x: any) => ({ ...x, credit: Number(x.credit || 0) }));
        this.lastSupabaseSnapshot = snapshot;
        return snapshot;
      } catch (err) {
        console.error('Supabase fetch failed:', err);
        throw err instanceof Error ? err : new Error('Could not load data from the database.');
      }
    }

    // Clone snapshot for React immutability and ensure stages/slots are hydrated
    const cloned = structuredClone(this.getSandbox());
    cloned.timetable_templates = cloned.timetable_templates.map(hydrateTimetableTemplate);
    cloned.timetable_slots = cloned.timetable_slots.map(hydrateTimetableSlot);
    cloned.semesters = cloned.semesters.map((s) => ({
      ...s,
      academic_stage: inferSemesterStage(s),
    }));
    return cloned;
  }

  public async login(identifier: string, password: string): Promise<AuthSession> {
    const cleanId = identifier.trim().toLowerCase();
    if (!cleanId || !password) {
      throw new Error('Please enter both username/email and password.');
    }

    if (isSupabaseConfigured()) {
      try {
        const sb = getSupabaseClient();
        if (sb) {
          const { data, error } = await sb.rpc('authenticate_user', {
            p_identifier: identifier.trim(),
            p_password: password,
          });
          if (!error && data?.session_token && data?.profile) {
            const token = data.session_token as string;
            const profile = data.profile as Profile;
            setSupabaseSessionToken(token);


            const authedClient = getSupabaseClient()!;
            const [{ data: student }, { data: mentor }] = await Promise.all([
              authedClient.from('students').select('*').eq('profile_id', profile.id).maybeSingle(),
              authedClient.from('mentors').select('*').eq('profile_id', profile.id).maybeSingle(),
            ]);
            return {
              token,
              profile,
              student: student || undefined,
              mentor: mentor || undefined,
            };
          }
          if (error) throw new Error(error.message || 'Sign-in failed.');
          if (data?.error) throw new Error(String(data.error));
          throw new Error('Invalid username/email or password.');
        }
      } catch (err) {
        throw err instanceof Error ? err : new Error('Sign-in failed. Check your internet connection.');
      }
      throw new Error('Database connection is not available.');
    }

    const db = this.getSandbox();
    const profile = db.profiles.find(
      (p) => p.username.toLowerCase() === cleanId || p.email.toLowerCase() === cleanId
    );
    if (!profile) {
      throw new Error('Invalid username/email or password.');
    }
    if (!profile.is_active) {
      throw new Error('This account has been deactivated by the administrator.');
    }
    const inputHash = await hashPassword(password);
    const passwordMatches =
      (profile.password_hash_sandbox && profile.password_hash_sandbox === inputHash) ||
      (profile.password_sandbox && profile.password_sandbox === password);

    if (!passwordMatches) {
      throw new Error('Invalid username/email or password.');
    }

    profile.last_login_at = new Date().toISOString();
    this.appendSandboxAudit(profile, 'USER_LOGIN', 'profile', profile.id, {
      username: profile.username,
    });

    const student = db.students.find((s) => s.profile_id === profile.id);
    const mentor = db.mentors.find((m) => m.profile_id === profile.id);

    return {
      token: uid('sandbox-sess'),
      profile: structuredClone(profile),
      student: student ? structuredClone(student) : undefined,
      mentor: mentor ? structuredClone(mentor) : undefined,
    };
  }

  public logout(): void {
    const sb = isSupabaseConfigured() ? getSupabaseClient() : null;
    if (sb) {
      void sb.rpc('logout_session').then(
        () => setSupabaseSessionToken(null),
        () => setSupabaseSessionToken(null)
      );
      return;
    }
    setSupabaseSessionToken(null);
  }

  private appendSandboxAudit(
    actor: Profile,
    action: string,
    record_type: string,
    record_id: string | undefined,
    details: Record<string, unknown>
  ) {
    const db = this.getSandbox();
    db.audit_logs.unshift({
      id: uid('aud'),
      actor_profile_id: actor.id,
      actor_name: actor.full_name,
      actor_role: actor.role,
      action,
      record_type,
      record_id,
      details,
      created_at: new Date().toISOString(),
    });
  }

  private async logSupabaseAudit(
    actor: Profile,
    action: string,
    record_type: string,
    record_id: string | undefined,
    details: Record<string, unknown>
  ) {
    const sb = getSupabaseClient();
    if (!sb) return;
    await sb.from('audit_logs').insert({
      actor_profile_id: actor.id,
      actor_name: actor.full_name,
      actor_role: actor.role,
      action,
      record_type,
      record_id,
      details,
    });
  }

  private assertAdmin(actor: Profile): void {
    if (actor.role !== 'admin') {
      throw new Error('Forbidden: Administrator privileges are required for this action.');
    }
  }

  // ==================== ACADEMIC YEARS ====================

  public async setSelectedAcademicYear(actor: Profile, yearId: string): Promise<void> {
    this.assertAdmin(actor);
    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      const { error } = await sb
        .from('app_settings')
        .update({ selected_academic_year_id: yearId })
        .eq('id', 1);
      if (error) throw new Error(error.message);
      await this.logSupabaseAudit(actor, 'ACADEMIC_YEAR_SWITCHED', 'academic_year', yearId, {});
      return;
    }

    const db = this.getSandbox();
    const target = db.academic_years.find((y) => y.id === yearId);
    if (!target) throw new Error('Academic year not found.');
    db.app_settings.selected_academic_year_id = yearId;
    db.app_settings.updated_at = new Date().toISOString();
    this.appendSandboxAudit(actor, 'ACADEMIC_YEAR_SWITCHED', 'academic_year', yearId, {
      name: target.name,
    });
  }

  public async createAcademicYear(
    actor: Profile,
    payload: {
      name: string;
      start_date: string;
      end_date: string;
      status: 'open' | 'closed';
      description?: string;
      working_days?: number[];
      period_count?: number;
      entry_mode?: WorkflowMode;
      approval_mode?: WorkflowMode;
    }
  ): Promise<AcademicYear> {
    this.assertAdmin(actor);
    if (!payload.name.trim()) throw new Error('Academic year name is required.');
    if (payload.end_date <= payload.start_date) {
      throw new Error('End date must be after start date.');
    }

    const workingDays = payload.working_days?.length ? payload.working_days : [1, 2, 3, 4, 5, 6];
    const periodCount = payload.period_count || 8;
    const timings = getDefaultPeriodTimings(periodCount);

    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      const { data, error } = await sb
        .from('academic_years')
        .insert({
          name: payload.name.trim(),
          start_date: payload.start_date,
          end_date: payload.end_date,
          status: payload.status,
          description: payload.description?.trim() || null,
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      await sb.from('academic_year_settings').insert({
        academic_year_id: data.id,
        working_days: workingDays,
        period_count: periodCount,
        week_start_day: 1,
        entry_mode: payload.entry_mode || 'daily',
        approval_mode: payload.approval_mode || 'daily',
        default_period_timings: timings,
      });
      await this.logSupabaseAudit(actor, 'ACADEMIC_YEAR_CREATED', 'academic_year', data.id, {
        name: data.name,
      });
      return data;
    }

    const db = this.getSandbox();
    if (db.academic_years.some((y) => y.name.toLowerCase() === payload.name.trim().toLowerCase())) {
      throw new Error(`Academic year "${payload.name}" already exists.`);
    }
    const now = new Date().toISOString();
    const year: AcademicYear = {
      id: uid('ay'),
      name: payload.name.trim(),
      start_date: payload.start_date,
      end_date: payload.end_date,
      status: payload.status,
      description: payload.description?.trim(),
      created_at: now,
      updated_at: now,
    };
    db.academic_years.unshift(year);
    db.academic_year_settings.push({
      id: uid('ays'),
      academic_year_id: year.id,
      working_days: workingDays,
      period_count: periodCount,
      week_start_day: 1,
      entry_mode: payload.entry_mode || 'daily',
      approval_mode: payload.approval_mode || 'daily',
      default_period_timings: timings,
      updated_at: now,
    });
    this.appendSandboxAudit(actor, 'ACADEMIC_YEAR_CREATED', 'academic_year', year.id, {
      name: year.name,
    });
    return structuredClone(year);
  }

  public async toggleAcademicYearStatus(actor: Profile, yearId: string, status: 'open' | 'closed'): Promise<void> {
    this.assertAdmin(actor);
    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      const { error } = await sb.from('academic_years').update({ status }).eq('id', yearId);
      if (error) throw new Error(error.message);
      await this.logSupabaseAudit(
        actor,
        status === 'closed' ? 'ACADEMIC_YEAR_CLOSED' : 'ACADEMIC_YEAR_REOPENED',
        'academic_year',
        yearId,
        { status }
      );
      return;
    }

    const db = this.getSandbox();
    const year = db.academic_years.find((y) => y.id === yearId);
    if (!year) throw new Error('Academic year not found.');
    year.status = status;
    year.updated_at = new Date().toISOString();
    this.appendSandboxAudit(
      actor,
      status === 'closed' ? 'ACADEMIC_YEAR_CLOSED' : 'ACADEMIC_YEAR_REOPENED',
      'academic_year',
      yearId,
      { name: year.name, status }
    );
    this.saveSandbox();
  }

  public async deleteAcademicYear(actor: Profile, yearId: string): Promise<void> {
    this.assertAdmin(actor);
    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      await sb.from('calendar_exceptions').delete().eq('academic_year_id', yearId);
      await sb.from('timetable_templates').delete().eq('academic_year_id', yearId);
      await sb.from('student_subject_selections').delete().eq('academic_year_id', yearId);
      await sb.from('student_mentor_assignments').delete().eq('academic_year_id', yearId);
      await sb.from('report_submissions').delete().eq('academic_year_id', yearId);
      await sb.from('student_academic_enrollments').delete().eq('academic_year_id', yearId);
      await sb.from('academic_year_settings').delete().eq('academic_year_id', yearId);
      const { error } = await sb.from('academic_years').delete().eq('id', yearId);
      if (error) throw new Error(error.message);
      await this.logSupabaseAudit(actor, 'ACADEMIC_YEAR_DELETED', 'academic_year', yearId, {});
      return;
    }

    const db = this.getSandbox();
    const year = db.academic_years.find((y) => y.id === yearId);
    if (!year) throw new Error('Academic year not found.');
    db.academic_years = db.academic_years.filter((y) => y.id !== yearId);
    db.academic_year_settings = db.academic_year_settings.filter((s) => s.academic_year_id !== yearId);
    db.student_academic_enrollments = db.student_academic_enrollments.filter((e) => e.academic_year_id !== yearId);
    db.report_submissions = db.report_submissions.filter((r) => r.academic_year_id !== yearId);
    db.timetable_templates = db.timetable_templates.filter((t) => t.academic_year_id !== yearId);
    db.academic_calendar_exceptions = db.academic_calendar_exceptions.filter((c) => c.academic_year_id !== yearId);
    db.student_subject_selections = db.student_subject_selections.filter((s) => s.academic_year_id !== yearId);
    db.mentor_assignments = db.mentor_assignments.filter((m) => m.academic_year_id !== yearId);
    this.appendSandboxAudit(actor, 'ACADEMIC_YEAR_DELETED', 'academic_year', year.name, {});
    this.saveSandbox();
  }

  // ==================== STUDENTS & MENTORS & CREDENTIALS ====================

  public async createStudent(
    actor: Profile,
    payload: {
      full_name: string;
      admission_number: string;
      batch_name: string;
      email: string;
      phone?: string;
      username: string;
      password: string;
      academic_year_id: string;
      is_active?: boolean;
      // CIC Academic Details
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
  ): Promise<void> {
    this.assertAdmin(actor);
    if (!payload.full_name.trim() || !payload.admission_number.trim() || !payload.username.trim()) {
      throw new Error('Full Name, Admission Number, and Username are required.');
    }
    if (payload.password.length < 8) {
      throw new Error('Password must be at least 8 characters.');
    }

    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      // Insert profile via SQL / RLS (note: for bcrypt hashing on insert in Supabase, use RPC or edge function)
      const { data: prof, error: pErr } = await sb
        .from('profiles')
        .insert({
          role: 'student',
          full_name: payload.full_name.trim(),
          username: payload.username.trim(),
          email: payload.email.trim(),
          phone: payload.phone?.trim() || null,
          password_hash: payload.password, // hashed by the database trigger (migration 006)
          is_active: payload.is_active ?? true,
        })
        .select('id')
        .single();
      if (pErr) throw new Error(pErr.message);
      const { data: stu, error: sErr } = await sb
        .from('students')
        .insert({
          profile_id: prof.id,
          admission_number: payload.admission_number.trim(),
          batch_name: payload.batch_name.trim(),
          cic_ad_no: payload.cic_ad_no?.trim() || null,
          clg_ad_no: payload.clg_ad_no?.trim() || payload.admission_number.trim(),
          academic_year_text: payload.academic_year_text?.trim() || null,
          semester_text: payload.semester_text?.trim() || null,
          semester_period: payload.semester_period?.trim() || null,
          course_stream: payload.course_stream?.trim() || null,
          college_name: payload.college_name?.trim() || null,
          subject_title: payload.subject_title?.trim() || null,
          proposal_app_no: payload.proposal_app_no?.trim() || null,
          course_credit: payload.course_credit?.trim() || null,
          guide_name: payload.guide_name?.trim() || null,
          whatsapp_number: payload.whatsapp_number?.trim() || null,
          reference_notes: payload.reference_notes?.trim() || null,
        })
        .select()
        .single();
      if (sErr) throw new Error(sErr.message);
      await sb.from('student_academic_enrollments').insert({
        student_id: stu.id,
        academic_year_id: payload.academic_year_id,
        class_batch: payload.batch_name.trim(),
        status: 'active',
        enrolled_at: getTodayIST(),
      });
      await this.logSupabaseAudit(actor, 'STUDENT_CREATED', 'student', stu.id, {
        admission_number: payload.admission_number.trim(),
        username: payload.username.trim(),
      });
      return;
    }

    const db = this.getSandbox();
    if (
      db.students.some(
        (s) => s.admission_number.toLowerCase() === payload.admission_number.trim().toLowerCase()
      )
    ) {
      throw new Error(`Admission number "${payload.admission_number}" already exists.`);
    }
    if (
      db.profiles.some(
        (p) =>
          p.username.toLowerCase() === payload.username.trim().toLowerCase() ||
          p.email.toLowerCase() === payload.email.trim().toLowerCase()
      )
    ) {
      throw new Error('Username or email is already in use.');
    }

    const now = new Date().toISOString();
    const profId = uid('prof-stu');
    const stuId = uid('stu');
    const pwdHash = await hashPassword(payload.password);

    db.profiles.push({
      id: profId,
      role: 'student',
      full_name: payload.full_name.trim(),
      username: payload.username.trim(),
      email: payload.email.trim(),
      phone: payload.phone?.trim(),
      password_hash_sandbox: pwdHash,
      is_active: payload.is_active ?? true,
      created_at: now,
      updated_at: now,
    });

    db.students.push({
      id: stuId,
      profile_id: profId,
      admission_number: payload.admission_number.trim(),
      batch_name: payload.batch_name.trim(),
      cic_ad_no: payload.cic_ad_no?.trim(),
      clg_ad_no: payload.clg_ad_no?.trim() || payload.admission_number.trim(),
      academic_year_text: payload.academic_year_text?.trim(),
      semester_text: payload.semester_text?.trim(),
      semester_period: payload.semester_period?.trim(),
      course_stream: payload.course_stream?.trim(),
      college_name: payload.college_name?.trim(),
      subject_title: payload.subject_title?.trim(),
      proposal_app_no: payload.proposal_app_no?.trim(),
      course_credit: payload.course_credit?.trim(),
      guide_name: payload.guide_name?.trim(),
      whatsapp_number: payload.whatsapp_number?.trim(),
      reference_notes: payload.reference_notes?.trim(),
      created_at: now,
      updated_at: now,
    });

    db.student_academic_enrollments.push({
      id: uid('enr'),
      student_id: stuId,
      academic_year_id: payload.academic_year_id,
      class_batch: payload.batch_name.trim(),
      status: 'active',
      enrolled_at: getTodayIST(),
      created_at: now,
    });

    this.appendSandboxAudit(actor, 'STUDENT_CREATED', 'student', stuId, {
      full_name: payload.full_name.trim(),
      admission_number: payload.admission_number.trim(),
      username: payload.username.trim(),
    });
    this.saveSandbox();
  }

  public async updateStudent(
    actor: Profile,
    studentId: string,
    payload: {
      full_name: string;
      admission_number: string;
      batch_name: string;
      email: string;
      phone?: string;
      username: string;
      new_password?: string;
      is_active: boolean;
      // CIC Academic Details
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
  ): Promise<void> {
    this.assertAdmin(actor);
    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      const { data: stu } = await sb.from('students').select('*').eq('id', studentId).single();
      if (!stu) throw new Error('Student not found.');
      const { error: sErr } = await sb
        .from('students')
        .update({
          admission_number: payload.admission_number.trim(),
          batch_name: payload.batch_name.trim(),
          cic_ad_no: payload.cic_ad_no !== undefined ? payload.cic_ad_no.trim() || null : undefined,
          clg_ad_no: payload.clg_ad_no !== undefined ? payload.clg_ad_no.trim() || null : undefined,
          academic_year_text: payload.academic_year_text !== undefined ? payload.academic_year_text.trim() || null : undefined,
          semester_text: payload.semester_text !== undefined ? payload.semester_text.trim() || null : undefined,
          semester_period: payload.semester_period !== undefined ? payload.semester_period.trim() || null : undefined,
          course_stream: payload.course_stream !== undefined ? payload.course_stream.trim() || null : undefined,
          college_name: payload.college_name !== undefined ? payload.college_name.trim() || null : undefined,
          subject_title: payload.subject_title !== undefined ? payload.subject_title.trim() || null : undefined,
          proposal_app_no: payload.proposal_app_no !== undefined ? payload.proposal_app_no.trim() || null : undefined,
          course_credit: payload.course_credit !== undefined ? payload.course_credit.trim() || null : undefined,
          guide_name: payload.guide_name !== undefined ? payload.guide_name.trim() || null : undefined,
          whatsapp_number: payload.whatsapp_number !== undefined ? payload.whatsapp_number.trim() || null : undefined,
          reference_notes: payload.reference_notes !== undefined ? payload.reference_notes.trim() || null : undefined,
        })
        .eq('id', studentId);
      if (sErr) throw new Error(sErr.message);

      const { error: pErr } = await sb
        .from('profiles')
        .update({
          full_name: payload.full_name.trim(),
          email: payload.email.trim(),
          phone: payload.phone?.trim() || null,
          is_active: payload.is_active,
        })
        .eq('id', stu.profile_id);
      if (pErr) throw new Error(pErr.message);

      const { error: credErr } = await sb.rpc('admin_update_credentials', {
        p_target_profile_id: stu.profile_id,
        p_new_username: payload.username.trim(),
        p_new_password: payload.new_password?.trim() || null,
      });
      if (credErr) throw new Error(credErr.message);
      await this.logSupabaseAudit(actor, 'STUDENT_UPDATED', 'student', studentId, {
        username: payload.username.trim(),
      });
      return;
    }

    const db = this.getSandbox();
    const stu = db.students.find((s) => s.id === studentId);
    if (!stu) throw new Error('Student not found.');
    const prof = db.profiles.find((p) => p.id === stu.profile_id);
    if (!prof) throw new Error('Profile not found.');

    if (
      db.students.some(
        (s) =>
          s.id !== studentId &&
          s.admission_number.toLowerCase() === payload.admission_number.trim().toLowerCase()
      )
    ) {
      throw new Error('Another student already has this admission number.');
    }
    if (
      db.profiles.some(
        (p) =>
          p.id !== prof.id &&
          (p.username.toLowerCase() === payload.username.trim().toLowerCase() ||
            p.email.toLowerCase() === payload.email.trim().toLowerCase())
      )
    ) {
      throw new Error('Username or email already belongs to another account.');
    }

    const now = new Date().toISOString();
    stu.admission_number = payload.admission_number.trim();
    stu.batch_name = payload.batch_name.trim();
    if (payload.cic_ad_no !== undefined) stu.cic_ad_no = payload.cic_ad_no.trim();
    if (payload.clg_ad_no !== undefined) stu.clg_ad_no = payload.clg_ad_no.trim();
    if (payload.academic_year_text !== undefined) stu.academic_year_text = payload.academic_year_text.trim();
    if (payload.semester_text !== undefined) stu.semester_text = payload.semester_text.trim();
    if (payload.semester_period !== undefined) stu.semester_period = payload.semester_period.trim();
    if (payload.course_stream !== undefined) stu.course_stream = payload.course_stream.trim();
    if (payload.college_name !== undefined) stu.college_name = payload.college_name.trim();
    if (payload.subject_title !== undefined) stu.subject_title = payload.subject_title.trim();
    if (payload.proposal_app_no !== undefined) stu.proposal_app_no = payload.proposal_app_no.trim();
    if (payload.course_credit !== undefined) stu.course_credit = payload.course_credit.trim();
    if (payload.guide_name !== undefined) stu.guide_name = payload.guide_name.trim();
    if (payload.whatsapp_number !== undefined) stu.whatsapp_number = payload.whatsapp_number.trim();
    if (payload.reference_notes !== undefined) stu.reference_notes = payload.reference_notes.trim();
    stu.updated_at = now;

    prof.full_name = payload.full_name.trim();
    prof.email = payload.email.trim();
    prof.phone = payload.phone?.trim();
    prof.username = payload.username.trim();
    prof.is_active = payload.is_active;
    if (payload.new_password && payload.new_password.trim().length >= 6) {
      prof.password_hash_sandbox = await hashPassword(payload.new_password.trim());
      prof.password_sandbox = undefined;
      prof.is_temporary_password = false;
    }
    prof.updated_at = now;

    this.appendSandboxAudit(actor, 'STUDENT_UPDATED', 'student', studentId, {
      full_name: prof.full_name,
      username: prof.username,
      password_reset: Boolean(payload.new_password?.trim()),
    });
    this.saveSandbox();
  }

  public async deleteStudent(actor: Profile, studentId: string): Promise<void> {
    this.assertAdmin(actor);
    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      const { data: stu } = await sb
        .from('students')
        .select('id, profile_id, admission_number')
        .eq('id', studentId)
        .maybeSingle();
      if (!stu) throw new Error('Student not found.');

      // Deleting student cascades to enrollments, assignments, reports, and period activities in PostgreSQL
      const { error: sErr } = await sb.from('students').delete().eq('id', studentId);
      if (sErr) throw new Error(sErr.message);

      if (stu.profile_id) {
        await sb.from('profiles').delete().eq('id', stu.profile_id);
      }

      await this.logSupabaseAudit(actor, 'STUDENT_DELETED', 'student', studentId, {
        admission_number: stu.admission_number,
      });
      return;
    }

    const db = this.getSandbox();
    const stu = db.students.find((s) => s.id === studentId);
    if (!stu) throw new Error('Student not found.');
    const prof = db.profiles.find((p) => p.id === stu.profile_id);

    // Collect all submission IDs for this student
    const subIds = new Set(
      db.report_submissions.filter((r) => r.student_id === studentId).map((r) => r.id)
    );

    // Cascade deletions in sandbox
    db.students = db.students.filter((s) => s.id !== studentId);
    if (stu.profile_id) {
      db.profiles = db.profiles.filter((p) => p.id !== stu.profile_id);
      db.notifications = db.notifications.filter(
        (n) => n.recipient_profile_id !== stu.profile_id
      );
    }
    db.student_academic_enrollments = db.student_academic_enrollments.filter(
      (e) => e.student_id !== studentId
    );
    db.mentor_assignments = db.mentor_assignments.filter((m) => m.student_id !== studentId);
    db.student_subject_selections = db.student_subject_selections.filter(
      (s) => s.student_id !== studentId
    );
    db.student_timetable_assignments = db.student_timetable_assignments.filter(
      (t) => t.student_id !== studentId
    );
    db.timetable_overrides = db.timetable_overrides.filter((o) => o.student_id !== studentId);
    db.academic_calendar_exceptions = db.academic_calendar_exceptions.filter(
      (c) => c.student_id !== studentId
    );
    db.period_activity_entries = db.period_activity_entries.filter(
      (p) => p.student_id !== studentId && !subIds.has(p.submission_id)
    );
    db.report_review_history = db.report_review_history.filter(
      (h) => !subIds.has(h.submission_id)
    );
    db.report_submissions = db.report_submissions.filter((r) => r.student_id !== studentId);

    this.appendSandboxAudit(actor, 'STUDENT_DELETED', 'student', studentId, {
      full_name: prof?.full_name || 'Unknown',
      admission_number: stu.admission_number,
    });
    this.saveSandbox();
  }

  public async enrollStudentInYear(
    actor: Profile,
    studentId: string,
    academicYearId: string,
    classBatch: string
  ): Promise<void> {
    this.assertAdmin(actor);
    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      const { error } = await sb.from('student_academic_enrollments').upsert(
        {
          student_id: studentId,
          academic_year_id: academicYearId,
          class_batch: classBatch,
          status: 'active',
          enrolled_at: getTodayIST(),
        },
        { onConflict: 'student_id,academic_year_id' }
      );
      if (error) throw new Error(error.message);
      return;
    }

    const db = this.getSandbox();
    const existing = db.student_academic_enrollments.find(
      (e) => e.student_id === studentId && e.academic_year_id === academicYearId
    );
    if (existing) {
      existing.class_batch = classBatch;
      existing.status = 'active';
    } else {
      db.student_academic_enrollments.push({
        id: uid('enr'),
        student_id: studentId,
        academic_year_id: academicYearId,
        class_batch: classBatch,
        status: 'active',
        enrolled_at: getTodayIST(),
        created_at: new Date().toISOString(),
      });
    }
  }

  public async createMentor(
    actor: Profile,
    payload: {
      full_name: string;
      employee_code: string;
      designation: string;
      department?: string;
      email: string;
      phone?: string;
      username: string;
      password: string;
      is_active?: boolean;
    }
  ): Promise<void> {
    this.assertAdmin(actor);
    if (!payload.full_name.trim() || !payload.employee_code.trim() || !payload.username.trim()) {
      throw new Error('Full Name, Employee Code, and Username are required.');
    }
    if (payload.password.length < 8) {
      throw new Error('Password must be at least 8 characters.');
    }

    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      const { data: prof, error: pErr } = await sb
        .from('profiles')
        .insert({
          role: 'mentor',
          full_name: payload.full_name.trim(),
          username: payload.username.trim(),
          email: payload.email.trim(),
          phone: payload.phone?.trim() || null,
          password_hash: payload.password, // hashed by the database trigger (migration 006)
          is_active: payload.is_active ?? true,
        })
        .select('id')
        .single();
      if (pErr) throw new Error(pErr.message);
      const { data: m, error: mErr } = await sb
        .from('mentors')
        .insert({
          profile_id: prof.id,
          employee_code: payload.employee_code.trim(),
          designation: payload.designation.trim(),
          department: payload.department?.trim() || null,
        })
        .select()
        .single();
      if (mErr) throw new Error(mErr.message);
      await this.logSupabaseAudit(actor, 'MENTOR_CREATED', 'mentor', m.id, {
        employee_code: payload.employee_code.trim(),
        username: payload.username.trim(),
      });
      return;
    }

    const db = this.getSandbox();
    if (
      db.mentors.some(
        (m) => m.employee_code.toLowerCase() === payload.employee_code.trim().toLowerCase()
      )
    ) {
      throw new Error(`Employee code "${payload.employee_code}" already exists.`);
    }
    if (
      db.profiles.some(
        (p) =>
          p.username.toLowerCase() === payload.username.trim().toLowerCase() ||
          p.email.toLowerCase() === payload.email.trim().toLowerCase()
      )
    ) {
      throw new Error('Username or email is already in use.');
    }

    const now = new Date().toISOString();
    const profId = uid('prof-mentor');
    const mentorId = uid('mentor');
    const pwdHash = await hashPassword(payload.password);
    db.profiles.push({
      id: profId,
      role: 'mentor',
      full_name: payload.full_name.trim(),
      username: payload.username.trim(),
      email: payload.email.trim(),
      phone: payload.phone?.trim(),
      password_hash_sandbox: pwdHash,
      is_active: payload.is_active ?? true,
      created_at: now,
      updated_at: now,
    });
    db.mentors.push({
      id: mentorId,
      profile_id: profId,
      employee_code: payload.employee_code.trim(),
      designation: payload.designation.trim() || 'Faculty Mentor',
      department: payload.department?.trim(),
      created_at: now,
      updated_at: now,
    });
    this.appendSandboxAudit(actor, 'MENTOR_CREATED', 'mentor', mentorId, {
      full_name: payload.full_name.trim(),
      employee_code: payload.employee_code.trim(),
    });
  }

  public async updateMentor(
    actor: Profile,
    mentorId: string,
    payload: {
      full_name: string;
      employee_code: string;
      designation: string;
      department?: string;
      email: string;
      phone?: string;
      username: string;
      new_password?: string;
      is_active: boolean;
    }
  ): Promise<void> {
    this.assertAdmin(actor);
    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      const { data: m } = await sb.from('mentors').select('*').eq('id', mentorId).single();
      if (!m) throw new Error('Mentor not found.');
      await sb
        .from('mentors')
        .update({
          employee_code: payload.employee_code.trim(),
          designation: payload.designation.trim(),
          department: payload.department?.trim() || null,
        })
        .eq('id', mentorId);
      await sb
        .from('profiles')
        .update({
          full_name: payload.full_name.trim(),
          email: payload.email.trim(),
          phone: payload.phone?.trim() || null,
          is_active: payload.is_active,
        })
        .eq('id', m.profile_id);
      const { error: credErr } = await sb.rpc('admin_update_credentials', {
        p_target_profile_id: m.profile_id,
        p_new_username: payload.username.trim(),
        p_new_password: payload.new_password?.trim() || null,
      });
      if (credErr) throw new Error(credErr.message);
      await this.logSupabaseAudit(actor, 'MENTOR_UPDATED', 'mentor', mentorId, {
        username: payload.username.trim(),
      });
      return;
    }

    const db = this.getSandbox();
    const m = db.mentors.find((x) => x.id === mentorId);
    if (!m) throw new Error('Mentor not found.');
    const prof = db.profiles.find((p) => p.id === m.profile_id);
    if (!prof) throw new Error('Profile not found.');

    if (
      db.profiles.some(
        (p) =>
          p.id !== prof.id &&
          (p.username.toLowerCase() === payload.username.trim().toLowerCase() ||
            p.email.toLowerCase() === payload.email.trim().toLowerCase())
      )
    ) {
      throw new Error('Username or email already belongs to another account.');
    }

    const now = new Date().toISOString();
    m.employee_code = payload.employee_code.trim();
    m.designation = payload.designation.trim();
    m.department = payload.department?.trim();
    m.updated_at = now;

    prof.full_name = payload.full_name.trim();
    prof.email = payload.email.trim();
    prof.phone = payload.phone?.trim();
    prof.username = payload.username.trim();
    prof.is_active = payload.is_active;
    if (payload.new_password && payload.new_password.trim().length >= 6) {
      prof.password_sandbox = payload.new_password.trim();
    }
    prof.updated_at = now;

    this.appendSandboxAudit(actor, 'MENTOR_UPDATED', 'mentor', mentorId, {
      full_name: prof.full_name,
      username: prof.username,
    });
    this.saveSandbox();
  }

  public async deleteMentor(actor: Profile, mentorId: string): Promise<void> {
    this.assertAdmin(actor);
    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      const { data: mentor } = await sb
        .from('mentors')
        .select('id, profile_id, employee_code')
        .eq('id', mentorId)
        .maybeSingle();
      if (!mentor) throw new Error('Mentor not found.');

      await sb.from('mentor_assignments').delete().eq('mentor_id', mentorId);
      const { error: mErr } = await sb.from('mentors').delete().eq('id', mentorId);
      if (mErr) throw new Error(mErr.message);

      if (mentor.profile_id) {
        await sb.from('profiles').delete().eq('id', mentor.profile_id);
      }
      await this.logSupabaseAudit(actor, 'MENTOR_DELETED', 'mentor', mentorId, {
        employee_code: mentor.employee_code,
      });
      return;
    }

    const db = this.getSandbox();
    const mentor = db.mentors.find((m) => m.id === mentorId);
    if (!mentor) throw new Error('Mentor not found.');
    const prof = db.profiles.find((p) => p.id === mentor.profile_id);

    db.mentors = db.mentors.filter((m) => m.id !== mentorId);
    if (mentor.profile_id) {
      db.profiles = db.profiles.filter((p) => p.id !== mentor.profile_id);
      db.notifications = db.notifications.filter(
        (n) => n.recipient_profile_id !== mentor.profile_id
      );
    }
    db.mentor_assignments = db.mentor_assignments.filter((ma) => ma.mentor_id !== mentorId);

    this.appendSandboxAudit(actor, 'MENTOR_DELETED', 'mentor', mentorId, {
      full_name: prof?.full_name || 'Unknown',
      employee_code: mentor.employee_code,
    });
    this.saveSandbox();
  }

  public async updateUserCredentials(
    actor: Profile,
    targetProfileId: string,
    newUsername: string,
    newPassword?: string,
    isActive?: boolean
  ): Promise<void> {
    this.assertAdmin(actor);
    if (!newUsername.trim()) throw new Error('Username is required.');
    if (newPassword && newPassword.trim().length > 0 && newPassword.trim().length < 8) {
      throw new Error('New password must be at least 8 characters.');
    }

    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      const { error } = await sb.rpc('admin_update_credentials', {
        p_target_profile_id: targetProfileId,
        p_new_username: newUsername.trim(),
        p_new_password: newPassword?.trim() || null,
      });
      if (error) throw new Error(error.message);
      if (typeof isActive === 'boolean') {
        await sb.from('profiles').update({ is_active: isActive }).eq('id', targetProfileId);
      }
      return;
    }

    const db = this.getSandbox();
    const target = db.profiles.find((p) => p.id === targetProfileId);
    if (!target) throw new Error('Account not found.');
    if (
      db.profiles.some(
        (p) => p.id !== targetProfileId && p.username.toLowerCase() === newUsername.trim().toLowerCase()
      )
    ) {
      throw new Error(`Username "${newUsername}" is already taken.`);
    }
    target.username = newUsername.trim();
    if (newPassword && newPassword.trim().length >= 6) {
      target.password_hash_sandbox = await hashPassword(newPassword.trim());
      target.password_sandbox = undefined;
      target.is_temporary_password = false;
    }
    if (typeof isActive === 'boolean') {
      target.is_active = isActive;
    }
    target.updated_at = new Date().toISOString();
    this.appendSandboxAudit(actor, 'CREDENTIALS_UPDATED', 'profile', targetProfileId, {
      username: target.username,
      password_updated: Boolean(newPassword?.trim()),
      is_active: target.is_active,
    });
    this.saveSandbox();
  }

  // ==================== MENTOR ASSIGNMENTS (YEAR-SCOPED, HISTORICAL PRESERVATION) ====================

  public async assignMentorToStudents(
    actor: Profile,
    payload: {
      academic_year_id: string;
      mentor_id: string;
      student_ids: string[];
      assigned_date: string;
    }
  ): Promise<void> {
    this.assertAdmin(actor);
    if (!payload.student_ids.length) throw new Error('Select at least one student.');

    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      for (const sid of payload.student_ids) {
        // Archive previous active assignment for this student in this year (never delete history!)
        await sb
          .from('mentor_assignments')
          .update({ is_active: false, ended_date: payload.assigned_date })
          .eq('student_id', sid)
          .eq('academic_year_id', payload.academic_year_id)
          .eq('is_active', true);

        const { error } = await sb.from('mentor_assignments').insert({
          student_id: sid,
          mentor_id: payload.mentor_id,
          academic_year_id: payload.academic_year_id,
          assigned_date: payload.assigned_date,
          is_active: true,
        });
        if (error) throw new Error(error.message);
      }
      await this.logSupabaseAudit(actor, 'MENTOR_ASSIGNMENT_CHANGED', 'mentor_assignment', payload.mentor_id, {
        student_count: payload.student_ids.length,
        academic_year_id: payload.academic_year_id,
      });
      return;
    }

    const db = this.getSandbox();
    const now = new Date().toISOString();
    for (const sid of payload.student_ids) {
      // Deactivate any current primary mentor for this year without deleting history
      db.mentor_assignments.forEach((ma) => {
        if (
          ma.student_id === sid &&
          ma.academic_year_id === payload.academic_year_id &&
          ma.is_active
        ) {
          ma.is_active = false;
          ma.ended_date = payload.assigned_date;
        }
      });

      db.mentor_assignments.push({
        id: uid('ma'),
        student_id: sid,
        mentor_id: payload.mentor_id,
        academic_year_id: payload.academic_year_id,
        assigned_date: payload.assigned_date,
        is_active: true,
        created_at: now,
      });

      // Ensure student has enrollment for this academic year
      const hasEnr = db.student_academic_enrollments.some(
        (e) => e.student_id === sid && e.academic_year_id === payload.academic_year_id
      );
      if (!hasEnr) {
        const stu = db.students.find((s) => s.id === sid);
        db.student_academic_enrollments.push({
          id: uid('enr'),
          student_id: sid,
          academic_year_id: payload.academic_year_id,
          class_batch: stu?.batch_name || 'General Batch',
          status: 'active',
          enrolled_at: payload.assigned_date,
          created_at: now,
        });
      }
    }

    this.appendSandboxAudit(actor, 'MENTOR_ASSIGNMENT_CHANGED', 'mentor_assignment', payload.mentor_id, {
      academic_year_id: payload.academic_year_id,
      student_count: payload.student_ids.length,
    });
  }

  // ==================== SEMESTERS & SUBJECTS & STUDENT SUBJECT SELECTIONS ====================

  public async createSemester(
    actor: Profile,
    payload: Omit<Semester, 'id' | 'created_at'>
  ): Promise<void> {
    this.assertAdmin(actor);
    if (payload.end_date <= payload.start_date) {
      throw new Error('Semester end date must be after start date.');
    }
    const stage: AcademicStage = payload.academic_stage || inferSemesterStage({ name: payload.name });
    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      const { data, error } = await sb
        .from('semesters')
        .insert({ ...payload, academic_stage: stage })
        .select('id')
        .maybeSingle();
      if (error) {
        // Zero-downtime fallback if live Supabase table doesn't have academic_stage column yet
        const missingCol =
          error.code === '42703' ||
          error.code === 'PGRST204' ||
          error.message.toLowerCase().includes('academic_stage');
        if (missingCol) {
          const { academic_stage: _ignored, ...legacyPayload } = payload;
          const { data: legacyData, error: legacyErr } = await sb
            .from('semesters')
            .insert(legacyPayload)
            .select('id')
            .maybeSingle();
          if (legacyErr) throw new Error(legacyErr.message);
          if (legacyData?.id) writeLocalSemesterStage(legacyData.id, stage);
          return;
        }
        throw new Error(error.message);
      }
      if (data?.id) writeLocalSemesterStage(data.id, stage);
      return;
    }
    const db = this.getSandbox();
    const id = uid('sem');
    db.semesters.push({
      ...payload,
      academic_stage: stage,
      id,
      created_at: new Date().toISOString(),
    });
    this.appendSandboxAudit(actor, 'SEMESTER_CREATED', 'semester', payload.name, {
      ...payload,
      academic_stage: stage,
    });
    this.saveSandbox();
  }

  public async updateSemesterStatus(actor: Profile, semesterId: string, status: Semester['status']): Promise<void> {
    this.assertAdmin(actor);
    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      const { error } = await sb.from('semesters').update({ status }).eq('id', semesterId);
      if (error) throw new Error(error.message);
      return;
    }
    const db = this.getSandbox();
    const sem = db.semesters.find((s) => s.id === semesterId);
    if (sem) {
      sem.status = status;
      this.saveSandbox();
    }
  }

  public async updateSemesterStage(
    actor: Profile,
    semesterId: string,
    academic_stage: AcademicStage
  ): Promise<void> {
    this.assertAdmin(actor);
    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      writeLocalSemesterStage(semesterId, academic_stage);
      const { error } = await sb
        .from('semesters')
        .update({ academic_stage })
        .eq('id', semesterId);
      if (error) {
        const missingCol =
          error.code === '42703' ||
          error.code === 'PGRST204' ||
          error.message.toLowerCase().includes('academic_stage');
        if (!missingCol) throw new Error(error.message);
      }
      // Also mirror stage marker on linked timetable templates so all browsers see the stage even before SQL migration
      const { data: linkedTpls } = await sb
        .from('timetable_templates')
        .select('id,description')
        .eq('semester_id', semesterId);
      if (linkedTpls && linkedTpls.length > 0) {
        for (const tpl of linkedTpls) {
          await sb
            .from('timetable_templates')
            .update({
              description: encodeTemplateStageInDescription(tpl.description, academic_stage),
            })
            .eq('id', tpl.id);
        }
      }
      return;
    }
    const db = this.getSandbox();
    const sem = db.semesters.find((s) => s.id === semesterId);
    if (sem) {
      sem.academic_stage = academic_stage;
      this.appendSandboxAudit(actor, 'SEMESTER_STAGE_UPDATED', 'semester', sem.name, {
        academic_stage,
      });
      this.saveSandbox();
    }
  }

  public async updateTemplateStage(
    actor: Profile,
    templateId: string,
    academic_stage: AcademicStage
  ): Promise<void> {
    this.assertAdmin(actor);
    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      const { data: tpl } = await sb
        .from('timetable_templates')
        .select('id,semester_id,description')
        .eq('id', templateId)
        .maybeSingle();
      if (tpl?.semester_id) {
        await this.updateSemesterStage(actor, tpl.semester_id, academic_stage);
      }
      if (tpl) {
        const { error } = await sb
          .from('timetable_templates')
          .update({
            description: encodeTemplateStageInDescription(tpl.description, academic_stage),
          })
          .eq('id', templateId);
        if (error) throw new Error(error.message);
      }
      return;
    }
    const db = this.getSandbox();
    const tpl = db.timetable_templates.find((t) => t.id === templateId);
    if (tpl) {
      tpl.academic_stage = academic_stage;
      if (tpl.semester_id) {
        const sem = db.semesters.find((s) => s.id === tpl.semester_id);
        if (sem) sem.academic_stage = academic_stage;
      }
      this.saveSandbox();
    }
  }

  public async deleteSemester(actor: Profile, semesterId: string): Promise<void> {
    this.assertAdmin(actor);
    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      await sb.from('semester_subjects').delete().eq('semester_id', semesterId);
      await sb.from('student_subject_selections').delete().eq('semester_id', semesterId);
      const { error } = await sb.from('semesters').delete().eq('id', semesterId);
      if (error) throw new Error(error.message);
      await this.logSupabaseAudit(actor, 'SEMESTER_DELETED', 'semester', semesterId, {});
      return;
    }

    const db = this.getSandbox();
    const sem = db.semesters.find((s) => s.id === semesterId);
    if (!sem) throw new Error('Semester not found.');
    db.semesters = db.semesters.filter((s) => s.id !== semesterId);
    db.semester_subjects = db.semester_subjects.filter((ss) => ss.semester_id !== semesterId);
    db.student_subject_selections = db.student_subject_selections.filter(
      (sss) => sss.semester_id !== semesterId
    );
    this.appendSandboxAudit(actor, 'SEMESTER_DELETED', 'semester', sem.name, {});
    this.saveSandbox();
  }

  public async createSubject(
    actor: Profile,
    payload: Omit<Subject, 'id' | 'created_at'>
  ): Promise<void> {
    this.assertAdmin(actor);
    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      const { error } = await sb.from('subjects').insert(payload);
      if (error) throw new Error(error.message);
      return;
    }
    const db = this.getSandbox();
    if (
      db.subjects.some(
        (s) =>
          s.code.toLowerCase() === payload.code.trim().toLowerCase() &&
          s.name.toLowerCase() === payload.name.trim().toLowerCase()
      )
    ) {
      throw new Error(`Subject with code "${payload.code}" and name "${payload.name}" already exists.`);
    }
    db.subjects.push({
      ...payload,
      id: uid('sub'),
      code: payload.code.trim().toUpperCase(),
      name: payload.name.trim(),
      created_at: new Date().toISOString(),
    });
    this.appendSandboxAudit(actor, 'SUBJECT_CREATED', 'subject', payload.code, payload);
    this.saveSandbox();
  }

  public async deleteSubject(actor: Profile, subjectId: string): Promise<void> {
    this.assertAdmin(actor);
    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      await sb.from('semester_subjects').delete().eq('subject_id', subjectId);
      await sb.from('student_subject_selections').delete().eq('subject_id', subjectId);
      const { error } = await sb.from('subjects').delete().eq('id', subjectId);
      if (error) throw new Error(error.message);
      await this.logSupabaseAudit(actor, 'SUBJECT_DELETED', 'subject', subjectId, {});
      return;
    }

    const db = this.getSandbox();
    const sub = db.subjects.find((s) => s.id === subjectId);
    if (!sub) throw new Error('Subject not found.');
    db.subjects = db.subjects.filter((s) => s.id !== subjectId);
    db.semester_subjects = db.semester_subjects.filter((ss) => ss.subject_id !== subjectId);
    db.student_subject_selections = db.student_subject_selections.filter(
      (sss) => sss.subject_id !== subjectId
    );
    this.appendSandboxAudit(actor, 'SUBJECT_DELETED', 'subject', sub.code, { name: sub.name });
    this.saveSandbox();
  }

  public async toggleSemesterSubject(
    actor: Profile,
    semesterId: string,
    subjectId: string,
    include: boolean
  ): Promise<void> {
    this.assertAdmin(actor);
    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      if (include) {
        await sb
          .from('semester_subjects')
          .upsert({ semester_id: semesterId, subject_id: subjectId }, { onConflict: 'semester_id,subject_id' });
      } else {
        await sb
          .from('semester_subjects')
          .delete()
          .eq('semester_id', semesterId)
          .eq('subject_id', subjectId);
      }
      return;
    }
    const db = this.getSandbox();
    if (include) {
      if (!db.semester_subjects.some((ss) => ss.semester_id === semesterId && ss.subject_id === subjectId)) {
        db.semester_subjects.push({ id: uid('ss'), semester_id: semesterId, subject_id: subjectId });
      }
    } else {
      db.semester_subjects = db.semester_subjects.filter(
        (ss) => !(ss.semester_id === semesterId && ss.subject_id === subjectId)
      );
    }
  }

  public async setStudentSubjectSelection(
    actor: Profile,
    payload: {
      student_id: string;
      academic_year_id: string;
      semester_id: string;
      subject_id: string;
      selection_status: SubjectSelectionStatus;
    }
  ): Promise<void> {
    this.assertAdmin(actor);
    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      const { error } = await sb
        .from('student_subject_selections')
        .upsert(payload, { onConflict: 'student_id,semester_id,subject_id' });
      if (error) throw new Error(error.message);
      return;
    }
    const db = this.getSandbox();
    const existing = db.student_subject_selections.find(
      (s) =>
        s.student_id === payload.student_id &&
        s.semester_id === payload.semester_id &&
        s.subject_id === payload.subject_id
    );
    const now = new Date().toISOString();
    if (existing) {
      existing.selection_status = payload.selection_status;
      existing.updated_at = now;
    } else {
      const rec: StudentSubjectSelection = {
        id: uid('sel'),
        ...payload,
        updated_at: now,
      };
      db.student_subject_selections.push(rec);
    }
  }

  // ==================== TIMETABLE & CALENDAR ====================

  public async createTimetableTemplate(
    actor: Profile,
    payload: {
      academic_year_id: string;
      semester_id?: string;
      academic_stage?: AcademicStage;
      name: string;
      description?: string;
    }
  ): Promise<string> {
    this.assertAdmin(actor);
    const now = new Date().toISOString();
    const descWithStage = payload.academic_stage
      ? encodeTemplateStageInDescription(payload.description?.trim(), payload.academic_stage)
      : payload.description?.trim() || null;

    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      const { data, error } = await sb
        .from('timetable_templates')
        .insert({
          academic_year_id: payload.academic_year_id,
          semester_id: payload.semester_id || null,
          name: payload.name.trim(),
          description: descWithStage,
          is_published: false,
          revision: 1,
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      if (payload.semester_id && payload.academic_stage) {
        await this.updateSemesterStage(actor, payload.semester_id, payload.academic_stage);
      }
      return data.id;
    }
    const db = this.getSandbox();
    const id = uid('tt');
    db.timetable_templates.push({
      id,
      academic_year_id: payload.academic_year_id,
      semester_id: payload.semester_id,
      academic_stage: payload.academic_stage,
      name: payload.name.trim(),
      description: payload.description?.trim(),
      is_published: false,
      revision: 1,
      created_at: now,
      updated_at: now,
    });
    if (payload.semester_id && payload.academic_stage) {
      const sem = db.semesters.find((s) => s.id === payload.semester_id);
      if (sem) sem.academic_stage = payload.academic_stage;
    }
    const ys = db.academic_year_settings.find((s) => s.academic_year_id === payload.academic_year_id);
    const workingDays = ys?.working_days || [1, 2, 3, 4, 5, 6];
    const pCount = ys?.period_count || 8;
    const timings = ys?.default_period_timings?.length ? ys.default_period_timings : getDefaultPeriodTimings(pCount);
    for (const day of workingDays) {
      for (let p = 1; p <= pCount; p++) {
        const t = timings[p - 1] || { start_time: '09:00', end_time: '09:45' };
        db.timetable_slots.push({
          id: uid('slot'),
          template_id: id,
          day_of_week: day,
          period_number: p,
          start_time: t.start_time,
          end_time: t.end_time,
          planned_activity: '',
          is_off_course: false,
          off_course_student_ids: [],
        });
      }
    }
    this.appendSandboxAudit(actor, 'TIMETABLE_CREATED', 'timetable_template', id, { name: payload.name });
    this.saveSandbox();
    return id;
  }

  public async saveTimetableSlots(
    actor: Profile,
    templateId: string,
    slots: Omit<TimetableSlot, 'id'>[],
    publish: boolean
  ): Promise<void> {
    this.assertAdmin(actor);
    const now = new Date().toISOString();

    const normalizedSlots = slots.map((s) => {
      const studentIds = Array.isArray(s.off_course_student_ids)
        ? Array.from(new Set(s.off_course_student_ids))
        : [];
      const isOffCourse = Boolean(s.is_off_course || studentIds.length > 0);
      return {
        ...s,
        planned_activity: stripSlotFallbackMarker(s.planned_activity),
        is_off_course: isOffCourse,
        off_course_student_ids: studentIds,
      };
    });

    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      let useFallbackColumnEncoding = false;

      for (const s of normalizedSlots) {
        if (!useFallbackColumnEncoding) {
          const { error } = await sb.from('timetable_slots').upsert(s, {
            onConflict: 'template_id,day_of_week,period_number',
          });
          if (error) {
            const missingCol =
              error.code === '42703' ||
              error.code === 'PGRST204' ||
              error.message.toLowerCase().includes('is_off_course') ||
              error.message.toLowerCase().includes('off_course_student_ids');
            if (missingCol) {
              useFallbackColumnEncoding = true;
            } else {
              throw new Error(error.message);
            }
          }
        }

        if (useFallbackColumnEncoding) {
          const { is_off_course, off_course_student_ids, ...legacySlot } = s;
          const { error: fbErr } = await sb.from('timetable_slots').upsert(
            {
              ...legacySlot,
              planned_activity: encodeSlotFallbackActivity(
                s.planned_activity || (is_off_course ? 'Off-Course' : 'Regular Class'),
                Boolean(is_off_course),
                off_course_student_ids || []
              ),
            },
            { onConflict: 'template_id,day_of_week,period_number' }
          );
          if (fbErr) throw new Error(fbErr.message);
        }
      }

      if (publish) {
        const { data: tpl } = await sb
          .from('timetable_templates')
          .select('revision,name')
          .eq('id', templateId)
          .single();
        await sb
          .from('timetable_templates')
          .update({
            is_published: true,
            revision: (tpl?.revision || 1) + 1,
            published_at: now,
          })
          .eq('id', templateId);
        await this.logSupabaseAudit(actor, 'TIMETABLE_PUBLISHED', 'timetable_template', templateId, {
          name: tpl?.name,
        });
      }
      return;
    }

    const db = this.getSandbox();
    const tpl = db.timetable_templates.find((t) => t.id === templateId);
    if (!tpl) throw new Error('Timetable template not found.');

    // Replace slots for this template; past period_activity_entries retain planned_activity_snapshot!
    db.timetable_slots = db.timetable_slots.filter((s) => s.template_id !== templateId);
    for (const s of normalizedSlots) {
      db.timetable_slots.push({ ...s, id: uid('slot') });
    }
    tpl.updated_at = now;
    if (publish) {
      tpl.is_published = true;
      tpl.revision += 1;
      tpl.published_at = now;
    }
    this.appendSandboxAudit(
      actor,
      publish ? 'TIMETABLE_PUBLISHED' : 'TIMETABLE_MODIFIED',
      'timetable_template',
      templateId,
      { name: tpl.name, revision: tpl.revision }
    );
    this.saveSandbox();
  }

  public async deleteTimetableTemplate(actor: Profile, templateId: string): Promise<void> {
    this.assertAdmin(actor);
    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      await sb.from('timetable_slots').delete().eq('template_id', templateId);
      await sb.from('student_timetable_assignments').delete().eq('template_id', templateId);
      const { error } = await sb.from('timetable_templates').delete().eq('id', templateId);
      if (error) throw new Error(error.message);
      await this.logSupabaseAudit(actor, 'TIMETABLE_DELETED', 'timetable_template', templateId, {});
      return;
    }

    const db = this.getSandbox();
    const tpl = db.timetable_templates.find((t) => t.id === templateId);
    if (!tpl) throw new Error('Timetable template not found.');
    db.timetable_templates = db.timetable_templates.filter((t) => t.id !== templateId);
    db.timetable_slots = db.timetable_slots.filter((s) => s.template_id !== templateId);
    db.student_timetable_assignments = db.student_timetable_assignments.filter((a) => a.template_id !== templateId);
    this.appendSandboxAudit(actor, 'TIMETABLE_DELETED', 'timetable_template', tpl.name, {});
    this.saveSandbox();
  }

  public async assignTimetableToStudents(
    actor: Profile,
    payload: {
      academic_year_id: string;
      template_id: string;
      student_ids: string[];
      effective_start_date: string;
      effective_end_date?: string;
    }
  ): Promise<void> {
    this.assertAdmin(actor);
    if (!payload.student_ids.length) throw new Error('Select at least one student.');

    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      for (const sid of payload.student_ids) {
        await sb
          .from('student_timetable_assignments')
          .update({ is_active: false })
          .eq('student_id', sid)
          .eq('academic_year_id', payload.academic_year_id)
          .eq('is_active', true);

        const { error } = await sb.from('student_timetable_assignments').insert({
          student_id: sid,
          academic_year_id: payload.academic_year_id,
          template_id: payload.template_id,
          effective_start_date: payload.effective_start_date,
          effective_end_date: payload.effective_end_date || null,
          is_active: true,
        });
        if (error) throw new Error(error.message);
      }
      return;
    }

    const db = this.getSandbox();
    const now = new Date().toISOString();
    for (const sid of payload.student_ids) {
      db.student_timetable_assignments.forEach((a) => {
        if (a.student_id === sid && a.academic_year_id === payload.academic_year_id && a.is_active) {
          a.is_active = false;
        }
      });
      db.student_timetable_assignments.push({
        id: uid('tta'),
        student_id: sid,
        academic_year_id: payload.academic_year_id,
        template_id: payload.template_id,
        effective_start_date: payload.effective_start_date,
        effective_end_date: payload.effective_end_date,
        is_active: true,
        created_at: now,
      });
    }
    this.appendSandboxAudit(actor, 'TIMETABLE_ASSIGNED', 'timetable_template', payload.template_id, {
      student_count: payload.student_ids.length,
    });
  }

  public async createCalendarException(
    actor: Profile,
    payload: Omit<AcademicCalendarException, 'id' | 'created_at' | 'created_by'>
  ): Promise<void> {
    this.assertAdmin(actor);
    if (!payload.title.trim() || !payload.exception_date) {
      throw new Error('Date and Title are required.');
    }
    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      const { error } = await sb.from('academic_calendar_exceptions').insert({
        ...payload,
        created_by: actor.id,
      });
      if (error) throw new Error(error.message);
      await this.logSupabaseAudit(actor, 'CALENDAR_EXCEPTION_ADDED', 'academic_calendar_exception', payload.exception_date, payload);
      return;
    }

    const db = this.getSandbox();
    db.academic_calendar_exceptions.unshift({
      ...payload,
      id: uid('cal'),
      created_by: actor.id,
      created_at: new Date().toISOString(),
    });
    this.appendSandboxAudit(actor, 'CALENDAR_EXCEPTION_ADDED', 'academic_calendar_exception', payload.exception_date, payload);
  }

  public async deleteCalendarException(actor: Profile, exceptionId: string): Promise<void> {
    this.assertAdmin(actor);
    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      const { error } = await sb.from('academic_calendar_exceptions').delete().eq('id', exceptionId);
      if (error) throw new Error(error.message);
      return;
    }
    const db = this.getSandbox();
    db.academic_calendar_exceptions = db.academic_calendar_exceptions.filter((c) => c.id !== exceptionId);
    this.appendSandboxAudit(actor, 'CALENDAR_EXCEPTION_REMOVED', 'academic_calendar_exception', exceptionId, {});
  }

  // ==================== STUDENT REPORTING (ALL 4 COMBINATIONS + SEQUENTIAL LOCKING) ====================

  public async saveAndOptionallySubmitPeriods(
    actor: Profile,
    payload: {
      student_id: string;
      academic_year_id: string;
      anchor_date: string;
      entries: {
        activity_date: string;
        period_number: number;
        planned_activity_snapshot: string;
        actual_activity: string;
        activity_status: PeriodActivityStatus;
        optional_notes?: string;
      }[];
      submit: boolean;
    }
  ): Promise<void> {
    const dbSnapshot = await this.fetchSnapshot();
    const year = dbSnapshot.academic_years.find((y) => y.id === payload.academic_year_id);
    if (!year) throw new Error('Academic year not found.');
    if (year.status === 'closed') {
      throw new Error(`Academic year ${year.name} is closed. New submissions and edits are disabled.`);
    }

    const ys = dbSnapshot.academic_year_settings.find((s) => s.academic_year_id === payload.academic_year_id);
    const approvalMode = ys?.approval_mode || 'daily';
    const entryMode = ys?.entry_mode || 'daily';

    // Check if an existing submission already covers anchor_date (preserve historical mode snapshot!)
    const existingCovering = dbSnapshot.report_submissions.find(
      (s) =>
        s.student_id === payload.student_id &&
        s.academic_year_id === payload.academic_year_id &&
        s.start_date <= payload.anchor_date &&
        s.end_date >= payload.anchor_date
    );

    const effectiveApprovalMode = existingCovering?.approval_mode_snapshot || approvalMode;
    const effectiveEntryMode = existingCovering?.entry_mode_snapshot || entryMode;

    const unitSpec = buildUnitSpecForDate(
      payload.anchor_date,
      effectiveApprovalMode,
      ys,
      dbSnapshot.academic_calendar_exceptions
    );

    const ttContext = resolveStudentTimetableContext(
      dbSnapshot,
      payload.student_id,
      payload.academic_year_id
    );

    const hasReportablePeriodsOnDate = (dateStr: string): boolean => {
      const daySlots = getEffectiveDaySlots(
        dateStr,
        payload.student_id,
        ttContext.templateSlots,
        dbSnapshot.timetable_overrides,
        dbSnapshot.academic_calendar_exceptions,
        ys,
        {
          stage: ttContext.stage,
          onlyOffCourse: true,
          studentSubjectLabel: ttContext.studentSubjectLabel,
        }
      );
      return daySlots.some((s) => !s.is_cancelled);
    };

    // Backend Sequential Locking Enforcement (skips days with 0 Off-Course periods)
    const lock = checkSequentialLock({
      targetUnit: unitSpec,
      studentId: payload.student_id,
      academicYear: year,
      settings: ys,
      exceptions: dbSnapshot.academic_calendar_exceptions,
      existingSubmissions: dbSnapshot.report_submissions,
      hasReportablePeriodsOnDate,
    });
    if (lock.isLocked) {
      throw new Error(lock.reason || 'Sequential reporting lock active.');
    }

    // Validate mandatory fields when submitting
    if (payload.submit) {
      for (const e of payload.entries) {
        if (e.activity_status === 'cancelled') continue;
        if (!e.actual_activity.trim()) {
          throw new Error(
            e.activity_status === 'completed'
              ? `Please enter the actual activity description for ${e.activity_date} — Period ${e.period_number}.`
              : `A reason is required for ${e.activity_date} — Period ${e.period_number} (${e.activity_status.replace('_', ' ')}).`
          );
        }
      }
    }

    const activeMentorAssignment = dbSnapshot.mentor_assignments.find(
      (ma) =>
        ma.student_id === payload.student_id &&
        ma.academic_year_id === payload.academic_year_id &&
        ma.is_active
    );
    const activeSemester =
      dbSnapshot.semesters.find(
        (s) =>
          s.academic_year_id === payload.academic_year_id &&
          s.start_date <= payload.anchor_date &&
          s.end_date >= payload.anchor_date
      ) || dbSnapshot.semesters.find((s) => s.academic_year_id === payload.academic_year_id && s.status === 'active');

    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      let subId = existingCovering?.id;
      if (!subId) {
        const { data: createdSub, error: subErr } = await sb
          .from('report_submissions')
          .insert({
            student_id: payload.student_id,
            academic_year_id: payload.academic_year_id,
            semester_id: activeSemester?.id || null,
            mentor_id: activeMentorAssignment?.mentor_id || null,
            unit_key: unitSpec.unit_key,
            start_date: unitSpec.start_date,
            end_date: unitSpec.end_date,
            entry_mode_snapshot: effectiveEntryMode,
            approval_mode_snapshot: effectiveApprovalMode,
            status: 'draft',
          })
          .select()
          .single();
        if (subErr) throw new Error(subErr.message);
        subId = createdSub.id;
      }

      for (const entry of payload.entries) {
        // Prevent students from cancelling their own periods or editing approved periods
        const existingEntry = dbSnapshot.period_activity_entries.find(
          (pe) =>
            pe.student_id === payload.student_id &&
            pe.academic_year_id === payload.academic_year_id &&
            pe.activity_date === entry.activity_date &&
            pe.period_number === entry.period_number
        );
        if (existingEntry?.approval_status === 'approved') continue;

        const safeStatus: PeriodActivityStatus =
          existingEntry?.activity_status === 'cancelled'
            ? 'cancelled'
            : entry.activity_status === 'cancelled'
              ? 'completed'
              : entry.activity_status;

        const { error: peErr } = await sb.from('period_activity_entries').upsert(
          {
            submission_id: subId,
            student_id: payload.student_id,
            academic_year_id: payload.academic_year_id,
            activity_date: entry.activity_date,
            period_number: entry.period_number,
            planned_activity_snapshot: existingEntry?.planned_activity_snapshot || entry.planned_activity_snapshot,
            actual_activity: entry.actual_activity.trim(),
            activity_status: safeStatus,
            optional_notes: entry.optional_notes?.trim() || '',
            approval_status: existingEntry?.approval_status || 'pending',
          },
          { onConflict: 'student_id,academic_year_id,activity_date,period_number' }
        );
        if (peErr) throw new Error(peErr.message);
      }

      if (payload.submit) {
        const { error: rpcErr } = await sb.rpc('submit_report_unit', { p_submission_id: subId });
        if (rpcErr) throw new Error(rpcErr.message);
      }
      return;
    }

    // Isolated Sandbox implementation (mirrors PostgreSQL RPC logic identically)
    const db = this.getSandbox();
    const now = new Date().toISOString();

    let sub = db.report_submissions.find((s) => s.id === existingCovering?.id);
    const isResubmission = sub?.status === 'returned';

    if (!sub) {
      sub = {
        id: uid('sub'),
        student_id: payload.student_id,
        academic_year_id: payload.academic_year_id,
        semester_id: activeSemester?.id,
        mentor_id: activeMentorAssignment?.mentor_id,
        unit_key: unitSpec.unit_key,
        start_date: unitSpec.start_date,
        end_date: unitSpec.end_date,
        entry_mode_snapshot: effectiveEntryMode,
        approval_mode_snapshot: effectiveApprovalMode,
        status: 'draft',
        created_at: now,
        updated_at: now,
      };
      db.report_submissions.unshift(sub);
    }

    // Resolve stage-aware timetable slots for this student
    const tplSlots = ttContext.templateSlots;

    for (const entry of payload.entries) {
      const existing = db.period_activity_entries.find(
        (pe) =>
          pe.student_id === payload.student_id &&
          pe.academic_year_id === payload.academic_year_id &&
          pe.activity_date === entry.activity_date &&
          pe.period_number === entry.period_number
      );

      // Students must never edit approved periods
      if (existing?.approval_status === 'approved') continue;

      // Verify whether period is admin-cancelled on that date
      const daySlots = getEffectiveDaySlots(
        entry.activity_date,
        payload.student_id,
        tplSlots,
        db.timetable_overrides,
        db.academic_calendar_exceptions,
        ys,
        {
          stage: ttContext.stage,
          onlyOffCourse: true,
          studentSubjectLabel: ttContext.studentSubjectLabel,
        }
      );
      const isCancelledByAdmin = daySlots.find((s) => s.period_number === entry.period_number)?.is_cancelled;
      const safeStatus: PeriodActivityStatus = isCancelledByAdmin
        ? 'cancelled'
        : entry.activity_status === 'cancelled'
          ? 'completed'
          : entry.activity_status;

      if (existing) {
        const wasReturned = existing.approval_status === 'returned';
        existing.actual_activity = entry.actual_activity.trim();
        existing.activity_status = safeStatus;
        existing.optional_notes = entry.optional_notes?.trim() || '';
        existing.updated_at = now;
        if (payload.submit && wasReturned) {
          existing.approval_status = 'pending';
          db.report_review_history.unshift({
            id: uid('rh'),
            submission_id: sub.id,
            period_entry_id: existing.id,
            actor_profile_id: actor.id,
            actor_name: actor.full_name,
            action: 'resubmitted',
            comment: 'Student revised and resubmitted returned period.',
            activity_snapshot: existing.actual_activity,
            created_at: now,
          });
        }
      } else {
        const newEntry = {
          id: uid('pe'),
          submission_id: sub.id,
          student_id: payload.student_id,
          academic_year_id: payload.academic_year_id,
          activity_date: entry.activity_date,
          period_number: entry.period_number,
          planned_activity_snapshot: entry.planned_activity_snapshot,
          actual_activity: entry.actual_activity.trim(),
          activity_status: safeStatus,
          optional_notes: entry.optional_notes?.trim() || '',
          approval_status: 'pending' as PeriodApprovalStatus,
          created_at: now,
          updated_at: now,
        };
        db.period_activity_entries.push(newEntry);
      }
    }

    if (payload.submit) {
      // If Weekly Approval mode, verify every working day's required Off-Course periods in this week are filled!
      if (effectiveApprovalMode === 'weekly') {
        const subEntries = db.period_activity_entries.filter((pe) => pe.submission_id === sub!.id);
        for (const wd of unitSpec.working_dates) {
          const slots = getEffectiveDaySlots(
            wd,
            payload.student_id,
            tplSlots,
            db.timetable_overrides,
            db.academic_calendar_exceptions,
            ys,
            {
              stage: ttContext.stage,
              onlyOffCourse: true,
              studentSubjectLabel: ttContext.studentSubjectLabel,
            }
          ).filter((s) => !s.is_cancelled);
          for (const sl of slots) {
            const match = subEntries.find(
              (pe) => pe.activity_date === wd && pe.period_number === sl.period_number
            );
            if (!match || !match.actual_activity.trim()) {
              throw new Error(
                `Weekly submission incomplete: Missing activity for ${wd} — Period ${sl.period_number} (${sl.planned_activity}). Save as Draft until all scheduled Off-Course periods in the week are recorded.`
              );
            }
          }
        }
      }

      // Reset any remaining returned periods in this unit to pending
      db.period_activity_entries.forEach((pe) => {
        if (pe.submission_id === sub!.id && pe.approval_status === 'returned') {
          pe.approval_status = 'pending';
        }
      });

      const subEntries = db.period_activity_entries.filter(
        (pe) => pe.submission_id === sub!.id && pe.activity_status !== 'cancelled'
      );
      const allApproved = subEntries.length > 0 && subEntries.every((pe) => pe.approval_status === 'approved');
      const someApproved = subEntries.some((pe) => pe.approval_status === 'approved');

      sub.status = allApproved ? 'approved' : someApproved ? 'partially_reviewed' : 'pending_review';
      sub.submitted_at = now;
      sub.updated_at = now;

      // Notify assigned mentor
      if (activeMentorAssignment) {
        const mentor = db.mentors.find((m) => m.id === activeMentorAssignment.mentor_id);
        if (mentor) {
          db.notifications.unshift({
            id: uid('notif'),
            recipient_profile_id: mentor.profile_id,
            academic_year_id: payload.academic_year_id,
            title: isResubmission ? 'Correction Resubmitted' : 'New Activity Report Submitted',
            message: `${actor.full_name} ${isResubmission ? 'resubmitted revised periods' : 'submitted an activity report'} for ${effectiveApprovalMode === 'weekly' ? `Week of ${unitSpec.start_date}` : unitSpec.start_date
              }.`,
            category: 'report_submitted',
            link_target: 'pending-approvals',
            reference_id: sub.id,
            is_read: false,
            created_at: now,
          });
        }
      }

      this.appendSandboxAudit(
        actor,
        isResubmission ? 'PERIOD_RESUBMITTED' : 'REPORT_SUBMITTED',
        'report_submission',
        sub.id,
        { unit_key: sub.unit_key, approval_mode: effectiveApprovalMode }
      );
    } else {
      sub.updated_at = now;
      if (sub.status === 'not_started') sub.status = 'draft';
    }
  }

  // ==================== MENTOR VERIFICATION ====================

  public async reviewPeriodEntry(
    actor: Profile,
    periodEntryId: string,
    decision: 'approved' | 'returned',
    comment?: string
  ): Promise<void> {
    if (actor.role === 'student') {
      throw new Error('Forbidden: Students are never allowed to approve or return reports.');
    }
    if (decision === 'returned' && (!comment || !comment.trim())) {
      throw new Error('A correction comment is mandatory when returning a period.');
    }

    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      const { error } = await sb.rpc('review_period_entry', {
        p_period_entry_id: periodEntryId,
        p_decision: decision,
        p_comment: comment?.trim() || null,
      });
      if (error) throw new Error(error.message);
      return;
    }

    const db = this.getSandbox();
    const entry = db.period_activity_entries.find((pe) => pe.id === periodEntryId);
    if (!entry) throw new Error('Period entry not found.');

    const year = db.academic_years.find((y) => y.id === entry.academic_year_id);
    if (year?.status === 'closed' && actor.role !== 'admin') {
      throw new Error('Closed academic years cannot be modified.');
    }

    // Enforce mentor assignment isolation
    if (actor.role === 'mentor') {
      const mentor = db.mentors.find((m) => m.profile_id === actor.id);
      const isAssigned = db.mentor_assignments.some(
        (ma) =>
          ma.mentor_id === mentor?.id &&
          ma.student_id === entry.student_id &&
          ma.academic_year_id === entry.academic_year_id &&
          ma.is_active
      );
      if (!isAssigned) {
        throw new Error('Forbidden: You are not the assigned mentor for this student in this academic year.');
      }
    }

    const now = new Date().toISOString();
    // Mentor strictly modifies review fields — NEVER modifies student's actual_activity
    entry.approval_status = decision;
    if (comment !== undefined) entry.mentor_comment = comment.trim();
    entry.reviewed_by = actor.id;
    entry.reviewed_at = now;
    entry.updated_at = now;

    db.report_review_history.unshift({
      id: uid('rh'),
      submission_id: entry.submission_id,
      period_entry_id: entry.id,
      actor_profile_id: actor.id,
      actor_name: actor.full_name,
      action: decision,
      comment: comment?.trim() || (decision === 'approved' ? 'Approved' : ''),
      activity_snapshot: entry.actual_activity,
      created_at: now,
    });

    // Recalculate parent submission status
    const sub = db.report_submissions.find((s) => s.id === entry.submission_id);
    if (sub) {
      const requiredEntries = db.period_activity_entries.filter(
        (pe) => pe.submission_id === sub.id && pe.activity_status !== 'cancelled'
      );
      const approvedCount = requiredEntries.filter((pe) => pe.approval_status === 'approved').length;
      const returnedCount = requiredEntries.filter((pe) => pe.approval_status === 'returned').length;

      let newStatus: ReportSubmissionStatus = 'pending_review';
      if (returnedCount > 0) {
        newStatus = 'returned';
      } else if (requiredEntries.length > 0 && approvedCount === requiredEntries.length) {
        newStatus = 'approved';
      } else if (approvedCount > 0) {
        newStatus = 'partially_reviewed';
      }
      sub.status = newStatus;
      sub.approved_at = newStatus === 'approved' ? now : undefined;
      sub.updated_at = now;

      // Notify student
      const student = db.students.find((s) => s.id === sub.student_id);
      if (student) {
        if (decision === 'returned') {
          db.notifications.unshift({
            id: uid('notif'),
            recipient_profile_id: student.profile_id,
            academic_year_id: sub.academic_year_id,
            title: `Period ${entry.period_number} Returned for Correction`,
            message: `${actor.full_name} returned ${entry.activity_date} Period ${entry.period_number}: "${comment?.trim()}"`,
            category: 'report_returned',
            link_target: 'reporting',
            reference_id: sub.id,
            is_read: false,
            created_at: now,
          });
        } else if (newStatus === 'approved') {
          db.notifications.unshift({
            id: uid('notif'),
            recipient_profile_id: student.profile_id,
            academic_year_id: sub.academic_year_id,
            title: 'Report Fully Approved & Next Period Unlocked',
            message: `Your report (${sub.unit_key}) has been fully approved by ${actor.full_name}. Your next scheduled reporting unit is now unlocked.`,
            category: 'report_approved',
            link_target: 'reporting',
            reference_id: sub.id,
            is_read: false,
            created_at: now,
          });
        }
      }
    }

    this.appendSandboxAudit(
      actor,
      decision === 'approved' ? 'PERIOD_APPROVED' : 'PERIOD_RETURNED',
      'period_activity_entry',
      entry.id,
      { date: entry.activity_date, period: entry.period_number, comment: comment?.trim() }
    );
  }

  public async bulkApprovePendingPeriods(
    actor: Profile,
    submissionId: string,
    comment = 'Bulk approved after period review.'
  ): Promise<number> {
    const snap = await this.fetchSnapshot();
    const pendingEntries = snap.period_activity_entries.filter(
      (pe) =>
        pe.submission_id === submissionId &&
        pe.activity_status !== 'cancelled' &&
        pe.approval_status === 'pending'
    );
    for (const pe of pendingEntries) {
      await this.reviewPeriodEntry(actor, pe.id, 'approved', comment);
    }
    return pendingEntries.length;
  }

  // ==================== SETTINGS & NOTIFICATIONS ====================

  public async updateAppSettings(actor: Profile, updates: Partial<AppSettings>): Promise<void> {
    this.assertAdmin(actor);
    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      const { error } = await sb.from('app_settings').update(updates).eq('id', 1);
      if (error) throw new Error(error.message);
      await this.logSupabaseAudit(actor, 'SETTINGS_UPDATED', 'app_settings', '1', updates);
      return;
    }
    const db = this.getSandbox();
    db.app_settings = {
      ...db.app_settings,
      ...updates,
      id: 1,
      updated_at: new Date().toISOString(),
    };
    this.appendSandboxAudit(actor, 'SETTINGS_UPDATED', 'app_settings', '1', updates);
  }

  public async updateAcademicYearSettings(
    actor: Profile,
    academicYearId: string,
    updates: {
      working_days?: number[];
      period_count?: number;
      week_start_day?: number;
      entry_mode?: WorkflowMode;
      approval_mode?: WorkflowMode;
      default_period_timings?: PeriodTiming[];
    }
  ): Promise<void> {
    this.assertAdmin(actor);
    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      const { error } = await sb
        .from('academic_year_settings')
        .update(updates)
        .eq('academic_year_id', academicYearId);
      if (error) throw new Error(error.message);
      if (updates.entry_mode) {
        await this.logSupabaseAudit(actor, 'ENTRY_MODE_CHANGED', 'academic_year_settings', academicYearId, {
          entry_mode: updates.entry_mode,
        });
      }
      if (updates.approval_mode) {
        await this.logSupabaseAudit(actor, 'APPROVAL_MODE_CHANGED', 'academic_year_settings', academicYearId, {
          approval_mode: updates.approval_mode,
        });
      }
      return;
    }

    const db = this.getSandbox();
    const ys = db.academic_year_settings.find((s) => s.academic_year_id === academicYearId);
    if (!ys) throw new Error('Academic year settings not found.');

    const prevEntry = ys.entry_mode;
    const prevApproval = ys.approval_mode;

    Object.assign(ys, updates, { updated_at: new Date().toISOString() });

    if (updates.period_count && (!updates.default_period_timings || updates.default_period_timings.length !== updates.period_count)) {
      ys.default_period_timings = getDefaultPeriodTimings(updates.period_count);
    }

    if (updates.entry_mode && updates.entry_mode !== prevEntry) {
      this.appendSandboxAudit(actor, 'ENTRY_MODE_CHANGED', 'academic_year_settings', academicYearId, {
        from: prevEntry,
        to: updates.entry_mode,
      });
    }
    if (updates.approval_mode && updates.approval_mode !== prevApproval) {
      this.appendSandboxAudit(actor, 'APPROVAL_MODE_CHANGED', 'academic_year_settings', academicYearId, {
        from: prevApproval,
        to: updates.approval_mode,
      });
    }
  }

  public exportDatabaseBackup(): string {
    if (isSupabaseConfigured()) {
      if (!this.lastSupabaseSnapshot) throw new Error('Data not loaded yet. Refresh and try again.');
      return JSON.stringify(this.lastSupabaseSnapshot, null, 2);
    }
    const db = this.getSandbox();
    return JSON.stringify(db, null, 2);
  }

  public importDatabaseBackup(actor: Profile, backupJson: string): void {
    this.assertAdmin(actor);
    if (isSupabaseConfigured()) {
      throw new Error('Restore works only in demo mode. For the live database use Supabase Dashboard → Database → Backups.');
    }
    let parsed: DatabaseSnapshot;
    try {
      parsed = JSON.parse(backupJson) as DatabaseSnapshot;
    } catch {
      throw new Error('The uploaded file is not a valid JSON database file.');
    }

    if (
      !parsed ||
      !Array.isArray(parsed.profiles) ||
      !Array.isArray(parsed.students) ||
      !parsed.app_settings
    ) {
      throw new Error('Invalid backup structure. Missing essential database tables.');
    }

    this.sandboxDb = parsed;
    this.saveSandbox();
    this.appendSandboxAudit(actor, 'DATABASE_RESTORED', 'app_settings', '1', {
      student_count: parsed.students.length,
      profile_count: parsed.profiles.length,
      restored_at: new Date().toISOString(),
    });
  }

  public resetDatabaseToDefault(actor: Profile): void {
    this.assertAdmin(actor);
    if (isSupabaseConfigured()) {
      throw new Error('Reset is disabled for the live database.');
    }
    this.sandboxDb = createIsolatedSandboxSeed();
    this.saveSandbox();
    this.appendSandboxAudit(actor, 'DATABASE_RESET', 'app_settings', '1', {
      reset_at: new Date().toISOString(),
    });
  }

  public async markNotificationRead(profileId: string, notificationId?: string): Promise<void> {
    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      if (notificationId) {
        await sb.from('notifications').update({ is_read: true }).eq('id', notificationId);
      } else {
        await sb.from('notifications').update({ is_read: true }).eq('recipient_profile_id', profileId);
      }
      return;
    }
    const db = this.getSandbox();
    db.notifications.forEach((n) => {
      if (n.recipient_profile_id === profileId && (!notificationId || n.id === notificationId)) {
        n.is_read = true;
      }
    });
  }

  // ============================================================================
  // CIC Off-Course: course chart, opt-outs, proposals, pool, passwords
  // The live database re-checks every rule (migration 007); the demo store uses
  // the same checks from lib/offCourseRules.ts.
  // ============================================================================

  private demoOnly<T>(fn: (db: DatabaseSnapshot) => T): T {
    const db = this.getSandbox();
    const out = fn(db);
    this.saveSandbox();
    return out;
  }

  public async updateSubjectCourseChart(
    actor: Profile,
    subjectId: string,
    fields: {
      academic_stage: AcademicStage | null;
      semester_no: number | null;
      course_type: CourseType;
      is_urdu: boolean;
      credit: number;
      scheme?: string | null;
    }
  ): Promise<void> {
    this.assertAdmin(actor);
    if (fields.credit < 0 || fields.credit > 20) throw new Error('ക്രെഡിറ്റ് 0 മുതൽ 20 വരെ.');
    if (isSupabaseConfigured()) {
      const { error } = await getSupabaseClient()!.from('subjects').update(fields).eq('id', subjectId);
      if (error) throw new Error(error.message);
      await this.logSupabaseAudit(actor, 'COURSE_CHART_UPDATED', 'subject', subjectId, fields);
      return;
    }
    this.demoOnly((db) => {
      const sub = db.subjects.find((x) => x.id === subjectId);
      if (!sub) throw new Error('Subject not found.');
      Object.assign(sub, fields);
      this.appendSandboxAudit(actor, 'COURSE_CHART_UPDATED', 'subject', subjectId, fields);
    });
  }

  public async createCourseSubject(
    actor: Profile,
    payload: {
      code: string;
      name: string;
      academic_stage: AcademicStage;
      semester_no: number;
      course_type: CourseType;
      is_urdu: boolean;
      credit: number;
      scheme?: string | null;
    }
  ): Promise<void> {
    this.assertAdmin(actor);
    const row = {
      ...payload,
      code: payload.code.trim().toUpperCase(),
      name: payload.name.trim(),
      category: payload.course_type,
      is_active: true,
    };
    if (!row.code || !row.name) throw new Error('കോഡും പേരും നൽകുക.');
    if (isSupabaseConfigured()) {
      const { error } = await getSupabaseClient()!.from('subjects').insert(row);
      if (error) throw new Error(error.message);
      await this.logSupabaseAudit(actor, 'COURSE_SUBJECT_CREATED', 'subject', row.code, row);
      return;
    }
    this.demoOnly((db) => {
      db.subjects.push({ ...row, id: uid('sub'), created_at: new Date().toISOString() });
      this.appendSandboxAudit(actor, 'COURSE_SUBJECT_CREATED', 'subject', row.code, row);
    });
  }

  public async updateStudentStage(
    actor: Profile,
    studentId: string,
    stage: AcademicStage | null,
    semesterNo: number | null,
    scheme: string | null
  ): Promise<void> {
    this.assertAdmin(actor);
    const fields = { academic_stage: stage, stage_semester_no: semesterNo, scheme };
    if (isSupabaseConfigured()) {
      const { error } = await getSupabaseClient()!.from('students').update(fields).eq('id', studentId);
      if (error) throw new Error(error.message);
      return;
    }
    this.demoOnly((db) => {
      const st = db.students.find((x) => x.id === studentId);
      if (st) Object.assign(st, fields);
    });
  }

  public async saveOffCourseSelection(
    actor: Profile,
    draft: SelectionDraft & { academic_year_id: string; semester_period?: 'Nov' | 'May' | null }
  ): Promise<void> {
    this.assertAdmin(actor);
    const row = {
      student_id: draft.student_id,
      academic_year_id: draft.academic_year_id,
      academic_stage: draft.academic_stage,
      semester_no: draft.semester_no,
      semester_period: draft.semester_period || null,
      opted_out_subject_id: draft.opted_out_subject_id,
      replacement_type: draft.replacement_type,
      pool_item_id: draft.replacement_type === 'pool' ? draft.pool_item_id || null : null,
      proposal_id: draft.replacement_type === 'off_course' ? draft.proposal_id || null : null,
      interdisciplinary_subject_id:
        draft.replacement_type === 'interdisciplinary' ? draft.interdisciplinary_subject_id || null : null,
      notes: draft.notes?.trim() || null,
    };
    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      const q = draft.id
        ? sb.from('student_offcourse_selections').update(row).eq('id', draft.id)
        : sb.from('student_offcourse_selections').insert({ ...row, created_by: actor.id });
      const { error } = await q;
      if (error) throw new Error(error.message);
      await this.logSupabaseAudit(actor, draft.id ? 'OFFCOURSE_SELECTION_UPDATED' : 'OFFCOURSE_SELECTION_CREATED',
        'student', draft.student_id, row);
      return;
    }
    this.demoOnly((db) => {
      const errors = validateSelection(db, draft);
      if (errors.length) throw new Error(errors.join(' '));
      const credit = Number(db.subjects.find((x) => x.id === row.opted_out_subject_id)?.credit || 0);
      const now = new Date().toISOString();
      if (draft.id) {
        const ex = db.student_offcourse_selections.find((x) => x.id === draft.id);
        if (!ex) throw new Error('Record not found.');
        Object.assign(ex, row, { opted_out_credit: credit, updated_at: now });
      } else {
        db.student_offcourse_selections.push({
          ...row,
          id: uid('ocs'),
          opted_out_credit: credit,
          status: 'active',
          created_by: actor.id,
          created_at: now,
          updated_at: now,
        } as StudentOffCourseSelection);
      }
      this.appendSandboxAudit(actor, 'OFFCOURSE_SELECTION_SAVED', 'student', draft.student_id, row);
    });
  }

  public async setOffCourseSelectionStatus(
    actor: Profile,
    selectionId: string,
    status: StudentOffCourseSelection['status']
  ): Promise<void> {
    this.assertAdmin(actor);
    if (isSupabaseConfigured()) {
      const { error } = await getSupabaseClient()!
        .from('student_offcourse_selections').update({ status }).eq('id', selectionId);
      if (error) throw new Error(error.message);
      await this.logSupabaseAudit(actor, 'OFFCOURSE_SELECTION_STATUS', 'selection', selectionId, { status });
      return;
    }
    this.demoOnly((db) => {
      const ex = db.student_offcourse_selections.find((x) => x.id === selectionId);
      if (!ex) throw new Error('Record not found.');
      if (status !== 'cancelled' && ex.status === 'cancelled') {
        const errors = validateSelection(db, { ...ex, id: ex.id });
        if (errors.length) throw new Error(errors.join(' '));
      }
      ex.status = status;
      ex.updated_at = new Date().toISOString();
    });
  }

  public async saveProposal(
    actor: Profile,
    payload: Omit<OffCourseProposal, 'id' | 'status' | 'created_at' | 'updated_at' | 'exam_modes' |
      'principal_approved_at' | 'submitted_at' | 'cic_decided_at' | 'approved_credit' | 'created_by'> & {
      id?: string;
      exam_modes?: string[];
      approved_credit?: number | null;
    },
    memberIds: string[]
  ): Promise<string> {
    this.assertAdmin(actor);
    const row = {
      academic_year_id: payload.academic_year_id,
      proposal_type: payload.proposal_type,
      academic_stage: payload.academic_stage,
      semester_period: payload.semester_period || null,
      topic: payload.topic.trim(),
      model_code: payload.model_code || null,
      proposed_credit: Number(payload.proposed_credit),
      guide_mentor_id: payload.guide_mentor_id || null,
      guide_name: payload.guide_name?.trim() || null,
      guide_phone: payload.guide_phone?.trim() || null,
      guide_email: payload.guide_email?.trim() || null,
      exam_language: payload.exam_language?.trim() || null,
      exam_modes: payload.exam_modes || [],
      application_no: payload.application_no?.trim() || null,
      remarks: payload.remarks?.trim() || null,
      work_submission_due: payload.work_submission_due || null,
      ...(payload.approved_credit != null ? { approved_credit: Number(payload.approved_credit) } : {}),
    };
    if (row.topic.length < 3) throw new Error('വിഷയത്തിന്റെ പേര് നൽകുക.');
    if (!(row.proposed_credit > 0)) throw new Error('നിർദ്ദേശിക്കുന്ന ക്രെഡിറ്റ് നൽകുക.');
    const pseudo = { id: payload.id || '', proposal_type: row.proposal_type, academic_stage: row.academic_stage, topic: row.topic };

    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      let id = payload.id;
      if (id) {
        const { error } = await sb.from('offcourse_proposals').update(row).eq('id', id);
        if (error) throw new Error(error.message);
      } else {
        const { data, error } = await sb
          .from('offcourse_proposals').insert({ ...row, created_by: actor.id }).select('id').single();
        if (error) throw new Error(error.message);
        id = data.id as string;
      }
      const { data: current, error: mErr } = await sb
        .from('offcourse_proposal_members').select('student_id').eq('proposal_id', id);
      if (mErr) throw new Error(mErr.message);
      const have = new Set((current || []).map((m: { student_id: string }) => m.student_id));
      const removed = [...have].filter((x) => !memberIds.includes(x));
      if (removed.length) {
        const { error } = await sb.from('offcourse_proposal_members').delete()
          .eq('proposal_id', id).in('student_id', removed);
        if (error) throw new Error(error.message);
      }
      for (const [i, sid] of memberIds.entries()) {
        if (have.has(sid)) continue;
        const { error } = await sb.from('offcourse_proposal_members')
          .insert({ proposal_id: id, student_id: sid, is_leader: i === 0 });
        if (error) throw new Error(error.message);
      }
      await this.logSupabaseAudit(actor, payload.id ? 'PROPOSAL_UPDATED' : 'PROPOSAL_CREATED', 'proposal', id, {
        topic: row.topic, members: memberIds.length,
      });
      return id!;
    }

    return this.demoOnly((db) => {
      const errors = validateProposalMembers(db, pseudo, memberIds);
      if (errors.length) throw new Error(errors.join(' '));
      const now = new Date().toISOString();
      let id = payload.id;
      if (id) {
        const ex = db.offcourse_proposals.find((x) => x.id === id);
        if (!ex) throw new Error('Proposal not found.');
        Object.assign(ex, row, { updated_at: now });
      } else {
        id = uid('prop');
        db.offcourse_proposals.push({
          ...row, id, status: 'draft', created_by: actor.id, created_at: now, updated_at: now,
        } as OffCourseProposal);
      }
      db.offcourse_proposal_members = db.offcourse_proposal_members.filter((m) => m.proposal_id !== id);
      memberIds.forEach((sid, i) =>
        db.offcourse_proposal_members.push({ proposal_id: id!, student_id: sid, is_leader: i === 0, created_at: now })
      );
      this.appendSandboxAudit(actor, 'PROPOSAL_SAVED', 'proposal', id, { topic: row.topic });
      return id;
    });
  }

  public async setProposalStatus(
    actor: Profile,
    proposalId: string,
    status: ProposalStatus,
    extra: { approved_credit?: number | null; remarks?: string | null; application_no?: string | null } = {}
  ): Promise<void> {
    this.assertAdmin(actor);
    const patch: Record<string, unknown> = { status };
    if (extra.approved_credit != null) patch.approved_credit = Number(extra.approved_credit);
    if (extra.remarks != null) patch.remarks = extra.remarks;
    if (extra.application_no != null) patch.application_no = extra.application_no;
    if (isProposalApproved(status) && !(Number(extra.approved_credit) > 0)) {
      const existing = this.lastSupabaseSnapshot?.offcourse_proposals.find((p) => p.id === proposalId)?.approved_credit;
      if (!isSupabaseConfigured() || !(Number(existing) > 0)) {
        // the database repeats this check; message here is friendlier
        if (!(Number(extra.approved_credit) > 0)) throw new Error('CIC അംഗീകരിച്ച ക്രെഡിറ്റ് നൽകുക.');
      }
    }
    if (isSupabaseConfigured()) {
      const { error } = await getSupabaseClient()!.from('offcourse_proposals').update(patch).eq('id', proposalId);
      if (error) throw new Error(error.message);
      await this.logSupabaseAudit(actor, 'PROPOSAL_STATUS', 'proposal', proposalId, patch);
      return;
    }
    this.demoOnly((db) => {
      const p = db.offcourse_proposals.find((x) => x.id === proposalId);
      if (!p) throw new Error('Proposal not found.');
      if (!PROPOSAL_NEXT[p.status].includes(status)) {
        throw new Error(`ഈ ഘട്ടത്തിൽ നിന്ന് (${p.status}) ${status} ആക്കാനാവില്ല.`);
      }
      const now = new Date().toISOString();
      Object.assign(p, patch, { updated_at: now });
      if (status === 'principal_approved') p.principal_approved_at = now;
      if (status === 'submitted_to_cic') p.submitted_at = now;
      if (isProposalApproved(status) || status === 'rewrite' || status === 'rejected') p.cic_decided_at = p.cic_decided_at || now;
    });
  }

  public async deleteProposal(actor: Profile, proposalId: string): Promise<void> {
    this.assertAdmin(actor);
    if (isSupabaseConfigured()) {
      const { error } = await getSupabaseClient()!.from('offcourse_proposals').delete().eq('id', proposalId);
      if (error) throw new Error(error.message);
      await this.logSupabaseAudit(actor, 'PROPOSAL_DELETED', 'proposal', proposalId, {});
      return;
    }
    this.demoOnly((db) => {
      db.offcourse_proposals = db.offcourse_proposals.filter((p) => p.id !== proposalId);
      db.offcourse_proposal_members = db.offcourse_proposal_members.filter((m) => m.proposal_id !== proposalId);
      db.student_offcourse_selections.forEach((s) => {
        if (s.proposal_id === proposalId) s.proposal_id = null;
      });
    });
  }

  public async setPoolItemActive(actor: Profile, poolItemId: string, isActive: boolean): Promise<void> {
    this.assertAdmin(actor);
    if (isSupabaseConfigured()) {
      const { error } = await getSupabaseClient()!
        .from('offcourse_pool_items').update({ is_active: isActive }).eq('id', poolItemId);
      if (error) throw new Error(error.message);
      return;
    }
    this.demoOnly((db) => {
      const p = db.offcourse_pool_items.find((x) => x.id === poolItemId);
      if (p) p.is_active = isActive;
    });
  }

  /** Admin: current password of a student/mentor (every view is logged). */
  public async viewPassword(actor: Profile, profileId: string): Promise<string | null> {
    this.assertAdmin(actor);
    if (isSupabaseConfigured()) {
      const { data, error } = await getSupabaseClient()!.rpc('admin_view_password', { p_profile_id: profileId });
      if (error) throw new Error(error.message);
      return (data as string | null) ?? null;
    }
    const db = this.getSandbox();
    const p = db.profiles.find((x) => x.id === profileId);
    if (!p || p.role === 'admin') throw new Error('Not available.');
    return p.password_sandbox || null;
  }

  public async listPasswords(actor: Profile, profileIds: string[]): Promise<PasswordRow[]> {
    this.assertAdmin(actor);
    if (isSupabaseConfigured()) {
      const { data, error } = await getSupabaseClient()!.rpc('admin_list_passwords', { p_profile_ids: profileIds });
      if (error) throw new Error(error.message);
      return (data || []) as PasswordRow[];
    }
    const db = this.getSandbox();
    return db.profiles
      .filter((p) => profileIds.includes(p.id) && p.role !== 'admin')
      .map((p) => ({ profile_id: p.id, username: p.username, full_name: p.full_name, password: p.password_sandbox || null }));
  }

  public async resetPasswords(actor: Profile, profileIds: string[]): Promise<PasswordRow[]> {
    this.assertAdmin(actor);
    if (isSupabaseConfigured()) {
      const { data, error } = await getSupabaseClient()!.rpc('admin_reset_passwords', { p_profile_ids: profileIds });
      if (error) throw new Error(error.message);
      return (data || []) as PasswordRow[];
    }
    const letters = 'abcdefghjkmnpqrstuvwxyz';
    const digits = '23456789';
    const pick = (set: string) => set[Math.floor(Math.random() * set.length)];
    const db = this.getSandbox();
    const out: PasswordRow[] = [];
    for (const p of db.profiles) {
      if (!profileIds.includes(p.id) || p.role === 'admin') continue;
      const pwd = pick(letters).toUpperCase() + pick(letters) + pick(letters) + pick(letters) +
        pick(digits) + pick(digits) + pick(digits) + pick(digits);
      p.password_sandbox = pwd;
      p.password_hash_sandbox = await hashPassword(pwd);
      out.push({ profile_id: p.id, username: p.username, full_name: p.full_name, password: pwd });
    }
    this.saveSandbox();
    return out;
  }
}

export const dataService = new DataService();
