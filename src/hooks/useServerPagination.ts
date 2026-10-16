import { useCallback, useMemo, useState } from 'react';
import { PAGE_SIZE_OPTIONS } from './useClientPagination';

export { PAGE_SIZE_OPTIONS };

/** Estado de paginação para listas carregadas em lotes no servidor. */
export function useServerPagination(defaultPageSize = 20) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(defaultPageSize);
  const [total, setTotal] = useState(0);
  const [totalAmount, setTotalAmount] = useState<number | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);

  const setPageSize = useCallback((size: number) => {
    setPageSizeState(size);
    setPage(1);
  }, []);

  const resetPage = useCallback(() => setPage(1), []);

  const applyMeta = useCallback(
    (meta: { total?: number; totalAmount?: number | null; page?: number; pageSize?: number }) => {
      if (meta.total != null) setTotal(Math.max(0, Number(meta.total) || 0));
      if (meta.totalAmount !== undefined) {
        setTotalAmount(meta.totalAmount == null ? null : Number(meta.totalAmount));
      }
      if (meta.page != null && Number(meta.page) >= 1) setPage(Number(meta.page));
      if (meta.pageSize != null && Number(meta.pageSize) >= 1) setPageSizeState(Number(meta.pageSize));
    },
    []
  );

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('pageSize', String(pageSize));
    return params;
  }, [page, pageSize]);

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return {
    page,
    setPage,
    pageSize,
    setPageSize,
    total,
    setTotal,
    totalPages,
    totalAmount,
    setTotalAmount,
    applyMeta,
    resetPage,
    queryParams,
    from,
    to,
  };
}

/** Normaliza resposta legada (array) ou paginada ({ items, total }). */
export function parseListResponse<T>(data: unknown): {
  items: T[];
  total: number;
  page?: number;
  pageSize?: number;
  totalAmount?: number | null;
} {
  if (Array.isArray(data)) {
    return { items: data as T[], total: data.length };
  }
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    const items = Array.isArray(obj.items) ? (obj.items as T[]) : [];
    const total = Number(obj.total);
    return {
      items,
      total: Number.isFinite(total) ? total : items.length,
      page: obj.page != null ? Number(obj.page) : undefined,
      pageSize: obj.pageSize != null ? Number(obj.pageSize) : undefined,
      totalAmount: obj.totalAmount != null ? Number(obj.totalAmount) : null,
    };
  }
  return { items: [], total: 0 };
}
