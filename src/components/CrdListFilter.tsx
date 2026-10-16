import React, { useMemo } from 'react';
import { SearchableSelect, type SearchableSelectOption } from './SearchableSelect';
import { cn } from '../lib/utils';

type CrdListFilterProps = {
  value: string;
  onChange: (value: string) => void;
  /** Opções já com "Todos os CRDs" (via buildCrdFilterOptions) ou só CRDs. */
  options: SearchableSelectOption[];
  className?: string;
  label?: string;
};

export const CrdListFilter: React.FC<CrdListFilterProps> = ({
  value,
  onChange,
  options,
  className,
  label = 'Filtrar CRD',
}) => {
  const selectOptions = useMemo(() => {
    if (options.some((o) => o.value === '')) return options;
    return [{ value: '', label: 'Todos os CRDs' }, ...options];
  }, [options]);

  return (
    <div className={cn('min-w-[220px] max-w-sm flex-1', className)}>
      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">
        {label}
      </label>
      <SearchableSelect
        value={value}
        onChange={onChange}
        options={selectOptions}
        placeholder="Digite o código (ex.: 352)"
        emptyMessage="Nenhum CRD cadastrado"
        noResultsMessage="Nenhum CRD encontrado"
      />
    </div>
  );
};
