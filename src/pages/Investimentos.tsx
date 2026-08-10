import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Landmark, Plus, RefreshCcw, Trash2, Pencil, X } from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import { SearchableSelect } from '../components/SearchableSelect';
import { useSearch } from '../context/SearchContext';
import { matchesSearch } from '../lib/search';

type InvestimentoStatus = 'planejado' | 'em_andamento' | 'concluido' | 'cancelado';

type Investimento = {
  id: number;
  nome: string;
  valor_previsto: number;
  valor_lancado: number;
  valor_realizado: number;
  saldo_a_realizar: number;
  pct_executado: number;
  estouro_orcamento: boolean;
  status: InvestimentoStatus;
  sector_id: number | null;
  sector_name: string | null;
  crd_id: number | null;
  crd_label: string | null;
  responsavel: string | null;
  observacoes: string | null;
};

const STATUS_LABELS: Record<InvestimentoStatus, string> = {
  planejado: 'Planejado',
  em_andamento: 'Em andamento',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
};

const EMPTY_FORM = {
  nome: '',
  valor_previsto: '',
  valor_lancado: '',
  valor_realizado: '',
  status: 'planejado' as InvestimentoStatus,
  sector_id: '',
  crd_id: '',
  responsavel: '',
  observacoes: '',
};

const formatPct = (ratio: number) =>
  (Number(ratio) * 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }) + '%';

export const InvestimentosPage: React.FC = () => {
  const { query } = useSearch();
  const [rows, setRows] = useState<Investimento[]>([]);
  const [sectors, setSectors] = useState<Array<{ id: number; name: string }>>([]);
  const [crds, setCrds] = useState<Array<{ id: number; code: string; name: string; sector_id: number | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [sectorFilter, setSectorFilter] = useState('');
  const [onlyEstouro, setOnlyEstouro] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const load = async () => {
    setLoading(true);
    try {
      const [iRes, sRes, crdRes] = await Promise.all([
        fetch('/api/investimentos'),
        fetch('/api/sectors'),
        fetch('/api/crds'),
      ]);
      const iJson = await iRes.json();
      const sJson = await sRes.json();
      const crdJson = await crdRes.json();
      if (!iRes.ok) {
        alert(iJson.error || 'Erro ao carregar investimentos');
        setRows([]);
      } else {
        setRows(Array.isArray(iJson) ? iJson : iJson.rows || []);
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
      if (onlyEstouro && !r.estouro_orcamento) return false;
      return matchesSearch(
        query,
        r.nome,
        r.responsavel,
        r.sector_name,
        r.crd_label,
        r.status,
        r.observacoes
      );
    });
  }, [rows, statusFilter, sectorFilter, onlyEstouro, query]);

  const counts = useMemo(() => {
    const base = {
      total: rows.length,
      planejado: 0,
      em_andamento: 0,
      concluido: 0,
      cancelado: 0,
      estouro: 0,
      previsto: 0,
      lancado: 0,
      realizado: 0,
      saldo: 0,
    };
    for (const r of rows) {
      if (r.status in base) (base as any)[r.status] += 1;
      if (r.estouro_orcamento) base.estouro += 1;
      if (r.status !== 'cancelado') {
        base.previsto += Number(r.valor_previsto) || 0;
        base.lancado += Number(r.valor_lancado) || 0;
        base.realizado += Number(r.valor_realizado) || 0;
        base.saldo += Number(r.saldo_a_realizar) || 0;
      }
    }
    return base;
  }, [rows]);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };

  const openEdit = (row: Investimento) => {
    setEditingId(row.id);
    setForm({
      nome: row.nome,
      valor_previsto: String(row.valor_previsto ?? ''),
      valor_lancado: String(row.valor_lancado ?? ''),
      valor_realizado: String(row.valor_realizado ?? ''),
      status: row.status,
      sector_id: row.sector_id != null ? String(row.sector_id) : '',
      crd_id: row.crd_id != null ? String(row.crd_id) : '',
      responsavel: row.responsavel || '',
      observacoes: row.observacoes || '',
    });
    setFormOpen(true);
  };

  const save = async () => {
    if (!form.nome.trim()) {
      alert('Informe o nome do investimento.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        nome: form.nome.trim(),
        valor_previsto: Number(form.valor_previsto) || 0,
        valor_lancado: Number(form.valor_lancado) || 0,
        valor_realizado: Number(form.valor_realizado) || 0,
        status: form.status,
        sector_id: form.sector_id ? Number(form.sector_id) : null,
        crd_id: form.crd_id ? Number(form.crd_id) : null,
        responsavel: form.responsavel.trim() || null,
        observacoes: form.observacoes.trim() || null,
      };
      const res = await fetch(editingId ? `/api/investimentos/${editingId}` : '/api/investimentos', {
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

  const remove = async (row: Investimento) => {
    if (!window.confirm(`Remover o investimento "${row.nome}"?`)) return;
    const res = await fetch(`/api/investimentos/${row.id}`, { method: 'DELETE' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(json.error || 'Erro ao excluir');
      return;
    }
    load();
  };

  const formPrevisto = Number(form.valor_previsto) || 0;
  const formRealizado = Number(form.valor_realizado) || 0;
  const formLancado = Number(form.valor_lancado) || 0;
  const formSaldo = formPrevisto - formRealizado;
  const formPct = formPrevisto > 0 ? formRealizado / formPrevisto : 0;

  return (
    <div className="space-y-5 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Investimentos</h2>
          <p className="text-sm text-slate-500 mt-1 max-w-3xl">
            Acompanhamento previsto × lançado × realizado por setor e CRD — saldo a realizar e % executado.
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
            Novo investimento
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi label="Previsto" value={formatCurrency(counts.previsto)} />
        <Kpi label="Lançado" value={formatCurrency(counts.lancado)} />
        <Kpi label="Realizado" value={formatCurrency(counts.realizado)} />
        <Kpi label="Saldo a realizar" value={formatCurrency(counts.saldo)} />
        <Kpi label="Estouros" value={String(counts.estouro)} danger={counts.estouro > 0} />
      </div>

      {counts.estouro > 0 && (
        <div className="flex items-center gap-2 text-sm text-rose-800 bg-rose-50 border border-rose-100 rounded-xl px-4 py-3">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {counts.estouro} investimento(s) com lançado ou realizado acima do previsto.
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
            {(Object.keys(STATUS_LABELS) as InvestimentoStatus[]).map((s) => (
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
              checked={onlyEstouro}
              onChange={(e) => setOnlyEstouro(e.target.checked)}
              className="rounded border-slate-300"
            />
            Só estouros de orçamento
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1100px]">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Investimento</th>
                <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Setor</th>
                <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">CRD</th>
                <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Previsto</th>
                <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Lançado</th>
                <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Realizado</th>
                <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Saldo</th>
                <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">% Exec.</th>
                <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</th>
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
                    Nenhum investimento encontrado.
                  </td>
                </tr>
              )}
              {filtered.map((row) => (
                <tr
                  key={row.id}
                  className={cn(
                    'hover:bg-slate-50/60 transition-colors',
                    row.estouro_orcamento && 'bg-rose-50/40'
                  )}
                >
                  <td className="px-4 py-3 text-sm font-medium text-slate-800">
                    <div className="flex items-center gap-2">
                      <Landmark className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate max-w-[220px]" title={row.nome}>{row.nome}</span>
                      {row.estouro_orcamento && (
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" aria-label="Estouro" />
                      )}
                    </div>
                    {row.responsavel && (
                      <span className="block text-[11px] text-slate-400 mt-0.5">{row.responsavel}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600">{row.sector_name || '—'}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 max-w-[180px] truncate" title={row.crd_label || ''}>
                    {row.crd_label || '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-right tabular-nums text-slate-700">
                    {formatCurrency(row.valor_previsto)}
                  </td>
                  <td className="px-4 py-3 text-sm text-right tabular-nums text-slate-700">
                    {formatCurrency(row.valor_lancado)}
                  </td>
                  <td className="px-4 py-3 text-sm text-right tabular-nums font-semibold text-slate-800">
                    {formatCurrency(row.valor_realizado)}
                  </td>
                  <td className={cn(
                    'px-4 py-3 text-sm text-right tabular-nums font-semibold',
                    row.saldo_a_realizar < -0.009 ? 'text-rose-700' : 'text-slate-800'
                  )}>
                    {formatCurrency(row.saldo_a_realizar)}
                  </td>
                  <td className={cn(
                    'px-4 py-3 text-sm text-right tabular-nums font-semibold',
                    row.pct_executado > 1.009 ? 'text-rose-700' : 'text-slate-700'
                  )}>
                    {formatPct(row.pct_executado)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button type="button" onClick={() => openEdit(row)} className="p-2 text-slate-400 hover:text-[#004D40] hover:bg-emerald-50 rounded-lg" title="Editar">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button type="button" onClick={() => remove(row)} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg" title="Excluir">
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

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-900">
                {editingId ? 'Editar investimento' : 'Novo investimento'}
              </h3>
              <button type="button" onClick={() => setFormOpen(false)} className="p-2 text-slate-400 hover:text-slate-700 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <Field label="Nome *">
                <input
                  value={form.nome}
                  onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                  placeholder="Ex.: Reforma da piscina"
                />
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Field label="Previsto">
                  <input
                    type="number"
                    step="0.01"
                    value={form.valor_previsto}
                    onChange={(e) => setForm((p) => ({ ...p, valor_previsto: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                  />
                </Field>
                <Field label="Lançado">
                  <input
                    type="number"
                    step="0.01"
                    value={form.valor_lancado}
                    onChange={(e) => setForm((p) => ({ ...p, valor_lancado: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                  />
                </Field>
                <Field label="Realizado">
                  <input
                    type="number"
                    step="0.01"
                    value={form.valor_realizado}
                    onChange={(e) => setForm((p) => ({ ...p, valor_realizado: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                  />
                </Field>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2 text-xs text-slate-600 flex flex-wrap gap-x-4 gap-y-1">
                <span>Saldo a realizar: <strong className="tabular-nums">{formatCurrency(formSaldo)}</strong></span>
                <span>% executado: <strong className="tabular-nums">{formatPct(formPct)}</strong></span>
                {(formLancado > formPrevisto + 0.009 || formRealizado > formPrevisto + 0.009) && formPrevisto > 0 && (
                  <span className="text-rose-700 font-semibold">Acima do orçamento</span>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Status">
                  <select
                    value={form.status}
                    onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as InvestimentoStatus }))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                  >
                    {(Object.keys(STATUS_LABELS) as InvestimentoStatus[]).map((s) => (
                      <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Responsável">
                  <input
                    value={form.responsavel}
                    onChange={(e) => setForm((p) => ({ ...p, responsavel: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                  />
                </Field>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Setor">
                  <SearchableSelect
                    options={sectorOptions}
                    value={form.sector_id}
                    onChange={(v) => setForm((p) => ({ ...p, sector_id: v, crd_id: '' }))}
                    placeholder="Selecione o setor"
                  />
                </Field>
                <Field label="CRD">
                  <SearchableSelect
                    options={crdOptions}
                    value={form.crd_id}
                    onChange={(v) => setForm((p) => ({ ...p, crd_id: v }))}
                    placeholder="Selecione o CRD"
                  />
                </Field>
              </div>
              <Field label="Observações">
                <textarea
                  value={form.observacoes}
                  onChange={(e) => setForm((p) => ({ ...p, observacoes: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm resize-y"
                />
              </Field>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 rounded-xl"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="px-4 py-2 text-sm font-bold text-white bg-[#004D40] hover:bg-[#003d33] rounded-xl disabled:opacity-60"
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
  <div className={cn(
    'rounded-2xl border p-4',
    danger ? 'border-rose-100 bg-rose-50/40' : 'border-slate-100 bg-white'
  )}>
    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
    <p className={cn('mt-1 text-lg font-bold tabular-nums', danger ? 'text-rose-700' : 'text-slate-800')}>
      {value}
    </p>
  </div>
);

const StatusBadge: React.FC<{ status: InvestimentoStatus }> = ({ status }) => {
  const styles: Record<InvestimentoStatus, string> = {
    planejado: 'bg-slate-50 text-slate-600 border-slate-200',
    em_andamento: 'bg-sky-50 text-sky-700 border-sky-100',
    concluido: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    cancelado: 'bg-rose-50 text-rose-700 border-rose-100',
  };
  return (
    <span className={cn('inline-flex px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border', styles[status])}>
      {STATUS_LABELS[status]}
    </span>
  );
};

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block space-y-1.5">
    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
    {children}
  </label>
);
