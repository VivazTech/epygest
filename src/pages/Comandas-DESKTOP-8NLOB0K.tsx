import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Archive, XCircle, BadgeCheck, RotateCcw } from 'lucide-react';
import { cn } from '../lib/utils';
import { confirmCancel } from '../lib/confirmAction';
import { useSearch } from '../context/SearchContext';
import { useToast } from '../context/ToastContext';
import { matchesSearch } from '../lib/search';

type ComandaItemForm = {
  description: string;
  quantity: string;
};

const emptyItem = (): ComandaItemForm => ({
  description: '',
  quantity: '',
});

const EMPTY_FORM = {
  consumer_name: '',
  provider_name: '',
  consumed_at: '',
  location: '',
  items: [emptyItem()],
};

export const ComandasPage: React.FC = () => {
  const { query } = useSearch();
  const { showSuccess } = useToast();
  const [comandas, setComandas] = useState<any[]>([]);
  const [pdvLocais, setPdvLocais] = useState<Array<{ id: number; name: string }>>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [userRole, setUserRole] = useState('viewer');
  const [actingSector, setActingSector] = useState<'requester' | 'controle' | 'financeiro'>('requester');
  const [form, setForm] = useState({ ...EMPTY_FORM, items: [emptyItem()] });
  const [showModal, setShowModal] = useState(false);

  const loadData = async () => {
    try {
      const [comandasRes, locaisRes] = await Promise.all([
        fetch('/api/comandas'),
        fetch('/api/pdv-locais'),
      ]);
      const data = await comandasRes.json().catch(() => null);
      const locais = await locaisRes.json().catch(() => null);

      if (Array.isArray(locais)) {
        setPdvLocais(locais.map((l: any) => ({ id: Number(l.id), name: String(l.name) })));
      } else {
        setPdvLocais([]);
      }

      if (!comandasRes.ok || !Array.isArray(data)) {
        const message =
          (data && typeof data === 'object' && 'error' in data && String((data as any).error)) ||
          'Não foi possível carregar as comandas.';
        console.error('Falha ao carregar comandas:', data);
        setLoadError(message);
        setComandas([]);
        return;
      }
      setLoadError(null);
      setComandas(data);
    } catch (error) {
      console.error('Falha ao carregar comandas:', error);
      setComandas([]);
      setPdvLocais([]);
    }
  };

  useEffect(() => {
    const loadUser = async () => {
      try {
        const res = await fetch('/api/auth/me');
        if (!res.ok) return;
        const user = await res.json();
        const role = String(user?.role || 'viewer');
        setUserRole(role);
        if (role === 'finance') setActingSector('financeiro');
        else if (role === 'controle') setActingSector('controle');
      } catch {
        // ignore
      }
    };
    loadUser();
    loadData();
  }, []);

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

  const addItem = () => {
    setForm((prev) => ({ ...prev, items: [...prev.items, emptyItem()] }));
  };

  const removeItem = (index: number) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.length <= 1 ? prev.items : prev.items.filter((_, i) => i !== index),
    }));
  };

  const updateItem = (index: number, patch: Partial<ComandaItemForm>) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    }));
  };

  const closeModal = () => {
    setShowModal(false);
    setForm({ ...EMPTY_FORM, items: [emptyItem()] });
  };

  const createComanda = async (e: React.FormEvent) => {
    e.preventDefault();

    const consumerName = form.consumer_name.trim();
    const providerName = form.provider_name.trim();
    const location = form.location.trim();
    if (!consumerName || !providerName || !form.consumed_at || !location) {
      alert('Preencha consumidor, fornecedor, data e local da comanda.');
      return;
    }
    if (!pdvLocais.some((l) => l.name === location)) {
      alert('Selecione um local PDV válido cadastrado em Configurações.');
      return;
    }

    for (let i = 0; i < form.items.length; i++) {
      const item = form.items[i];
      if (!item.description.trim() || !item.quantity) {
        alert(`Preencha descrição e quantidade do item ${i + 1}.`);
        return;
      }
      const quantity = Number(item.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        alert(`Quantidade inválida no item ${i + 1}.`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/comandas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          consumer_name: consumerName,
          provider_name: providerName,
          consumed_at: form.consumed_at,
          location,
          items: form.items.map((item) => ({
            description: item.description.trim(),
            quantity: Number(item.quantity),
          })),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Não foi possível registrar a comanda.');
        return;
      }

      showSuccess('Comanda registrada. Aguardando aprovação do Controle.');
      closeModal();
      loadData();
    } finally {
      setSubmitting(false);
    }
  };

  const updateStatus = async (id: number, status: 'open' | 'approved' | 'posted' | 'cancelled') => {
    if (status === 'cancelled' && !confirmCancel('esta comanda')) return;
    const res = await fetch(`/api/comandas/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.error || 'Não foi possível atualizar a comanda.');
      return;
    }
    loadData();
  };

  const filteredComandas = useMemo(
    () =>
      comandas.filter((comanda) =>
        matchesSearch(
          query,
          comanda.consumer_name,
          comanda.provider_name,
          comanda.location,
          comanda.consumed_at,
          comanda.user_name,
          comanda.status,
          comanda.items_count,
          ...(comanda.items ?? []).flatMap((item: any) => [item.description, item.quantity])
        )
      ),
    [comandas, query]
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Lançamento de Comanda</h2>
          <p className="text-slate-500 text-sm">
            Registre manualmente o consumo informando consumidor, data, local e itens consumidos.
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
            <span className="font-bold text-sm">Nova comanda</span>
          </button>
        </div>
      </div>

      {loadError && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {loadError}
          {loadError.includes('Reinicie') ? null : (
            <span className="block text-xs mt-1 text-amber-700">
              Se o problema persistir, reinicie o servidor com <code className="font-mono">npm run dev</code>.
            </span>
          )}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50/50">
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Consumidor</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Fornecedor</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Data / Local</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Vencimento</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Itens</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filteredComandas.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-10 text-center text-sm text-slate-400">
                  Nenhuma comanda registrada.
                </td>
              </tr>
            )}
            {filteredComandas.map((comanda) => {
              const meta = statusLabel(comanda.status);
              return (
                <tr key={comanda.id} className="hover:bg-slate-50/50 transition-colors align-top">
                  <td className="px-6 py-4 text-sm font-medium text-slate-800">
                    {comanda.consumer_name}
                    {comanda.user_name ? (
                      <span className="block text-[10px] font-normal text-slate-400 mt-0.5">
                        registrado por {comanda.user_name}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">{comanda.provider_name || '—'}</td>
                  <td className="px-6 py-4 text-sm text-slate-600">
                    <span className="font-medium text-slate-700">{comanda.consumed_at}</span>
                    <span className="block text-xs text-slate-500 mt-0.5">{comanda.location}</span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-400">—</td>
                  <td className="px-6 py-4 text-sm text-slate-600">
                    <ul className="space-y-1">
                      {(comanda.items ?? []).map((item: any) => (
                        <li key={item.id} className="text-xs">
                          <span className="font-medium text-slate-700">{item.description}</span>
                          <span className="text-slate-500"> · qtd. {item.quantity}</span>
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={cn(
                        'text-[10px] font-bold px-2 py-1 rounded-lg uppercase tracking-wider',
                        meta.classes
                      )}
                    >
                      {meta.label}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex justify-end gap-2">
                      {canApproveControl && comanda.status === 'open' && (
                        <>
                          <button
                            onClick={() => updateStatus(comanda.id, 'approved')}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Aprovar no Controle"
                          >
                            <BadgeCheck className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => updateStatus(comanda.id, 'cancelled')}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Reprovar"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        </>
                      )}
                      {canApproveControl && comanda.status === 'approved' && (
                        <button
                          onClick={() => updateStatus(comanda.id, 'open')}
                          className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                          title="Desaprovar"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                      )}
                      {canPayFinance && comanda.status === 'approved' && (
                        <button
                          onClick={() => updateStatus(comanda.id, 'posted')}
                          className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                          title="Registrar pagamento"
                        >
                          <Archive className="w-4 h-4" />
                        </button>
                      )}
                      {canCancelAsRequester && (comanda.status === 'open' || comanda.status === 'approved') && (
                        <button
                          onClick={() => updateStatus(comanda.id, 'cancelled')}
                          className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                          title="Cancelar comanda"
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
              <h3 className="text-xl font-bold text-slate-900">Nova comanda</h3>
              <button type="button" onClick={closeModal} className="text-slate-400 hover:text-slate-600 transition-colors">
                <Plus className="w-6 h-6 rotate-45" />
              </button>
            </div>

            <form onSubmit={createComanda} className="flex flex-col min-h-0 flex-1">
              <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Nome do consumidor</label>
                  <input
                    required
                    value={form.consumer_name}
                    onChange={(e) => setForm((p) => ({ ...p, consumer_name: e.target.value }))}
                    placeholder="Nome completo"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  />
                </div>

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
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Data do consumo</label>
                    <input
                      required
                      type="date"
                      value={form.consumed_at}
                      onChange={(e) => setForm((p) => ({ ...p, consumed_at: e.target.value }))}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Local do consumo</label>
                    <select
                      required
                      value={form.location}
                      onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    >
                      <option value="">
                        {pdvLocais.length === 0 ? 'Cadastre locais em Configurações' : 'Selecione o local'}
                      </option>
                      {pdvLocais.map((local) => (
                        <option key={local.id} value={local.name}>
                          {local.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {pdvLocais.length === 0 && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                    Nenhum local PDV ativo. Peça ao administrador para cadastrar em Configurações → Locais PDV.
                  </p>
                )}

                <div className="space-y-3 border-t border-slate-100 pt-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Itens consumidos</h4>
                      <p className="text-xs text-slate-500 mt-0.5">Informe descrição e quantidade de cada item.</p>
                    </div>
                    <button
                      type="button"
                      onClick={addItem}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      Adicionar item
                    </button>
                  </div>

                  <div className="space-y-3">
                    {form.items.map((item, index) => (
                      <div
                        key={index}
                        className="grid grid-cols-1 sm:grid-cols-[1fr_110px_auto] gap-3 items-end bg-slate-50/70 border border-slate-100 rounded-xl p-3"
                      >
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Item</label>
                          <input
                            required
                            value={item.description}
                            onChange={(e) => updateItem(index, { description: e.target.value })}
                            placeholder="Descrição do item"
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Qtd.</label>
                          <input
                            required
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={item.quantity}
                            onChange={(e) => updateItem(index, { quantity: e.target.value })}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() => removeItem(index)}
                          disabled={form.items.length <= 1}
                          className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-500"
                          title="Remover item"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
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
                  disabled={submitting}
                  className="flex-1 px-4 py-3 bg-[#004D40] text-white font-bold rounded-xl hover:bg-[#003d33] shadow-lg shadow-emerald-900/10 transition-colors disabled:opacity-70"
                >
                  {submitting ? 'Salvando...' : 'Lançar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
