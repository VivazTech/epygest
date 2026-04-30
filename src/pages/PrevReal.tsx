import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCcw, ChevronDown, ChevronRight } from 'lucide-react';
import { formatCurrency } from '../lib/utils';

type PrevRealMonth = {
  previsto: number;
  realizado: number;
  diferenca: number;
};

type PrevRealApiResponse = {
  year: number;
  occupancy_percent: number;
  rows: Array<{
    id: number;
    crd: string;
    grupo: string;
    detalhado: string;
    months: PrevRealMonth[];
    total_previsto: number;
    total_realizado: number;
    total_diferenca: number;
  }>;
  totals: {
    months: PrevRealMonth[];
    previsto: number;
    realizado: number;
    diferenca: number;
  };
};

const monthHeaders = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10', 'M11', 'M12'];

export const PrevRealPage: React.FC = () => {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(String(currentYear));
  const [crdFilter, setCrdFilter] = useState('');
  const [crdOptions, setCrdOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<PrevRealApiResponse | null>(null);
  const [expandedCrds, setExpandedCrds] = useState<Set<string>>(new Set());
  const [savingCell, setSavingCell] = useState(false);
  const [editingCell, setEditingCell] = useState<{ rowId: number; monthIndex: number } | null>(null);
  const [editingValue, setEditingValue] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('year', year);
      if (crdFilter.trim()) params.set('crd', crdFilter.trim());
      const res = await fetch(`/api/prev-real?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) {
        alert(json.error || 'Erro ao carregar Prev x Real');
        return;
      }
      setData(json);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetch('/api/crds')
      .then((res) => res.json())
      .then((rows) => {
        const options = Array.from(new Set(
          (Array.isArray(rows) ? rows : [])
            .map((row: any) => String(row.sector_name || '').trim())
            .filter((value: string) => Boolean(value))
        )).sort((a, b) => a.localeCompare(b));
        setCrdOptions(options);
      });
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rowsByCrd = useMemo(() => {
    const grouped = new Map<string, PrevRealApiResponse['rows']>();
    for (const row of data?.rows || []) {
      if (!grouped.has(row.crd)) grouped.set(row.crd, []);
      grouped.get(row.crd)!.push(row);
    }
    return Array.from(grouped.entries()).map(([crdName, rows]) => {
      const months = Array.from({ length: 12 }, (_, idx) => ({
        previsto: rows.reduce((sum, row) => sum + (row.months[idx]?.previsto || 0), 0),
        realizado: rows.reduce((sum, row) => sum + (row.months[idx]?.realizado || 0), 0),
        diferenca: rows.reduce((sum, row) => sum + (row.months[idx]?.diferenca || 0), 0),
      }));
      return {
        crdName,
        rows,
        months,
        total_previsto: months.reduce((sum, m) => sum + m.previsto, 0),
        total_realizado: months.reduce((sum, m) => sum + m.realizado, 0),
        total_diferenca: months.reduce((sum, m) => sum + m.diferenca, 0),
      };
    });
  }, [data]);

  useEffect(() => {
    if (!rowsByCrd.length) {
      setExpandedCrds(new Set());
      return;
    }
    if (crdFilter.trim()) {
      const filteredName = crdFilter.trim().toLowerCase();
      const match = rowsByCrd.find((item) => item.crdName.toLowerCase() === filteredName);
      if (match) setExpandedCrds(new Set([match.crdName]));
      return;
    }
    setExpandedCrds(new Set());
  }, [rowsByCrd, crdFilter]);

  const toggleCrd = (crdName: string) => {
    setExpandedCrds((prev) => {
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

  const saveCellEdit = async (
    row: PrevRealApiResponse['rows'][number],
    monthIndex: number
  ) => {
    if (savingCell) return;
    const parsedValue = Number(String(editingValue).replace(',', '.'));
    if (!Number.isFinite(parsedValue)) {
      alert('Digite um valor numérico válido.');
      return;
    }

    setSavingCell(true);
    try {
      const res = await fetch('/api/sintase/cell', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          crd_id: row.id,
          month: monthIndex + 1,
          year: Number(year),
          value: parsedValue,
          occupancy_percent: Number(data?.occupancy_percent ?? 100),
        }),
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

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-bold text-slate-900">Prev x Real</h2>
        <p className="text-sm text-slate-500">
          Visão por CRD com colunas mensais de Previsto, Realizado e Diferença, agrupadas por setor.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-wrap items-center gap-3">
        <select
          value={crdFilter}
          onChange={(e) => setCrdFilter(e.target.value)}
          className="w-full md:w-80 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
        >
          <option value="">Todos os setores</option>
          {crdOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <input
          type="number"
          min={2000}
          max={2100}
          value={year}
          onChange={(e) => setYear(e.target.value)}
          className="w-28 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
        />
        <button
          onClick={loadData}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 bg-[#004D40] text-white text-sm font-bold rounded-xl hover:bg-[#003d33] disabled:opacity-60"
        >
          <RefreshCcw className="w-4 h-4" />
          {loading ? 'Atualizando...' : 'Atualizar'}
        </button>
        <span className="text-xs text-slate-500">Ocupação aplicada: {Number(data?.occupancy_percent ?? 100).toFixed(2)}%</span>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="divide-y divide-slate-100">
          {rowsByCrd.map((crdGroup) => {
            const isOpen = expandedCrds.has(crdGroup.crdName);
            return (
              <div key={crdGroup.crdName}>
                <button
                  onClick={() => toggleCrd(crdGroup.crdName)}
                  className="w-full flex items-center gap-3 px-5 py-4 hover:bg-slate-50 transition-colors text-left"
                >
                  {isOpen ? (
                    <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
                  )}
                  <span className="text-sm font-bold text-slate-900">Setor {crdGroup.crdName}</span>
                  <span className="text-xs text-slate-500">({crdGroup.rows.length} linha(s))</span>
                  <span className="ml-auto text-xs font-bold text-slate-700">
                    Dif. total: {formatCurrency(crdGroup.total_diferenca)}
                  </span>
                </button>

                {isOpen && (
                  <div className="overflow-auto bg-slate-50/40 border-t border-slate-100">
                    <table className="w-full text-left border-collapse min-w-[2800px]">
                      <thead>
                        <tr className="bg-slate-100/70">
                          <th rowSpan={2} className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Grupo</th>
                          <th rowSpan={2} className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Detalhado</th>
                          {monthHeaders.map((month) => (
                            <th key={`${crdGroup.crdName}-${month}`} colSpan={3} className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center border-l border-slate-200">
                              {month}
                            </th>
                          ))}
                          <th rowSpan={2} className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Total Prev.</th>
                          <th rowSpan={2} className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Total Real.</th>
                          <th rowSpan={2} className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Total Dif.</th>
                        </tr>
                        <tr className="bg-slate-100/70">
                          {monthHeaders.map((month) => (
                            <React.Fragment key={`${crdGroup.crdName}-${month}-sub`}>
                              <th className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right border-l border-slate-200">Prev.</th>
                              <th className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Real.</th>
                              <th className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Dif.</th>
                            </React.Fragment>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {crdGroup.rows.map((row, rowIndex) => (
                          <tr
                            key={row.id}
                            className={rowIndex % 2 === 0 ? "bg-white/70 hover:bg-white transition-colors" : "bg-slate-50/70 hover:bg-slate-100/70 transition-colors"}
                          >
                            <td className="px-4 py-3 text-xs text-slate-700">{row.grupo}</td>
                            <td className="px-4 py-3 text-sm text-slate-700">{row.detalhado}</td>
                            {row.months.map((m, idx) => (
                              <React.Fragment key={`${row.id}-${idx}`}>
                                <td className="px-3 py-2 text-xs text-right text-slate-700 border-l border-slate-200">
                                  {editingCell?.rowId === row.id && editingCell?.monthIndex === idx ? (
                                    <input
                                      autoFocus
                                      type="number"
                                      step="0.01"
                                      value={editingValue}
                                      onChange={(e) => setEditingValue(e.target.value)}
                                      onBlur={() => saveCellEdit(row, idx)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') saveCellEdit(row, idx);
                                        if (e.key === 'Escape') setEditingCell(null);
                                      }}
                                      className="w-24 px-2 py-1 text-right bg-white border border-emerald-300 rounded-md"
                                    />
                                  ) : (
                                    <button
                                      onClick={() => startCellEdit(row.id, idx, m.previsto || 0)}
                                      className="px-2 py-1 rounded hover:bg-emerald-50 transition-colors"
                                      title="Clique para editar previsto"
                                    >
                                      {formatCurrency(m.previsto || 0)}
                                    </button>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-xs text-right text-slate-700">{formatCurrency(m.realizado || 0)}</td>
                                <td className={`px-3 py-2 text-xs text-right font-semibold ${(m.diferenca || 0) < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{formatCurrency(m.diferenca || 0)}</td>
                              </React.Fragment>
                            ))}
                            <td className="px-4 py-3 text-xs text-right font-bold text-slate-800">{formatCurrency(row.total_previsto || 0)}</td>
                            <td className="px-4 py-3 text-xs text-right font-bold text-slate-800">{formatCurrency(row.total_realizado || 0)}</td>
                            <td className={`px-4 py-3 text-xs text-right font-extrabold ${(row.total_diferenca || 0) < 0 ? 'text-red-700' : 'text-emerald-700'}`}>{formatCurrency(row.total_diferenca || 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-emerald-100 shadow-sm overflow-auto">
        <table className="w-full text-left border-collapse min-w-[2800px]">
          <thead>
            <tr className="bg-emerald-50/50 border-t border-emerald-100">
              <th className="px-4 py-3 text-xs font-bold text-emerald-800">Total geral ({data?.year || currentYear})</th>
              {monthHeaders.map((month) => (
                <th key={`tot-head-${month}`} colSpan={3} className="px-4 py-3 text-[10px] font-bold text-emerald-700 uppercase tracking-widest text-center border-l border-emerald-200">{month}</th>
              ))}
              <th className="px-4 py-3 text-[10px] font-bold text-emerald-700 uppercase tracking-widest text-right">Total Prev.</th>
              <th className="px-4 py-3 text-[10px] font-bold text-emerald-700 uppercase tracking-widest text-right">Total Real.</th>
              <th className="px-4 py-3 text-[10px] font-bold text-emerald-700 uppercase tracking-widest text-right">Total Dif.</th>
            </tr>
          </thead>
          <tbody>
            <tr className="bg-white">
              <td className="px-4 py-3 text-xs text-emerald-800 font-bold">Consolidado</td>
              {(data?.totals?.months || Array.from({ length: 12 }, () => ({ previsto: 0, realizado: 0, diferenca: 0 }))).map((m, idx) => (
                <React.Fragment key={`tot-${idx}`}>
                  <td className="px-3 py-2 text-xs text-right text-emerald-800 border-l border-emerald-100">{formatCurrency(m.previsto || 0)}</td>
                  <td className="px-3 py-2 text-xs text-right text-emerald-800">{formatCurrency(m.realizado || 0)}</td>
                  <td className={`px-3 py-2 text-xs text-right font-bold ${(m.diferenca || 0) < 0 ? 'text-red-700' : 'text-emerald-800'}`}>{formatCurrency(m.diferenca || 0)}</td>
                </React.Fragment>
              ))}
              <td className="px-4 py-3 text-xs text-right font-bold text-emerald-900">{formatCurrency(data?.totals?.previsto || 0)}</td>
              <td className="px-4 py-3 text-xs text-right font-bold text-emerald-900">{formatCurrency(data?.totals?.realizado || 0)}</td>
              <td className={`px-4 py-3 text-xs text-right font-extrabold ${(data?.totals?.diferenca || 0) < 0 ? 'text-red-700' : 'text-emerald-900'}`}>{formatCurrency(data?.totals?.diferenca || 0)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};
