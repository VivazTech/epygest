import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import { PAGE_SIZE_OPTIONS } from '../hooks/useClientPagination';

type ListPaginationProps = {
  page: number;
  totalPages: number;
  total: number;
  from: number;
  to: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  className?: string;
  label?: string;
  /** Total monetário dos itens filtrados (não só da página atual). */
  amountTotal?: React.ReactNode;
};

export function sumAmountsByCurrency<T>(
  items: T[],
  getAmount: (item: T) => number | string | null | undefined,
  getCurrency: (item: T) => string | null | undefined = () => 'BRL'
): string {
  const byCurrency: Record<string, number> = {};
  for (const item of items) {
    const amount = Number(getAmount(item) || 0);
    if (!Number.isFinite(amount)) continue;
    const currency = String(getCurrency(item) || 'BRL').toUpperCase();
    byCurrency[currency] = (byCurrency[currency] || 0) + amount;
  }
  const entries = Object.entries(byCurrency).sort(([a], [b]) => {
    if (a === 'BRL') return -1;
    if (b === 'BRL') return 1;
    return a.localeCompare(b);
  });
  if (entries.length === 0) return formatCurrency(0);
  return entries.map(([currency, sum]) => formatCurrency(sum, currency)).join(' · ');
}

export const ListPagination: React.FC<ListPaginationProps> = ({
  page,
  totalPages,
  total,
  from,
  to,
  pageSize,
  onPageChange,
  onPageSizeChange,
  className,
  label = 'itens',
  amountTotal,
}) => {
  if (total === 0) return null;

  return (
    <div
      className={cn(
        'flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 px-4 py-3 border-t border-slate-100 bg-slate-50/40',
        className
      )}
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 min-w-0">
        <p className="text-xs text-slate-500 shrink-0">
          Mostrando <span className="font-semibold text-slate-700">{from}</span>
          {'–'}
          <span className="font-semibold text-slate-700">{to}</span>
          {' de '}
          <span className="font-semibold text-slate-700">{total}</span> {label}
        </p>
        {amountTotal != null && amountTotal !== '' && (
          <p className="text-xs text-slate-600 sm:border-l sm:border-slate-200 sm:pl-4">
            Total filtrado:{' '}
            <span className="font-bold text-slate-900 tabular-nums">{amountTotal}</span>
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex items-center gap-2 text-xs text-slate-500">
          Por página
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700"
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          Anterior
        </button>
        <span className="text-xs font-semibold text-slate-600 tabular-nums px-1">
          {page} / {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Próxima
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
