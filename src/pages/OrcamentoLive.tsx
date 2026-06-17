import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCcw, ChevronDown, ChevronRight, TrendingUp, TrendingDown, DownloadCloud } from 'lucide-react';
import { formatCurrency } from '../lib/utils';
import { useSearch } from '../context/SearchContext';
import { matchesSearch } from '../lib/search';

interface OrcamentoRow {
  id: number;
  crd: string;
  grupo: string;
  detalhado: string;
  orcado: number[];
  anterior: number[];
  total_orcado: number;
  total_anterior: number;
  variacao: number | null;
}

interface OrcamentoResponse {
  year: number;
  previous_year: number;
  filters: { crd: string | null };
  rows: OrcamentoRow[];
  totals: {
    orcado_months: number[];
    anterior_months: number[];
    orcado: number;
    anterior: number;
    variacao: number | null;
  };
}

const monthHeaders = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const formatVariacao = (v: number | null): string => {
  if (v === null || !Number.isFinite(v)) return 'N.A.';
  return `${(v * 100).toFixed(1).replace('.', ',')}%`;
};

export const OrcamentoLive: React.FC = () => {
  const { query } = useSearch();
  const [year, setYear] = useState('2026');
  const [crdFilter, setCrdFilter] = useState('');
  const [crdOptions, setCrdOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingCell, setSavingCell] = useState(false);
  const [data, setData] = useState<OrcamentoResponse | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editingCell, setEditingCell] = useState<{ rowId: number; monthIndex: number } | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [importing, setImporting] = useState(false);
  const [userRole, setUserRole] = useState('viewer');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('year', year);
      if (crdFilter.trim()) params.set('crd', crdFilter.trim());
      const res = await fetch(`/api/orcamento?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) {
        alert(json.error || 'Erro ao carregar o Orçamento');
        return;
      }
      setData(json);
    } finally {
      setLoading(false);
    }
  }, [year, crdFilter]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('user');
      if (raw) setUserRole(String(JSON.parse(raw)?.role || 'viewer'));
    } catch {
      // ignora
    }
    fetch('/api/crds')
      .then((res) => res.json())
      .then((rows) => {
        const options = Array.from(
          new Set(
            (Array.isArray(rows) ? rows : [])
              .map((row: any) => String(row.sector_name || '').trim())
              .filter(Boolean)
          )
        ).sort((a, b) => a.localeCompare(b));
        setCrdOptions(options as string[]);
      })
      .catch(() => {});
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rowsByCrd = useMemo(() => {
    const sourceRows = (data?.rows ?? []).filter((row) =>
      matchesSearch(query, row.crd, row.grupo, row.detalhado)
    );
    const grouped = new Map<string, OrcamentoRow[]>();
    for (const row of sourceRows) {
      if (!grouped.has(row.crd)) grouped.set(row.crd, []);
      grouped.get(row.crd)!.push(row);
    }
    return Array.from(grouped.entries()).map(([crdName, rows]) => {
      const months = Array.from({ length: 12 }, (_, i) => rows.reduce((s, r) => s + (r.orcado[i] || 0), 0));
      const total = months.reduce((s, v) => s + v, 0);
      const totalAnterior = rows.reduce((s, r) => s + r.total_anterior, 0);
      const variacao = totalAnterior !== 0 ? total / totalAnterior - 1 : null;
      return { crdName, rows, months, total, totalAnterior, variacao };
    });
  }, [data, query]);

  useEffect(() => {
    if (!query.trim()) return;
    setExpanded(new Set(rowsByCrd.map((group) => group.crdName)));
  }, [query, rowsByCrd]);

  const toggleCrd = (crdName: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(crdName)) next.delete(crdName);
      else next.add(crdName);
      return next;
    });
  };

  const startCellEdit = (rowId: number, monthIndex: number, value: number) => {
    setEditingCell({ rowId, monthIndex });
    setEditingValue(String(value ?? 0));
  };

  const saveCellEdit = async (row: OrcamentoRow, monthIndex: number) => {
    if (savingCell) return;
    const parsedValue = Number(String(editingValue).replace(',', '.'));
    if (!Number.isFinite(parsedValue)) {
      alert('Digite um valor numérico válido.');
      return;
    }
    setSavingCell(true);
    try {
      const res = await fetch('/api/orcamento/cell', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ crd_id: row.id, month: monthIndex + 1, year: Number(year), value: parsedValue }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(json.error || 'Erro ao salvar célula.');
        return;
      }
      setEditingCell(null);
      await loadData();
    } finally {
      setSavingCell(false);
    }
  };

  const importFromSheet = async () => {
    if (importing) return;
    const confirmed = window.confirm(
      `Isto vai SOBRESCREVER o orçado de ${year} no banco com os valores da planilha Orçamento 2026 (aba extraída). Deseja continuar?`
    );
    if (!confirmed) return;
    const createMissing = window.confirm(
      `Também CRIAR no banco as contas da planilha que ainda não existem?\n\n` +
        `OK = cria as contas faltantes (espelha 100% a planilha).\n` +
        `Cancelar = atualiza apenas as contas que já existem.`
    );
    setImporting(true);
    try {
      const res = await fetch('/api/orcamento/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: Number(year), create_missing: createMissing }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(json.error || 'Erro ao importar a planilha.');
        return;
      }
      const partes = [
        `Importação concluída.`,
        `Contas na planilha: ${json.accounts_in_sheet}`,
        `Atualizadas (já existiam): ${json.matched}`,
        `Criadas: ${json.created ?? 0}`,
        `Valores gravados: ${json.rows_written}`,
      ];
      if (json.unmatched_count) partes.push(`Não importadas: ${json.unmatched_count}`);
      alert(partes.join('\n'));
      await loadData();
    } finally {
      setImporting(false);
    }
  };

  const prevYear = data?.previous_year ?? Number(year) - 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Orçamento {data?.year ?? year}</h2>
          <p className="text-sm text-slate-500">
            Orçado editável por conta/mês, comparado ao realizado de {prevYear}. Réplica viva da aba
            <span className="font-mono text-xs"> Orçamento 2026</span>.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={crdFilter}
            onChange={(e) => setCrdFilter(e.target.value)}
            className="w-56 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
          >
            <option value="">Todos os CRDs</option>
            {crdOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
          <input
            type="number"
            min={2000}
            max={2100}
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="w-24 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
          />
          <button
            onClick={loadData}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#004D40] text-white text-sm font-bold rounded-xl hover:bg-[#003d33] disabled:opacity-60"
          >
            <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Atualizando...' : 'Atualizar'}
          </button>
          {userRole === 'admin' && (
            <button
              onClick={importFromSheet}
              disabled={importing}
              title="Importa os valores da planilha Orçamento 2026 para o banco (sobrescreve o orçado)"
              className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-[#004D40] text-[#004D40] text-sm font-bold rounded-xl hover:bg-emerald-50 disabled:opacity-60"
            >
              <DownloadCloud className={`w-4 h-4 ${importing ? 'animate-pulse' : ''}`} />
              {importing ? 'Importando...' : 'Importar da planilha'}
            </button>
          )}
        </div>
      </div>

      {/* Resumo comparativo */}
      {data && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-white border border-slate-200 rounded-2xl p-4">
            <p className="text-[11px] uppercase tracking-wider font-bold text-slate-400">Orçado {data.year}</p>
            <p className="text-xl font-extrabold text-slate-900">{formatCurrency(data.totals.orcado)}</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-4">
            <p className="text-[11px] uppercase tracking-wider font-bold text-slate-400">Realizado {prevYear}</p>
            <p className="text-xl font-extrabold text-slate-900">{formatCurrency(data.totals.anterior)}</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-4">
            <p className="text-[11px] uppercase tracking-wider font-bold text-slate-400">Variação</p>
            <p className={`text-xl font-extrabold inline-flex items-center gap-1 ${
              (data.totals.variacao ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-600'
            }`}>
              {data.totals.variacao !== null && ((data.totals.variacao >= 0)
                ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />)}
              {formatVariacao(data.totals.variacao)}
            </p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="divide-y divide-slate-100">
          {rowsByCrd.length === 0 && !loading && (
            <p className="px-5 py-8 text-sm text-slate-400 text-center">Nenhum CRD encontrado para os filtros.</p>
          )}
          {rowsByCrd.map((group) => {
            const isOpen = expanded.has(group.crdName);
            return (
              <div key={group.crdName}>
                <button
                  onClick={() => toggleCrd(group.crdName)}
                  className="w-full flex items-center gap-3 px-5 py-4 hover:bg-slate-50 transition-colors text-left"
                >
                  {isOpen ? <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />}
                  <span className="text-sm font-bold text-slate-900">CRD {group.crdName}</span>
                  <span className="text-xs text-slate-500">({group.rows.length} grupo(s)/linha(s))</span>
                  <span className="ml-auto flex items-center gap-3">
                    <span className="text-xs text-slate-400">vs {prevYear}: <b className={group.variacao !== null && group.variacao >= 0 ? 'text-emerald-600' : 'text-red-600'}>{formatVariacao(group.variacao)}</b></span>
                    <span className="text-sm font-extrabold text-slate-900">{formatCurrency(group.total)}</span>
                  </span>
                </button>

                {isOpen && (
                  <div className="overflow-auto bg-slate-50/40 border-t border-slate-100">
                    <table className="w-full text-left border-collapse min-w-[1700px]">
                      <thead>
                        <tr className="bg-slate-100/70">
                          <th className="sticky left-0 z-20 bg-slate-100/90 px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Grupo</th>
                          <th className="sticky left-[120px] z-20 bg-slate-100/90 px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Detalhado</th>
                          {monthHeaders.map((month) => (
                            <th key={`${group.crdName}-${month}`} className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">{month}</th>
                          ))}
                          <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Orçado {data?.year}</th>
                          <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Realiz. {prevYear}</th>
                          <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Variação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {group.rows.map((row, rowIndex) => (
                          <tr key={row.id} className={rowIndex % 2 === 0 ? 'bg-white hover:bg-slate-50' : 'bg-slate-100 hover:bg-slate-200'}>
                            <td className={`sticky left-0 z-10 px-4 py-3 text-xs text-slate-900 min-w-[120px] ${rowIndex % 2 === 0 ? 'bg-white' : 'bg-slate-100'}`}>{row.grupo}</td>
                            <td className={`sticky left-[120px] z-10 px-4 py-3 text-sm text-slate-900 min-w-[260px] ${rowIndex % 2 === 0 ? 'bg-white' : 'bg-slate-100'}`}>{row.detalhado}</td>
                            {row.orcado.map((value, index) => {
                              const isEditing = editingCell?.rowId === row.id && editingCell?.monthIndex === index;
                              return (
                                <td key={`${row.id}-${index}`} className="px-2 py-2 text-xs text-right text-slate-900">
                                  {isEditing ? (
                                    <input
                                      autoFocus
                                      type="number"
                                      step="0.01"
                                      value={editingValue}
                                      onChange={(e) => setEditingValue(e.target.value)}
                                      onBlur={() => saveCellEdit(row, index)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') saveCellEdit(row, index);
                                        if (e.key === 'Escape') setEditingCell(null);
                                      }}
                                      className="w-24 px-2 py-1 text-right bg-white border border-emerald-300 rounded-md"
                                    />
                                  ) : (
                                    <button
                                      onClick={() => startCellEdit(row.id, index, value)}
                                      className="min-w-20 px-2 py-1 rounded hover:bg-emerald-50 transition-colors text-xs text-slate-900"
                                      title="Clique para editar o orçado"
                                    >
                                      {formatCurrency(value || 0)}
                                    </button>
                                  )}
                                </td>
                              );
                            })}
                            <td className="px-4 py-3 text-xs text-right font-bold text-slate-900">{formatCurrency(row.total_orcado || 0)}</td>
                            <td className="px-4 py-3 text-xs text-right text-slate-500">{formatCurrency(row.total_anterior || 0)}</td>
                            <td className={`px-4 py-3 text-xs text-right font-bold ${row.variacao !== null && row.variacao >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                              {formatVariacao(row.variacao)}
                            </td>
                          </tr>
                        ))}
                        <tr className="bg-slate-100 border-t border-slate-300">
                          <td className="sticky left-0 z-10 bg-white px-4 py-3 text-xs font-bold text-slate-700" colSpan={2}>Total CRD {group.crdName}</td>
                          {group.months.map((value, index) => (
                            <td key={`sub-${group.crdName}-${index}`} className="px-4 py-3 text-xs text-right font-bold text-slate-800">{formatCurrency(value || 0)}</td>
                          ))}
                          <td className="px-4 py-3 text-xs text-right font-extrabold text-slate-900">{formatCurrency(group.total || 0)}</td>
                          <td className="px-4 py-3 text-xs text-right text-slate-500">{formatCurrency(group.totalAnterior || 0)}</td>
                          <td className={`px-4 py-3 text-xs text-right font-bold ${group.variacao !== null && group.variacao >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatVariacao(group.variacao)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Total geral por mês */}
      {data && (
        <div className="bg-white rounded-2xl border border-emerald-100 shadow-sm overflow-auto">
          <table className="w-full text-left border-collapse min-w-[1400px]">
            <thead>
              <tr className="bg-emerald-100/70 border-b border-emerald-200">
                <th className="px-4 py-2 text-[10px] font-bold text-emerald-700 uppercase tracking-widest" colSpan={2}>Referência</th>
                {monthHeaders.map((month) => (
                  <th key={`th-${month}`} className="px-4 py-2 text-[10px] font-bold text-emerald-700 uppercase tracking-widest text-right">{month}</th>
                ))}
                <th className="px-4 py-2 text-[10px] font-bold text-emerald-700 uppercase tracking-widest text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              <tr className="bg-emerald-50/50 border-t border-emerald-100">
                <td className="px-4 py-3 text-xs font-bold text-emerald-800" colSpan={2}>Orçado total por mês ({data.year})</td>
                {data.totals.orcado_months.map((value, index) => (
                  <td key={`to-${index}`} className="px-4 py-3 text-xs text-right font-bold text-emerald-800">{formatCurrency(value || 0)}</td>
                ))}
                <td className="px-4 py-3 text-xs text-right font-extrabold text-emerald-900">{formatCurrency(data.totals.orcado || 0)}</td>
              </tr>
              <tr className="border-t border-emerald-100">
                <td className="px-4 py-3 text-xs font-bold text-slate-500" colSpan={2}>Realizado por mês ({prevYear})</td>
                {data.totals.anterior_months.map((value, index) => (
                  <td key={`ta-${index}`} className="px-4 py-3 text-xs text-right text-slate-500">{formatCurrency(value || 0)}</td>
                ))}
                <td className="px-4 py-3 text-xs text-right font-bold text-slate-600">{formatCurrency(data.totals.anterior || 0)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
