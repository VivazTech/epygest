import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, 
  Search, 
  Filter, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  FileText,
  Upload,
  BadgeCheck,
  XCircle
} from 'lucide-react';
import { cn, formatCurrency, formatDate } from '../lib/utils';
import { ValueTrace } from '../components/ValueTrace';
import { SearchableSelect } from '../components/SearchableSelect';
import { valueTrace } from '../lib/valueTraceMeta';
import { useSearch } from '../context/SearchContext';
import { useToast } from '../context/ToastContext';
import { matchesSearch } from '../lib/search';
import { isDirectDocumentUrl, type StorageDocumentField } from '../lib/storagePath';

export const Invoices: React.FC = () => {
  const { query } = useSearch();
  const { showSuccess } = useToast();
  const now = new Date();
  const initialMonth = (() => {
    const saved = localStorage.getItem('invoices:selectedMonth');
    return saved && Number(saved) >= 1 && Number(saved) <= 12
      ? String(Number(saved))
      : String(now.getMonth() + 1);
  })();
  const initialYear = (() => {
    const saved = localStorage.getItem('invoices:selectedYear');
    return saved && Number(saved) >= 2000 && Number(saved) <= 2100
      ? String(Number(saved))
      : String(now.getFullYear());
  })();
  const initialDateFrom = localStorage.getItem('invoices:dateFrom') || '';
  const initialDateTo = localStorage.getItem('invoices:dateTo') || '';
  const [invoices, setInvoices] = useState<any[]>([]);
  const [sectors, setSectors] = useState<any[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(initialMonth);
  const [selectedYear, setSelectedYear] = useState(initialYear);
  const [customDateFrom, setCustomDateFrom] = useState(initialDateFrom);
  const [customDateTo, setCustomDateTo] = useState(initialDateTo);
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [crdOptions, setCrdOptions] = useState<any[]>([]);
  const [actingSector, setActingSector] = useState<'requester' | 'controle' | 'financeiro'>('requester');
  const [requesterSectorId, setRequesterSectorId] = useState<string>('');
  const [userRole, setUserRole] = useState<string>('viewer');
  const [allowedSectorIds, setAllowedSectorIds] = useState<string[]>([]);
  const [selectedSectorIds, setSelectedSectorIds] = useState<string[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [extractingPdf, setExtractingPdf] = useState(false);
  const [uploadingBoleto, setUploadingBoleto] = useState(false);
  const [semBoleto, setSemBoleto] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [exportingReport, setExportingReport] = useState<'csv' | 'pdf' | null>(null);
  const [reportFilters, setReportFilters] = useState({
    from: '',
    to: '',
    payment_method: ''
  });
  const [formData, setFormData] = useState({
    invoice_number: '',
    provider_name: '',
    amount: '',
    issue_date: '',
    due_date: '',
    sector_id: '',
    file_path: '',
    boleto_file_path: '',
    natureza: 'O',
    crd: '',
    payment_method: '',
    pix_key: ''
  });

  useEffect(() => {
    fetchInvoices();
    fetchSectors(selectedMonth, selectedYear);
  }, [selectedMonth, selectedYear, customDateFrom, customDateTo]);

  useEffect(() => {
    localStorage.setItem('invoices:selectedMonth', selectedMonth);
    localStorage.setItem('invoices:selectedYear', selectedYear);
    localStorage.setItem('invoices:dateFrom', customDateFrom);
    localStorage.setItem('invoices:dateTo', customDateTo);
  }, [selectedMonth, selectedYear, customDateFrom, customDateTo]);

  useEffect(() => {
    fetch('/api/payment-methods').then(res => res.json()).then(setPaymentMethods);
    fetch('/api/crds').then(res => res.json()).then(setCrdOptions);
  }, []);

  useEffect(() => {
    const loadCurrentUserContext = async () => {
      const userRaw = localStorage.getItem('user');
      if (!userRaw) return;
      try {
        const user = JSON.parse(userRaw);
        setUserRole(String(user?.role || 'viewer'));
        if (user?.role === 'finance') setActingSector('financeiro');
        else if (user?.role === 'controle') setActingSector('controle');
        else setActingSector('requester');

        // Recarrega dados atuais do usuário no backend para refletir
        // vínculos novos de setores sem depender da sessão antiga.
        const users = await fetch('/api/users').then((res) => res.json()).catch(() => []);
        const freshUser = (Array.isArray(users) ? users : []).find((u: any) => String(u.id) === String(user.id));
        const normalizedSectorIds = Array.from(
          new Set(
            (Array.isArray(freshUser?.sector_ids) ? freshUser.sector_ids : [freshUser?.sector_id ?? user?.sector_id])
              .map((id) => String(id ?? '').trim())
              .filter((id) => id !== '')
          )
        );
        setAllowedSectorIds(normalizedSectorIds);

        if (freshUser) {
          const updatedUser = {
            ...user,
            sector_ids: freshUser.sector_ids ?? [],
            sector_names: freshUser.sector_names ?? [],
            sector_id: freshUser.sector_id ?? user?.sector_id ?? null,
          };
          localStorage.setItem('user', JSON.stringify(updatedUser));
        }
      } catch {
        // fallback mantém requester
      }
    };

    loadCurrentUserContext();
  }, []);

  useEffect(() => {
    if (requesterSectorId || sectors.length === 0) return;
    const userRaw = localStorage.getItem('user');
    if (userRaw) {
      try {
        const user = JSON.parse(userRaw);
        const firstSectorId = user?.sector_ids?.[0] ?? user?.sector_id;
        if (firstSectorId) {
          setRequesterSectorId(String(firstSectorId));
          return;
        }
      } catch {
        // Ignora parse inválido e usa fallback abaixo.
      }
    }
    setRequesterSectorId(String(sectors[0].id));
  }, [sectors, requesterSectorId]);

  useEffect(() => {
    if (!formData.sector_id) {
      fetch('/api/crds').then(res => res.json()).then(setCrdOptions);
      return;
    }
    fetch(`/api/crds?sector_id=${formData.sector_id}`).then(res => res.json()).then(setCrdOptions);
  }, [formData.sector_id]);

  const fetchInvoices = () => {
    const params = new URLSearchParams();
    if (customDateFrom || customDateTo) {
      if (customDateFrom) params.set('from', customDateFrom);
      if (customDateTo) params.set('to', customDateTo);
    } else {
      params.set('month', selectedMonth);
      params.set('year', selectedYear);
    }
    fetch(`/api/invoices?${params.toString()}`)
      .then(res => res.json())
      .then(data => setInvoices(Array.isArray(data) ? data : []))
      .catch(() => setInvoices([]));
  };

  const fetchSectors = (month = selectedMonth, year = selectedYear) => {
    const params = new URLSearchParams();
    params.set('month', month);
    params.set('year', year);
    fetch(`/api/sectors?${params.toString()}`)
      .then(res => res.json())
      .then(data => setSectors(Array.isArray(data) ? data : []))
      .catch(() => setSectors([]));
  };

  const handlePdfUpload = async (file: File) => {
    setExtractingPdf(true);
    try {
      const payload = new FormData();
      payload.append('invoice_pdf', file);
      const response = await fetch('/api/invoices/extract', {
        method: 'POST',
        body: payload
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Falha ao extrair dados do PDF');

      setFormData((prev) => ({
        ...prev,
        invoice_number: data.extracted?.invoice_number || prev.invoice_number,
        provider_name: data.extracted?.provider_name || prev.provider_name,
        amount: data.extracted?.amount || prev.amount,
        issue_date: data.extracted?.issue_date || prev.issue_date,
        due_date: data.extracted?.due_date || prev.due_date,
        pix_key: data.extracted?.pix_key || prev.pix_key,
        payment_method: data.extracted?.payment_method || prev.payment_method,
        file_path: data.file_path || prev.file_path,
      }));

      if (data.warning) {
        alert(`${data.warning}${data.parse_error ? `\nDetalhe técnico: ${data.parse_error}` : ''}`);
      }
    } catch (error: any) {
      alert(error.message || 'Não foi possível processar o PDF.');
    } finally {
      setExtractingPdf(false);
    }
  };

  const closeInvoiceModal = () => {
    setShowModal(false);
    setSemBoleto(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.file_path) {
      alert('Anexe o PDF da nota fiscal para continuar.');
      return;
    }
    if (!formData.payment_method) {
      alert('Selecione a forma de pagamento.');
      return;
    }
    if (formData.payment_method === 'pix' && !formData.pix_key) {
      alert('Informe a chave Pix.');
      return;
    }
    if (!formData.due_date) {
      alert('Informe a data de vencimento.');
      return;
    }
    const [dueYear, dueMonth] = formData.due_date.split('-');
    if (String(Number(dueMonth)) !== String(Number(selectedMonth)) || String(Number(dueYear)) !== String(Number(selectedYear))) {
      alert(`A data de vencimento deve estar na competência selecionada (${String(selectedMonth).padStart(2, '0')}/${selectedYear}).`);
      return;
    }
    const response = await fetch('/api/invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...formData,
        amount: parseFloat(formData.amount),
        sector_id: parseInt(formData.sector_id),
      })
    });
    if (response.ok) {
      showSuccess('Nota fiscal lançada com sucesso.');
      closeInvoiceModal();
      setFormData({ invoice_number: '', provider_name: '', amount: '', issue_date: '', due_date: '', sector_id: '', file_path: '', boleto_file_path: '', natureza: 'O', crd: '', payment_method: '', pix_key: '' });
      fetchInvoices();
      fetchSectors();
    } else {
      const data = await response.json().catch(() => ({}));
      alert(data.error || 'Não foi possível lançar a nota fiscal.');
    }
  };

  const handleBoletoUpload = async (file: File) => {
    setUploadingBoleto(true);
    try {
      const payload = new FormData();
      payload.append('boleto_file', file);
      const response = await fetch('/api/invoices/boleto', {
        method: 'POST',
        body: payload
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Falha ao enviar boleto');
      setFormData((prev) => ({
        ...prev,
        boleto_file_path: data.file_path || prev.boleto_file_path
      }));
      showSuccess('Boleto anexado com sucesso.');
    } catch (error: any) {
      alert(error.message || 'Não foi possível enviar o boleto.');
    } finally {
      setUploadingBoleto(false);
    }
  };

  const flowSuccessMessages: Record<
    'approve_control' | 'reject_control' | 'disapprove_control' | 'mark_paid' | 'cancel_request',
    string
  > = {
    approve_control: 'Nota aprovada pelo Controle.',
    reject_control: 'Nota reprovada pelo Controle.',
    disapprove_control: 'Nota devolvida para análise do setor.',
    mark_paid: 'Pagamento registrado com sucesso.',
    cancel_request: 'Solicitação de nota cancelada.',
  };

  const runFlowAction = async (
    id: number,
    action: 'approve_control' | 'reject_control' | 'disapprove_control' | 'mark_paid' | 'cancel_request',
    payment_receipt_path?: string,
    cancel_reason?: string
  ) => {
    const response = await fetch(`/api/invoices/${id}/flow`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        actorSector: actingSector.toUpperCase(),
        payment_receipt_path,
        cancel_reason
      })
    });
    if (!response.ok) {
      const data = await response.json();
      alert(data.error || 'Não foi possível atualizar o fluxo da nota.');
      return false;
    }
    showSuccess(flowSuccessMessages[action]);
    fetchInvoices();
    fetchSectors();
    return true;
  };

  const approveByControl = (id: number) => runFlowAction(id, 'approve_control');
  const rejectByControl = async (id: number) => {
    const reason = window.prompt('Motivo da reprovação pelo Controle (opcional):');
    if (reason === null) return;
    await runFlowAction(id, 'reject_control', undefined, reason || 'Reprovada pelo Controle');
  };
  const disapproveByControl = async (id: number) => {
    if (!window.confirm('Desaprovar esta nota e devolvê-la para análise do setor solicitante?')) return;
    await runFlowAction(id, 'disapprove_control');
  };
  const cancelRequest = async (id: number) => {
    const reason = window.prompt('Motivo do cancelamento (opcional):') || '';
    await runFlowAction(id, 'cancel_request', undefined, reason);
  };

  const markAsPaid = (id: number) => {
    setSelectedInvoiceId(id);
    setReceiptFile(null);
    setShowReceiptModal(true);
  };

  // Abre PDF/comprovante via URL assinada do Supabase Storage.
  const openInvoiceDocument = async (
    invoiceId: number,
    field: StorageDocumentField,
    storedPath?: string | null
  ) => {
    if (storedPath && isDirectDocumentUrl(storedPath)) {
      window.open(storedPath, '_blank', 'noopener');
      return;
    }
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/document-url?field=${field}`);
      const data = await res.json();
      if (!res.ok || !data?.url) throw new Error(data?.error || 'Arquivo indisponível');
      window.open(data.url, '_blank', 'noopener');
    } catch (error: any) {
      alert(error.message || 'Não foi possível abrir o documento.');
    }
  };

  const submitReceiptAndPay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoiceId) return;
    if (!receiptFile) {
      alert('Selecione o arquivo do comprovante.');
      return;
    }

    setUploadingReceipt(true);
    try {
      const payload = new FormData();
      payload.append('receipt_file', receiptFile);
      const uploadRes = await fetch('/api/invoices/receipt', {
        method: 'POST',
        body: payload
      });
      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) {
        throw new Error(uploadData.error || 'Falha ao enviar comprovante');
      }

      const ok = await runFlowAction(selectedInvoiceId, 'mark_paid', uploadData.file_path);
      if (ok) {
        setShowReceiptModal(false);
        setSelectedInvoiceId(null);
        setReceiptFile(null);
      }
    } catch (error: any) {
      alert(error.message || 'Não foi possível concluir o pagamento.');
    } finally {
      setUploadingReceipt(false);
    }
  };

  const getStatusUI = (flowStage: string, status: string) => {
    if (flowStage === 'paid' || status === 'paid') {
      return { label: 'Pago', icon: CheckCircle2, classes: 'bg-emerald-100 text-emerald-700' };
    }
    if (flowStage === 'cancelled') {
      return { label: 'Cancelado', icon: XCircle, classes: 'bg-slate-200 text-slate-700' };
    }
    if (flowStage === 'control_approved') {
      return { label: 'Aprovado Controle', icon: BadgeCheck, classes: 'bg-blue-100 text-blue-700' };
    }
    if (status === 'overdue') {
      return { label: 'Atrasado', icon: AlertCircle, classes: 'bg-red-100 text-red-700' };
    }
    return { label: 'Aguardando Controle', icon: Clock, classes: 'bg-orange-100 text-orange-700' };
  };

  const downloadInvoiceReport = async (format: 'csv' | 'pdf') => {
    const params = new URLSearchParams();
    params.set('format', format);
    if (reportFilters.from) params.set('from', reportFilters.from);
    if (reportFilters.to) params.set('to', reportFilters.to);
    if (reportFilters.payment_method) params.set('payment_method', reportFilters.payment_method);

    setExportingReport(format);
    try {
      const response = await fetch(`/api/invoices/report?${params.toString()}`);
      if (!response.ok) {
        let message = 'Não foi possível gerar o relatório.';
        try {
          const data = await response.json();
          message = data?.detail || data?.error || message;
        } catch {
          // resposta não era JSON; mantém a mensagem genérica
        }
        alert(message);
        return;
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `relatorio-notas-${new Date().toISOString().slice(0, 10)}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      setShowReportModal(false);
      showSuccess(`Relatório ${format.toUpperCase()} gerado com sucesso.`);
    } finally {
      setExportingReport(null);
    }
  };

  const isRequester = actingSector === 'requester';
  const requesterSector = sectors.find((s) => String(s.id) === requesterSectorId);
  const isManager = userRole === 'manager';
  const hasGlobalSectorView = userRole === 'admin' || userRole === 'finance' || userRole === 'controle';
  const canSeeAnnualTotal = userRole === 'admin' || userRole === 'finance';
  const toggleSectorSelection = (sectorId: string) => {
    setSelectedSectorIds((prev) =>
      prev.includes(sectorId)
        ? prev.filter((id) => id !== sectorId)
        : [...prev, sectorId]
    );
  };
  const budgetSectors = isManager
    ? sectors.filter((s) => allowedSectorIds.includes(String(s.id)))
    : sectors;
  /** Visibilidade por perfil (não muda ao alternar Controle/Financeiro na UI). */
  const canSeeSectorValues = (sectorId?: number | string) => {
    const currentSectorId = String(sectorId ?? '');
    if (!currentSectorId) return false;
    if (hasGlobalSectorView) return true;
    if (allowedSectorIds.length > 0) return allowedSectorIds.includes(currentSectorId);
    return currentSectorId === requesterSectorId;
  };
  const getSectorBudget = (sector: any) => Number(sector?.budget_month ?? sector?.budget_limit ?? 0);
  const crdSelectOptions = useMemo(
    () =>
      crdOptions
        .filter((c) => c.active)
        .map((c) => ({
          value: String(c.code || ''),
          label: `${c.name}${c.sector_name ? ` (${c.sector_name})` : ''}`,
          keywords: `${c.code} ${c.name} ${c.sector_name || ''}`,
        })),
    [crdOptions]
  );
  const visibleSectorOptions = useMemo(
    () => sectors.filter((sector) => canSeeSectorValues(sector.id)),
    [sectors, allowedSectorIds, requesterSectorId, userRole]
  );
  const visibleSectorIdSet = useMemo(
    () => new Set(visibleSectorOptions.map((s) => String(s.id))),
    [visibleSectorOptions]
  );
  const canFilterSectors = visibleSectorOptions.length > 1;
  const selectedSectorSet = useMemo(
    () => new Set(selectedSectorIds),
    [selectedSectorIds]
  );
  const matchesSectorVisibilityFilter = (sectorId?: number | string | null) => {
    const id = String(sectorId ?? '');
    if (!id || !visibleSectorIdSet.has(id)) return false;
    if (selectedSectorIds.length > 0 && !selectedSectorSet.has(id)) return false;
    return true;
  };
  const filteredInvoices = useMemo(
    () =>
      invoices.filter((invoice) => {
        if (!matchesSectorVisibilityFilter(invoice.sector_id)) return false;
        return matchesSearch(
          query,
          invoice.invoice_number,
          invoice.provider_name,
          invoice.sector_name,
          invoice.user_name,
          invoice.crd,
          invoice.payment_method,
          invoice.status,
          invoice.flow_stage,
          invoice.amount
        );
      }),
    [invoices, visibleSectorIdSet, selectedSectorIds, selectedSectorSet, query]
  );
  const filteredBudgetSectors = useMemo(
    () =>
      budgetSectors.filter((sector) => {
        if (!matchesSectorVisibilityFilter(sector.id)) return false;
        return matchesSearch(query, sector.name);
      }),
    [budgetSectors, visibleSectorIdSet, selectedSectorIds, selectedSectorSet, query]
  );
  const scopedInvoices = useMemo(
    () => filteredInvoices,
    [filteredInvoices]
  );

  const metrics = useMemo(() => {
    const withFlow = scopedInvoices.map((invoice) => ({
      ...invoice,
      flow: invoice.flow_stage || (invoice.status === 'paid' ? 'paid' : 'control_pending'),
    }));
    const aguardandoControle = withFlow.filter((i) => i.flow === 'control_pending').length;
    const aprovadasControle = withFlow.filter((i) => i.flow === 'control_approved').length;
    const pagas = withFlow.filter((i) => i.flow === 'paid' || i.status === 'paid').length;
    const canceladas = withFlow.filter((i) => i.flow === 'cancelled').length;
    const atrasadas = withFlow.filter((i) => i.status === 'overdue' && i.flow !== 'paid' && i.flow !== 'cancelled').length;

    let pendentesParaVoce = 0;
    let acoesConcluidas = 0;
    let perfilLabel = 'Acompanhamento';

    if (actingSector === 'controle') {
      pendentesParaVoce = aguardandoControle;
      acoesConcluidas = withFlow.filter((i) => String(i.approved_by_sector || '').toUpperCase() === 'CONTROLE').length;
      perfilLabel = 'Controle';
    } else if (actingSector === 'financeiro') {
      pendentesParaVoce = aprovadasControle;
      acoesConcluidas = withFlow.filter((i) => String(i.paid_by_sector || '').toUpperCase() === 'FINANCEIRO').length;
      perfilLabel = 'Financeiro';
    } else {
      pendentesParaVoce = withFlow.filter((i) => i.flow !== 'paid' && i.flow !== 'cancelled').length;
      acoesConcluidas = withFlow.filter((i) => String(i.cancelled_by_sector || '').toUpperCase() === 'REQUESTER').length;
      perfilLabel = userRole === 'manager' ? 'Gestor' : 'Solicitante';
    }

    return {
      perfilLabel,
      pendentesParaVoce,
      acoesConcluidas,
      aguardandoControle,
      aprovadasControle,
      pagas,
      canceladas,
      atrasadas,
    };
  }, [scopedInvoices, actingSector, userRole]);

  const annualTotals = useMemo(() => {
    let used = 0;
    let budget = 0;
    let invoices = 0;
    for (const sector of filteredBudgetSectors) {
      if (!canSeeSectorValues(sector.id)) continue;
      used += Number(sector.annual_pending_amount || 0);
      budget += Number(sector.annual_budget || 0);
      invoices += Number(sector.annual_invoices || 0);
    }
    return { used, budget, invoices };
  }, [filteredBudgetSectors, allowedSectorIds, requesterSectorId, userRole]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Controle de Notas Fiscais</h2>
          <p className="text-slate-500 text-sm">Fluxo: Setor solicitante importa → Controle aprova → Financeiro paga e anexa comprovante.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-[#004D40] text-white px-4 py-2.5 rounded-xl shadow-lg shadow-emerald-900/10 hover:bg-[#003d33] transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span className="font-bold text-sm">Importar Nota</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Pendentes para {metrics.perfilLabel}</p>
          <p className="text-2xl font-extrabold text-slate-900 mt-1">{metrics.pendentesParaVoce}</p>
        </div>
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ações concluídas ({metrics.perfilLabel})</p>
          <p className="text-2xl font-extrabold text-slate-900 mt-1">{metrics.acoesConcluidas}</p>
        </div>
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Aguardando Controle / Aprovadas</p>
          <p className="text-2xl font-extrabold text-slate-900 mt-1">
            {metrics.aguardandoControle} <span className="text-slate-300">/</span> {metrics.aprovadasControle}
          </p>
        </div>
        <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-sm">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Pagas / Canceladas / Atrasadas</p>
          <p className="text-2xl font-extrabold text-slate-900 mt-1">
            {metrics.pagas} <span className="text-slate-300">/</span> {metrics.canceladas} <span className="text-slate-300">/</span> {metrics.atrasadas}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Competência</span>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
          >
            {Array.from({ length: 12 }, (_, idx) => {
              const monthNumber = idx + 1;
              return (
                <option key={monthNumber} value={String(monthNumber)}>
                  {String(monthNumber).padStart(2, '0')}
                </option>
              );
            })}
          </select>
          <input
            type="number"
            min={2000}
            max={2100}
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
            className="w-28 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
          />
          <span className="text-xs text-slate-400">Orçamento usa esta competência.</span>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Provisão</span>
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <span className="font-medium">De</span>
            <input
              type="date"
              value={customDateFrom}
              onChange={(e) => setCustomDateFrom(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
            />
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <span className="font-medium">Até</span>
            <input
              type="date"
              value={customDateTo}
              min={customDateFrom || undefined}
              onChange={(e) => setCustomDateTo(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
            />
          </label>
          {(customDateFrom || customDateTo) && (
            <button
              type="button"
              onClick={() => {
                setCustomDateFrom('');
                setCustomDateTo('');
              }}
              className="px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
            >
              Limpar datas
            </button>
          )}
          <span className="text-xs text-slate-400">
            {customDateFrom || customDateTo
              ? 'Lista e indicadores filtram pela data de provisão (lançamento) no período informado.'
              : 'Sem datas personalizadas, a lista usa a competência pela data de provisão (lançamento).'}
          </span>
        </div>
      </div>

      {canFilterSectors && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Setores visíveis</span>
            {visibleSectorOptions.map((sector) => {
              const id = String(sector.id);
              const active = selectedSectorIds.length === 0 || selectedSectorSet.has(id);
              return (
                <button
                  key={id}
                  onClick={() => toggleSectorSelection(id)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors",
                    active
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
                  )}
                >
                  {sector.name}
                </button>
              );
            })}
            <button
              onClick={() => setSelectedSectorIds([])}
              className="ml-auto px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
            >
              Limpar seleção
            </button>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">
            Com nenhum setor selecionado, o sistema mostra todos os setores do seu perfil no orçamento e na lista de notas.
            Selecione um ou mais setores para filtrar cards e tabela.
          </p>
        </div>
      )}

      {canSeeAnnualTotal && (
      <div className="bg-[#004D40] rounded-2xl border border-emerald-900/20 shadow-lg p-5 text-white">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-200/80">Total Anual</p>
            <p className="text-sm text-emerald-100 mt-1">
              Compromissos do ano {selectedYear} (notas + requisições + lançamentos manuais) vs orçamento Síntase
            </p>
          </div>
          <div className="text-right">
            {annualTotals.budget > 0 || annualTotals.used > 0 ? (
              <>
                <p className="text-2xl font-extrabold">
                  <ValueTrace
                    displayValue={formatCurrency(annualTotals.used)}
                    meta={valueTrace.sectors.annualPendingAmount('Setores visíveis', Number(selectedYear))}
                    className="text-white"
                  />
                  <span className="text-emerald-300/70 font-normal mx-2">/</span>
                  <ValueTrace
                    displayValue={formatCurrency(annualTotals.budget)}
                    meta={valueTrace.sectors.annualBudget('Setores visíveis', Number(selectedYear), 100)}
                    className="text-white"
                  />
                </p>
                <p className="text-xs text-emerald-200/80 mt-1">
                  Notas no ano: {formatCurrency(annualTotals.invoices)}
                </p>
              </>
            ) : (
              <p className="text-sm text-emerald-200/80">Sem dados anuais para os setores visíveis.</p>
            )}
          </div>
        </div>
      </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {filteredBudgetSectors.map(sector => (
          <div
            key={sector.id}
            className={cn(
              "bg-white p-5 rounded-2xl border shadow-sms",
              canSeeSectorValues(sector.id) && (sector.pending_amount > getSectorBudget(sector))
                ? "border-red-200"
                : "border-slate-100"
            )}
          >
            <div className="flex justify-between items-start mb-4">
              <h4 className="font-bold text-slate-800">{sector.name}</h4>
              <span className="text-[10px] font-bold px-2 py-1 bg-slate-100 rounded-lg text-slate-500 uppercase">Orçamento</span>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-slate-400 font-medium">Utilizado no mês / Orçamento da Síntase</p>
              <p className="text-lg font-bold text-slate-900">
                {canSeeSectorValues(sector.id) ? (
                  <>
                    <ValueTrace
                      displayValue={formatCurrency(sector.pending_amount || 0)}
                      meta={valueTrace.sectors.pendingAmount(sector.name, Number(selectedMonth), Number(selectedYear))}
                    /> <span className="text-slate-300 font-normal">/ <ValueTrace
                      displayValue={formatCurrency(getSectorBudget(sector))}
                      meta={valueTrace.sectors.budgetMonth(
                        sector.name,
                        Number(selectedMonth),
                        Number(selectedYear),
                        Number(sector.occupancy_percent ?? 100)
                      )}
                    /></span>
                  </>
                ) : (
                  <span className="text-slate-400 font-medium">Valores ocultos</span>
                )}
              </p>
            </div>
            {canSeeSectorValues(sector.id) && (
              <div className="mt-3 grid grid-cols-1 gap-1 text-[11px] text-slate-500">
                <p>
                  Notas no mês (não canceladas):{' '}
                  <ValueTrace
                    className="font-semibold text-slate-700"
                    displayValue={formatCurrency(sector.pending_invoices || 0)}
                    meta={valueTrace.sectors.pendingInvoices(sector.name, Number(selectedMonth), Number(selectedYear))}
                  />
                </p>
                <p>
                  Requisições em aberto no mês:{' '}
                  <ValueTrace
                    className="font-semibold text-slate-700"
                    displayValue={formatCurrency(sector.pending_requisitions || 0)}
                    meta={valueTrace.sectors.pendingRequisitions(sector.name, Number(selectedMonth), Number(selectedYear))}
                  />
                </p>
                <p>
                  Lançamentos manuais em aberto no mês:{' '}
                  <ValueTrace
                    className="font-semibold text-slate-700"
                    displayValue={formatCurrency(sector.pending_manual_entries || 0)}
                    meta={valueTrace.sectors.pendingManualEntries(sector.name, Number(selectedMonth), Number(selectedYear))}
                  />
                </p>
                <p>
                  Orçamento da Síntase ({String(selectedMonth).padStart(2, '0')}/{selectedYear}):{' '}
                  <ValueTrace
                    className="font-semibold text-slate-700"
                    displayValue={formatCurrency(getSectorBudget(sector))}
                    meta={valueTrace.sectors.budgetMonth(
                      sector.name,
                      Number(selectedMonth),
                      Number(selectedYear),
                      Number(sector.occupancy_percent ?? 100)
                    )}
                  />
                </p>
                <p className="pt-1 border-t border-slate-100 mt-1">
                  <span className="font-bold text-slate-600 uppercase tracking-wide text-[10px]">Total anual {selectedYear}</span>
                  <br />
                  <ValueTrace
                    className="font-semibold text-slate-800"
                    displayValue={formatCurrency(sector.annual_pending_amount || 0)}
                    meta={valueTrace.sectors.annualPendingAmount(sector.name, Number(selectedYear))}
                  />
                  <span className="text-slate-400"> / </span>
                  <ValueTrace
                    className="font-semibold text-slate-800"
                    displayValue={formatCurrency(sector.annual_budget || 0)}
                    meta={valueTrace.sectors.annualBudget(
                      sector.name,
                      Number(selectedYear),
                      Number(sector.occupancy_percent ?? 100)
                    )}
                  />
                </p>
              </div>
            )}
            {canSeeSectorValues(sector.id) && (sector.pending_amount > getSectorBudget(sector)) && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                <p className="text-[11px] font-bold uppercase tracking-wide text-red-700">
                  Orçamento ultrapassado
                </p>
                <p className="text-xs text-red-700">
                  Excedido em{' '}
                  <ValueTrace
                    className="font-semibold text-red-700"
                    displayValue={formatCurrency((sector.pending_amount || 0) - getSectorBudget(sector))}
                    source={`Excedente — ${sector.name}`}
                    calculation="Compromissos do mês − orçamento Síntase do setor."
                  />
                </p>
              </div>
            )}
            <div className="w-full bg-slate-100 h-1.5 rounded-full mt-4 overflow-hidden">
              <div 
                className={cn(
                  "h-full transition-all duration-500",
                  (sector.pending_amount / Math.max(getSectorBudget(sector), 1)) > 1
                    ? "bg-red-500"
                    : (sector.pending_amount / Math.max(getSectorBudget(sector), 1)) > 0.9
                      ? "bg-orange-500"
                      : "bg-emerald-500"
                )}
                style={{ width: `${canSeeSectorValues(sector.id) ? Math.min((sector.pending_amount / Math.max(getSectorBudget(sector), 1)) * 100, 100) : 0}%` }}
              ></div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Buscar por fornecedor, número ou setor..."
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border-none rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 transition-all"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowReportModal(true)}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
            >
              <Filter className="w-4 h-4" />
              Relatório
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nota / Fornecedor</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Setor</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Lançado por</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Valor</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Vencimento</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Comprovante</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredInvoices.map((invoice) => (
                <tr key={invoice.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-900">#{invoice.invoice_number}</p>
                        <p className="text-xs text-slate-500">{invoice.provider_name}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-xs font-medium text-slate-600 bg-slate-100 px-2 py-1 rounded-lg">
                      {invoice.sector_name}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm font-medium text-slate-700">{invoice.user_name || '—'}</p>
                    {invoice.created_at && (
                      <p className="text-[10px] text-slate-400 mt-0.5">{formatDate(invoice.created_at)}</p>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {canSeeSectorValues(invoice.sector_id) ? (
                      <ValueTrace
                        className="text-sm font-bold text-slate-900"
                        displayValue={formatCurrency(invoice.amount)}
                        meta={valueTrace.invoices.amount(String(invoice.invoice_number), invoice.provider_name)}
                      />
                    ) : (
                      <span className="text-sm font-semibold text-slate-400">Valor oculto</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm text-slate-600">{formatDate(invoice.due_date)}</p>
                  </td>
                  <td className="px-6 py-4">
                    {(() => {
                      const flowStage = invoice.flow_stage || (invoice.status === 'paid' ? 'paid' : 'control_pending');
                      const statusUI = getStatusUI(flowStage, invoice.status);
                      const StatusIcon = statusUI.icon;
                      return (
                        <div className={cn(
                          "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                          statusUI.classes
                        )}>
                          <StatusIcon className="w-3 h-3" />
                          {statusUI.label}
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {invoice.file_path ? (
                        <button
                          onClick={() => openInvoiceDocument(invoice.id, 'file_path', invoice.file_path)}
                          className="text-xs font-medium text-blue-700 bg-blue-50 px-2 py-1 rounded-lg hover:bg-blue-100 transition-colors"
                        >
                          Ver NF
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">NF --</span>
                      )}
                      {invoice.payment_receipt_path ? (
                        <button
                          onClick={() => openInvoiceDocument(invoice.id, 'payment_receipt_path', invoice.payment_receipt_path)}
                          className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg hover:bg-emerald-100 transition-colors"
                        >
                          Ver Comp.
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">Comp. --</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {(invoice.file_path && (actingSector === 'controle' || actingSector === 'financeiro')) && (
                        <button
                          onClick={() => openInvoiceDocument(invoice.id, 'file_path', invoice.file_path)}
                          className="inline-flex items-center px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                          title="Visualizar nota fiscal"
                        >
                          Ver Nota Fiscal
                        </button>
                      )}
                      {(actingSector === 'controle' && (invoice.flow_stage || 'control_pending') === 'control_pending') && (
                        <>
                          <button 
                            onClick={() => approveByControl(invoice.id)}
                            className="inline-flex items-center px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                            title="Aprovar no Controle"
                          >
                            Aprovar (Controle)
                          </button>
                          <button
                            onClick={() => rejectByControl(invoice.id)}
                            className="inline-flex items-center px-3 py-1.5 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                            title="Reprovar nota (cancela a solicitação)"
                          >
                            Reprovar (Controle)
                          </button>
                        </>
                      )}
                      {(actingSector === 'controle' && (invoice.flow_stage || 'control_pending') === 'control_approved') && (
                        <button
                          onClick={() => disapproveByControl(invoice.id)}
                          className="inline-flex items-center px-3 py-1.5 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg transition-colors"
                          title="Desaprovar e devolver para o setor solicitante"
                        >
                          Desaprovar (Controle)
                        </button>
                      )}
                      {(actingSector === 'financeiro' && (invoice.flow_stage || 'control_pending') === 'control_approved') && (
                        <button 
                          onClick={() => markAsPaid(invoice.id)}
                          className="inline-flex items-center px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors"
                          title="Marcar como pago e anexar comprovante"
                        >
                          Marcar como Pago
                        </button>
                      )}
                      {(actingSector === 'requester' &&
                        (invoice.flow_stage || 'control_pending') !== 'paid' &&
                        (invoice.flow_stage || 'control_pending') !== 'cancelled' &&
                        invoice.status !== 'paid') && (
                        <button
                          onClick={() => cancelRequest(invoice.id)}
                          className="inline-flex items-center px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                          title="Cancelar solicitação (para corrigir e lançar novamente)"
                        >
                          Cancelar Solicitação
                        </button>
                      )}
                      {!(
                        (actingSector === 'controle' && (invoice.flow_stage || 'control_pending') === 'control_pending') ||
                        (actingSector === 'controle' && (invoice.flow_stage || 'control_pending') === 'control_approved') ||
                        (actingSector === 'financeiro' && (invoice.flow_stage || 'control_pending') === 'control_approved') ||
                        (actingSector === 'requester' && (invoice.flow_stage || 'control_pending') !== 'paid' && (invoice.flow_stage || 'control_pending') !== 'cancelled' && invoice.status !== 'paid')
                      ) && (
                        <span className="text-xs text-slate-400 px-2">Sem ação neste perfil</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-lg max-h-[calc(100dvh-2rem)] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center shrink-0">
              <h3 className="text-xl font-bold text-slate-900">Lançar Nota Fiscal</h3>
              <button onClick={closeInvoiceModal} className="text-slate-400 hover:text-slate-600 transition-colors">
                <Plus className="w-6 h-6 rotate-45" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1">
              <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">PDF da Nota Fiscal</label>
                <label className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-slate-50 border border-dashed border-slate-300 rounded-xl text-sm text-slate-600 cursor-pointer hover:bg-slate-100 transition-colors">
                  <Upload className="w-4 h-4" />
                  <span>{extractingPdf ? 'Lendo PDF...' : 'Selecionar PDF e preencher automaticamente'}</span>
                  <input
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handlePdfUpload(file);
                    }}
                  />
                </label>
                {formData.file_path && (
                  <p className="text-[11px] text-emerald-700 font-medium">PDF processado com sucesso.</p>
                )}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Boleto (PDF)</label>
                  <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-600 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={semBoleto}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setSemBoleto(checked);
                        if (checked) {
                          setFormData((prev) => ({ ...prev, boleto_file_path: '' }));
                        }
                      }}
                      className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    Sem boleto
                  </label>
                </div>
                {semBoleto ? (
                  <p className="text-[11px] text-slate-500">Pagamento sem boleto anexo (ex.: Pix, cartão ou dinheiro).</p>
                ) : (
                  <>
                    <label className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-slate-50 border border-dashed border-slate-300 rounded-xl text-sm text-slate-600 cursor-pointer hover:bg-slate-100 transition-colors">
                      <Upload className="w-4 h-4" />
                      <span>{uploadingBoleto ? 'Enviando boleto...' : 'Selecionar boleto em PDF (opcional)'}</span>
                      <input
                        type="file"
                        accept="application/pdf"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleBoletoUpload(file);
                        }}
                      />
                    </label>
                    {formData.boleto_file_path && (
                      <p className="text-[11px] text-emerald-700 font-medium">Boleto anexado com sucesso.</p>
                    )}
                  </>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Setor Responsável</label>
                <select 
                  required
                  value={formData.sector_id}
                  onChange={e => setFormData({...formData, sector_id: e.target.value, crd: ''})}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                >
                  <option value="">Selecione um setor</option>
                  {sectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Natureza</label>
                  <select
                    value={formData.natureza}
                    onChange={(e) => setFormData({ ...formData, natureza: e.target.value })}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  >
                    <option value="M">M - Mensal</option>
                    <option value="O">O - Operacional</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">CRD</label>
                  <SearchableSelect
                    value={formData.crd}
                    onChange={(crd) => setFormData({ ...formData, crd })}
                    options={crdSelectOptions}
                    disabled={!formData.sector_id}
                    placeholder={formData.sector_id ? 'Digite para buscar CRD...' : 'Selecione um setor primeiro'}
                    emptyMessage={formData.sector_id ? 'Nenhum CRD neste setor' : 'Selecione um setor primeiro'}
                    noResultsMessage="Nenhum CRD encontrado"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Forma de pagamento</label>
                <select
                  required
                  value={formData.payment_method}
                  onChange={(e) => setFormData({ ...formData, payment_method: e.target.value, pix_key: e.target.value === 'pix' ? formData.pix_key : '' })}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                >
                  <option value="">Selecione</option>
                  {paymentMethods.filter((pm) => pm.active).map((pm) => (
                    <option key={pm.id} value={pm.key}>{pm.name}</option>
                  ))}
                </select>
              </div>

              {formData.payment_method === 'pix' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Chave Pix</label>
                  <input
                    required
                    value={formData.pix_key}
                    onChange={(e) => setFormData({ ...formData, pix_key: e.target.value })}
                    placeholder="CPF/CNPJ, e-mail, telefone ou chave aleatória"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Número da Nota</label>
                  <input 
                    required
                    value={formData.invoice_number}
                    onChange={e => setFormData({...formData, invoice_number: e.target.value})}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Valor (R$)</label>
                  <input 
                    required
                    type="number"
                    step="0.01"
                    value={formData.amount}
                    onChange={e => setFormData({...formData, amount: e.target.value})}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Fornecedor</label>
                <input 
                  required
                  value={formData.provider_name}
                  onChange={e => setFormData({...formData, provider_name: e.target.value})}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Data de Emissão</label>
                  <input 
                    required
                    type="date"
                    value={formData.issue_date}
                    onChange={e => setFormData({...formData, issue_date: e.target.value})}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Data de Vencimento</label>
                  <input 
                    required
                    type="date"
                    value={formData.due_date}
                    onChange={e => setFormData({...formData, due_date: e.target.value})}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                  />
                </div>
              </div>
              </div>

              <div className="p-6 pt-4 border-t border-slate-100 flex gap-3 shrink-0 bg-white">
                <button 
                  type="button"
                  onClick={closeInvoiceModal}
                  className="flex-1 px-4 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="flex-1 px-4 py-3 bg-[#004D40] text-white font-bold rounded-xl hover:bg-[#003d33] shadow-lg shadow-emerald-900/10 transition-colors"
                >
                  Salvar Nota
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showReceiptModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-xl font-bold text-slate-900">Anexar Comprovante</h3>
              <button
                onClick={() => setShowReceiptModal(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <Plus className="w-6 h-6 rotate-45" />
              </button>
            </div>

            <form onSubmit={submitReceiptAndPay} className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Arquivo do comprovante (PDF, PNG ou JPG)
                </label>
                <input
                  type="file"
                  accept="application/pdf,image/png,image/jpeg"
                  required
                  onChange={(e) => setReceiptFile(e.target.files?.[0] || null)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                />
                {receiptFile && (
                  <p className="text-[11px] text-slate-500">Selecionado: {receiptFile.name}</p>
                )}
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowReceiptModal(false)}
                  className="flex-1 px-4 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={uploadingReceipt}
                  className="flex-1 px-4 py-3 bg-[#004D40] text-white font-bold rounded-xl hover:bg-[#003d33] shadow-lg shadow-emerald-900/10 transition-colors disabled:opacity-70"
                >
                  {uploadingReceipt ? 'Enviando...' : 'Salvar e marcar como pago'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showReportModal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-xl font-bold text-slate-900">Relatório de Notas para Pagamento</h3>
              <button
                onClick={() => setShowReportModal(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <Plus className="w-6 h-6 rotate-45" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Vencimento (de)</label>
                  <input
                    type="date"
                    value={reportFilters.from}
                    onChange={(e) => setReportFilters((p) => ({ ...p, from: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Vencimento (até)</label>
                  <input
                    type="date"
                    value={reportFilters.to}
                    onChange={(e) => setReportFilters((p) => ({ ...p, to: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Forma de pagamento</label>
                <select
                  value={reportFilters.payment_method}
                  onChange={(e) => setReportFilters((p) => ({ ...p, payment_method: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                >
                  <option value="">Todas</option>
                  {paymentMethods.filter((pm) => pm.active).map((pm) => (
                    <option key={pm.id} value={pm.key}>{pm.name}</option>
                  ))}
                </select>
              </div>

              <div className="pt-2 flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={() => setReportFilters({ from: '', to: '', payment_method: '' })}
                  disabled={!!exportingReport}
                  className="flex-1 px-4 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-colors disabled:opacity-60"
                >
                  Limpar filtros
                </button>
                <button
                  type="button"
                  onClick={() => downloadInvoiceReport('csv')}
                  disabled={!!exportingReport}
                  className="flex-1 px-4 py-3 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-60"
                >
                  {exportingReport === 'csv' ? 'Exportando CSV...' : 'Exportar CSV'}
                </button>
                <button
                  type="button"
                  onClick={() => downloadInvoiceReport('pdf')}
                  disabled={!!exportingReport}
                  className="flex-1 px-4 py-3 bg-[#004D40] text-white font-bold rounded-xl hover:bg-[#003d33] shadow-lg shadow-emerald-900/10 transition-colors disabled:opacity-60"
                >
                  {exportingReport === 'pdf' ? 'Exportando PDF...' : 'Exportar PDF'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
