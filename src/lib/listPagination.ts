/** Paginação de listas (query page/pageSize). Sem `page`, o endpoint pode manter resposta legada em array. */

export type ListPageParams = {
  enabled: boolean;
  page: number;
  pageSize: number;
  from: number;
  to: number;
};

export function parseListPagination(query: Record<string, unknown> | undefined | null): ListPageParams {
  const raw = query ?? {};
  const hasPage = raw.page != null && String(raw.page).trim() !== "";
  const page = Math.max(1, Number(raw.page) || 1);
  const rawSize = Number(raw.pageSize);
  const pageSize = Math.min(100, Math.max(1, Number.isFinite(rawSize) && rawSize > 0 ? rawSize : 20));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  return { enabled: hasPage, page, pageSize, from, to };
}

export function paginatedPayload<T>(
  items: T[],
  total: number,
  page: number,
  pageSize: number,
  extra: Record<string, unknown> = {}
) {
  const safeTotal = Math.max(0, Number(total) || 0);
  return {
    items,
    total: safeTotal,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(safeTotal / pageSize) || 1),
    ...extra,
  };
}

/** Soma valores numéricos (ex.: amount), tratando estornos se `signOf` for informado. */
export function sumAmounts<T>(
  rows: T[],
  getAmount: (row: T) => unknown,
  signOf?: (row: T) => number
): number {
  return rows.reduce((sum, row) => {
    const value = Number(getAmount(row) || 0);
    if (!Number.isFinite(value)) return sum;
    const sign = signOf ? signOf(row) : 1;
    return sum + value * sign;
  }, 0);
}
