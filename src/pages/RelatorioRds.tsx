import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarDays, CheckCircle2, ClipboardList, Loader2, RefreshCcw } from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import { useSearch } from '../context/SearchContext';
import { matchesSearch } from '../lib/search';

export const MESES_RDS = [
  '', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

type Competencia = {
  month: number;
  importado: boolean;
  report_date: string | null;
  file_name: string | null;
  sections: number;
  items: number;
};

type RdsItem = { label: string; values: number[] };
type RdsSection = {
  key: string;
  title: string;
  columns: string[];
  items: RdsItem[];
  total: number[] | null;
};
type RdsWeekRow = { dia: string; data: string; quantidade: number; percentual: number };

type RelatorioRdsPageProps = {
  onSelectMonth?: (month: number) => void;
};

export const RelatorioRdsPage: React.FC<RelatorioRdsPageProps> = ({ onSelectMonth }) => {
  const now = new Date();
  const [year, setYear] = useState(String(now.getFullYear()));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [competencias, setCompetencias] = useState<Competencia[]>([]);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/rds/competencias?year=${encodeURIComponent(year)}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Falha ao carregar competências.');
      setCompetencias(Array.isArray(json.months) ? json.months : []);
    } catch (err: any) {
      setCompetencias([]);
      setError(err?.message || 'Erro ao carregar RDS.');
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
          sections: acc.sections + c.sections,
          items: acc.items + c.items,
        }),
        { meses: 0, sections: 0, items: 0 }
      ),
    [competencias]
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Relatório Diário de Situação</h2>
          <p className="text-sm text-slate-500">
            Resumo das competências importadas em Importação › Relatório Diário de Situação.
            As planilhas Relatório de RDS e Apoio RDS continuam disponíveis nesta seção.
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

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: 'Meses importados', value: totals.meses },
          { label: 'Seções (soma)', value: totals.sections },
          { label: 'Itens (soma)', value: totals.items },
        ].map((card) => (
          <div key={card.label} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{card.label}</p>
            <p className="text-lg font-extrabold text-slate-900 mt-1">{card.value}</p>
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
                  {String(c.month).padStart(2, '0')} · {MESES_RDS[c.month]}
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
                {c.importado
                  ? `${c.sections} seção(ões) · ${c.items} item(ns)`
                  : 'Sem importação neste mês'}
              </p>
              {c.report_date && (
                <p className="text-xs font-semibold text-slate-700 mt-1">Data do RDS: {c.report_date}</p>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

type RelatorioRdsMesPageProps = {
  month: number;
};

export const RelatorioRdsMesPage: React.FC<RelatorioRdsMesPageProps> = ({ month }) => {
  const now = new Date();
  const { query } = useSearch();
  const [year, setYear] = useState(String(now.getFullYear()));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reportDate, setReportDate] = useState<string | null>(null);
  const [sections, setSections] = useState<RdsSection[]>([]);
  const [previsaoSemana, setPrevisaoSemana] = useState<RdsWeekRow[]>([]);
  const [summary, setSummary] = useState<{ sections: number; items: number } | null>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/rds?year=${encodeURIComponent(year)}&month=${month}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Falha ao carregar o mês.');
      setReportDate(json.report_date ?? null);
      setSections(Array.isArray(json.sections) ? json.sections : []);
      setPrevisaoSemana(Array.isArray(json.previsao_semana) ? json.previsao_semana : []);
      setSummary(json.summary ?? null);
    } catch (err: any) {
      setReportDate(null);
      setSections([]);
      setPrevisaoSemana([]);
      setSummary(null);
      setError(err?.message || 'Erro ao carregar RDS.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  const visibleSections = useMemo(() => {
    if (!query.trim()) return sections;
    return sections
      .map((section) => ({
        ...section,
        items: section.items.filter((item) =>
          matchesSearch(query, item.label, section.title, ...(item.values ?? []))
        ),
      }))
      .filter(
        (section) =>
          section.items.length > 0 || matchesSearch(query, section.title, section.key)
      );
  }, [sections, query]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">
            Relatório Diário de Situação — {MESES_RDS[month]}/{year}
          </h2>
          <p className="text-sm text-slate-500">
            Snapshot do RDS importado para esta competência
            {reportDate ? ` (data do relatório: ${reportDate})` : ''}.
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
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Seções</p>
            <p className="text-lg font-extrabold text-slate-900 mt-1">{summary.sections}</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Itens</p>
            <p className="text-lg font-extrabold text-slate-900 mt-1">{summary.items}</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Data do RDS</p>
            <p className="text-lg font-extrabold text-slate-900 mt-1">{reportDate || '—'}</p>
          </div>
        </div>
      )}

      {sections.length === 0 && !loading ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm py-16 flex flex-col items-center justify-center gap-2 text-slate-400">
          <ClipboardList className="w-10 h-10" />
          <p className="text-sm font-medium">
            Nenhum RDS importado para {MESES_RDS[month]}/{year}.
          </p>
          <p className="text-xs">Importe em Importação › Relatório Diário de Situação e envie para Apuração de Receita.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {visibleSections.map((section) => (
            <div key={section.key} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100">
                <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">{section.title}</p>
              </div>
              <div className="overflow-auto max-h-[420px]">
                <table className="w-full text-left border-collapse min-w-[600px]">
                  <thead className="sticky top-0">
                    <tr className="bg-slate-50 border-b border-slate-200">
                      {(section.columns?.length ? section.columns : ['Item']).map((h, hi) => (
                        <th
                          key={`${h}-${hi}`}
                          className={`px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest ${hi > 0 ? 'text-right' : ''}`}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {section.items.map((item, idx) => (
                      <tr key={`${item.label}-${idx}`} className="hover:bg-slate-50/70">
                        <td className="px-3 py-2 text-xs whitespace-nowrap text-slate-800">{item.label}</td>
                        {item.values.map((v, vi) => (
                          <td key={vi} className="px-3 py-2 text-xs text-right tabular-nums text-slate-700">
                            {section.columns[vi + 1]?.includes('%') ? `${Number(v).toFixed(2)}%` : formatCurrency(Number(v) || 0)}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {section.total && (
                      <tr className="bg-slate-50 font-bold">
                        <td className="px-3 py-2 text-xs text-slate-900">Total</td>
                        {section.total.map((v, vi) => (
                          <td key={vi} className="px-3 py-2 text-xs text-right tabular-nums text-slate-900">
                            {section.columns[vi + 1]?.includes('%') ? `${Number(v).toFixed(2)}%` : formatCurrency(Number(v) || 0)}
                          </td>
                        ))}
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          {previsaoSemana.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100">
                <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Previsão de ocupação da semana
                </p>
              </div>
              <div className="overflow-auto">
                <table className="w-full text-left border-collapse min-w-[500px]">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      {['Dia', 'Data', 'Quantidade', 'Percentual'].map((h, hi) => (
                        <th
                          key={h}
                          className={`px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest ${hi > 0 ? 'text-right' : ''}`}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {previsaoSemana.map((w, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/70">
                        <td className="px-3 py-2 text-xs text-slate-800">{w.dia}</td>
                        <td className="px-3 py-2 text-xs text-right tabular-nums text-slate-600">{w.data}</td>
                        <td className="px-3 py-2 text-xs text-right tabular-nums text-slate-700">{w.quantidade}</td>
                        <td className="px-3 py-2 text-xs text-right tabular-nums text-slate-700">
                          {Number(w.percentual || 0).toFixed(2)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
