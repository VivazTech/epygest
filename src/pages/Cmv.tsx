import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarDays, CheckCircle2, Loader2, RefreshCcw, Save } from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import { useToast } from '../context/ToastContext';
import {
  MESES_CMV,
  CmvInputs,
  CmvMonthData,
  computeCmv,
  computeSintetico,
  emptyCmvInputs,
  toCmvInputs,
} from '../lib/cmv';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Aceita a digitação brasileira ("1.234,56"), americana ("1234.56") ou simples.
const parseBrNumber = (raw: string): number => {
  const s = String(raw ?? '').trim().replace(/\s/g, '');
  if (!s) return 0;
  let normalized = s;
  if (s.includes('.') && s.includes(',')) {
    normalized = s.replace(/\./g, '').replace(',', '.');
  } else if (s.includes(',')) {
    normalized = s.replace(',', '.');
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
};

const fmtPct = (fraction: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(fraction) ? fraction : 0);

const getCachedRole = (): string => {
  try {
    return String(JSON.parse(localStorage.getItem('user') || '{}')?.role || '');
  } catch {
    return '';
  }
};

const CMV_YEAR = 2026;

// ===========================================================================
// RESUMO + SINTÉTICO (aba "cmv")
// ===========================================================================

type CmvPageProps = {
  onSelectMonth?: (month: number) => void;
};

export const CmvPage: React.FC<CmvPageProps> = ({ onSelectMonth }) => {
  const now = new Date();
  const [year, setYear] = useState(String(CMV_YEAR || now.getFullYear()));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [months, setMonths] = useState<CmvMonthData[]>([]);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/cmv/ano?year=${encodeURIComponent(year)}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Falha ao carregar o CMV.');
      const parsed: CmvMonthData[] = (Array.isArray(json.months) ? json.months : []).map((m: any) => {
        const inputs = toCmvInputs(m.row);
        return { month: Number(m.month), importado: Boolean(m.importado), inputs, derived: computeCmv(inputs) };
      });
      setMonths(parsed);
    } catch (err: any) {
      setMonths([]);
      setError(err?.message || 'Erro ao carregar o CMV.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  const preenchidos = months.filter((m) => m.importado);
  const sintetico = useMemo(() => computeSintetico(preenchidos), [months]);

  const cards = [
    { label: 'Meses preenchidos', value: String(preenchidos.length), currency: false },
    { label: 'Receita total (ano)', value: formatCurrency(sintetico.receita_total), currency: true },
    { label: 'CMV Apurado (ano)', value: fmtPct(sintetico.cmv_apurado), currency: false },
    { label: 'Economia vs. limite (ano)', value: formatCurrency(sintetico.economia), currency: true },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Apuração de C.M.V.</h2>
          <p className="text-sm text-slate-500">
            Réplica da planilha de Apuração do CMV: receitas e requisições por mês geram o CMV
            Apurado, o CMV Limite e a economia. Selecione um mês para digitar o fechamento.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={2000}
            max={2100}
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="w-24 px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-semibold"
          />
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#004D40] text-white text-sm font-bold rounded-xl hover:bg-[#003d33] disabled:opacity-60"
          >
            <RefreshCcw className={cn('w-4 h-4', loading && 'animate-spin')} />
            Atualizar
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map((card) => (
          <div key={card.label} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{card.label}</p>
            <p className="text-lg font-extrabold text-slate-900 mt-1">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Grade de meses (navegação) */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        <div className="flex items-center gap-2 mb-4">
          <CalendarDays className="w-4 h-4 text-[#004D40]" />
          <h3 className="text-sm font-bold text-slate-800">Competências {year}</h3>
        </div>
        {loading && months.length === 0 ? (
          <p className="text-sm text-slate-400 inline-flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
          </p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {MESES_CMV.slice(1).map((label, idx) => {
              const month = idx + 1;
              const data = months.find((m) => m.month === month);
              const importado = Boolean(data?.importado);
              return (
                <button
                  key={month}
                  type="button"
                  onClick={() => onSelectMonth?.(month)}
                  className={cn(
                    'text-left rounded-2xl border p-4 transition-colors',
                    importado
                      ? 'border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50'
                      : 'border-slate-100 bg-slate-50/50 hover:bg-slate-50'
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold text-slate-900">
                      {String(month).padStart(2, '0')} · {label}
                    </p>
                    {importado ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <span className="text-[10px] font-bold uppercase text-slate-400">vazio</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-2">
                    {importado
                      ? `CMV ${fmtPct(data!.derived.cmv_apurado)} · ${formatCurrency(data!.derived.receita_total)}`
                      : 'Sem lançamento'}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Sintético consolidado (aba "CMV SINTETICO RESULTADO MENSAL") */}
      <SinteticoTable months={months} sintetico={sintetico} />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Tabela sintética (meses em colunas + total do ano)
// ---------------------------------------------------------------------------

type SintRow = {
  label: string;
  get: (d: CmvMonthData['derived'], i: CmvInputs) => number;
  total: number;
  kind?: 'currency' | 'percent';
  strong?: boolean;
  section?: boolean;
};

const SinteticoTable: React.FC<{ months: CmvMonthData[]; sintetico: ReturnType<typeof computeSintetico> }> = ({
  months,
  sintetico,
}) => {
  const s = sintetico;
  const rows: SintRow[] = [
    { label: 'RECEITAS', section: true, get: () => 0, total: 0 },
    { label: 'Venda Direta Total', get: (_d, i) => i.venda_direta_total, total: s.venda_direta_total },
    { label: 'Venda Direta Alimentos', get: (d) => d.venda_direta_alimentos, total: s.venda_direta_alimentos },
    { label: 'Venda Direta Bebidas', get: (_d, i) => i.venda_direta_bebidas, total: s.venda_direta_bebidas },
    { label: 'Café da Manhã (Pensão)', get: (_d, i) => i.cafe_manha_pensao, total: s.cafe_manha_pensao },
    { label: 'Café da Manhã Chds (tarifário)', get: (_d, i) => i.cafe_manha_chds, total: s.cafe_manha_chds },
    { label: 'Almoço e Jantar (Pensão)', get: (_d, i) => i.almoco_jantar_pensao, total: s.almoco_jantar_pensao },
    { label: 'Almoço e Jantar Chds (tarifário)', get: (_d, i) => i.almoco_jantar_chds, total: s.almoco_jantar_chds },
    { label: 'Almoço e Jantar Antec. Chds Free', get: (_d, i) => i.almoco_jantar_antec, total: s.almoco_jantar_antec },
    { label: 'C.I. (Venda Indireta) Total', get: (_d, i) => i.ci_total, total: s.ci_total },
    { label: 'C.I. (Venda Indireta) Alimentos', get: (d) => d.ci_alimentos, total: s.ci_alimentos },
    { label: 'C.I. (Venda Indireta) Bebidas', get: (_d, i) => i.ci_bebidas, total: s.ci_bebidas },
    { label: 'Total', get: (d) => d.receita_total, total: s.receita_total, strong: true },
    { label: '% C.I. sobre a receita', get: (d) => d.ci_pct_receita, total: s.ci_pct_receita, kind: 'percent' },
    { label: 'REQUISIÇÕES', section: true, get: () => 0, total: 0 },
    { label: 'Total das Requisições', get: (_d, i) => i.requisicoes_total, total: s.requisicoes_total },
    { label: 'Requisições de Alimentos', get: (d) => d.requisicoes_alimentos, total: s.requisicoes_alimentos },
    { label: 'Requisições de Bebidas', get: (_d, i) => i.requisicoes_bebidas, total: s.requisicoes_bebidas },
    { label: 'Refeitório (SEM CRD)', get: (_d, i) => i.refeitorio, total: s.refeitorio },
    { label: 'Outros*** Diretoria, R.H. (S/CRD)', get: (_d, i) => i.outros, total: s.outros },
    { label: 'Aquamania', get: (_d, i) => i.aquamania, total: s.aquamania },
    { label: 'Requisições p/ cálculo de CMV', get: (d) => d.requisicoes_cmv, total: s.requisicoes_cmv, strong: true },
    { label: 'RESULTADO', section: true, get: () => 0, total: 0 },
    { label: 'CMV Apurado', get: (d) => d.cmv_apurado, total: s.cmv_apurado, kind: 'percent', strong: true },
    { label: 'CMV Alimentos Apurado', get: (d) => d.cmv_alimentos, total: s.cmv_alimentos, kind: 'percent' },
    { label: 'CMV Bebidas Apurado', get: (d) => d.cmv_bebidas, total: s.cmv_bebidas, kind: 'percent' },
    { label: 'Vlr. C.M.V. Sobre Vendas', get: (d) => d.vlr_cmv_sobre_vendas, total: s.vlr_cmv_sobre_vendas },
    { label: 'CMV /// Sobre Consumo Interno (S/CRD)', get: (d) => d.cmv_sobre_ci, total: s.cmv_sobre_ci },
    { label: 'CMV /// Limite (simulado)', get: (d) => d.cmv_limite_valor, total: s.cmv_limite_valor },
    { label: 'Diferença Apurado x Limite (Economia)', get: (d) => d.economia, total: s.economia, strong: true },
  ];

  const byMonth = new Map<number, CmvMonthData>();
  for (const m of months) byMonth.set(m.month, m);

  const cell = (row: SintRow, value: number, filled: boolean) => {
    if (row.section) return '';
    if (!filled) return '—';
    return row.kind === 'percent' ? fmtPct(value) : formatCurrency(value);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
      <div className="flex items-center gap-2 px-4 pt-4">
        <h3 className="text-sm font-bold text-slate-800">Sintético — Resultado Mensal</h3>
        <span className="text-xs text-slate-400">(valores digitados em cada mês; total do ano recalculado)</span>
      </div>
      <div className="overflow-x-auto mt-3">
        <table className="w-full text-right border-collapse min-w-[1100px]">
          <thead>
            <tr className="bg-slate-50/70">
              <th className="px-3 py-2 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest sticky left-0 bg-slate-50/70 z-10 min-w-[240px]">
                Linha
              </th>
              {MESES_CMV.slice(1).map((label, idx) => (
                <th key={idx} className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wide whitespace-nowrap">
                  {label.slice(0, 3)}
                </th>
              ))}
              <th className="px-3 py-2 text-[10px] font-extrabold text-[#004D40] uppercase tracking-wide bg-emerald-50/60">Ano</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {rows.map((row, ri) => {
              if (row.section) {
                return (
                  <tr key={ri} className="bg-slate-100/70">
                    <td colSpan={14} className="px-3 py-1.5 text-left text-[10px] font-extrabold text-slate-600 uppercase tracking-widest sticky left-0 bg-slate-100/70 z-10">
                      {row.label}
                    </td>
                  </tr>
                );
              }
              return (
                <tr key={ri} className={cn('hover:bg-slate-50/60', row.strong && 'font-bold')}>
                  <td className={cn(
                    'px-3 py-1.5 text-left text-xs text-slate-700 sticky left-0 bg-white z-10',
                    row.strong && 'font-bold text-slate-900'
                  )}>
                    {row.label}
                  </td>
                  {MESES_CMV.slice(1).map((_l, idx) => {
                    const month = idx + 1;
                    const data = byMonth.get(month);
                    const filled = Boolean(data?.importado);
                    const value = data ? row.get(data.derived, data.inputs) : 0;
                    return (
                      <td key={month} className={cn('px-3 py-1.5 text-xs tabular-nums', filled ? 'text-slate-700' : 'text-slate-300')}>
                        {cell(row, value, filled)}
                      </td>
                    );
                  })}
                  <td className={cn('px-3 py-1.5 text-xs tabular-nums bg-emerald-50/50 text-[#004D40] font-semibold')}>
                    {row.kind === 'percent' ? fmtPct(row.total) : formatCurrency(row.total)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ===========================================================================
// MÊS EDITÁVEL (aba "cmv-N")
// ===========================================================================

type CmvMesPageProps = { month: number };

export const CmvMesPage: React.FC<CmvMesPageProps> = ({ month }) => {
  const now = new Date();
  const { showSuccess } = useToast();
  const [year, setYear] = useState(String(CMV_YEAR || now.getFullYear()));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [inputs, setInputs] = useState<CmvInputs>(emptyCmvInputs());
  const [importado, setImportado] = useState(false);
  const [dirty, setDirty] = useState(false);

  const role = getCachedRole();
  const canEdit = role === 'admin' || role === 'finance' || role === 'controle';

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/cmv?year=${encodeURIComponent(year)}&month=${month}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Falha ao carregar o mês.');
      setInputs(toCmvInputs(json.row));
      setImportado(Boolean(json.importado));
      setDirty(false);
    } catch (err: any) {
      setInputs(emptyCmvInputs());
      setImportado(false);
      setError(err?.message || 'Erro ao carregar o CMV.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  const d = useMemo(() => computeCmv(inputs), [inputs]);

  const setField = (key: keyof CmvInputs, value: number) => {
    setInputs((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/cmv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: Number(year), month, ...inputs }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Falha ao salvar.');
      setImportado(true);
      setDirty(false);
      showSuccess(`CMV de ${MESES_CMV[month]}/${year} salvo com sucesso.`);
    } catch (err: any) {
      setError(err?.message || 'Erro ao salvar o CMV.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">
            Apuração de C.M.V. — {MESES_CMV[month]}/{year}
          </h2>
          <p className="text-sm text-slate-500">
            Digite os valores de fechamento do mês (receitas e requisições). Os indicadores de CMV são
            calculados automaticamente, como na planilha.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={2000}
            max={2100}
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="w-24 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
          />
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-bold rounded-xl hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCcw className={cn('w-4 h-4', loading && 'animate-spin')} />
            {loading ? 'Carregando...' : 'Recarregar'}
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={save}
              disabled={saving || !dirty}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#004D40] text-white text-sm font-bold rounded-xl hover:bg-[#003d33] disabled:opacity-40"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? 'Salvando...' : dirty ? 'Salvar' : 'Salvo'}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {!importado && !dirty && !loading && (
        <div className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
          Nenhum lançamento salvo para {MESES_CMV[month]}/{year}. Preencha os campos e clique em Salvar.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* RECEITAS */}
        <SectionCard title="Receitas">
          <InputRow label="Venda Direta Total" value={inputs.venda_direta_total} onChange={(v) => setField('venda_direta_total', v)} disabled={!canEdit} />
          <CalcRow label="Venda Direta Alimentos" value={d.venda_direta_alimentos} />
          <InputRow label="Venda Direta Bebidas" value={inputs.venda_direta_bebidas} onChange={(v) => setField('venda_direta_bebidas', v)} disabled={!canEdit} />
          <InputRow label="Café da Manhã (Pensão)" value={inputs.cafe_manha_pensao} onChange={(v) => setField('cafe_manha_pensao', v)} disabled={!canEdit} />
          <InputRow label="Café da Manhã Chds (ajuste tarifário)" value={inputs.cafe_manha_chds} onChange={(v) => setField('cafe_manha_chds', v)} disabled={!canEdit} />
          <InputRow label="Almoço e Jantar (Pensão)" value={inputs.almoco_jantar_pensao} onChange={(v) => setField('almoco_jantar_pensao', v)} disabled={!canEdit} />
          <InputRow label="Almoço e Jantar Chds (ajuste tarifário)" value={inputs.almoco_jantar_chds} onChange={(v) => setField('almoco_jantar_chds', v)} disabled={!canEdit} />
          <InputRow label="Almoço e Jantar Vendas Antec. Chds Free" value={inputs.almoco_jantar_antec} onChange={(v) => setField('almoco_jantar_antec', v)} disabled={!canEdit} />
          <InputRow label="C.I. (Venda Indireta) Total" value={inputs.ci_total} onChange={(v) => setField('ci_total', v)} disabled={!canEdit} />
          <CalcRow label="C.I. (Venda Indireta) Alimentos" value={d.ci_alimentos} />
          <InputRow label="C.I. (Venda Indireta) Bebidas" value={inputs.ci_bebidas} onChange={(v) => setField('ci_bebidas', v)} disabled={!canEdit} />
          <CalcRow label="Total da Receita" value={d.receita_total} strong />
          <CalcRow label="% Quanto C.I. representa sobre a receita" value={d.ci_pct_receita} percent />
        </SectionCard>

        {/* REQUISIÇÕES */}
        <SectionCard title="Requisições">
          <InputRow label="Total das Requisições" value={inputs.requisicoes_total} onChange={(v) => setField('requisicoes_total', v)} disabled={!canEdit} />
          <CalcRow label="Requisições de Alimentos" value={d.requisicoes_alimentos} />
          <InputRow label="Requisições de Bebidas" value={inputs.requisicoes_bebidas} onChange={(v) => setField('requisicoes_bebidas', v)} disabled={!canEdit} />
          <InputRow label="Refeitório (SEM CRD) Uso e Consumo" value={inputs.refeitorio} onChange={(v) => setField('refeitorio', v)} disabled={!canEdit} />
          <InputRow label="Outros*** Diretoria, recreação, R.H. (S/CRD)" value={inputs.outros} onChange={(v) => setField('outros', v)} disabled={!canEdit} />
          <InputRow label="Aquamania Uso e Consumo" value={inputs.aquamania} onChange={(v) => setField('aquamania', v)} disabled={!canEdit} />
          <CalcRow label="Requisições p/ cálculo de CMV" value={d.requisicoes_cmv} strong />

          <div className="pt-3 mt-2 border-t border-slate-100">
            <PctInputRow
              label="CMV Limite / Simulado (%)"
              value={inputs.limite_pct}
              onChange={(v) => setField('limite_pct', v)}
              disabled={!canEdit}
            />
          </div>
        </SectionCard>
      </div>

      {/* RESULTADO */}
      <SectionCard title="Resultado da Apuração">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <ResultCard label="CMV Apurado" value={fmtPct(d.cmv_apurado)} highlight />
          <ResultCard label="CMV Alimentos Apurado" value={fmtPct(d.cmv_alimentos)} />
          <ResultCard label="CMV Bebidas Apurado" value={fmtPct(d.cmv_bebidas)} />
          <ResultCard label="Vlr. C.M.V. Sobre Vendas" value={formatCurrency(d.vlr_cmv_sobre_vendas)} />
          <ResultCard label="CMV Sobre Consumo Interno (S/CRD)" value={formatCurrency(d.cmv_sobre_ci)} />
          <ResultCard label={`CMV Limite (${fmtPct(inputs.limite_pct)})`} value={formatCurrency(d.cmv_limite_valor)} />
          <ResultCard
            label="Diferença Apurado x Limite (Economia)"
            value={formatCurrency(d.economia)}
            highlight={d.economia >= 0}
            danger={d.economia < 0}
          />
        </div>
      </SectionCard>
    </div>
  );
};

// ---------------------------------------------------------------------------
// UI atoms
// ---------------------------------------------------------------------------

const SectionCard: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-widest mb-3">{title}</h3>
    <div className="space-y-1">{children}</div>
  </div>
);

const InputRow: React.FC<{
  label: string;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}> = ({ label, value, onChange, disabled }) => {
  const [text, setText] = useState<string>('');
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) {
      setText(value ? new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value) : '');
    }
  }, [value, focused]);

  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <label className="text-xs text-slate-600 flex-1">{label}</label>
      <div className="flex items-center gap-1">
        <span className="text-[10px] font-bold text-slate-400">R$</span>
        <input
          type="text"
          inputMode="decimal"
          disabled={disabled}
          value={text}
          onFocus={() => {
            setFocused(true);
            setText(value ? String(value) : '');
          }}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            setFocused(false);
            onChange(parseBrNumber(text));
          }}
          placeholder="0,00"
          className={cn(
            'w-36 px-3 py-1.5 text-right text-sm tabular-nums rounded-lg border transition-colors',
            disabled
              ? 'bg-slate-50 border-slate-100 text-slate-500'
              : 'bg-white border-slate-200 focus:border-[#004D40] focus:ring-1 focus:ring-[#004D40]/20 outline-none'
          )}
        />
      </div>
    </div>
  );
};

const PctInputRow: React.FC<{
  label: string;
  value: number; // fração (0.29)
  onChange: (v: number) => void;
  disabled?: boolean;
}> = ({ label, value, onChange, disabled }) => {
  const [text, setText] = useState<string>('');
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) {
      const pct = (value || 0) * 100;
      setText(new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(pct));
    }
  }, [value, focused]);

  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <label className="text-xs font-semibold text-slate-700 flex-1">{label}</label>
      <div className="flex items-center gap-1">
        <input
          type="text"
          inputMode="decimal"
          disabled={disabled}
          value={text}
          onFocus={() => {
            setFocused(true);
            setText(String((value || 0) * 100));
          }}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            setFocused(false);
            onChange(parseBrNumber(text) / 100);
          }}
          placeholder="29"
          className={cn(
            'w-24 px-3 py-1.5 text-right text-sm tabular-nums rounded-lg border transition-colors',
            disabled
              ? 'bg-slate-50 border-slate-100 text-slate-500'
              : 'bg-white border-slate-200 focus:border-[#004D40] focus:ring-1 focus:ring-[#004D40]/20 outline-none'
          )}
        />
        <span className="text-[10px] font-bold text-slate-400">%</span>
      </div>
    </div>
  );
};

const CalcRow: React.FC<{ label: string; value: number; strong?: boolean; percent?: boolean }> = ({
  label,
  value,
  strong,
  percent,
}) => (
  <div
    className={cn(
      'flex items-center justify-between gap-3 py-1.5 px-2 rounded-lg',
      strong ? 'bg-emerald-50/70' : 'bg-slate-50/60'
    )}
  >
    <span className={cn('text-xs flex-1', strong ? 'font-bold text-slate-900' : 'text-slate-500')}>{label}</span>
    <span className={cn('text-sm tabular-nums pr-1', strong ? 'font-extrabold text-[#004D40]' : 'font-semibold text-slate-700')}>
      {percent ? fmtPct(value) : formatCurrency(value)}
    </span>
  </div>
);

const ResultCard: React.FC<{ label: string; value: string; highlight?: boolean; danger?: boolean }> = ({
  label,
  value,
  highlight,
  danger,
}) => (
  <div
    className={cn(
      'rounded-2xl border p-4',
      danger
        ? 'border-red-200 bg-red-50/60'
        : highlight
        ? 'border-emerald-200 bg-emerald-50/60'
        : 'border-slate-100 bg-slate-50/50'
    )}
  >
    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{label}</p>
    <p
      className={cn(
        'text-lg font-extrabold mt-1 tabular-nums',
        danger ? 'text-red-700' : highlight ? 'text-[#004D40]' : 'text-slate-900'
      )}
    >
      {value}
    </p>
  </div>
);
