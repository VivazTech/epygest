import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCcw, Plus, Save, TrendingUp, Building2, Pencil } from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';

// ---------------------------------------------------------------------------
// Indicadores Gerenciais (Números Vivaz) — Realizado x Metas por (ano, mês)
// Modelo "inputs + cálculo no sistema": guardamos os inputs; o backend calcula
// ocupação, diária média, RevPAR, faturamento, EBITDA, resultado etc.
// ---------------------------------------------------------------------------

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

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

// Lê um valor (input ou calculado) de um mês
const readVal = (m: MonthData | undefined, key: string, src?: 'input') => {
  if (!m) return 0;
  if (src === 'input') return Number(m.inputs?.[key]) || 0;
  return Number(m[key] ?? m.inputs?.[key]) || 0;
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

  // edição de células (edit grid)
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const canEdit = userRole === 'admin' || userRole === 'controle' || userRole === 'finance';

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
    return KEY_INDICATORS.map((ind) => {
      const months = MESES.map((_, idx) => {
        const prev = readVal(data.meta.months[idx], ind.key, ind.src);
        const real = readVal(data.realizado.months[idx], ind.key, ind.src);
        const varc = prev !== 0 ? real / prev - 1 : real !== 0 ? 1 : 0;
        return { prev, real, varc };
      });
      const totalPrev = readVal(data.meta.total, ind.key, ind.src);
      const totalReal = readVal(data.realizado.total, ind.key, ind.src);
      const totalVar = totalPrev !== 0 ? totalReal / totalPrev - 1 : totalReal !== 0 ? 1 : 0;
      return { ind, months, totalPrev, totalReal, totalVar };
    });
  }, [data]);

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

  // Grid de edição (inputs x meses)
  const renderEditGrid = (esc: Escopo) => {
    const ed = escopoData(esc);
    return (
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          <Pencil className="w-4 h-4 text-emerald-700" />
          <h3 className="text-sm font-bold text-slate-800">
            Editar {esc === 'realizado' ? 'Realizado' : 'Metas'} — {year}
          </h3>
          {!canEdit && <span className="text-xs text-amber-600">(somente leitura para seu perfil)</span>}
        </div>
        <div className="table-scroll-panel overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1400px]">
            <thead>
              <tr className="bg-slate-100/70">
                <th className="sticky left-0 z-20 bg-slate-100 px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest min-w-[220px]">Campo</th>
                {MESES.map((m) => (
                  <th key={m} className="px-2 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right min-w-[92px]">{m}</th>
                ))}
                <th className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right min-w-[110px]">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {INPUT_GROUPS.map((g) => (
                <React.Fragment key={g.group}>
                  <tr className="bg-emerald-50/50">
                    <td colSpan={14} className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest text-emerald-800">{g.group}</td>
                  </tr>
                  {g.fields.map(([field, label]) => {
                    const totalVal = ed?.total?.inputs?.[field] ?? 0;
                    return (
                      <tr key={field} className="hover:bg-slate-50/60">
                        <td className="sticky left-0 z-10 bg-white px-4 py-1.5 text-xs text-slate-700 min-w-[220px]">{label}</td>
                        {MESES.map((_, idx) => {
                          const month = idx + 1;
                          const orig = Number(ed?.months?.[idx]?.inputs?.[field] ?? 0);
                          const k = cellKey(field, month);
                          const value = edits[k] ?? String(orig ?? 0);
                          return (
                            <td key={month} className="px-1 py-1 text-right">
                              <input
                                type="number"
                                step="0.01"
                                disabled={!canEdit || savingKey === k}
                                value={value}
                                onChange={(e) => setEdits((p) => ({ ...p, [k]: e.target.value }))}
                                onBlur={() => { if ((edits[k] ?? String(orig)) !== String(orig)) saveCell(esc, field, month); }}
                                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                className="w-[84px] px-2 py-1 text-right text-xs bg-slate-50 border border-slate-200 rounded-md focus:border-emerald-400 focus:bg-white disabled:opacity-60"
                              />
                            </td>
                          );
                        })}
                        <td className="px-3 py-1.5 text-xs text-right font-bold text-slate-800 tabular-nums">{fmtInt(Number(totalVal))}</td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
        {/* Indicadores calculados (read-only) */}
        <div className="px-5 py-4 border-t border-slate-100">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Indicadores calculados (automático)</p>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[1400px]">
              <thead>
                <tr>
                  <th className="sticky left-0 bg-white px-4 py-2 text-[10px] font-bold text-slate-500 uppercase min-w-[220px]">Indicador</th>
                  {MESES.map((m) => <th key={m} className="px-2 py-2 text-[10px] font-bold text-slate-500 uppercase text-right min-w-[92px]">{m}</th>)}
                  <th className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase text-right min-w-[110px]">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {KEY_INDICATORS.filter((i) => !i.src).map((ind) => (
                  <tr key={ind.key}>
                    <td className="sticky left-0 bg-white px-4 py-1.5 text-xs text-slate-600 min-w-[220px]">{ind.label}</td>
                    {MESES.map((_, idx) => (
                      <td key={idx} className="px-2 py-1.5 text-xs text-right text-slate-700 tabular-nums">
                        {fmtVal(ind.fmt, readVal(ed?.months?.[idx], ind.key))}
                      </td>
                    ))}
                    <td className="px-3 py-1.5 text-xs text-right font-semibold text-slate-800 tabular-nums">{fmtVal(ind.fmt, readVal(ed?.total, ind.key))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
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

      {/* Comparativo */}
      {view === 'comparativo' && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="table-scroll-panel overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[2600px]">
              <thead>
                <tr className="bg-slate-100/70">
                  <th rowSpan={2} className="sticky left-0 z-20 bg-slate-100 px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest min-w-[200px]">Indicador</th>
                  {MESES.map((m) => (
                    <th key={m} colSpan={3} className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center border-l border-slate-200">{m}</th>
                  ))}
                  <th colSpan={3} className="px-3 py-2 text-[10px] font-bold text-emerald-700 uppercase tracking-widest text-center border-l border-slate-200">Total</th>
                </tr>
                <tr className="bg-slate-100/70">
                  {[...MESES, 'Total'].map((m) => (
                    <React.Fragment key={m}>
                      <th className="px-2 py-1.5 text-[9px] font-bold text-slate-400 uppercase text-right border-l border-slate-200">Prev</th>
                      <th className="px-2 py-1.5 text-[9px] font-bold text-slate-400 uppercase text-right">Real</th>
                      <th className="px-2 py-1.5 text-[9px] font-bold text-slate-400 uppercase text-right">Var</th>
                    </React.Fragment>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {comparativoRows.map(({ ind, months, totalPrev, totalReal, totalVar }) => (
                  <tr key={ind.key} className="hover:bg-slate-50/60">
                    <td className="sticky left-0 z-10 bg-white px-4 py-2 text-xs font-semibold text-slate-700 min-w-[200px]">{ind.label}</td>
                    {months.map((c, idx) => (
                      <React.Fragment key={idx}>
                        <td className="px-2 py-2 text-xs text-right text-slate-500 tabular-nums border-l border-slate-100">{fmtVal(ind.fmt, c.prev)}</td>
                        <td className="px-2 py-2 text-xs text-right text-slate-800 font-medium tabular-nums">{fmtVal(ind.fmt, c.real)}</td>
                        <td className={cn('px-2 py-2 text-xs text-right font-semibold tabular-nums', c.varc < 0 ? 'text-red-600' : 'text-emerald-700')}>
                          {c.prev === 0 && c.real === 0 ? '—' : fmtPct(c.varc)}
                        </td>
                      </React.Fragment>
                    ))}
                    <td className="px-2 py-2 text-xs text-right text-slate-500 tabular-nums border-l border-slate-200">{fmtVal(ind.fmt, totalPrev)}</td>
                    <td className="px-2 py-2 text-xs text-right text-slate-900 font-bold tabular-nums">{fmtVal(ind.fmt, totalReal)}</td>
                    <td className={cn('px-2 py-2 text-xs text-right font-bold tabular-nums', totalVar < 0 ? 'text-red-700' : 'text-emerald-700')}>
                      {totalPrev === 0 && totalReal === 0 ? '—' : fmtPct(totalVar)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {view === 'realizado' && renderEditGrid('realizado')}
      {view === 'meta' && renderEditGrid('meta')}
    </div>
  );
};
