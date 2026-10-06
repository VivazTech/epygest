import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Archive, XCircle, Trash2, BadgeCheck, RotateCcw, Upload, FileCheck, Paperclip, Pencil, History } from 'lucide-react';
import { cn, formatCurrency, formatDate } from '../lib/utils';
import { useSearch } from '../context/SearchContext';
import { useToast } from '../context/ToastContext';
import { matchesSearch } from '../lib/search';
import { isSharedCrdCode } from '../lib/sharedCrds';
import { isDirectDocumentUrl } from '../lib/storagePath';
import { confirmCancel, confirmDelete } from '../lib/confirmAction';
import { SearchableSelect } from '../components/SearchableSelect';
import { CrdListFilter } from '../components/CrdListFilter';
import {
  LaunchNumberAmountFilters,
  matchesAmountFilter,
  matchesInvoiceNumberFilter,
} from '../components/LaunchNumberAmountFilters';
import { buildCrdFilterOptions, matchesCrdCodeFilter } from '../lib/crdFilter';
import {
  canEditLaunchRole,
  isLaunchStatusEditableBeforeControl,
  launchStatusMeta,
  LAUNCH_STATUS_FILTER_OPTIONS,
  matchesDatePeriod,
} from '../lib/launchFlow';
import { hasPermission, type RolePermissionRow } from '../lib/permissionCatalog';

const EMPTY_FORM = {
  sector_id: '',
  crd_id: '',
  provider_name: '',
  issue_date: '',
  date: '',
  amount: '',
  description: '',
  file_path: '',
  file_name: '',
};

export const EstornosPage: React.FC = () => {
  const { query } = useSearch();
  const { showSuccess } = useToast();
  const [entries, setEntries] = useState<any[]>([]);
  const [sectors, setSectors] = useState<any[]>([]);
  const [crds, setCrds] = useState<any[]>([]);
  const [crdFilter, setCrdFilter] = useState('');
  const [invoiceNumberFilter, setInvoiceNumberFilter] = useState('');
  const [amountFilter, setAmountFilter] = useState('');
  const [sectorFilter, setSectorFilter] = useState('all');
  const [issueDateFrom, setIssueDateFrom] = useState('');
  const [issueDateTo, setIssueDateTo] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [userRole, setUserRole] = useState<string>('viewer');
  const [userPermissions, setUserPermissions] = useState<RolePermissionRow[] | null>(null);
  const [allowedSectorIds, setAllowedSectorIds] = useState<string[]>([]);
  const [grantedCrdIds, setGrantedCrdIds] = useState<string[]>([]);
  const [actingSector, setActingSector] = useState<'requester' | 'controle' | 'financeiro'>('requester');
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [uploadingFile, setUploadingFile] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<any | null>(null);
  const [historyEntry, setHistoryEntry] = useState<any | null>(null);
  const [historyRows, setHistoryRows] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    try {
      const [entriesRes, sectorsRes, crdsRes] = await Promise.all([
        fetch('/api/estornos'),
        fetch('/api/sectors'),
        fetch('/api/crds'),
      ]);
      const entriesData = await entriesRes.json().catch(() => null);
      const sectorsData = await sectorsRes.json().catch(() => null);
      const crdsData = await crdsRes.json().catch(() => null);
      setEntries(Array.isArray(entriesData) ? entriesData : []);
      setSectors(Array.isArray(sectorsData) ? sectorsData : []);
      setCrds(Array.isArray(crdsData) ? crdsData : []);
    } catch {
      setEntries([]);
      setSectors([]);
      setCrds([]);
    }
  };

  useEffect(() => {
    const bootstrapFromCache = () => {
      try {
        const raw = localStorage.getItem('user');
        if (!raw) return;
        const cached = JSON.parse(raw);
        const role = String(cached?.role || '').trim();
        if (role) {
          setUserRole(role);
          if (role === 'finance') setActingSector('financeiro');
          else if (role === 'controle') setActingSector('controle');
          else setActingSector('requester');
        }
        if (Array.isArray(cached?.permissions)) {
          setUserPermissions(cached.permissions);
        }
      } catch {
        // ignora cache inválido
      }
    };

    const loadUserScope = async () => {
      try {
        const res = await fetch('/api/auth/me');
        if (!res.ok) return;
        const user = await res.json();
        const role = String(user?.role || 'viewer');
        setUserRole(role);
        setUserPermissions(Array.isArray(user?.permissions) ? user.permissions : null);
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
        try {
          const prev = JSON.parse(localStorage.getItem('user') || '{}');
          localStorage.setItem(
            'user',
            JSON.stringify({ ...prev, ...user, role, permissions: user?.permissions ?? prev?.permissions })
          );
        } catch {
          // ok
        }
      } catch {
        // mantém escopo vazio
      }
    };

    bootstrapFromCache();
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
    hasPermission(userPermissions, 'estornos', 'create', userRole) &&
    (userRole !== 'admin' || actingSector === 'requester');
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
    if (hasGlobalSectorView) return true;
    if (allowedSectorIds.length === 0) return false;
    return allowedSectorIds.includes(String(sectorId ?? ''));
  };

  const canEditOpenLaunches = canEditLaunchRole(userRole);
  const canEditEntry = (entry: any) => {
    if (!canEditOpenLaunches) return false;
    if (!isLaunchStatusEditableBeforeControl(entry?.status)) return false;
    return matchesUserSector(entry?.sector_id);
  };

  const scopedEntries = useMemo(
    () => entries.filter((e) => matchesUserSector(e.sector_id)),
    [entries, allowedSectorIds, hasGlobalSectorView]
  );

  const createEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.sector_id || !form.provider_name.trim() || !form.issue_date || !form.date || !form.amount) {
      alert('Preencha setor, fornecedor, data de emissão, data de lançamento e valor.');
      return;
    }

    const payload = {
      sector_id: parseInt(form.sector_id, 10),
      crd_id: form.crd_id ? parseInt(form.crd_id, 10) : null,
      provider_name: form.provider_name.trim(),
      issue_date: form.issue_date,
      date: form.date,
      amount: parseFloat(form.amount),
      description: form.description || null,
      file_path: form.file_path || null,
      file_name: form.file_name || null,
    };

    const isEdit = Boolean(editingEntry?.id);
    setSubmitting(true);
    try {
      const res = await fetch(isEdit ? `/api/estornos/${editingEntry.id}` : '/api/estornos', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || (isEdit ? 'Não foi possível salvar a edição.' : 'Não foi possível registrar o estorno.'));
        return;
      }

      const saved = await res.json().catch(() => ({}));
      if (isEdit) {
        showSuccess('Estorno atualizado. A edição foi registrada no histórico.');
      } else {
        showSuccess(
          saved?.protocol
            ? `Estorno ${saved.protocol} criado. Aguardando aprovação do Controle.`
            : 'Estorno criado. Aguardando aprovação do Controle.'
        );
      }
      closeModal();
      loadData();
    } finally {
      setSubmitting(false);
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingEntry(null);
    setForm({ ...EMPTY_FORM });
  };

  const openCreateModal = () => {
    setEditingEntry(null);
    setForm({ ...EMPTY_FORM });
    setShowModal(true);
  };

  const openEditEntry = (entry: any) => {
    if (!canEditEntry(entry)) {
      alert(
        isLaunchStatusEditableBeforeControl(entry?.status)
          ? 'Apenas administrador ou gestor do setor pode editar este lançamento.'
          : 'Não é possível editar após a aprovação do Controle.'
      );
      return;
    }
    setEditingEntry(entry);
    setForm({
      sector_id: String(entry.sector_id || ''),
      crd_id: entry.crd_id ? String(entry.crd_id) : '',
      provider_name: String(entry.provider_name || ''),
      issue_date: String(entry.issue_date || '').slice(0, 10),
      date: String(entry.date || '').slice(0, 10),
      amount: entry.amount == null || entry.amount === '' ? '' : String(entry.amount),
      description: String(entry.description || ''),
      file_path: String(entry.file_path || ''),
      file_name: String(entry.file_name || ''),
    });
    setShowModal(true);
  };

  const openEditHistory = async (entry: any) => {
    setHistoryEntry(entry);
    setHistoryRows([]);
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/launch-edits/estorno/${entry.id}`);
      const data = await res.json().catch(() => []);
      if (!res.ok) {
        alert((data as any)?.error || 'Não foi possível carregar o histórico.');
        setHistoryEntry(null);
        return;
      }
      setHistoryRows(Array.isArray(data) ? data : []);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    setUploadingFile(true);
    try {
      const payload = new FormData();
      payload.append('file', file);
      const res = await fetch('/api/estornos/file', { method: 'POST', body: payload });
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
      const res = await fetch(`/api/estornos/${entry.id}/document-url`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.url) throw new Error(data?.error || 'Arquivo indisponível');
      window.open(data.url, '_blank', 'noopener');
    } catch (error: any) {
      alert(error.message || 'Não foi possível abrir o documento.');
    }
  };

  const updateStatus = async (id: number, status: 'open' | 'approved' | 'posted' | 'cancelled') => {
    if (status === 'cancelled' && !confirmCancel('este estorno')) return;
    const res = await fetch(`/api/estornos/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.error || 'Não foi possível atualizar o estorno.');
      return;
    }
    const messages: Record<string, string> = {
      approved: 'Estorno aprovado pelo Controle.',
      posted: 'Estorno recebido pelo Financeiro.',
      cancelled: 'Estorno cancelado.',
      open: userRole === 'manager' ? 'Estorno aprovado pelo gestor e enviado ao Controle.' : 'Estorno devolvido para análise.',
    };
    showSuccess(messages[status] || 'Status atualizado.');
    loadData();
  };

  const deleteEntry = async (entry: any) => {
    if (userRole !== 'admin') {
      alert('Apenas administradores podem excluir estornos.');
      return;
    }
    const label = entry.description
      ? `"${entry.description}"`
      : `estorno #${entry.id}`;
    if (!confirmDelete(label)) return;

    const res = await fetch(`/api/estornos/${entry.id}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.error || 'Não foi possível excluir o estorno.');
      return;
    }
    showSuccess('Estorno excluído com sucesso.');
    loadData();
  };

  const filteredEntries = useMemo(
    () =>
      scopedEntries.filter((entry) => {
        if (sectorFilter !== 'all' && String(entry.sector_id) !== String(sectorFilter)) return false;
        if (statusFilter !== 'all' && String(entry.status || '') !== statusFilter) return false;
        if (!matchesDatePeriod(entry.issue_date, issueDateFrom, issueDateTo)) return false;
        if (!matchesCrdCodeFilter(crdFilter, entry.crd_code, entry.crd_name)) return false;
        if (!matchesInvoiceNumberFilter(invoiceNumberFilter, entry.protocol, entry.description, entry.provider_name)) {
          return false;
        }
        if (!matchesAmountFilter(amountFilter, entry.amount)) return false;
        return matchesSearch(
          query,
          entry.protocol,
          entry.sector_name,
          entry.crd_code,
          entry.crd_name,
          entry.description,
          entry.provider_name,
          entry.file_name,
          entry.user_name,
          entry.issue_date,
          entry.date,
          entry.amount,
          entry.status
        );
      }),
    [
      scopedEntries,
      query,
      crdFilter,
      invoiceNumberFilter,
      amountFilter,
      sectorFilter,
      issueDateFrom,
      issueDateTo,
      statusFilter,
    ]
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

  const statusMeta = (status: string) => launchStatusMeta(status, 'Recebido');

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Estornos</h2>
          <p className="text-slate-500 text-sm">
            Fluxo: Solicitante lança o estorno → Controle aprova → Financeiro recebe. Lançamentos de estagiário passam antes pelo gestor do setor.
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
              onClick={openCreateModal}
              className="flex items-center gap-2 bg-[#004D40] text-white px-4 py-2.5 rounded-xl shadow-lg shadow-emerald-900/10 hover:bg-[#003d33] transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span className="font-bold text-sm">Novo estorno</span>
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Estornos em aberto / aprovados</p>
            <p className="text-xl font-extrabold text-amber-700 mt-1">
              −{formatCurrency(openTotal)}
            </p>
          </div>
          <p className="text-xs text-slate-400 max-w-md">
            O valor do estorno entra como crédito. Depois que o Financeiro recebe, o item sai da fila de pendentes.
          </p>
          <CrdListFilter value={crdFilter} onChange={setCrdFilter} options={crdFilterOptions} className="ml-auto" />
          <LaunchNumberAmountFilters
            invoiceNumber={invoiceNumberFilter}
            onInvoiceNumberChange={setInvoiceNumberFilter}
            amount={amountFilter}
            onAmountChange={setAmountFilter}
            numberLabel="Nº / protocolo"
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Setor</label>
            <select
              value={sectorFilter}
              onChange={(e) => setSectorFilter(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm"
            >
              <option value="all">Todos os setores</option>
              {visibleSectors.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Emissão de</label>
            <input
              type="date"
              value={issueDateFrom}
              onChange={(e) => setIssueDateFrom(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Emissão até</label>
            <input
              type="date"
              value={issueDateTo}
              min={issueDateFrom || undefined}
              onChange={(e) => setIssueDateTo(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm"
            >
              {LAUNCH_STATUS_FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50/50">
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Protocolo</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Setor / CRD</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Fornecedor</th>
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
                <td colSpan={10} className="px-6 py-10 text-center text-sm text-slate-400">
                  {crdFilter ? `Nenhum estorno com CRD ${crdFilter}.` : 'Nenhum estorno encontrado.'}
                </td>
              </tr>
            )}
            {filteredEntries.map((entry) => {
              const meta = statusMeta(entry.status);
              const edited = Number(entry.edit_count || 0) > 0;
              return (
                <tr key={entry.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4 text-xs font-mono font-bold text-emerald-800">
                    {entry.protocol || '—'}
                    {edited && (
                      <button
                        type="button"
                        onClick={() => openEditHistory(entry)}
                        className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-amber-700 hover:text-amber-900"
                        title="Ver histórico de edições"
                      >
                        <History className="w-3 h-3" />
                        Editado{Number(entry.edit_count) > 1 ? ` (${entry.edit_count}x)` : ''}
                      </button>
                    )}
                  </td>
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
                  <td className="px-6 py-4 text-sm text-slate-600">{entry.issue_date || '—'}</td>
                  <td className="px-6 py-4 text-sm text-slate-600">{entry.date}</td>
                  <td className="px-6 py-4 text-sm text-slate-400">—</td>
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
                    <span className="text-sm font-bold text-amber-700">−{formatCurrency(entry.amount)}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn('text-[10px] font-bold px-2 py-1 rounded-lg uppercase tracking-wider', meta.classes)}>
                      {meta.label}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex justify-end gap-2">
                      {canEditEntry(entry) && (
                        <button
                          onClick={() => openEditEntry(entry)}
                          className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                          title="Editar estorno"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      )}
                      {edited && (
                        <button
                          onClick={() => openEditHistory(entry)}
                          className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                          title="Histórico de edições"
                        >
                          <History className="w-4 h-4" />
                        </button>
                      )}
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
                          title="Receber (Financeiro)"
                        >
                          <Archive className="w-4 h-4" />
                        </button>
                      )}
                      {canCancelAsRequester && (entry.status === 'pending_manager' || entry.status === 'open' || entry.status === 'approved') && (
                        <button
                          onClick={() => updateStatus(entry.id, 'cancelled')}
                          className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                          title="Cancelar estorno"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      )}
                      {userRole === 'admin' && (
                        <button
                          onClick={() => deleteEntry(entry)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Excluir estorno definitivamente (apenas admin)"
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
              <h3 className="text-xl font-bold text-slate-900">
                {editingEntry ? `Editar estorno ${editingEntry.protocol || `#${editingEntry.id}`}` : 'Novo estorno'}
              </h3>
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

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Descrição (opcional)</label>
                  <input
                    value={form.description}
                    onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                    placeholder="Motivo do estorno"
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
                  disabled={uploadingFile || submitting}
                  className="flex-1 px-4 py-3 bg-[#004D40] text-white font-bold rounded-xl hover:bg-[#003d33] shadow-lg shadow-emerald-900/10 transition-colors disabled:opacity-70"
                >
                  {submitting ? 'Salvando...' : editingEntry ? 'Salvar edição' : 'Lançar estorno'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {historyEntry && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-lg max-h-[calc(100dvh-2rem)] rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center shrink-0">
              <div>
                <h3 className="text-xl font-bold text-slate-900">Histórico de edições</h3>
                <p className="text-sm text-slate-500 mt-0.5">
                  {historyEntry.protocol || `Estorno #${historyEntry.id}`}
                </p>
              </div>
              <button
                onClick={() => setHistoryEntry(null)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <Plus className="w-6 h-6 rotate-45" />
              </button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
              {historyLoading && <p className="text-sm text-slate-400">Carregando histórico...</p>}
              {!historyLoading && historyRows.length === 0 && (
                <p className="text-sm text-slate-400">Nenhuma edição registrada neste estorno.</p>
              )}
              {!historyLoading && historyRows.map((row) => (
                <div key={row.id} className="border border-slate-100 rounded-2xl p-4 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-bold text-slate-800">{row.editor_name || 'Usuário'}</p>
                    <p className="text-[11px] text-slate-400 whitespace-nowrap">
                      {row.created_at ? formatDate(row.created_at) : ''}
                    </p>
                  </div>
                  <ul className="space-y-1.5">
                    {(Array.isArray(row.changes) ? row.changes : []).map((change: any, idx: number) => {
                      const label = String(change.label || change.field || 'Campo');
                      const formatVal = (raw: unknown) => {
                        const value = String(raw ?? '').trim();
                        if (!value) return '—';
                        if (label === 'Valor') {
                          const n = Number(value);
                          return Number.isFinite(n) ? formatCurrency(n) : value;
                        }
                        if (label === 'Emissão' || label === 'Lançamento') {
                          try { return formatDate(value); } catch { return value; }
                        }
                        return value;
                      };
                      return (
                        <li key={`${row.id}-${idx}`} className="text-xs text-slate-600">
                          <span className="font-bold text-slate-700">{label}:</span>{' '}
                          <span className="text-slate-400 line-through">{formatVal(change.from)}</span>
                          {' → '}
                          <span className="font-semibold text-slate-800">{formatVal(change.to)}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
