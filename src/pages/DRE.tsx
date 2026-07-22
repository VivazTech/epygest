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

  const totalOf = (row: DRERow): MonthCell => {
    let prev: number | null = null;
    let real: number | null = null;
    for (let m = 0; m < 12; m++) {
      const v = effective(row, m);
      if (v.prev != null) prev = (prev ?? 0) + v.prev;
      if (v.real != null) real = (real ?? 0) + v.real;
    }
    const dif = prev != null && real != null ? real - prev : null;
    return { prev, real, dif };
  };

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

          {MESES.map((_, monthIndex) => {
            const cell = effective(row, monthIndex);
            return (
              <React.Fragment key={`${row.id}-${monthIndex}`}>
                <td className="min-w-[120px] px-2 py-1.5 text-right">
                  {renderEditableCell(row, monthIndex, 'prev')}
                </td>
                <td className="min-w-[120px] px-2 py-1.5 text-right">
                  {renderEditableCell(row, monthIndex, 'real')}
                </td>
                <td className="min-w-[120px] px-3 py-1.5 text-right border-r border-slate-200">
                  <ValueTrace
                    className={cn(
                      'text-xs tabular-nums font-semibold',
                      cell.dif == null ? 'text-slate-400' : cell.dif < 0 ? 'text-red-600' : cell.dif > 0 ? 'text-emerald-600' : 'text-slate-500'
                    )}
                    displayValue={cell.dif == null ? '—' : formatCurrency(cell.dif)}
                    meta={valueTrace.dre.diferenca(row.label, `${MESES[monthIndex]}/${dreYear}`)}
                  />
                </td>
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
          <td className="min-w-[120px] px-3 py-1.5 text-right border-r border-slate-200 bg-slate-50/60">
            <ValueTrace
              className={cn(
                'text-xs tabular-nums font-semibold',
                total.dif == null ? 'text-slate-400' : total.dif < 0 ? 'text-red-600' : total.dif > 0 ? 'text-emerald-600' : 'text-slate-500'
              )}
              displayValue={total.dif == null ? '—' : formatCurrency(total.dif)}
              meta={valueTrace.dre.total(row.label, 'Diferença')}
            />
          </td>
        </tr>
        {hasChildren && isExpanded && row.children?.map((child) => renderRow(child))}
      </React.Fragment>
    );
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">DRE Gerencial</h2>
          <p className="text-sm text-slate-500">
            Previsto x Realizado por mês, importado da planilha Prev x Real {dreYear}. Clique em uma célula para editar; passe o mouse para ver a origem do valor.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 shadow-sm">
          <Calendar className="w-4 h-4 text-slate-400" />
          <span className="text-sm font-medium text-slate-600">{dreYear}</span>
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
                {MESES.map((mes) => (
                  <th key={mes} colSpan={3} className="border-r border-slate-200 px-3 py-2 text-center text-[11px] font-bold uppercase tracking-wider text-slate-600">
                    {mes} {dreYear}
                  </th>
                ))}
                <th colSpan={3} className="border-r border-slate-200 px-3 py-2 text-center text-[11px] font-bold uppercase tracking-wider text-slate-700 bg-slate-200/70">
                  Total {dreYear}
                </th>
              </tr>
              <tr className="bg-slate-50 border-b border-slate-200">
                {[...MESES, 'Total'].map((mes) => (
                  <React.Fragment key={`${mes}-sub`}>
                    <th className="min-w-[120px] border-r border-slate-100 px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-slate-500">Previsto</th>
                    <th className="min-w-[120px] border-r border-slate-100 px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-slate-500">Realizado</th>
                    <th className="min-w-[120px] border-r border-slate-200 px-3 py-2 text-right text-[10px] font-bold uppercase tracking-wide text-slate-500">Diferença</th>
                  </React.Fragment>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredDreRows.map((row) => renderRow(row))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
