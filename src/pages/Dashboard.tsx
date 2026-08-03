import React, { useEffect, useMemo, useState } from 'react';
import { IndicatorCard } from '../components/IndicatorCard';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, PieChart, Pie,
} from 'recharts';
import { Calendar, ChevronDown, Download, ArrowUpRight, AlertTriangle } from 'lucide-react';
import { formatCurrency } from '../lib/utils';
import { ValueTrace } from '../components/ValueTrace';
import { valueTrace } from '../lib/valueTraceMeta';
import { useSearch } from '../context/SearchContext';
import { matchesSearch } from '../lib/search';

const MONTH_LABELS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

type RdsItemKey = 'hospedagem' | 'alimentos_bebidas' | 'eventos' | 'diversos' | 'all';

type RdsDetail = {
  label: string;
  total: number;
  items: Array<{ label: string; acumulado: number; section?: string }>;
};

type RealizadoMensalRow = {
  month: number;
  name: string;
  label: string;
  hospedagem: number;
  alimentos_bebidas: number;
  eventos: number;
  diversos: number;
  total: number;
  importado: boolean;
};

const ITEM_OPTIONS: Array<{ key: RdsItemKey; label: string }> = [
  { key: 'all', label: 'Todos os itens' },
  { key: 'hospedagem', label: 'Receita Hospedagem' },
  { key: 'alimentos_bebidas', label: 'Receita A&B' },
  { key: 'eventos', label: 'Receita Eventos' },
  { key: 'diversos', label: 'Outras Receitas' },
];

const SERIES_META = [
  { key: 'hospedagem' as const, label: 'Hospedagem', color: '#0077a8' },
  { key: 'alimentos_bebidas' as const, label: 'A&B', color: '#10b981' },
  { key: 'eventos' as const, label: 'Eventos', color: '#f59e0b' },
  { key: 'diversos' as const, label: 'Outras', color: '#8b5cf6' },
];

const PIE_COLORS = ['#0077a8', '#10b981', '#f59e0b', '#8b5cf6'];

const formatTraceMoney = (value: number) =>
  value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Texto do hover: lista real das linhas RDS que entraram na soma do card. */
const buildRdsCardTrace = (
  cardLabel: string,
  month: number,
  year: number,
  detail?: RdsDetail | null
) => {
  const source = `Apuração de Receita › Relatório Diário de Situação › ${MONTH_LABELS[month - 1]}/${year} › ${cardLabel}`;
  const items = detail?.items ?? [];
  if (!items.length) {
    return {
      source,
      tables: 'rds_snapshots',
      calculation:
        `Soma Acumulado (R$) das linhas específicas mapeadas para ${cardLabel} (não usa o Total da seção).\nNenhuma linha encontrada no RDS deste período — confira a importação.`,
    };
  }
  const lines = items.map((item) => {
    const section = item.section ? ` [${item.section}]` : '';
    return `• ${item.label}${section}: ${formatTraceMoney(Number(item.acumulado) || 0)}`;
  });
  const total = Number(detail?.total) || items.reduce((s, i) => s + (Number(i.acumulado) || 0), 0);
  return {
    source,
    tables: 'rds_snapshots',
    calculation:
      `Soma Acumulado (R$) das linhas abaixo (não usa o Total da seção):\n${lines.join('\n')}\n= Total: ${formatTraceMoney(total)}`,
  };
};

export const Dashboard: React.FC = () => {
  const { query } = useSearch();
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(String(now.getMonth() + 1));
  const [selectedYear, setSelectedYear] = useState(String(now.getFullYear()));
  const [itemFilter, setItemFilter] = useState<RdsItemKey>('all');
  const [periodOpen, setPeriodOpen] = useState(false);
  const [chartSeries, setChartSeries] = useState({
    hospedagem: true,
    alimentos_bebidas: true,
    eventos: true,
    diversos: true,
  });
  const [indicators, setIndicators] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const periodLabel = useMemo(() => {
    const monthIdx = Math.max(1, Math.min(12, Number(selectedMonth) || 1)) - 1;
    return `${MONTH_LABELS[monthIdx]}, ${selectedYear}`;
  }, [selectedMonth, selectedYear]);

  const yearOptions = useMemo(() => {
    const current = new Date().getFullYear();
    return Array.from({ length: 6 }, (_, i) => String(current - 2 + i));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({
      month: selectedMonth,
      year: selectedYear,
    });
    fetch(`/api/dashboard/indicators?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setIndicators(data);
      })
      .catch(() => {
        if (!cancelled) setIndicators(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedMonth, selectedYear]);

  const monthNum = Number(selectedMonth) || 1;
  const yearNum = Number(selectedYear) || now.getFullYear();

  const revenueCards = useMemo(() => {
    if (!indicators) return [];
    const detalhes = (indicators.rdsDetalhes ?? {}) as Record<string, RdsDetail>;
    const cards = (
      [
        { key: 'hospedagem' as const, title: 'Receita Hospedagem', value: Number(indicators.receitaHospedagem) || 0, color: 'blue' as const },
        { key: 'alimentos_bebidas' as const, title: 'Receita A&B', value: Number(indicators.receitaAlimentosBebidas) || 0, color: 'green' as const },
        { key: 'eventos' as const, title: 'Receita Eventos', value: Number(indicators.receitaEventos) || 0, color: 'orange' as const },
        { key: 'diversos' as const, title: 'Outras Receitas', value: Number(indicators.receitaDiversos) || 0, color: 'neutral' as const },
      ] as const
    ).map((card) => ({
      ...card,
      ...buildRdsCardTrace(card.title, monthNum, yearNum, detalhes[card.key]),
    }));
    return itemFilter === 'all' ? cards : cards.filter((c) => c.key === itemFilter);
  }, [indicators, itemFilter, monthNum, yearNum]);

  const detailSections = useMemo(() => {
    const detalhes = (indicators?.rdsDetalhes ?? {}) as Record<string, RdsDetail>;
    const keys =
      itemFilter === 'all'
        ? (['hospedagem', 'alimentos_bebidas', 'eventos', 'diversos'] as const)
        : ([itemFilter] as const);

    return keys
      .map((key) => {
        const section = detalhes[key];
        if (!section) return null;
        const items = (section.items ?? []).filter((item) =>
          matchesSearch(query, item.label, item.acumulado, item.section, section.label)
        );
        return {
          key,
          label: section.label,
          total: section.total || 0,
          items,
        };
      })
      .filter(Boolean) as Array<{
      key: string;
      label: string;
      total: number;
      items: Array<{ label: string; acumulado: number; section?: string }>;
    }>;
  }, [indicators, itemFilter, query]);

  const realizadoData = useMemo(() => {
    const rows: RealizadoMensalRow[] = Array.isArray(indicators?.realizadoMensal)
      ? indicators.realizadoMensal
      : [];
    return rows.filter((row) =>
      matchesSearch(
        query,
        row.label,
        row.name,
        row.hospedagem,
        row.alimentos_bebidas,
        row.eventos,
        row.diversos,
        row.total
      )
    );
  }, [indicators, query]);

  const pieData = useMemo(() => {
    const cards = [
      { name: 'Hospedagem', value: Number(indicators?.receitaHospedagem) || 0 },
      { name: 'A&B', value: Number(indicators?.receitaAlimentosBebidas) || 0 },
      { name: 'Eventos', value: Number(indicators?.receitaEventos) || 0 },
      { name: 'Outras', value: Number(indicators?.receitaDiversos) || 0 },
    ].filter((c) => itemFilter === 'all' || (
      (itemFilter === 'hospedagem' && c.name === 'Hospedagem') ||
      (itemFilter === 'alimentos_bebidas' && c.name === 'A&B') ||
      (itemFilter === 'eventos' && c.name === 'Eventos') ||
      (itemFilter === 'diversos' && c.name === 'Outras')
    ));

    const total = cards.reduce((s, c) => s + c.value, 0);
    return cards.map((c, i) => ({
      ...c,
      percent: total > 0 ? (c.value / total) * 100 : 0,
      color: PIE_COLORS[i % PIE_COLORS.length],
    }));
  }, [indicators, itemFilter]);

  const toggleSeries = (key: keyof typeof chartSeries) => {
    setChartSeries((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  if (loading && !indicators) {
    return <div className="p-8 text-slate-400">Carregando indicadores...</div>;
  }

  if (!indicators) {
    return <div className="p-8 text-slate-400">Não foi possível carregar os indicadores.</div>;
  }

  const pieTotal = pieData.reduce((s, c) => s + c.value, 0);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Resumo Executivo</h2>
          <p className="text-slate-500 text-sm">
            Receitas do RDS por competência — soma de linhas específicas (Acumulado R$), não o Total da seção.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={itemFilter}
            onChange={(e) => setItemFilter(e.target.value as RdsItemKey)}
            className="px-4 py-2 bg-white border border-slate-200 rounded-xl shadow-sm text-sm font-medium text-slate-600"
          >
            {ITEM_OPTIONS.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))}
          </select>

          <div className="relative">
            <button
              type="button"
              onClick={() => setPeriodOpen((open) => !open)}
              className="flex items-center gap-2 bg-white border border-slate-200 px-4 py-2 rounded-xl shadow-sm hover:bg-slate-50 transition-colors"
            >
              <Calendar className="w-4 h-4 text-slate-400" />
              <span className="text-sm font-medium text-slate-600">{periodLabel}</span>
              <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${periodOpen ? 'rotate-180' : ''}`} />
            </button>

            {periodOpen && (
              <>
                <button
                  type="button"
                  className="fixed inset-0 z-10 cursor-default"
                  aria-label="Fechar filtro de período"
                  onClick={() => setPeriodOpen(false)}
                />
                <div className="absolute right-0 top-full mt-2 z-20 w-64 bg-white border border-slate-200 rounded-2xl shadow-lg p-3 space-y-3">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Mês</label>
                    <select
                      value={selectedMonth}
                      onChange={(e) => setSelectedMonth(e.target.value)}
                      className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                    >
                      {MONTH_LABELS.map((label, idx) => (
                        <option key={label} value={String(idx + 1)}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ano</label>
                    <select
                      value={selectedYear}
                      onChange={(e) => setSelectedYear(e.target.value)}
                      className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                    >
                      {yearOptions.map((year) => (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPeriodOpen(false)}
                    className="w-full px-3 py-2 rounded-xl bg-[#004D40] text-white text-sm font-bold hover:bg-[#003d33] transition-colors"
                  >
                    Aplicar período
                  </button>
                </div>
              </>
            )}
          </div>

          <button className="flex items-center gap-2 bg-[#004D40] text-white px-4 py-2.5 rounded-xl shadow-lg shadow-emerald-900/10 hover:bg-[#003d33] transition-colors">
            <Download className="w-4 h-4" />
            <span className="text-sm font-bold">Exportar</span>
          </button>
        </div>
      </div>

      {!indicators.rdsImportado && (
        <div className="flex items-center gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Nenhum RDS importado para {periodLabel}. Importe em Importação › Relatório Diário de Situação.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {revenueCards.map((card) => (
          <IndicatorCard
            key={card.key}
            title={card.title}
            value={card.value}
            type="currency"
            variation={0}
            description={indicators.rdsReportDate ? `RDS ${indicators.rdsReportDate}` : 'Soma linhas específicas'}
            color={card.color}
            traceSource={card.source}
            traceCalculation={card.calculation}
            traceTables={card.tables}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <h3 className="font-bold text-slate-800">Realizado Mensal</h3>
            <div className="flex flex-wrap items-center gap-3">
              {SERIES_META.map((serie) => (
                <label key={serie.key} className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={chartSeries[serie.key]}
                    onChange={() => toggleSeries(serie.key)}
                    className="rounded border-slate-300"
                  />
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: serie.color }} />
                  <span className="text-xs font-medium text-slate-500">{serie.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={realizadoData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#94a3b8', fontSize: 12 }}
                  dy={10}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#94a3b8', fontSize: 12 }}
                  tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`}
                />
                <Tooltip
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: number, name: string) => [
                    formatCurrency(Number(value) || 0),
                    SERIES_META.find((s) => s.key === name)?.label || name,
                  ]}
                />
                {SERIES_META.filter((s) => chartSeries[s.key]).map((serie) => (
                  <Bar
                    key={serie.key}
                    dataKey={serie.key}
                    fill={serie.color}
                    radius={[4, 4, 0, 0]}
                    barSize={18}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[10px] text-slate-400 mt-3">
            Totais Acumulado (R$) do RDS por mês em {selectedYear}.
          </p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-8">Composição de Receita</h3>
          <div className="h-[240px] w-full relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={8}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => formatCurrency(Number(value) || 0)} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-lg font-bold text-slate-800">{formatCurrency(pieTotal)}</span>
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">Total</span>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            {pieData.map((item) => (
              <div key={item.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-sm text-slate-600 font-medium">{item.name}</span>
                </div>
                <span className="text-sm font-bold text-slate-800">{item.percent.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-bold text-slate-800">Valores detalhados</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Itens do RDS · Acumulado (R$) · {periodLabel}
              {itemFilter !== 'all' ? ` · ${ITEM_OPTIONS.find((o) => o.key === itemFilter)?.label}` : ''}
            </p>
          </div>
        </div>

        {detailSections.length === 0 || detailSections.every((s) => s.items.length === 0) ? (
          <div className="px-5 py-12 text-center text-sm text-slate-400">
            Sem itens detalhados para o filtro selecionado.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {detailSections.map((section) => (
              <div key={section.key} className="p-5 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-500">{section.label}</p>
                  <ValueTrace
                    className="text-sm font-bold text-slate-900 tabular-nums"
                    displayValue={formatCurrency(section.total)}
                    source={rdsTrace(section.label, monthNum, yearNum).source}
                    calculation={rdsTrace(section.label, monthNum, yearNum).calculation}
                  />
                </div>
                <div className="overflow-auto">
                  <table className="w-full text-left border-collapse min-w-[420px]">
                    <thead>
                      <tr className="bg-slate-50/80">
                        <th className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Item</th>
                        <th className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Seção RDS</th>
                        <th className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">
                          Acumulado (R$)
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {section.items.map((item) => (
                        <tr key={`${section.key}-${item.section ?? ''}-${item.label}`} className="hover:bg-slate-50/60">
                          <td className="px-3 py-2 text-xs text-slate-700">{item.label}</td>
                          <td className="px-3 py-2 text-xs text-slate-500">{item.section || '—'}</td>
                          <td className="px-3 py-2 text-xs text-right tabular-nums text-slate-800 font-medium">
                            {formatCurrency(item.acumulado)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-100">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Ponto de Equilíbrio</p>
          <ValueTrace
            className="text-xl font-bold text-slate-800"
            displayValue={formatCurrency(indicators.pontoEquilibrio)}
            meta={valueTrace.dashboard.indicator('pontoEquilibrio', 'Ponto de Equilíbrio')}
          />
          <div className="w-full bg-slate-100 h-1.5 rounded-full mt-3 overflow-hidden">
            <div className="bg-emerald-500 h-full w-[75%]" />
          </div>
          <p className="text-[10px] text-slate-500 mt-2 font-medium">75% atingido este mês</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-100">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">NCG</p>
          <ValueTrace
            className="text-xl font-bold text-slate-800"
            displayValue={formatCurrency(indicators.ncg)}
            meta={valueTrace.dashboard.indicator('ncg', 'NCG')}
          />
          <p className="text-[10px] text-orange-600 mt-3 font-bold flex items-center gap-1">
            <ArrowUpRight className="w-3 h-3" /> +12% vs ideal
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-100">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Caixa Mínimo</p>
          <ValueTrace
            className="text-xl font-bold text-slate-800"
            displayValue={formatCurrency(indicators.caixaMinimo)}
            meta={valueTrace.dashboard.indicator('caixaMinimo', 'Caixa Mínimo')}
          />
          <p className="text-[10px] text-emerald-600 mt-3 font-bold flex items-center gap-1">
            Status: Seguro
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-100">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Investimentos</p>
          <ValueTrace
            className="text-xl font-bold text-slate-800"
            displayValue={`${indicators.investimentos}%`}
            meta={valueTrace.dashboard.indicator('investimentos', 'Investimentos')}
          />
          <p className="text-[10px] text-slate-500 mt-3 font-medium">Do faturamento bruto</p>
        </div>
      </div>
    </div>
  );
};
