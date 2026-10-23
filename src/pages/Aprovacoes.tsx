import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  BadgeCheck,
  ChevronDown,
  Paperclip,
  RotateCcw,
  XCircle,
  Upload,
  FileCheck,
  Loader2,
} from 'lucide-react';
import { cn, formatCurrency, formatDate } from '../lib/utils';
import { useSearch } from '../context/SearchContext';
import { useToast } from '../context/ToastContext';
import { LaunchNumberAmountFilters } from '../components/LaunchNumberAmountFilters';
import { DateBrInput } from '../components/DateBrInput';
import { ListPagination } from '../components/ListPagination';
import { parseListResponse, useServerListEffect, useServerPagination } from '../hooks/useServerPagination';
import { isDirectDocumentUrl } from '../lib/storagePath';
import { confirmCancel } from '../lib/confirmAction';
import {
  APROVACAO_TIPOS,
  DIRETORIA_AMOUNT_THRESHOLD,
  DIRETORIA_APPROVAL_ENFORCED,
  exceedsDiretoriaThreshold,
  type AprovacaoActingSector,
  type AprovacaoItem,
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
  const [summary, setSummary] = useState<{
    total?: number;
    pending_gestor?: number;
    pending_controle?: number;
    pending_financeiro?: number;
    pending_diretoria?: number;
    total_valor?: number;
    paid_by_options?: Array<{ id: number; name: string }>;
  } | null>(null);
  const pagination = useServerPagination(20);
  const [userRole, setUserRole] = useState('viewer');
  const [allowedSectorIds, setAllowedSectorIds] = useState<string[]>([]);
  const [actingSector, setActingSector] = useState<AprovacaoActingSector>('controle');
  const [viewTab, setViewTab] = useState<'geral' | 'diretoria'>('geral');
  const [typeFilter, setTypeFilter] = useState('all');
  const [sectorFilter, setSectorFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('pending');
  const [paidByFilter, setPaidByFilter] = useState('all');
  const currentYear = new Date().getFullYear();
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [invoiceNumberFilter, setInvoiceNumberFilter] = useState('');
  const [amountFilter, setAmountFilter] = useState('');
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
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

  const loadData = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const params = new URLSearchParams(pagination.queryParams);
      if (typeFilter !== 'all') params.set('type', typeFilter);
      if (sectorFilter !== 'all') params.set('sector_id', sectorFilter);
      if (dateFrom) params.set('from', dateFrom);
      if (dateTo) params.set('to', dateTo);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (paidByFilter !== 'all') params.set('paid_by', paidByFilter);
      if (viewTab === 'diretoria') params.set('diretoria', '1');
      if (query.trim()) params.set('q', query.trim());
      if (invoiceNumberFilter.trim()) params.set('invoice_number', invoiceNumberFilter.trim());
      if (amountFilter.trim()) params.set('amount', amountFilter.trim());

      const [aprovRes, sectorsRes] = await Promise.all([
        fetch(`/api/aprovacoes?${params.toString()}`, { signal }),
        fetch('/api/sectors', { signal }),
      ]);
      const data = await aprovRes.json().catch(() => ({}));
      const sectorsData = await sectorsRes.json().catch(() => []);
      if (signal?.aborted) return;
      const parsed = parseListResponse<AprovacaoItem>(data);
      setItems(parsed.items);
      pagination.applyMeta({ total: parsed.total, totalAmount: parsed.totalAmount ?? null });
      setSummary(data?.summary && typeof data.summary === 'object' ? data.summary : null);
      setSectors(Array.isArray(sectorsData) ? sectorsData : []);
    } catch (err) {
      if ((err as any)?.name === 'AbortError') return;
      setItems([]);
      pagination.applyMeta({ total: 0, totalAmount: 0 });
      setSummary(null);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [
    typeFilter,
    sectorFilter,
    dateFrom,
    dateTo,
    statusFilter,
    paidByFilter,
    viewTab,
    query,
    invoiceNumberFilter,
    amountFilter,
    pagination.queryParams,
    pagination.applyMeta,
  ]);

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
        if (role === 'finance') {
          setActingSector('financeiro');
          setStatusFilter('pending_financeiro');
        } else if (role === 'manager') setActingSector('gestor');
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

  const listFilterKey = [
    typeFilter,
    sectorFilter,
    dateFrom,
    dateTo,
    statusFilter,
    paidByFilter,
    viewTab,
    query,
    invoiceNumberFilter,
    amountFilter,
  ].join('|');

  useServerListEffect(listFilterKey, pagination, (signal) => loadData(signal));

  const filteredAmountTotal = useMemo(() => {
    if (pagination.totalAmount != null && Number.isFinite(pagination.totalAmount)) {
      return formatCurrency(pagination.totalAmount);
    }
    return formatCurrency(0);
  }, [pagination.totalAmount]);

  const metrics = useMemo(() => {
    return {
      pendingGestor: Number(summary?.pending_gestor) || 0,
      pendingControle: Number(summary?.pending_controle) || 0,
      pendingFinanceiro: Number(summary?.pending_financeiro) || 0,
      pendingDiretoria: Number(summary?.pending_diretoria) || 0,
      totalValor: Number(summary?.total_valor) || Number(pagination.totalAmount) || 0,
      total: Number(summary?.total) || pagination.total || 0,
    };
  }, [summary, pagination.total, pagination.totalAmount]);

  const diretoriaCount = metrics.pendingDiretoria;

  const paidByOptions = useMemo(() => {
    const options = Array.isArray(summary?.paid_by_options) ? summary.paid_by_options : [];
    if (paidByFilter !== 'all' && !options.some((opt) => String(opt.id) === paidByFilter)) {
      return [...options, { id: Number(paidByFilter), name: `Usuário #${paidByFilter}` }];
    }
    return options;
  }, [summary, paidByFilter]);

  const kpiFilterClass = (active: boolean) =>
    cn(
      'bg-white rounded-2xl border shadow-sm p-4 text-left transition-colors hover:border-slate-300',
      active ? 'border-slate-900 ring-1 ring-slate-900' : 'border-slate-100'
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
    type: 'comanda' | 'requisicao' | 'mensalidade' | 'ordem',
    id: number,
    status: 'open' | 'approved' | 'posted' | 'cancelled'
  ) => {
    if (status === 'cancelled' && !confirmCancel(
      type === 'comanda'
        ? 'esta comanda'
        : type === 'requisicao'
          ? 'esta requisição'
          : type === 'ordem'
            ? 'esta ordem de compra'
            : 'este pagamento de mensalidade'
    )) return;
    const endpoint =
      type === 'comanda'
        ? `/api/comandas/${id}/status`
        : type === 'requisicao'
          ? `/api/requisitions/${id}/status`
          : type === 'ordem'
            ? `/api/ordens-compra/${id}/status`
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

  const renderFlowActions = (type: 'comanda' | 'requisicao' | 'mensalidade' | 'ordem', item: AprovacaoItem) => (
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

  const openOrdemDocumento = async (id: number, kind: 'nota' | 'recibo' | 'boleto') => {
    try {
      const res = await fetch(`/api/ordens-compra/${id}/document-url?kind=${kind}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.url) throw new Error(data?.error || 'Arquivo indisponível');
      window.open(data.url, '_blank', 'noopener');
    } catch (error: any) {
      alert(error.message || 'Não foi possível abrir o documento.');
    }
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
    if (item.type === 'ordem') return renderFlowActions('ordem', item);

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
            onChange={(e) => {
              const next = e.target.value as AprovacaoActingSector;
              setActingSector(next);
              if (next === 'financeiro') setStatusFilter('pending_financeiro');
            }}
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
        <button
          type="button"
          onClick={() => setStatusFilter('pending_gestor')}
          className={kpiFilterClass(statusFilter === 'pending_gestor')}
        >
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Pendentes Gestor</p>
          <p className="text-2xl font-extrabold text-violet-700 mt-1">{metrics.pendingGestor}</p>
        </button>
        <button
          type="button"
          onClick={() => setStatusFilter('pending_controle')}
          className={kpiFilterClass(statusFilter === 'pending_controle')}
        >
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Pendentes Controle</p>
          <p className="text-2xl font-extrabold text-orange-600 mt-1">{metrics.pendingControle}</p>
        </button>
        {viewTab === 'diretoria' ? (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Acima de R$ 800</p>
            <p className="text-2xl font-extrabold mt-1 text-cyan-700">{metrics.pendingDiretoria}</p>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setStatusFilter('pending_financeiro')}
            className={kpiFilterClass(statusFilter === 'pending_financeiro')}
          >
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Pendentes Financeiro</p>
            <p className="text-2xl font-extrabold mt-1 text-blue-600">{metrics.pendingFinanceiro}</p>
          </button>
        )}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Itens listados</p>
          <p className="text-2xl font-extrabold text-slate-900 mt-1">{metrics.total}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Valor total</p>
          <p className="text-2xl font-extrabold text-slate-900 mt-1">{formatCurrency(metrics.totalValor)}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-3">
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
          <option value="pending">Pendentes (todas as etapas)</option>
          <option value="pending_gestor">Pendentes Gestor</option>
          <option value="pending_controle">Pendentes Controle</option>
          <option value="pending_financeiro">Pendentes Financeiro</option>
          <option value="done">Concluídos</option>
          <option value="cancelled">Cancelados / encerrados</option>
        </select>
        <select
          value={paidByFilter}
          onChange={(e) => setPaidByFilter(e.target.value)}
          className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm"
          title="Usuário do Financeiro que deu a baixa"
        >
          <option value="all">Baixado por: todos</option>
          {paidByOptions.map((opt) => (
            <option key={opt.id} value={String(opt.id)}>Baixado por: {opt.name}</option>
          ))}
        </select>
        <div title="Data inicial">
          <DateBrInput
            value={dateFrom}
            onChange={setDateFrom}
            suggestYear={currentYear}
            className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm w-[11.5rem]"
          />
        </div>
        <div title="Data final">
          <DateBrInput
            value={dateTo}
            onChange={setDateTo}
            suggestYear={currentYear}
            className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm w-[11.5rem]"
          />
        </div>
        <div className="md:col-span-3 xl:col-span-6">
          <LaunchNumberAmountFilters
            invoiceNumber={invoiceNumberFilter}
            onInvoiceNumberChange={setInvoiceNumberFilter}
            amount={amountFilter}
            onAmountChange={setAmountFilter}
          />
        </div>
      </div>

      <div className="md:hidden space-y-3">
        {loading && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-10 text-center text-sm text-slate-400">
            Carregando lançamentos...
          </div>
        )}
        {!loading && items.length === 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-10 text-center text-sm text-slate-400">
            Nenhum lançamento encontrado com os filtros atuais.
          </div>
        )}
        {!loading &&
          items.map((item) => {
            const meta = statusMeta(item);
            const open = expandedKey === item.key;
            const actions = renderActions(item);
            return (
              <article
                key={item.key}
                className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4"
              >
                <button
                  type="button"
                  className="w-full text-left"
                  aria-expanded={open}
                  onClick={() => setExpandedKey(open ? null : item.key)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className={cn(
                        'text-[10px] font-bold px-2 py-1 rounded-lg uppercase tracking-wider',
                        tipoBadgeClass(item.type)
                      )}
                    >
                      {tipoLabel(item.type)}
                    </span>
                    <span
                      className={cn(
                        'text-[10px] font-bold px-2 py-1 rounded-lg uppercase tracking-wider text-right',
                        meta.classes
                      )}
                    >
                      {meta.label}
                    </span>
                  </div>
                  <p className="mt-3 text-sm font-semibold text-slate-900 line-clamp-2">{item.title}</p>
                  {item.subtitle ? (
                    <p className="mt-1 text-xs text-slate-500 line-clamp-1">{item.subtitle}</p>
                  ) : null}
                  <div className="mt-3 flex items-end justify-between gap-3">
                    <p
                      className={cn(
                        'text-lg font-extrabold leading-none',
                        item.type === 'estorno' ? 'text-amber-700' : 'text-slate-900'
                      )}
                    >
                      {item.amount != null
                        ? `${item.type === 'estorno' ? '−' : ''}${formatCurrency(item.amount)}`
                        : '—'}
                    </p>
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 shrink-0">
                      {open ? 'Recolher' : 'Detalhes'}
                      <ChevronDown className={cn('w-4 h-4 transition-transform', open && 'rotate-180')} />
                    </span>
                  </div>
                </button>

                {open && (
                  <div className="mt-3 pt-3 border-t border-slate-100 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Fornecedor</p>
                        <p className="text-sm text-slate-700 mt-0.5">{item.fornecedor || '—'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Setor</p>
                        <p className="text-sm text-slate-700 mt-0.5">
                          {item.sector_name || (item.type === 'comanda' ? '—' : 'Sem setor')}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">CRD</p>
                        <p className="text-sm text-slate-700 mt-0.5">
                          {item.crd_code
                            ? `${item.crd_code}${item.crd_name ? ` — ${item.crd_name}` : ''}`
                            : '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Vencimento</p>
                        <p className="text-sm text-slate-700 mt-0.5">
                          {item.vencimento ? formatDate(item.vencimento) : '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Data</p>
                        <p className="text-sm text-slate-700 mt-0.5">
                          {item.reference_date ? formatDate(item.reference_date) : '—'}
                          {item.issue_date ? (
                            <span className="block text-xs text-slate-400">Emissão: {item.issue_date}</span>
                          ) : null}
                        </p>
                      </div>
                    </div>
                    {item.description ? (
                      <p className="text-xs text-slate-500">{item.description}</p>
                    ) : null}
                    {item.user_name ? (
                      <p className="text-[10px] text-slate-400">por {item.user_name}</p>
                    ) : null}
                    {item.paid_by_user_name ? (
                      <p className="text-[10px] text-emerald-700 font-semibold">Baixado por {item.paid_by_user_name}</p>
                    ) : null}
                    {exceedsDiretoriaThreshold(item.amount) ? (
                      <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-700">
                        Acima de R$ 800
                      </p>
                    ) : null}
                    {(item.type === 'manual' || item.type === 'estorno') && item.file_path ? (
                      <button
                        type="button"
                        onClick={() => openAttachedDocument(item)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-50 px-2 py-1 rounded-lg hover:bg-blue-100"
                      >
                        <Paperclip className="w-3 h-3" />
                        Anexo
                      </button>
                    ) : null}
                    {item.type === 'ordem' && (item.file_path || item.recibo_file_path || item.boleto_file_path) ? (
                      <span className="flex flex-wrap gap-1">
                        {item.file_path ? (
                          <button
                            type="button"
                            onClick={() => openOrdemDocumento(item.source_id, 'nota')}
                            className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-50 px-2 py-1 rounded-lg hover:bg-blue-100"
                          >
                            <Paperclip className="w-3 h-3" />
                            Nota
                          </button>
                        ) : null}
                        {item.recibo_file_path ? (
                          <button
                            type="button"
                            onClick={() => openOrdemDocumento(item.source_id, 'recibo')}
                            className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-50 px-2 py-1 rounded-lg hover:bg-blue-100"
                          >
                            <Paperclip className="w-3 h-3" />
                            Recibo
                          </button>
                        ) : null}
                        {item.boleto_file_path ? (
                          <button
                            type="button"
                            onClick={() => openOrdemDocumento(item.source_id, 'boleto')}
                            className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-50 px-2 py-1 rounded-lg hover:bg-blue-100"
                          >
                            <Paperclip className="w-3 h-3" />
                            Boleto
                          </button>
                        ) : null}
                      </span>
                    ) : null}
                  </div>
                )}

                {actions ? (
                  <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-end gap-1">
                    {actions}
                  </div>
                ) : null}
              </article>
            );
          })}
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="hidden md:block overflow-x-auto">
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
                <td colSpan={9} className="px-6 py-14 text-center">
                  <div className="inline-flex items-center justify-center gap-2 text-slate-400">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span className="text-sm font-medium">Carregando lançamentos...</span>
                  </div>
                </td>
              </tr>
            )}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={9} className="px-6 py-10 text-center text-sm text-slate-400">
                  Nenhum lançamento encontrado com os filtros atuais.
                </td>
              </tr>
            )}
            {!loading &&
              items.map((item) => {
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
                      {item.type === 'ordem' && (item.file_path || item.recibo_file_path || item.boleto_file_path) ? (
                        <span className="mt-1 flex flex-wrap gap-1">
                          {item.file_path ? (
                            <button
                              type="button"
                              onClick={() => openOrdemDocumento(item.source_id, 'nota')}
                              className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-50 px-2 py-1 rounded-lg hover:bg-blue-100"
                            >
                              <Paperclip className="w-3 h-3" />
                              Nota
                            </button>
                          ) : null}
                          {item.recibo_file_path ? (
                            <button
                              type="button"
                              onClick={() => openOrdemDocumento(item.source_id, 'recibo')}
                              className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-50 px-2 py-1 rounded-lg hover:bg-blue-100"
                            >
                              <Paperclip className="w-3 h-3" />
                              Recibo
                            </button>
                          ) : null}
                          {item.boleto_file_path ? (
                            <button
                              type="button"
                              onClick={() => openOrdemDocumento(item.source_id, 'boleto')}
                              className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 bg-blue-50 px-2 py-1 rounded-lg hover:bg-blue-100"
                            >
                              <Paperclip className="w-3 h-3" />
                              Boleto
                            </button>
                          ) : null}
                        </span>
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
                      {item.paid_by_user_name ? (
                        <span className="block mt-1 text-[10px] text-slate-500 whitespace-nowrap">
                          por {item.paid_by_user_name}
                        </span>
                      ) : null}
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
        {!loading && (
          <ListPagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            from={pagination.from}
            to={pagination.to}
            pageSize={pagination.pageSize}
            onPageChange={pagination.setPage}
            onPageSizeChange={pagination.setPageSize}
            label="lançamentos"
            amountTotal={filteredAmountTotal}
          />
        )}
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
