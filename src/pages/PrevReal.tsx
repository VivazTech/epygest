import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCcw, ChevronDown, ChevronRight, Filter, List } from 'lucide-react';

type UsoConsumoSubgrupo = {
  id: number;
  tipo: string;
  grupo: string;
  codigo: string;
  nome: string;
};

const USO_CONSUMO_CRD_NAME = 'USO E CONSUMO (SEM CRD)';
import { cn, formatCurrency } from '../lib/utils';
import { ValueTrace } from '../components/ValueTrace';
import { valueTrace } from '../lib/valueTraceMeta';
import { useSearch } from '../context/SearchContext';
import { matchesSearch } from '../lib/search';
import { isSharedCrdCode } from '../lib/sharedCrds';

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

const monthHeaders = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

type PrevRealRow = PrevRealApiResponse['rows'][number];
type GroupByField = 'sector' | 'grupo' | 'detalhado';

const GROUP_BY_LABELS: Record<GroupByField, string> = {
  sector: 'Setor (cadastro)',
  grupo: 'Código CRD (coluna Grupo)',
  detalhado: 'Nome CRD (coluna Detalhado)',
};

const GROUP_HEADER_LABELS: Record<GroupByField, string> = {
  sector: 'Setor',
  grupo: 'Grupo CRD',
  detalhado: 'CRD',
};

const getGroupKey = (row: PrevRealRow, groupBy: GroupByField) => {
  if (groupBy === 'grupo') return String(row.grupo || '').trim() || '—';
  if (groupBy === 'detalhado') return String(row.detalhado || '').trim() || '—';
  return String(row.crd || '').trim() || 'Sem setor';
};

const getCrdKey = (row: PrevRealRow) =>
  `${String(row.grupo || '').trim()}|${String(row.detalhado || '').trim()}`;

const getCrdLabel = (row: PrevRealRow) => {
  const code = String(row.grupo || '').trim();
  const name = String(row.detalhado || '').trim();
  if (code && name) return `${code} — ${name}`;
  return name || code || '—';
};

const VIEW_CONFIG_KEY = 'prevReal:viewConfig:v1';

export const PrevRealPage: React.FC = () => {
  const { query } = useSearch();
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(String(currentYear));
  const [groupBy, setGroupBy] = useState<GroupByField>(() => {
    try {
      const saved = localStorage.getItem(VIEW_CONFIG_KEY);
      if (saved) return (JSON.parse(saved).groupBy as GroupByField) || 'sector';
    } catch { /* ignore */ }
    return 'sector';
  });
  const [selectedGroups, setSelectedGroups] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(VIEW_CONFIG_KEY);
      if (saved) return Array.isArray(JSON.parse(saved).selectedGroups) ? JSON.parse(saved).selectedGroups : [];
    } catch { /* ignore */ }
    return [];
  });
  const [selectedCrds, setSelectedCrds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(VIEW_CONFIG_KEY);
      if (saved) return Array.isArray(JSON.parse(saved).selectedCrds) ? JSON.parse(saved).selectedCrds : [];
    } catch { /* ignore */ }
    return [];
  });
  const [showViewFilters, setShowViewFilters] = useState(false);
  const [crdFilter, setCrdFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<PrevRealApiResponse | null>(null);
  const [expandedCrds, setExpandedCrds] = useState<Set<string>>(new Set());
  const [savingCell, setSavingCell] = useState(false);
  const [editingCell, setEditingCell] = useState<{ rowId: number; monthIndex: number } | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [userRole, setUserRole] = useState<string>('viewer');
  const [usoConsumoSubgrupos, setUsoConsumoSubgrupos] = useState<UsoConsumoSubgrupo[]>([]);
  const [expandedSubgrupos, setExpandedSubgrupos] = useState<Set<number>>(new Set());
  const [allowedSectorNames, setAllowedSectorNames] = useState<string[]>([]);

  const loadData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('year', year);
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
    const loadUserScope = async () => {
      try {
        const raw = localStorage.getItem('user');
        if (!raw) return;
        const parsed = JSON.parse(raw);
        setUserRole(String(parsed?.role || 'viewer'));

        const users = await fetch('/api/users').then((res) => res.json()).catch(() => []);
        const freshUser = (Array.isArray(users) ? users : []).find((u: any) => String(u.id) === String(parsed?.id));
        const sourceNames = Array.isArray(freshUser?.sector_names)
          ? freshUser.sector_names
          : (Array.isArray(parsed?.sector_names) ? parsed.sector_names : []);
        const names = Array.from(
          new Set<string>(
            sourceNames
              .map((name: any) => String(name || '').trim())
              .filter((name: string) => Boolean(name))
          )
        );
        setAllowedSectorNames(names);
      } catch {
        // ignora erro de parse
      }
    };

    loadUserScope();
    loadData();
    fetch('/api/uso-consumo-subgrupos')
      .then((r) => r.json())
      .then((d) => setUsoConsumoSubgrupos(Array.isArray(d) ? d : []))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    localStorage.setItem(
      VIEW_CONFIG_KEY,
      JSON.stringify({ groupBy, selectedGroups, selectedCrds })
    );
  }, [groupBy, selectedGroups, selectedCrds]);

  const canConfigureView =
    userRole === 'admin' || userRole === 'finance' || userRole === 'controle';

  const toggleSelection = (value: string, selected: string[], setter: (next: string[]) => void) => {
    setter(
      selected.includes(value)
        ? selected.filter((item) => item !== value)
        : [...selected, value]
    );
  };

  const visibleRows = useMemo(() => {
    const allRows = data?.rows || [];
    const scoped =
      userRole !== 'manager'
        ? allRows
        : allRows.filter(
            (row) =>
              allowedSectorNames.includes(String(row.crd || '').trim()) ||
              isSharedCrdCode(row.grupo)
          );
    if (!query.trim()) return scoped;
    return scoped.filter((row) => matchesSearch(query, row.crd, row.grupo, row.detalhado));
  }, [data, userRole, allowedSectorNames, query]);

  const managerSectorOptions = useMemo(() => {
    const keys = new Set(
      (data?.rows || [])
        .filter(
          (row) =>
            allowedSectorNames.includes(String(row.crd || '').trim()) ||
            isSharedCrdCode(row.grupo)
        )
        .map((row) => String(row.crd || '').trim())
        .filter(Boolean)
    );
    return Array.from(keys).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [data, allowedSectorNames]);

  const groupOptions = useMemo(() => {
    const keys = new Set(visibleRows.map((row) => getGroupKey(row, groupBy)));
    return Array.from(keys).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [visibleRows, groupBy]);

  const crdOptionsDetailed = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of visibleRows) {
      const key = getCrdKey(row);
      if (!map.has(key)) map.set(key, getCrdLabel(row));
    }
    return Array.from(map.entries())
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  }, [visibleRows]);

  const filteredRows = useMemo(() => {
    let rows = visibleRows;
    if (canConfigureView && selectedGroups.length > 0) {
      const groupSet = new Set(selectedGroups);
      rows = rows.filter((row) => groupSet.has(getGroupKey(row, groupBy)));
    }
    if (canConfigureView && selectedCrds.length > 0) {
      const crdSet = new Set(selectedCrds);
      rows = rows.filter((row) => crdSet.has(getCrdKey(row)));
    }
    if (!canConfigureView && crdFilter.trim()) {
      const term = crdFilter.trim().toLowerCase();
      rows = rows.filter(
        (row) =>
          getGroupKey(row, 'sector').toLowerCase() === term ||
          getGroupKey(row, 'sector').toLowerCase().includes(term)
      );
    }
    return rows;
  }, [visibleRows, canConfigureView, selectedGroups, selectedCrds, groupBy, crdFilter]);

  const visibleTotals = useMemo(() => {
    const months = Array.from({ length: 12 }, (_, idx) => ({
      previsto: filteredRows.reduce((sum, row) => sum + (row.months[idx]?.previsto || 0), 0),
      realizado: filteredRows.reduce((sum, row) => sum + (row.months[idx]?.realizado || 0), 0),
      diferenca: filteredRows.reduce((sum, row) => sum + (row.months[idx]?.diferenca || 0), 0),
    }));
    return {
      months,
      previsto: months.reduce((sum, m) => sum + m.previsto, 0),
      realizado: months.reduce((sum, m) => sum + m.realizado, 0),
      diferenca: months.reduce((sum, m) => sum + m.diferenca, 0),
    };
  }, [filteredRows]);

  const rowsByGroup = useMemo(() => {
    const grouped = new Map<string, PrevRealRow[]>();
    for (const row of filteredRows) {
      const key = getGroupKey(row, groupBy);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(row);
    }
    return Array.from(grouped.entries()).map(([groupName, rows]) => {
      const months = Array.from({ length: 12 }, (_, idx) => ({
        previsto: rows.reduce((sum, row) => sum + (row.months[idx]?.previsto || 0), 0),
        realizado: rows.reduce((sum, row) => sum + (row.months[idx]?.realizado || 0), 0),
        diferenca: rows.reduce((sum, row) => sum + (row.months[idx]?.diferenca || 0), 0),
      }));
      return {
        groupName,
        rows,
        months,
        total_previsto: months.reduce((sum, m) => sum + m.previsto, 0),
        total_realizado: months.reduce((sum, m) => sum + m.realizado, 0),
        total_diferenca: months.reduce((sum, m) => sum + m.diferenca, 0),
      };
    });
  }, [filteredRows, groupBy]);

  useEffect(() => {
    if (!rowsByGroup.length) {
      setExpandedCrds(new Set());
      return;
    }
    if (query.trim()) {
      setExpandedCrds(new Set(rowsByGroup.map((item) => item.groupName)));
      return;
    }
    if (canConfigureView && (selectedGroups.length > 0 || selectedCrds.length > 0)) {
      setExpandedCrds(new Set(rowsByGroup.map((item) => item.groupName)));
      return;
    }
    if (!canConfigureView && crdFilter.trim()) {
      const filteredName = crdFilter.trim().toLowerCase();
      const match = rowsByGroup.find((item) => item.groupName.toLowerCase() === filteredName);
      if (match) setExpandedCrds(new Set([match.groupName]));
      return;
    }
    setExpandedCrds(new Set());
  }, [rowsByGroup, crdFilter, query, canConfigureView, selectedGroups, selectedCrds]);

  const traceYear = data?.year ?? Number(year);
  const occPct = data?.occupancy_percent ?? 100;

  const toggleGroup = (groupName: string) => {
    setExpandedCrds((prev) => {
      const next = new Set(prev);
      if (next.has(groupName)) next.delete(groupName);
      else next.add(groupName);
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
        <h2 className="text-2xl font-bold text-slate-900">Prev x Real Diario</h2>
        <p className="text-sm text-slate-500">
          Visão por CRD com colunas mensais de Previsto, Realizado e Diferença, agrupadas por setor.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          {userRole === 'manager' && (
            <select
              value={crdFilter}
              onChange={(e) => setCrdFilter(e.target.value)}
              className="w-full md:w-80 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
            >
              <option value="">Todos os setores</option>
              {managerSectorOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          )}
          {canConfigureView && (
            <button
              type="button"
              onClick={() => setShowViewFilters((prev) => !prev)}
              className={cn(
                'inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl border transition-colors',
                showViewFilters
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              )}
            >
              <Filter className="w-4 h-4" />
              Definir Setor / CRD
            </button>
          )}
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

        {canConfigureView && showViewFilters && (
          <div className="border-t border-slate-100 pt-4 space-y-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                Agrupar visualmente por
              </p>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(GROUP_BY_LABELS) as GroupByField[]).map((field) => (
                  <button
                    key={field}
                    type="button"
                    onClick={() => {
                      setGroupBy(field);
                      setSelectedGroups([]);
                    }}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors',
                      groupBy === field
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    )}
                  >
                    {GROUP_BY_LABELS[field]}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-slate-400">
                Escolha qual coluna representa o nível de <b>Setor</b> no accordion. As linhas internas continuam com Grupo (código) e Detalhado (nome do CRD).
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Filtrar {GROUP_HEADER_LABELS[groupBy]}s
                </p>
                {selectedGroups.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedGroups([])}
                    className="text-xs font-semibold text-slate-500 hover:text-slate-700"
                  >
                    Limpar
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                {groupOptions.map((option) => {
                  const active = selectedGroups.length === 0 || selectedGroups.includes(option);
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => toggleSelection(option, selectedGroups, setSelectedGroups)}
                      className={cn(
                        'px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors',
                        active
                          ? 'bg-blue-50 text-blue-800 border-blue-200'
                          : 'bg-white text-slate-400 border-slate-200 line-through'
                      )}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                Nenhum selecionado = mostra todos. Clique para incluir ou excluir da visualização.
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Filtrar CRDs (código + nome)
                </p>
                {selectedCrds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedCrds([])}
                    className="text-xs font-semibold text-slate-500 hover:text-slate-700"
                  >
                    Limpar
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                {crdOptionsDetailed.map(({ key, label }) => {
                  const active = selectedCrds.length === 0 || selectedCrds.includes(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggleSelection(key, selectedCrds, setSelectedCrds)}
                      className={cn(
                        'px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors text-left',
                        active
                          ? 'bg-violet-50 text-violet-800 border-violet-200'
                          : 'bg-white text-slate-400 border-slate-200 line-through'
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="divide-y divide-slate-100">
          {rowsByGroup.map((group) => {
            const isOpen = expandedCrds.has(group.groupName);
            const groupLabel = GROUP_HEADER_LABELS[groupBy];
            return (
              <div key={group.groupName}>
                <button
                  onClick={() => toggleGroup(group.groupName)}
                  className="w-full flex items-center gap-3 px-5 py-4 hover:bg-slate-50 transition-colors text-left"
                >
                  {isOpen ? (
                    <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
                  )}
                  <span className="text-sm font-bold text-slate-900">{groupLabel} {group.groupName}</span>
                  <span className="text-xs text-slate-500">({group.rows.length} linha(s))</span>
                  <span className="ml-auto text-xs font-bold text-slate-700">
                    Dif. total:{' '}
                    <ValueTrace
                      className="text-xs font-bold text-slate-700"
                      displayValue={formatCurrency(group.total_diferenca)}
                      meta={valueTrace.prevReal.totalDiferenca(`Diferença total — ${groupLabel} ${group.groupName}`)}
                    />
                  </span>
                </button>

                {isOpen && (
                  <div className="table-scroll-panel bg-slate-50/40 border-t border-slate-100">
                    <table className="w-full text-left border-collapse min-w-[2800px]">
                      <thead>
                        <tr className="bg-slate-100/70">
                          <th rowSpan={2} className="th-sticky-corner px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest min-w-[120px]">Grupo</th>
                          <th rowSpan={2} className="th-sticky-corner-2 px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest min-w-[260px]">Detalhado</th>
                          {monthHeaders.map((month) => (
                            <th key={`${group.groupName}-${month}`} colSpan={3} className="th-sticky-top px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center border-l border-slate-200">
                              {month}
                            </th>
                          ))}
                          <th rowSpan={2} className="th-sticky-top px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Total Prev.</th>
                          <th rowSpan={2} className="th-sticky-top px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Total Real.</th>
                          <th rowSpan={2} className="th-sticky-top px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Total Dif.</th>
                        </tr>
                        <tr className="bg-slate-100/70">
                          {monthHeaders.map((month) => (
                            <React.Fragment key={`${group.groupName}-${month}-sub`}>
                              <th className="th-sticky-top-sub px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right border-l border-slate-200">Prev.</th>
                              <th className="th-sticky-top-sub px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Real.</th>
                              <th className="th-sticky-top-sub px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Dif.</th>
                            </React.Fragment>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {group.rows.map((row, rowIndex) => {
                          const isUsoConsumo = row.detalhado.trim().toUpperCase() === USO_CONSUMO_CRD_NAME;
                          const subgruposOpen = expandedSubgrupos.has(row.id);
                          const rowBg = rowIndex % 2 === 0;
                          return (
                          <React.Fragment key={row.id}>
                          <tr
                            className={rowBg ? "bg-white/70 hover:bg-white transition-colors" : "bg-slate-50/70 hover:bg-slate-100/70 transition-colors"}
                          >
                            <td className={`sticky left-0 z-20 px-4 py-3 text-xs text-slate-700 min-w-[120px] ${rowBg ? 'bg-white' : 'bg-slate-50'}`}>{row.grupo}</td>
                            <td className={`sticky left-[120px] z-20 px-4 py-3 text-sm min-w-[260px] ${rowBg ? 'bg-white' : 'bg-slate-50'} ${isUsoConsumo ? 'text-slate-900 font-semibold' : 'text-slate-700'}`}>
                              <span className="flex items-center gap-2">
                                {row.detalhado}
                                {isUsoConsumo && usoConsumoSubgrupos.length > 0 && (
                                  <button
                                    onClick={() => setExpandedSubgrupos((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(row.id)) next.delete(row.id); else next.add(row.id);
                                      return next;
                                    })}
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-100 hover:bg-blue-100 transition-colors shrink-0"
                                    title="Ver subgrupos"
                                  >
                                    <List className="w-3 h-3" />
                                    {subgruposOpen ? 'Ocultar' : `${usoConsumoSubgrupos.length} subgrupos`}
                                  </button>
                                )}
                              </span>
                            </td>
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
                                      <ValueTrace
                                        className="text-xs text-slate-700"
                                        displayValue={formatCurrency(m.previsto || 0)}
                                        meta={valueTrace.prevReal.previsto(row.grupo, row.detalhado, idx + 1, traceYear, occPct)}
                                      />
                                    </button>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-xs text-right text-slate-700">
                                  <ValueTrace
                                    className="text-xs text-slate-700"
                                    displayValue={formatCurrency(m.realizado || 0)}
                                    meta={valueTrace.prevReal.realizado(row.grupo, row.detalhado, idx + 1, traceYear)}
                                  />
                                </td>
                                <td className={`px-3 py-2 text-xs text-right font-semibold ${(m.diferenca || 0) < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                                  <ValueTrace
                                    className={`text-xs font-semibold ${(m.diferenca || 0) < 0 ? 'text-red-600' : 'text-emerald-700'}`}
                                    displayValue={formatCurrency(m.diferenca || 0)}
                                    meta={valueTrace.prevReal.diferenca(row.grupo, row.detalhado, idx + 1)}
                                  />
                                </td>
                              </React.Fragment>
                            ))}
                            <td className="px-4 py-3 text-xs text-right font-bold text-slate-800">
                              <ValueTrace
                                className="text-xs font-bold text-slate-800"
                                displayValue={formatCurrency(row.total_previsto || 0)}
                                meta={valueTrace.prevReal.totalPrevisto(`Total previsto — ${row.detalhado}`)}
                              />
                            </td>
                            <td className="px-4 py-3 text-xs text-right font-bold text-slate-800">
                              <ValueTrace
                                className="text-xs font-bold text-slate-800"
                                displayValue={formatCurrency(row.total_realizado || 0)}
                                meta={valueTrace.prevReal.totalRealizado(`Total realizado — ${row.detalhado}`)}
                              />
                            </td>
                            <td className={`px-4 py-3 text-xs text-right font-extrabold ${(row.total_diferenca || 0) < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                              <ValueTrace
                                className={`text-xs font-extrabold ${(row.total_diferenca || 0) < 0 ? 'text-red-700' : 'text-emerald-700'}`}
                                displayValue={formatCurrency(row.total_diferenca || 0)}
                                meta={valueTrace.prevReal.totalDiferenca(`Total diferença — ${row.detalhado}`)}
                              />
                            </td>
                          </tr>
                          {/* Subgrupos de USO E CONSUMO (SEM CRD) */}
                          {isUsoConsumo && subgruposOpen && usoConsumoSubgrupos.length > 0 && (
                            <tr>
                              <td colSpan={3 + 12 * 3} className="p-0 bg-blue-50/40 border-t border-blue-100">
                                <div className="px-6 py-3">
                                  <p className="text-[10px] font-bold uppercase tracking-widest text-blue-700 mb-2">
                                    Subgrupos — {USO_CONSUMO_CRD_NAME}
                                  </p>
                                  <table className="w-full text-left border-collapse text-xs">
                                    <thead>
                                      <tr className="border-b border-blue-100">
                                        <th className="px-2 py-1 text-[10px] font-bold text-slate-500 uppercase tracking-widest w-8">Tipo</th>
                                        <th className="px-2 py-1 text-[10px] font-bold text-slate-500 uppercase tracking-widest w-36">Grupo</th>
                                        <th className="px-2 py-1 text-[10px] font-bold text-slate-500 uppercase tracking-widest w-36">Código</th>
                                        <th className="px-2 py-1 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Nome</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-blue-50">
                                      {usoConsumoSubgrupos.map((sg) => (
                                        <tr key={sg.id} className="hover:bg-blue-50/60">
                                          <td className="px-2 py-1 text-slate-500">{sg.tipo}</td>
                                          <td className="px-2 py-1 text-slate-600">{sg.grupo}</td>
                                          <td className="px-2 py-1 text-slate-600">{sg.codigo}</td>
                                          <td className="px-2 py-1 text-slate-800 font-medium">{sg.nome}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </td>
                            </tr>
                          )}
                          </React.Fragment>
                          );
                        })}
                        <tr className="bg-slate-100 border-t border-slate-300">
                          <td className="sticky left-0 z-20 bg-slate-100 px-4 py-3 text-xs font-bold text-slate-700 min-w-[120px]" colSpan={2}>
                            Total {groupLabel} {group.groupName}
                          </td>
                          {group.months.map((m, idx) => (
                            <React.Fragment key={`subtotal-${group.groupName}-${idx}`}>
                              <td className="px-3 py-2 text-xs text-right font-bold text-slate-800 border-l border-slate-200">
                                <ValueTrace
                                  className="text-xs font-bold text-slate-800"
                                  displayValue={formatCurrency(m.previsto || 0)}
                                  meta={valueTrace.prevReal.totalPrevisto(`Previsto ${groupLabel} ${group.groupName} — M${idx + 1}`)}
                                />
                              </td>
                              <td className="px-3 py-2 text-xs text-right font-bold text-slate-800">
                                <ValueTrace
                                  className="text-xs font-bold text-slate-800"
                                  displayValue={formatCurrency(m.realizado || 0)}
                                  meta={valueTrace.prevReal.totalRealizado(`Realizado ${groupLabel} ${group.groupName} — M${idx + 1}`)}
                                />
                              </td>
                              <td className={`px-3 py-2 text-xs text-right font-extrabold ${(m.diferenca || 0) < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                                <ValueTrace
                                  className={`text-xs font-extrabold ${(m.diferenca || 0) < 0 ? 'text-red-700' : 'text-emerald-700'}`}
                                  displayValue={formatCurrency(m.diferenca || 0)}
                                  meta={valueTrace.prevReal.totalDiferenca(`Diferença ${groupLabel} ${group.groupName} — M${idx + 1}`)}
                                />
                              </td>
                            </React.Fragment>
                          ))}
                          <td className="px-4 py-3 text-xs text-right font-bold text-slate-900">
                            <ValueTrace
                              className="text-xs font-bold text-slate-900"
                              displayValue={formatCurrency(group.total_previsto || 0)}
                              meta={valueTrace.prevReal.totalPrevisto(`Total previsto — ${groupLabel} ${group.groupName}`)}
                            />
                          </td>
                          <td className="px-4 py-3 text-xs text-right font-bold text-slate-900">
                            <ValueTrace
                              className="text-xs font-bold text-slate-900"
                              displayValue={formatCurrency(group.total_realizado || 0)}
                              meta={valueTrace.prevReal.totalRealizado(`Total realizado — ${groupLabel} ${group.groupName}`)}
                            />
                          </td>
                          <td className={`px-4 py-3 text-xs text-right font-extrabold ${(group.total_diferenca || 0) < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                            <ValueTrace
                              className={`text-xs font-extrabold ${(group.total_diferenca || 0) < 0 ? 'text-red-700' : 'text-emerald-700'}`}
                              displayValue={formatCurrency(group.total_diferenca || 0)}
                              meta={valueTrace.prevReal.totalDiferenca(`Total diferença — ${groupLabel} ${group.groupName}`)}
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
              {(visibleTotals.months || Array.from({ length: 12 }, () => ({ previsto: 0, realizado: 0, diferenca: 0 }))).map((m, idx) => (
                <React.Fragment key={`tot-${idx}`}>
                  <td className="px-3 py-2 text-xs text-right text-emerald-800 border-l border-emerald-100">
                    <ValueTrace
                      className="text-xs text-emerald-800"
                      displayValue={formatCurrency(m.previsto || 0)}
                      meta={valueTrace.prevReal.totalPrevisto(`Total geral previsto — M${idx + 1}/${traceYear}`)}
                    />
                  </td>
                  <td className="px-3 py-2 text-xs text-right text-emerald-800">
                    <ValueTrace
                      className="text-xs text-emerald-800"
                      displayValue={formatCurrency(m.realizado || 0)}
                      meta={valueTrace.prevReal.totalRealizado(`Total geral realizado — M${idx + 1}/${traceYear}`)}
                    />
                  </td>
                  <td className={`px-3 py-2 text-xs text-right font-bold ${(m.diferenca || 0) < 0 ? 'text-red-700' : 'text-emerald-800'}`}>
                    <ValueTrace
                      className={`text-xs font-bold ${(m.diferenca || 0) < 0 ? 'text-red-700' : 'text-emerald-800'}`}
                      displayValue={formatCurrency(m.diferenca || 0)}
                      meta={valueTrace.prevReal.totalDiferenca(`Total geral diferença — M${idx + 1}/${traceYear}`)}
                    />
                  </td>
                </React.Fragment>
              ))}
              <td className="px-4 py-3 text-xs text-right font-bold text-emerald-900">
                <ValueTrace
                  className="text-xs font-bold text-emerald-900"
                  displayValue={formatCurrency(visibleTotals.previsto || 0)}
                  meta={valueTrace.prevReal.totalPrevisto(`Total anual previsto — ${traceYear}`)}
                />
              </td>
              <td className="px-4 py-3 text-xs text-right font-bold text-emerald-900">
                <ValueTrace
                  className="text-xs font-bold text-emerald-900"
                  displayValue={formatCurrency(visibleTotals.realizado || 0)}
                  meta={valueTrace.prevReal.totalRealizado(`Total anual realizado — ${traceYear}`)}
                />
              </td>
              <td className={`px-4 py-3 text-xs text-right font-extrabold ${(visibleTotals.diferenca || 0) < 0 ? 'text-red-700' : 'text-emerald-900'}`}>
                <ValueTrace
                  className={`text-xs font-extrabold ${(visibleTotals.diferenca || 0) < 0 ? 'text-red-700' : 'text-emerald-900'}`}
                  displayValue={formatCurrency(visibleTotals.diferenca || 0)}
                  meta={valueTrace.prevReal.totalDiferenca(`Total anual diferença — ${traceYear}`)}
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};
