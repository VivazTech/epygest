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
import { isDirectDocumentUrl } from '../lib/storagePath';
import { confirmCancel } from '../lib/confirmAction';
import {
  APROVACAO_TIPOS,
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
  const [actingSector, setActingSector] = useState<'controle' | 'financeiro'>('controle');
  const [typeFilter, setTypeFilter] = useState('all');
  const [sectorFilter, setSectorFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('pending');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [receiptModal, setReceiptModal] = useState<{ id: number; type: 'nota' | 'danfe' } | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);

  const canSwitchActingProfile = userRole === 'admin';
  const canApproveControl =
    actingSector === 'controle' && (userRole === 'controle' || userRole === 'admin');
  const canPayFinance =
    actingSector === 'financeiro' && (userRole === 'finance' || userRole === 'admin');

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
        if (role === 'finance') setActingSector('financeiro');
        else setActingSector('controle');
      } catch {
        // ignore
      }
    };
    loadUser();
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredItems = useMemo(
    () =>
      items.filter((item) =>
        matchesSearch(
          query,
          tipoLabel(item.type),
          item.title,
          item.subtitle,
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
        )
      ),
    [items, query]
  );

  const metrics = useMemo(() => {
    const pendingControle = items.filter((i) => isPendingForRole(i, 'controle')).length;
    const pendingFinanceiro = items.filter((i) => isPendingForRole(i, 'financeiro')).length;
    const totalValor = items.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
    return { pendingControle, pendingFinanceiro, totalValor, total: items.length };
  }, [items]);

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
    showSuccess('Lançamento manual atualizado.');
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
      open: 'Lançamento devolvido para análise.',
    };
    showSuccess(messages[status] || 'Lançamento atualizado.');
    loadData();
  };

  const renderFlowActions = (type: 'comanda' | 'requisicao' | 'mensalidade', item: AprovacaoItem) => (
    <>
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
    action: 'approve_control' | 'reject_control' | 'disapprove_control' | 'mark_paid',
    paymentReceiptPath?: string
  ) => {
    if (action === 'reject_control' && !confirmCancel('esta nota (reprovação pelo Controle)')) return false;
    if (action === 'disapprove_control' && !window.confirm('Desaprovar esta nota e devolvê-la para análise do setor solicitante?')) {
      return false;
    }
    const res = await fetch(`/api/invoices/${id}/flow`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        actorSector: actingSector === 'controle' ? 'CONTROLE' : 'FINANCEIRO',
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

  const openManualDocument = async (item: AprovacaoItem) => {
    const storedPath = String(item.file_path || '');
    if (storedPath && isDirectDocumentUrl(storedPath)) {
      window.open(storedPath, '_blank', 'noopener');
      return;
    }
    try {
      const res = await fetch(`/api/manual-entries/${item.source_id}/document-url`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.url) throw new Error(data?.error || 'Arquivo indisponível');
      window.open(data.url, '_blank', 'noopener');
    } catch (error: any) {
      alert(error.message || 'Não foi possível abrir o documento.');
    }
  };

  const handlePayInvoice = async () => {
    if (!receiptModal || !receiptFile) {
      alert('Anexe o comprovante de pagamento.');
      return;
    }
    setUploadingReceipt(true);
    try {
      const payload = new FormData();
      payload.append('receipt_file', receiptFile);
      const uploadRes = await fetch('/api/invoices/receipt', { method: 'POST', body: payload });
      const uploadData = await uploadRes.json().catch(() => ({}));
      if (!uploadRes.ok) throw new Error(uploadData.error || 'Falha ao enviar comprovante.');
      const ok = await runInvoiceFlow(receiptModal.id, 'mark_paid', uploadData.file_path);
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
    if (item.type === 'manual') {
      return (
        <>
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

    if (item.type === 'nota' || item.type === 'danfe') {
      const flow = item.flow_stage || 'control_pending';
      return (
        <>
          {canApproveControl && flow === 'control_pending' && (
            <>
              <button
                onClick={() => runInvoiceFlow(item.source_id, 'approve_control').then((ok) => ok && loadData())}
                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                title="Aprovar (Controle)"
              >
                <BadgeCheck className="w-4 h-4" />
              </button>
              <button
                onClick={() => runInvoiceFlow(item.source_id, 'reject_control').then((ok) => ok && loadData())}
                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                title="Reprovar"
              >
                <XCircle className="w-4 h-4" />
              </button>
            </>
          )}
          {canApproveControl && flow === 'control_approved' && (
            <button
              onClick={() => runInvoiceFlow(item.source_id, 'disapprove_control').then((ok) => ok && loadData())}
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
            Visão unificada de comandas, lançamentos manuais, requisições, notas, DANFE e mensalidades.
          </p>
        </div>
        {canSwitchActingProfile && (
          <select
            value={actingSector}
            onChange={(e) => setActingSector(e.target.value as 'controle' | 'financeiro')}
            className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 shadow-sm self-start"
          >
            <option value="controle">Atuar como Controle</option>
            <option value="financeiro">Atuar como Financeiro</option>
          </select>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Pendentes Controle</p>
          <p className="text-2xl font-extrabold text-orange-600 mt-1">{metrics.pendingControle}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Pendentes Financeiro</p>
          <p className="text-2xl font-extrabold text-blue-600 mt-1">{metrics.pendingFinanceiro}</p>
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
          {sectors.map((s) => (
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
                      {item.type === 'manual' && item.file_path ? (
                        <button
                          type="button"
                          onClick={() => openManualDocument(item)}
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
                    <td className="px-6 py-4 text-sm font-bold text-slate-900">
                      {item.amount != null ? formatCurrency(item.amount) : '—'}
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
              Anexe o comprovante para registrar o pagamento da nota.
            </p>
            <label
              className={cn(
                'flex items-center justify-center gap-2 w-full px-4 py-3 border border-dashed rounded-xl text-sm cursor-pointer',
                receiptFile ? 'bg-sky-50 border-sky-300 text-sky-800' : 'bg-slate-50 border-slate-300 text-slate-600'
              )}
            >
              {receiptFile ? <FileCheck className="w-4 h-4" /> : <Upload className="w-4 h-4" />}
              <span className="truncate">{receiptFile ? receiptFile.name : 'Selecionar PDF ou imagem'}</span>
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
                disabled={uploadingReceipt || !receiptFile}
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
