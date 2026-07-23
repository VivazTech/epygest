import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarDays, CheckCircle2, Loader2, RefreshCcw } from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import { useSearch } from '../context/SearchContext';
import { matchesSearch } from '../lib/search';

export const MESES_REL_CRD = [
  '', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

type RelCrdRow = {
  id?: number;
  nivel: number;
  codigo: string;
  nome?: string | null;
  lancamentos: number;
  cancelamentos: number;
  saldo_lanc: number;
  baixas: number;
  estorno: number;
  baixas_liquido: number;
  lanc_liquido: number;
  crd_id?: number | null;
  previsto?: number | null;
  estourada?: boolean;
  valor_estouro?: number;
};

type RelCrdSummary = {
  contas: number;
  grupos: number;
  total_lancamentos: number;
  total_cancelamentos: number;
  total_saldo_lanc: number;
  total_baixas: number;
  total_estorno: number;
  total_baixas_liquido: number;
  total_lanc_liquido: number;
  matched: number;
  unmatched: number;
  linhas_estouradas: number;
  valor_estourado: number;
};

type Competencia = {
  month: number;
  importado: boolean;
  contas: number;
  saldo_lanc: number;
};

type RelatorioCrdPageProps = {
  onSelectMonth?: (month: number) => void;
};

export const RelatorioCrdPage: React.FC<RelatorioCrdPageProps> = ({ onSelectMonth }) => {
  const now = new Date();
  const [year, setYear] = useState(String(now.getFullYear()));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [competencias, setCompetencias] = useState<Competencia[]>([]);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/rel-crd/competencias?year=${encodeURIComponent(year)}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Falha ao carregar competências.');
      setCompetencias(Array.isArray(json.months) ? json.months : []);
    } catch (err: any) {
      setCompetencias([]);
      setError(err?.message || 'Erro ao carregar Relatorio de CRD.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  const totals = useMemo(
    () =>
      competencias.reduce(
        (acc, c) => ({
          meses: acc.meses + (c.importado ? 1 : 0),
          contas: acc.contas + c.contas,
          saldo: acc.saldo + c.saldo_lanc,
        }),
        { meses: 0, contas: 0, saldo: 0 }
      ),
    [competencias]
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Relatorio de CRD</h2>
          <p className="text-sm text-slate-500">
            Resumo das competências importadas em Importação › Rel. CRD. O saldo lanç. continua alimentando o Prev x Real Mensal.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-semibold"
          >
            {Array.from({ length: 6 }, (_, i) => String(now.getFullYear() - 2 + i)).map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Meses importados</p>
          <p className="text-2xl font-extrabold text-slate-900 mt-1">{totals.meses}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Contas no ano</p>
          <p className="text-2xl font-extrabold text-slate-900 mt-1">{totals.contas}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Saldo lanç. acumulado</p>
          <p className="text-2xl font-extrabold text-slate-900 mt-1">{formatCurrency(totals.saldo)}</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        <div className="flex items-center gap-2 mb-4">
          <CalendarDays className="w-4 h-4 text-[#004D40]" />
          <h3 className="text-sm font-bold text-slate-800">Competências {year}</h3>
        </div>
        {loading && competencias.length === 0 ? (
          <p className="text-sm text-slate-400 inline-flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
          </p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {MESES_REL_CRD.slice(1).map((label, idx) => {
              const month = idx + 1;
              const comp = competencias.find((c) => c.month === month);
              const importado = Boolean(comp?.importado);
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
                      ? `${comp?.contas ?? 0} contas · ${formatCurrency(comp?.saldo_lanc ?? 0)}`
                      : 'Sem importação'}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
        {MESES_REL_CRD.slice(1).map((label, idx) => (
          <button
            key={label}
            type="button"
            onClick={() => onSelectMonth?.(idx + 1)}
            className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50"
          >
            {String(idx + 1).padStart(2, '0')} · {label}
          </button>
        ))}
      </div>
    </div>
  );
};

type RelatorioCrdMesPageProps = {
  month: number;
};

export const RelatorioCrdMesPage: React.FC<RelatorioCrdMesPageProps> = ({ month }) => {
  const now = new Date();
  const { query } = useSearch();
  const [year, setYear] = useState(String(now.getFullYear()));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [rows, setRows] = useState<RelCrdRow[]>([]);
  const [summary, setSummary] = useState<RelCrdSummary | null>(null);
  const [onlyEstouradas, setOnlyEstouradas] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/rel-crd?year=${encodeURIComponent(year)}&month=${month}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Falha ao carregar o mês.');
      setRows(Array.isArray(json.rows) ? json.rows : []);
      setSummary(json.summary ?? null);
    } catch (err: any) {
      setRows([]);
      setSummary(null);
      setError(err?.message || 'Erro ao carregar Relatorio de CRD.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  const visibleRows = useMemo(() => {
    let list = rows.filter((r) =>
      matchesSearch(query, r.codigo, r.nome, r.saldo_lanc, r.lanc_liquido, r.lancamentos)
    );
    if (onlyEstouradas) list = list.filter((r) => r.estourada);
    return list;
  }, [rows, query, onlyEstouradas]);

  const cards = summary
    ? [
        { label: 'Contas', value: summary.contas, currency: false },
        { label: 'Grupos (nível 1)', value: summary.grupos, currency: false },
        { label: 'Saldo lanç.', value: summary.total_saldo_lanc },
        { label: 'Lançamentos', value: summary.total_lancamentos },
        { label: 'Baixas', value: summary.total_baixas },
        { label: 'Lanç. líquido', value: summary.total_lanc_liquido },
        { label: 'CRDs vinculados', value: summary.matched, currency: false },
        { label: 'Sem cadastro', value: summary.unmatched, currency: false },
        {
          label: 'Linhas estouradas',
          value: summary.linhas_estouradas ?? 0,
          currency: false,
          highlight: (summary.linhas_estouradas ?? 0) > 0,
          clickable: true,
        },
        {
          label: 'Valor estourado',
          value: summary.valor_estourado ?? 0,
          highlight: (summary.valor_estourado ?? 0) > 0,
        },
      ]
    : [];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">
            Relatorio de CRD — {MESES_REL_CRD[month]}/{year}
          </h2>
          <p className="text-sm text-slate-500">
            Movimentação por conta financeira importada do Rel. CRD. O saldo lanç. também alimenta o Prev x Real Mensal.
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
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#004D40] text-white text-sm font-bold rounded-xl hover:bg-[#003d33] disabled:opacity-60"
          >
            <RefreshCcw className={cn('w-4 h-4', loading && 'animate-spin')} />
            {loading ? 'Atualizando...' : 'Atualizar'}
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {cards.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {cards.map((card) => {
            const isClickable = Boolean((card as { clickable?: boolean }).clickable);
            const highlight = Boolean((card as { highlight?: boolean }).highlight);
            const active = isClickable && onlyEstouradas;
            const className = cn(
              'bg-white rounded-2xl border shadow-sm p-4 text-left transition-colors w-full',
              highlight || active
                ? 'border-red-200 bg-red-50/60'
                : 'border-slate-100',
              isClickable && 'hover:border-red-300 cursor-pointer',
              active && 'ring-2 ring-red-300'
            );
            const body = (
              <>
                <p className={cn(
                  'text-[10px] font-bold uppercase tracking-widest',
                  highlight || active ? 'text-red-500' : 'text-slate-400'
                )}>
                  {card.label}
                  {isClickable && (
                    <span className="ml-1 font-semibold normal-case tracking-normal text-[10px] text-red-400">
                      {onlyEstouradas ? '(filtro on)' : '(clique)'}
                    </span>
                  )}
                </p>
                <p className={cn(
                  'text-lg font-extrabold mt-1',
                  highlight || active ? 'text-red-700' : 'text-slate-900'
                )}>
                  {card.currency === false ? card.value : formatCurrency(Number(card.value) || 0)}
                </p>
              </>
            );
            return isClickable ? (
              <button
                key={card.label}
                type="button"
                onClick={() => setOnlyEstouradas((v) => !v)}
                className={className}
              >
                {body}
              </button>
            ) : (
              <div key={card.label} className={className}>
                {body}
              </div>
            );
          })}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[1100px]">
          <thead>
            <tr className="bg-slate-50/50">
              <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Código</th>
              <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Conta</th>
              <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Previsto</th>
              <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Lançamentos</th>
              <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Cancel.</th>
              <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Saldo lanç.</th>
              <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Baixas</th>
              <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Estorno</th>
              <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Baixas líq.</th>
              <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Lanç. líq.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading && rows.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center text-sm text-slate-400">
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
                  </span>
                </td>
              </tr>
            )}
            {!loading && visibleRows.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-10 text-center text-sm text-slate-400">
                  {onlyEstouradas
                    ? `Nenhuma linha estourada em ${MESES_REL_CRD[month]}/${year}.`
                    : `Nenhuma conta importada para ${MESES_REL_CRD[month]}/${year}. Importe em Importação › Rel. CRD.`}
                </td>
              </tr>
            )}
            {visibleRows.map((row, idx) => (
              <tr
                key={`${row.codigo}-${idx}`}
                className={cn(
                  'hover:bg-slate-50/60',
                  row.nivel === 1 && 'bg-slate-100/80 font-bold',
                  row.nivel === 2 && 'bg-slate-50/40',
                  row.crd_id == null && 'opacity-80',
                  row.estourada && 'bg-red-50/80'
                )}
              >
                <td className="px-4 py-2.5 text-xs tabular-nums text-slate-700">
                  <span style={{ paddingLeft: `${Math.max(0, row.nivel - 1) * 12}px` }}>{row.codigo}</span>
                  {row.crd_id == null && (
                    <span className="ml-2 text-[10px] font-bold uppercase text-amber-600">sem CRD</span>
                  )}
                  {row.estourada && (
                    <span className="ml-2 text-[10px] font-bold uppercase text-red-600">estourada</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-xs text-slate-800">{row.nome || '—'}</td>
                <td className="px-4 py-2.5 text-xs text-right tabular-nums text-slate-500">
                  {row.previsto == null ? '—' : formatCurrency(row.previsto)}
                </td>
                <td className="px-4 py-2.5 text-xs text-right tabular-nums">{formatCurrency(row.lancamentos)}</td>
                <td className="px-4 py-2.5 text-xs text-right tabular-nums text-slate-500">{formatCurrency(row.cancelamentos)}</td>
                <td className={cn(
                  'px-4 py-2.5 text-xs text-right tabular-nums font-semibold',
                  row.estourada ? 'text-red-700' : 'text-slate-900'
                )}>
                  {formatCurrency(row.saldo_lanc)}
                </td>
                <td className="px-4 py-2.5 text-xs text-right tabular-nums">{formatCurrency(row.baixas)}</td>
                <td className="px-4 py-2.5 text-xs text-right tabular-nums text-slate-500">{formatCurrency(row.estorno)}</td>
                <td className="px-4 py-2.5 text-xs text-right tabular-nums">{formatCurrency(row.baixas_liquido)}</td>
                <td className={cn('px-4 py-2.5 text-xs text-right tabular-nums font-semibold', row.lanc_liquido < 0 ? 'text-red-600' : 'text-slate-900')}>
                  {formatCurrency(row.lanc_liquido)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
