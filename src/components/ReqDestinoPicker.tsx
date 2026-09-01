import React from 'react';
import { cn } from '../lib/utils';
import {
  REQ_DESTINOS,
  REQ_DESTINO_ACTIVE,
  REQ_DESTINO_LABELS,
  REQ_DESTINO_SHORT,
  type ReqDestino,
} from '../lib/requisicoesDestino';

type ReqDestinoPickerProps = {
  value: ReqDestino;
  onChange: (destino: ReqDestino) => void;
  disabled?: boolean;
  compact?: boolean;
};

export const ReqDestinoPicker: React.FC<ReqDestinoPickerProps> = ({
  value,
  onChange,
  disabled = false,
  compact = true,
}) => (
  <div
    className={cn(
      'inline-flex flex-wrap justify-center rounded-lg border border-slate-200 overflow-hidden text-[10px] font-bold',
      disabled && 'opacity-60 pointer-events-none'
    )}
  >
    {REQ_DESTINOS.map((cat) => (
      <button
        key={cat}
        type="button"
        disabled={disabled}
        onClick={() => onChange(value === cat ? '' : cat)}
        title={REQ_DESTINO_LABELS[cat]}
        className={cn(
          'px-2 py-1 transition-colors',
          value === cat ? REQ_DESTINO_ACTIVE[cat] : 'bg-white text-slate-400 hover:bg-slate-50',
          compact && 'min-w-[2.25rem]'
        )}
      >
        {REQ_DESTINO_SHORT[cat]}
      </button>
    ))}
  </div>
);
