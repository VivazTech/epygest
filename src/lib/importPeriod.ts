/** Escopo da importação: acompanhamento (semanal) vs fechamento (consolidado mensal). */
export type ImportScope = 'acompanhamento' | 'fechamento';

export const IMPORT_SCOPE_LABELS: Record<ImportScope, string> = {
  acompanhamento: 'Acompanhamento semanal',
  fechamento: 'Fechamento mensal',
};

export function buildPeriodKey(
  year: number,
  month: number,
  scope: ImportScope,
  weekIndex?: number | null
): string {
  const ym = `${year}-${String(month).padStart(2, '0')}`;
  if (scope === 'fechamento') return `${ym}-FECHAMENTO`;
  const week = Number(weekIndex);
  if (!Number.isFinite(week) || week < 1 || week > 5) return `${ym}-S?`;
  return `${ym}-S${week}`;
}

export function formatPeriodLabel(
  year: number | null | undefined,
  month: number | null | undefined,
  scope?: string | null,
  weekIndex?: number | null,
  periodKey?: string | null
): string {
  if (periodKey) return periodKey;
  if (!year || !month) return '—';
  const ym = `${String(month).padStart(2, '0')}/${year}`;
  if (scope === 'fechamento') return `Fechamento ${ym}`;
  if (scope === 'acompanhamento' && weekIndex) return `Semana ${weekIndex} · ${ym}`;
  return ym;
}

export function defaultRelCrdDestinosForScope(scope: ImportScope): { D: boolean; M: boolean } {
  return scope === 'acompanhamento' ? { D: true, M: false } : { D: false, M: true };
}

/** Sugere a semana do mês (1–5) com base no dia corrente. */
export function suggestWeekIndexInMonth(date: Date = new Date()): number {
  const day = date.getDate();
  return Math.min(5, Math.max(1, Math.ceil(day / 7)));
}

export type ParsedImportPeriod = {
  scope: ImportScope;
  weekIndex: number | null;
  periodKey: string;
};

export function parseImportPeriodInput(
  year: number,
  month: number,
  import_scope?: string | null,
  week_index?: number | string | null
): ParsedImportPeriod | { error: string } {
  const scope: ImportScope = import_scope === 'acompanhamento' ? 'acompanhamento' : 'fechamento';
  const weekIndex = Number(week_index);
  if (scope === 'acompanhamento' && (!Number.isFinite(weekIndex) || weekIndex < 1 || weekIndex > 5)) {
    return { error: 'Informe a semana (1 a 5) para importação de acompanhamento.' };
  }
  const periodKey = buildPeriodKey(
    year,
    month,
    scope,
    scope === 'acompanhamento' ? weekIndex : null
  );
  return {
    scope,
    weekIndex: scope === 'acompanhamento' ? weekIndex : null,
    periodKey,
  };
}
