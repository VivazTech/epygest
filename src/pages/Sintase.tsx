import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCcw, ChevronDown, ChevronRight } from 'lucide-react';
import { formatCurrency } from '../lib/utils';
import { ValueTrace } from '../components/ValueTrace';

type SintaseApiResponse = {
  year: number;
  rows: Array<{
    id: number;
    crd: string;
    grupo: string;
    detalhado: string;
    months: number[];
    total: number;
  }>;
  totals: {
    months: number[];
    total: number;
  };
};

const monthHeaders = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10', 'M11', 'M12'];

export const SintasePage: React.FC = () => {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(String(currentYear));
  const [crdFilter, setCrdFilter] = useState('');
  const [crdOptions, setCrdOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingCell, setSavingCell] = useState(false);
  const [data, setData] = useState<SintaseApiResponse | null>(null);
  const [expandedCrds, setExpandedCrds] = useState<Set<string>>(new Set());
  const [editingCell, setEditingCell] = useState<{ rowId: number; monthIndex: number } | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [occupancyPercent, setOccupancyPercent] = useState<number>(100);
  const [savingOccupancy, setSavingOccupancy] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('year', year);
      if (crdFilter.trim()) params.set('crd', crdFilter.trim());
      const res = await fetch(`/api/sintase?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) {
        alert(json.error || 'Erro ao carregar Síntase');
        setLoading(false);
        return;
      }
      setOccupancyPercent(Number(json.occupancy_percent ?? 100));
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

  const totalRows = useMemo(() => data?.rows?.length || 0, [data]);
  const rowsByCrd = useMemo(() => {
    const grouped = new Map<string, SintaseApiResponse['rows']>();
    for (const row of data?.rows || []) {
      if (!grouped.has(row.crd)) grouped.set(row.crd, []);
      grouped.get(row.crd)!.push(row);
    }
    return Array.from(grouped.entries()).map(([crdName, rows]) => {
      const crdTotalMonths = Array.from({ length: 12 }, (_, monthIdx) =>
        rows.reduce((sum, row) => sum + (row.months[monthIdx] || 0), 0)
      );
      const crdTotal = crdTotalMonths.reduce((sum, value) => sum + value, 0);
      return {
        crdName,
        rows,
        months: crdTotalMonths,
        total: crdTotal,
      };
    });
  }, [data]);

  useEffect(() => {
    if (!rowsByCrd.length) {
      setExpandedCrds(new Set());
      return;
    }

    // Quando houver filtro por CRD, já abre automaticamente
    // para evitar impressão de que não carregou dados.
    if (crdFilter.trim()) {
      const filteredName = crdFilter.trim();
      const exists = rowsByCrd.some((item) => item.crdName.toLowerCase() === filteredName.toLowerCase());
      if (exists) {
        setExpandedCrds(new Set([rowsByCrd.find((item) => item.crdName.toLowerCase() === filteredName.toLowerCase())!.crdName]));
      }
      return;
    }

    // Sem filtro, mantém tudo colapsado por padrão.
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

  const saveCellEdit = async (row: SintaseApiResponse['rows'][number], monthIndex: number) => {
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
          occupancy_percent: occupancyPercent,
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

  const saveOccupancy = async () => {
    if (savingOccupancy) return;
    const normalized = Math.max(0, Math.min(100, Number(occupancyPercent)));
    if (!Number.isFinite(normalized)) {
      alert('Informe uma ocupação válida entre 0 e 100.');
      return;
    }
    setSavingOccupancy(true);
    try {
      const res = await fetch('/api/sintase/occupancy', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year: Number(year),
          occupancy_percent: normalized,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(json.error || 'Erro ao salvar ocupação.');
        return;
      }
      await loadData();
    } finally {
      setSavingOccupancy(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-bold text-slate-900">Síntase de CRDs</h2>
        <p className="text-sm text-slate-500">
          Lista de CRDs por grupo com orçamento anual (M1 a M12), total por linha e total mensal na última linha.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-wrap items-center gap-3">
        <select
            value={crdFilter}
            onChange={(e) => setCrdFilter(e.target.value)}
            className="w-full md:w-80 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
          >
            <option value="">Todos os CRDs</option>
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
        <div className="h-8 w-px bg-slate-200" />
        <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Ocupação %</span>
        <input
          type="number"
          min={0}
          max={100}
          step="0.01"
          value={occupancyPercent}
          onChange={(e) => setOccupancyPercent(Number(e.target.value))}
          className="w-24 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
        />
        <button
          onClick={saveOccupancy}
          disabled={savingOccupancy}
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-700 text-white text-sm font-bold rounded-xl hover:bg-slate-800 disabled:opacity-60"
        >
          {savingOccupancy ? 'Salvando...' : 'Aplicar ocupação'}
        </button>
        <span className="text-xs text-slate-500">Total de linhas: {totalRows}</span>
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
                  <span className="text-sm font-bold text-slate-900">CRD {crdGroup.crdName}</span>
                  <span className="text-xs text-slate-500">({crdGroup.rows.length} grupo(s)/linha(s))</span>
                  <ValueTrace
                    className="ml-auto text-sm font-extrabold text-slate-900"
                    displayValue={formatCurrency(crdGroup.total)}
                    source={`Soma do CRD ${crdGroup.crdName}`}
                    calculation="Soma dos valores M1 a M12 de todas as linhas do CRD"
                  />
                </button>

                {isOpen && (
                  <div className="overflow-auto bg-slate-50/40 border-t border-slate-100">
                    <table className="w-full text-left border-collapse min-w-[1500px]">
                      <thead>
                        <tr className="bg-slate-100/70">
                          <th className="sticky left-0 z-20 bg-slate-100/90 px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Grupo</th>
                          <th className="sticky left-[120px] z-20 bg-slate-100/90 px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Detalhado</th>
                          {monthHeaders.map((month) => (
                            <th key={`${crdGroup.crdName}-${month}`} className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">
                              {month}
                            </th>
                          ))}
                          <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {crdGroup.rows.map((row, rowIndex) => (
                          <tr
                            key={row.id}
                            className={
                              rowIndex % 2 === 0
                                ? "bg-white hover:bg-slate-50 transition-colors"
                                : "bg-slate-200/60 hover:bg-slate-200 transition-colors"
                            }
                          >
                            <td className={`sticky left-0 z-10 px-4 py-3 text-xs text-slate-900 min-w-[120px] ${rowIndex % 2 === 0 ? 'bg-white' : 'bg-slate-200/70'}`}>{row.grupo}</td>
                            <td className={`sticky left-[120px] z-10 px-4 py-3 text-sm text-slate-900 min-w-[260px] ${rowIndex % 2 === 0 ? 'bg-white' : 'bg-slate-200/70'}`}>{row.detalhado}</td>
                            {row.months.map((value, index) => {
                              const isEditing = editingCell?.rowId === row.id && editingCell?.monthIndex === index;
                              return (
                                <td key={`${row.id}-${index}`} className="px-4 py-3 text-xs text-right text-slate-900">
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
                                      className="w-28 px-2 py-1 text-right bg-white border border-emerald-300 rounded-md"
                                    />
                                  ) : (
                                    <button
                                      onClick={() => startCellEdit(row.id, index, value)}
                                      className="min-w-20 px-2 py-1 rounded hover:bg-emerald-50 transition-colors"
                                      title="Clique para editar"
                                    >
                                      <ValueTrace
                                        className="text-xs text-slate-900"
                                        displayValue={formatCurrency(value || 0)}
                                        source={`CRD ${row.crd} / Grupo ${row.grupo} / ${row.detalhado}`}
                                        calculation={`Valor do mês ${index + 1} (modelo atual usa previsto_mes do CRD)`}
                                      />
                                    </button>
                                  )}
                                </td>
                              );
                            })}
                            <td className="px-4 py-3 text-xs text-right font-bold text-slate-900">
                              <ValueTrace
                                className="text-xs text-right font-bold text-slate-900"
                                displayValue={formatCurrency(row.total || 0)}
                                source={`Linha ${row.detalhado}`}
                                calculation="Soma dos meses M1 a M12 da linha"
                              />
                            </td>
                          </tr>
                        ))}
                        <tr className="bg-slate-100 border-t border-slate-300">
                          <td className="sticky left-0 z-10 bg-white px-4 py-3 text-xs font-bold text-slate-700 min-w-[380px]" colSpan={2}>
                            Total CRD {crdGroup.crdName}
                          </td>
                          {crdGroup.months.map((value, index) => (
                            <td key={`subtotal-${crdGroup.crdName}-${index}`} className="px-4 py-3 text-xs text-right font-bold text-slate-800">
                              <ValueTrace
                                className="text-xs text-right font-bold text-slate-800"
                                displayValue={formatCurrency(value || 0)}
                                source={`Subtotal do CRD ${crdGroup.crdName}`}
                                calculation={`Soma do mês ${index + 1} para todas as linhas do CRD`}
                              />
                            </td>
                          ))}
                          <td className="px-4 py-3 text-xs text-right font-extrabold text-slate-900">
                            <ValueTrace
                              className="text-xs text-right font-extrabold text-slate-900"
                              displayValue={formatCurrency(crdGroup.total || 0)}
                              source={`Subtotal total do CRD ${crdGroup.crdName}`}
                              calculation="Soma de todos os meses e linhas dentro do CRD"
                            />
                          </td>
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

      <div className="bg-white rounded-2xl border border-emerald-100 shadow-sm overflow-auto">
        <table className="w-full text-left border-collapse min-w-[1200px]">
          <tbody>
            <tr className="bg-emerald-50/50 border-t border-emerald-100">
              <td className="px-4 py-3 text-xs font-bold text-emerald-800" colSpan={2}>
                Total geral por mês ({data?.year || currentYear})
              </td>
              {(data?.totals?.months || Array.from({ length: 12 }, () => 0)).map((value, index) => (
                <td key={`total-${index}`} className="px-4 py-3 text-xs text-right font-bold text-emerald-800">
                  <ValueTrace
                    className="text-xs text-right font-bold text-emerald-800"
                    displayValue={formatCurrency(value || 0)}
                    source="Total geral da Síntase"
                    calculation={`Soma do mês ${index + 1} considerando todos os CRDs`}
                  />
                </td>
              ))}
              <td className="px-4 py-3 text-xs text-right font-extrabold text-emerald-900">
                <ValueTrace
                  className="text-xs text-right font-extrabold text-emerald-900"
                  displayValue={formatCurrency(data?.totals?.total || 0)}
                  source="Total geral da Síntase"
                  calculation="Soma de M1..M12 para todos os CRDs"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};
