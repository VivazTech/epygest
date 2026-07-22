import React, { useEffect, useMemo, useState } from 'react';
import { Calendar, ChevronDown, ChevronRight } from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import { useSearch } from '../context/SearchContext';
import { filterTreeByLabel } from '../lib/search';
import dreData from '../data/dre2026.json';

// Dados gerados a partir da aba "Prev x Real 2026" (linhas 52-330) pelo script
// scripts/import-dre-prev-real.cjs. Para reimportar, rode:
//   node scripts/import-dre-prev-real.cjs "caminho/para/Prev x Real 2026.csv"

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

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const dreRows = dreData.rows as DRERow[];
const dreYear = dreData.year;

// Total do ano: soma dos meses preenchidos; Diferença = Realizado - Previsto
// (mesma convenção da planilha, onde valores entre parênteses são negativos).
const totalOf = (values: MonthCell[]): MonthCell => {
  let prev: number | null = null;
  let real: number | null = null;
  for (const v of values) {
    if (v.prev != null) prev = (prev ?? 0) + v.prev;
    if (v.real != null) real = (real ?? 0) + v.real;
  }
  const dif = prev != null && real != null ? real - prev : null;
  return { prev, real, dif };
};

const Money: React.FC<{ value: number | null; className?: string }> = ({ value, className }) => (
  <span className={className}>{value == null ? '—' : formatCurrency(value)}</span>
);

export const DREPage: React.FC = () => {
  const { query } = useSearch();
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const row of dreRows) {
      if (row.children?.length) initial[row.id] = true;
    }
    return initial;
  });

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

  const renderCells = (cell: MonthCell, key: string, lastOfGroup: boolean) => (
    <React.Fragment key={key}>
      <td className={cn('min-w-[120px] px-3 py-2.5 text-right text-xs tabular-nums', cell.prev != null && cell.prev < 0 ? 'text-red-600' : 'text-slate-600')}>
        <Money value={cell.prev} />
      </td>
      <td className={cn('min-w-[120px] px-3 py-2.5 text-right text-xs tabular-nums font-medium', cell.real != null && cell.real < 0 ? 'text-red-600' : 'text-slate-800')}>
        <Money value={cell.real} />
      </td>
      <td
        className={cn(
          'min-w-[120px] px-3 py-2.5 text-right text-xs tabular-nums font-semibold',
          lastOfGroup ? 'border-r border-slate-200' : 'border-r border-slate-100',
          cell.dif == null ? 'text-slate-400' : cell.dif < 0 ? 'text-red-600' : cell.dif > 0 ? 'text-emerald-600' : 'text-slate-500'
        )}
      >
        <Money value={cell.dif} />
      </td>
    </React.Fragment>
  );

  const renderRow = (row: DRERow): React.ReactNode => {
    const hasChildren = Boolean(row.children?.length);
    const isExpanded = expanded[row.id];
    const total = totalOf(row.values);

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

          {row.values.map((cell, monthIndex) => renderCells(cell, `${row.id}-${monthIndex}`, true))}
          {renderCells(total, `${row.id}-total`, true)}
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
            Previsto x Realizado por mês, importado da planilha Prev x Real {dreYear}.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 shadow-sm">
          <Calendar className="w-4 h-4 text-slate-400" />
          <span className="text-sm font-medium text-slate-600">{dreYear}</span>
        </div>
      </div>

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
