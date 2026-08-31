import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Archive, XCircle, BadgeCheck, RotateCcw } from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import { confirmCancel } from '../lib/confirmAction';
import { ValueTrace } from '../components/ValueTrace';
import { valueTrace } from '../lib/valueTraceMeta';
import { useSearch } from '../context/SearchContext';
import { matchesSearch } from '../lib/search';
import { isSharedCrdCode } from '../lib/sharedCrds';

export const RequisicoesPage: React.FC = () => {
  const { query } = useSearch();
  const [requisitions, setRequisitions] = useState<any[]>([]);
  const [crds, setCrds] = useState<any[]>([]);
  const [userRole, setUserRole] = useState<string>('viewer');
  const [allowedSectorIds, setAllowedSectorIds] = useState<string[]>([]);
  const [actingSector, setActingSector] = useState<'requester' | 'controle' | 'financeiro'>('requester');
  const [form, setForm] = useState({
    crd_id: '',
    date: '',
    amount: '',
    description: ''
  });

  const loadData = () => {
    fetch('/api/requisitions').then((res) => res.json()).then(setRequisitions);
    fetch('/api/crds').then((res) => res.json()).then(setCrds);
  };

  useEffect(() => {
    const loadUserScope = async () => {
      try {
        const res = await fetch('/api/auth/me');
        if (!res.ok) return;
        const user = await res.json();
        setUserRole(String(user?.role || 'viewer'));
        const role = String(user?.role || 'viewer');
        if (role === 'finance') setActingSector('financeiro');
        else if (role === 'controle') setActingSector('controle');
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

  const canSwitchActingProfile = userRole === 'admin';
  const canApproveControl = actingSector === 'controle' && (userRole === 'controle' || userRole === 'admin');
  const canPayFinance = actingSector === 'financeiro' && (userRole === 'finance' || userRole === 'admin');
  const canCancelAsRequester =
    actingSector === 'requester' &&
    (userRole === 'manager' || userRole === 'admin');

  const statusLabel = (status: string) => {
    if (status === 'approved') return { label: 'Aprovado Controle', classes: 'bg-blue-100 text-blue-700' };
    if (status === 'posted') return { label: 'Pago', classes: 'bg-emerald-100 text-emerald-700' };
    if (status === 'cancelled') return { label: 'Cancelado', classes: 'bg-slate-200 text-slate-700' };
    return { label: 'Aguardando Controle', classes: 'bg-orange-100 text-orange-700' };
  };

  const visibleCrds = useMemo(() => {
    const active = crds.filter((c) => c.active !== false);
    if (hasGlobalSectorView && allowedSectorIds.length === 0) return active;
    if (allowedSectorIds.length === 0) return [];
    return active.filter(
      (c) => allowedSectorIds.includes(String(c.sector_id)) || isSharedCrdCode(c.code)
    );
  }, [crds, allowedSectorIds, hasGlobalSectorView]);

  const matchesUserSector = (sectorId?: number | string | null) => {
    if (hasGlobalSectorView && allowedSectorIds.length === 0) return true;
    if (allowedSectorIds.length === 0) return false;
    return allowedSectorIds.includes(String(sectorId ?? ''));
  };

  const scopedRequisitions = useMemo(
    () => requisitions.filter((r) => matchesUserSector(r.sector_id)),
    [requisitions, allowedSectorIds, hasGlobalSectorView]
  );

  const createRequisition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.crd_id || !form.date || !form.amount) {
      alert('Preencha CRD, data e valor.');
      return;
    }

    const res = await fetch('/api/requisitions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        crd_id: parseInt(form.crd_id),
        date: form.date,
        amount: parseFloat(form.amount),
        description: form.description || null
      })
    });

    if (!res.ok) {
      const data = await res.json();
      alert(data.error || 'Não foi possível lançar a requisição.');
      return;
    }

    setForm({ crd_id: '', date: '', amount: '', description: '' });
    loadData();
  };

  const updateStatus = async (id: number, status: 'open' | 'approved' | 'posted' | 'cancelled') => {
    if (status === 'cancelled' && !confirmCancel('esta requisição')) return;
    const res = await fetch(`/api/requisitions/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.error || 'Não foi possível atualizar a requisição.');
      return;
    }
    loadData();
  };

  const filteredRequisitions = useMemo(
    () =>
      scopedRequisitions.filter((r) =>
        matchesSearch(
          query,
          r.crd_code,
          r.crd_name,
          r.sector_name,
          r.description,
          r.date,
          r.amount,
          r.status
        )
      ),
    [scopedRequisitions, query]
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Requisições Internas</h2>
          <p className="text-slate-500 text-sm">
            Registre compras internas por CRD para compor o orçamento do CRD na competência da requisição.
          </p>
        </div>
        {canSwitchActingProfile && (
          <select
            value={actingSector}
            onChange={(e) => setActingSector(e.target.value as 'requester' | 'controle' | 'financeiro')}
            className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 shadow-sm self-start"
          >
            <option value="requester">Visão solicitante</option>
            <option value="controle">Atuar como Controle</option>
            <option value="financeiro">Atuar como Financeiro</option>
          </select>
        )}
      </div>

      <form onSubmit={createRequisition} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 grid grid-cols-1 md:grid-cols-5 gap-3">
        <select
          required
          value={form.crd_id}
          onChange={(e) => setForm((p) => ({ ...p, crd_id: e.target.value }))}
          className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm"
        >
          <option value="">CRD</option>
          {visibleCrds.map((c) => (
            <option key={c.id} value={c.id}>{c.code} - {c.name}{c.sector_name ? ` (${c.sector_name})` : ''}</option>
          ))}
        </select>
        {visibleCrds.length === 0 && (
          <p className="md:col-span-5 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
            Nenhum CRD disponível para os setores vinculados ao seu usuário.
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
          <span className="font-bold text-sm">Lançar requisição</span>
        </button>
      </form>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50/50">
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">CRD</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Fornecedor</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Data</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Vencimento</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Valor</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filteredRequisitions.map((r) => {
              const meta = statusLabel(r.status);
              return (
              <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-6 py-4 text-sm font-medium text-slate-700">
                  {(r.crd_code || 'CRD')} - {r.crd_name || 'Sem descrição'}
                  <span className="block text-xs font-normal text-slate-500">{r.sector_name || 'Sem setor'}</span>
                </td>
                <td className="px-6 py-4 text-sm text-slate-600">{r.description || '—'}</td>
                <td className="px-6 py-4 text-sm text-slate-600">{r.date}</td>
                <td className="px-6 py-4 text-sm text-slate-400">—</td>
                <td className="px-6 py-4">
                  <ValueTrace
                    className="text-sm font-bold text-slate-900"
                    displayValue={formatCurrency(r.amount)}
                    meta={valueTrace.requisitions.amount(r.id)}
                  />
                </td>
                <td className="px-6 py-4">
                  <span className={cn(
                    "text-[10px] font-bold px-2 py-1 rounded-lg uppercase tracking-wider",
                    meta.classes
                  )}>
                    {meta.label}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex justify-end gap-2">
                    {canApproveControl && r.status === 'open' && (
                      <>
                        <button
                          onClick={() => updateStatus(r.id, 'approved')}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Aprovar no Controle"
                        >
                          <BadgeCheck className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => updateStatus(r.id, 'cancelled')}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Reprovar"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      </>
                    )}
                    {canApproveControl && r.status === 'approved' && (
                      <button
                        onClick={() => updateStatus(r.id, 'open')}
                        className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                        title="Desaprovar"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                    )}
                    {canPayFinance && r.status === 'approved' && (
                      <button
                        onClick={() => updateStatus(r.id, 'posted')}
                        className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                        title="Registrar pagamento"
                      >
                        <Archive className="w-4 h-4" />
                      </button>
                    )}
                    {canCancelAsRequester && (r.status === 'open' || r.status === 'approved') && (
                      <button
                        onClick={() => updateStatus(r.id, 'cancelled')}
                        className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                        title="Cancelar requisição"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );})}
          </tbody>
        </table>
      </div>
    </div>
  );
};

