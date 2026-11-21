import React from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Info,
  RotateCcw,
  X,
} from 'lucide-react';
import type { ConfirmState, ToastMessage } from '../../context/AppContext';

export const CollegeEmblem: React.FC<{ size?: 'sm' | 'md' | 'lg'; logoUrl?: string }> = ({
  size = 'md',
  logoUrl,
}) => {
  const dims = size === 'sm' ? 'h-8 w-8' : size === 'lg' ? 'h-14 w-14' : 'h-10 w-10';
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt="KKHM Islamic & Arts College"
        referrerPolicy="no-referrer"
        className={`${dims} rounded-lg object-cover border border-slate-200 bg-white shrink-0`}
      />
    );
  }
  return (
    <div
      className={`${dims} rounded-lg bg-[#1E3A5F] text-white flex items-center justify-center shrink-0 border border-[#284C7A]`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 36 36" className="h-3/4 w-3/4" fill="none">
        <path d="M18 5L32 12L18 19L4 12L18 5Z" fill="#FFFFFF" />
        <path d="M9 15.5V25C9 27.6 13 30 18 30C23 30 27 27.6 27 25V15.5L18 20L9 15.5Z" fill="#CCFBF1" />
        <path d="M30 13.5V23.5" stroke="#0D9488" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
    </div>
  );
};

export const PageHeader: React.FC<{
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}> = ({ title, subtitle, actions }) => (
  <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between pb-5 border-b border-slate-200 mb-6">
    <div className="min-w-0">
      <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
  </div>
);

export const StatCard: React.FC<{
  label: string;
  value: string | number;
  helper?: string;
  tone?: 'default' | 'success' | 'warning' | 'danger' | 'teal';
  onClick?: () => void;
}> = ({ label, value, helper, tone = 'default', onClick }) => {
  const valueTone =
    tone === 'success'
      ? 'text-emerald-700'
      : tone === 'warning'
        ? 'text-amber-700'
        : tone === 'danger'
          ? 'text-red-700'
          : tone === 'teal'
            ? 'text-teal-700'
            : 'text-slate-900';

  const Container = onClick ? 'button' : 'div';

  return (
    <Container
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`text-left w-full rounded-xl border border-slate-200 bg-white p-4 transition-colors ${
        onClick ? 'hover:border-slate-300 hover:bg-slate-50/60 cursor-pointer' : ''
      }`}
    >
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={`mt-2 text-2xl font-bold tracking-tight font-mono tabular-nums ${valueTone}`}>
        {value}
      </div>
      {helper && <div className="mt-1 text-xs text-slate-500 truncate">{helper}</div>}
    </Container>
  );
};

/**
 * Clean unboxed semantic status indicator with icon + explicit text label
 * (Zero-Pill Discipline: avoids candy capsules / pill sandwiches)
 */
export const StatusLabel: React.FC<{ status: string }> = ({ status }) => {
  const normalized = status.toLowerCase();
  const map: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    approved: {
      label: 'Approved',
      color: 'text-emerald-700',
      icon: <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />,
    },
    active: {
      label: 'Active',
      color: 'text-emerald-700',
      icon: <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />,
    },
    open: {
      label: 'Open',
      color: 'text-emerald-700',
      icon: <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />,
    },
    selected: {
      label: 'Selected',
      color: 'text-emerald-700',
      icon: <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />,
    },
    completed: {
      label: 'Completed',
      color: 'text-emerald-700',
      icon: <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />,
    },
    published: {
      label: 'Published',
      color: 'text-emerald-700',
      icon: <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />,
    },
    pending: {
      label: 'Pending',
      color: 'text-amber-700',
      icon: <Clock className="h-3.5 w-3.5 shrink-0" />,
    },
    pending_review: {
      label: 'Pending Review',
      color: 'text-amber-700',
      icon: <Clock className="h-3.5 w-3.5 shrink-0" />,
    },
    submitted: {
      label: 'Submitted',
      color: 'text-[#1E3A5F]',
      icon: <Clock className="h-3.5 w-3.5 shrink-0" />,
    },
    partially_reviewed: {
      label: 'Partially Reviewed',
      color: 'text-teal-700',
      icon: <Clock className="h-3.5 w-3.5 shrink-0" />,
    },
    draft: {
      label: 'Draft',
      color: 'text-slate-600',
      icon: <Info className="h-3.5 w-3.5 shrink-0" />,
    },
    not_started: {
      label: 'Not Started',
      color: 'text-slate-500',
      icon: <Info className="h-3.5 w-3.5 shrink-0" />,
    },
    returned: {
      label: 'Returned',
      color: 'text-red-700',
      icon: <RotateCcw className="h-3.5 w-3.5 shrink-0" />,
    },
    closed: {
      label: 'Closed',
      color: 'text-slate-600',
      icon: <AlertCircle className="h-3.5 w-3.5 shrink-0" />,
    },
    inactive: {
      label: 'Inactive',
      color: 'text-red-700',
      icon: <AlertCircle className="h-3.5 w-3.5 shrink-0" />,
    },
    not_selected: {
      label: 'Not Selected',
      color: 'text-slate-500',
      icon: <X className="h-3.5 w-3.5 shrink-0" />,
    },
    cancelled: {
      label: 'Timetable Cancelled',
      color: 'text-slate-500',
      icon: <X className="h-3.5 w-3.5 shrink-0" />,
    },
    no_activity: {
      label: 'No Activity',
      color: 'text-amber-700',
      icon: <AlertCircle className="h-3.5 w-3.5 shrink-0" />,
    },
    absent: {
      label: 'Absent',
      color: 'text-red-700',
      icon: <AlertCircle className="h-3.5 w-3.5 shrink-0" />,
    },
  };

  const info = map[normalized] || {
    label: status.replace(/_/g, ' '),
    color: 'text-slate-700',
    icon: <Info className="h-3.5 w-3.5 shrink-0" />,
  };

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap ${info.color}`}>
      {info.icon}
      <span>{info.label}</span>
    </span>
  );
};

export const EmptyState: React.FC<{
  title: string;
  description: string;
  action?: React.ReactNode;
}> = ({ title, description, action }) => (
  <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
    <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
    <p className="mt-1.5 text-sm text-slate-500 max-w-md mx-auto">{description}</p>
    {action && <div className="mt-4 flex justify-center">{action}</div>}
  </div>
);

export const Modal: React.FC<{
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl';
}> = ({ open, title, subtitle, onClose, children, maxWidth = 'md' }) => {
  if (!open) return null;
  const widthCls =
    maxWidth === 'sm'
      ? 'max-w-md'
      : maxWidth === 'lg'
        ? 'max-w-2xl'
        : maxWidth === 'xl'
          ? 'max-w-4xl'
          : 'max-w-lg';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div className={`w-full ${widthCls} rounded-xl border border-slate-200 bg-white shadow-xl my-8`}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-6 py-5 max-h-[80vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
};

export const ConfirmDialog: React.FC<{
  state: ConfirmState | null;
  onClose: () => void;
}> = ({ state, onClose }) => {
  const [busy, setBusy] = React.useState(false);
  if (!state) return null;

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await state.onConfirm();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={true} title={state.title} onClose={onClose} maxWidth="sm">
      <p className="text-sm text-slate-600 leading-relaxed">{state.description}</p>
      <div className="mt-6 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={busy}
          className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors cursor-pointer ${
            state.tone === 'danger'
              ? 'bg-red-600 hover:bg-red-700'
              : 'bg-[#1E3A5F] hover:bg-[#162C49]'
          }`}
        >
          {busy ? 'Processing...' : state.confirmLabel || 'Confirm'}
        </button>
      </div>
    </Modal>
  );
};

export const ToastContainer: React.FC<{
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}> = ({ toasts, onDismiss }) => {
  if (!toasts.length) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full px-4 sm:px-0 no-print">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg ${
            t.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : t.type === 'error'
                ? 'border-red-200 bg-red-50 text-red-900'
                : 'border-slate-200 bg-white text-slate-800'
          }`}
        >
          <span className="leading-snug">{t.text}</span>
          <button
            type="button"
            onClick={() => onDismiss(t.id)}
            className="text-current/60 hover:text-current shrink-0 cursor-pointer"
            aria-label="Dismiss message"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
};

export const PaginationBar: React.FC<{
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}> = ({ page, pageSize, total, onPageChange }) => {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-xs text-slate-600">
      <span className="tabular-nums">
        Showing {start}–{end} of {total} records
      </span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Prev
        </button>
        <span className="px-2 font-mono tabular-nums">
          {page} / {totalPages}
        </span>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
        >
          Next
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
};
