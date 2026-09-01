import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarDays, CheckCircle2, History, Loader2, RefreshCcw, Save } from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import { useToast } from '../context/ToastContext';
import {
  MESES_CMV,
  CmvInputs,
  CmvMonthData,
  CmvDerived,
  computeCmv,
  computeSintetico,
  emptyCmvInputs,
  toCmvInputs,
} from '../lib/cmv';
import {
  CmvTarifaConfigRow,
  CmvTarifaRates,
  CMV_TARIFA_MOTIVO_LABELS,
  CmvTarifaMotivo,
  formatVigenciaLabel,
  lastDayOfMonthIso,
} from '../lib/cmvTarifas';
import { computeCmvMetaComparison, fmtDesvioPp } from '../lib/cmvMeta';
import { CmvMetaPanel } from '../components/CmvMetaPanel';
import { CmvPeriodPicker } from '../components/CmvPeriodPicker';
import type { ImportScope } from '../lib/importPeriod';
import {
  CmvApuracaoHistoricoRow,
  historicoRowToInputs,
  suggestCmvPeriodoFimDia,
} from '../lib/cmvHistorico';

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
  const sintetico = useMemo(() => computeSintetico(preenchidos), [preenchidos]);
  const metaAnual = useMemo(() => {
    const metaPct =
      sintetico.receita_considerada > 0
        ? sintetico.cmv_limite_valor / sintetico.receita_considerada
        : 0.29;
    return computeCmvMetaComparison(
      metaPct,
      sintetico.cmv_apurado,
      sintetico.receita_considerada,
      sintetico.custo_ab
    );
  }, [sintetico]);

  const cards = [
    { label: 'Meses preenchidos', value: String(preenchidos.length), currency: false },
    { label: 'Receita considerada (ano)', value: formatCurrency(sintetico.receita_considerada), currency: true },
    { label: 'CMV A&B (ano)', value: fmtPct(sintetico.cmv_apurado), currency: false },
    { label: 'Custo A&B (ano)', value: formatCurrency(sintetico.custo_ab), currency: true },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Apuração de C.M.V.</h2>
          <p className="text-sm text-slate-500">
            CMV A&amp;B: receitas/créditos e custos (alimentos, bebidas e outros) geram o percentual
            Custo A&amp;B ÷ Receita considerada. Selecione um mês para digitar o fechamento.
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

      {preenchidos.length > 0 && (
        <CmvMetaPanel comparison={metaAnual} title="Meta de CMV — consolidado do ano" />
      )}

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
                    {importado && data
                      ? `CMV ${fmtPct(data.derived.cmv_apurado)} · ${formatCurrency(data.derived.receita_considerada)}`
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
  kind?: 'currency' | 'percent' | 'pp';
  strong?: boolean;
  section?: boolean;
};

const SinteticoTable: React.FC<{ months: CmvMonthData[]; sintetico: ReturnType<typeof computeSintetico> }> = ({
  months,
  sintetico,
}) => {
  const s = sintetico;
  const metaAnualPct = s.receita_considerada > 0 ? s.cmv_limite_valor / s.receita_considerada : 0;
  const desvioAnual = (s.cmv_apurado - metaAnualPct) * 100;
  const rows: SintRow[] = [
    { label: 'CMV A&B', section: true, get: () => 0, total: 0 },
    { label: 'RECEITAS / CRÉDITOS', section: true, get: () => 0, total: 0 },
    { label: 'Venda A&B', get: (d) => d.venda_ab, total: s.venda_ab },
    { label: 'Café da manhã', get: (d) => d.cafe_manha, total: s.cafe_manha },
    { label: 'Pensão', get: (d) => d.pensao, total: s.pensao },
    { label: 'Consumo interno', get: (d) => d.consumo_interno, total: s.consumo_interno },
    { label: 'Receita considerada', get: (d) => d.receita_considerada, total: s.receita_considerada, strong: true },
    { label: 'CUSTOS', section: true, get: () => 0, total: 0 },
    { label: 'Alimentos', get: (d) => d.custo_alimentos, total: s.custo_alimentos },
    { label: 'Bebidas', get: (d) => d.custo_bebidas, total: s.custo_bebidas },
    { label: 'Outros custos CMV', get: (d) => d.outros_custos_cmv, total: s.outros_custos_cmv },
    { label: 'Custo A&B', get: (d) => d.custo_ab, total: s.custo_ab, strong: true },
    { label: 'CMV realizado (Custo ÷ Receita)', get: (d) => d.cmv_apurado, total: s.cmv_apurado, kind: 'percent', strong: true },
    { label: 'META DE CMV', section: true, get: () => 0, total: 0 },
    { label: 'Meta de CMV (%)', get: (_d, i) => i.limite_pct, total: metaAnualPct, kind: 'percent' },
    {
      label: 'Desvio vs. meta (p.p.)',
      get: (d, i) => computeCmvMetaComparison(i.limite_pct, d.cmv_apurado, d.receita_considerada, d.custo_ab).desvio_pp,
      total: desvioAnual,
      kind: 'pp',
      strong: true,
    },
    {
      label: 'Impacto financeiro',
      get: (d) => d.economia,
      total: s.economia,
      strong: true,
    },
    { label: 'INDICADORES AUXILIARES', section: true, get: () => 0, total: 0 },
    { label: '% C.I. sobre a receita', get: (d) => d.ci_pct_receita, total: s.ci_pct_receita, kind: 'percent' },
    { label: 'CMV Alimentos (parcial)', get: (d) => d.cmv_alimentos, total: s.cmv_alimentos, kind: 'percent' },
    { label: 'CMV Bebidas (parcial)', get: (d) => d.cmv_bebidas, total: s.cmv_bebidas, kind: 'percent' },
  ];

  const byMonth = new Map<number, CmvMonthData>();
  for (const m of months) byMonth.set(m.month, m);

  const cell = (row: SintRow, value: number, filled: boolean) => {
    if (row.section) return '';
    if (!filled) return '—';
    if (row.kind === 'percent') return fmtPct(value);
    if (row.kind === 'pp') return fmtDesvioPp(value);
    return formatCurrency(value);
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
                    {row.kind === 'percent'
                      ? fmtPct(row.total)
                      : row.kind === 'pp'
                        ? fmtDesvioPp(row.total)
                        : formatCurrency(row.total)}
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
  const [tarifas, setTarifas] = useState<CmvTarifaRates | null>(null);
  const [tarifaConfig, setTarifaConfig] = useState<CmvTarifaConfigRow | null>(null);
  const [historico, setHistorico] = useState<CmvApuracaoHistoricoRow[]>([]);
  const [apuracaoScope, setApuracaoScope] = useState<ImportScope>('acompanhamento');
  const [periodoFimDia, setPeriodoFimDia] = useState(String(suggestCmvPeriodoFimDia(now.getFullYear(), month)));
  const [viewingHistoricoId, setViewingHistoricoId] = useState<number | null>(null);

  const role = getCachedRole();
  const canEdit = role === 'admin' || role === 'finance' || role === 'controle';

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/cmv?year=${encodeURIComponent(year)}&month=${month}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Falha ao carregar o mês.');
      const hist: CmvApuracaoHistoricoRow[] = Array.isArray(json.historico) ? json.historico : [];
      setHistorico(hist);
      let nextInputs = emptyCmvInputs();
      if (json.latest) {
        nextInputs = { ...nextInputs, ...historicoRowToInputs(json.latest) };
      } else if (json.row) {
        nextInputs = toCmvInputs(json.row);
      }
      if (!json.importado) {
        const refDate = lastDayOfMonthIso(Number(year), month);
        const metaRes = await fetch(`/api/cmv/meta/vigente?date=${encodeURIComponent(refDate)}`);
        const metaJson = await metaRes.json().catch(() => ({}));
        if (metaJson?.meta_pct) nextInputs = { ...nextInputs, limite_pct: Number(metaJson.meta_pct) };
      }
      setInputs(nextInputs);
      setImportado(Boolean(json.importado));
      setDirty(false);
      setViewingHistoricoId(null);
      setPeriodoFimDia(String(suggestCmvPeriodoFimDia(Number(year), month)));
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

  useEffect(() => {
    const refDate = lastDayOfMonthIso(Number(year), month);
    fetch(`/api/cmv/tarifas/vigente?date=${encodeURIComponent(refDate)}`)
      .then((res) => res.json())
      .then((json) => {
        if (json?.rates) setTarifas(json.rates);
        setTarifaConfig(json?.config ?? null);
      })
      .catch(() => {
        setTarifas(null);
        setTarifaConfig(null);
      });
  }, [year, month]);

  const d = useMemo(() => computeCmv(inputs), [inputs]);
  const metaCmp = useMemo(
    () =>
      computeCmvMetaComparison(
        inputs.limite_pct,
        d.cmv_apurado,
        d.receita_considerada,
        d.custo_ab
      ),
    [inputs.limite_pct, d]
  );

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
        body: JSON.stringify({
          year: Number(year),
          month,
          apuracao_scope: apuracaoScope,
          periodo_fim_dia: apuracaoScope === 'acompanhamento' ? Number(periodoFimDia) : undefined,
          ...inputs,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Falha ao registrar apuração.');
      setImportado(true);
      setDirty(false);
      setViewingHistoricoId(null);
      await load();
      showSuccess(
        `Apuração "${json.period_label || 'registrada'}" de ${MESES_CMV[month]}/${year} salva no histórico.`
      );
    } catch (err: any) {
      setError(err?.message || 'Erro ao registrar apuração.');
    } finally {
      setSaving(false);
    }
  };

  const loadHistoricoEntry = (row: CmvApuracaoHistoricoRow) => {
    setInputs({ ...emptyCmvInputs(), ...historicoRowToInputs(row) });
    setViewingHistoricoId(row.id);
    setDirty(false);
    if (row.apuracao_scope === 'fechamento') {
      setApuracaoScope('fechamento');
    } else {
      setApuracaoScope('acompanhamento');
      const day = Number(String(row.periodo_fim).slice(8, 10));
      if (Number.isFinite(day)) setPeriodoFimDia(String(day));
    }
  };

  const startNewApuracao = () => {
    const base = historico.length ? historico[historico.length - 1] : null;
    if (base) setInputs({ ...emptyCmvInputs(), ...historicoRowToInputs(base) });
    setViewingHistoricoId(null);
    setDirty(true);
    setApuracaoScope('acompanhamento');
    setPeriodoFimDia(String(suggestCmvPeriodoFimDia(Number(year), month)));
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">
            Apuração de C.M.V. — {MESES_CMV[month]}/{year}
          </h2>
          <p className="text-sm text-slate-500">
            Registre apurações parciais ao longo do mês ou o fechamento. Cada registro é preservado no histórico.
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
          {canEdit && (
            <button
              type="button"
              onClick={startNewApuracao}
              className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-bold rounded-xl hover:bg-slate-50"
            >
              Nova apuração
            </button>
          )}
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
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#004D40] text-white text-sm font-bold rounded-xl hover:bg-[#003d33] disabled:opacity-40"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? 'Registrando...' : dirty || !viewingHistoricoId ? 'Registrar apuração' : 'Registrar apuração'}
            </button>
          )}
        </div>
      </div>

      {canEdit && (
        <CmvPeriodPicker
          scope={apuracaoScope}
          onScopeChange={(s) => {
            setApuracaoScope(s);
            setDirty(true);
            setViewingHistoricoId(null);
          }}
          periodoFimDia={periodoFimDia}
          onPeriodoFimDiaChange={(d) => {
            setPeriodoFimDia(d);
            setDirty(true);
            setViewingHistoricoId(null);
          }}
          year={Number(year)}
          month={month}
        />
      )}

      {historico.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
            <History className="w-4 h-4 text-slate-500" />
            <h3 className="text-sm font-bold text-slate-800">Histórico de apurações</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-[10px] font-extrabold text-slate-500 uppercase">
                  <th className="px-4 py-2">Período</th>
                  <th className="px-4 py-2 text-right">CMV</th>
                  <th className="px-4 py-2 text-right">Receita</th>
                  <th className="px-4 py-2">Registrado em</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {historico.map((h) => (
                  <tr
                    key={h.id}
                    className={cn(
                      'border-t border-slate-100',
                      viewingHistoricoId === h.id && 'bg-emerald-50/60',
                      h.apuracao_scope === 'fechamento' && 'font-semibold'
                    )}
                  >
                    <td className="px-4 py-2 text-slate-800">{h.period_label}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-bold text-[#004D40]">
                      {fmtPct(h.cmv_apurado)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-600">
                      {formatCurrency(h.receita_considerada)}
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-500">
                      {h.created_at ? new Date(h.created_at).toLocaleString('pt-BR') : '—'}
                      {h.created_by ? ` · ${h.created_by}` : ''}
                    </td>
                    <td className="px-4 py-2">
                      <button
                        type="button"
                        onClick={() => loadHistoricoEntry(h)}
                        className="text-xs font-bold text-[#004D40] hover:underline"
                      >
                        Ver
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {viewingHistoricoId && (
        <div className="text-sm text-slate-600 bg-slate-50 border border-slate-100 rounded-xl px-4 py-3">
          Visualizando apuração do histórico. Ajuste os valores e escolha um novo período para registrar outra entrada.
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {!importado && !dirty && !loading && (
        <div className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
          Nenhuma apuração registrada para {MESES_CMV[month]}/{year}. Preencha os campos, escolha o período e clique em Registrar apuração.
        </div>
      )}

      {tarifas && (
        <div className="text-sm bg-slate-50 border border-slate-100 rounded-xl px-4 py-3">
          <p className="font-bold text-slate-700 mb-1">Tarifas internas vigentes no fechamento</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-600">
            <p>
              Café — adulto {formatCurrency(tarifas.cafe_manha_adulto)} · criança{' '}
              {formatCurrency(tarifas.cafe_manha_crianca)}
            </p>
            <p>
              Pensão — adulto {formatCurrency(tarifas.pensao_adulto)} · criança/outras{' '}
              {formatCurrency(tarifas.pensao_crianca)}
            </p>
          </div>
          {tarifaConfig && (
            <p className="text-xs text-slate-500 mt-1">
              {tarifaConfig.nome} (
              {CMV_TARIFA_MOTIVO_LABELS[tarifaConfig.motivo as CmvTarifaMotivo] || tarifaConfig.motivo}
              ) · {formatVigenciaLabel(tarifaConfig)}
            </p>
          )}
        </div>
      )}

      {(importado || dirty) && d.receita_considerada > 0 && (
        <CmvMetaPanel comparison={metaCmp} />
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <CmvAbPanel derived={d} />

        <div className="space-y-6">
          <SectionCard title="Receitas / Créditos — detalhamento">
            <InputRow label="Venda A&B" value={inputs.venda_direta_total} onChange={(v) => setField('venda_direta_total', v)} disabled={!canEdit} />
            <SubLabel>Café da manhã</SubLabel>
            <InputRow label="Pensão" value={inputs.cafe_manha_pensao} onChange={(v) => setField('cafe_manha_pensao', v)} disabled={!canEdit} indent />
            <InputRow label="Chds (ajuste tarifário)" value={inputs.cafe_manha_chds} onChange={(v) => setField('cafe_manha_chds', v)} disabled={!canEdit} indent />
            <CalcRow label="Subtotal café da manhã" value={d.cafe_manha} />
            <SubLabel>Pensão</SubLabel>
            <InputRow label="Almoço e jantar (pensão)" value={inputs.almoco_jantar_pensao} onChange={(v) => setField('almoco_jantar_pensao', v)} disabled={!canEdit} indent />
            <InputRow label="Chds (ajuste tarifário)" value={inputs.almoco_jantar_chds} onChange={(v) => setField('almoco_jantar_chds', v)} disabled={!canEdit} indent />
            <InputRow label="Vendas antec. Chds Free" value={inputs.almoco_jantar_antec} onChange={(v) => setField('almoco_jantar_antec', v)} disabled={!canEdit} indent />
            <CalcRow label="Subtotal pensão" value={d.pensao} />
            <InputRow label="Consumo interno" value={inputs.ci_total} onChange={(v) => setField('ci_total', v)} disabled={!canEdit} />
            <CalcRow label="Receita considerada" value={d.receita_considerada} strong />
          </SectionCard>

          <SectionCard title="Custos — detalhamento">
            <InputRow label="Total das requisições" value={inputs.requisicoes_total} onChange={(v) => setField('requisicoes_total', v)} disabled={!canEdit} />
            <InputRow label="Requisições de bebidas" value={inputs.requisicoes_bebidas} onChange={(v) => setField('requisicoes_bebidas', v)} disabled={!canEdit} />
            <CalcRow label="Alimentos (requisições − bebidas − outros)" value={d.custo_alimentos} />
            <CalcRow label="Bebidas" value={d.custo_bebidas} />
            <SubLabel>Outros custos CMV</SubLabel>
            <InputRow label="Refeitório (SEM CRD)" value={inputs.refeitorio} onChange={(v) => setField('refeitorio', v)} disabled={!canEdit} indent />
            <InputRow label="Outros (Diretoria, R.H.)" value={inputs.outros} onChange={(v) => setField('outros', v)} disabled={!canEdit} indent />
            <InputRow label="Aquamania" value={inputs.aquamania} onChange={(v) => setField('aquamania', v)} disabled={!canEdit} indent />
            <CalcRow label="Subtotal outros custos CMV" value={d.outros_custos_cmv} />
            <CalcRow label="Custo A&B" value={d.custo_ab} strong />
            <div className="pt-3 mt-2 border-t border-slate-100">
              <PctInputRow
                label="Meta de CMV (%)"
                value={inputs.limite_pct}
                onChange={(v) => setField('limite_pct', v)}
                disabled={!canEdit}
              />
              <p className="text-[10px] text-slate-400 mt-1">
                Padrão global em Config. CMV. Pode ser ajustada por competência.
              </p>
            </div>
          </SectionCard>

          <SectionCard title="Apoio (venda direta A&B)">
            <InputRow label="Venda direta bebidas" value={inputs.venda_direta_bebidas} onChange={(v) => setField('venda_direta_bebidas', v)} disabled={!canEdit} />
            <InputRow label="C.I. bebidas" value={inputs.ci_bebidas} onChange={(v) => setField('ci_bebidas', v)} disabled={!canEdit} />
            <CalcRow label="CMV bebidas (parcial)" value={d.cmv_bebidas} percent />
            <CalcRow label="CMV alimentos (parcial)" value={d.cmv_alimentos} percent />
            <CalcRow
              label={metaCmp.situacao === 'economia' ? 'Economia vs. meta' : metaCmp.situacao === 'excesso' ? 'Excesso vs. meta' : 'Impacto vs. meta'}
              value={d.economia}
              strong
            />
          </SectionCard>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Painel CMV A&B (visão resumida)
// ---------------------------------------------------------------------------

const CmvAbPanel: React.FC<{ derived: CmvDerived }> = ({ derived: d }) => (
  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
    <div className="px-5 py-4 border-b border-slate-100 bg-[#004D40]/5">
      <h3 className="text-base font-extrabold text-[#004D40] tracking-tight">CMV A&amp;B</h3>
    </div>
    <div className="p-5 space-y-5">
      <div>
        <p className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest mb-2">
          Receitas / Créditos
        </p>
        <div className="space-y-1">
          <AbRow label="Venda A&B" value={d.venda_ab} />
          <AbRow label="Café da manhã" value={d.cafe_manha} prefix="+" />
          <AbRow label="Pensão" value={d.pensao} prefix="+" />
          <AbRow label="Consumo interno" value={d.consumo_interno} prefix="+" />
          <AbRow label="Receita considerada" value={d.receita_considerada} total />
        </div>
      </div>
      <div>
        <p className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest mb-2">Custos</p>
        <div className="space-y-1">
          <AbRow label="Alimentos" value={d.custo_alimentos} />
          <AbRow label="Bebidas" value={d.custo_bebidas} prefix="+" />
          <AbRow label="Outros custos CMV" value={d.outros_custos_cmv} prefix="+" />
          <AbRow label="Custo A&B" value={d.custo_ab} total />
        </div>
      </div>
      <div className="rounded-2xl border-2 border-[#004D40]/20 bg-emerald-50/60 px-4 py-4 text-center">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">CMV</p>
        <p className="text-3xl font-extrabold text-[#004D40] mt-1 tabular-nums">{fmtPct(d.cmv_apurado)}</p>
        <p className="text-xs text-slate-500 mt-1">Custo A&amp;B ÷ Receita considerada</p>
      </div>
    </div>
  </div>
);

const AbRow: React.FC<{ label: string; value: number; prefix?: string; total?: boolean }> = ({
  label,
  value,
  prefix,
  total,
}) => (
  <div
    className={cn(
      'flex items-center justify-between gap-3 py-1.5 px-2 rounded-lg',
      total ? 'bg-emerald-50/80 font-bold' : 'bg-slate-50/50'
    )}
  >
    <span className={cn('text-xs', total ? 'text-slate-900' : 'text-slate-600')}>
      {prefix ? <span className="text-slate-400 mr-1">{prefix}</span> : null}
      {total ? '= ' : ''}
      {label}
    </span>
    <span className={cn('text-sm tabular-nums', total ? 'font-extrabold text-[#004D40]' : 'font-semibold text-slate-800')}>
      {formatCurrency(value)}
    </span>
  </div>
);

const SubLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pt-2">{children}</p>
);

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
  indent?: boolean;
}> = ({ label, value, onChange, disabled, indent }) => {
  const [text, setText] = useState<string>('');
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) {
      setText(value ? new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value) : '');
    }
  }, [value, focused]);

  return (
    <div className={cn('flex items-center justify-between gap-3 py-1', indent && 'pl-3')}>
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