import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCcw, Plus, Save, TrendingUp, Building2, Pencil } from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';

// ---------------------------------------------------------------------------
// Indicadores Gerenciais (Números Vivaz) — Realizado x Metas por (ano, mês)
// Layout espelhado no DRE Gerencial: tabela larga (w-full) com 1ª coluna e
// cabeçalho fixos, filtro de meses com período acumulado (multi-seleção) e
// destaque de estouro. Inclui aba de Comparativo Anual.
// Modelo "inputs + cálculo no sistema": guardamos os inputs; o backend calcula
// ocupação, diária média, RevPAR, faturamento, EBITDA, resultado etc.
// ---------------------------------------------------------------------------

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

type Escopo = 'realizado' | 'meta';
type ViewMode = 'comparativo' | 'anual' | 'realizado' | 'meta';

type MonthData = {
  month: number;
  inputs: Record<string, number>;
  [k: string]: any;
};
type EscopoData = { months: MonthData[]; total: MonthData };
type ApiResponse = {
  year: number;
  uhs: number;
  realizado: EscopoData;
  meta: EscopoData;
};

// Formatação
const fmtInt = (v: number) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(v || 0);
const fmtPct = (frac: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(frac || 0);
type Fmt = 'money' | 'pct' | 'int';
const fmtVal = (fmt: Fmt, v: number) => (fmt === 'money' ? formatCurrency(v || 0) : fmt === 'pct' ? fmtPct(v || 0) : fmtInt(v || 0));

// Indicadores exibidos no comparativo (Previsto x Realizado)
// dir: 'up' = quanto maior melhor (receita/resultado) · 'down' = quanto menor melhor (despesa → estoura se real > prev)
type Indicator = { key: string; label: string; fmt: Fmt; src?: 'input'; dir: 'up' | 'down' };
const KEY_INDICATORS: Indicator[] = [
  { key: 'rn', label: 'RN (Room-nights)', fmt: 'int', src: 'input', dir: 'up' },
  { key: 'ocupacao', label: 'Ocupação', fmt: 'pct', dir: 'up' },
  { key: 'diaria_media', label: 'Diária Média', fmt: 'money', dir: 'up' },
  { key: 'revpar', label: 'RevPAR', fmt: 'money', dir: 'up' },
  { key: 'receita_hospedagem', label: 'Receita Hospedagem', fmt: 'money', src: 'input', dir: 'up' },
  { key: 'total_pdvs', label: 'Receita A&B', fmt: 'money', dir: 'up' },
  { key: 'total_outras', label: 'Outras Receitas', fmt: 'money', dir: 'up' },
  { key: 'faturamento', label: 'Faturamento', fmt: 'money', dir: 'up' },
  { key: 'despesas_op', label: 'Despesas Operac.', fmt: 'money', dir: 'down' },
  { key: 'ebitda', label: 'EBITDA', fmt: 'money', dir: 'up' },
  { key: 'margem_ebitda', label: 'Margem EBITDA', fmt: 'pct', dir: 'up' },
  { key: 'resultado_liquido', label: 'Resultado Líquido', fmt: 'money', dir: 'up' },
  { key: 'rl_sobre_faturamento', label: 'Result. Líq. ÷ Faturamento', fmt: 'pct', dir: 'up' },
];

// Campos de entrada editáveis, agrupados
const INPUT_GROUPS: { group: string; fields: [string, string][] }[] = [
  { group: 'Hospedagem', fields: [['rn', 'RN (room-nights)'], ['receita_hospedagem', 'Receita Hospedagem'], ['pax', 'PAX']] },
  {
    group: 'A&B / PDVs',
    fields: [['frigobar', 'Frigobar'], ['room_service', 'Room Service'], ['bar_gaia', 'Bar Gaia'], ['rest_allegro', 'Rest. Allegro'], ['rest_terraza', 'Rest. Terraza'], ['map_comercial', 'MAP Comercial'], ['eventos_banquetes', 'Eventos / Banquetes']],
  },
  { group: 'Outras Receitas', fields: [['eventos', 'Eventos'], ['outras_receitas', 'Outras Receitas'], ['nao_operacional', 'Não Operacional']] },
  {
    group: 'Despesas / DRE',
    fields: [['cmv', 'CMV'], ['csp', 'CSP - Aquamania'], ['impostos_faturamento', 'Impostos s/ Fat.'], ['desp_operacional', 'Desp. Operacional'], ['desp_pessoal', 'Desp. Pessoal'], ['desp_vendas', 'Desp. Vendas'], ['pessoal_zz', 'Pessoal ZZ'], ['despesas_zz', 'Despesas ZZ'], ['csll_ir', 'CSLL e IR'], ['investimentos', 'Investimentos']],
  },
  { group: 'Repasses / Equipe', fields: [['map_repasse', 'MAP (repasse)'], ['cafe_repasse', 'Café (repasse)'], ['qtd_equipe', 'Qtd. Equipe']] },
];

// Lê um valor (input ou calculado) de um mês/agregado
const readVal = (m: MonthData | undefined, key: string, src?: 'input') => {
  if (!m) return 0;
  if (src === 'input') return Number(m.inputs?.[key]) || 0;
  return Number(m[key] ?? m.inputs?.[key]) || 0;
};

// Agrega uma lista de meses num "mês sintético" com os indicadores corretos.
// Aditivos são somados; razões (ocupação, diária média, RevPAR, margens) são
// recalculadas a partir dos componentes somados.
const aggregate = (months: MonthData[]): MonthData => {
  const sum = (f: (m: MonthData) => number) => months.reduce((s, m) => s + f(m), 0);
  const rn = sum((m) => readVal(m, 'rn', 'input'));
  const rn_totais = sum((m) => Number(m.rn_totais) || 0);
  const receita = sum((m) => readVal(m, 'receita_hospedagem', 'input'));
  const faturamento = sum((m) => Number(m.faturamento) || 0);
  const ebitda = sum((m) => Number(m.ebitda) || 0);
  const resultado_liquido = sum((m) => Number(m.resultado_liquido) || 0);
  return {
    month: 0,
    inputs: { rn, receita_hospedagem: receita },
    rn_totais,
    ocupacao: rn_totais > 0 ? rn / rn_totais : 0,
    diaria_media: rn > 0 ? receita / rn : 0,
    revpar: rn_totais > 0 ? receita / rn_totais : 0,
    total_pdvs: sum((m) => Number(m.total_pdvs) || 0),
    total_outras: sum((m) => Number(m.total_outras) || 0),
    faturamento,
    despesas_op: sum((m) => Number(m.despesas_op) || 0),
    ebitda,
    margem_ebitda: faturamento > 0 ? ebitda / faturamento : 0,
    resultado_liquido,
    rl_sobre_faturamento: faturamento > 0 ? resultado_liquido / faturamento : 0,
  };
};

// Favorabilidade da diferença (Realizado − Previsto) conforme a direção do indicador.
const favor = (dir: 'up' | 'down', dif: number): 'good' | 'bad' | 'zero' => {
  if (!dif) return 'zero';
  const good = dir === 'up' ? dif > 0 : dif < 0;
  return good ? 'good' : 'bad';
};
const favorClass = (f: 'good' | 'bad' | 'zero') =>
  f === 'bad' ? 'text-red-600' : f === 'good' ? 'text-emerald-600' : 'text-slate-400';

type ComparativoAnual = {
  anos: number[];
  realizado: Record<string, MonthData>;
  meta: Record<string, MonthData>;
};

export const IndicadoresPage: React.FC = () => {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState<number>(currentYear);
  const [years, setYears] = useState<number[]>([]);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<ViewMode>('comparativo');
  const [userRole, setUserRole] = useState<string>('viewer');
  const [uhsDraft, setUhsDraft] = useState<string>('172');

  // Filtro de meses (índices 0–11). Vazio = todos. Multi-seleção = período acumulado.
  const [selectedMonths, setSelectedMonths] = useState<number[]>(() => Array.from({ length: 12 }, (_, i) => i));
  const [lastClicked, setLastClicked] = useState<number | null>(null);

  // edição de células (edit grid)
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  // comparativo anual
  const [compAnos, setCompAnos] = useState<number[]>([]);
  const [compBase, setCompBase] = useState<Escopo>('realizado');
  const [comp, setComp] = useState<ComparativoAnual | null>(null);
  const [compLoading, setCompLoading] = useState(false);

  const canEdit = userRole === 'admin' || userRole === 'controle' || userRole === 'finance';

  const visibleMonths = useMemo(() => {
    const set = new Set(selectedMonths);
    const months = MESES.map((_, i) => i).filter((i) => set.has(i));
    return months.length ? months : MESES.map((_, i) => i);
  }, [selectedMonths]);
  const allMonthsSelected = visibleMonths.length === 12;
  const selectAllMonths = () => { setSelectedMonths(Array.from({ length: 12 }, (_, i) => i)); setLastClicked(null); };
  // Clique: alterna o mês (acumula). Shift+clique: seleciona a faixa até o último clicado.
  const clickMonth = (i: number, shift: boolean) => {
    if (shift && lastClicked != null) {
      const [a, b] = [Math.min(lastClicked, i), Math.max(lastClicked, i)];
      setSelectedMonths(Array.from({ length: b - a + 1 }, (_, k) => a + k));
    } else {
      setSelectedMonths((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i].sort((x, y) => x - y)));
    }
    setLastClicked(i);
  };

  const loadYears = async () => {
    try {
      const r = await fetch('/api/indicadores/anos').then((x) => x.json());
      const ys: number[] = Array.isArray(r?.years) ? r.years : [];
      const merged = Array.from(new Set([...ys, currentYear])).sort((a, b) => a - b);
      setYears(merged);
      if (!merged.includes(year) && merged.length) setYear(merged[merged.length - 1]);
      if (!compAnos.length) setCompAnos(merged.slice(-3)); // default: últimos 3 anos
    } catch { /* ignore */ }
  };

  const loadData = async (y = year) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/indicadores?year=${y}`);
      const json = await res.json();
      if (!res.ok) { alert(json.error || 'Erro ao carregar indicadores.'); return; }
      setData(json);
      setUhsDraft(String(json.uhs ?? 172));
      setEdits({});
    } finally {
      setLoading(false);
    }
  };

  const loadComparativo = async (anos = compAnos) => {
    if (!anos.length) { setComp(null); return; }
    setCompLoading(true);
    try {
      const res = await fetch(`/api/indicadores/comparativo?anos=${anos.join(',')}`);
      const json = await res.json();
      if (!res.ok) { alert(json.error || 'Erro ao carregar comparativo.'); return; }
      setComp(json);
    } finally {
      setCompLoading(false);
    }
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem('user');
      if (raw) setUserRole(String(JSON.parse(raw)?.role || 'viewer'));
    } catch { /* ignore */ }
    loadYears();
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Carrega comparativo quando entrar na aba ou mudar a seleção de anos.
  useEffect(() => {
    if (view === 'anual' && compAnos.length) loadComparativo(compAnos);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, compAnos]);

  const escopoData = (esc: Escopo): EscopoData | undefined => (esc === 'realizado' ? data?.realizado : data?.meta);

  // Ano tem metas? (para sinalizar "sem meta" — ex.: 2018)
  const hasMeta = useMemo(
    () => !!data && data.meta.months.some((m) => (Number(m.inputs?.rn) || 0) !== 0 || (Number(m.faturamento) || 0) !== 0),
    [data]
  );

  // ---- Comparativo Prev x Real ----
  const comparativoRows = useMemo(() => {
    if (!data) return [];
    const totalReal = aggregate(visibleMonths.map((i) => data.realizado.months[i]));
    const totalMeta = aggregate(visibleMonths.map((i) => data.meta.months[i]));
    return KEY_INDICATORS.map((ind) => {
      const months = visibleMonths.map((idx) => {
        const prev = readVal(data.meta.months[idx], ind.key, ind.src);
        const real = readVal(data.realizado.months[idx], ind.key, ind.src);
        return { monthIndex: idx, prev, real, dif: real - prev };
      });
      const tPrev = readVal(totalMeta, ind.key, ind.src);
      const tReal = readVal(totalReal, ind.key, ind.src);
      return { ind, months, totalPrev: tPrev, totalReal: tReal, totalDif: tReal - tPrev };
    });
  }, [data, visibleMonths]);

  // ---- Edição de célula ----
  const cellKey = (field: string, month: number) => `${field}:${month}`;

  const saveCell = async (esc: Escopo, field: string, month: number) => {
    const k = cellKey(field, month);
    const raw = edits[k];
    if (raw === undefined) return;
    const parsed = Number(String(raw).replace(',', '.'));
    if (!Number.isFinite(parsed)) { alert('Digite um número válido.'); return; }
    setSavingKey(k);
    try {
      const res = await fetch('/api/indicadores/cell', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ escopo: esc, year, month, field, value: parsed }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { alert(json.error || 'Erro ao salvar.'); return; }
      await loadData();
    } finally {
      setSavingKey(null);
    }
  };

  const saveUhs = async () => {
    const v = Math.round(Number(uhsDraft));
    if (!Number.isFinite(v) || v <= 0) { alert('UHs deve ser inteiro positivo.'); return; }
    const res = await fetch('/api/indicadores/parametros', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year, uhs: v }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { alert(json.error || 'Erro ao salvar UHs.'); return; }
    await loadData();
  };

  const addYear = async () => {
    const input = window.prompt('Adicionar ano (ex.: 2027):', String(currentYear + 1));
    if (!input) return;
    const y = Math.round(Number(input));
    if (!Number.isFinite(y) || y < 2000 || y > 2100) { alert('Ano inválido.'); return; }
    setYears((prev) => Array.from(new Set([...prev, y])).sort((a, b) => a - b));
    setYear(y);
    setView('realizado');
    await loadData(y);
  };

  // ---- Card de filtro de meses (período acumulado) ----
  const renderMonthFilter = () => (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm px-4 py-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
          Filtrar meses
          {!allMonthsSelected && (
            <span className="ml-2 normal-case tracking-normal text-slate-500 font-semibold">
              · período: {visibleMonths.map((i) => MESES[i].slice(0, 3)).join(', ')}
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
        {MESES.map((mes, monthIndex) => {
          const active = visibleMonths.includes(monthIndex);
          return (
            <button
              key={mes}
              type="button"
              onClick={(e) => clickMonth(monthIndex, e.shiftKey)}
              title="Clique para incluir/excluir · Shift+clique para faixa · Mostrar todos para o ano"
              className={cn(
                'px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors border',
                active
                  ? 'bg-[#004D40] text-white border-[#004D40] shadow-sm'
                  : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300 hover:text-slate-600'
              )}
            >
              {mes.slice(0, 3)}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-slate-400">
        Selecione um ou mais meses para o acumulado do período. <b>Shift+clique</b> seleciona uma faixa (ex.: Jan→Abr).
      </p>
    </div>
  );

  // ---- Comparativo Prev x Real (layout DRE) ----
  const renderComparativo = () => (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="overflow-x-auto overflow-y-visible">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-30">
            <tr className="bg-slate-100 border-b border-slate-200">
              <th rowSpan={2} className="sticky left-0 z-30 min-w-[240px] max-w-[240px] border-r border-slate-200 bg-slate-100 px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                Indicador
              </th>
              {visibleMonths.map((monthIndex) => (
                <th key={MESES[monthIndex]} colSpan={3} className="border-r border-slate-200 px-3 py-2 text-center text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  {MESES[monthIndex]} {data?.year}
                </th>
              ))}
              <th colSpan={3} className="border-r border-slate-200 px-3 py-2 text-center text-[11px] font-bold uppercase tracking-wider text-slate-700 bg-slate-200/70">
                {allMonthsSelected ? `Total ${data?.year ?? ''}` : `Acumulado (${visibleMonths.length} mês${visibleMonths.length === 1 ? '' : 'es'})`}
              </th>
            </tr>
            <tr className="bg-slate-50 border-b border-slate-200">
              {[...visibleMonths.map((i) => MESES[i]), 'Total'].map((mes) => (
                <React.Fragment key={`${mes}-sub`}>
                  <th className="min-w-[110px] border-r border-slate-100 px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-slate-500">Previsto</th>
                  <th className="min-w-[110px] border-r border-slate-100 px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-slate-500">Realizado</th>
                  <th className="min-w-[110px] border-r border-slate-200 px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-slate-500">Diferença</th>
                </React.Fragment>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {comparativoRows.map(({ ind, months, totalPrev, totalReal, totalDif }) => {
              const totalF = favor(ind.dir, totalDif);
              return (
                <tr key={ind.key} className="hover:bg-slate-50 text-slate-600">
                  <td className="sticky left-0 z-20 bg-white border-r border-slate-200 min-w-[240px] max-w-[240px] px-4 py-2.5">
                    <span className="text-sm font-semibold text-slate-700">{ind.label}</span>
                  </td>
                  {months.map((c) => {
                    const f = hasMeta ? favor(ind.dir, c.dif) : 'zero';
                    const estouro = hasMeta && ind.dir === 'down' && c.real > c.prev && c.prev !== 0; // despesa acima do previsto
                    return (
                      <React.Fragment key={c.monthIndex}>
                        <td className="min-w-[110px] border-r border-slate-100 px-3 py-1.5 text-right text-xs tabular-nums text-slate-500">
                          {hasMeta ? fmtVal(ind.fmt, c.prev) : <span className="text-slate-300">—</span>}
                        </td>
                        <td className={cn('min-w-[110px] border-r border-slate-100 px-3 py-1.5 text-right text-xs tabular-nums font-medium',
                          estouro ? 'bg-red-50 text-red-700 font-bold' : 'text-slate-800')}>
                          {fmtVal(ind.fmt, c.real)}
                        </td>
                        <td className={cn('min-w-[110px] border-r border-slate-200 px-3 py-1.5 text-right text-xs tabular-nums font-semibold',
                          estouro && 'bg-red-50', favorClass(f))}>
                          {hasMeta ? fmtVal(ind.fmt, c.dif) : <span className="text-slate-300">—</span>}
                        </td>
                      </React.Fragment>
                    );
                  })}
                  <td className="min-w-[110px] px-3 py-1.5 text-right text-xs tabular-nums text-slate-600 bg-slate-50/60">
                    {hasMeta ? fmtVal(ind.fmt, totalPrev) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="min-w-[110px] px-3 py-1.5 text-right text-xs tabular-nums font-bold text-slate-900 bg-slate-50/60">{fmtVal(ind.fmt, totalReal)}</td>
                  <td className={cn('min-w-[110px] px-3 py-1.5 text-right text-xs tabular-nums font-bold bg-slate-50/60', favorClass(hasMeta ? totalF : 'zero'))}>
                    {hasMeta ? fmtVal(ind.fmt, totalDif) : <span className="text-slate-300">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!hasMeta && data && (
        <div className="px-5 py-2.5 border-t border-slate-100 bg-amber-50/60 text-[11px] text-amber-700 font-medium">
          {data.year} não possui metas cadastradas — as colunas de Previsto e Diferença aparecem como “—”.
        </div>
      )}
    </div>
  );

  // ---- Comparativo Anual ----
  const renderComparativoAnual = () => {
    const base = compBase === 'realizado' ? comp?.realizado : comp?.meta;
    const anos = comp?.anos ?? [];
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm px-4 py-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Anos no comparativo</p>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Base</span>
              {(['realizado', 'meta'] as Escopo[]).map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setCompBase(b)}
                  className={cn('px-2.5 py-1 rounded-lg text-xs font-bold transition-colors border',
                    compBase === b ? 'bg-[#004D40] text-white border-[#004D40]' : 'bg-white text-slate-400 border-slate-200 hover:text-slate-600')}
                >
                  {b === 'realizado' ? 'Realizado' : 'Meta'}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {years.map((y) => {
              const active = compAnos.includes(y);
              return (
                <button
                  key={y}
                  type="button"
                  onClick={() => setCompAnos((prev) => (prev.includes(y) ? prev.filter((x) => x !== y) : [...prev, y].sort((a, b) => a - b)))}
                  className={cn('px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border',
                    active ? 'bg-[#004D40] text-white border-[#004D40] shadow-sm' : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300 hover:text-slate-600')}
                >
                  {y}
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-slate-400">Comparação ano a ano (total anual). A variação % é calculada entre cada ano e o ano imediatamente anterior selecionado.</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto overflow-y-visible">
            <table className="w-full border-collapse text-left">
              <thead className="sticky top-0 z-30">
                <tr className="bg-slate-100 border-b border-slate-200">
                  <th className="sticky left-0 z-30 min-w-[240px] max-w-[240px] border-r border-slate-200 bg-slate-100 px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                    Indicador ({compBase === 'realizado' ? 'Realizado' : 'Meta'})
                  </th>
                  {anos.map((y, i) => (
                    <React.Fragment key={y}>
                      {i > 0 && <th className="min-w-[80px] border-r border-slate-100 px-2 py-3 text-right text-[10px] font-bold uppercase tracking-wide text-slate-400">Δ%</th>}
                      <th className="min-w-[120px] border-r border-slate-200 px-3 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-slate-600">{y}</th>
                    </React.Fragment>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {compLoading ? (
                  <tr><td colSpan={anos.length * 2} className="px-4 py-6 text-center text-sm text-slate-400">Carregando…</td></tr>
                ) : anos.length === 0 ? (
                  <tr><td className="px-4 py-6 text-center text-sm text-slate-400">Selecione ao menos um ano.</td></tr>
                ) : (
                  KEY_INDICATORS.map((ind) => (
                    <tr key={ind.key} className="hover:bg-slate-50 text-slate-600">
                      <td className="sticky left-0 z-20 bg-white border-r border-slate-200 min-w-[240px] max-w-[240px] px-4 py-2 text-sm font-semibold text-slate-700">{ind.label}</td>
                      {anos.map((y, i) => {
                        const val = readVal(base?.[y], ind.key, ind.src);
                        const prevVal = i > 0 ? readVal(base?.[anos[i - 1]], ind.key, ind.src) : 0;
                        const varc = i > 0 && prevVal !== 0 ? val / prevVal - 1 : null;
                        const f = varc == null ? 'zero' : favor(ind.dir, varc);
                        return (
                          <React.Fragment key={y}>
                            {i > 0 && (
                              <td className={cn('min-w-[80px] border-r border-slate-100 px-2 py-2 text-right text-xs tabular-nums font-semibold', favorClass(f))}>
                                {varc == null ? '—' : `${varc > 0 ? '+' : ''}${fmtPct(varc)}`}
                              </td>
                            )}
                            <td className="min-w-[120px] border-r border-slate-200 px-3 py-2 text-right text-xs tabular-nums font-medium text-slate-800">
                              {fmtVal(ind.fmt, val)}
                            </td>
                          </React.Fragment>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  // ---- Grid de edição (inputs x meses) — layout DRE ----
  const renderEditGrid = (esc: Escopo) => {
    const ed = escopoData(esc);
    const sumField = (field: string) =>
      visibleMonths.reduce((s, idx) => s + (Number(ed?.months?.[idx]?.inputs?.[field]) || 0), 0);
    const totalAgg = ed ? aggregate(visibleMonths.map((i) => ed.months[i])) : undefined;

    return (
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
          <Pencil className="w-4 h-4 text-emerald-700" />
          <h3 className="text-sm font-bold text-slate-800">
            Editar {esc === 'realizado' ? 'Realizado' : 'Metas'} — {data?.year}
          </h3>
          {!canEdit && <span className="text-xs text-amber-600">(somente leitura para seu perfil)</span>}
        </div>
        <div className="overflow-x-auto overflow-y-visible">
          <table className="w-full border-collapse text-left">
            <thead className="sticky top-0 z-30">
              <tr className="bg-slate-100 border-b border-slate-200">
                <th className="sticky left-0 z-30 min-w-[240px] max-w-[240px] border-r border-slate-200 bg-slate-100 px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  Campo
                </th>
                {visibleMonths.map((idx) => (
                  <th key={idx} className="min-w-[104px] border-r border-slate-100 px-2 py-3 text-right text-[10px] font-bold uppercase tracking-wide text-slate-500">
                    {MESES[idx].slice(0, 3)}
                  </th>
                ))}
                <th className="min-w-[120px] px-3 py-3 text-right text-[10px] font-bold uppercase tracking-wide text-slate-600 bg-slate-200/70">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {INPUT_GROUPS.map((g) => (
                <React.Fragment key={g.group}>
                  <tr className="bg-emerald-50/50">
                    <td className="sticky left-0 z-20 bg-emerald-50/50 px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest text-emerald-800">{g.group}</td>
                    <td colSpan={visibleMonths.length + 1} className="bg-emerald-50/50" />
                  </tr>
                  {g.fields.map(([field, label]) => (
                    <tr key={field} className="hover:bg-slate-50/60">
                      <td className="sticky left-0 z-10 bg-white border-r border-slate-200 min-w-[240px] max-w-[240px] px-4 py-1.5 text-xs text-slate-700">{label}</td>
                      {visibleMonths.map((idx) => {
                        const month = idx + 1;
                        const orig = Number(ed?.months?.[idx]?.inputs?.[field] ?? 0);
                        const k = cellKey(field, month);
                        const value = edits[k] ?? String(orig ?? 0);
                        return (
                          <td key={month} className="min-w-[104px] border-r border-slate-100 px-1 py-1 text-right">
                            <input
                              type="number"
                              step="0.01"
                              disabled={!canEdit || savingKey === k}
                              value={value}
                              onChange={(e) => setEdits((p) => ({ ...p, [k]: e.target.value }))}
                              onBlur={() => { if ((edits[k] ?? String(orig)) !== String(orig)) saveCell(esc, field, month); }}
                              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                              className="w-full max-w-[96px] px-2 py-1 text-right text-xs bg-slate-50 border border-slate-200 rounded-md focus:border-emerald-400 focus:bg-white disabled:opacity-60"
                            />
                          </td>
                        );
                      })}
                      <td className="min-w-[120px] px-3 py-1.5 text-right text-xs tabular-nums font-bold text-slate-800 bg-slate-50/60">{fmtInt(sumField(field))}</td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
              {/* Indicadores calculados (read-only) */}
              <tr className="bg-slate-100/70">
                <td colSpan={visibleMonths.length + 2} className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  Indicadores calculados (automático)
                </td>
              </tr>
              {KEY_INDICATORS.filter((i) => !i.src).map((ind) => (
                <tr key={ind.key} className="text-slate-600">
                  <td className="sticky left-0 z-10 bg-white border-r border-slate-200 min-w-[240px] max-w-[240px] px-4 py-1.5 text-xs text-slate-600">{ind.label}</td>
                  {visibleMonths.map((idx) => (
                    <td key={idx} className="min-w-[104px] border-r border-slate-100 px-2 py-1.5 text-right text-xs tabular-nums text-slate-700">
                      {fmtVal(ind.fmt, readVal(ed?.months?.[idx], ind.key))}
                    </td>
                  ))}
                  <td className="min-w-[120px] px-3 py-1.5 text-right text-xs tabular-nums font-semibold text-slate-800 bg-slate-50/60">
                    {fmtVal(ind.fmt, readVal(totalAgg, ind.key))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-500">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <TrendingUp className="w-6 h-6 text-emerald-700" /> Indicadores — Previsto x Realizado
        </h2>
        <p className="text-sm text-slate-500">
          KPIs hoteleiros e DRE gerencial por mês. Você edita os valores de entrada; ocupação, diária média, RevPAR, faturamento, EBITDA e resultado são calculados automaticamente.
        </p>
      </div>

      {/* Barra de controles */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-wrap items-center gap-3">
        <select
          value={year}
          onChange={(e) => { const y = Number(e.target.value); setYear(y); loadData(y); }}
          className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold"
        >
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        {canEdit && (
          <button onClick={addYear} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-xl border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100">
            <Plus className="w-4 h-4" /> Adicionar ano
          </button>
        )}
        <div className="flex items-center gap-1.5 text-sm">
          <Building2 className="w-4 h-4 text-slate-400" />
          <span className="text-xs text-slate-500">UHs:</span>
          <input
            type="number"
            value={uhsDraft}
            disabled={!canEdit}
            onChange={(e) => setUhsDraft(e.target.value)}
            className="w-20 px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-right disabled:opacity-60"
          />
          {canEdit && (
            <button onClick={saveUhs} className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-semibold rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100">
              <Save className="w-3.5 h-3.5" /> Salvar
            </button>
          )}
        </div>
        <button
          onClick={() => { loadData(); if (view === 'anual') loadComparativo(); }}
          disabled={loading}
          className="ml-auto inline-flex items-center gap-2 px-4 py-2 bg-[#004D40] text-white text-sm font-bold rounded-xl hover:bg-[#003d33] disabled:opacity-60"
        >
          <RefreshCcw className="w-4 h-4" /> {loading ? 'Atualizando...' : 'Atualizar'}
        </button>
      </div>

      {/* Abas de visualização */}
      <div className="flex flex-wrap gap-2">
        {([['comparativo', 'Previsto x Realizado'], ['anual', 'Comparativo Anual'], ['realizado', 'Editar Realizado'], ['meta', 'Editar Metas']] as [ViewMode, string][]).map(([v, label]) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={cn(
              'px-4 py-2 rounded-xl text-sm font-semibold border transition-colors',
              view === v ? 'bg-[#004D40] text-white border-[#004D40]' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Filtro de meses — não se aplica ao comparativo anual */}
      {view !== 'anual' && renderMonthFilter()}

      {view === 'comparativo' && renderComparativo()}
      {view === 'anual' && renderComparativoAnual()}
      {view === 'realizado' && renderEditGrid('realizado')}
      {view === 'meta' && renderEditGrid('meta')}
    </div>
  );
};
