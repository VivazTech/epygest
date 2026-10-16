import React from 'react';
import { IMPORT_SCOPE_LABELS, type ImportScope } from '../lib/importPeriod';

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

type ImportPeriodPickerProps = {
  scope: ImportScope;
  onScopeChange: (scope: ImportScope) => void;
  weekIndex: string;
  onWeekIndexChange: (week: string) => void;
  month: string;
  onMonthChange: (month: string) => void;
  year: string;
  onYearChange: (year: string) => void;
  yearBase?: number;
  yearSpan?: number;
  className?: string;
  hint?: string;
};

export const ImportPeriodPicker: React.FC<ImportPeriodPickerProps> = ({
  scope,
  onScopeChange,
  weekIndex,
  onWeekIndexChange,
  month,
  onMonthChange,
  year,
  onYearChange,
  yearBase = new Date().getFullYear(),
  yearSpan = 6,
  className = '',
  hint,
}) => {
  const years = Array.from({ length: yearSpan }, (_, i) => yearBase - 2 + i);

  return (
    <div className={`flex flex-wrap items-center gap-2 text-xs text-slate-600 ${className}`}>
      <span className="font-semibold">Tipo:</span>
      <select
        value={scope}
        onChange={(e) => onScopeChange(e.target.value as ImportScope)}
        className="border border-slate-200 rounded-lg px-2 py-1 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#004D40]/30"
      >
        <option value="fechamento">{IMPORT_SCOPE_LABELS.fechamento}</option>
        <option value="acompanhamento">{IMPORT_SCOPE_LABELS.acompanhamento}</option>
      </select>
      {scope === 'acompanhamento' && (
        <>
          <span className="font-semibold">Semana:</span>
          <select
            value={weekIndex}
            onChange={(e) => onWeekIndexChange(e.target.value)}
            className="border border-slate-200 rounded-lg px-2 py-1 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#004D40]/30"
          >
            {[1, 2, 3, 4, 5].map((w) => (
              <option key={w} value={String(w)}>Semana {w}</option>
            ))}
          </select>
        </>
      )}
      <span className="text-slate-400">·</span>
      <span className="font-semibold">Competência:</span>
      <select
        value={month}
        onChange={(e) => onMonthChange(e.target.value)}
        className="border border-slate-200 rounded-lg px-2 py-1 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#004D40]/30"
      >
        {MESES.map((m, i) => (
          <option key={i + 1} value={String(i + 1)}>{m}</option>
        ))}
      </select>
      <select
        value={year}
        onChange={(e) => onYearChange(e.target.value)}
        className="border border-slate-200 rounded-lg px-2 py-1 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#004D40]/30"
      >
        {years.map((y) => (
          <option key={y} value={String(y)}>{y}</option>
        ))}
      </select>
      {hint ? (
        <>
          <span className="text-slate-400">·</span>
          <span className="text-[11px] text-slate-500">{hint}</span>
        </>
      ) : null}
    </div>
  );
};
