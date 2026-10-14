import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../lib/utils';

export type MobileRecordDetail = {
  label: string;
  value: React.ReactNode;
  wide?: boolean;
};

export type MobileRecordItem = {
  id: string;
  badge?: React.ReactNode;
  status?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  amount?: React.ReactNode;
  details?: MobileRecordDetail[];
  extra?: React.ReactNode;
  actions?: React.ReactNode;
};

const shell = 'bg-white rounded-2xl border border-slate-100 shadow-sm px-4 py-10 text-center text-sm text-slate-400';

export const MobileRecordList: React.FC<{
  items: MobileRecordItem[];
  empty?: string;
  loading?: boolean;
  loadingLabel?: string;
  className?: string;
}> = ({
  items,
  empty = 'Nenhum item encontrado.',
  loading = false,
  loadingLabel = 'Carregando...',
  className,
}) => {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className={cn('md:hidden space-y-3', className)}>
      {loading && <div className={shell}>{loadingLabel}</div>}
      {!loading && items.length === 0 && <div className={shell}>{empty}</div>}
      {!loading &&
        items.map((item) => {
          const open = openId === item.id;
          const hasDetails = Boolean(item.details?.length || item.extra);
          return (
            <article key={item.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <button
                type="button"
                className="w-full text-left"
                aria-expanded={open}
                onClick={() => setOpenId(open ? null : item.id)}
              >
                {(item.badge || item.status) && (
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">{item.badge}</div>
                    <div className="shrink-0 max-w-[55%] text-right">{item.status}</div>
                  </div>
                )}
                <div className={cn('text-sm font-semibold text-slate-900 line-clamp-2', item.badge || item.status ? 'mt-3' : '')}>
                  {item.title}
                </div>
                {item.subtitle ? (
                  <div className="mt-1 text-xs text-slate-500 line-clamp-2">{item.subtitle}</div>
                ) : null}
                <div className="mt-3 flex items-end justify-between gap-3">
                  <div className="text-lg font-extrabold leading-none text-slate-900 min-w-0">{item.amount ?? '—'}</div>
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 shrink-0">
                    {open ? 'Recolher' : 'Detalhes'}
                    <ChevronDown className={cn('w-4 h-4 transition-transform', open && 'rotate-180')} />
                  </span>
                </div>
              </button>

              {open && hasDetails && (
                <div className="mt-3 pt-3 border-t border-slate-100 space-y-3">
                  {item.details && item.details.length > 0 && (
                    <div className="grid grid-cols-2 gap-3">
                      {item.details.map((detail) => (
                        <div key={detail.label} className={cn('min-w-0', detail.wide && 'col-span-2')}>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{detail.label}</p>
                          <div className="text-sm text-slate-700 mt-0.5 break-words">{detail.value}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {item.extra}
                </div>
              )}

              {item.actions ? (
                <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-end gap-1">
                  {item.actions}
                </div>
              ) : null}
            </article>
          );
        })}
    </div>
  );
};
