import React, { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ValueTraceMeta } from '../lib/valueTraceMeta';

export type ValueTraceProps = {
  displayValue: React.ReactNode;
  source?: string;
  calculation?: string;
  tables?: string;
  className?: string;
  /** Aceita objeto meta de valueTraceMeta.ts (substitui source/calculation/tables) */
  meta?: ValueTraceMeta;
};

export const ValueTrace: React.FC<ValueTraceProps> = ({
  displayValue,
  source,
  calculation,
  tables,
  className = '',
  meta,
}) => {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const resolvedSource = meta?.source ?? source ?? '';
  const resolvedCalculation = meta?.calculation ?? calculation ?? '';
  const resolvedTables = meta?.tables ?? tables;

  const updatePosition = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({
      top: rect.bottom + 8,
      left: Math.min(Math.max(rect.left + rect.width / 2, 160), window.innerWidth - 160),
    });
  }, []);

  const show = () => {
    updatePosition();
    setOpen(true);
  };

  const hide = () => setOpen(false);

  const tooltip =
    open &&
    createPortal(
      <div
        role="tooltip"
        className="pointer-events-none fixed z-[9999] w-[min(20rem,calc(100vw-1.5rem))] -translate-x-1/2 rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-left shadow-2xl shadow-slate-300/40 ring-1 ring-slate-100"
        style={{ top: pos.top, left: pos.left }}
      >
        <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-800">Origem</p>
        <p className="mt-0.5 text-[11px] font-medium leading-snug text-slate-800">{resolvedSource}</p>
        {resolvedTables && (
          <>
            <p className="mt-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">Tabelas / API</p>
            <p className="mt-0.5 font-mono text-[10px] text-slate-600">{resolvedTables}</p>
          </>
        )}
        <p className="mt-2 text-[10px] font-bold uppercase tracking-wide text-slate-500">Como foi calculado</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-slate-700">{resolvedCalculation}</p>
      </div>,
      document.body
    );

  return (
    <>
      <span
        ref={anchorRef}
        className={`inline-flex items-baseline border-b border-dotted border-slate-400/70 cursor-help transition-colors hover:border-emerald-600 hover:text-emerald-900 ${className}`}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        tabIndex={0}
        aria-describedby={open ? 'value-trace-tip' : undefined}
      >
        {displayValue}
      </span>
      {tooltip}
    </>
  );
};
