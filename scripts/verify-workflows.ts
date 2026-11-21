import assert from 'node:assert/strict';
import { dataService } from '../src/services/dataService';
import { addDays, getDayOfWeekISO } from '../src/lib/dateUtils';
import { mapMatrixToBulkStudentRows, parseCsvText } from '../src/lib/exportUtils';

async function expectReject(fn: () => Promise<unknown>, expectedSubstring: string, label: string) {
  try {
    await fn();
    assert.fail(`Expected failure [${label}] containing "${expectedSubstring}", but succeeded`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    assert.ok(
      msg.toLowerCase().includes(expectedSubstring.toLowerCase()),
      `[${label}] Expected error containing "${expectedSubstring}", got: "${msg}"`
    );
  }
}

async function run() {
  console.log('Running KKHM AMS End-to-End Workflow & Security Verification...\n');

  // 1. Unified Login & Role Detection (temporary Admin kkhmoffcourse / 1111) + First-Login Credential Update
  const tempAdminSession = await dataService.login('kkhmoffcourse', '1111');
  assert.equal(tempAdminSession.profile.role, 'admin', 'Admin role auto-detected from kkhmoffcourse / 1111');

  // Admin updates own temporary username & password on first login
  await dataService.updateUserCredentials(
    tempAdminSession.profile,
    tempAdminSession.profile.id,
    'kkhm.admin',
    'StrongAdmin@2026'
  );
  await expectReject(
    () => dataService.login('kkhmoffcourse', '1111'),
    'invalid',
    'Old temporary admin credentials invalidated after update'
  );
  const adminSession = await dataService.login('kkhm.admin', 'StrongAdmin@2026');
  assert.equal(adminSession.profile.role, 'admin', 'Updated Admin credentials login succeeds');

  const mentorSession = await dataService.login('mentor1', 'Mentor@2026');
  assert.equal(mentorSession.profile.role, 'mentor', 'Mentor role auto-detected');
  assert.ok(mentorSession.mentor, 'Mentor record linked');

  const mentor2Session = await dataService.login('mentor2', 'Mentor@2026');
  assert.equal(mentor2Session.profile.role, 'mentor', 'Second mentor role auto-detected');

  const studentSession = await dataService.login('student1', 'Student@2026');
  assert.equal(studentSession.profile.role, 'student', 'Student role auto-detected');
  assert.ok(studentSession.student, 'Student record linked');

  await expectReject(
    () => dataService.login('kkhm.admin', 'WrongPass'),
    'invalid',
    'Invalid password rejected'
  );
  console.log('✓ 1. Unified login (temporary kkhmoffcourse / 1111 -> updated credentials), Mentor & Student auto-routing verified');

  // 2. Admin Username & Password Control + Account Deactivation
  await expectReject(
    () =>
      dataService.updateUserCredentials(
        studentSession.profile,
        studentSession.profile.id,
        'hacked.user',
        'Hack@123'
      ),
    'administrator',
    'Non-admin blocked from editing credentials'
  );

  await dataService.updateUserCredentials(
    adminSession.profile,
    studentSession.profile.id,
    'ashiq.kkhm26',
    'NewPass@2026',
    false
  );
  await expectReject(
    () => dataService.login('ashiq.kkhm26', 'NewPass@2026'),
    'deactivated',
    'Deactivated account blocked'
  );

  // Re-activate & verify new username + password work
  await dataService.updateUserCredentials(
    adminSession.profile,
    studentSession.profile.id,
    'ashiq.kkhm26',
    'NewPass@2026',
    true
  );
  const reloggedStudent = await dataService.login('ashiq.kkhm26', 'NewPass@2026');
  assert.equal(reloggedStudent.profile.username, 'ashiq.kkhm26');
  await expectReject(
    () => dataService.login('student1', 'Student@2026'),
    'invalid',
    'Old credentials invalidated immediately'
  );
  console.log('✓ 2. Admin controls usernames, passwords & activation across accounts; deactivated users blocked');

  // 3. Global Academic Year Switch, Closed Year Immutability & Year Isolation
  let snap = await dataService.fetchSnapshot();
  const closedYear = snap.academic_years.find((y) => y.status === 'closed')!;
  const openYear = snap.academic_years.find((y) => y.status === 'open')!;
  assert.ok(closedYear && openYear, 'Closed and open academic years exist');

  await expectReject(
    () =>
      dataService.saveAndOptionallySubmitPeriods(reloggedStudent.profile, {
        student_id: reloggedStudent.student!.id,
        academic_year_id: closedYear.id,
        anchor_date: '2025-10-10',
        entries: [
          {
            activity_date: '2025-10-10',
            period_number: 1,
            planned_activity_snapshot: 'Test',
            actual_activity: 'Attempt in closed year',
            activity_status: 'completed',
          },
        ],
        submit: true,
      }),
    'closed',
    'Closed academic year rejects new submissions'
  );
  console.log('✓ 3. Closed academic years strictly reject new student submissions');

  // 4. All 4 Workflow Combinations + Sequential Locking + Malayalam Unicode + Mentor Review/Return
  // Create a clean test student with mentor1 assigned in openYear to test sequential locking cleanly from scratch
  await dataService.createStudent(adminSession.profile, {
    full_name: 'Salmanul Faris',
    admission_number: 'KKHM-2026-099',
    batch_name: 'Degree Year 1 (2026-29)',
    username: 'student.salman',
    email: 'salman@kkhm.edu.in',
    phone: '+91 9847000999',
    password: 'Student@2026',
    academic_year_id: openYear.id,
  });

  const salmanSession = await dataService.login('student.salman', 'Student@2026');
  const salmanId = salmanSession.student!.id;

  // Assign mentor1 to Salman in openYear
  await dataService.assignMentorToStudents(adminSession.profile, {
    academic_year_id: openYear.id,
    mentor_id: mentorSession.mentor!.id,
    student_ids: [salmanId],
    assigned_date: '2026-06-01',
  });

  // Assign published timetable template to Salman
  snap = await dataService.fetchSnapshot();
  const template = snap.timetable_templates.find((t) => t.academic_year_id === openYear.id)!;
  await dataService.assignTimetableToStudents(adminSession.profile, {
    academic_year_id: openYear.id,
    template_id: template.id,
    student_ids: [salmanId],
    effective_start_date: '2026-06-01',
  });

  // Ensure openYear is configured to 4 periods for quick verification, Daily Entry + Daily Approval
  await dataService.updateAcademicYearSettings(adminSession.profile, openYear.id, {
    entry_mode: 'daily',
    approval_mode: 'daily',
    period_count: 2,
    working_days: [1, 2, 3, 4, 5, 6],
  });

  // Pick two consecutive working dates (Monday & Tuesday)
  let day1 = '2026-08-03'; // Monday
  while (getDayOfWeekISO(day1) !== 1) day1 = addDays(day1, 1);
  const day2 = addDays(day1, 1); // Tuesday

  // Submit Day 1 with Malayalam + English content
  const malayalamText = 'തഫ്‌സീർ പഠനവും അറബിക് വ്യാകരണ ചർച്ചയും പൂർത്തിയാക്കി.';
  await dataService.saveAndOptionallySubmitPeriods(salmanSession.profile, {
    student_id: salmanId,
    academic_year_id: openYear.id,
    anchor_date: day1,
    entries: [
      {
        activity_date: day1,
        period_number: 1,
        planned_activity_snapshot: 'Tafsir Study',
        actual_activity: malayalamText,
        activity_status: 'completed',
      },
      {
        activity_date: day1,
        period_number: 2,
        planned_activity_snapshot: 'Arabic Grammar',
        actual_activity: 'Completed Nahw exercises chapter 2.',
        activity_status: 'completed',
      },
    ],
    submit: true,
  });

  // Verify Sequential Locking: Day 2 must be blocked while Day 1 is pending approval
  await expectReject(
    () =>
      dataService.saveAndOptionallySubmitPeriods(salmanSession.profile, {
        student_id: salmanId,
        academic_year_id: openYear.id,
        anchor_date: day2,
        entries: [
          {
            activity_date: day2,
            period_number: 1,
            planned_activity_snapshot: 'Hadith',
            actual_activity: 'Should be blocked',
            activity_status: 'completed',
          },
          {
            activity_date: day2,
            period_number: 2,
            planned_activity_snapshot: 'Fiqh',
            actual_activity: 'Should be blocked',
            activity_status: 'completed',
          },
        ],
        submit: true,
      }),
    'fully approved',
    'Sequential locking blocks Day 2 while Day 1 is unapproved'
  );

  // Verify Security: Student cannot approve own report
  snap = await dataService.fetchSnapshot();
  const salmanDay1Entries = snap.period_activity_entries.filter(
    (e) => e.student_id === salmanId && e.activity_date === day1
  );
  assert.equal(salmanDay1Entries.length, 2);
  assert.equal(salmanDay1Entries[0].actual_activity, malayalamText, 'Malayalam UTF-8 preserved');

  await expectReject(
    () => dataService.reviewPeriodEntry(salmanSession.profile, salmanDay1Entries[0].id, 'approved'),
    'forbidden',
    'Student cannot self-approve'
  );

  // Verify Security: Unassigned Mentor 2 cannot review Salman's report
  await expectReject(
    () => dataService.reviewPeriodEntry(mentor2Session.profile, salmanDay1Entries[0].id, 'approved'),
    'not the assigned mentor',
    'Unassigned mentor blocked'
  );

  // Verify Mentor Return requires mandatory comment
  await expectReject(
    () => dataService.reviewPeriodEntry(mentorSession.profile, salmanDay1Entries[0].id, 'returned', '   '),
    'mandatory',
    'Return without comment rejected'
  );

  // Assigned Mentor approves Period 1, returns Period 2 with Malayalam feedback
  await dataService.reviewPeriodEntry(mentorSession.profile, salmanDay1Entries[0].id, 'approved');
  await dataService.reviewPeriodEntry(
    mentorSession.profile,
    salmanDay1Entries[1].id,
    'returned',
    'ഉദാഹരണങ്ങൾ കൂടി ചേർത്ത് വീണ്ടും സമർപ്പിക്കുക.'
  );

  // Day 2 must STILL be locked because Period 2 is returned
  await expectReject(
    () =>
      dataService.saveAndOptionallySubmitPeriods(salmanSession.profile, {
        student_id: salmanId,
        academic_year_id: openYear.id,
        anchor_date: day2,
        entries: [
          {
            activity_date: day2,
            period_number: 1,
            planned_activity_snapshot: 'Hadith',
            actual_activity: 'Still locked',
            activity_status: 'completed',
          },
          {
            activity_date: day2,
            period_number: 2,
            planned_activity_snapshot: 'Fiqh',
            actual_activity: 'Still locked',
            activity_status: 'completed',
          },
        ],
        submit: true,
      }),
    'fully approved',
    'Day 2 remains locked while Period 2 is returned'
  );

  // Student resubmits corrected Period 2, Mentor approves it -> Day 2 unlocks!
  await dataService.saveAndOptionallySubmitPeriods(salmanSession.profile, {
    student_id: salmanId,
    academic_year_id: openYear.id,
    anchor_date: day1,
    entries: [
      {
        activity_date: day1,
        period_number: 2,
        planned_activity_snapshot: 'Arabic Grammar',
        actual_activity: 'Completed Nahw exercises chapter 2 with 5 Quranic examples.',
        activity_status: 'completed',
      },
    ],
    submit: true,
  });
  await dataService.reviewPeriodEntry(mentorSession.profile, salmanDay1Entries[1].id, 'approved');

  // Now Day 2 submission succeeds!
  await dataService.saveAndOptionallySubmitPeriods(salmanSession.profile, {
    student_id: salmanId,
    academic_year_id: openYear.id,
    anchor_date: day2,
    entries: [
      {
        activity_date: day2,
        period_number: 1,
        planned_activity_snapshot: 'Hadith',
        actual_activity: 'Studied Riyad al-Salihin Bab 1.',
        activity_status: 'completed',
      },
      {
        activity_date: day2,
        period_number: 2,
        planned_activity_snapshot: 'Fiqh',
        actual_activity: 'Prepared Fiqh notes on Wudu.',
        activity_status: 'completed',
      },
    ],
    submit: true,
  });
  console.log('✓ 4. Daily/Daily sequential lock, mentor isolation, return/resubmit, and Malayalam UTF-8 verified');

  // 5. Verify Remaining 3 Mode Combinations (Daily/Weekly, Weekly/Daily, Weekly/Weekly)
  const combos: Array<['daily' | 'weekly', 'daily' | 'weekly']> = [
    ['daily', 'weekly'],
    ['weekly', 'daily'],
    ['weekly', 'weekly'],
  ];
  for (const [entryMode, approvalMode] of combos) {
    await dataService.updateAcademicYearSettings(adminSession.profile, openYear.id, {
      entry_mode: entryMode,
      approval_mode: approvalMode,
    });
    const updatedSnap = await dataService.fetchSnapshot();
    const ys = updatedSnap.academic_year_settings.find((s) => s.academic_year_id === openYear.id)!;
    assert.equal(ys.entry_mode, entryMode);
    assert.equal(ys.approval_mode, approvalMode);
  }
  console.log('✓ 5. All 4 independent Entry Mode × Approval Mode combinations configurable and persisted');

  // 6. Verify CSV & Excel bulk template mapping handles Malayalam & flexible headers cleanly
  const parsed = parseCsvText(`Name,Notes\n"Salmanul Faris","തഫ്‌സീർ പഠനം, അധ്യായം 1"`);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[1][1], 'തഫ്‌സീർ പഠനം, അധ്യായം 1');

  const bulkRows = mapMatrixToBulkStudentRows([
    ['Full Name *', 'Admission Number *', 'Class / Batch *', 'Email', 'Phone', 'Username *', 'Password *'],
    ['മുഹമ്മദ് റാഷിദ്', 'KKHM2650', 'Degree 1st Year', 'rashid@kkhm.edu.in', '9847000111', 'kkhm2650', 'Student@2026'],
  ]);
  assert.equal(bulkRows.length, 1);
  assert.equal(bulkRows[0].full_name, 'മുഹമ്മദ് റാഷിദ്');
  assert.equal(bulkRows[0].admission_number, 'KKHM2650');
  assert.equal(bulkRows[0].username, 'kkhm2650');
  console.log('✓ 6. UTF-8 Malayalam CSV & Excel bulk student template parsing verified');

  console.log('\nALL WORKFLOW & SECURITY CHECKS PASSED SUCCESSFULLY.');
}

run().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
