import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Archive, XCircle } from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import { ValueTrace } from '../components/ValueTrace';
import { valueTrace } from '../lib/valueTraceMeta';
import { useSearch } from '../context/SearchContext';
import { matchesSearch } from '../lib/search';

export const LancamentosManuaisPage: React.FC = () => {
  const { query } = useSearch();
  const [entries, setEntries] = useState<any[]>([]);
  const [sectors, setSectors] = useState<any[]>([]);
  const [crds, setCrds] = useState<any[]>([]);
  const [userRole, setUserRole] = useState<string>('viewer');
  const [allowedSectorIds, setAllowedSectorIds] = useState<string[]>([]);
  const [form, setForm] = useState({
    sector_id: '',
    crd_id: '',
    date: '',
    amount: '',
    description: '',
  });

  const loadData = async () => {
    try {
      const [entriesRes, sectorsRes, crdsRes] = await Promise.all([
        fetch('/api/manual-entries'),
        fetch('/api/sectors'),
        fetch('/api/crds'),
      ]);
      const entries = await entriesRes.json().catch(() => null);
      const sectorsData = await sectorsRes.json().catch(() => null);
      const crdsData = await crdsRes.json().catch(() => null);
      setEntries(Array.isArray(entries) ? entries : []);
      setSectors(Array.isArray(sectorsData) ? sectorsData : []);
      setCrds(Array.isArray(crdsData) ? crdsData : []);
    } catch {
      setEntries([]);
      setSectors([]);
      setCrds([]);
    }
  };

  useEffect(() => {
    const loadUserScope = async () => {
      try {
        const res = await fetch('/api/auth/me');
        if (!res.ok) return;
        const user = await res.json();
        setUserRole(String(user?.role || 'viewer'));
        const ids = Array.from(
          new Set<string>(
            (Array.isArray(user?.sector_ids) ? user.sector_ids : [user?.sector_id])
              .map((id: unknown) => String(id ?? '').trim())
              .filter((id: string) => id !== '')
          )
        );
        setAllowedSectorIds(ids);
      } catch {
        // mantém escopo vazio
      }
    };

    loadUserScope();
    loadData();
  }, []);

  const hasGlobalSectorView =
    userRole === 'admin' || userRole === 'finance' || userRole === 'controle';

  const visibleSectors = useMemo(() => {
    if (hasGlobalSectorView && allowedSectorIds.length === 0) return sectors;
    if (allowedSectorIds.length === 0) return [];
    return sectors.filter((s) => allowedSectorIds.includes(String(s.id)));
  }, [sectors, allowedSectorIds, hasGlobalSectorView]);

  const visibleCrds = useMemo(() => {
    const active = crds.filter((c) => c.active !== false);
    if (!form.sector_id) return [];
    return active.filter((c) => String(c.sector_id) === form.sector_id);
  }, [crds, form.sector_id]);

  const matchesUserSector = (sectorId?: number | string | null) => {
    if (hasGlobalSectorView && allowedSectorIds.length === 0) return true;
    if (allowedSectorIds.length === 0) return false;
    return allowedSectorIds.includes(String(sectorId ?? ''));
  };

  const scopedEntries = useMemo(
    () => entries.filter((e) => matchesUserSector(e.sector_id)),
    [entries, allowedSectorIds, hasGlobalSectorView]
  );

  const createEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.sector_id || !form.date || !form.amount) {
      alert('Preencha setor, data e valor.');
      return;
    }

    const res = await fetch('/api/manual-entries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sector_id: parseInt(form.sector_id, 10),
        crd_id: form.crd_id ? parseInt(form.crd_id, 10) : null,
        date: form.date,
        amount: parseFloat(form.amount),
        description: form.description || null,
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      alert(data.error || 'Não foi possível registrar o lançamento.');
      return;
    }

    setForm({ sector_id: '', crd_id: '', date: '', amount: '', description: '' });
    loadData();
  };

  const updateStatus = async (id: number, status: 'posted' | 'cancelled') => {
    await fetch(`/api/manual-entries/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    loadData();
  };

  const filteredEntries = useMemo(
    () =>
      scopedEntries.filter((entry) =>
        matchesSearch(
          query,
          entry.sector_name,
          entry.crd_code,
          entry.crd_name,
          entry.description,
          entry.user_name,
          entry.date,
          entry.amount,
          entry.status
        )
      ),
    [scopedEntries, query]
  );

  const openTotal = useMemo(
    () =>
      scopedEntries
        .filter((e) => e.status === 'open')
        .reduce((sum, e) => sum + Number(e.amount || 0), 0),
    [scopedEntries]
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Lançamentos Manuais</h2>
        <p className="text-slate-500 text-sm">
          Registre compromissos avulsos por setor. Lançamentos em aberto compõem o orçamento do mês, como notas e requisições.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-wrap items-center gap-4">
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Em aberto (visíveis)</p>
          <p className="text-xl font-extrabold text-slate-900 mt-1">
            <ValueTrace
              displayValue={formatCurrency(openTotal)}
              meta={valueTrace.manualEntries.openTotal()}
            />
          </p>
        </div>
        <p className="text-xs text-slate-400 max-w-md">
          Baixe ou cancele um lançamento para removê-lo do compromisso orçamentário do setor na competência da data informada.
        </p>
      </div>

      <form
        onSubmit={createEntry}
        className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 grid grid-cols-1 md:grid-cols-6 gap-3"
      >
        <select
          required
          value={form.sector_id}
          onChange={(e) => setForm((p) => ({ ...p, sector_id: e.target.value, crd_id: '' }))}
          className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm"
        >
          <option value="">Setor</option>
          {visibleSectors.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        <select
          value={form.crd_id}
          onChange={(e) => setForm((p) => ({ ...p, crd_id: e.target.value }))}
          disabled={!form.sector_id}
          className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm disabled:opacity-50"
        >
          <option value="">CRD (opcional)</option>
          {visibleCrds.map((c) => (
            <option key={c.id} value={c.id}>{c.code} - {c.name}</option>
          ))}
        </select>

        {visibleSectors.length === 0 && (
          <p className="md:col-span-6 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
            Nenhum setor disponível para os vínculos do seu usuário.
          </p>
        )}

        <input
          required
          type="date"
          value={form.date}
          onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
          className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm"
        />

        <input
          required
          type="number"
          step="0.01"
          min="0"
          placeholder="Valor"
          value={form.amount}
          onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
          className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm"
        />

        <input
          placeholder="Descrição (opcional)"
          value={form.description}
          onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
          className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm"
        />

        <button
          type="submit"
          className="flex items-center justify-center gap-2 bg-[#004D40] text-white px-4 py-2.5 rounded-xl shadow-lg shadow-emerald-900/10 hover:bg-[#003d33] transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span className="font-bold text-sm">Lançar</span>
        </button>
      </form>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50/50">
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Setor / CRD</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Data</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Descrição</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Valor</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filteredEntries.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-10 text-center text-sm text-slate-400">
                  Nenhum lançamento manual encontrado.
                </td>
              </tr>
            )}
            {filteredEntries.map((entry) => (
              <tr key={entry.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-6 py-4 text-sm font-medium text-slate-700">
                  {entry.sector_name || 'Sem setor'}
                  {entry.crd_code ? (
                    <span className="block text-xs font-normal text-slate-500">
                      {entry.crd_code} - {entry.crd_name || 'CRD'}
                    </span>
                  ) : null}
                  {entry.user_name ? (
                    <span className="block text-[10px] font-normal text-slate-400 mt-0.5">por {entry.user_name}</span>
                  ) : null}
                </td>
                <td className="px-6 py-4 text-sm text-slate-600">{entry.date}</td>
                <td className="px-6 py-4 text-sm text-slate-600">{entry.description || '—'}</td>
                <td className="px-6 py-4">
                  <ValueTrace
                    className="text-sm font-bold text-slate-900"
                    displayValue={formatCurrency(entry.amount)}
                    meta={valueTrace.manualEntries.amount(entry.id)}
                  />
                </td>
                <td className="px-6 py-4">
                  <span
                    className={cn(
                      'text-[10px] font-bold px-2 py-1 rounded-lg uppercase tracking-wider',
                      entry.status === 'open'
                        ? 'bg-orange-100 text-orange-700'
                        : entry.status === 'posted'
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-slate-200 text-slate-700'
                    )}
                  >
                    {entry.status === 'open' ? 'Aberto' : entry.status === 'posted' ? 'Baixado' : 'Cancelado'}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex justify-end gap-2">
                    {entry.status === 'open' && (
                      <>
                        <button
                          onClick={() => updateStatus(entry.id, 'posted')}
                          className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                          title="Baixar lançamento"
                        >
                          <Archive className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => updateStatus(entry.id, 'cancelled')}
                          className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                          title="Cancelar lançamento"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
