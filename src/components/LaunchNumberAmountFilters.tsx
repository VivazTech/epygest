import React from 'react';
import { cn } from '../lib/utils';

/** Converte texto de filtro de valor (BR ou US) em número, ou null se vazio/inválido. */
export const parseAmountFilter = (raw: string): number | null => {
  const t = String(raw || '').trim();
  if (!t) return null;
  const cleaned = t.replace(/[R$\s]/gi, '');
  // 1.234,56 → 1234.56 | 1234.56 → 1234.56 | 1234,56 → 1234.56
  let normalized = cleaned;
  if (cleaned.includes(',') && cleaned.includes('.')) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (cleaned.includes(',')) {
    normalized = cleaned.replace(',', '.');
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
};

export const matchesInvoiceNumberFilter = (filter: string, ...values: unknown[]) => {
  const q = String(filter || '').trim().toLowerCase();
  if (!q) return true;
  return values.some((v) => {
    if (v == null || v === '') return false;
    return String(v).toLowerCase().includes(q);
  });
};

export const matchesAmountFilter = (filter: string, amount: unknown) => {
  const q = String(filter || '').trim();
  if (!q) return true;
  const value = Number(amount);
  if (!Number.isFinite(value)) return false;

  const parsed = parseAmountFilter(q);
  if (parsed != null) {
    // tolerância de 1 centavo
    if (Math.abs(value - parsed) < 0.005) return true;
  }

  // fallback: contém no texto numérico / formatado
  const plain = String(value);
  const br = value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const digitsQ = q.replace(/\D/g, '');
  const digitsV = plain.replace(/\D/g, '') + br.replace(/\D/g, '');
  if (digitsQ && digitsV.includes(digitsQ)) return true;
  return plain.includes(q) || br.includes(q);
};

type LaunchNumberAmountFiltersProps = {
  invoiceNumber: string;
  onInvoiceNumberChange: (value: string) => void;
  amount: string;
  onAmountChange: (value: string) => void;
  className?: string;
  numberLabel?: string;
  amountLabel?: string;
};

export const LaunchNumberAmountFilters: React.FC<LaunchNumberAmountFiltersProps> = ({
  invoiceNumber,
  onInvoiceNumberChange,
  amount,
  onAmountChange,
  className,
  numberLabel = 'Nº da nota',
  amountLabel = 'Valor da nota',
}) => (
  <div className={cn('flex flex-wrap items-end gap-3', className)}>
    <div className="min-w-[140px] max-w-[200px] flex-1">
      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">
        {numberLabel}
      </label>
      <input
        type="text"
        value={invoiceNumber}
        onChange={(e) => onInvoiceNumberChange(e.target.value)}
        placeholder="Ex.: 12345"
        className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 transition-all"
      />
    </div>
    <div className="min-w-[140px] max-w-[200px] flex-1">
      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">
        {amountLabel}
      </label>
      <input
        type="text"
        inputMode="decimal"
        value={amount}
        onChange={(e) => onAmountChange(e.target.value)}
        placeholder="Ex.: 1.250,00"
        className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 transition-all"
      />
    </div>
  </div>
);
