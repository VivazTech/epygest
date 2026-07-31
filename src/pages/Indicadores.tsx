import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCcw, Plus, Save, TrendingUp, Building2, Pencil } from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';

// ---------------------------------------------------------------------------
// Indicadores Gerenciais (Números Vivaz) — Realizado x Metas por (ano, mês)
// Layout espelhado no DRE Gerencial: tabela larga (w-full) com 1ª coluna e
// cabeçalho fixos, e filtro de meses (clique num mês mostra só ele).
// Modelo "inputs + cálculo no sistema": guardamos os inputs; o backend calcula
// ocupação, diária média, RevPAR, faturamento, EBITDA, resultado etc.
// ---------------------------------------------------------------------------

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

type Escopo = 'realizado' | 'meta';
type ViewMode = 'comparativo' | 'realizado' | 'meta';

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
const KEY_INDICATORS: { key: string; label: string; fmt: Fmt; src?: 'input' }[] = [
  { key: 'rn', label: 'RN (Room-nights)', fmt: 'int', src: 'input' },
  { key: 'ocupacao', label: 'Ocupação', fmt: 'pct' },
  { key: 'diaria_media', label: 'Diária Média', fmt: 'money' },
  { key: 'revpar', label: 'RevPAR', fmt: 'money' },
  { key: 'receita_hospedagem', label: 'Receita Hospedagem', fmt: 'money', src: 'input' },
  { key: 'total_pdvs', label: 'Receita A&B', fmt: 'money' },
  { key: 'total_outras', label: 'Outras Receitas', fmt: 'money' },
  { key: 'faturamento', label: 'Faturamento', fmt: 'money' },
  { key: 'despesas_op', label: 'Despesas Operac.', fmt: 'money' },
  { key: 'ebitda', label: 'EBITDA', fmt: 'money' },
  { key: 'margem_ebitda', label: 'Margem EBITDA', fmt: 'pct' },
  { key: 'resultado_liquido', label: 'Resultado Líquido', fmt: 'money' },
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
// Aditivos são somados; razões (ocupação, diária média, RevPAR, margem) são
// recalculadas a partir dos componentes somados.
const aggregate = (months: MonthData[]): MonthData => {
  const sum = (f: (m: MonthData) => number) => months.reduce((s, m) => s + f(m), 0);
  const rn = sum((m) => readVal(m, 'rn', 'input'));
  const rn_totais = sum((m) => Number(m.rn_totais) || 0);
  const receita = sum((m) => readVal(m, 'receita_hospedagem', 'input'));
  const faturamento = sum((m) => Number(m.faturamento) || 0);
  const ebitda = sum((m) => Number(m.ebitda) || 0);
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
    resultado_liquido: sum((m) => Number(m.resultado_liquido) || 0),
  };
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

  // Filtro de meses (índices 0–11). Vazio = todos.
  const [selectedMonths, setSelectedMonths] = useState<number[]>(() => Array.from({ length: 12 }, (_, i) => i));

  // edição de células (edit grid)
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const canEdit = userRole === 'admin' || userRole === 'controle' || userRole === 'finance';

  const visibleMonths = useMemo(() => {
    const set = new Set(selectedMonths);
    const months = MESES.map((_, i) => i).filter((i) => set.has(i));
    return months.length ? months : MESES.map((_, i) => i);
  }, [selectedMonths]);
  const allMonthsSelected = visibleMonths.length === 12;
  const selectMonth = (monthIndex: number) => setSelectedMonths([monthIndex]);
  const selectAllMonths = () => setSelectedMonths(Array.from({ length: 12 }, (_, i) => i));

  const loadYears = async () => {
    try {
      const r = await fetch('/api/indicadores/anos').then((x) => x.json());
      const ys: number[] = Array.isArray(r?.years) ? r.years : [];
      const merged = Array.from(new Set([...ys, currentYear])).sort((a, b) => a - b);
      setYears(merged);
      if (!merged.includes(year) && merged.length) setYear(merged[merged.length - 1]);
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

  useEffect(() => {
    try {
      const raw = localStorage.getItem('user');
      if (raw) setUserRole(String(JSON.parse(raw)?.role || 'viewer'));
    } catch { /* ignore */ }
    loadYears();
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const escopoData = (esc: Escopo): EscopoData | undefined => (esc === 'realizado' ? data?.realizado : data?.meta);

  // ---- Comparativo ----
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

  // ---- Card de filtro de meses (igual ao DRE) ----
  const renderMonthFilter = () => (
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
        {MESES.map((mes, monthIndex) => {
          const active = visibleMonths.includes(monthIndex);
          return (
            <button
              key={mes}
              type="button"
              onClick={() => selectMonth(monthIndex)}
              title="Clique para ver só este mês · Use Mostrar todos para voltar"
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
    </div>
  );

  // ---- Comparativo (layout DRE) ----
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
                {allMonthsSelected ? `Total ${data?.year ?? ''}` : `Total (${visibleMonths.length} mês${visibleMonths.length === 1 ? '' : 'es'})`}
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
            {comparativoRows.map(({ ind, months, totalPrev, totalReal, totalDif }) => (
              <tr key={ind.key} className="hover:bg-slate-50 text-slate-600">
                <td className="sticky left-0 z-20 bg-white border-r border-slate-200 min-w-[240px] max-w-[240px] px-4 py-2.5">
                  <span className="text-sm font-semibold text-slate-700">{ind.label}</span>
                </td>
                {months.map((c) => (
                  <React.Fragment key={c.monthIndex}>
                    <td className="min-w-[110px] border-r border-slate-100 px-3 py-1.5 text-right text-xs tabular-nums text-slate-600">
                      {fmtVal(ind.fmt, c.prev)}
                    </td>
                    <td className="min-w-[110px] border-r border-slate-100 px-3 py-1.5 text-right text-xs tabular-nums font-medium text-slate-800">
                      {fmtVal(ind.fmt, c.real)}
                    </td>
                    <td className={cn('min-w-[110px] border-r border-slate-200 px-3 py-1.5 text-right text-xs tabular-nums font-semibold',
                      c.dif < 0 ? 'text-red-600' : c.dif > 0 ? 'text-emerald-600' : 'text-slate-400')}>
                      {c.prev === 0 && c.real === 0 ? '—' : fmtVal(ind.fmt, c.dif)}
                    </td>
                  </React.Fragment>
                ))}
                <td className="min-w-[110px] px-3 py-1.5 text-right text-xs tabular-nums text-slate-600 bg-slate-50/60">{fmtVal(ind.fmt, totalPrev)}</td>
                <td className="min-w-[110px] px-3 py-1.5 text-right text-xs tabular-nums font-bold text-slate-900 bg-slate-50/60">{fmtVal(ind.fmt, totalReal)}</td>
                <td className={cn('min-w-[110px] px-3 py-1.5 text-right text-xs tabular-nums font-bold bg-slate-50/60',
                  totalDif < 0 ? 'text-red-600' : totalDif > 0 ? 'text-emerald-600' : 'text-slate-400')}>
                  {fmtVal(ind.fmt, totalDif)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

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
          onClick={() => loadData()}
          disabled={loading}
          className="ml-auto inline-flex items-center gap-2 px-4 py-2 bg-[#004D40] text-white text-sm font-bold rounded-xl hover:bg-[#003d33] disabled:opacity-60"
        >
          <RefreshCcw className="w-4 h-4" /> {loading ? 'Atualizando...' : 'Atualizar'}
        </button>
      </div>

      {/* Abas de visualização */}
      <div className="flex flex-wrap gap-2">
        {([['comparativo', 'Previsto x Realizado'], ['realizado', 'Editar Realizado'], ['meta', 'Editar Metas']] as [ViewMode, string][]).map(([v, label]) => (
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

      {/* Filtro de meses (igual ao DRE) */}
      {renderMonthFilter()}

      {view === 'comparativo' && renderComparativo()}
      {view === 'realizado' && renderEditGrid('realizado')}
      {view === 'meta' && renderEditGrid('meta')}
    </div>
  );
};
