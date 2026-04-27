import React from 'react';

interface ValueTraceProps {
  displayValue: React.ReactNode;
  source: string;
  calculation: string;
  className?: string;
}

export const ValueTrace: React.FC<ValueTraceProps> = ({
  displayValue,
  source,
  calculation,
  className = '',
}) => {
  return (
    <span className={`relative inline-flex items-center group ${className}`}>
      {displayValue}
      <span className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 hidden w-72 -translate-x-1/2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-[11px] font-medium leading-relaxed text-slate-700 shadow-xl group-hover:block">
        <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-500">Origem</span>
        <span className="block">{source}</span>
        <span className="mt-1 block text-[10px] font-bold uppercase tracking-wide text-slate-500">Como foi calculado</span>
        <span className="block">{calculation}</span>
      </span>
    </span>
  );
};

