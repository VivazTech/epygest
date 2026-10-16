import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Building2,
  Calendar,
  ChevronDown,
  ExternalLink,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatCurrency, cn } from '../lib/utils';

const MONTH_LABELS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

type KpiBlock = {
  faturamento: number;
  ebitda: number;
  margem_ebitda: number;
  resultado_liquido: number;
  rl_sobre_faturamento: number;
};

type DiretoriaData = {
  month: number;
  year: number;
  kpis: { mes: KpiBlock; acumulado: KpiBlock };
  meta: { mes: KpiBlock; acumulado: KpiBlock };
  comparativos: {
    mensal: {
      vs_meta: Record<string, number>;
      vs_ano_anterior: Record<string, number>;
    };
    acumulado: {
      vs_meta: Record<string, number>;
      vs_ano_anterior: Record<string, number>;
    };
  };
  serieMensal: Array<{
    month: number;
    name: string;
    realizado: number;
    meta: number;
    ebitda: number;
    resultado_liquido: number;
  }>;
  setores: Array<{
    key: string;
    label: string;
    tabId: string;
    previsto: number;
    realizado: number;
    diferenca: number;
    estouro: boolean;
  }>;
  principaisEstouros: Array<{
    id: number;
    item: string;
    previsto: number;
    realizado: number;
    diferenca: number;
    setor_responsavel: string | null;
    semana_inicio: string;
  }>;
  alertas: {
    contratos: Array<{
      id: number;
      tipo: string;
      fornecedor: string;
      valor: number;
      vencimento: string | null;
      setor: string | null;
      mensagem: string;
    }>;
    investimentos: Array<{
      id: number;
      tipo: string;
      nome: string;
      valor_previsto: number;
      valor_realizado: number;
      setor: string | null;
      mensagem: string;
    }>;
  };
  consumo: {
    itens: number;
    estourados: number;
    total_previsto: number;
    total_realizado: number;
    recentes: Array<{
      item: string;
      previsto: number;
      realizado: number;
      estouro: boolean;
      setor_responsavel: string | null;
    }>;
  };
  atalhos: Array<{ tabId: string; label: string }>;
};

type Props = {
  onNavigate?: (tab: string) => void;
};

const formatPctRatio = (value: number) => {
  const pct = Number(value) * 100;
  return pct.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
};

const pctClass = (v: number) => {
  if (v > 0.005) return 'text-emerald-600';
  if (v < -0.005) return 'text-rose-600';
  return 'text-slate-500';
};

const PctBadge: React.FC<{ value: number; label?: string }> = ({ value, label }) => (
  <span className={cn('inline-flex items-center gap-0.5 text-xs font-semibold', pctClass(value))}>
    {value >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
    {label ? label + ' ' : ''}
    {formatPctRatio(value)}
  </span>
);

const KpiCard: React.FC<{
  title: string;
  value: number;
  type: 'currency' | 'percent';
  vsMeta?: number;
  vsYoY?: number;
  accent?: string;
}> = ({ title, value, type, vsMeta, vsYoY, accent = 'border-slate-100' }) => (
  <div className={cn('rounded-2xl border bg-white p-5 shadow-sm shadow-slate-100/60', accent)}>
    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">{title}</p>
    <p className="text-2xl font-bold text-slate-800 tabular-nums">
      {type === 'currency' ? formatCurrency(value) : formatPctRatio(value)}
    </p>
    <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
      {vsMeta != null && <PctBadge value={vsMeta} label="vs meta" />}
      {vsYoY != null && <PctBadge value={vsYoY} label="vs AA" />}
    </div>
  </div>
);

export const DashboardDiretoria: React.FC<Props> = ({ onNavigate }) => {
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(String(now.getMonth() + 1));
  const [selectedYear, setSelectedYear] = useState(String(now.getFullYear()));
  const [periodOpen, setPeriodOpen] = useState(false);
  const [viewMode, setViewMode] = useState('mes' as 'mes' | 'acumulado');
  const [data, setData] = useState(null as DiretoriaData | null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const periodLabel = useMemo(() => {
    const monthIdx = Math.max(1, Math.min(12, Number(selectedMonth) || 1)) - 1;
    return MONTH_LABELS[monthIdx] + ', ' + selectedYear;
  }, [selectedMonth, selectedYear]);

  const yearOptions = useMemo(() => {
    const current = new Date().getFullYear();
    return Array.from({ length: 6 }, (_, i) => String(current - 2 + i));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ month: selectedMonth, year: selectedYear });
    fetch('/api/dashboard/diretoria?' + params.toString())
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || 'Falha ao carregar dashboard.');
        return json as DiretoriaData;
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch((err) => {
        if (!cancelled) {
          setData(null);
          setError(err instanceof Error ? err.message : 'Erro ao carregar.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedMonth, selectedYear]);

  const kpis = viewMode === 'mes' ? data?.kpis.mes : data?.kpis.acumulado;
  const comps = viewMode === 'mes' ? data?.comparativos.mensal : data?.comparativos.acumulado;

  const alertaTipoLabel = (tipo: string) => {
    if (tipo === 'vencido') return 'Vencido';
    if (tipo === 'vence_em_30') return 'Vence em 30 dias';
    if (tipo === 'pendente_assinatura') return 'Assinatura';
    return tipo;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-sky-700">Diretoria</p>
          <h1 className="text-2xl font-bold text-slate-800">Dashboard consolidado</h1>
          <p className="text-sm text-slate-500 mt-1">
            Visão geral: faturamento, EBITDA, resultado, alertas e atalhos setoriais.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-slate-200 bg-white p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('mes')}
              className={cn(
                'px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors',
                viewMode === 'mes' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-700'
              )}
            >
              Mensal
            </button>
            <button
              type="button"
              onClick={() => setViewMode('acumulado')}
              className={cn(
                'px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors',
                viewMode === 'acumulado' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-700'
              )}
            >
              Acumulado
            </button>
          </div>
          <div className="relative">
            <button
              type="button"
              onClick={() => setPeriodOpen((o) => !o)}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <Calendar className="w-4 h-4 text-slate-400" />
              {periodLabel}
              <ChevronDown className="w-4 h-4 text-slate-400" />
            </button>
            {periodOpen && (
              <div className="absolute right-0 z-20 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Mês</label>
                <select
                  className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm mb-2"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                >
                  {MONTH_LABELS.map((label, i) => (
                    <option key={label} value={String(i + 1)}>{label}</option>
                  ))}
                </select>
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Ano</label>
                <select
                  className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm mb-3"
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                >
                  {yearOptions.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className="w-full rounded-lg bg-slate-800 py-1.5 text-xs font-semibold text-white"
                  onClick={() => setPeriodOpen(false)}
                >
                  Aplicar
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {loading && (
        <div className="rounded-2xl border border-slate-100 bg-white p-10 text-center text-slate-400 text-sm">
          Carregando consolidado da diretoria...
        </div>
      )}

      {!loading && error && (
        <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </div>
      )}

      {!loading && data && kpis && comps && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
            <KpiCard
              title="Faturamento"
              value={kpis.faturamento}
              type="currency"
              vsMeta={comps.vs_meta.faturamento}
              vsYoY={comps.vs_ano_anterior.faturamento}
              accent="border-sky-100"
            />
            <KpiCard
              title="EBITDA"
              value={kpis.ebitda}
              type="currency"
              vsMeta={comps.vs_meta.ebitda}
              vsYoY={comps.vs_ano_anterior.ebitda}
              accent="border-emerald-100"
            />
            <KpiCard title="Margem EBITDA" value={kpis.margem_ebitda} type="percent" />
            <KpiCard
              title="Resultado líquido"
              value={kpis.resultado_liquido}
              type="currency"
              vsMeta={comps.vs_meta.resultado_liquido}
              vsYoY={comps.vs_ano_anterior.resultado_liquido}
              accent="border-amber-100"
            />
            <KpiCard title="RL / Faturamento" value={kpis.rl_sobre_faturamento} type="percent" />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="xl:col-span-2 rounded-2xl border border-slate-100 bg-white p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-sm font-bold text-slate-800">Previsto × Realizado</h2>
                  <p className="text-xs text-slate-400">Faturamento mensal (Indicadores)</p>
                </div>
                <ArrowUpRight className="w-4 h-4 text-slate-300" />
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.serieMensal}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => Math.round(Number(v) / 1000) + 'k'} />
                    <Tooltip
                      formatter={(value: number) => formatCurrency(Number(value) || 0)}
                      contentStyle={{ borderRadius: 12, borderColor: '#e2e8f0', fontSize: 12 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="meta" name="Meta" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="realizado" name="Realizado" fill="#0077a8" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-white p-5">
              <h2 className="text-sm font-bold text-slate-800 mb-1">Uso e consumo</h2>
              <p className="text-xs text-slate-400 mb-4">Controladoria — relatório semanal</p>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-[10px] font-bold uppercase text-slate-400">Itens</p>
                  <p className="text-lg font-bold text-slate-800">{data.consumo.itens}</p>
                </div>
                <div className="rounded-xl bg-rose-50 p-3">
                  <p className="text-[10px] font-bold uppercase text-rose-400">Estouros</p>
                  <p className="text-lg font-bold text-rose-700">{data.consumo.estourados}</p>
                </div>
              </div>
              <div className="space-y-2 max-h-48 overflow-auto">
                {data.consumo.recentes.length === 0 && (
                  <p className="text-xs text-slate-400">Sem lançamentos semanais.</p>
                )}
                {data.consumo.recentes.map((row, i) => (
                  <div
                    key={row.item + '-' + i}
                    className={cn(
                      'flex justify-between gap-2 rounded-lg px-2 py-1.5 text-xs',
                      row.estouro ? 'bg-rose-50 text-rose-800' : 'bg-slate-50 text-slate-600'
                    )}
                  >
                    <span className="truncate font-medium">{row.item || '-'}</span>
                    <span className="tabular-nums shrink-0">{formatCurrency(row.realizado)}</span>
                  </div>
                ))}
              </div>
              {onNavigate && (
                <button
                  type="button"
                  onClick={() => onNavigate('painel-controladoria')}
                  className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-sky-700 hover:underline"
                >
                  Abrir Controladoria <ExternalLink className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-slate-100 bg-white p-5">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <h2 className="text-sm font-bold text-slate-800">Alertas — contratos e mensalidades</h2>
              </div>
              {data.alertas.contratos.length === 0 ? (
                <p className="text-xs text-slate-400">Nenhum alerta de contrato no momento.</p>
              ) : (
                <ul className="space-y-2 max-h-40 overflow-auto">
                  {data.alertas.contratos.map((a) => (
                    <li
                      key={a.id + '-' + a.tipo}
                      className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{a.fornecedor}</p>
                        <p className="text-[11px] text-slate-500">
                          {alertaTipoLabel(a.tipo)}
                          {a.setor ? ' · ' + a.setor : ''}
                          {a.mensagem ? ' · ' + a.mensagem : ''}
                        </p>
                      </div>
                      <span className="text-xs font-bold tabular-nums text-slate-700 shrink-0">
                        {formatCurrency(a.valor)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mt-4 mb-2">Investimentos</h3>
              {data.alertas.investimentos.length === 0 ? (
                <p className="text-xs text-slate-400">Nenhum estouro de investimento.</p>
              ) : (
                <ul className="space-y-2 max-h-40 overflow-auto">
                  {data.alertas.investimentos.map((a) => (
                    <li
                      key={'inv-' + a.id}
                      className="flex items-start justify-between gap-3 rounded-xl border border-rose-100 bg-rose-50/30 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-rose-900 truncate">{a.nome}</p>
                        <p className="text-[11px] text-rose-700/80">
                          {a.mensagem}
                          {a.setor ? ' · ' + a.setor : ''}
                        </p>
                      </div>
                      <span className="text-xs font-bold tabular-nums text-rose-800 shrink-0">
                        {formatCurrency(a.valor_realizado)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {onNavigate && (
                <div className="mt-3 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => onNavigate('mensalidades')}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-sky-700 hover:underline"
                  >
                    Ver mensalidades <ExternalLink className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('investimentos')}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-sky-700 hover:underline"
                  >
                    Ver investimentos <ExternalLink className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-100 bg-white p-5">
              <h2 className="text-sm font-bold text-slate-800 mb-4">Principais estouros (uso e consumo)</h2>
              {data.principaisEstouros.length === 0 ? (
                <p className="text-xs text-slate-400">Nenhum estouro registrado.</p>
              ) : (
                <ul className="space-y-2 max-h-64 overflow-auto">
                  {data.principaisEstouros.map((e) => (
                    <li
                      key={e.id}
                      className="rounded-xl border border-rose-100 bg-rose-50/40 px-3 py-2"
                    >
                      <div className="flex justify-between gap-2">
                        <p className="text-sm font-semibold text-rose-900 truncate">{e.item}</p>
                        <span className="text-xs font-bold text-rose-700 tabular-nums shrink-0">
                          +{formatCurrency(e.diferenca)}
                        </span>
                      </div>
                      <p className="text-[11px] text-rose-700/80 mt-0.5">
                        Prev. {formatCurrency(e.previsto)} · Real. {formatCurrency(e.realizado)}
                        {e.setor_responsavel ? ' · ' + e.setor_responsavel : ''}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white p-5">
            <div className="flex items-center gap-2 mb-4">
              <Building2 className="w-4 h-4 text-slate-400" />
              <h2 className="text-sm font-bold text-slate-800">Indicadores por setor (YTD)</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
              {data.setores.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => onNavigate?.(s.tabId)}
                  className={cn(
                    'text-left rounded-xl border p-4 transition-all hover:shadow-md',
                    s.estouro ? 'border-rose-200 bg-rose-50/30' : 'border-slate-100 bg-slate-50/50'
                  )}
                >
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{s.label}</p>
                  <p className="mt-2 text-sm font-bold text-slate-800 tabular-nums">
                    {formatCurrency(s.realizado)}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Prev. {formatCurrency(s.previsto)}
                    {s.estouro && (
                      <span className="ml-2 font-semibold text-rose-600">Estouro</span>
                    )}
                  </p>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white p-5">
            <h2 className="text-sm font-bold text-slate-800 mb-3">Atalhos para painéis</h2>
            <div className="flex flex-wrap gap-2">
              {data.atalhos.map((a) => (
                <button
                  key={a.tabId}
                  type="button"
                  onClick={() => onNavigate?.(a.tabId)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-sky-600 hover:text-sky-700"
                >
                  {a.label}
                  <ExternalLink className="w-3 h-3 opacity-50" />
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
