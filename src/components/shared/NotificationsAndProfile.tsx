import React from 'react';
import { ArrowRight, Bell, CheckCheck, KeyRound, Mail, Phone, User } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { formatDateTimeIST } from '../../lib/dateUtils';
import { dataService } from '../../services/dataService';
import { EmptyState, PageHeader, StatusLabel } from '../ui/CommonUI';

export const NotificationsModule: React.FC = () => {
  const { db, session, navigate, refresh, notify } = useApp();
  if (!db || !session) return null;

  const myNotifs = db.notifications
    .filter((n) => n.recipient_profile_id === session.profile.id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  const unreadCount = myNotifs.filter((n) => !n.is_read).length;

  const handleMarkAll = async () => {
    await dataService.markNotificationRead(session.profile.id);
    await refresh();
    notify('success', 'All notifications marked as read.');
  };

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle={`${unreadCount} unread notification(s) linked directly to your workflow screens.`}
        actions={
          unreadCount > 0 ? (
            <button
              type="button"
              onClick={handleMarkAll}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              <CheckCheck className="h-3.5 w-3.5" /> Mark All as Read
            </button>
          ) : undefined
        }
      />

      {!myNotifs.length ? (
        <EmptyState
          title="No Notifications"
          description="Updates about submitted reports, mentor reviews, returned periods, and unlocked reporting dates will appear here."
        />
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100 overflow-hidden">
          {myNotifs.map((n) => (
            <div
              key={n.id}
              className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                !n.is_read ? 'bg-[#1E3A5F]/[0.03]' : ''
              }`}
            >
              <div className="flex items-start gap-3 min-w-0">
                <Bell className={`h-4 w-4 shrink-0 mt-0.5 ${!n.is_read ? 'text-[#1E3A5F]' : 'text-slate-400'}`} />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900">{n.title}</span>
                    {!n.is_read && <span className="text-[11px] font-semibold text-teal-700">· Unread</span>}
                  </div>
                  <p className="mt-0.5 text-xs text-slate-600 leading-relaxed">{n.message}</p>
                  <div className="mt-1 text-[11px] font-mono text-slate-400">
                    {formatDateTimeIST(n.created_at)}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {!n.is_read && (
                  <button
                    type="button"
                    onClick={async () => {
                      await dataService.markNotificationRead(session.profile.id, n.id);
                      await refresh();
                    }}
                    className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 cursor-pointer"
                  >
                    Mark Read
                  </button>
                )}
                {n.link_target && (
                  <button
                    type="button"
                    onClick={async () => {
                      await dataService.markNotificationRead(session.profile.id, n.id);
                      await refresh();
                      navigate(n.link_target!, n.reference_id ? { submissionId: n.reference_id } : undefined);
                    }}
                    className="inline-flex items-center gap-1 rounded-md bg-[#1E3A5F] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#162C49] cursor-pointer"
                  >
                    Open <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const UserProfileModule: React.FC = () => {
  const { db, session, activeYear } = useApp();
  if (!db || !session || !activeYear) return null;

  const { profile, student, mentor } = session;

  const assignedMentor = student
    ? (() => {
        const ma = db.mentor_assignments.find(
          (m) => m.student_id === student.id && m.academic_year_id === activeYear.id && m.is_active
        );
        const m = db.mentors.find((x) => x.id === ma?.mentor_id);
        return db.profiles.find((p) => p.id === m?.profile_id);
      })()
    : undefined;

  const assignedStudentsCount = mentor
    ? db.mentor_assignments.filter(
        (m) => m.mentor_id === mentor.id && m.academic_year_id === activeYear.id && m.is_active
      ).length
    : 0;

  return (
    <div>
      <PageHeader
        title="My Profile"
        subtitle="Institutional account details and active academic year assignment."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-4xl">
        <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
          <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
            <div className="h-12 w-12 rounded-xl bg-[#1E3A5F] text-white text-base font-bold flex items-center justify-center">
              {profile.full_name
                .split(' ')
                .map((n) => n[0])
                .join('')
                .slice(0, 2)
                .toUpperCase()}
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">{profile.full_name}</h2>
              <div className="text-xs text-slate-500 capitalize">
                {profile.role} · <StatusLabel status={profile.is_active ? 'active' : 'inactive'} />
              </div>
            </div>
          </div>

          <div className="space-y-2.5 text-xs">
            <div className="flex items-center gap-2.5 text-slate-700">
              <User className="h-4 w-4 text-slate-400" />
              <span>Username: <strong className="font-mono">@{profile.username}</strong></span>
            </div>
            <div className="flex items-center gap-2.5 text-slate-700">
              <Mail className="h-4 w-4 text-slate-400" />
              <span>Email: <strong>{profile.email}</strong></span>
            </div>
            <div className="flex items-center gap-2.5 text-slate-700">
              <Phone className="h-4 w-4 text-slate-400" />
              <span>Phone: <strong>{profile.phone || 'Not provided'}</strong></span>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6 space-y-4">
          <h3 className="text-sm font-semibold text-slate-900">Academic Context ({activeYear.name})</h3>
          {student && (
            <div className="space-y-2 text-xs text-slate-700">
              <div>Admission Number: <strong className="font-mono">{student.admission_number}</strong></div>
              <div>Class / Batch: <strong>{student.batch_name}</strong></div>
              <div>Primary Mentor ({activeYear.name}): <strong>{assignedMentor?.full_name || 'Not Assigned'}</strong></div>
            </div>
          )}
          {mentor && (
            <div className="space-y-2 text-xs text-slate-700">
              <div>Employee Code: <strong className="font-mono">{mentor.employee_code}</strong></div>
              <div>Designation: <strong>{mentor.designation}</strong></div>
              <div>Department: <strong>{mentor.department || 'General'}</strong></div>
              <div>Assigned Students ({activeYear.name}): <strong className="font-mono">{assignedStudentsCount}</strong></div>
            </div>
          )}
          <div className="pt-3 border-t border-slate-100 flex items-start gap-2 text-xs text-slate-500">
            <KeyRound className="h-4 w-4 shrink-0 mt-0.5 text-slate-400" />
            <span>
              To update your username or reset your password, please contact the College Administrator.
            </span>
          </div>
        </section>
      </div>
    </div>
  );
};
