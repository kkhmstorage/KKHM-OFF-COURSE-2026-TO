import React, { useMemo, useState } from 'react';
import { Eye, EyeOff, KeyRound, Printer } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { dataService } from '../../services/dataService';
import type { PasswordRow } from '../../services/dataService';
import { EmptyState, PageHeader } from '../ui/CommonUI';

const inputCls =
  'mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-[#1E3A5F] focus:outline-none';
const btn =
  'rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer disabled:opacity-50';
const btnPrimary =
  'rounded-lg bg-[#1E3A5F] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#162C49] cursor-pointer disabled:opacity-50';

/**
 * Admin can see the current password of students and mentors (stored encrypted;
 * every view is written to the audit log). Administrator passwords are never shown.
 */
export const PasswordsModule: React.FC = () => {
  const { db, session, notify, confirmAction } = useApp();
  const [role, setRole] = useState<'student' | 'mentor'>('student');
  const [batch, setBatch] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [shown, setShown] = useState<Record<string, string | null>>({});
  const [slips, setSlips] = useState<PasswordRow[] | null>(null);
  const [busy, setBusy] = useState(false);

  const people = useMemo(() => {
    if (!db) return [];
    const q = search.trim().toLowerCase();
    return db.profiles
      .filter((p) => p.role === role)
      .map((p) => {
        const st = db.students.find((s) => s.profile_id === p.id);
        return { p, st };
      })
      .filter(({ st }) => role !== 'student' || !batch || st?.batch_name === batch)
      .filter(({ p, st }) =>
        !q || p.full_name.toLowerCase().includes(q) || p.username.toLowerCase().includes(q) || (st?.admission_number || '').toLowerCase().includes(q)
      )
      .sort((a, b) => (a.st?.batch_name || '').localeCompare(b.st?.batch_name || '') || a.p.full_name.localeCompare(b.p.full_name));
  }, [db, role, batch, search]);

  if (!db || !session) return null;
  const batches = [...new Set(db.students.map((s) => s.batch_name))].sort();
  const allSelected = people.length > 0 && people.every(({ p }) => selected.includes(p.id));

  const reveal = async (id: string) => {
    if (id in shown) {
      setShown((cur) => {
        const n = { ...cur };
        delete n[id];
        return n;
      });
      return;
    }
    try {
      const pwd = await dataService.viewPassword(session.profile, id);
      setShown((cur) => ({ ...cur, [id]: pwd }));
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed.');
    }
  };

  const printCurrent = async () => {
    setBusy(true);
    try {
      setSlips(await dataService.listPasswords(session.profile, selected));
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed.');
    } finally {
      setBusy(false);
    }
  };

  const resetSelected = () =>
    confirmAction({
      title: `${selected.length} പേർക്ക് പുതിയ പാസ്‌വേഡ്?`,
      description:
        'ഓരോരുത്തർക്കും വ്യത്യസ്തമായ 8 അക്ഷര പാസ്‌വേഡ് ഉണ്ടാക്കും. പഴയ പാസ്‌വേഡ് ഇനി പ്രവർത്തിക്കില്ല, ഇപ്പോൾ ലോഗിൻ ചെയ്തവർ പുറത്താകും. അടുത്ത പേജിൽ പ്രിന്റ് ചെയ്ത് നൽകാം.',
      confirmLabel: 'പുതിയ പാസ്‌വേഡ് നൽകുക',
      tone: 'danger',
      onConfirm: async () => {
        setBusy(true);
        try {
          const rows = await dataService.resetPasswords(session.profile, selected);
          setSlips(rows);
          setShown({});
          notify('success', `${rows.length} പേർക്ക് പുതിയ പാസ്‌വേഡ് നൽകി.`);
        } catch (err) {
          notify('error', err instanceof Error ? err.message : 'Failed.');
        } finally {
          setBusy(false);
        }
      },
    });

  if (slips) {
    return (
      <div>
        <div className="no-print mb-4 flex flex-wrap gap-2 items-center">
          <button type="button" className={btn} onClick={() => setSlips(null)}>
            ← തിരികെ
          </button>
          <button type="button" className={btnPrimary} onClick={() => window.print()}>
            <Printer className="inline h-3.5 w-3.5 mr-1" /> സ്ലിപ്പുകൾ പ്രിന്റ് ചെയ്യുക
          </button>
          <span className="text-[11px] text-slate-500">ഈ പേജ് അടച്ചാൽ പാസ്‌വേഡുകൾ സ്ക്രീനിൽ നിന്ന് മാറും.</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {slips.map((r) => (
            <div key={r.profile_id} className="password-slip rounded-lg border border-dashed border-slate-400 bg-white p-3 text-xs">
              <div className="font-semibold text-slate-900">{r.full_name}</div>
              <div className="mt-1">{db.app_settings.institution_name}</div>
              <div className="mt-2 font-mono">
                Username: <b>{r.username}</b>
              </div>
              <div className="font-mono">
                Password: <b>{r.password ?? '— (പുതിയത് നൽകണം)'}</b>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="ലോഗിൻ & പാസ്‌വേഡുകൾ"
        subtitle="വിദ്യാർത്ഥികളുടെയും മെന്റർമാരുടെയും നിലവിലുള്ള പാസ്‌വേഡ് കാണാം. ഓരോ തവണ കാണുന്നതും ഓഡിറ്റ് ലോഗിൽ രേഖപ്പെടുത്തും."
      />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="text-xs font-medium text-slate-700">
          ആര്
          <select className={inputCls} value={role} onChange={(e) => { setRole(e.target.value as 'student' | 'mentor'); setSelected([]); }}>
            <option value="student">വിദ്യാർത്ഥികൾ</option>
            <option value="mentor">മെന്റർമാർ</option>
          </select>
        </label>
        {role === 'student' && (
          <label className="text-xs font-medium text-slate-700">
            ക്ലാസ്
            <select className={inputCls} value={batch} onChange={(e) => setBatch(e.target.value)}>
              <option value="">എല്ലാം</option>
              {batches.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="text-xs font-medium text-slate-700 flex-1 min-w-[180px]">
          തിരയുക
          <input className={inputCls} value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <button type="button" className={btn} disabled={!selected.length || busy} onClick={printCurrent}>
          <Printer className="inline h-3.5 w-3.5 mr-1" /> തിരഞ്ഞെടുത്തവരുടെ സ്ലിപ്പ് ({selected.length})
        </button>
        <button type="button" className={btnPrimary} disabled={!selected.length || busy} onClick={resetSelected}>
          <KeyRound className="inline h-3.5 w-3.5 mr-1" /> പുതിയ പാസ്‌വേഡ് നൽകുക
        </button>
      </div>
      <p className="mb-3 text-[11px] text-slate-500">
        "ഡിഫോൾട്ട്" എന്ന് കാണിക്കുന്നവർ ഇപ്പോഴും പരസ്യമായ പഴയ പാസ്‌വേഡ് (Student@2026 പോലെ) ഉപയോഗിക്കുന്നു — ഇവർക്ക് ഉടൻ പുതിയത് നൽകുക.
        ഈ സംവിധാനം വരുന്നതിന് മുമ്പ് സെറ്റ് ചെയ്ത പാസ്‌വേഡുകൾ കാണാനാവില്ല; പുതിയത് നൽകിയാൽ അതുമുതൽ കാണാം.
      </p>
      {!people.length ? (
        <EmptyState title="ആരുമില്ല" description="ഫിൽട്ടർ മാറ്റി നോക്കുക." />
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-700 border-b border-slate-200">
              <tr>
                <th className="px-3 py-2.5 w-8">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={() => setSelected(allSelected ? [] : people.map(({ p }) => p.id))}
                  />
                </th>
                <th className="px-3 py-2.5">പേര്</th>
                <th className="px-3 py-2.5">Username</th>
                <th className="px-3 py-2.5">പാസ്‌വേഡ്</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {people.map(({ p, st }) => {
                const open = p.id in shown;
                const usesDefault = p.must_change_password;
                return (
                  <tr key={p.id}>
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selected.includes(p.id)}
                        onChange={() => setSelected((cur) => (cur.includes(p.id) ? cur.filter((x) => x !== p.id) : [...cur, p.id]))}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-900">{p.full_name}</div>
                      {st && (
                        <div className="text-[11px] text-slate-500">
                          {st.admission_number} · {st.batch_name}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono">{p.username}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <button type="button" className={btn} onClick={() => reveal(p.id)}>
                          {open ? <EyeOff className="inline h-3.5 w-3.5" /> : <Eye className="inline h-3.5 w-3.5" />}
                        </button>
                        {open && (
                          <span className="font-mono text-slate-900">
                            {shown[p.id] ?? <span className="text-amber-700 font-sans">ലഭ്യമല്ല — പുതിയത് നൽകുക</span>}
                          </span>
                        )}
                        {usesDefault && <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">ഡിഫോൾട്ട്</span>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
