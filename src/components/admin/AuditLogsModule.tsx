import React, { useMemo, useState } from 'react';
import { Download, Search } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { formatDateTimeIST } from '../../lib/dateUtils';
import { downloadCsv } from '../../lib/exportUtils';
import { PageHeader, PaginationBar } from '../ui/CommonUI';

export const AuditLogsModule: React.FC = () => {
  const { db, notify } = useApp();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const filtered = useMemo(() => {
    if (!db) return [];
    const q = search.trim().toLowerCase();
    return db.audit_logs.filter((log) => {
      if (roleFilter !== 'all' && log.actor_role !== roleFilter) return false;
      if (q) {
        return (
          log.actor_name.toLowerCase().includes(q) ||
          log.action.toLowerCase().includes(q) ||
          log.record_type.toLowerCase().includes(q) ||
          JSON.stringify(log.details).toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [db, search, roleFilter]);

  if (!db) return null;
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  const handleExport = () => {
    downloadCsv(
      'kkhm-audit-logs.csv',
      ['Timestamp (IST)', 'Actor', 'Role', 'Action', 'Record Type', 'Record ID', 'Details'],
      filtered.map((l) => [
        formatDateTimeIST(l.created_at),
        l.actor_name,
        l.actor_role,
        l.action,
        l.record_type,
        l.record_id || '',
        JSON.stringify(l.details),
      ])
    );
    notify('success', 'Audit logs exported to CSV.');
  };

  return (
    <div>
      <PageHeader
        title="Audit Logs"
        subtitle="Immutable record of logins, academic year switches, student/mentor management, credential updates, timetable publications, and review actions."
        actions={
          <button
            type="button"
            onClick={handleExport}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            <Download className="h-3.5 w-3.5" /> Export Audit CSV
          </button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-md">
          <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Filter by actor, action, or details..."
            className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-xs"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => {
            setRoleFilter(e.target.value);
            setPage(1);
          }}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
        >
          <option value="all">All Roles</option>
          <option value="admin">Admin</option>
          <option value="mentor">Mentor</option>
          <option value="student">Student</option>
        </select>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 font-semibold">Timestamp (IST)</th>
                <th className="px-4 py-3 font-semibold">Actor</th>
                <th className="px-4 py-3 font-semibold">Action</th>
                <th className="px-4 py-3 font-semibold">Target</th>
                <th className="px-4 py-3 font-semibold">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginated.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/70">
                  <td className="px-4 py-3 font-mono text-slate-500 whitespace-nowrap">
                    {formatDateTimeIST(log.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-semibold text-slate-900">{log.actor_name}</span>
                    <span className="ml-1.5 text-slate-500 capitalize">· {log.actor_role}</span>
                  </td>
                  <td className="px-4 py-3 font-mono font-semibold text-[#1E3A5F]">{log.action}</td>
                  <td className="px-4 py-3 text-slate-600">{log.record_type}</td>
                  <td className="px-4 py-3 font-mono text-[11px] text-slate-600 max-w-md truncate">
                    {JSON.stringify(log.details)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <PaginationBar page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} />
      </div>
    </div>
  );
};
