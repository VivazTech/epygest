import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Boxes, CalendarDays, CheckCircle2, Loader2, RefreshCcw } from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import { useSearch } from '../context/SearchContext';
import { matchesSearch } from '../lib/search';
import { ImportCorrectionCell } from '../components/ImportCorrectionCell';
import type { CorrectableValueMeta } from '../lib/importCorrections';

export const MESES_CONSUMO = [
  '', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

type Competencia = {
  month: number;
  importado: boolean;
  linhas: number;
  clientes: number;
  quantidade: number;
  valor: number;
};

type ConsumoLine = {
  id?: number;
  cliente_id?: string | null;
  cliente_nome?: string | null;
  produto_codigo?: string | null;
  produto?: string | null;
  unidade?: string | null;
  nf?: string | null;
  data?: string | null;
  quantidade?: number;
  quantidade_meta?: CorrectableValueMeta;
  vl_unitario?: number;
  vl_total?: number;
  vl_desconto?: number;
  taxa_servico?: number;
  vl_liquido?: number;
  vl_liquido_meta?: CorrectableValueMeta;
  forma_pgto?: string | null;
};

type ConsumoSummary = {
  lines_count: number;
  clientes_count: number;
  total_quantidade: number;
  total_liquido: number;
  total_bruto?: number;
  total_desconto?: number;
};

type ConsumoInternoPageProps = {
  onSelectMonth?: (month: number) => void;
};

export const ConsumoInternoPage: React.FC<ConsumoInternoPageProps> = ({ onSelectMonth }) => {
  const now = new Date();
  const [year, setYear] = useState(String(now.getFullYear()));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [competencias, setCompetencias] = useState<Competencia[]>([]);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/consumo-interno/competencias?year=${encodeURIComponent(year)}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Falha ao carregar competências.');
      setCompetencias(Array.isArray(json.months) ? json.months : []);
    } catch (err: any) {
      setCompetencias([]);
      setError(err?.message || 'Erro ao carregar Consumo Interno.');
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
          linhas: acc.linhas + c.linhas,
          clientes: acc.clientes + c.clientes,
          valor: acc.valor + c.valor,
        }),
        { meses: 0, linhas: 0, clientes: 0, valor: 0 }
      ),
    [competencias]
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Consumo interno</h2>
          <p className="text-sm text-slate-500">
            Consolidado de fechamento mensal importado em Importação › Consumo interno.
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Meses importados', value: totals.meses, currency: false },
          { label: 'Linhas', value: totals.linhas, currency: false },
          { label: 'Clientes (soma mensal)', value: totals.clientes, currency: false },
          { label: 'Total líquido', value: totals.valor },
        ].map((card) => (
          <div key={card.label} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{card.label}</p>
            <p className="text-lg font-extrabold text-slate-900 mt-1">
              {card.currency === false ? card.value : formatCurrency(card.value)}
            </p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-[#004D40]" />
          <p className="text-sm font-bold text-slate-800">Competências de {year}</p>
          {loading && <Loader2 className="w-4 h-4 animate-spin text-slate-400 ml-auto" />}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 p-4">
          {competencias.map((c) => (
            <button
              key={c.month}
              type="button"
              onClick={() => onSelectMonth?.(c.month)}
              className={cn(
                'text-left rounded-2xl border p-4 transition-colors',
                c.importado
                  ? 'border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50'
                  : 'border-slate-100 bg-slate-50/40 hover:bg-slate-50'
              )}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-sm font-bold text-slate-800">
                  {String(c.month).padStart(2, '0')} · {MESES_CONSUMO[c.month]}
                </span>
                {c.importado ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-lg">
                    <CheckCircle2 className="w-3 h-3" /> Importado
                  </span>
                ) : (
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-100 px-2 py-0.5 rounded-lg">
                    Vazio
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500">
                {c.linhas} linha(s) · {c.clientes} cliente(s)
              </p>
              <p className="text-base font-extrabold text-slate-900 mt-1 tabular-nums">
                {formatCurrency(c.valor || 0)}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

type ConsumoInternoMesPageProps = {
  month: number;
};

export const ConsumoInternoMesPage: React.FC<ConsumoInternoMesPageProps> = ({ month }) => {
  const now = new Date();
  const { query } = useSearch();
  const [year, setYear] = useState(String(now.getFullYear()));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lines, setLines] = useState<ConsumoLine[]>([]);
  const [summary, setSummary] = useState<ConsumoSummary | null>(null);
  const [canEdit, setCanEdit] = useState(false);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => (res.ok ? res.json() : null))
      .then((user) => {
        const role = String(user?.role || '');
        setCanEdit(['admin', 'finance', 'controle'].includes(role));
      })
      .catch(() => setCanEdit(false));
  }, []);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(
        `/api/consumo-interno?year=${encodeURIComponent(year)}&month=${month}`
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Falha ao carregar o mês.');
      setLines(Array.isArray(json.lines) ? json.lines : []);
      setSummary(json.summary ?? null);
    } catch (err: any) {
      setLines([]);
      setSummary(null);
      setError(err?.message || 'Erro ao carregar Consumo Interno.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  const visibleLines = useMemo(
    () =>
      lines.filter((l) =>
        matchesSearch(
          query,
          l.cliente_id,
          l.cliente_nome,
          l.produto_codigo,
          l.produto,
          l.nf,
          l.data,
          l.forma_pgto,
          l.vl_liquido
        )
      ),
    [lines, query]
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">
            Consumo interno — {MESES_CONSUMO[month]}/{year}
          </h2>
          <p className="text-sm text-slate-500">
            Detalhe por cliente e produto importado do relatório de Consumo Interno.
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

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Linhas', value: summary.lines_count, currency: false },
            { label: 'Clientes', value: summary.clientes_count, currency: false },
            { label: 'Quantidade', value: summary.total_quantidade, currency: false },
            { label: 'Total líquido', value: summary.total_liquido },
          ].map((card) => (
            <div key={card.label} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{card.label}</p>
              <p className="text-lg font-extrabold text-slate-900 mt-1">
                {card.currency === false
                  ? Number(card.value).toLocaleString('pt-BR')
                  : formatCurrency(Number(card.value) || 0)}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {visibleLines.length === 0 ? (
          <div className="py-16 flex flex-col items-center justify-center gap-2 text-slate-400">
            <Boxes className="w-10 h-10" />
            <p className="text-sm font-medium">
              {loading
                ? 'Carregando...'
                : `Nenhum consumo interno importado para ${MESES_CONSUMO[month]}/${year}.`}
            </p>
            {!loading && (
              <p className="text-xs">Importe em Importação › Consumo interno e envie para Prev x Real.</p>
            )}
          </div>
        ) : (
          <div className="overflow-auto max-h-[600px]">
            <table className="w-full text-left border-collapse min-w-[1100px]">
              <thead className="sticky top-0">
                <tr className="bg-slate-50 border-b border-slate-200">
                  {['Cliente', 'Produto', 'Un.', 'NF', 'Data', 'Qtd', 'Vl. unit.', 'Vl. total', 'Desc.', 'Taxa serv.', 'Vl. líquido', 'Forma pgto.'].map((h) => (
                    <th
                      key={h}
                      className={`px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest ${
                        ['Qtd', 'Vl. unit.', 'Vl. total', 'Desc.', 'Taxa serv.', 'Vl. líquido'].includes(h) ? 'text-right' : ''
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleLines.map((line, idx) => (
                  <tr key={line.id ?? idx} className="hover:bg-slate-50/70">
                    <td className="px-3 py-2 text-xs text-slate-700 whitespace-nowrap">
                      <span className="text-slate-400">{line.cliente_id}</span> {line.cliente_nome}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-800">
                      <span className="text-slate-400 tabular-nums mr-1">{line.produto_codigo}</span>
                      {line.produto}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-500">{line.unidade || '—'}</td>
                    <td className="px-3 py-2 text-xs text-slate-500 tabular-nums">{line.nf ?? '—'}</td>
                    <td className="px-3 py-2 text-xs text-slate-600 tabular-nums">{line.data || '—'}</td>
                    <td className="px-3 py-2 text-xs text-right tabular-nums text-slate-700">
                      {line.id && line.quantidade_meta ? (
                        <ImportCorrectionCell
                          sourceTable="consumo_interno_rows"
                          rowId={line.id}
                          fieldName="quantidade"
                          meta={line.quantidade_meta}
                          rowLabel={`${line.produto_codigo || ''} · ${line.produto || ''}`}
                          year={Number(year)}
                          month={month}
                          canEdit={canEdit}
                          onSaved={load}
                          className="w-full"
                        />
                      ) : (
                        Number(line.quantidade || 0).toLocaleString('pt-BR')
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-right tabular-nums text-slate-700">
                      {formatCurrency(Number(line.vl_unitario) || 0)}
                    </td>
                    <td className="px-3 py-2 text-xs text-right tabular-nums text-slate-700">
                      {formatCurrency(Number(line.vl_total) || 0)}
                    </td>
                    <td className="px-3 py-2 text-xs text-right tabular-nums text-slate-500">
                      {formatCurrency(Number(line.vl_desconto) || 0)}
                    </td>
                    <td className="px-3 py-2 text-xs text-right tabular-nums text-slate-500">
                      {formatCurrency(Number(line.taxa_servico) || 0)}
                    </td>
                    <td className="px-3 py-2 text-xs text-right tabular-nums font-semibold text-slate-900">
                      {line.id && line.vl_liquido_meta ? (
                        <ImportCorrectionCell
                          sourceTable="consumo_interno_rows"
                          rowId={line.id}
                          fieldName="vl_liquido"
                          meta={line.vl_liquido_meta}
                          rowLabel={`${line.produto_codigo || ''} · ${line.produto || ''}`}
                          year={Number(year)}
                          month={month}
                          canEdit={canEdit}
                          onSaved={load}
                          className="w-full"
                        />
                      ) : (
                        formatCurrency(Number(line.vl_liquido) || 0)
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600 whitespace-nowrap">{line.forma_pgto || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
