import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarDays, CheckCircle2, Loader2, RefreshCcw } from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import { useSearch } from '../context/SearchContext';
import { matchesSearch } from '../lib/search';

export const MESES_REL_REQ = [
  '', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const DESTINO_LABELS: Record<string, string> = {
  cmv: 'CMV',
  uso_consumo: 'Uso e Consumo',
  investimento: 'Investimento',
};

const DESTINO_BADGES: Record<string, string> = {
  cmv: 'bg-amber-100 text-amber-800 border-amber-200',
  uso_consumo: 'bg-blue-100 text-blue-800 border-blue-200',
  investimento: 'bg-purple-100 text-purple-800 border-purple-200',
};

type ReqGrupo = { codigo: number; nome: string; valor: number; destino: string };
type ReqSetor = { codigo: number; nome: string; total: number; grupos: ReqGrupo[] };

type ReqSummary = {
  setores: number;
  grupos: number;
  total_geral: number;
  por_destino: Record<string, number>;
  nao_classificados: number;
};

type Competencia = {
  month: number;
  importado: boolean;
  setores: number;
  grupos: number;
  valor: number;
};

type RelatorioRequisicoesPageProps = {
  onSelectMonth?: (month: number) => void;
};

export const RelatorioRequisicoesPage: React.FC<RelatorioRequisicoesPageProps> = ({ onSelectMonth }) => {
  const now = new Date();
  const [year, setYear] = useState(String(now.getFullYear()));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [competencias, setCompetencias] = useState<Competencia[]>([]);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/requisicoes-sintetica/competencias?year=${encodeURIComponent(year)}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Falha ao carregar competências.');
      setCompetencias(Array.isArray(json.months) ? json.months : []);
    } catch (err: any) {
      setCompetencias([]);
      setError(err?.message || 'Erro ao carregar Requisições.');
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
          grupos: acc.grupos + c.grupos,
          valor: acc.valor + c.valor,
        }),
        { meses: 0, grupos: 0, valor: 0 }
      ),
    [competencias]
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Requisições</h2>
          <p className="text-sm text-slate-500">
            Resumo das competências importadas em Importação › Requisições Sintética por Grupo de Itens.
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
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Grupos no ano</p>
          <p className="text-2xl font-extrabold text-slate-900 mt-1">{totals.grupos}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total acumulado</p>
          <p className="text-2xl font-extrabold text-slate-900 mt-1">{formatCurrency(totals.valor)}</p>
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
            {MESES_REL_REQ.slice(1).map((label, idx) => {
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
                      ? `${comp?.grupos ?? 0} grupos · ${formatCurrency(comp?.valor ?? 0)}`
                      : 'Sem importação'}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
        {MESES_REL_REQ.slice(1).map((label, idx) => (
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

type RelatorioRequisicoesMesPageProps = {
  month: number;
};

export const RelatorioRequisicoesMesPage: React.FC<RelatorioRequisicoesMesPageProps> = ({ month }) => {
  const now = new Date();
  const { query } = useSearch();
  const [year, setYear] = useState(String(now.getFullYear()));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [setores, setSetores] = useState<ReqSetor[]>([]);
  const [summary, setSummary] = useState<ReqSummary | null>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/requisicoes-sintetica?year=${encodeURIComponent(year)}&month=${month}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Falha ao carregar o mês.');
      setSetores(Array.isArray(json.setores) ? json.setores : []);
      setSummary(json.summary ?? null);
    } catch (err: any) {
      setSetores([]);
      setSummary(null);
      setError(err?.message || 'Erro ao carregar Requisições.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  const visibleSetores = useMemo(
    () =>
      setores.filter(
        (st) =>
          matchesSearch(query, st.nome, String(st.codigo), st.total) ||
          st.grupos.some((g) => matchesSearch(query, g.nome, String(g.codigo), g.valor))
      ),
    [setores, query]
  );

  const cards = summary
    ? [
        { label: 'Setores', value: summary.setores, currency: false },
        { label: 'Grupos de itens', value: summary.grupos, currency: false },
        { label: 'Total geral', value: summary.total_geral },
        { label: 'CMV', value: summary.por_destino?.cmv ?? 0 },
        { label: 'Uso e Consumo', value: summary.por_destino?.uso_consumo ?? 0 },
        { label: 'Investimento', value: summary.por_destino?.investimento ?? 0 },
        { label: 'Não classificado', value: summary.por_destino?.[''] ?? 0 },
        { label: 'Grupos sem destino', value: summary.nao_classificados, currency: false },
      ]
    : [];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">
            Requisições — {MESES_REL_REQ[month]}/{year}
          </h2>
          <p className="text-sm text-slate-500">
            Requisições por setor e grupo de itens importadas do relatório Requisições Sintética.
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
          {cards.map((card) => (
            <div key={card.label} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{card.label}</p>
              <p className="text-lg font-extrabold text-slate-900 mt-1">
                {card.currency === false ? card.value : formatCurrency(Number(card.value) || 0)}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[720px]">
          <thead>
            <tr className="bg-slate-50/50">
              <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Código</th>
              <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Setor / Grupo de itens</th>
              <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Destino</th>
              <th className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Valor</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading && setores.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-sm text-slate-400">
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
                  </span>
                </td>
              </tr>
            )}
            {!loading && visibleSetores.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-sm text-slate-400">
                  Nenhuma requisição importada para {MESES_REL_REQ[month]}/{year}. Importe em Importação › Requisições Sintética por Grupo de Itens.
                </td>
              </tr>
            )}
            {visibleSetores.map((setor) => (
              <React.Fragment key={setor.codigo}>
                <tr className="bg-slate-100/80 font-bold hover:bg-slate-100">
                  <td className="px-4 py-2.5 text-xs tabular-nums text-slate-700">{setor.codigo}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-900">{setor.nome}</td>
                  <td className="px-4 py-2.5" />
                  <td className="px-4 py-2.5 text-xs text-right tabular-nums font-bold">{formatCurrency(setor.total)}</td>
                </tr>
                {setor.grupos
                  .filter((g) => !query || matchesSearch(query, g.nome, String(g.codigo), g.valor))
                  .map((g) => (
                    <tr key={`${setor.codigo}-${g.codigo}`} className="hover:bg-slate-50/60">
                      <td className="px-4 py-2 text-xs tabular-nums text-slate-500">
                        <span className="pl-3">{g.codigo}</span>
                      </td>
                      <td className="px-4 py-2 text-xs text-slate-700">
                        <span className="pl-3">{g.nome}</span>
                      </td>
                      <td className="px-4 py-2 text-center">
                        {g.destino ? (
                          <span className={cn('inline-block px-2 py-0.5 rounded-lg border text-[10px] font-bold', DESTINO_BADGES[g.destino])}>
                            {DESTINO_LABELS[g.destino] ?? g.destino}
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold uppercase text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-xs text-right tabular-nums text-slate-700">{formatCurrency(g.valor)}</td>
                    </tr>
                  ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
