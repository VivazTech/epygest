import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { cn } from '../lib/utils';
import { matchesSearch } from '../lib/search';

export type SearchableSelectOption = {
  value: string;
  label: string;
  /** Texto extra usado na busca (ex.: código, setor) */
  keywords?: string;
};

type SearchableSelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  emptyMessage?: string;
  noResultsMessage?: string;
  className?: string;
};

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  value,
  onChange,
  options,
  placeholder = 'Selecione',
  disabled = false,
  emptyMessage = 'Nenhuma opção disponível',
  noResultsMessage = 'Nenhum resultado',
  className,
}) => {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 0 });

  const updateMenuPos = () => {
    const el = inputRef.current?.parentElement;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setMenuPos({
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
    });
  };

  const selected = useMemo(
    () => options.find((o) => o.value === value),
    [options, value]
  );

  const filtered = useMemo(
    () =>
      options.filter((o) =>
        matchesSearch(query, o.label, o.value, o.keywords)
      ),
    [options, query]
  );

  useEffect(() => {
    setHighlight(0);
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    updateMenuPos();
    const onScrollOrResize = () => updateMenuPos();
    window.addEventListener('resize', onScrollOrResize);
    window.addEventListener('scroll', onScrollOrResize, true);
    return () => {
      window.removeEventListener('resize', onScrollOrResize);
      window.removeEventListener('scroll', onScrollOrResize, true);
    };
  }, [open, filtered.length]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
      setQuery('');
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const pick = (next: string) => {
    onChange(next);
    setOpen(false);
    setQuery('');
    inputRef.current?.blur();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) setOpen(true);
      setHighlight((h) => Math.min(h + 1, Math.max(filtered.length - 1, 0)));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (open && filtered[highlight]) {
        pick(filtered[highlight].value);
      }
      return;
    }
    if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
      inputRef.current?.blur();
    }
  };

  const inputValue = open ? query : (selected?.label || '');

  const dropdown =
    open &&
    !disabled &&
    createPortal(
      <ul
        ref={menuRef}
        id={listId}
        role="listbox"
        style={{ top: menuPos.top, left: menuPos.left, width: menuPos.width }}
        className="fixed z-[9999] max-h-52 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg py-1"
      >
        {options.length === 0 && (
          <li className="px-3 py-2 text-xs text-slate-500">{emptyMessage}</li>
        )}
        {options.length > 0 && filtered.length === 0 && (
          <li className="px-3 py-2 text-xs text-slate-500">{noResultsMessage}</li>
        )}
        {filtered.map((opt, index) => (
          <li key={opt.value}>
            <button
              type="button"
              role="option"
              aria-selected={opt.value === value}
              onMouseEnter={() => setHighlight(index)}
              onClick={() => pick(opt.value)}
              className={cn(
                'w-full text-left px-3 py-2 text-sm transition-colors',
                index === highlight && 'bg-emerald-50 text-emerald-900',
                opt.value === value && index !== highlight && 'bg-slate-50 font-medium text-slate-800',
                opt.value !== value && index !== highlight && 'text-slate-700 hover:bg-slate-50'
              )}
            >
              {opt.label}
            </button>
          </li>
        ))}
      </ul>,
      document.body
    );

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <div
        className={cn(
          'flex items-center gap-2 w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm transition-all',
          open && 'ring-2 ring-emerald-500/20 border-emerald-500',
          disabled && 'opacity-60 cursor-not-allowed'
        )}
      >
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          disabled={disabled}
          value={inputValue}
          placeholder={placeholder}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => {
            if (disabled) return;
            setOpen(true);
            setQuery(selected?.label || '');
            updateMenuPos();
            requestAnimationFrame(() => inputRef.current?.select());
          }}
          onKeyDown={onKeyDown}
          className="flex-1 min-w-0 bg-transparent outline-none text-slate-800 placeholder:text-slate-400 disabled:cursor-not-allowed"
        />
        <ChevronDown
          className={cn(
            'w-4 h-4 text-slate-400 shrink-0 transition-transform',
            open && 'rotate-180'
          )}
        />
      </div>

      {dropdown}
    </div>
  );
};
