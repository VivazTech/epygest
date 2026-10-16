import React from 'react';
import { cn } from '../lib/utils';

const MESES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

export const currentCompetencia = () => {
  const now = new Date();
  return {
    month: String(now.getMonth() + 1),
    year: String(now.getFullYear()),
  };
};

/** Filtra YYYY-MM-DD (ou ISO) pela competência mês/ano. Sem mês/ano válidos, não filtra. */
export const matchesCompetencia = (
  dateValue: unknown,
  month: string | number,
  year: string | number
): boolean => {
  const m = Number(month);
  const y = Number(year);
  if (!Number.isFinite(m) || m < 1 || m > 12) return true;
  if (!Number.isFinite(y) || y < 2000 || y > 2100) return true;
  const raw = String(dateValue || '').trim();
  if (!raw) return false;
  const d = raw.slice(0, 10);
  const parts = d.split('-');
  if (parts.length < 2) return false;
  const yy = Number(parts[0]);
  const mm = Number(parts[1]);
  return yy === y && mm === m;
};

type CompetenciaFilterProps = {
  month: string;
  year: string;
  onMonthChange: (month: string) => void;
  onYearChange: (year: string) => void;
  hint?: string;
  className?: string;
  /** Inclui opção "Todos" (mês vazio = sem filtro de competência). */
  allowAll?: boolean;
};

export const CompetenciaFilter: React.FC<CompetenciaFilterProps> = ({
  month,
  year,
  onMonthChange,
  onYearChange,
  hint,
  className,
  allowAll = false,
}) => (
  <div className={cn('flex flex-wrap items-center gap-3', className)}>
    <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Competência</span>
    <select
      value={month}
      onChange={(e) => onMonthChange(e.target.value)}
      className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm"
      aria-label="Mês da competência"
    >
      {allowAll && <option value="">Todos</option>}
      {MESES.map((label, idx) => {
        const monthNumber = idx + 1;
        return (
          <option key={monthNumber} value={String(monthNumber)}>
            {String(monthNumber).padStart(2, '0')} — {label}
          </option>
        );
      })}
    </select>
    <input
      type="number"
      min={2000}
      max={2100}
      value={year}
      onChange={(e) => onYearChange(e.target.value)}
      className="w-28 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm"
      aria-label="Ano da competência"
    />
    {hint ? <span className="text-xs text-slate-400">{hint}</span> : null}
  </div>
);
