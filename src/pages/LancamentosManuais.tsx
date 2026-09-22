import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Archive, XCircle, Trash2, BadgeCheck, RotateCcw, Upload, FileCheck, Paperclip } from 'lucide-react';
import { cn, formatCurrency, formatCurrencyInput, getCurrencyMeta, parseCurrencyInputDigits } from '../lib/utils';
import { ValueTrace } from '../components/ValueTrace';
import { valueTrace } from '../lib/valueTraceMeta';
import { useSearch } from '../context/SearchContext';
import { useToast } from '../context/ToastContext';
import { matchesSearch } from '../lib/search';
import { isSharedCrdCode } from '../lib/sharedCrds';
import { isDirectDocumentUrl } from '../lib/storagePath';
import { confirmCancel, confirmDelete } from '../lib/confirmAction';
import { SearchableSelect } from '../components/SearchableSelect';
import { CrdListFilter } from '../components/CrdListFilter';
import { buildCrdFilterOptions, matchesCrdCodeFilter } from '../lib/crdFilter';
import { launchStatusMeta } from '../lib/launchFlow';

const EMPTY_FORM = {
  sector_id: '',
  crd_id: '',
  provider_name: '',
  payment_method: '',
  currency: 'BRL',
  pix_key: '',
  issue_date: '',
  date: '',
  due_date: '',
  amount: '',
  description: '',
  file_path: '',
  file_name: '',
};

const FALLBACK_PAYMENT_METHODS = [
  { id: 'pix', key: 'pix', name: 'Pix', active: true },
  { id: 'boleto', key: 'boleto', name: 'Boleto', active: true },
  { id: 'cartao_credito', key: 'cartao_credito', name: 'Cartão de crédito', active: true },
  { id: 'dinheiro', key: 'dinheiro', name: 'Dinheiro', active: true },
];

export const LancamentosManuaisPage: React.FC = () => {
  const { query } = useSearch();
  const { showSuccess } = useToast();
  const [entries, setEntries] = useState<any[]>([]);
  const [sectors, setSectors] = useState<any[]>([]);
  const [crds, setCrds] = useState<any[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [currencies, setCurrencies] = useState<any[]>([]);
  const [crdFilter, setCrdFilter] = useState('');
  const [userRole, setUserRole] = useState<string>('viewer');
  const [allowedSectorIds, setAllowedSectorIds] = useState<string[]>([]);
  const [grantedCrdIds, setGrantedCrdIds] = useState<string[]>([]);
  const [actingSector, setActingSector] = useState<'requester' | 'controle' | 'financeiro'>('requester');
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [uploadingFile, setUploadingFile] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const currencyMeta = useMemo(
    () => getCurrencyMeta(form.currency || 'BRL'),
    [form.currency]
  );

  const activePaymentMethods = useMemo(
    () => {
      const source = paymentMethods.length > 0 ? paymentMethods : FALLBACK_PAYMENT_METHODS;
      return source.filter((pm) => pm.active !== false);
    },
    [paymentMethods]
  );

  const loadData = async () => {
    try {
      const [entriesRes, sectorsRes, crdsRes, pmRes, curRes] = await Promise.all([
        fetch('/api/manual-entries'),
        fetch('/api/sectors'),
        fetch('/api/crds'),
        fetch('/api/payment-methods'),
        fetch('/api/currencies'),
      ]);
      const entriesData = await entriesRes.json().catch(() => null);
      const sectorsData = await sectorsRes.json().catch(() => null);
      const crdsData = await crdsRes.json().catch(() => null);
      const pmData = await pmRes.json().catch(() => null);
      const curData = await curRes.json().catch(() => null);
      setEntries(Array.isArray(entriesData) ? entriesData : []);
      setSectors(Array.isArray(sectorsData) ? sectorsData : []);
      setCrds(Array.isArray(crdsData) ? crdsData : []);
      setPaymentMethods(Array.isArray(pmData) ? pmData : []);
      setCurrencies(Array.isArray(curData) ? curData : []);
    } catch {
      setEntries([]);
      setSectors([]);
      setCrds([]);
      setPaymentMethods([]);
      setCurrencies([]);
    }
  };

  useEffect(() => {
    const loadUserScope = async () => {
      try {
        const res = await fetch('/api/auth/me');
        if (!res.ok) return;
        const user = await res.json();
        const role = String(user?.role || 'viewer');
        setUserRole(role);
        if (role === 'finance') setActingSector('financeiro');
        else if (role === 'controle') setActingSector('controle');
        else setActingSector('requester');
        const ids = Array.from(
          new Set<string>(
            (Array.isArray(user?.sector_ids) ? user.sector_ids : [user?.sector_id])
              .map((id: unknown) => String(id ?? '').trim())
              .filter((id: string) => id !== '')
          )
        );
        setAllowedSectorIds(ids);
        setGrantedCrdIds(
          Array.from(
            new Set<string>(
              (Array.isArray(user?.crd_ids) ? user.crd_ids : [])
                .map((id: unknown) => String(id ?? '').trim())
                .filter((id: string) => id !== '')
            )
          )
        );
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
  const canApproveManager = userRole === 'manager' || userRole === 'admin';
  const canLaunch =
    userRole === 'manager' ||
    userRole === 'estagiario' ||
    (userRole === 'admin' && actingSector === 'requester');
  const canCancelAsRequester =
    actingSector === 'requester' &&
    (userRole === 'manager' || userRole === 'estagiario' || userRole === 'admin');

  const visibleSectors = useMemo(() => {
    if (hasGlobalSectorView && allowedSectorIds.length === 0) return sectors;
    if (allowedSectorIds.length === 0) return [];
    return sectors.filter((s) => allowedSectorIds.includes(String(s.id)));
  }, [sectors, allowedSectorIds, hasGlobalSectorView]);

  const visibleCrds = useMemo(() => {
    const active = crds.filter((c) => c.active !== false);
    if (!form.sector_id) return [];
    return active.filter(
      (c) =>
        String(c.sector_id) === form.sector_id ||
        isSharedCrdCode(c.code) ||
        grantedCrdIds.includes(String(c.id))
    );
  }, [crds, form.sector_id, grantedCrdIds]);

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
    if (
      !form.sector_id ||
      !form.provider_name.trim() ||
      !form.payment_method ||
      !form.currency ||
      !form.issue_date ||
      !form.date ||
      !form.due_date ||
      form.amount === ''
    ) {
      alert('Preencha setor, fornecedor, forma de pagamento, moeda, datas e valor.');
      return;
    }
    if (form.payment_method === 'pix' && !form.pix_key.trim()) {
      alert('Informe a chave Pix.');
      return;
    }

    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      alert('Informe um valor válido.');
      return;
    }

    const res = await fetch('/api/manual-entries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sector_id: parseInt(form.sector_id, 10),
        crd_id: form.crd_id ? parseInt(form.crd_id, 10) : null,
        provider_name: form.provider_name.trim(),
        payment_method: form.payment_method,
        currency: form.currency,
        pix_key: form.payment_method === 'pix' ? form.pix_key.trim() : null,
        issue_date: form.issue_date,
        date: form.date,
        due_date: form.due_date,
        amount,
        description: form.description || null,
        file_path: form.file_path || null,
        file_name: form.file_name || null,
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      alert(data.error || 'Não foi possível registrar o lançamento.');
      return;
    }

    const created = await res.json().catch(() => ({}));
    showSuccess(
      created?.protocol
        ? `Lançamento ${created.protocol} criado. Aguardando aprovação do Controle.`
        : 'Lançamento manual criado. Aguardando aprovação do Controle.'
    );
    closeModal();
    loadData();
  };

  const closeModal = () => {
    setShowModal(false);
    setForm({ ...EMPTY_FORM });
  };

  const handleFileUpload = async (file: File) => {
    setUploadingFile(true);
    try {
      const payload = new FormData();
      payload.append('file', file);
      const res = await fetch('/api/manual-entries/file', { method: 'POST', body: payload });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Não foi possível enviar o arquivo.');
      setForm((p) => ({
        ...p,
        file_path: data.file_path || '',
        file_name: data.file_name || file.name,
      }));
    } catch (error: any) {
      alert(error.message || 'Não foi possível enviar o arquivo.');
    } finally {
      setUploadingFile(false);
    }
  };

  const openEntryDocument = async (entry: any) => {
    const storedPath = String(entry?.file_path || '');
    if (storedPath && isDirectDocumentUrl(storedPath)) {
      window.open(storedPath, '_blank', 'noopener');
      return;
    }
    try {
      const res = await fetch(`/api/manual-entries/${entry.id}/document-url`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.url) throw new Error(data?.error || 'Arquivo indisponível');
      window.open(data.url, '_blank', 'noopener');
    } catch (error: any) {
      alert(error.message || 'Não foi possível abrir o documento.');
    }
  };

  const updateStatus = async (id: number, status: 'open' | 'approved' | 'posted' | 'cancelled') => {
    if (status === 'cancelled' && !confirmCancel('este lançamento manual')) return;
    const res = await fetch(`/api/manual-entries/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.error || 'Não foi possível atualizar o lançamento.');
      return;
    }
    const messages: Record<string, string> = {
      approved: 'Lançamento aprovado pelo Controle.',
      posted: 'Lançamento baixado pelo Financeiro.',
      cancelled: 'Lançamento cancelado.',
      open: userRole === 'manager' ? 'Aprovado pelo gestor e enviado ao Controle.' : 'Lançamento devolvido para análise.',
    };
    showSuccess(messages[status] || 'Status atualizado.');
    loadData();
  };

  const deleteEntry = async (entry: any) => {
    if (userRole !== 'admin') {
      alert('Apenas administradores podem excluir lançamentos manuais.');
      return;
    }
    const label = entry.description
      ? `"${entry.description}"`
      : `lançamento #${entry.id}`;
    if (!confirmDelete(label)) return;

    const res = await fetch(`/api/manual-entries/${entry.id}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.error || 'Não foi possível excluir o lançamento.');
      return;
    }
    showSuccess('Lançamento manual excluído com sucesso.');
    loadData();
  };

  const filteredEntries = useMemo(
    () =>
      scopedEntries.filter((entry) => {
        if (!matchesCrdCodeFilter(crdFilter, entry.crd_code, entry.crd_name)) return false;
        return matchesSearch(
          query,
          entry.protocol,
          entry.sector_name,
          entry.crd_code,
          entry.crd_name,
          entry.description,
          entry.provider_name,
          entry.payment_method,
          entry.currency,
          entry.pix_key,
          entry.file_name,
          entry.user_name,
          entry.issue_date,
          entry.date,
          entry.due_date,
          entry.amount,
          entry.status
        );
      }),
    [scopedEntries, query, crdFilter]
  );

  const openTotal = useMemo(
    () =>
      scopedEntries
        .filter((e) => e.status === 'pending_manager' || e.status === 'open' || e.status === 'approved')
        .reduce((sum, e) => sum + Number(e.amount || 0), 0),
    [scopedEntries]
  );

  const crdSelectOptions = useMemo(
    () =>
      visibleCrds.map((c) => ({
        value: String(c.id),
        label: `${c.code} - ${c.name}`,
        keywords: `${c.code} ${c.name}`,
      })),
    [visibleCrds]
  );

  const crdFilterOptions = useMemo(() => buildCrdFilterOptions(crds), [crds]);

  const statusMeta = (status: string) => launchStatusMeta(status, 'Baixado');

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Lançamentos Manuais</h2>
          <p className="text-slate-500 text-sm">
            Fluxo: Solicitante lança → Controle aprova → Financeiro baixa. Lançamentos de estagiário passam antes pelo gestor do setor.
          </p>
        </div>
        <div className="flex items-center gap-3 self-start">
          {canSwitchActingProfile && (
            <select
              value={actingSector}
              onChange={(e) => setActingSector(e.target.value as 'requester' | 'controle' | 'financeiro')}
              className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 shadow-sm"
              title="Perfil de atuação no fluxo"
            >
              <option value="requester">Atuar como Solicitante</option>
              <option value="controle">Atuar como Controle</option>
              <option value="financeiro">Atuar como Financeiro</option>
            </select>
          )}
          {canLaunch && (
            <button
              type="button"
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 bg-[#004D40] text-white px-4 py-2.5 rounded-xl shadow-lg shadow-emerald-900/10 hover:bg-[#003d33] transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span className="font-bold text-sm">Novo lançamento</span>
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-wrap items-end gap-4">
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Em aberto / aprovados (visíveis)</p>
          <p className="text-xl font-extrabold text-slate-900 mt-1">
            <ValueTrace
              displayValue={formatCurrency(openTotal)}
              meta={valueTrace.manualEntries.openTotal()}
            />
          </p>
        </div>
        <p className="text-xs text-slate-400 max-w-md">
          Compromisso orçamentário usa a data de lançamento. Após a baixa pelo Financeiro, o valor deixa de contar no pendente.
        </p>
        <CrdListFilter value={crdFilter} onChange={setCrdFilter} options={crdFilterOptions} className="ml-auto" />
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50/50">
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Protocolo</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Setor / CRD</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Fornecedor</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Pagamento</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Emissão</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Lançamento</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Vencimento</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Anexo</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Valor</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filteredEntries.length === 0 && (
              <tr>
                <td colSpan={11} className="px-6 py-10 text-center text-sm text-slate-400">
                  {crdFilter ? `Nenhum lançamento com CRD ${crdFilter}.` : 'Nenhum lançamento manual encontrado.'}
                </td>
              </tr>
            )}
            {filteredEntries.map((entry) => {
              const meta = statusMeta(entry.status);
              return (
                <tr key={entry.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4 text-xs font-mono font-bold text-emerald-800">{entry.protocol || '—'}</td>
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
                  <td className="px-6 py-4 text-sm text-slate-600">
                    {entry.provider_name || entry.description || '—'}
                    {entry.provider_name && entry.description ? (
                      <span className="block text-xs font-normal text-slate-400 mt-0.5">{entry.description}</span>
                    ) : null}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">
                    {paymentMethods.find((pm) => pm.key === entry.payment_method)?.name
                      || FALLBACK_PAYMENT_METHODS.find((pm) => pm.key === entry.payment_method)?.name
                      || entry.payment_method
                      || '—'}
                    {entry.payment_method === 'pix' && entry.pix_key ? (
                      <span className="block text-xs font-normal text-slate-400 mt-0.5 truncate max-w-[140px]" title={entry.pix_key}>
                        {entry.pix_key}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">{entry.issue_date || '—'}</td>
                  <td className="px-6 py-4 text-sm text-slate-600">{entry.date}</td>
                  <td className="px-6 py-4 text-sm text-slate-600">{entry.due_date || '—'}</td>
                  <td className="px-6 py-4">
                    {entry.file_path ? (
                      <button
                        type="button"
                        onClick={() => openEntryDocument(entry)}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 bg-blue-50 px-2 py-1 rounded-lg hover:bg-blue-100 transition-colors"
                        title={entry.file_name || 'Abrir anexo'}
                      >
                        <Paperclip className="w-3.5 h-3.5" />
                        <span className="max-w-[140px] truncate">{entry.file_name || 'Abrir'}</span>
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <ValueTrace
                      className="text-sm font-bold text-slate-900"
                      displayValue={formatCurrency(entry.amount, entry.currency || 'BRL')}
                      meta={valueTrace.manualEntries.amount(entry.id)}
                    />
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn('text-[10px] font-bold px-2 py-1 rounded-lg uppercase tracking-wider', meta.classes)}>
                      {meta.label}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex justify-end gap-2">
                      {canApproveManager && entry.status === 'pending_manager' && (
                        <>
                          <button
                            onClick={() => updateStatus(entry.id, 'open')}
                            className="p-2 text-violet-600 hover:bg-violet-50 rounded-lg transition-colors"
                            title="Aprovar (Gestor do setor)"
                          >
                            <BadgeCheck className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => updateStatus(entry.id, 'cancelled')}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Reprovar (Gestor)"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        </>
                      )}
                      {canApproveControl && entry.status === 'open' && (
                        <>
                          <button
                            onClick={() => updateStatus(entry.id, 'approved')}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Aprovar no Controle"
                          >
                            <BadgeCheck className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => updateStatus(entry.id, 'cancelled')}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Reprovar / cancelar"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        </>
                      )}
                      {canApproveControl && entry.status === 'approved' && (
                        <button
                          onClick={() => updateStatus(entry.id, 'open')}
                          className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                          title="Desaprovar e devolver"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                      )}
                      {canPayFinance && entry.status === 'approved' && (
                        <button
                          onClick={() => updateStatus(entry.id, 'posted')}
                          className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                          title="Baixar / pagar (Financeiro)"
                        >
                          <Archive className="w-4 h-4" />
                        </button>
                      )}
                      {canCancelAsRequester && (entry.status === 'pending_manager' || entry.status === 'open' || entry.status === 'approved') && (
                        <button
                          onClick={() => updateStatus(entry.id, 'cancelled')}
                          className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                          title="Cancelar lançamento"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      )}
                      {userRole === 'admin' && (
                        <button
                          onClick={() => deleteEntry(entry)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Excluir lançamento definitivamente (apenas admin)"
                        >
                          <Trash2 className="w-4 h-4" />
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
              <h3 className="text-xl font-bold text-slate-900">Novo lançamento manual</h3>
              <button type="button" onClick={closeModal} className="text-slate-400 hover:text-slate-600 transition-colors">
                <Plus className="w-6 h-6 rotate-45" />
              </button>
            </div>

            <form onSubmit={createEntry} className="flex flex-col min-h-0 flex-1">
              <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Setor responsável</label>
                  <select
                    required
                    value={form.sector_id}
                    onChange={(e) => setForm((p) => ({ ...p, sector_id: e.target.value, crd_id: '' }))}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  >
                    <option value="">Selecione um setor</option>
                    {visibleSectors.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                {visibleSectors.length === 0 && (
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                    Nenhum setor disponível para os vínculos do seu usuário.
                  </p>
                )}

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">CRD (opcional)</label>
                  <SearchableSelect
                    value={form.crd_id}
                    onChange={(crd_id) => setForm((p) => ({ ...p, crd_id }))}
                    options={crdSelectOptions}
                    disabled={!form.sector_id}
                    placeholder={form.sector_id ? 'Digite para buscar CRD...' : 'Selecione um setor primeiro'}
                    emptyMessage={form.sector_id ? 'Nenhum CRD neste setor' : 'Selecione um setor primeiro'}
                    noResultsMessage="Nenhum CRD encontrado"
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
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Forma de pagamento</label>
                    <select
                      required
                      value={form.payment_method}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          payment_method: e.target.value,
                          pix_key: e.target.value === 'pix' ? p.pix_key : '',
                        }))
                      }
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    >
                      <option value="">Selecione</option>
                      {activePaymentMethods.map((pm) => (
                        <option key={pm.id} value={pm.key}>{pm.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Moeda</label>
                    <select
                      required
                      value={form.currency}
                      onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value }))}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    >
                      <option value="">Selecione</option>
                      {currencies.filter((c) => c.active !== false).map((c) => (
                        <option key={c.id} value={c.key}>{c.key} — {c.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {form.payment_method === 'pix' && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Chave Pix</label>
                    <input
                      required
                      value={form.pix_key}
                      onChange={(e) => setForm((p) => ({ ...p, pix_key: e.target.value }))}
                      placeholder="CPF/CNPJ, e-mail, telefone ou chave aleatória"
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    />
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Data de emissão</label>
                    <input
                      required
                      type="date"
                      value={form.issue_date}
                      onChange={(e) => setForm((p) => ({ ...p, issue_date: e.target.value }))}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Data de lançamento</label>
                    <input
                      required
                      type="date"
                      value={form.date}
                      onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Data de vencimento</label>
                    <input
                      required
                      type="date"
                      value={form.due_date}
                      onChange={(e) => setForm((p) => ({ ...p, due_date: e.target.value }))}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Valor ({currencyMeta.symbol})
                  </label>
                  <div className="flex">
                    <span className="shrink-0 inline-flex items-center px-3 rounded-l-xl border border-r-0 border-slate-200 bg-slate-100 text-sm font-bold text-slate-600">
                      {currencyMeta.symbol}
                    </span>
                    <input
                      required
                      type="text"
                      inputMode="decimal"
                      value={formatCurrencyInput(form.amount, form.currency)}
                      onChange={(e) =>
                        setForm((p) => ({
                          ...p,
                          amount: parseCurrencyInputDigits(e.target.value, p.currency),
                        }))
                      }
                      placeholder={formatCurrencyInput(0, form.currency)}
                      className="w-full min-w-0 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-r-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Descrição (opcional)</label>
                  <input
                    value={form.description}
                    onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                    placeholder="Observação do lançamento"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Anexo</label>
                  <label
                    className={cn(
                      'flex items-center justify-center gap-2 w-full px-4 py-3 border border-dashed rounded-xl text-sm cursor-pointer transition-colors',
                      uploadingFile
                        ? 'bg-slate-50 border-slate-300 text-slate-600'
                        : form.file_path
                          ? 'bg-sky-50 border-sky-300 text-sky-800 hover:bg-sky-100'
                          : 'bg-slate-50 border-slate-300 text-slate-600 hover:bg-slate-100'
                    )}
                    title={form.file_name || undefined}
                  >
                    {form.file_path && !uploadingFile ? (
                      <FileCheck className="w-4 h-4 shrink-0 text-sky-600" />
                    ) : (
                      <Upload className="w-4 h-4 shrink-0" />
                    )}
                    <span className="truncate">
                      {uploadingFile
                        ? 'Enviando arquivo...'
                        : form.file_name
                          ? form.file_name
                          : 'Anexar arquivo (PDF, imagem, Excel ou Word)'}
                    </span>
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.webp,.xls,.xlsx,.doc,.docx,application/pdf,image/*"
                      className="hidden"
                      disabled={uploadingFile}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileUpload(file);
                        e.target.value = '';
                      }}
                    />
                  </label>
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
                  disabled={uploadingFile}
                  className="flex-1 px-4 py-3 bg-[#004D40] text-white font-bold rounded-xl hover:bg-[#003d33] shadow-lg shadow-emerald-900/10 transition-colors disabled:opacity-70"
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
