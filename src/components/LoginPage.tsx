import React, { useState } from 'react';
import { Eye, EyeOff, KeyRound, Lock, ShieldCheck, User } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { CollegeEmblem, Modal } from './ui/CommonUI';
import { PWAInstallButton } from './PWAInstallButton';

export const LoginPage: React.FC = () => {
  const { login, db } = useApp();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgotOpen, setForgotOpen] = useState(false);

  const institutionName = db?.app_settings.institution_name || 'KKHM Islamic & Arts College';
  const applicationName =
    db?.app_settings.application_name || 'KKHM Off-Course Activity Management System';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!identifier.trim() || !password) {
      setError('Please enter your username or email and password.');
      return;
    }
    setSubmitting(true);
    try {
      await login(identifier, password, remember);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to sign in. Please check your credentials.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top minimal bar */}
      <header className="w-full border-b border-slate-200 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <CollegeEmblem size="sm" logoUrl={db?.app_settings.logo_url} />
            <span className="font-semibold text-sm sm:text-base text-slate-900 truncate">
              {institutionName}
            </span>
          </div>
          <PWAInstallButton />
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          {/* Institutional overview column */}
          <section className="lg:col-span-6 rounded-2xl bg-[#1E3A5F] text-white p-8 sm:p-10 flex flex-col justify-between">
            <div>
              <CollegeEmblem size="lg" logoUrl={db?.app_settings.logo_url} />
              <p className="mt-6 text-xs font-medium tracking-wide text-teal-200">
                {institutionName}
              </p>
              <h1 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight leading-snug">
                {applicationName}
              </h1>
              <p className="mt-4 text-sm text-slate-200 leading-relaxed">
                Manage weekly academic timetables, record period-wise off-course activities in
                English or Malayalam, and complete structured verification workflows from one
                institutional workspace.
              </p>
            </div>

            <div className="mt-8 pt-6 border-t border-white/15 space-y-3 text-xs text-slate-200">
              <div className="flex items-start gap-2.5">
                <ShieldCheck className="h-4 w-4 text-teal-300 shrink-0 mt-0.5" />
                <span>
                  Automatic workspace routing — enter your username and password to open your
                  authorized portal directly.
                </span>
              </div>
              <div className="flex items-start gap-2.5">
                <KeyRound className="h-4 w-4 text-teal-300 shrink-0 mt-0.5" />
                <span>
                  Public registration is disabled. All account usernames and passwords are issued
                  and managed centrally by the College Office.
                </span>
              </div>
            </div>
          </section>

          {/* Unified Sign-in Card */}
          <section className="lg:col-span-6 rounded-2xl border border-slate-200 bg-white p-8 sm:p-10 flex flex-col justify-center">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Sign in to your account</h2>
              <p className="mt-1 text-sm text-slate-600">
                Enter your username or email and password to continue.
              </p>
            </div>

            {error && (
              <div
                role="alert"
                className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
              >
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
              <div>
                <label htmlFor="login-identifier" className="block text-sm font-medium text-slate-700">
                  Username or Email
                </label>
                <div className="mt-1.5 relative">
                  <User className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="login-identifier"
                    type="text"
                    autoComplete="username"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="Enter your username or email"
                    className="w-full rounded-lg border border-slate-300 bg-white pl-10 pr-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#1E3A5F] focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/15"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label htmlFor="login-password" className="block text-sm font-medium text-slate-700">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => setForgotOpen(true)}
                    className="text-xs font-medium text-[#1E3A5F] hover:underline cursor-pointer"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="mt-1.5 relative">
                  <Lock className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full rounded-lg border border-slate-300 bg-white pl-10 pr-11 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#1E3A5F] focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/15"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800 cursor-pointer"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-[#1E3A5F] focus:ring-[#1E3A5F]"
                />
                <span>Keep me signed in on this device</span>
              </label>

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-lg bg-[#1E3A5F] py-2.5 px-4 text-sm font-semibold text-white hover:bg-[#162C49] disabled:opacity-60 transition-colors cursor-pointer"
              >
                {submitting ? 'Signing in...' : 'Sign In'}
              </button>
            </form>
          </section>
        </div>
      </main>

      <footer className="py-4 text-center text-xs text-slate-500">
        {institutionName} · Timezone: Asia/Kolkata (IST) · English &amp; മലയാളം Supported
      </footer>

      <Modal
        open={forgotOpen}
        title="Password Reset Assistance"
        onClose={() => setForgotOpen(false)}
        maxWidth="sm"
      >
        <p className="text-sm text-slate-600 leading-relaxed">
          For institutional security, all usernames and passwords are managed centrally by the
          College Office.
        </p>
        <p className="mt-3 text-sm text-slate-600 leading-relaxed">
          Please contact the <strong>KKHM Academic Office</strong> to recover your username or issue
          a new password.
        </p>
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={() => setForgotOpen(false)}
            className="rounded-lg bg-[#1E3A5F] px-4 py-2 text-sm font-medium text-white hover:bg-[#162C49] cursor-pointer"
          >
            Close
          </button>
        </div>
      </Modal>
    </div>
  );
};
