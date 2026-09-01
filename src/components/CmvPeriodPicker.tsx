import React, { useMemo } from 'react';
import { IMPORT_SCOPE_LABELS, type ImportScope } from '../lib/importPeriod';
import { buildCmvPeriodLabel, lastDayOfMonth } from '../lib/cmvHistorico';

type CmvPeriodPickerProps = {
  scope: ImportScope;
  onScopeChange: (scope: ImportScope) => void;
  periodoFimDia: string;
  onPeriodoFimDiaChange: (day: string) => void;
  year: number;
  month: number;
  className?: string;
};

export const CmvPeriodPicker: React.FC<CmvPeriodPickerProps> = ({
  scope,
  onScopeChange,
  periodoFimDia,
  onPeriodoFimDiaChange,
  year,
  month,
  className = '',
}) => {
  const last = lastDayOfMonth(year, month);
  const preview = useMemo(() => {
    if (scope === 'fechamento') return 'Fechamento';
    const day = Number(periodoFimDia);
    if (!Number.isFinite(day) || day < 1) return '—';
    return buildCmvPeriodLabel(month, Math.min(last, day));
  }, [scope, periodoFimDia, month, last]);

  const days = Array.from({ length: last }, (_, i) => i + 1);

  return (
    <div className={`flex flex-wrap items-center gap-3 text-sm ${className}`}>
      <div className="flex items-center gap-2">
        <span className="font-semibold text-slate-600">Tipo:</span>
        <select
          value={scope}
          onChange={(e) => onScopeChange(e.target.value as ImportScope)}
          className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#004D40]/30"
        >
          <option value="acompanhamento">Apuração parcial</option>
          <option value="fechamento">{IMPORT_SCOPE_LABELS.fechamento}</option>
        </select>
      </div>
      {scope === 'acompanhamento' && (
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-600">Período:</span>
          <span className="text-slate-500">01 até dia</span>
          <select
            value={periodoFimDia}
            onChange={(e) => onPeriodoFimDiaChange(e.target.value)}
            className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#004D40]/30"
          >
            {days.map((d) => (
              <option key={d} value={String(d)}>
                {String(d).padStart(2, '0')}
              </option>
            ))}
          </select>
          <span className="text-slate-500">/ {String(month).padStart(2, '0')}</span>
        </div>
      )}
      <div className="px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 font-bold text-sm">
        {preview}
      </div>
    </div>
  );
};
