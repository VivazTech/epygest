import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarClock, Plus, RefreshCcw, Trash2, Pencil, X, Banknote } from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import { confirmDelete } from '../lib/confirmAction';
import { SearchableSelect } from '../components/SearchableSelect';
import { useSearch } from '../context/SearchContext';
import { matchesSearch } from '../lib/search';

type ContratoStatus = 'ativo' | 'vencido' | 'pendente_assinatura' | 'encerrado';
type Periodicidade = 'unica' | 'mensal' | 'trimestral' | 'semestral' | 'anual';

type Contrato = {
  id: number;
  fornecedor: string;
  valor: number;
  status: ContratoStatus;
  ativo: boolean;
  assinado: boolean;
  sector_id: number | null;
  sector_name: string | null;
  crd_id: number | null;
  crd_label: string | null;
  vencimento: string | null;
  periodicidade: Periodicidade;
  responsavel: string | null;
  observacoes: string | null;
  dias_para_vencer: number | null;
  alerta_vencimento: boolean;
};

const STATUS_LABELS: Record<ContratoStatus, string> = {
  ativo: 'Ativo',
  vencido: 'Vencido',
  pendente_assinatura: 'Pendente assinatura',
  encerrado: 'Encerrado',
};

const PERIOD_LABELS: Record<Periodicidade, string> = {
  unica: 'Única',
  mensal: 'Mensal',
  trimestral: 'Trimestral',
  semestral: 'Semestral',
  anual: 'Anual',
};

const EMPTY_FORM = {
  fornecedor: '',
  valor: '',
  status: 'ativo' as ContratoStatus,
  ativo: true,
  assinado: false,
  sector_id: '',
  crd_id: '',
  vencimento: '',
  periodicidade: 'mensal' as Periodicidade,
  responsavel: '',
  observacoes: '',
};

type ContratoLancamento = {
  id: number;
  contrato_id: number;
  competencia: string;
  valor: number;
  status: string;
  fornecedor: string | null;
  sector_name: string | null;
  vencimento: string | null;
};

const FLOW_STATUS_LABELS: Record<string, { label: string; classes: string }> = {
  open: { label: 'Aguardando Controle', classes: 'bg-orange-100 text-orange-700' },
  approved: { label: 'Aprovado Controle', classes: 'bg-blue-100 text-blue-700' },
  posted: { label: 'Pago', classes: 'bg-emerald-100 text-emerald-700' },
  cancelled: { label: 'Cancelado', classes: 'bg-slate-200 text-slate-700' },
};

export const MensalidadesPage: React.FC = () => {
  const { query } = useSearch();
  const [rows, setRows] = useState<Contrato[]>([]);
  const [sectors, setSectors] = useState<Array<{ id: number; name: string }>>([]);
  const [crds, setCrds] = useState<Array<{ id: number; code: string; name: string; sector_id: number | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sectorFilter, setSectorFilter] = useState('');
  const [onlyAlerts, setOnlyAlerts] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [lancamentos, setLancamentos] = useState<ContratoLancamento[]>([]);
  const [solicitandoId, setSolicitandoId] = useState<number | null>(null);

  const ALERT_DAYS = 30;

  const load = async () => {
    setLoading(true);
    try {
      const [cRes, sRes, crdRes, lRes] = await Promise.all([
        fetch('/api/contratos'),
        fetch('/api/sectors'),
        fetch('/api/crds'),
        fetch('/api/contrato-lancamentos'),
      ]);
      const cJson = await cRes.json();
      const sJson = await sRes.json();
      const crdJson = await crdRes.json();
      const lJson = await lRes.json().catch(() => []);
      if (!cRes.ok) {
        alert(cJson.error || 'Erro ao carregar contratos');
        setRows([]);
      } else {
        setRows(Array.isArray(cJson) ? cJson : cJson.rows || []);
      }
      setSectors(
        Array.isArray(sJson)
          ? sJson.map((s: any) => ({ id: Number(s.id), name: String(s.name || '') }))
          : []
      );
      const crdList = Array.isArray(crdJson) ? crdJson : crdJson.rows || crdJson.data || [];
      setCrds(
        crdList
          .filter((c: any) => c.active !== false)
          .map((c: any) => ({
            id: Number(c.id),
            code: String(c.code || ''),
            name: String(c.name || c.detalhado || ''),
            sector_id: c.sector_id != null ? Number(c.sector_id) : null,
          }))
      );
      setLancamentos(Array.isArray(lJson) ? lJson : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const sectorOptions = useMemo(
    () => sectors.map((s) => ({ value: String(s.id), label: s.name })),
    [sectors]
  );

  const crdOptions = useMemo(() => {
    const sectorId = form.sector_id ? Number(form.sector_id) : null;
    return crds
      .filter((c) => !sectorId || c.sector_id === sectorId)
      .map((c) => ({
        value: String(c.id),
        label: c.code && c.name ? `${c.code} — ${c.name}` : c.name || c.code,
        keywords: `${c.code} ${c.name}`,
      }));
  }, [crds, form.sector_id]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (sectorFilter && String(r.sector_id) !== sectorFilter) return false;
      if (onlyAlerts && !r.alerta_vencimento) return false;
      return matchesSearch(
        query,
        r.fornecedor,
        r.responsavel,
        r.sector_name,
        r.crd_label,
        r.status,
        r.observacoes,
        r.valor
      );
    });
  }, [rows, statusFilter, sectorFilter, onlyAlerts, query]);

  const counts = useMemo(() => {
    const base = {
      ativo: 0,
      vencido: 0,
      pendente_assinatura: 0,
      encerrado: 0,
      alertas: 0,
      total_valor_ativos: 0,
    };
    for (const r of rows) {
      base[r.status] += 1;
      if (r.alerta_vencimento) base.alertas += 1;
      if (r.status === 'ativo') base.total_valor_ativos += Number(r.valor) || 0;
    }
    return base;
  }, [rows]);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };

  const openEdit = (row: Contrato) => {
    setEditingId(row.id);
    setForm({
      fornecedor: row.fornecedor,
      valor: String(row.valor ?? ''),
      status: row.status,
      ativo: row.ativo,
      assinado: row.assinado,
      sector_id: row.sector_id != null ? String(row.sector_id) : '',
      crd_id: row.crd_id != null ? String(row.crd_id) : '',
      vencimento: row.vencimento ? String(row.vencimento).slice(0, 10) : '',
      periodicidade: row.periodicidade || 'mensal',
      responsavel: row.responsavel || '',
      observacoes: row.observacoes || '',
    });
    setFormOpen(true);
  };

  const save = async () => {
    if (!form.fornecedor.trim()) {
      alert('Informe o fornecedor.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        fornecedor: form.fornecedor.trim(),
        valor: Number(form.valor) || 0,
        status: form.status,
        ativo: form.ativo,
        assinado: form.assinado,
        sector_id: form.sector_id ? Number(form.sector_id) : null,
        crd_id: form.crd_id ? Number(form.crd_id) : null,
        vencimento: form.vencimento || null,
        periodicidade: form.periodicidade,
        responsavel: form.responsavel.trim() || null,
        observacoes: form.observacoes.trim() || null,
      };
      const res = await fetch(editingId ? `/api/contratos/${editingId}` : '/api/contratos', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(json.error || 'Erro ao salvar');
        return;
      }
      setFormOpen(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
      load();
    } finally {
      setSaving(false);
    }
  };

  const lancamentoByContrato = useMemo(() => {
    const map = new Map<number, ContratoLancamento>();
    for (const l of lancamentos) {
      const existing = map.get(l.contrato_id);
      if (!existing || l.id > existing.id) map.set(l.contrato_id, l);
    }
    return map;
  }, [lancamentos]);

  const solicitarPagamento = async (row: Contrato) => {
    if (row.status === 'encerrado' || !row.ativo) {
      alert('Contrato inativo ou encerrado.');
      return;
    }
    const pending = lancamentoByContrato.get(row.id);
    if (pending && (pending.status === 'open' || pending.status === 'approved')) {
      alert('Já existe um pagamento pendente para este contrato.');
      return;
    }
    if (!window.confirm(`Solicitar pagamento de ${formatCurrency(Number(row.valor) || 0)} para ${row.fornecedor}?`)) {
      return;
    }
    setSolicitandoId(row.id);
    try {
      const res = await fetch(`/api/contratos/${row.id}/lancamentos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          competencia: row.vencimento || new Date().toISOString().slice(0, 10),
          valor: row.valor,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || 'Não foi possível solicitar o pagamento.');
        return;
      }
      load();
    } finally {
      setSolicitandoId(null);
    }
  };

  const remove = async (row: Contrato) => {
    if (!confirmDelete(`o contrato de "${row.fornecedor}"`)) return;
    const res = await fetch(`/api/contratos/${row.id}`, { method: 'DELETE' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(json.error || 'Erro ao excluir');
      return;
    }
    load();
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Mensalidades</h2>
          <p className="text-sm text-slate-500 mt-1 max-w-3xl">
            Contratos e mensalidades por setor e CRD — ativos, vencidos, pendentes de assinatura e alertas de vencimento ({ALERT_DAYS} dias).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-semibold rounded-xl hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCcw className="w-4 h-4" />
            Atualizar
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#004D40] text-white text-sm font-bold rounded-xl hover:bg-[#003d33]"
          >
            <Plus className="w-4 h-4" />
            Novo contrato
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi label="Ativos" value={String(counts.ativo)} />
        <Kpi label="Vencidos" value={String(counts.vencido)} danger={counts.vencido > 0} />
        <Kpi label="Pend. assinatura" value={String(counts.pendente_assinatura)} />
        <Kpi label="Alertas (30d)" value={String(counts.alertas)} danger={counts.alertas > 0} />
        <Kpi label="Valor ativos" value={formatCurrency(counts.total_valor_ativos)} />
      </div>

      {counts.alertas > 0 && (
        <div className="flex items-center gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {counts.alertas} contrato(s) vencem nos próximos {ALERT_DAYS} dias ou já venceram.
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-50 flex flex-wrap items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
          >
            <option value="all">Todos os status</option>
            {(Object.keys(STATUS_LABELS) as ContratoStatus[]).map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
          <select
            value={sectorFilter}
            onChange={(e) => setSectorFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
          >
            <option value="">Todos os setores</option>
            {sectors.map((s) => (
              <option key={s.id} value={String(s.id)}>{s.name}</option>
            ))}
          </select>
          <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer select-none px-2">
            <input
              type="checkbox"
              checked={onlyAlerts}
              onChange={(e) => setOnlyAlerts(e.target.checked)}
              className="rounded border-slate-300"
            />
            Só alertas de vencimento
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Fornecedor</th>
                <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Setor</th>
                <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">CRD</th>
                <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Valor</th>
                <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Periodicidade</th>
                <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Vencimento</th>
                <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</th>
                <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Pagamento</th>
                <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Responsável</th>
                <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading && (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-sm text-slate-400">Carregando...</td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-sm text-slate-400">
                    Nenhum contrato encontrado.
                  </td>
                </tr>
              )}
              {filtered.map((row) => (
                <tr
                  key={row.id}
                  className={cn(
                    'hover:bg-slate-50/60 transition-colors',
                    row.alerta_vencimento && 'bg-amber-50/50',
                    row.status === 'vencido' && 'bg-red-50/40'
                  )}
                >
                  <td className="px-4 py-3 text-sm font-medium text-slate-800">
                    <div className="flex items-center gap-2">
                      {row.fornecedor}
                      {row.alerta_vencimento && (
                        <CalendarClock className="w-3.5 h-3.5 text-amber-600" aria-label="Próximo do vencimento" />
                      )}
                      {!row.assinado && row.status !== 'encerrado' && (
                        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 border border-slate-200 px-1.5 py-0.5 rounded">
                          não assinado
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">{row.sector_name || '—'}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 max-w-[180px] truncate" title={row.crd_label || ''}>
                    {row.crd_label || '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-right tabular-nums font-semibold text-slate-800">
                    {formatCurrency(Number(row.valor) || 0)}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">{PERIOD_LABELS[row.periodicidade] || row.periodicidade}</td>
                  <td className="px-4 py-3 text-sm text-slate-700">
                    {row.vencimento || '—'}
                    {row.dias_para_vencer != null && (
                      <span className={cn(
                        'block text-[10px] font-semibold',
                        row.dias_para_vencer < 0 ? 'text-red-600' : row.dias_para_vencer <= ALERT_DAYS ? 'text-amber-700' : 'text-slate-400'
                      )}>
                        {row.dias_para_vencer < 0
                          ? `${Math.abs(row.dias_para_vencer)}d atrasado`
                          : `${row.dias_para_vencer}d restantes`}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="px-4 py-3">
                    {(() => {
                      const lanc = lancamentoByContrato.get(row.id);
                      if (!lanc) return <span className="text-xs text-slate-400">—</span>;
                      const meta = FLOW_STATUS_LABELS[lanc.status] || { label: lanc.status, classes: 'bg-slate-100 text-slate-700' };
                      return (
                        <span className={cn('text-[10px] font-bold px-2 py-1 rounded-lg uppercase tracking-wider', meta.classes)}>
                          {meta.label}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">{row.responsavel || '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      {row.status !== 'encerrado' && row.ativo && (
                        <button
                          type="button"
                          onClick={() => solicitarPagamento(row)}
                          disabled={solicitandoId === row.id}
                          className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg disabled:opacity-50"
                          title="Solicitar pagamento"
                        >
                          <Banknote className="w-4 h-4" />
                        </button>
                      )}
                      <button type="button" onClick={() => openEdit(row)} className="p-2 text-slate-400 hover:text-[#004D40] hover:bg-emerald-50 rounded-lg" title="Editar">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => remove(row)} className="p-2 text-red-400 hover:bg-red-50 rounded-lg" title="Excluir">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {lancamentos.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-50">
            <h3 className="text-sm font-bold text-slate-900">Lançamentos de pagamento</h3>
            <p className="text-xs text-slate-500 mt-0.5">Solicitações enviadas para aprovação do Controle e pagamento do Financeiro.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-slate-50/50">
                  <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Fornecedor</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Competência</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Valor</th>
                  <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {lancamentos.map((l) => {
                  const meta = FLOW_STATUS_LABELS[l.status] || { label: l.status, classes: 'bg-slate-100 text-slate-700' };
                  return (
                    <tr key={l.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3 text-sm text-slate-800">{l.fornecedor || '—'}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{l.competencia}</td>
                      <td className="px-4 py-3 text-sm text-right font-semibold tabular-nums">{formatCurrency(l.valor)}</td>
                      <td className="px-4 py-3">
                        <span className={cn('text-[10px] font-bold px-2 py-1 rounded-lg uppercase tracking-wider', meta.classes)}>
                          {meta.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button type="button" className="absolute inset-0 bg-slate-900/40" aria-label="Fechar" onClick={() => setFormOpen(false)} />
          <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-100 max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">
                {editingId ? 'Editar contrato' : 'Novo contrato / mensalidade'}
              </h3>
              <button type="button" onClick={() => setFormOpen(false)} className="p-1.5 text-slate-400 hover:bg-slate-50 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field className="sm:col-span-2" label="Fornecedor *">
                <input
                  value={form.fornecedor}
                  onChange={(e) => setForm((p) => ({ ...p, fornecedor: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                />
              </Field>
              <Field label="Valor">
                <input
                  type="number"
                  step="0.01"
                  value={form.valor}
                  onChange={(e) => setForm((p) => ({ ...p, valor: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                />
              </Field>
              <Field label="Periodicidade">
                <select
                  value={form.periodicidade}
                  onChange={(e) => setForm((p) => ({ ...p, periodicidade: e.target.value as Periodicidade }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                >
                  {(Object.keys(PERIOD_LABELS) as Periodicidade[]).map((p) => (
                    <option key={p} value={p}>{PERIOD_LABELS[p]}</option>
                  ))}
                </select>
              </Field>
              <Field label="Status">
                <select
                  value={form.status}
                  onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as ContratoStatus }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                >
                  {(Object.keys(STATUS_LABELS) as ContratoStatus[]).map((s) => (
                    <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                  ))}
                </select>
              </Field>
              <Field label="Vencimento">
                <input
                  type="date"
                  value={form.vencimento}
                  onChange={(e) => setForm((p) => ({ ...p, vencimento: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                />
              </Field>
              <Field label="Setor">
                <SearchableSelect
                  value={form.sector_id}
                  onChange={(v) => setForm((p) => ({ ...p, sector_id: v, crd_id: '' }))}
                  options={sectorOptions}
                  placeholder="Selecionar setor"
                />
              </Field>
              <Field label="CRD">
                <SearchableSelect
                  value={form.crd_id}
                  onChange={(v) => setForm((p) => ({ ...p, crd_id: v }))}
                  options={crdOptions}
                  placeholder="Selecionar CRD"
                  emptyMessage="Nenhum CRD neste setor"
                />
              </Field>
              <Field label="Responsável">
                <input
                  value={form.responsavel}
                  onChange={(e) => setForm((p) => ({ ...p, responsavel: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                />
              </Field>
              <div className="flex items-center gap-4 sm:col-span-2 pt-1">
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600">
                  <input type="checkbox" checked={form.ativo} onChange={(e) => setForm((p) => ({ ...p, ativo: e.target.checked }))} className="rounded border-slate-300" />
                  Ativo
                </label>
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600">
                  <input type="checkbox" checked={form.assinado} onChange={(e) => setForm((p) => ({ ...p, assinado: e.target.checked }))} className="rounded border-slate-300" />
                  Assinado
                </label>
              </div>
              <Field className="sm:col-span-2" label="Observações">
                <textarea
                  rows={3}
                  value={form.observacoes}
                  onChange={(e) => setForm((p) => ({ ...p, observacoes: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm resize-y"
                />
              </Field>
            </div>
            <div className="sticky bottom-0 bg-white border-t border-slate-100 px-5 py-4 flex justify-end gap-2">
              <button type="button" onClick={() => setFormOpen(false)} className="px-4 py-2 text-sm font-semibold text-slate-600 rounded-xl hover:bg-slate-50">
                Cancelar
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="px-4 py-2 text-sm font-bold text-white bg-[#004D40] rounded-xl hover:bg-[#003d33] disabled:opacity-60"
              >
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const Kpi: React.FC<{ label: string; value: string; danger?: boolean }> = ({ label, value, danger }) => (
  <div className={cn('rounded-2xl border p-4', danger ? 'border-amber-200 bg-amber-50/50' : 'border-slate-100 bg-white shadow-sm')}>
    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</p>
    <p className={cn('mt-1 text-lg font-bold tabular-nums', danger ? 'text-amber-800' : 'text-slate-900')}>{value}</p>
  </div>
);

const StatusBadge: React.FC<{ status: ContratoStatus }> = ({ status }) => {
  const styles: Record<ContratoStatus, string> = {
    ativo: 'bg-emerald-100 text-emerald-700',
    vencido: 'bg-red-100 text-red-700',
    pendente_assinatura: 'bg-amber-100 text-amber-800',
    encerrado: 'bg-slate-200 text-slate-600',
  };
  return (
    <span className={cn('text-[10px] font-bold px-2 py-1 rounded-lg uppercase tracking-wider', styles[status])}>
      {STATUS_LABELS[status]}
    </span>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode; className?: string }> = ({ label, children, className }) => (
  <div className={cn('space-y-1', className)}>
    <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</label>
    {children}
  </div>
);
