import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Archive, XCircle, BadgeCheck, RotateCcw } from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import { confirmCancel } from '../lib/confirmAction';
import { ValueTrace } from '../components/ValueTrace';
import { valueTrace } from '../lib/valueTraceMeta';
import { useSearch } from '../context/SearchContext';
import { useToast } from '../context/ToastContext';
import { matchesSearch } from '../lib/search';
import { isSharedCrdCode } from '../lib/sharedCrds';
import { SearchableSelect } from '../components/SearchableSelect';

const EMPTY_FORM = {
  crd_id: '',
  provider_name: '',
  date: '',
  amount: '',
  description: '',
};

export const RequisicoesPage: React.FC = () => {
  const { query } = useSearch();
  const { showSuccess } = useToast();
  const [requisitions, setRequisitions] = useState<any[]>([]);
  const [crds, setCrds] = useState<any[]>([]);
  const [userRole, setUserRole] = useState<string>('viewer');
  const [allowedSectorIds, setAllowedSectorIds] = useState<string[]>([]);
  const [actingSector, setActingSector] = useState<'requester' | 'controle' | 'financeiro'>('requester');
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [showModal, setShowModal] = useState(false);

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

  const crdSelectOptions = useMemo(
    () =>
      visibleCrds.map((c) => ({
        value: String(c.id),
        label: `${c.code} - ${c.name}${c.sector_name ? ` (${c.sector_name})` : ''}`,
        keywords: `${c.code} ${c.name} ${c.sector_name || ''}`,
      })),
    [visibleCrds]
  );

  const matchesUserSector = (sectorId?: number | string | null) => {
    if (hasGlobalSectorView && allowedSectorIds.length === 0) return true;
    if (allowedSectorIds.length === 0) return false;
    return allowedSectorIds.includes(String(sectorId ?? ''));
  };

  const scopedRequisitions = useMemo(
    () => requisitions.filter((r) => matchesUserSector(r.sector_id)),
    [requisitions, allowedSectorIds, hasGlobalSectorView]
  );

  const closeModal = () => {
    setShowModal(false);
    setForm({ ...EMPTY_FORM });
  };

  const createRequisition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.crd_id || !form.provider_name.trim() || !form.date || !form.amount) {
      alert('Preencha CRD, fornecedor, data e valor.');
      return;
    }

    const res = await fetch('/api/requisitions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        crd_id: parseInt(form.crd_id),
        provider_name: form.provider_name.trim(),
        date: form.date,
        amount: parseFloat(form.amount),
        description: form.description || null,
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      alert(data.error || 'Não foi possível lançar a requisição.');
      return;
    }

    showSuccess('Requisição lançada. Aguardando aprovação do Controle.');
    closeModal();
    loadData();
  };

  const updateStatus = async (id: number, status: 'open' | 'approved' | 'posted' | 'cancelled') => {
    if (status === 'cancelled' && !confirmCancel('esta requisição')) return;
    const res = await fetch(`/api/requisitions/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
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
          r.provider_name,
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
        <div className="flex items-center gap-3 self-start">
          {canSwitchActingProfile && (
            <select
              value={actingSector}
              onChange={(e) => setActingSector(e.target.value as 'requester' | 'controle' | 'financeiro')}
              className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 shadow-sm"
            >
              <option value="requester">Visão solicitante</option>
              <option value="controle">Atuar como Controle</option>
              <option value="financeiro">Atuar como Financeiro</option>
            </select>
          )}
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-[#004D40] text-white px-4 py-2.5 rounded-xl shadow-lg shadow-emerald-900/10 hover:bg-[#003d33] transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span className="font-bold text-sm">Nova requisição</span>
          </button>
        </div>
      </div>

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
            {filteredRequisitions.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-10 text-center text-sm text-slate-400">
                  Nenhuma requisição encontrada.
                </td>
              </tr>
            )}
            {filteredRequisitions.map((r) => {
              const meta = statusLabel(r.status);
              return (
                <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4 text-sm font-medium text-slate-700">
                    {(r.crd_code || 'CRD')} - {r.crd_name || 'Sem descrição'}
                    <span className="block text-xs font-normal text-slate-500">{r.sector_name || 'Sem setor'}</span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">
                    {r.provider_name || r.description || '—'}
                    {r.provider_name && r.description ? (
                      <span className="block text-xs font-normal text-slate-400 mt-0.5">{r.description}</span>
                    ) : null}
                  </td>
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
                      'text-[10px] font-bold px-2 py-1 rounded-lg uppercase tracking-wider',
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
              );
            })}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-lg max-h-[calc(100dvh-2rem)] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center shrink-0">
              <h3 className="text-xl font-bold text-slate-900">Nova requisição interna</h3>
              <button type="button" onClick={closeModal} className="text-slate-400 hover:text-slate-600 transition-colors">
                <Plus className="w-6 h-6 rotate-45" />
              </button>
            </div>

            <form onSubmit={createRequisition} className="flex flex-col min-h-0 flex-1">
              <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">CRD</label>
                  <SearchableSelect
                    value={form.crd_id}
                    onChange={(crd_id) => setForm((p) => ({ ...p, crd_id }))}
                    options={crdSelectOptions}
                    placeholder="Digite para buscar CRD..."
                    emptyMessage="Nenhum CRD disponível para os setores vinculados ao seu usuário."
                    noResultsMessage="Nenhum CRD encontrado"
                  />
                </div>

                {visibleCrds.length === 0 && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                    Nenhum CRD disponível para os setores vinculados ao seu usuário.
                  </p>
                )}

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Fornecedor</label>
                  <input
                    required
                    value={form.provider_name}
                    onChange={(e) => setForm((p) => ({ ...p, provider_name: e.target.value }))}
                    placeholder="Nome do fornecedor"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Data</label>
                    <input
                      required
                      type="date"
                      value={form.date}
                      onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Valor (R$)</label>
                    <input
                      required
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.amount}
                      onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Descrição (opcional)</label>
                  <input
                    value={form.description}
                    onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                    placeholder="Observação da requisição"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  />
                </div>
              </div>

              <div className="p-6 pt-4 border-t border-slate-100 flex gap-3 shrink-0 bg-white">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 px-4 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-3 bg-[#004D40] text-white font-bold rounded-xl hover:bg-[#003d33] shadow-lg shadow-emerald-900/10 transition-colors"
                >
                  Lançar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
