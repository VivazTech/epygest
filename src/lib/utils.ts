import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
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
