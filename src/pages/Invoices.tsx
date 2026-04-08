import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  Filter, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  FileText,
  Upload,
  BadgeCheck
} from 'lucide-react';
import { cn, formatCurrency, formatDate } from '../lib/utils';

export const Invoices: React.FC = () => {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [sectors, setSectors] = useState<any[]>([]);
  const [actingSector, setActingSector] = useState<'requester' | 'controle' | 'financeiro'>('requester');
  const [showModal, setShowModal] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<number | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [extractingPdf, setExtractingPdf] = useState(false);
  const [formData, setFormData] = useState({
    invoice_number: '',
    provider_name: '',
    amount: '',
    issue_date: '',
    due_date: '',
    sector_id: '',
    file_path: ''
  });

  useEffect(() => {
    fetchInvoices();
    fetchSectors();
  }, []);

  const fetchInvoices = () => {
    fetch('/api/invoices')
      .then(res => res.json())
      .then(data => setInvoices(data));
  };

  const fetchSectors = () => {
    fetch('/api/sectors')
      .then(res => res.json())
      .then(data => setSectors(data));
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
        file_path: data.file_path || prev.file_path
      }));

      if (data.warning) {
        alert(data.warning);
      }
    } catch (error: any) {
      alert(error.message || 'Não foi possível processar o PDF.');
    } finally {
      setExtractingPdf(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.file_path) {
      alert('Anexe o PDF da nota fiscal para continuar.');
      return;
    }
    const response = await fetch('/api/invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...formData,
        amount: parseFloat(formData.amount),
        sector_id: parseInt(formData.sector_id),
        user_id: 1 // Mock logged user
      })
    });
    if (response.ok) {
      setShowModal(false);
      setFormData({ invoice_number: '', provider_name: '', amount: '', issue_date: '', due_date: '', sector_id: '', file_path: '' });
      fetchInvoices();
    }
  };

  const runFlowAction = async (id: number, action: 'approve_control' | 'mark_paid', payment_receipt_path?: string) => {
    const response = await fetch(`/api/invoices/${id}/flow`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        actorSector: actingSector.toUpperCase(),
        payment_receipt_path
      })
    });
    if (!response.ok) {
      const data = await response.json();
      alert(data.error || 'Não foi possível atualizar o fluxo da nota.');
      return false;
    }
    fetchInvoices();
    return true;
  };

  const approveByControl = (id: number) => runFlowAction(id, 'approve_control');

  const markAsPaid = (id: number) => {
    setSelectedInvoiceId(id);
    setReceiptFile(null);
    setShowReceiptModal(true);
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
    if (flowStage === 'control_approved') {
      return { label: 'Aprovado Controle', icon: BadgeCheck, classes: 'bg-blue-100 text-blue-700' };
    }
    if (status === 'overdue') {
      return { label: 'Atrasado', icon: AlertCircle, classes: 'bg-red-100 text-red-700' };
    }
    return { label: 'Aguardando Controle', icon: Clock, classes: 'bg-orange-100 text-orange-700' };
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Controle de Notas Fiscais</h2>
          <p className="text-slate-500 text-sm">Fluxo: Setor solicitante importa → Controle aprova → Financeiro paga e anexa comprovante.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <select
            value={actingSector}
            onChange={(e) => setActingSector(e.target.value as 'requester' | 'controle' | 'financeiro')}
            className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-700"
          >
            <option value="requester">Perfil de teste: Setor Solicitante</option>
            <option value="controle">Perfil de teste: CONTROLE</option>
            <option value="financeiro">Perfil de teste: FINANCEIRO</option>
          </select>
          <button 
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-[#004D40] text-white px-4 py-2.5 rounded-xl shadow-lg shadow-emerald-900/10 hover:bg-[#003d33] transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span className="font-bold text-sm">Importar Nota</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {sectors.map(sector => (
          <div key={sector.id} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
            <div className="flex justify-between items-start mb-4">
              <h4 className="font-bold text-slate-800">{sector.name}</h4>
              <span className="text-[10px] font-bold px-2 py-1 bg-slate-100 rounded-lg text-slate-500 uppercase">Orçamento</span>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-slate-400 font-medium">Utilizado / Limite</p>
              <p className="text-lg font-bold text-slate-900">
                {formatCurrency(sector.pending_amount || 0)} <span className="text-slate-300 font-normal">/ {formatCurrency(sector.budget_limit)}</span>
              </p>
            </div>
            <div className="w-full bg-slate-100 h-1.5 rounded-full mt-4 overflow-hidden">
              <div 
                className={cn(
                  "h-full transition-all duration-500",
                  (sector.pending_amount / sector.budget_limit) > 0.9 ? "bg-orange-500" : "bg-emerald-500"
                )}
                style={{ width: `${Math.min((sector.pending_amount / sector.budget_limit) * 100, 100)}%` }}
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
            <button className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 rounded-lg transition-colors">
              <Filter className="w-4 h-4" />
              Filtrar
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nota / Fornecedor</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Setor</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Valor</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Vencimento</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Comprovante</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {invoices.map((invoice) => (
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
                    <p className="text-sm font-bold text-slate-900">{formatCurrency(invoice.amount)}</p>
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
                        <a
                          href={invoice.file_path.startsWith('/') ? invoice.file_path : `/${invoice.file_path}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-medium text-blue-700 bg-blue-50 px-2 py-1 rounded-lg hover:bg-blue-100 transition-colors"
                        >
                          Ver NF
                        </a>
                      ) : (
                        <span className="text-xs text-slate-400">NF --</span>
                      )}
                      {invoice.payment_receipt_path ? (
                        <a
                          href={invoice.payment_receipt_path.startsWith('/') ? invoice.payment_receipt_path : `/${invoice.payment_receipt_path}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg hover:bg-emerald-100 transition-colors"
                        >
                          Ver Comp.
                        </a>
                      ) : (
                        <span className="text-xs text-slate-400">Comp. --</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      {(invoice.file_path && (actingSector === 'controle' || actingSector === 'financeiro')) && (
                        <a
                          href={invoice.file_path.startsWith('/') ? invoice.file_path : `/${invoice.file_path}`}
                          target="_blank"
                          rel="noreferrer"
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Visualizar PDF da nota"
                        >
                          <FileText className="w-4 h-4" />
                        </a>
                      )}
                      {(actingSector === 'controle' && (invoice.flow_stage || 'control_pending') === 'control_pending') && (
                        <button 
                          onClick={() => approveByControl(invoice.id)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Aprovar no Controle"
                        >
                          <BadgeCheck className="w-4 h-4" />
                        </button>
                      )}
                      {(actingSector === 'financeiro' && (invoice.flow_stage || 'control_pending') === 'control_approved') && (
                        <button 
                          onClick={() => markAsPaid(invoice.id)}
                          className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                          title="Marcar como pago e anexar comprovante"
                        >
                          <Upload className="w-4 h-4" />
                        </button>
                      )}
                      {!((actingSector === 'controle' && (invoice.flow_stage || 'control_pending') === 'control_pending') || (actingSector === 'financeiro' && (invoice.flow_stage || 'control_pending') === 'control_approved')) && (
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
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-xl font-bold text-slate-900">Lançar Nota Fiscal</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <Plus className="w-6 h-6 rotate-45" />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
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

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Setor Responsável</label>
                <select 
                  required
                  value={formData.sector_id}
                  onChange={e => setFormData({...formData, sector_id: e.target.value})}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                >
                  <option value="">Selecione um setor</option>
                  {sectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              <div className="pt-4 flex gap-3">
                <button 
                  type="button"
                  onClick={() => setShowModal(false)}
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
    </div>
  );
};
