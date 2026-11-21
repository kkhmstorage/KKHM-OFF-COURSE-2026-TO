import {
  buildUnitSpecForDate,
  checkSequentialLock,
  getDefaultPeriodTimings,
  getEffectiveDaySlots,
  getTodayIST,
} from '../lib/dateUtils';
import { hashPassword } from '../lib/cryptoUtils';
import { getSupabaseClient, isSupabaseConfigured, setSupabaseSessionToken } from '../lib/supabase';
import type {
  AcademicCalendarException,
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
        this.saveSandbox();
      }
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
          return structuredClone(this.getSandbox());
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
        ] = await Promise.all([
          sb.from('profiles').select('id,role,full_name,username,email,phone,is_active,last_login_at,created_at,updated_at'),
          sb.from('students').select('*'),
          sb.from('mentors').select('*'),
          sb.from('academic_years').select('*').order('start_date', { ascending: false }),
          sb.from('app_settings').select('*').eq('id', 1).maybeSingle(),
          sb.from('academic_year_settings').select('*'),
          sb.from('student_academic_enrollments').select('*'),
          sb.from('mentor_assignments').select('*'),
          sb.from('semesters').select('*').order('start_date', { ascending: true }),
          sb.from('subjects').select('*').order('code', { ascending: true }),
          sb.from('semester_subjects').select('*'),
          sb.from('student_subject_selections').select('*'),
          sb.from('timetable_templates').select('*'),
          sb.from('timetable_slots').select('*'),
          sb.from('student_timetable_assignments').select('*'),
          sb.from('timetable_overrides').select('*'),
          sb.from('academic_calendar_exceptions').select('*').order('exception_date', { ascending: false }),
          sb.from('report_submissions').select('*').order('start_date', { ascending: false }),
          sb.from('period_activity_entries').select('*').order('activity_date', { ascending: false }),
          sb.from('report_review_history').select('*').order('created_at', { ascending: false }),
          sb.from('notifications').select('*').order('created_at', { ascending: false }),
          sb.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(200),
        ]);

        const err =
          profiles.error ||
          academic_years.error ||
          app_settings.error ||
          report_submissions.error;
        if (err) {
          console.warn('Supabase database error, falling back to local sandbox store:', err.message);
          return structuredClone(this.getSandbox());
        }

        // If Supabase table is empty (e.g. before seeding complete), fallback gracefully
        if (!academic_years.data || academic_years.data.length === 0 || !profiles.data || profiles.data.length === 0) {
          console.warn('Supabase tables have no records, falling back to local sandbox store.');
          return structuredClone(this.getSandbox());
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

        return {
          profiles: (profiles.data || []) as Profile[],
          students: students.data || [],
          mentors: mentors.data || [],
          academic_years: academic_years.data || [],
          app_settings: fallbackSettings,
          academic_year_settings: academic_year_settings.data || [],
          student_academic_enrollments: student_academic_enrollments.data || [],
          mentor_assignments: mentor_assignments.data || [],
          semesters: semesters.data || [],
          subjects: subjects.data || [],
          semester_subjects: semester_subjects.data || [],
          student_subject_selections: student_subject_selections.data || [],
          timetable_templates: timetable_templates.data || [],
          timetable_slots: timetable_slots.data || [],
          student_timetable_assignments: student_timetable_assignments.data || [],
          timetable_overrides: timetable_overrides.data || [],
          academic_calendar_exceptions: academic_calendar_exceptions.data || [],
          report_submissions: report_submissions.data || [],
          period_activity_entries: period_activity_entries.data || [],
          report_review_history: report_review_history.data || [],
          notifications: notifications.data || [],
          audit_logs: audit_logs.data || [],
        };
      } catch (err) {
        console.warn('Supabase fetch exception, falling back to local sandbox store:', err);
        return structuredClone(this.getSandbox());
      }
    }

    // Clone snapshot for React immutability
    return structuredClone(this.getSandbox());
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
          if (error && error.message && !error.message.includes('Invalid') && !error.message.includes('password')) {
            console.warn('Supabase authenticate_user error, checking local sandbox:', error.message);
          }
        }
      } catch (err) {
        console.warn('Supabase login exception, checking local sandbox:', err);
      }
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
    if (payload.password.length < 6) {
      throw new Error('Password must be at least 6 characters.');
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
          password_hash: payload.password,
          is_active: payload.is_active ?? true,
        })
        .select()
        .single();
      if (pErr) throw new Error(pErr.message);
      await sb.rpc('admin_update_credentials', {
        p_target_profile_id: prof.id,
        p_new_username: payload.username.trim(),
        p_new_password: payload.password,
      });
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

      await sb.rpc('admin_update_credentials', {
        p_target_profile_id: stu.profile_id,
        p_new_username: payload.username.trim(),
        p_new_password: payload.new_password?.trim() || null,
      });
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
    if (payload.password.length < 6) {
      throw new Error('Password must be at least 6 characters.');
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
          password_hash: payload.password,
          is_active: payload.is_active ?? true,
        })
        .select()
        .single();
      if (pErr) throw new Error(pErr.message);
      await sb.rpc('admin_update_credentials', {
        p_target_profile_id: prof.id,
        p_new_username: payload.username.trim(),
        p_new_password: payload.password,
      });
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
      await sb.rpc('admin_update_credentials', {
        p_target_profile_id: m.profile_id,
        p_new_username: payload.username.trim(),
        p_new_password: payload.new_password?.trim() || null,
      });
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
    if (newPassword && newPassword.trim().length > 0 && newPassword.trim().length < 6) {
      throw new Error('New password must be at least 6 characters.');
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
    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      const { error } = await sb.from('semesters').insert(payload);
      if (error) throw new Error(error.message);
      return;
    }
    const db = this.getSandbox();
    db.semesters.push({ ...payload, id: uid('sem'), created_at: new Date().toISOString() });
    this.appendSandboxAudit(actor, 'SEMESTER_CREATED', 'semester', payload.name, payload);
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
    if (sem) sem.status = status;
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
    if (db.subjects.some((s) => s.code.toLowerCase() === payload.code.trim().toLowerCase())) {
      throw new Error(`Subject code "${payload.code}" already exists.`);
    }
    db.subjects.push({
      ...payload,
      id: uid('sub'),
      code: payload.code.trim().toUpperCase(),
      name: payload.name.trim(),
      created_at: new Date().toISOString(),
    });
    this.appendSandboxAudit(actor, 'SUBJECT_CREATED', 'subject', payload.code, payload);
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
    payload: { academic_year_id: string; name: string; description?: string }
  ): Promise<string> {
    this.assertAdmin(actor);
    const now = new Date().toISOString();
    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      const { data, error } = await sb
        .from('timetable_templates')
        .insert({
          academic_year_id: payload.academic_year_id,
          name: payload.name.trim(),
          description: payload.description?.trim() || null,
          is_published: false,
          revision: 1,
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data.id;
    }
    const db = this.getSandbox();
    const id = uid('tt');
    db.timetable_templates.push({
      id,
      academic_year_id: payload.academic_year_id,
      name: payload.name.trim(),
      description: payload.description?.trim(),
      is_published: false,
      revision: 1,
      created_at: now,
      updated_at: now,
    });
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
          planned_activity: `Off-Course Activity ${p}`,
        });
      }
    }
    this.appendSandboxAudit(actor, 'TIMETABLE_CREATED', 'timetable_template', id, { name: payload.name });
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

    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      for (const s of slots) {
        const { error } = await sb.from('timetable_slots').upsert(s, {
          onConflict: 'template_id,day_of_week,period_number',
        });
        if (error) throw new Error(error.message);
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
    for (const s of slots) {
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

    // Backend Sequential Locking Enforcement
    const lock = checkSequentialLock({
      targetUnit: unitSpec,
      studentId: payload.student_id,
      academicYear: year,
      settings: ys,
      exceptions: dbSnapshot.academic_calendar_exceptions,
      existingSubmissions: dbSnapshot.report_submissions,
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

    // For Weekly Approval mode when submitting, ensure all working dates in that week have entries
    const ttAssign = db.student_timetable_assignments.find(
      (a) =>
        a.student_id === payload.student_id &&
        a.academic_year_id === payload.academic_year_id &&
        a.is_active
    );
    const tplSlots = ttAssign ? db.timetable_slots.filter((s) => s.template_id === ttAssign.template_id) : [];

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
        ys
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
      // If Weekly Approval mode, verify every working day's required periods in this week are filled!
      if (effectiveApprovalMode === 'weekly') {
        const subEntries = db.period_activity_entries.filter((pe) => pe.submission_id === sub!.id);
        for (const wd of unitSpec.working_dates) {
          const slots = getEffectiveDaySlots(
            wd,
            payload.student_id,
            tplSlots,
            db.timetable_overrides,
            db.academic_calendar_exceptions,
            ys
          ).filter((s) => !s.is_cancelled);
          for (const sl of slots) {
            const match = subEntries.find(
              (pe) => pe.activity_date === wd && pe.period_number === sl.period_number
            );
            if (!match || !match.actual_activity.trim()) {
              throw new Error(
                `Weekly submission incomplete: Missing activity for ${wd} — Period ${sl.period_number} (${sl.planned_activity}). Save as Draft until all scheduled days in the week are recorded.`
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
    const db = this.getSandbox();
    return JSON.stringify(db, null, 2);
  }

  public importDatabaseBackup(actor: Profile, backupJson: string): void {
    this.assertAdmin(actor);
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
}

export const dataService = new DataService();
