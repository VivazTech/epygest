import React from 'react';
import { cn, formatCurrency } from '../lib/utils';
import {
  CmvMetaComparison,
  fmtDesvioPp,
  impactoLabel,
} from '../lib/cmvMeta';

const fmtPct = (fraction: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(fraction) ? fraction : 0);

type CmvMetaPanelProps = {
  comparison: CmvMetaComparison;
  title?: string;
  className?: string;
};

export const CmvMetaPanel: React.FC<CmvMetaPanelProps> = ({
  comparison: c,
  title = 'Meta de CMV',
  className,
}) => {
  const impactoColor =
    c.situacao === 'excesso'
      ? 'text-red-600'
      : c.situacao === 'economia'
        ? 'text-emerald-600'
        : 'text-slate-600';

  return (
    <div className={cn('bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden', className)}>
      <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/80">
        <h3 className="text-base font-extrabold text-slate-800">{title}</h3>
      </div>
      <div className="p-5 grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Meta</p>
          <p className="text-xl font-extrabold text-slate-900 tabular-nums mt-1">{fmtPct(c.meta_pct)}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Realizado</p>
          <p className="text-xl font-extrabold text-[#004D40] tabular-nums mt-1">{fmtPct(c.realizado_pct)}</p>
        </div>
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Desvio</p>
          <p className={cn('text-lg font-extrabold tabular-nums mt-1', impactoColor)}>
            {fmtDesvioPp(c.desvio_pp)}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Impacto</p>
          <p className={cn('text-lg font-extrabold tabular-nums mt-1', impactoColor)}>
            {formatCurrency(c.impacto_financeiro)}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">{impactoLabel(c.situacao)}</p>
        </div>
      </div>
    </div>
  );
};
