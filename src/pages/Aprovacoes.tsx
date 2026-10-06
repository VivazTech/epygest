import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  BadgeCheck,
  Paperclip,
  RotateCcw,
  XCircle,
  Upload,
  FileCheck,
} from 'lucide-react';
import { cn, formatCurrency, formatDate } from '../lib/utils';
import { useSearch } from '../context/SearchContext';
import { useToast } from '../context/ToastContext';
import { matchesSearch } from '../lib/search';
import {
  LaunchNumberAmountFilters,
  matchesAmountFilter,
  matchesInvoiceNumberFilter,
} from '../components/LaunchNumberAmountFilters';
import { isDirectDocumentUrl } from '../lib/storagePath';
import { confirmCancel } from '../lib/confirmAction';
import {
  APROVACAO_TIPOS,
  DIRETORIA_AMOUNT_THRESHOLD,
  DIRETORIA_APPROVAL_ENFORCED,
  exceedsDiretoriaThreshold,
  type AprovacaoActingSector,
  type AprovacaoItem,
  isPendingForRole,
  statusMeta,
  tipoBadgeClass,
  tipoLabel,
} from '../lib/aprovacoesMeta';

export const AprovacoesPage: React.FC = () => {
  const { query } = useSearch();
  const { showSuccess } = useToast();
  const [items, setItems] = useState<AprovacaoItem[]>([]);
  const [sectors, setSectors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState('viewer');
  const [allowedSectorIds, setAllowedSectorIds] = useState<string[]>([]);
  const [actingSector, setActingSector] = useState<AprovacaoActingSector>('controle');
  const [viewTab, setViewTab] = useState<'geral' | 'diretoria'>('geral');
  const [typeFilter, setTypeFilter] = useState('all');
  const [sectorFilter, setSectorFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('pending');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [invoiceNumberFilter, setInvoiceNumberFilter] = useState('');
  const [amountFilter, setAmountFilter] = useState('');
  const [receiptModal, setReceiptModal] = useState<{ id: number; type: 'nota' | 'danfe' } | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);

  const canSwitchActingProfile = userRole === 'admin';
  const canApproveControl =
    actingSector === 'controle' && (userRole === 'controle' || userRole === 'admin');
  const canPayFinance =
    actingSector === 'financeiro' && (userRole === 'finance' || userRole === 'admin');
  // Admin aprova etapa do gestor mesmo sem trocar o seletor; gestor só no perfil Gestor.
  const canApproveManager =
    userRole === 'admin' || (actingSector === 'gestor' && userRole === 'manager');
  // Futuro: quando DIRETORIA_APPROVAL_ENFORCED = true, habilitar botões de aprovação da Diretoria.
  const canApproveDiretoria =
    DIRETORIA_APPROVAL_ENFORCED &&
    actingSector === 'diretoria' &&
    (userRole === 'diretoria' || userRole === 'admin');
  void canApproveDiretoria;

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (typeFilter !== 'all') params.set('type', typeFilter);
      if (sectorFilter !== 'all') params.set('sector_id', sectorFilter);
      if (dateFrom) params.set('from', dateFrom);
      if (dateTo) params.set('to', dateTo);
      if (statusFilter !== 'all') params.set('status', statusFilter);

      const [aprovRes, sectorsRes] = await Promise.all([
        fetch(`/api/aprovacoes?${params.toString()}`),
        fetch('/api/sectors'),
      ]);
      const data = await aprovRes.json().catch(() => ({}));
      const sectorsData = await sectorsRes.json().catch(() => []);
      setItems(Array.isArray(data?.items) ? data.items : []);
      setSectors(Array.isArray(sectorsData) ? sectorsData : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [typeFilter, sectorFilter, dateFrom, dateTo, statusFilter]);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const res = await fetch('/api/auth/me');
        if (!res.ok) return;
        const user = await res.json();
        const role = String(user?.role || 'viewer');
        setUserRole(role);
        const sectorIds = Array.from(
          new Set<string>(
            (Array.isArray(user?.sector_ids) ? user.sector_ids : [user?.sector_id])
              .map((id: unknown) => String(id ?? '').trim())
              .filter((id: string) => id !== '')
          )
        );
        setAllowedSectorIds(sectorIds);
        if (role === 'finance') setActingSector('financeiro');
        else if (role === 'manager') setActingSector('gestor');
        else if (role === 'diretoria') {
          setActingSector('diretoria');
          setViewTab('diretoria');
        } else setActingSector('controle');
      } catch {
        // ignore
      }
    };
    loadUser();
  }, []);

  const visibleSectors = useMemo(() => {
    if (userRole === 'manager' && allowedSectorIds.length > 0) {
      return sectors.filter((s) => allowedSectorIds.includes(String(s.id)));
    }
    return sectors;
  }, [sectors, userRole, allowedSectorIds]);

  useEffect(() => {
    if (userRole !== 'manager' || allowedSectorIds.length === 0) return;
    if (sectorFilter !== 'all' && !allowedSectorIds.includes(String(sectorFilter))) {
      setSectorFilter('all');
    }
  }, [userRole, allowedSectorIds, sectorFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const scopedItems = useMemo(() => {
    if (viewTab !== 'diretoria') return items;
    return items.filter((item) => exceedsDiretoriaThreshold(item.amount));
  }, [items, viewTab]);

  const filteredItems = useMemo(
    () =>
      scopedItems.filter((item) => {
        if (
          !matchesInvoiceNumberFilter(
            invoiceNumberFilter,
            item.invoice_number,
            item.protocol,
            item.subtitle,
            item.title,
            item.description
          )
        ) {
          return false;
        }
        if (!matchesAmountFilter(amountFilter, item.amount)) return false;
        return matchesSearch(
          query,
          tipoLabel(item.type),
          item.title,
          item.subtitle,
          item.protocol,
          item.invoice_number,
          item.description,
          item.sector_name,
          item.crd_code,
          item.crd_name,
          item.user_name,
          item.fornecedor,
          item.vencimento,
          item.reference_date,
          item.issue_date,
          item.amount,
          item.status
        );
      }),
    [scopedItems, query, invoiceNumberFilter, amountFilter]
  );

  const metrics = useMemo(() => {
    const base = scopedItems;
    const pendingGestor = base.filter((i) => isPendingForRole(i, 'gestor')).length;
    const pendingControle = base.filter((i) => isPendingForRole(i, 'controle')).length;
    const pendingFinanceiro = base.filter((i) => isPendingForRole(i, 'financeiro')).length;
    const pendingDiretoria = base.filter((i) => exceedsDiretoriaThreshold(i.amount)).length;
    const totalValor = base.reduce((sum, i) => {
      const value = Number(i.amount) || 0;
      return sum + (i.type === 'estorno' ? -value : value);
    }, 0);
    return {
      pendingGestor,
      pendingControle,
      pendingFinanceiro,
      pendingDiretoria,
      totalValor,
      total: base.length,
    };
  }, [scopedItems]);

  const diretoriaCount = useMemo(
    () => items.filter((i) => exceedsDiretoriaThreshold(i.amount)).length,
    [items]
  );

  const updateManualStatus = async (id: number, status: 'open' | 'approved' | 'posted' | 'cancelled') => {
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
    showSuccess(
      status === 'open' && actingSector === 'gestor'
        ? 'Lançamento aprovado pelo gestor e enviado ao Controle.'
        : 'Lançamento manual atualizado.'
    );
    loadData();
  };

  const updateEstornoStatus = async (id: number, status: 'open' | 'approved' | 'posted' | 'cancelled') => {
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
      open: actingSector === 'gestor' ? 'Estorno aprovado pelo gestor e enviado ao Controle.' : 'Estorno devolvido para análise.',
    };
    showSuccess(messages[status] || 'Estorno atualizado.');
    loadData();
  };

  const updateFlowStatus = async (
    type: 'comanda' | 'requisicao' | 'mensalidade',
    id: number,
    status: 'open' | 'approved' | 'posted' | 'cancelled'
  ) => {
    if (status === 'cancelled' && !confirmCancel(
      type === 'comanda' ? 'esta comanda' : type === 'requisicao' ? 'esta requisição' : 'este pagamento de mensalidade'
    )) return;
    const endpoint =
      type === 'comanda'
        ? `/api/comandas/${id}/status`
        : type === 'requisicao'
          ? `/api/requisitions/${id}/status`
          : `/api/contrato-lancamentos/${id}/status`;
    const res = await fetch(endpoint, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.error || 'Não foi possível atualizar.');
      return;
    }
    const messages: Record<string, string> = {
      approved: 'Lançamento aprovado pelo Controle.',
      posted: 'Pagamento registrado pelo Financeiro.',
      cancelled: 'Lançamento cancelado.',
      open: actingSector === 'gestor' ? 'Aprovado pelo gestor e enviado ao Controle.' : 'Lançamento devolvido para análise.',
    };
    showSuccess(messages[status] || 'Lançamento atualizado.');
    loadData();
  };

  const renderFlowActions = (type: 'comanda' | 'requisicao' | 'mensalidade', item: AprovacaoItem) => (
    <>
      {canApproveManager && item.status === 'pending_manager' && (
        <>
          <button
            onClick={() => updateFlowStatus(type, item.source_id, 'open')}
            className="p-2 text-violet-600 hover:bg-violet-50 rounded-lg transition-colors"
            title="Aprovar (Gestor do setor)"
          >
            <BadgeCheck className="w-4 h-4" />
          </button>
          <button
            onClick={() => updateFlowStatus(type, item.source_id, 'cancelled')}
            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            title="Reprovar"
          >
            <XCircle className="w-4 h-4" />
          </button>
        </>
      )}
      {canApproveControl && item.status === 'open' && (
        <>
          <button
            onClick={() => updateFlowStatus(type, item.source_id, 'approved')}
            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title="Aprovar (Controle)"
          >
            <BadgeCheck className="w-4 h-4" />
          </button>
          <button
            onClick={() => updateFlowStatus(type, item.source_id, 'cancelled')}
            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            title="Reprovar"
          >
            <XCircle className="w-4 h-4" />
          </button>
        </>
      )}
      {canApproveControl && item.status === 'approved' && (
        <button
          onClick={() => updateFlowStatus(type, item.source_id, 'open')}
          className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
          title="Desaprovar"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      )}
      {canPayFinance && item.status === 'approved' && (
        <button
          onClick={() => updateFlowStatus(type, item.source_id, 'posted')}
          className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
          title="Registrar pagamento"
        >
          <Archive className="w-4 h-4" />
        </button>
      )}
    </>
  );

  const runInvoiceFlow = async (
    id: number,
    action: 'approve_manager' | 'reject_manager' | 'approve_control' | 'reject_control' | 'disapprove_control' | 'mark_paid',
    paymentReceiptPath?: string
  ) => {
    if ((action === 'reject_control' || action === 'reject_manager') && !confirmCancel(
      action === 'reject_manager' ? 'esta nota (reprovação pelo gestor)' : 'esta nota (reprovação pelo Controle)'
    )) return false;
    if (action === 'disapprove_control' && !window.confirm('Desaprovar esta nota e devolvê-la para análise do setor solicitante?')) {
      return false;
    }
    const res = await fetch(`/api/invoices/${id}/flow`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        actorSector:
          actingSector === 'gestor' ? 'GESTOR' : actingSector === 'controle' ? 'CONTROLE' : 'FINANCEIRO',
        payment_receipt_path: paymentReceiptPath,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.error || 'Não foi possível atualizar a nota.');
      return false;
    }
    showSuccess('Nota atualizada com sucesso.');
    return true;
  };

  const openAttachedDocument = async (item: AprovacaoItem) => {
    const storedPath = String(item.file_path || '');
    if (storedPath && isDirectDocumentUrl(storedPath)) {
      window.open(storedPath, '_blank', 'noopener');
      return;
    }
    const endpoint =
      item.type === 'estorno'
        ? `/api/estornos/${item.source_id}/document-url`
        : `/api/manual-entries/${item.source_id}/document-url`;
    try {
      const res = await fetch(endpoint);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.url) throw new Error(data?.error || 'Arquivo indisponível');
      window.open(data.url, '_blank', 'noopener');
    } catch (error: any) {
      alert(error.message || 'Não foi possível abrir o documento.');
    }
  };

  const handlePayInvoice = async () => {
    if (!receiptModal) return;
    setUploadingReceipt(true);
    try {
      let receiptPath: string | undefined;
      if (receiptFile) {
        const payload = new FormData();
        payload.append('receipt_file', receiptFile);
        const uploadRes = await fetch('/api/invoices/receipt', { method: 'POST', body: payload });
        const uploadData = await uploadRes.json().catch(() => ({}));
        if (!uploadRes.ok) throw new Error(uploadData.error || 'Falha ao enviar comprovante.');
        receiptPath = uploadData.file_path;
      }
      const ok = await runInvoiceFlow(receiptModal.id, 'mark_paid', receiptPath);
      if (ok) {
        setReceiptModal(null);
        setReceiptFile(null);
        loadData();
      }
    } catch (error: any) {
      alert(error.message || 'Não foi possível registrar o pagamento.');
    } finally {
      setUploadingReceipt(false);
    }
  };

  const renderActions = (item: AprovacaoItem) => {
    const waitingManager =
      item.type === 'nota' || item.type === 'danfe'
        ? (item.flow_stage || '') === 'manager_pending'
        : item.status === 'pending_manager';

    if (waitingManager && !canApproveManager) {
      return (
        <span className="text-[10px] text-slate-400 font-medium text-right max-w-[130px] leading-snug">
          {canSwitchActingProfile
            ? 'Troque para “Atuar como Gestor”'
            : 'Aguardando gestor do setor'}
        </span>
      );
    }

    if (item.type === 'manual') {
      return (
        <>
          {canApproveManager && item.status === 'pending_manager' && (
            <>
              <button
                onClick={() => updateManualStatus(item.source_id, 'open')}
                className="p-2 text-violet-600 hover:bg-violet-50 rounded-lg transition-colors"
                title="Aprovar (Gestor do setor)"
              >
                <BadgeCheck className="w-4 h-4" />
              </button>
              <button
                onClick={() => updateManualStatus(item.source_id, 'cancelled')}
                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                title="Reprovar"
              >
                <XCircle className="w-4 h-4" />
              </button>
            </>
          )}
          {canApproveControl && item.status === 'open' && (
            <>
              <button
                onClick={() => updateManualStatus(item.source_id, 'approved')}
                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                title="Aprovar (Controle)"
              >
                <BadgeCheck className="w-4 h-4" />
              </button>
              <button
                onClick={() => updateManualStatus(item.source_id, 'cancelled')}
                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                title="Reprovar"
              >
                <XCircle className="w-4 h-4" />
              </button>
            </>
          )}
          {canApproveControl && item.status === 'approved' && (
            <button
              onClick={() => updateManualStatus(item.source_id, 'open')}
              className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
              title="Desaprovar"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
          {canPayFinance && item.status === 'approved' && (
            <button
              onClick={() => updateManualStatus(item.source_id, 'posted')}
              className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
              title="Baixar (Financeiro)"
            >
              <Archive className="w-4 h-4" />
            </button>
          )}
        </>
      );
    }

    if (item.type === 'estorno') {
      return (
        <>
          {canApproveManager && item.status === 'pending_manager' && (
            <>
              <button
                onClick={() => updateEstornoStatus(item.source_id, 'open')}
                className="p-2 text-violet-600 hover:bg-violet-50 rounded-lg transition-colors"
                title="Aprovar (Gestor do setor)"
              >
                <BadgeCheck className="w-4 h-4" />
              </button>
              <button
                onClick={() => updateEstornoStatus(item.source_id, 'cancelled')}
                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                title="Reprovar"
              >
                <XCircle className="w-4 h-4" />
              </button>
            </>
          )}
          {canApproveControl && item.status === 'open' && (
            <>
              <button
                onClick={() => updateEstornoStatus(item.source_id, 'approved')}
                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                title="Aprovar (Controle)"
              >
                <BadgeCheck className="w-4 h-4" />
              </button>
              <button
                onClick={() => updateEstornoStatus(item.source_id, 'cancelled')}
                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                title="Reprovar"
              >
                <XCircle className="w-4 h-4" />
              </button>
            </>
          )}
          {canApproveControl && item.status === 'approved' && (
            <button
              onClick={() => updateEstornoStatus(item.source_id, 'open')}
              className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
              title="Desaprovar"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
          {canPayFinance && item.status === 'approved' && (
            <button
              onClick={() => updateEstornoStatus(item.source_id, 'posted')}
              className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
              title="Receber (Financeiro)"
            >
              <Archive className="w-4 h-4" />
            </button>
          )}
        </>
      );
    }

    if (item.type === 'nota' || item.type === 'danfe') {
      const flow = item.flow_stage || 'control_pending';
      return (
        <>
          {canApproveManager && flow === 'manager_pending' && (
            <>
              <button
                onClick={() => runInvoiceFlow(item.source_id, 'approve_manager').then((ok) => { if (ok) return loadData(); })}
                className="p-2 text-violet-600 hover:bg-violet-50 rounded-lg transition-colors"
                title="Aprovar (Gestor do setor)"
              >
                <BadgeCheck className="w-4 h-4" />
              </button>
              <button
                onClick={() => runInvoiceFlow(item.source_id, 'reject_manager').then((ok) => { if (ok) return loadData(); })}
                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                title="Reprovar"
              >
                <XCircle className="w-4 h-4" />
              </button>
            </>
          )}
          {canApproveControl && flow === 'control_pending' && (
            <>
              <button
                onClick={() => runInvoiceFlow(item.source_id, 'approve_control').then((ok) => { if (ok) return loadData(); })}
                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                title="Aprovar (Controle)"
              >
                <BadgeCheck className="w-4 h-4" />
              </button>
              <button
                onClick={() => runInvoiceFlow(item.source_id, 'reject_control').then((ok) => { if (ok) return loadData(); })}
                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                title="Reprovar"
              >
                <XCircle className="w-4 h-4" />
              </button>
            </>
          )}
          {canApproveControl && flow === 'control_approved' && (
            <button
              onClick={() => runInvoiceFlow(item.source_id, 'disapprove_control').then((ok) => { if (ok) return loadData(); })}
              className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
              title="Desaprovar"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
          {canPayFinance && flow === 'control_approved' && (
            <button
              onClick={() =>
                setReceiptModal({
                  id: item.source_id,
                  type: item.type === 'danfe' ? 'danfe' : 'nota',
                })
              }
              className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
              title="Registrar pagamento"
            >
              <Archive className="w-4 h-4" />
            </button>
          )}
        </>
      );
    }

    if (item.type === 'comanda') return renderFlowActions('comanda', item);
    if (item.type === 'requisicao') return renderFlowActions('requisicao', item);
    if (item.type === 'mensalidade') return renderFlowActions('mensalidade', item);

    return null;
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Aprovações</h2>
          <p className="text-slate-500 text-sm">
            Visão unificada. Lançamentos de estagiário aguardam o gestor do setor antes do Controle.
          </p>
        </div>
        {canSwitchActingProfile && (
          <select
            value={actingSector}
            onChange={(e) => setActingSector(e.target.value as AprovacaoActingSector)}
            className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 shadow-sm self-start"
          >
            <option value="gestor">Atuar como Gestor</option>
            <option value="controle">Atuar como Controle</option>
            <option value="financeiro">Atuar como Financeiro</option>
            <option value="diretoria">Atuar como Diretoria</option>
          </select>
        )}
      </div>

      <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1 gap-1">
        <button
          type="button"
          onClick={() => setViewTab('geral')}
          className={cn(
            'px-4 py-2 text-sm font-semibold rounded-lg transition-colors',
            viewTab === 'geral' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          )}
        >
          Geral
        </button>
        <button
          type="button"
          onClick={() => setViewTab('diretoria')}
          className={cn(
            'px-4 py-2 text-sm font-semibold rounded-lg transition-colors inline-flex items-center gap-2',
            viewTab === 'diretoria' ? 'bg-white text-cyan-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          )}
        >
          Diretoria
          <span
            className={cn(
              'text-[10px] font-bold px-1.5 py-0.5 rounded-md',
              viewTab === 'diretoria' ? 'bg-cyan-100 text-cyan-800' : 'bg-slate-200 text-slate-600'
            )}
          >
            {diretoriaCount}
          </span>
        </button>
      </div>

      {viewTab === 'diretoria' && (
        <div className="rounded-2xl border border-cyan-100 bg-cyan-50/70 px-4 py-3 text-sm text-cyan-900">
          <p className="font-semibold">
            Lançamentos acima de {formatCurrency(DIRETORIA_AMOUNT_THRESHOLD)}
          </p>
          <p className="text-cyan-800/90 mt-0.5">
            Exibe valores a partir de {formatCurrency(DIRETORIA_AMOUNT_THRESHOLD + 0.01)}. O fluxo de
            aprovação continua o de sempre (Controle → Financeiro). Em breve, estes itens também
            precisarão da aprovação da Diretoria antes do pagamento.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Pendentes Gestor</p>
          <p className="text-2xl font-extrabold text-violet-700 mt-1">{metrics.pendingGestor}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Pendentes Controle</p>
          <p className="text-2xl font-extrabold text-orange-600 mt-1">{metrics.pendingControle}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            {viewTab === 'diretoria' ? 'Acima de R$ 800' : 'Pendentes Financeiro'}
          </p>
          <p className={cn('text-2xl font-extrabold mt-1', viewTab === 'diretoria' ? 'text-cyan-700' : 'text-blue-600')}>
            {viewTab === 'diretoria' ? metrics.pendingDiretoria : metrics.pendingFinanceiro}
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Itens listados</p>
          <p className="text-2xl font-extrabold text-slate-900 mt-1">{metrics.total}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Valor total</p>
          <p className="text-2xl font-extrabold text-slate-900 mt-1">{formatCurrency(metrics.totalValor)}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 grid grid-cols-1 md:grid-cols-5 gap-3">
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm"
        >
          {APROVACAO_TIPOS.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <select
          value={sectorFilter}
          onChange={(e) => setSectorFilter(e.target.value)}
          className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm"
        >
          <option value="all">Todos os setores</option>
          {visibleSectors.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm"
        >
          <option value="all">Todos os status</option>
          <option value="pending">Pendentes</option>
          <option value="done">Concluídos</option>
          <option value="cancelled">Cancelados / encerrados</option>
        </select>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm"
          title="Data inicial"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm"
          title="Data final"
        />
        <div className="md:col-span-5">
          <LaunchNumberAmountFilters
            invoiceNumber={invoiceNumberFilter}
            onInvoiceNumberChange={setInvoiceNumberFilter}
            amount={amountFilter}
            onAmountChange={setAmountFilter}
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50/50">
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tipo</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Lançamento</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Setor / CRD</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Fornecedor</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Vencimento</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Data</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Valor</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading && (
              <tr>
                <td colSpan={9} className="px-6 py-10 text-center text-sm text-slate-400">
                  Carregando lançamentos...
                </td>
              </tr>
            )}
            {!loading && filteredItems.length === 0 && (
              <tr>
                <td colSpan={9} className="px-6 py-10 text-center text-sm text-slate-400">
                  Nenhum lançamento encontrado com os filtros atuais.
                </td>
              </tr>
            )}
            {!loading &&
              filteredItems.map((item) => {
                const meta = statusMeta(item);
                return (
                  <tr key={item.key} className="hover:bg-slate-50/50 transition-colors align-top">
                    <td className="px-6 py-4">
                      <span
                        className={cn(
                          'text-[10px] font-bold px-2 py-1 rounded-lg uppercase tracking-wider whitespace-nowrap',
                          tipoBadgeClass(item.type)
                        )}
                      >
                        {tipoLabel(item.type)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-700">
                      <span className="font-medium text-slate-900">{item.title}</span>
                      {item.subtitle ? (
                        <span className="block text-xs text-slate-500 mt-0.5">{item.subtitle}</span>
                      ) : null}
                      {item.description ? (
                        <span className="block text-xs text-slate-500 mt-0.5 line-clamp-2">{item.description}</span>
                      ) : null}
                      {item.user_name ? (
                        <span className="block text-[10px] text-slate-400 mt-0.5">por {item.user_name}</span>
                      ) : null}
                      {(item.type === 'manual' || item.type === 'estorno') && item.file_path ? (
                        <button
                          type="button"
                          onClick={() => openAttachedDocument(item)}
                          className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-50 px-2 py-1 rounded-lg hover:bg-blue-100"
                        >
                          <Paperclip className="w-3 h-3" />
                          Anexo
                        </button>
                      ) : null}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {item.sector_name || (item.type === 'comanda' ? '—' : 'Sem setor')}
                      {item.crd_code ? (
                        <span className="block text-xs text-slate-500">
                          {item.crd_code}
                          {item.crd_name ? ` — ${item.crd_name}` : ''}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {item.fornecedor || '—'}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {item.vencimento ? formatDate(item.vencimento) : '—'}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {item.reference_date ? formatDate(item.reference_date) : '—'}
                      {item.issue_date ? (
                        <span className="block text-xs text-slate-400">Emissão: {item.issue_date}</span>
                      ) : null}
                    </td>
                    <td className={cn('px-6 py-4 text-sm font-bold', item.type === 'estorno' ? 'text-amber-700' : 'text-slate-900')}>
                      {item.amount != null
                        ? `${item.type === 'estorno' ? '−' : ''}${formatCurrency(item.amount)}`
                        : '—'}
                      {exceedsDiretoriaThreshold(item.amount) ? (
                        <span className="block text-[10px] font-bold uppercase tracking-wider text-cyan-700 mt-1">
                          Acima de R$ 800
                        </span>
                      ) : null}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={cn(
                          'text-[10px] font-bold px-2 py-1 rounded-lg uppercase tracking-wider whitespace-nowrap',
                          meta.classes
                        )}
                      >
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-end gap-2">{renderActions(item)}</div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {receiptModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Comprovante de pagamento</h3>
            <p className="text-sm text-slate-500">
              O comprovante é opcional. Você pode marcar como pago sem anexar arquivo.
            </p>
            <label
              className={cn(
                'flex items-center justify-center gap-2 w-full px-4 py-3 border border-dashed rounded-xl text-sm cursor-pointer',
                receiptFile ? 'bg-sky-50 border-sky-300 text-sky-800' : 'bg-slate-50 border-slate-300 text-slate-600'
              )}
            >
              {receiptFile ? <FileCheck className="w-4 h-4" /> : <Upload className="w-4 h-4" />}
              <span className="truncate">{receiptFile ? receiptFile.name : 'Selecionar PDF ou imagem (opcional)'}</span>
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/*"
                className="hidden"
                onChange={(e) => setReceiptFile(e.target.files?.[0] || null)}
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setReceiptModal(null);
                  setReceiptFile(null);
                }}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={uploadingReceipt}
                onClick={handlePayInvoice}
                className="px-4 py-2 rounded-xl text-sm font-bold bg-[#004D40] text-white disabled:opacity-60"
              >
                {uploadingReceipt ? 'Enviando...' : 'Confirmar pagamento'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
