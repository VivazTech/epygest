import React, { useEffect, useMemo, useState } from 'react';
import { Calendar, ChevronDown, ChevronRight } from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import { useSearch } from '../context/SearchContext';
import { filterTreeByLabel } from '../lib/search';
import { ValueTrace } from '../components/ValueTrace';
import { valueTrace } from '../lib/valueTraceMeta';
import dreData from '../data/dre2026.json';

// Dados-base gerados da aba "Prev x Real 2026" (linhas 52-330) pelo script
// scripts/import-dre-prev-real.cjs. Edições manuais por célula ficam em
// dre_cell_edits (Supabase) e sobrepõem o valor importado.

type MonthCell = {
  prev: number | null;
  real: number | null;
  dif: number | null;
};

interface DRERow {
  id: string;
  row: number;
  label: string;
  level: number;
  isHeader?: boolean;
  isTotal?: boolean;
  values: MonthCell[];
  children?: DRERow[];
}

type CellEdit = {
  row_key: number;
  month: number;
  field: 'prev' | 'real';
  value: number;
  user_name: string | null;
  updated_at: string;
};

type EditingCell = { row: number; month: number; field: 'prev' | 'real' };

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const dreRows = dreData.rows as DRERow[];
const dreYear = dreData.year;
const dreSource = dreData.source;

const editKey = (row: number, month: number, field: 'prev' | 'real') => `${row}:${month}:${field}`;

const RESULTADO_FOOTER_IDS = [
  { id: 'l52-receita-bruta', short: 'Receita Bruta', accent: 'emerald' as const },
  { id: 'l77-receita-liquida', short: 'Receita Líquida', accent: 'teal' as const },
  { id: 'l81-resultado-bruto', short: 'Resultado Bruto', accent: 'sky' as const },
  { id: 'l83-despesas-totais', short: 'Despesas Totais', accent: 'amber' as const },
  { id: 'l309-resultado-operacional', short: 'Resultado Operacional', accent: 'brand' as const },
  { id: 'resultado-liquido', short: 'Resultado Líquido', accent: 'brand' as const },
];

const LIQUIDO_LABEL = '(=) Resultado Líquido';

const findDreRow = (rows: DRERow[], id: string): DRERow | null => {
  for (const row of rows) {
    if (row.id === id) return row;
    if (row.children?.length) {
      const found = findDreRow(row.children, id);
      if (found) return found;
    }
  }
  return null;
};

const formatWhen = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

export const DREPage: React.FC = () => {
  const { query } = useSearch();
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const row of dreRows) {
      if (row.children?.length) initial[row.id] = true;
    }
    return initial;
  });
  const [edits, setEdits] = useState<Record<string, CellEdit>>({});
  const [editsError, setEditsError] = useState('');
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [savingCell, setSavingCell] = useState(false);
  /** Índices 0–11 dos meses visíveis. Vazio = todos. */
  const [selectedMonths, setSelectedMonths] = useState<number[]>(() =>
    Array.from({ length: 12 }, (_, i) => i)
  );
  // Análises AV/AH (opcionais, como na versão anterior do DRE); preferência fica salva no navegador.
  const [showAV, setShowAV] = useState(() => {
    try { return localStorage.getItem('dre:show_av') === '1'; } catch { return false; }
  });
  const [showAH, setShowAH] = useState(() => {
    try { return localStorage.getItem('dre:show_ah') === '1'; } catch { return false; }
  });

  const toggleAV = () => {
    setShowAV((v) => {
      try { localStorage.setItem('dre:show_av', v ? '0' : '1'); } catch { /* ignore */ }
      return !v;
    });
  };
  const toggleAH = () => {
    setShowAH((v) => {
      try { localStorage.setItem('dre:show_ah', v ? '0' : '1'); } catch { /* ignore */ }
      return !v;
    });
  };

  const visibleMonths = useMemo(() => {
    const set = new Set(selectedMonths);
    const months = MESES.map((_, i) => i).filter((i) => set.has(i));
    return months.length ? months : MESES.map((_, i) => i);
  }, [selectedMonths]);

  const allMonthsSelected = visibleMonths.length === 12;

  const toggleMonth = (monthIndex: number) => {
    setSelectedMonths((prev) => {
      const set = new Set(prev);
      if (set.has(monthIndex)) {
        if (set.size <= 1) return prev; // mantém ao menos um mês
        set.delete(monthIndex);
      } else {
        set.add(monthIndex);
      }
      return Array.from(set).sort((a, b) => a - b);
    });
  };

  /** Duplo clique: fica só o mês clicado. */
  const soloMonth = (monthIndex: number) => {
    setSelectedMonths([monthIndex]);
  };

  const selectAllMonths = () => setSelectedMonths(Array.from({ length: 12 }, (_, i) => i));

  const loadEdits = async () => {
    try {
      const res = await fetch(`/api/dre/edits?year=${dreYear}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Falha ao carregar edições.');
      const map: Record<string, CellEdit> = {};
      for (const e of (json.edits ?? []) as CellEdit[]) {
        map[editKey(e.row_key, e.month, e.field)] = e;
      }
      setEdits(map);
      setEditsError('');
    } catch (err: any) {
      setEditsError(err?.message || 'Falha ao carregar edições manuais do DRE.');
    }
  };

  useEffect(() => {
    loadEdits();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredDreRows = useMemo(() => filterTreeByLabel(dreRows, query), [query]);

  useEffect(() => {
    if (!query.trim()) return;
    const next: Record<string, boolean> = {};
    const collect = (rows: DRERow[]) => {
      for (const row of rows) {
        if (row.children?.length) next[row.id] = true;
        if (row.children) collect(row.children);
      }
    };
    collect(filteredDreRows);
    setExpanded((prev) => ({ ...prev, ...next }));
  }, [query, filteredDreRows]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Valor efetivo da célula: edição manual (se houver) senão o importado.
  const effective = (row: DRERow, monthIndex: number): MonthCell => {
    const base = row.values[monthIndex];
    const prevEdit = edits[editKey(row.row, monthIndex + 1, 'prev')];
    const realEdit = edits[editKey(row.row, monthIndex + 1, 'real')];
    const prev = prevEdit ? prevEdit.value : base.prev;
    const real = realEdit ? realEdit.value : base.real;
    // Se alguma célula foi editada, a diferença é recalculada; senão vale a da planilha.
    const dif = prevEdit || realEdit
      ? (prev != null && real != null ? real - prev : null)
      : base.dif;
    return { prev, real, dif };
  };

  const totalOf = (row: DRERow, monthIndexes: number[] = visibleMonths): MonthCell => {
    let prev: number | null = null;
    let real: number | null = null;
    for (const m of monthIndexes) {
      const v = effective(row, m);
      if (v.prev != null) prev = (prev ?? 0) + v.prev;
      if (v.real != null) real = (real ?? 0) + v.real;
    }
    const dif = prev != null && real != null ? real - prev : null;
    return { prev, real, dif };
  };

  // Resultado Líquido = Resultado Operacional − Impostos s/ Resultado − Obras e Investimentos
  const resultadoOperacionalRow = useMemo(() => findDreRow(dreRows, 'l309-resultado-operacional'), []);
  const impostosResultadoRow = useMemo(() => findDreRow(dreRows, 'l311-impostos-s-resultado'), []);
  const obrasInvestimentosRow = useMemo(() => findDreRow(dreRows, 'l319-obras-e-investimentos'), []);

  const resultadoLiquidoOf = (monthIndex: number): MonthCell => {
    if (!resultadoOperacionalRow || !impostosResultadoRow || !obrasInvestimentosRow) {
      return { prev: null, real: null, dif: null };
    }
    const op = effective(resultadoOperacionalRow, monthIndex);
    const imp = effective(impostosResultadoRow, monthIndex);
    const obr = effective(obrasInvestimentosRow, monthIndex);
    const fieldOrNull = (a: number | null, b: number | null, c: number | null) => {
      if (a == null && b == null && c == null) return null;
      return (a ?? 0) - (b ?? 0) - (c ?? 0);
    };
    const prev = fieldOrNull(op.prev, imp.prev, obr.prev);
    const real = fieldOrNull(op.real, imp.real, obr.real);
    const dif = prev != null && real != null ? real - prev : null;
    return { prev, real, dif };
  };

  const resultadoLiquidoTotal = (monthIndexes: number[] = visibleMonths): MonthCell => {
    let prev: number | null = null;
    let real: number | null = null;
    for (const m of monthIndexes) {
      const v = resultadoLiquidoOf(m);
      if (v.prev != null) prev = (prev ?? 0) + v.prev;
      if (v.real != null) real = (real ?? 0) + v.real;
    }
    const dif = prev != null && real != null ? real - prev : null;
    return { prev, real, dif };
  };

  const showResultadoLiquido = Boolean(
    resultadoOperacionalRow && impostosResultadoRow && obrasInvestimentosRow
  );

  // ---- Análises AV/AH (sobre os dados importados + edições) ----
  type Analise = { pct: number | null; serie: 'Realizado' | 'Previsto' | null };

  // AV: |linha| ÷ |Receita Líquida do mês| × 100 (Realizado quando ambos têm; senão Previsto).
  // AV: quanto do Previsto a Diferença representa. O Previsto é o 100%
  // (ex.: previsto R$ 1.000 e realizado R$ 400 → diferença R$ 600 = 60%).
  const avFromCell = (cell: MonthCell): number | null => {
    if (cell.prev == null || cell.prev === 0 || cell.dif == null) return null;
    return (Math.abs(cell.dif) / Math.abs(cell.prev)) * 100;
  };

  const avOf = (row: DRERow, monthIndex: number): number | null =>
    avFromCell(effective(row, monthIndex));

  const avTotalOf = (row: DRERow): number | null => avFromCell(totalOf(row));

  // AH: variação % sobre o mês-calendário anterior (Realizado quando ambos têm; senão Previsto).
  const ahOf = (row: DRERow, monthIndex: number): Analise => {
    if (monthIndex === 0) return { pct: null, serie: null };
    const cur = effective(row, monthIndex);
    const ant = effective(row, monthIndex - 1);
    if (cur.real != null && ant.real != null && ant.real !== 0) {
      return { pct: ((cur.real - ant.real) / Math.abs(ant.real)) * 100, serie: 'Realizado' };
    }
    if (cur.prev != null && ant.prev != null && ant.prev !== 0) {
      return { pct: ((cur.prev - ant.prev) / Math.abs(ant.prev)) * 100, serie: 'Previsto' };
    }
    return { pct: null, serie: null };
  };

  // ---- Linhas de resultado: AV/AH com regra própria ----
  // AV = participação sobre uma base (a base é 100%); AH = |Diferença| ÷ |Previsto|.
  const receitaBrutaRow = useMemo(() => findDreRow(dreRows, 'l52-receita-bruta'), []);
  const receitaLiquidaRow = useMemo(() => findDreRow(dreRows, 'l77-receita-liquida'), []);

  // Base da AV de cada linha de resultado (por id da linha).
  const avBaseInfo = (rowId: string): { row: DRERow | null; label: string } | null => {
    switch (rowId) {
      case 'l77-receita-liquida': // Receita Líquida ÷ Receita Bruta
      case 'l309-resultado-operacional': // Resultado Operacional ÷ Receita Bruta
      case 'resultado-liquido': // Resultado Líquido ÷ Receita Bruta
        return { row: receitaBrutaRow, label: '(+) RECEITA BRUTA' };
      case 'l81-resultado-bruto': // Resultado Bruto ÷ Receita Líquida
        return { row: receitaLiquidaRow, label: '(=) RECEITA LÍQUIDA' };
      default:
        return null;
    }
  };

  // Razão |linha| ÷ |base| (Realizado quando ambos têm; senão Previsto).
  const ratioFromCells = (line: MonthCell, base: MonthCell): number | null => {
    if (line.real != null && base.real != null && base.real !== 0) {
      return (Math.abs(line.real) / Math.abs(base.real)) * 100;
    }
    if (line.prev != null && base.prev != null && base.prev !== 0) {
      return (Math.abs(line.prev) / Math.abs(base.prev)) * 100;
    }
    return null;
  };

  const monthColSpan = 3 + (showAV ? 1 : 0) + (showAH ? 1 : 0);

  const startCellEdit = (row: DRERow, monthIndex: number, field: 'prev' | 'real') => {
    const current = effective(row, monthIndex)[field];
    setEditingCell({ row: row.row, month: monthIndex + 1, field });
    setEditingValue(current == null ? '' : String(current));
  };

  const saveCellEdit = async (row: DRERow) => {
    if (savingCell || !editingCell) return;
    const raw = editingValue.trim();
    if (!raw) {
      setEditingCell(null);
      return;
    }
    const parsed = Number(raw.replace(/\./g, '').replace(',', '.'));
    const parsedSimple = Number(raw.replace(',', '.'));
    const value = Number.isFinite(parsedSimple) ? parsedSimple : parsed;
    if (!Number.isFinite(value)) {
      alert('Digite um valor numérico válido.');
      return;
    }
    setSavingCell(true);
    try {
      const res = await fetch('/api/dre/cell', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year: dreYear,
          row_key: editingCell.row,
          row_label: row.label,
          month: editingCell.month,
          field: editingCell.field,
          value,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(json.error || 'Erro ao salvar a célula.');
        return;
      }
      const saved = json.edit as CellEdit;
      setEdits((prev) => ({ ...prev, [editKey(saved.row_key, saved.month, saved.field)]: saved }));
      setEditingCell(null);
    } catch (err: any) {
      alert(err?.message || 'Erro inesperado ao salvar.');
    } finally {
      setSavingCell(false);
    }
  };

  const resultadosFooter = useMemo(() => {
    return RESULTADO_FOOTER_IDS.map((meta) => {
      const isLiquido = meta.id === 'resultado-liquido';
      const row = isLiquido ? null : findDreRow(dreRows, meta.id);
      if (!isLiquido && !row) return null;
      if (isLiquido && !showResultadoLiquido) return null;
      const total = isLiquido ? resultadoLiquidoTotal(visibleMonths) : totalOf(row!, visibleMonths);
      const atingimento =
        total.prev != null && total.prev !== 0 && total.real != null
          ? (total.real / total.prev) * 100
          : null;
      return { ...meta, row, total, atingimento };
    }).filter(Boolean) as Array<{
      id: string;
      short: string;
      accent: 'emerald' | 'teal' | 'sky' | 'amber' | 'brand';
      row: DRERow | null;
      total: MonthCell;
      atingimento: number | null;
    }>;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edits, visibleMonths, showResultadoLiquido]);

  const resultadoOperacional = resultadosFooter.find((r) => r.id === 'l309-resultado-operacional');
  const resultadoLiquidoFooter = resultadosFooter.find((r) => r.id === 'resultado-liquido');

  const renderEditableCell = (row: DRERow, monthIndex: number, field: 'prev' | 'real') => {
    const isEditing =
      editingCell?.row === row.row && editingCell.month === monthIndex + 1 && editingCell.field === field;
    if (isEditing) {
      return (
        <input
          autoFocus
          type="text"
          inputMode="decimal"
          value={editingValue}
          onChange={(e) => setEditingValue(e.target.value)}
          onBlur={() => saveCellEdit(row)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') saveCellEdit(row);
            if (e.key === 'Escape') setEditingCell(null);
          }}
          disabled={savingCell}
          className="w-24 px-2 py-1 text-right text-xs bg-white border border-emerald-300 rounded-md"
        />
      );
    }

    const cell = effective(row, monthIndex);
    const value = cell[field];
    const campo = field === 'prev' ? 'Previsto' : 'Realizado';
    const mes = `${MESES[monthIndex]}/${dreYear}`;
    const edit = edits[editKey(row.row, monthIndex + 1, field)];
    const base = row.values[monthIndex][field];
    const meta = edit
      ? valueTrace.dre.edited(
          row.label,
          campo,
          mes,
          edit.user_name || 'usuário não identificado',
          formatWhen(edit.updated_at),
          base == null ? '—' : formatCurrency(base)
        )
      : valueTrace.dre.imported(row.label, row.row, campo, mes, dreSource);

    return (
      <button
        onClick={() => startCellEdit(row, monthIndex, field)}
        className={cn('px-1 py-0.5 rounded hover:bg-emerald-50 transition-colors', edit && 'bg-amber-50/70')}
        title="Clique para editar"
      >
        <ValueTrace
          className={cn(
            'text-xs tabular-nums',
            field === 'real' && 'font-medium',
            value != null && value < 0 ? 'text-red-600' : field === 'real' ? 'text-slate-800' : 'text-slate-600'
          )}
          displayValue={value == null ? '—' : formatCurrency(value)}
          meta={meta}
        />
      </button>
    );
  };

  const renderRow = (row: DRERow): React.ReactNode => {
    const hasChildren = Boolean(row.children?.length);
    const isExpanded = expanded[row.id];
    const total = totalOf(row);

    return (
      <React.Fragment key={row.id}>
        <tr
          className={cn(
            'transition-colors',
            row.isTotal ? 'bg-slate-100/80 font-bold' : 'hover:bg-slate-50',
            row.isHeader ? 'font-semibold text-slate-800' : 'text-slate-600'
          )}
        >
          <td className="sticky left-0 z-20 bg-white border-r border-slate-200 min-w-[320px] max-w-[320px] px-4 py-2.5">
            <div className="flex items-center gap-2" style={{ paddingLeft: `${row.level * 16}px` }}>
              {hasChildren ? (
                <button onClick={() => toggleExpand(row.id)} className="rounded p-0.5 hover:bg-slate-100">
                  {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
              ) : (
                <span className="w-5" />
              )}
              <span className="text-sm">{row.label}</span>
            </div>
          </td>

          {visibleMonths.map((monthIndex) => {
            const cell = effective(row, monthIndex);
            const mes = `${MESES[monthIndex]}/${dreYear}`;
            const resInfo = avBaseInfo(row.id);
            // AV: linha de resultado → participação sobre a base; demais → |Dif| ÷ |Previsto|.
            const avPct = !showAV
              ? null
              : resInfo?.row
                ? ratioFromCells(cell, effective(resInfo.row, monthIndex))
                : avOf(row, monthIndex);
            const avMeta = resInfo?.row
              ? valueTrace.dre.avRatio(row.label, mes, resInfo.label)
              : valueTrace.dre.av(row.label, mes);
            // AH: linha de resultado → |Dif| ÷ |Previsto|; demais → variação vs mês anterior.
            const ahMoM = showAH && !resInfo ? ahOf(row, monthIndex) : null;
            const ahPct = !showAH ? null : resInfo ? avFromCell(cell) : ahMoM?.pct ?? null;
            const ahSigned = !resInfo; // variação mensal tem sinal; variância (Dif÷Prev) é magnitude
            return (
              <React.Fragment key={`${row.id}-${monthIndex}`}>
                <td className="min-w-[120px] px-2 py-1.5 text-right">
                  {renderEditableCell(row, monthIndex, 'prev')}
                </td>
                <td className="min-w-[120px] px-2 py-1.5 text-right">
                  {renderEditableCell(row, monthIndex, 'real')}
                </td>
                <td className={cn('min-w-[120px] px-3 py-1.5 text-right', !showAV && !showAH && 'border-r border-slate-200')}>
                  <ValueTrace
                    className={cn(
                      'text-xs tabular-nums font-semibold',
                      cell.dif == null ? 'text-slate-400' : cell.dif < 0 ? 'text-red-600' : cell.dif > 0 ? 'text-emerald-600' : 'text-slate-500'
                    )}
                    displayValue={cell.dif == null ? '—' : formatCurrency(cell.dif)}
                    meta={valueTrace.dre.diferenca(row.label, mes)}
                  />
                </td>
                {showAV && (
                  <td className={cn('min-w-[70px] px-2 py-1.5 text-right', !showAH && 'border-r border-slate-200')}>
                    <ValueTrace
                      className="text-[11px] tabular-nums font-semibold text-slate-500"
                      displayValue={avPct == null ? '—' : `${avPct.toFixed(1)}%`}
                      meta={avMeta}
                    />
                  </td>
                )}
                {showAH && (
                  <td className="min-w-[70px] px-2 py-1.5 text-right border-r border-slate-200">
                    <ValueTrace
                      className={cn(
                        'text-[11px] tabular-nums font-semibold',
                        ahPct == null
                          ? 'text-slate-400'
                          : ahSigned
                            ? (ahPct < 0 ? 'text-red-600' : ahPct > 0 ? 'text-emerald-600' : 'text-slate-500')
                            : 'text-slate-500'
                      )}
                      displayValue={ahPct == null ? '—' : `${ahSigned && ahPct > 0 ? '+' : ''}${ahPct.toFixed(1)}%`}
                      meta={
                        resInfo
                          ? valueTrace.dre.ahVariance(row.label, mes)
                          : valueTrace.dre.ah(
                              row.label,
                              mes,
                              monthIndex > 0 ? `${MESES[monthIndex - 1]}/${dreYear}` : 'mês anterior',
                              ahMoM?.serie ?? 'Previsto'
                            )
                      }
                    />
                  </td>
                )}
              </React.Fragment>
            );
          })}

          <td className="min-w-[120px] px-3 py-1.5 text-right bg-slate-50/60">
            <ValueTrace
              className={cn('text-xs tabular-nums', total.prev != null && total.prev < 0 ? 'text-red-600' : 'text-slate-600')}
              displayValue={total.prev == null ? '—' : formatCurrency(total.prev)}
              meta={valueTrace.dre.total(row.label, 'Previsto')}
            />
          </td>
          <td className="min-w-[120px] px-3 py-1.5 text-right bg-slate-50/60">
            <ValueTrace
              className={cn('text-xs tabular-nums font-medium', total.real != null && total.real < 0 ? 'text-red-600' : 'text-slate-800')}
              displayValue={total.real == null ? '—' : formatCurrency(total.real)}
              meta={valueTrace.dre.total(row.label, 'Realizado')}
            />
          </td>
          <td className={cn('min-w-[120px] px-3 py-1.5 text-right bg-slate-50/60', !showAV && !showAH && 'border-r border-slate-200')}>
            <ValueTrace
              className={cn(
                'text-xs tabular-nums font-semibold',
                total.dif == null ? 'text-slate-400' : total.dif < 0 ? 'text-red-600' : total.dif > 0 ? 'text-emerald-600' : 'text-slate-500'
              )}
              displayValue={total.dif == null ? '—' : formatCurrency(total.dif)}
              meta={valueTrace.dre.total(row.label, 'Diferença')}
            />
          </td>
          {showAV && (() => {
            const resInfo = avBaseInfo(row.id);
            const avPct = resInfo?.row ? ratioFromCells(total, totalOf(resInfo.row)) : avTotalOf(row);
            const avMeta = resInfo?.row
              ? valueTrace.dre.avRatio(row.label, `Total ${dreYear}`, resInfo.label)
              : valueTrace.dre.av(row.label, `Total ${dreYear}`);
            return (
              <td className={cn('min-w-[70px] px-2 py-1.5 text-right bg-slate-50/60', !showAH && 'border-r border-slate-200')}>
                <ValueTrace
                  className="text-[11px] tabular-nums font-semibold text-slate-500"
                  displayValue={avPct == null ? '—' : `${avPct.toFixed(1)}%`}
                  meta={avMeta}
                />
              </td>
            );
          })()}
          {showAH && (() => {
            // Linha de resultado: AH do total = |Dif| ÷ |Previsto| acumulado. Demais: sem AH no total.
            const isResult = avBaseInfo(row.id) !== null;
            const ahPct = isResult ? avFromCell(total) : null;
            return (
              <td className="min-w-[70px] px-2 py-1.5 text-right border-r border-slate-200 bg-slate-50/60">
                {ahPct == null ? (
                  <span className="text-[11px] text-slate-300">—</span>
                ) : (
                  <ValueTrace
                    className="text-[11px] tabular-nums font-semibold text-slate-500"
                    displayValue={`${ahPct.toFixed(1)}%`}
                    meta={valueTrace.dre.ahVariance(row.label, `Total ${dreYear}`)}
                  />
                )}
              </td>
            );
          })()}
        </tr>
        {hasChildren && isExpanded && row.children?.map((child) => renderRow(child))}
      </React.Fragment>
    );
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-500">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">DRE Gerencial</h2>
          <p className="text-sm text-slate-500">
            Previsto x Realizado por mês, importado da planilha Prev x Real {dreYear}. Clique em uma célula para editar; passe o mouse para ver a origem do valor.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 shadow-sm shrink-0">
          <Calendar className="w-4 h-4 text-slate-400" />
          <span className="text-sm font-medium text-slate-600">{dreYear}</span>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm px-4 py-3 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Filtrar meses
            {!allMonthsSelected && (
              <span className="ml-2 normal-case tracking-normal text-slate-500 font-semibold">
                · {visibleMonths.length} selecionado{visibleMonths.length === 1 ? '' : 's'}
              </span>
            )}
          </p>
          <div className="flex items-center gap-3">
            {!allMonthsSelected && (
              <button
                type="button"
                onClick={selectAllMonths}
                className="text-xs font-bold text-[#004D40] hover:underline"
              >
                Mostrar todos
              </button>
            )}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Análises</span>
              <button
                type="button"
                onClick={toggleAV}
                title="Análise vertical: quanto do Previsto a Diferença representa (Previsto = 100%)"
                className={cn(
                  'px-2.5 py-1 rounded-lg text-xs font-bold transition-colors border',
                  showAV
                    ? 'bg-[#004D40] text-white border-[#004D40] shadow-sm'
                    : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300 hover:text-slate-600'
                )}
              >
                AV
              </button>
              <button
                type="button"
                onClick={toggleAH}
                title="Análise horizontal: variação % de cada linha sobre o mês anterior"
                className={cn(
                  'px-2.5 py-1 rounded-lg text-xs font-bold transition-colors border',
                  showAH
                    ? 'bg-[#004D40] text-white border-[#004D40] shadow-sm'
                    : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300 hover:text-slate-600'
                )}
              >
                AH
              </button>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {MESES.map((mes, monthIndex) => {
            const active = visibleMonths.includes(monthIndex);
            return (
              <button
                key={mes}
                type="button"
                onClick={() => toggleMonth(monthIndex)}
                onDoubleClick={(e) => {
                  e.preventDefault();
                  soloMonth(monthIndex);
                }}
                title="Clique para marcar/desmarcar · Clique duas vezes para ver só este mês"
                className={cn(
                  'px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors border',
                  active
                    ? 'bg-[#004D40] text-white border-[#004D40] shadow-sm'
                    : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300 hover:text-slate-600'
                )}
              >
                {mes.slice(0, 3)}
              </button>
            );
          })}
        </div>
      </div>

      {editsError && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {editsError} Os valores exibidos são os importados da planilha; edições manuais ficarão disponíveis após resolver o aviso.
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto overflow-y-visible">
          <table className="w-full border-collapse text-left">
            <thead className="sticky top-0 z-30">
              <tr className="bg-slate-100 border-b border-slate-200">
                <th rowSpan={2} className="sticky left-0 z-30 min-w-[320px] max-w-[320px] border-r border-slate-200 bg-slate-100 px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  Categorias
                </th>
                {visibleMonths.map((monthIndex) => (
                  <th key={MESES[monthIndex]} colSpan={monthColSpan} className="border-r border-slate-200 px-3 py-2 text-center text-[11px] font-bold uppercase tracking-wider text-slate-600">
                    {MESES[monthIndex]} {dreYear}
                  </th>
                ))}
                <th colSpan={monthColSpan} className="border-r border-slate-200 px-3 py-2 text-center text-[11px] font-bold uppercase tracking-wider text-slate-700 bg-slate-200/70">
                  {allMonthsSelected ? `Total ${dreYear}` : `Total (${visibleMonths.length} mês${visibleMonths.length === 1 ? '' : 'es'})`}
                </th>
              </tr>
              <tr className="bg-slate-50 border-b border-slate-200">
                {[...visibleMonths.map((i) => MESES[i]), 'Total'].map((mes) => (
                  <React.Fragment key={`${mes}-sub`}>
                    <th className="min-w-[120px] border-r border-slate-100 px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-slate-500">Previsto</th>
                    <th className="min-w-[120px] border-r border-slate-100 px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-slate-500">Realizado</th>
                    <th className={cn('min-w-[120px] px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-slate-500', showAV || showAH ? 'border-r border-slate-100' : 'border-r border-slate-200')}>Diferença</th>
                    {showAV && (
                      <th className={cn('min-w-[70px] px-2 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-slate-500', showAH ? 'border-r border-slate-100' : 'border-r border-slate-200')} title="Análise vertical: quanto do Previsto a Diferença representa (Previsto = 100%)">AV</th>
                    )}
                    {showAH && (
                      <th className="min-w-[70px] border-r border-slate-200 px-2 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-slate-500" title="Análise horizontal: variação % sobre o mês anterior">AH</th>
                    )}
                  </React.Fragment>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredDreRows.map((row) => renderRow(row))}
              {showResultadoLiquido && (() => {
                const total = resultadoLiquidoTotal();
                // Resultado Líquido é linha de resultado: AV = ÷ Receita Bruta; AH = |Dif| ÷ |Previsto|.
                return (
                  <tr key="resultado-liquido" className="bg-slate-100/80 font-bold text-slate-800">
                    <td className="sticky left-0 z-20 bg-slate-100 border-r border-slate-200 min-w-[320px] max-w-[320px] px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="w-5" />
                        <span className="text-sm">{LIQUIDO_LABEL}</span>
                      </div>
                    </td>
                    {visibleMonths.map((monthIndex) => {
                      const cell = resultadoLiquidoOf(monthIndex);
                      const mes = `${MESES[monthIndex]}/${dreYear}`;
                      const avPct = showAV && receitaBrutaRow
                        ? ratioFromCells(cell, effective(receitaBrutaRow, monthIndex))
                        : null;
                      const ahPct = showAH ? avFromCell(cell) : null;
                      return (
                        <React.Fragment key={`liquido-${monthIndex}`}>
                          <td className="min-w-[120px] px-3 py-1.5 text-right">
                            <ValueTrace
                              className={cn(
                                'text-xs tabular-nums',
                                cell.prev != null && cell.prev < 0 ? 'text-red-600' : 'text-slate-600'
                              )}
                              displayValue={cell.prev == null ? '—' : formatCurrency(cell.prev)}
                              meta={valueTrace.dre.liquido('Previsto', mes)}
                            />
                          </td>
                          <td className="min-w-[120px] px-3 py-1.5 text-right">
                            <ValueTrace
                              className={cn(
                                'text-xs tabular-nums font-medium',
                                cell.real != null && cell.real < 0 ? 'text-red-600' : 'text-slate-800'
                              )}
                              displayValue={cell.real == null ? '—' : formatCurrency(cell.real)}
                              meta={valueTrace.dre.liquido('Realizado', mes)}
                            />
                          </td>
                          <td className={cn('min-w-[120px] px-3 py-1.5 text-right', !showAV && !showAH && 'border-r border-slate-200')}>
                            <ValueTrace
                              className={cn(
                                'text-xs tabular-nums font-semibold',
                                cell.dif == null ? 'text-slate-400' : cell.dif < 0 ? 'text-red-600' : cell.dif > 0 ? 'text-emerald-600' : 'text-slate-500'
                              )}
                              displayValue={cell.dif == null ? '—' : formatCurrency(cell.dif)}
                              meta={valueTrace.dre.liquido('Diferença', mes)}
                            />
                          </td>
                          {showAV && (
                            <td className={cn('min-w-[70px] px-2 py-1.5 text-right', !showAH && 'border-r border-slate-200')}>
                              <ValueTrace
                                className="text-[11px] tabular-nums font-semibold text-slate-500"
                                displayValue={avPct == null ? '—' : `${avPct.toFixed(1)}%`}
                                meta={valueTrace.dre.avRatio(LIQUIDO_LABEL, mes, '(+) RECEITA BRUTA')}
                              />
                            </td>
                          )}
                          {showAH && (
                            <td className="min-w-[70px] px-2 py-1.5 text-right border-r border-slate-200">
                              <ValueTrace
                                className="text-[11px] tabular-nums font-semibold text-slate-500"
                                displayValue={ahPct == null ? '—' : `${ahPct.toFixed(1)}%`}
                                meta={valueTrace.dre.ahVariance(LIQUIDO_LABEL, mes)}
                              />
                            </td>
                          )}
                        </React.Fragment>
                      );
                    })}
                    <td className="min-w-[120px] px-3 py-1.5 text-right bg-slate-50/60">
                      <ValueTrace
                        className={cn('text-xs tabular-nums', total.prev != null && total.prev < 0 ? 'text-red-600' : 'text-slate-600')}
                        displayValue={total.prev == null ? '—' : formatCurrency(total.prev)}
                        meta={valueTrace.dre.liquido('Previsto', `Total ${dreYear}`)}
                      />
                    </td>
                    <td className="min-w-[120px] px-3 py-1.5 text-right bg-slate-50/60">
                      <ValueTrace
                        className={cn('text-xs tabular-nums font-medium', total.real != null && total.real < 0 ? 'text-red-600' : 'text-slate-800')}
                        displayValue={total.real == null ? '—' : formatCurrency(total.real)}
                        meta={valueTrace.dre.liquido('Realizado', `Total ${dreYear}`)}
                      />
                    </td>
                    <td className={cn('min-w-[120px] px-3 py-1.5 text-right bg-slate-50/60', !showAV && !showAH && 'border-r border-slate-200')}>
                      <ValueTrace
                        className={cn(
                          'text-xs tabular-nums font-semibold',
                          total.dif == null ? 'text-slate-400' : total.dif < 0 ? 'text-red-600' : total.dif > 0 ? 'text-emerald-600' : 'text-slate-500'
                        )}
                        displayValue={total.dif == null ? '—' : formatCurrency(total.dif)}
                        meta={valueTrace.dre.liquido('Diferença', `Total ${dreYear}`)}
                      />
                    </td>
                    {showAV && (() => {
                      const avPct = receitaBrutaRow ? ratioFromCells(total, totalOf(receitaBrutaRow)) : null;
                      return (
                        <td className={cn('min-w-[70px] px-2 py-1.5 text-right bg-slate-50/60', !showAH && 'border-r border-slate-200')}>
                          <ValueTrace
                            className="text-[11px] tabular-nums font-semibold text-slate-500"
                            displayValue={avPct == null ? '—' : `${avPct.toFixed(1)}%`}
                            meta={valueTrace.dre.avRatio(LIQUIDO_LABEL, `Total ${dreYear}`, '(+) RECEITA BRUTA')}
                          />
                        </td>
                      );
                    })()}
                    {showAH && (() => {
                      const ahPct = avFromCell(total);
                      return (
                        <td className="min-w-[70px] px-2 py-1.5 text-right border-r border-slate-200 bg-slate-50/60">
                          {ahPct == null ? (
                            <span className="text-[11px] text-slate-300">—</span>
                          ) : (
                            <ValueTrace
                              className="text-[11px] tabular-nums font-semibold text-slate-500"
                              displayValue={`${ahPct.toFixed(1)}%`}
                              meta={valueTrace.dre.ahVariance(LIQUIDO_LABEL, `Total ${dreYear}`)}
                            />
                          )}
                        </td>
                      );
                    })()}
                  </tr>
                );
              })()}
            </tbody>
          </table>
        </div>
      </div>

      {resultadosFooter.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-emerald-50/40 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Resultados {dreYear}</p>
              <h3 className="text-lg font-bold text-slate-900 mt-0.5">Painel de apuração</h3>
            </div>
            {(resultadoLiquidoFooter || resultadoOperacional) && (
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  {resultadoLiquidoFooter ? 'Resultado líquido (real)' : 'Resultado operacional (real)'}
                </p>
                <p
                  className={cn(
                    'text-2xl font-extrabold tabular-nums mt-0.5',
                    ((resultadoLiquidoFooter || resultadoOperacional)!.total.real ?? 0) < 0
                      ? 'text-red-600'
                      : 'text-[#004D40]'
                  )}
                >
                  {(resultadoLiquidoFooter || resultadoOperacional)!.total.real == null
                    ? '—'
                    : formatCurrency((resultadoLiquidoFooter || resultadoOperacional)!.total.real!)}
                </p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6 gap-px bg-slate-100">
            {resultadosFooter.map((item) => {
              const real = item.total.real;
              const prev = item.total.prev;
              const dif = item.total.dif;
              const barPct =
                item.atingimento == null
                  ? 0
                  : Math.max(0, Math.min(100, Math.abs(item.atingimento)));
              const accentBar =
                item.accent === 'brand'
                  ? 'bg-[#004D40]'
                  : item.accent === 'emerald'
                    ? 'bg-emerald-500'
                    : item.accent === 'teal'
                      ? 'bg-teal-500'
                      : item.accent === 'sky'
                        ? 'bg-sky-500'
                        : 'bg-amber-500';
              const accentSoft =
                item.accent === 'brand'
                  ? 'bg-[#004D40]/10'
                  : item.accent === 'emerald'
                    ? 'bg-emerald-100'
                    : item.accent === 'teal'
                      ? 'bg-teal-100'
                      : item.accent === 'sky'
                        ? 'bg-sky-100'
                        : 'bg-amber-100';

              return (
                <div key={item.id} className="bg-white p-4 flex flex-col gap-3 min-h-[148px]">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 leading-tight">
                      {item.short}
                    </p>
                    {dif != null && (
                      <span
                        className={cn(
                          'shrink-0 text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-md',
                          dif < 0 ? 'bg-red-50 text-red-700' : dif > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                        )}
                      >
                        {dif > 0 ? '+' : ''}
                        {formatCurrency(dif)}
                      </span>
                    )}
                  </div>

                  <div>
                    <p
                      className={cn(
                        'text-xl font-extrabold tabular-nums leading-none',
                        real != null && real < 0 ? 'text-red-600' : 'text-slate-900'
                      )}
                    >
                      {real == null ? '—' : formatCurrency(real)}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1.5 tabular-nums">
                      Previsto {prev == null ? '—' : formatCurrency(prev)}
                    </p>
                  </div>

                  <div className="mt-auto space-y-1.5">
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      <span>Atingimento</span>
                      <span className="tabular-nums text-slate-600">
                        {item.atingimento == null ? '—' : `${item.atingimento.toFixed(0)}%`}
                      </span>
                    </div>
                    <div className={cn('h-2 rounded-full overflow-hidden', accentSoft)}>
                      <div
                        className={cn('h-full rounded-full transition-all duration-500', accentBar)}
                        style={{ width: `${barPct}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {resultadoOperacional?.row && (
            <div className="px-5 py-4 border-t border-slate-100 bg-white/70">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">
                Resultado operacional por mês (realizado)
              </p>
              <div
                className="grid gap-1.5"
                style={{ gridTemplateColumns: `repeat(${Math.max(visibleMonths.length, 1)}, minmax(0, 1fr))` }}
              >
                {visibleMonths.map((monthIndex) => {
                  const mes = MESES[monthIndex];
                  const cell = effective(resultadoOperacional.row!, monthIndex);
                  const val = cell.real;
                  const maxAbs = Math.max(
                    ...visibleMonths.map((i) => Math.abs(effective(resultadoOperacional.row!, i).real ?? 0)),
                    1
                  );
                  const heightPct = val == null ? 0 : Math.max(8, (Math.abs(val) / maxAbs) * 100);
                  return (
                    <div key={mes} className="flex flex-col items-center gap-1.5 min-w-0">
                      <div className="h-16 w-full flex items-end justify-center">
                        <div
                          className={cn(
                            'w-full max-w-[18px] rounded-t-md transition-all',
                            val == null
                              ? 'bg-slate-100 h-1'
                              : val < 0
                                ? 'bg-red-400/80'
                                : 'bg-[#004D40]/80'
                          )}
                          style={{ height: val == null ? 4 : `${heightPct}%` }}
                          title={`${mes}: ${val == null ? '—' : formatCurrency(val)}`}
                        />
                      </div>
                      <span className="text-[9px] font-bold uppercase text-slate-400 truncate w-full text-center">
                        {mes.slice(0, 3)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
