import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCcw, Plus, Trash2, AlertTriangle, Save } from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import { ValueTrace } from '../components/ValueTrace';
import {
  getPainelByKey,
  type PainelKey,
} from '../lib/paineisSetoriais';

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

type MonthAgg = {
  month: number;
  previsto: number;
  realizado: number;
  diferenca: number;
  estouro: boolean;
};

type GroupAgg = {
  key: string;
  label: string;
  months: MonthAgg[];
  total_previsto: number;
  total_realizado: number;
  total_diferenca: number;
  estouro: boolean;
  rows: Array<{
    id: number;
    code: string;
    name: string;
    months: MonthAgg[];
    total_previsto: number;
    total_realizado: number;
  }>;
};

type PainelSummary = {
  painel: string;
  year: number;
  sector_names: string[];
  occupancy_percent: number | null;
  rn_anual: number | null;
  groups: GroupAgg[];
  totals: { previsto: number; realizado: number; diferenca: number; estouro: boolean };
  observacao: { texto: string; updated_at?: string; user_name?: string } | null;
  extras?: Record<string, any>;
};

const emptyMonth = (m: number): MonthAgg => ({
  month: m,
  previsto: 0,
  realizado: 0,
  diferenca: 0,
  estouro: false,
});

type Props = { painelKey: PainelKey };

export const PainelSetorial: React.FC<Props> = ({ painelKey }) => {
  const config = getPainelByKey(painelKey);
  const now = new Date();
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<PainelSummary | null>(null);
  const [obsTexto, setObsTexto] = useState('');
  const [savingObs, setSavingObs] = useState(false);
  const [selectedMonths, setSelectedMonths] = useState<number[]>(() =>
    Array.from({ length: 12 }, (_, i) => i)
  );

  // Nutri / Controladoria / A&B local forms
  const [nutriForm, setNutriForm] = useState({
    titulo: '',
    responsavel: '',
    prazo: '',
    status: 'pendente',
    custo_previsto: '',
    custo_realizado: '',
    observacoes: '',
  });
  const [quebraForm, setQuebraForm] = useState({ item: '', quantidade: '', custo: '', observacao: '' });
  const [sobraForm, setSobraForm] = useState({ local: '', custo: '', observacao: '' });
  const [semanaForm, setSemanaForm] = useState({
    semana_inicio: '',
    item: '',
    previsto: '',
    realizado: '',
    setor_responsavel: '',
    observacoes: '',
  });

  const visibleMonths = useMemo(() => {
    const set = new Set(selectedMonths);
    const months = MESES.map((_, i) => i).filter((i) => set.has(i));
    return months.length ? months : MESES.map((_, i) => i);
  }, [selectedMonths]);

  const load = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ year, month });
      const res = await fetch(`/api/paineis/${painelKey}?${params}`);
      const json = await res.json();
      if (!res.ok) {
        alert(json.error || 'Erro ao carregar painel');
        setData(null);
        return;
      }
      setData(json);
      setObsTexto(json.observacao?.texto || '');
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [painelKey, year, month]);

  const saveObs = async () => {
    setSavingObs(true);
    try {
      const res = await fetch(`/api/paineis/${painelKey}/observacao`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: Number(year), month: Number(month), texto: obsTexto }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) alert(json.error || 'Erro ao salvar observação');
      else load();
    } finally {
      setSavingObs(false);
    }
  };

  const yearOptions = useMemo(() => {
    const y = now.getFullYear();
    return Array.from({ length: 6 }, (_, i) => String(y - 2 + i));
  }, [now]);

  const selectMonth = (idx: number) => setSelectedMonths([idx]);
  const selectAllMonths = () => setSelectedMonths(Array.from({ length: 12 }, (_, i) => i));
  const allMonthsSelected = visibleMonths.length === 12;

  const sumVisible = (months: MonthAgg[]) => {
    let previsto = 0;
    let realizado = 0;
    for (const i of visibleMonths) {
      previsto += months[i]?.previsto || 0;
      realizado += months[i]?.realizado || 0;
    }
    return {
      previsto,
      realizado,
      diferenca: realizado - previsto,
      estouro: realizado > previsto && previsto > 0,
    };
  };

  if (!config) {
    return <div className="p-8 text-slate-400">Painel não encontrado.</div>;
  }

  const extras = data?.extras || {};

  return (
    <div className="space-y-5 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">{config.label}</h2>
          <p className="text-sm text-slate-500 mt-1 max-w-3xl">{config.description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm"
          >
            {MESES.map((m, i) => (
              <option key={m} value={String(i + 1)}>{m}</option>
            ))}
          </select>
          <select
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#004D40] text-white text-sm font-bold rounded-xl hover:bg-[#003d33] disabled:opacity-60"
          >
            <RefreshCcw className="w-4 h-4" />
            {loading ? 'Atualizando...' : 'Atualizar'}
          </button>
        </div>
      </div>

      {/* Filtro de meses (mesmo padrão DRE) */}
      {painelKey !== 'nutricionista' && painelKey !== 'controladoria' && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm px-4 py-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Filtrar meses
              {!allMonthsSelected && (
                <span className="ml-2 normal-case tracking-normal text-slate-500 font-semibold">
                  · {visibleMonths.length} selecionado{visibleMonths.length === 1 ? '' : 's'}
                </span>
              )}
            </p>
            {!allMonthsSelected && (
              <button type="button" onClick={selectAllMonths} className="text-xs font-bold text-[#004D40] hover:underline">
                Mostrar todos
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {MESES.map((mes, idx) => {
              const active = visibleMonths.includes(idx);
              return (
                <button
                  key={mes}
                  type="button"
                  onClick={() => selectMonth(idx)}
                  className={cn(
                    'px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors border',
                    active
                      ? 'bg-[#004D40] text-white border-[#004D40] shadow-sm'
                      : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'
                  )}
                >
                  {mes.slice(0, 3)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* KPIs */}
      {data && painelKey !== 'nutricionista' && painelKey !== 'controladoria' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {(() => {
            const t = sumVisible(
              Array.from({ length: 12 }, (_, i) => {
                const g = data.groups;
                let previsto = 0;
                let realizado = 0;
                for (const group of g) {
                  previsto += group.months[i]?.previsto || 0;
                  realizado += group.months[i]?.realizado || 0;
                }
                return { month: i + 1, previsto, realizado, diferenca: realizado - previsto, estouro: realizado > previsto };
              })
            );
            const pctBase = t.previsto !== 0 ? (t.realizado / t.previsto) * 100 : null;
            return (
              <>
                <KpiCard title="Previsto (período)" value={formatCurrency(t.previsto)} />
                <KpiCard title="Realizado (período)" value={formatCurrency(t.realizado)} />
                <KpiCard
                  title="Diferença"
                  value={formatCurrency(t.diferenca)}
                  danger={t.estouro}
                />
                <KpiCard
                  title="% Realizado / Previsto"
                  value={pctBase == null ? '—' : `${pctBase.toFixed(1)}%`}
                  danger={t.estouro}
                />
              </>
            );
          })()}
        </div>
      )}

      {data && (data.occupancy_percent != null || data.rn_anual != null) && painelKey === 'operacional' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <KpiCard
            title="Ocupação (Síntase)"
            value={data.occupancy_percent == null ? '—' : `${Number(data.occupancy_percent).toFixed(1)}%`}
          />
          <KpiCard title="RN anual (indicadores)" value={data.rn_anual == null ? '—' : String(Math.round(data.rn_anual))} />
          <KpiCard
            title="Custo energia / RN (aprox.)"
            value={
              extras.energia_por_rn == null ? '—' : formatCurrency(Number(extras.energia_por_rn))
            }
          />
        </div>
      )}

      {loading && !data && (
        <div className="text-sm text-slate-400 py-8 text-center">Carregando painel...</div>
      )}

      {/* Tabela previsto × realizado por grupo */}
      {data && data.groups.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-50">
            <h3 className="text-sm font-bold text-slate-800">Previsto × Realizado por bloco</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Fonte: CRDs do setor {data.sector_names.join(', ') || '(filtro por palavras-chave)'} ·
              destaque vermelho = estouro (realizado &gt; previsto)
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead>
                <tr className="bg-slate-50/80">
                  <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest sticky left-0 bg-slate-50">Bloco / CRD</th>
                  {visibleMonths.map((i) => (
                    <th key={i} colSpan={2} className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center border-l border-slate-100">
                      {MESES[i].slice(0, 3)}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Tot. Prev.</th>
                  <th className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Tot. Real.</th>
                  <th className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Dif.</th>
                </tr>
                <tr className="bg-slate-50/50">
                  <th className="sticky left-0 bg-slate-50" />
                  {visibleMonths.map((i) => (
                    <React.Fragment key={`sub-${i}`}>
                      <th className="px-2 py-1 text-[9px] font-bold text-slate-400 text-right border-l border-slate-100">Prev.</th>
                      <th className="px-2 py-1 text-[9px] font-bold text-slate-400 text-right">Real.</th>
                    </React.Fragment>
                  ))}
                  <th /><th /><th />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {data.groups.map((group) => {
                  const tot = sumVisible(group.months);
                  return (
                    <React.Fragment key={group.key}>
                      <tr className={cn('font-semibold', tot.estouro ? 'bg-red-50/70' : 'bg-slate-50/40')}>
                        <td className={cn('px-4 py-2.5 text-sm sticky left-0', tot.estouro ? 'bg-red-50 border-l-2 border-l-red-400' : 'bg-slate-50')}>
                          {group.label}
                        </td>
                        {visibleMonths.map((i) => {
                          const m = group.months[i] || emptyMonth(i + 1);
                          return (
                            <React.Fragment key={`${group.key}-${i}`}>
                              <td className="px-2 py-2 text-xs text-right text-slate-600 border-l border-slate-100 tabular-nums">
                                {formatCurrency(m.previsto)}
                              </td>
                              <td className={cn('px-2 py-2 text-xs text-right tabular-nums font-medium', m.estouro ? 'text-red-700' : 'text-slate-800')}>
                                {formatCurrency(m.realizado)}
                              </td>
                            </React.Fragment>
                          );
                        })}
                        <td className="px-3 py-2 text-xs text-right tabular-nums">{formatCurrency(tot.previsto)}</td>
                        <td className="px-3 py-2 text-xs text-right tabular-nums font-medium">{formatCurrency(tot.realizado)}</td>
                        <td className={cn('px-3 py-2 text-xs text-right tabular-nums font-semibold', tot.estouro ? 'text-red-700' : tot.diferenca < 0 ? 'text-emerald-700' : 'text-slate-700')}>
                          {formatCurrency(tot.diferenca)}
                        </td>
                      </tr>
                      {group.rows.slice(0, 12).map((row) => {
                        const rt = sumVisible(row.months);
                        return (
                          <tr key={row.id} className={cn(rt.estouro && 'bg-red-50/40')}>
                            <td className="px-4 py-1.5 pl-8 text-xs text-slate-600 sticky left-0 bg-white">
                              {row.code} — {row.name}
                            </td>
                            {visibleMonths.map((i) => {
                              const m = row.months[i] || emptyMonth(i + 1);
                              return (
                                <React.Fragment key={`${row.id}-${i}`}>
                                  <td className="px-2 py-1.5 text-[11px] text-right text-slate-500 border-l border-slate-50 tabular-nums">
                                    {formatCurrency(m.previsto)}
                                  </td>
                                  <td className={cn('px-2 py-1.5 text-[11px] text-right tabular-nums', m.estouro ? 'text-red-600' : 'text-slate-700')}>
                                    {formatCurrency(m.realizado)}
                                  </td>
                                </React.Fragment>
                              );
                            })}
                            <td className="px-3 py-1.5 text-[11px] text-right tabular-nums text-slate-500">{formatCurrency(rt.previsto)}</td>
                            <td className="px-3 py-1.5 text-[11px] text-right tabular-nums">{formatCurrency(rt.realizado)}</td>
                            <td className={cn('px-3 py-1.5 text-[11px] text-right tabular-nums font-semibold', rt.estouro ? 'text-red-600' : 'text-slate-600')}>
                              {formatCurrency(rt.diferenca)}
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SPA: % resultado sobre receita */}
      {painelKey === 'spa' && data && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <KpiCard title="Receita (período)" value={formatCurrency(Number(extras.receita_periodo) || 0)} />
          <KpiCard title="Custos (período)" value={formatCurrency(Number(extras.custos_periodo) || 0)} />
          <KpiCard
            title="% Resultado / Receita"
            value={
              extras.pct_resultado_receita == null
                ? '—'
                : `${Number(extras.pct_resultado_receita).toFixed(1)}%`
            }
          />
        </div>
      )}

      {/* Hospedagem lavanderia */}
      {painelKey === 'hospedagem' && data && extras.lavanderia && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <h3 className="text-sm font-bold text-slate-800 mb-3">Lavanderia</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <KpiCard title="Previsto" value={formatCurrency(Number(extras.lavanderia.previsto) || 0)} />
            <KpiCard title="Realizado" value={formatCurrency(Number(extras.lavanderia.realizado) || 0)} />
            <KpiCard
              title="Diferença"
              value={formatCurrency(Number(extras.lavanderia.diferenca) || 0)}
              danger={Boolean(extras.lavanderia.estouro)}
            />
          </div>
        </div>
      )}

      {/* A&B: quebras e sobras */}
      {painelKey === 'ab' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <CrudList
            title="Louças e utensílios (quebras)"
            hint="Custo de quebras por mês"
            rows={extras.quebras || []}
            columns={[
              { key: 'item', label: 'Item' },
              { key: 'quantidade', label: 'Qtd', fmt: 'num' },
              { key: 'custo', label: 'Custo', fmt: 'money' },
            ]}
            onDelete={async (id) => {
              await fetch(`/api/paineis/ab/quebras/${id}`, { method: 'DELETE' });
              load();
            }}
            form={
              <div className="flex flex-wrap gap-2">
                <input placeholder="Item" value={quebraForm.item} onChange={(e) => setQuebraForm((p) => ({ ...p, item: e.target.value }))} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm w-36" />
                <input placeholder="Qtd" type="number" value={quebraForm.quantidade} onChange={(e) => setQuebraForm((p) => ({ ...p, quantidade: e.target.value }))} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm w-24" />
                <input placeholder="Custo" type="number" value={quebraForm.custo} onChange={(e) => setQuebraForm((p) => ({ ...p, custo: e.target.value }))} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm w-28" />
                <button
                  type="button"
                  className="inline-flex items-center gap-1 px-3 py-2 bg-[#004D40] text-white text-xs font-bold rounded-xl"
                  onClick={async () => {
                    await fetch('/api/paineis/ab/quebras', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        year: Number(year),
                        month: Number(month),
                        item: quebraForm.item,
                        quantidade: Number(quebraForm.quantidade) || 0,
                        custo: Number(quebraForm.custo) || 0,
                        observacao: quebraForm.observacao,
                      }),
                    });
                    setQuebraForm({ item: '', quantidade: '', custo: '', observacao: '' });
                    load();
                  }}
                >
                  <Plus className="w-3.5 h-3.5" /> Adicionar
                </button>
              </div>
            }
          />
          <CrudList
            title="Sobras (Café da manhã)"
            hint="Local e custo das sobras"
            rows={extras.sobras || []}
            columns={[
              { key: 'local', label: 'Local' },
              { key: 'custo', label: 'Custo', fmt: 'money' },
            ]}
            onDelete={async (id) => {
              await fetch(`/api/paineis/ab/sobras/${id}`, { method: 'DELETE' });
              load();
            }}
            form={
              <div className="flex flex-wrap gap-2">
                <input placeholder="Local" value={sobraForm.local} onChange={(e) => setSobraForm((p) => ({ ...p, local: e.target.value }))} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm w-40" />
                <input placeholder="Custo" type="number" value={sobraForm.custo} onChange={(e) => setSobraForm((p) => ({ ...p, custo: e.target.value }))} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm w-28" />
                <button
                  type="button"
                  className="inline-flex items-center gap-1 px-3 py-2 bg-[#004D40] text-white text-xs font-bold rounded-xl"
                  onClick={async () => {
                    await fetch('/api/paineis/ab/sobras', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        year: Number(year),
                        month: Number(month),
                        local: sobraForm.local,
                        custo: Number(sobraForm.custo) || 0,
                        observacao: sobraForm.observacao,
                      }),
                    });
                    setSobraForm({ local: '', custo: '', observacao: '' });
                    load();
                  }}
                >
                  <Plus className="w-3.5 h-3.5" /> Adicionar
                </button>
              </div>
            }
          />
        </div>
      )}

      {/* Mini-DREs A&B */}
      {painelKey === 'ab' && extras.mini_dres && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(['pizzaria', 'frigobar', 'cafe'] as const).map((dep) => {
            const d = extras.mini_dres[dep] || { previsto: 0, realizado: 0, diferenca: 0 };
            return (
              <div key={dep} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-2">
                <h4 className="text-sm font-bold text-slate-800 capitalize">
                  {dep === 'cafe' ? 'Café da manhã' : dep === 'frigobar' ? 'Frigobar' : 'Pizzaria'}
                </h4>
                <p className="text-xs text-slate-500">Mini-DRE (soma CRDs do bloco no período filtrado)</p>
                <div className="flex justify-between text-xs"><span className="text-slate-500">Previsto</span><span className="font-semibold tabular-nums">{formatCurrency(d.previsto)}</span></div>
                <div className="flex justify-between text-xs"><span className="text-slate-500">Realizado</span><span className="font-semibold tabular-nums">{formatCurrency(d.realizado)}</span></div>
                <div className="flex justify-between text-xs"><span className="text-slate-500">Resultado (dif.)</span><span className={cn('font-bold tabular-nums', d.diferenca < 0 ? 'text-red-600' : 'text-emerald-700')}>{formatCurrency(d.diferenca)}</span></div>
              </div>
            );
          })}
        </div>
      )}

      {/* Nutricionista */}
      {painelKey === 'nutricionista' && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-50 space-y-3">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Ações / Despesas</h3>
              <p className="text-xs text-slate-500">Estrutura pronta — conteúdo a definir com a equipe (Cris).</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <input placeholder="Título da ação" value={nutriForm.titulo} onChange={(e) => setNutriForm((p) => ({ ...p, titulo: e.target.value }))} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm w-48" />
              <input placeholder="Responsável" value={nutriForm.responsavel} onChange={(e) => setNutriForm((p) => ({ ...p, responsavel: e.target.value }))} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm w-36" />
              <input type="date" value={nutriForm.prazo} onChange={(e) => setNutriForm((p) => ({ ...p, prazo: e.target.value }))} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm" />
              <select value={nutriForm.status} onChange={(e) => setNutriForm((p) => ({ ...p, status: e.target.value }))} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm">
                <option value="pendente">Pendente</option>
                <option value="em_andamento">Em andamento</option>
                <option value="concluida">Concluída</option>
                <option value="cancelada">Cancelada</option>
              </select>
              <input placeholder="Previsto" type="number" value={nutriForm.custo_previsto} onChange={(e) => setNutriForm((p) => ({ ...p, custo_previsto: e.target.value }))} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm w-28" />
              <input placeholder="Realizado" type="number" value={nutriForm.custo_realizado} onChange={(e) => setNutriForm((p) => ({ ...p, custo_realizado: e.target.value }))} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm w-28" />
              <button
                type="button"
                className="inline-flex items-center gap-1 px-3 py-2 bg-[#004D40] text-white text-xs font-bold rounded-xl"
                onClick={async () => {
                  if (!nutriForm.titulo.trim()) return alert('Informe o título');
                  await fetch('/api/paineis/nutricionista/acoes', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      ...nutriForm,
                      custo_previsto: Number(nutriForm.custo_previsto) || 0,
                      custo_realizado: Number(nutriForm.custo_realizado) || 0,
                      prazo: nutriForm.prazo || null,
                    }),
                  });
                  setNutriForm({ titulo: '', responsavel: '', prazo: '', status: 'pendente', custo_previsto: '', custo_realizado: '', observacoes: '' });
                  load();
                }}
              >
                <Plus className="w-3.5 h-3.5" /> Adicionar ação
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50/50">
                  <th className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase">Título</th>
                  <th className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase">Responsável</th>
                  <th className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase">Prazo</th>
                  <th className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase">Status</th>
                  <th className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase text-right">Previsto</th>
                  <th className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase text-right">Realizado</th>
                  <th className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {(extras.acoes || []).length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-400">Nenhuma ação cadastrada.</td></tr>
                )}
                {(extras.acoes || []).map((a: any) => (
                  <tr key={a.id} className={cn(Number(a.custo_realizado) > Number(a.custo_previsto) && Number(a.custo_previsto) > 0 && 'bg-red-50/50')}>
                    <td className="px-4 py-2 text-sm font-medium text-slate-800">{a.titulo}</td>
                    <td className="px-4 py-2 text-sm text-slate-600">{a.responsavel || '—'}</td>
                    <td className="px-4 py-2 text-sm text-slate-600">{a.prazo || '—'}</td>
                    <td className="px-4 py-2 text-xs font-semibold uppercase text-slate-500">{a.status}</td>
                    <td className="px-4 py-2 text-sm text-right tabular-nums">{formatCurrency(Number(a.custo_previsto) || 0)}</td>
                    <td className="px-4 py-2 text-sm text-right tabular-nums">{formatCurrency(Number(a.custo_realizado) || 0)}</td>
                    <td className="px-4 py-2 text-right">
                      <button type="button" className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg" onClick={async () => {
                        await fetch(`/api/paineis/nutricionista/acoes/${a.id}`, { method: 'DELETE' });
                        load();
                      }}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Controladoria semanal */}
      {painelKey === 'controladoria' && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-50 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Relatório semanal — Uso e consumo</h3>
                <p className="text-xs text-slate-500">Previsto × realizado, estouro e setor responsável.</p>
              </div>
              {(extras.estourados_count > 0) && (
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-red-700 bg-red-50 border border-red-100 px-3 py-1.5 rounded-xl">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {extras.estourados_count} item(ns) estourado(s)
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <input type="date" value={semanaForm.semana_inicio} onChange={(e) => setSemanaForm((p) => ({ ...p, semana_inicio: e.target.value }))} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm" title="Início da semana" />
              <input placeholder="Item" value={semanaForm.item} onChange={(e) => setSemanaForm((p) => ({ ...p, item: e.target.value }))} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm w-40" />
              <input placeholder="Previsto" type="number" value={semanaForm.previsto} onChange={(e) => setSemanaForm((p) => ({ ...p, previsto: e.target.value }))} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm w-28" />
              <input placeholder="Realizado" type="number" value={semanaForm.realizado} onChange={(e) => setSemanaForm((p) => ({ ...p, realizado: e.target.value }))} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm w-28" />
              <input placeholder="Setor responsável" value={semanaForm.setor_responsavel} onChange={(e) => setSemanaForm((p) => ({ ...p, setor_responsavel: e.target.value }))} className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm w-40" />
              <button
                type="button"
                className="inline-flex items-center gap-1 px-3 py-2 bg-[#004D40] text-white text-xs font-bold rounded-xl"
                onClick={async () => {
                  if (!semanaForm.semana_inicio || !semanaForm.item.trim()) return alert('Informe semana e item');
                  await fetch('/api/paineis/controladoria/semanal', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      ...semanaForm,
                      previsto: Number(semanaForm.previsto) || 0,
                      realizado: Number(semanaForm.realizado) || 0,
                    }),
                  });
                  setSemanaForm({ semana_inicio: '', item: '', previsto: '', realizado: '', setor_responsavel: '', observacoes: '' });
                  load();
                }}
              >
                <Plus className="w-3.5 h-3.5" /> Adicionar
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50/50">
                  <th className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase">Semana</th>
                  <th className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase">Item</th>
                  <th className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase">Setor</th>
                  <th className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase text-right">Previsto</th>
                  <th className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase text-right">Realizado</th>
                  <th className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase text-right">Dif.</th>
                  <th className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {(extras.semanal || []).length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-400">Nenhum lançamento semanal.</td></tr>
                )}
                {(extras.semanal || []).map((row: any) => {
                  const prev = Number(row.previsto) || 0;
                  const real = Number(row.realizado) || 0;
                  const dif = real - prev;
                  const estouro = real > prev && prev > 0;
                  return (
                    <tr key={row.id} className={cn(estouro && 'bg-red-50/60')}>
                      <td className="px-4 py-2 text-sm text-slate-600">{row.semana_inicio}</td>
                      <td className="px-4 py-2 text-sm font-medium text-slate-800">{row.item}</td>
                      <td className="px-4 py-2 text-sm text-slate-600">{row.setor_responsavel || '—'}</td>
                      <td className="px-4 py-2 text-sm text-right tabular-nums">{formatCurrency(prev)}</td>
                      <td className="px-4 py-2 text-sm text-right tabular-nums">{formatCurrency(real)}</td>
                      <td className={cn('px-4 py-2 text-sm text-right tabular-nums font-semibold', estouro ? 'text-red-700' : 'text-slate-700')}>
                        <ValueTrace displayValue={formatCurrency(dif)} source="Controladoria semanal" calculation="Realizado − Previsto (vermelho = estouro)" />
                      </td>
                      <td className="px-4 py-2 text-right">
                        <button type="button" className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg" onClick={async () => {
                          await fetch(`/api/paineis/controladoria/semanal/${row.id}`, { method: 'DELETE' });
                          load();
                        }}>
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Observações do gestor */}
      {painelKey !== 'nutricionista' && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Observações do gestor</h3>
              <p className="text-xs text-slate-500">
                Justificativas do mês {MESES[Number(month) - 1]}/{year}
                {data?.observacao?.user_name ? ` · última edição: ${data.observacao.user_name}` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={saveObs}
              disabled={savingObs}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#004D40] text-white text-sm font-bold rounded-xl hover:bg-[#003d33] disabled:opacity-60"
            >
              <Save className="w-4 h-4" />
              {savingObs ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
          <textarea
            value={obsTexto}
            onChange={(e) => setObsTexto(e.target.value)}
            rows={4}
            placeholder="Registre variações, estouros e justificativas..."
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm resize-y min-h-[100px]"
          />
        </div>
      )}
    </div>
  );
};

const KpiCard: React.FC<{ title: string; value: string; danger?: boolean }> = ({ title, value, danger }) => (
  <div className={cn('rounded-2xl border p-4', danger ? 'border-red-200 bg-red-50/40' : 'border-slate-100 bg-white shadow-sm')}>
    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{title}</p>
    <p className={cn('mt-1 text-xl font-bold tabular-nums', danger ? 'text-red-700' : 'text-slate-900')}>{value}</p>
  </div>
);

const CrudList: React.FC<{
  title: string;
  hint?: string;
  rows: any[];
  columns: Array<{ key: string; label: string; fmt?: 'money' | 'num' }>;
  form: React.ReactNode;
  onDelete: (id: number) => void;
}> = ({ title, hint, rows, columns, form, onDelete }) => (
  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
    <div className="p-4 border-b border-slate-50 space-y-3">
      <div>
        <h3 className="text-sm font-bold text-slate-800">{title}</h3>
        {hint && <p className="text-xs text-slate-500">{hint}</p>}
      </div>
      {form}
    </div>
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="bg-slate-50/50">
            {columns.map((c) => (
              <th key={c.key} className={cn('px-4 py-2 text-[10px] font-bold text-slate-400 uppercase', c.fmt && 'text-right')}>{c.label}</th>
            ))}
            <th className="px-4 py-2 text-[10px] font-bold text-slate-400 uppercase text-right">Ações</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {rows.length === 0 && (
            <tr><td colSpan={columns.length + 1} className="px-4 py-6 text-center text-sm text-slate-400">Sem registros neste mês.</td></tr>
          )}
          {rows.map((row) => (
            <tr key={row.id}>
              {columns.map((c) => (
                <td key={c.key} className={cn('px-4 py-2 text-sm text-slate-700', c.fmt && 'text-right tabular-nums')}>
                  {c.fmt === 'money' ? formatCurrency(Number(row[c.key]) || 0) : row[c.key] ?? '—'}
                </td>
              ))}
              <td className="px-4 py-2 text-right">
                <button type="button" className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg" onClick={() => onDelete(row.id)}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);
