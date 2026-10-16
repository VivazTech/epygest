import React from 'react';
import { cn } from '../lib/utils';
import {
  REQ_CMV_SUBTIPOS,
  REQ_CMV_SUBTIPO_ACTIVE,
  REQ_CMV_SUBTIPO_LABELS,
  REQ_CMV_SUBTIPO_SHORT,
  type ReqCmvSubtipo,
} from '../lib/requisicoesDestino';

type ReqCmvSubtipoPickerProps = {
  value: ReqCmvSubtipo;
  onChange: (subtipo: ReqCmvSubtipo) => void;
  disabled?: boolean;
};

export const ReqCmvSubtipoPicker: React.FC<ReqCmvSubtipoPickerProps> = ({
  value,
  onChange,
  disabled = false,
}) => (
  <div
    className={cn(
      'inline-flex rounded-lg border border-slate-200 overflow-hidden text-[10px] font-bold',
      disabled && 'opacity-60 pointer-events-none'
    )}
  >
    {REQ_CMV_SUBTIPOS.map((sub) => (
      <button
        key={sub}
        type="button"
        disabled={disabled}
        onClick={() => onChange(value === sub ? '' : sub)}
        title={REQ_CMV_SUBTIPO_LABELS[sub]}
        className={cn(
          'px-2 py-1 transition-colors min-w-[2.5rem]',
          value === sub ? REQ_CMV_SUBTIPO_ACTIVE[sub] : 'bg-white text-slate-400 hover:bg-slate-50'
        )}
      >
        {REQ_CMV_SUBTIPO_SHORT[sub]}
      </button>
    ))}
  </div>
);
