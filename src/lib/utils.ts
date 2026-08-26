import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const formatCurrency = (value: number, currency = 'BRL') => {
  const code = (currency || 'BRL').toUpperCase();
  try {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: code,
    }).format(value);
  } catch {
    return `${code} ${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}`;
  }
};

export type CurrencyMeta = {
  code: string;
  symbol: string;
  fractionDigits: number;
};

export const getCurrencyMeta = (currency = 'BRL'): CurrencyMeta => {
  const code = String(currency || 'BRL').trim().toUpperCase() || 'BRL';
  try {
    const formatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: code });
    const parts = formatter.formatToParts(0);
    const symbol = (parts.find((part) => part.type === 'currency')?.value || code).trim();
    const fractionDigits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
    return { code, symbol, fractionDigits };
  } catch {
    return { code, symbol: code, fractionDigits: 2 };
  }
};

export const formatCurrencyInput = (value: string | number, currency = 'BRL') => {
  if (value === '' || value == null) return '';
  const num = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  if (!Number.isFinite(num)) return '';
  const { fractionDigits } = getCurrencyMeta(currency);
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(num);
};

/** Converte a digitação da máscara (somente dígitos) no valor numérico. */
export const parseCurrencyInputDigits = (raw: string, currency = 'BRL') => {
  const { fractionDigits } = getCurrencyMeta(currency);
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (!digits) return '';
  const amount = Number(digits) / 10 ** fractionDigits;
  if (!Number.isFinite(amount)) return '';
  return String(amount);
};

export const formatPercent = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value / 100);
};

export const formatDate = (date: string | Date) => {
  return new Intl.DateTimeFormat('pt-BR').format(new Date(date));
};

// Monta uma mensagem de erro clara a partir da resposta da API (erro + detalhe técnico, se houver).
export const formatApiError = (data: any, fallback: string) => {
  const base = (data && data.error) || fallback;
  return data && data.detail ? `${base} — ${data.detail}` : base;
};

/** fetch + parse JSON com mensagem clara quando o servidor devolve HTML. */
export async function fetchJson<T = unknown>(url: string, init?: RequestInit): Promise<{ res: Response; json: T }> {
  const res = await fetch(url, init);
  const text = await res.text();
  try {
    const json = (text ? JSON.parse(text) : {}) as T;
    return { res, json };
  } catch {
    const hint = text.trimStart().startsWith("<!")
      ? " O servidor retornou HTML em vez de JSON — reinicie com npm run dev."
      : "";
    throw new Error(`Resposta inválida em ${url.split("?")[0]}.${hint}`);
  }
}
