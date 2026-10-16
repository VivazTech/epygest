import React, { useEffect, useId, useRef, useState } from 'react';
import { Calendar } from 'lucide-react';
import { cn } from '../lib/utils';

type DateBrInputProps = {
  /** Valor em YYYY-MM-DD (ou vazio). */
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  name?: string;
  id?: string;
  placeholder?: string;
  /** Se informado, completa dd/mm com este ano e usa no placeholder. */
  suggestYear?: number;
  title?: string;
};

function isoToBr(iso: string): string {
  const m = String(iso || '').trim().slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function digitsToMasked(digits: string): string {
  const d = digits.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

function brToIso(br: string): string | null {
  const m = br.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 2100) return null;
  const dt = new Date(year, month - 1, day);
  if (dt.getFullYear() !== year || dt.getMonth() !== month - 1 || dt.getDate() !== day) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function inRange(iso: string, min?: string, max?: string): boolean {
  if (min && iso < min) return false;
  if (max && iso > max) return false;
  return true;
}

/** Campo de data com exibição fixa dd/mm/yyyy (valor interno YYYY-MM-DD). */
export const DateBrInput: React.FC<DateBrInputProps> = ({
  value,
  onChange,
  min,
  max,
  className,
  disabled,
  required,
  name,
  id,
  placeholder,
  suggestYear,
  title,
}) => {
  const autoId = useId();
  const inputId = id || autoId;
  const pickerRef = useRef<HTMLInputElement>(null);
  const yearHint = suggestYear ?? new Date().getFullYear();
  const resolvedPlaceholder = placeholder || `dd/mm/${yearHint}`;
  const [text, setText] = useState(() => isoToBr(value));

  useEffect(() => {
    setText(isoToBr(value));
  }, [value]);

  const withSuggestedYear = (masked: string) => {
    if (/^\d{2}\/\d{2}$/.test(masked)) return `${masked}/${yearHint}`;
    return masked;
  };

  const commitText = (raw: string) => {
    let masked = digitsToMasked(raw);
    // Digitou só dia+mês (4 dígitos) → completa com o ano sugerido
    if (masked.length === 5 && /^\d{2}\/\d{2}$/.test(masked)) {
      masked = `${masked}/${yearHint}`;
    }
    setText(masked);
    if (masked === '') {
      onChange('');
      return;
    }
    const iso = brToIso(masked);
    if (!iso) return;
    if (!inRange(iso, min, max)) return;
    onChange(iso);
  };

  const openPicker = () => {
    const el = pickerRef.current;
    if (!el || disabled) return;
    try {
      if (typeof el.showPicker === 'function') el.showPicker();
      else el.click();
    } catch {
      el.click();
    }
  };

  return (
    <div className="relative" title={title}>
      <input
        id={inputId}
        name={name}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder={resolvedPlaceholder}
        disabled={disabled}
        required={required && !value}
        value={text}
        title={title}
        onChange={(e) => commitText(e.target.value)}
        onBlur={() => {
          if (!text) {
            onChange('');
            return;
          }
          const completed = withSuggestedYear(text);
          const iso = brToIso(completed);
          if (!iso || !inRange(iso, min, max)) {
            setText(isoToBr(value));
            return;
          }
          onChange(iso);
          setText(isoToBr(iso));
        }}
        className={cn('pr-10', className)}
      />
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        onClick={openPicker}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-400 hover:text-slate-600 disabled:opacity-40"
        aria-label="Abrir calendário"
      >
        <Calendar className="w-4 h-4" />
      </button>
      <input
        ref={pickerRef}
        type="date"
        tabIndex={-1}
        aria-hidden
        disabled={disabled}
        value={value || ''}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        className="sr-only absolute w-0 h-0 opacity-0 pointer-events-none"
      />
    </div>
  );
};
