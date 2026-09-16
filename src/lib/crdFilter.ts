/** Filtro de listagem por código CRD (auditoria previsto × realizado). */

import type { SearchableSelectOption } from '../components/SearchableSelect';

export function normalizeCrdFilterCode(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

/** Match exato pelo código (ex.: 352). Aceita também rótulos "352 — Nome". */
export function matchesCrdCodeFilter(filterCode: string, ...candidates: unknown[]): boolean {
  const filter = normalizeCrdFilterCode(filterCode);
  if (!filter) return true;

  return candidates.some((candidate) => {
    const raw = String(candidate ?? '').trim();
    if (!raw) return false;
    const normalized = normalizeCrdFilterCode(raw);
    if (normalized === filter) return true;
    const codePart = normalized.split(/\s*[—\-–]\s*/)[0]?.trim() || '';
    return codePart === filter;
  });
}

type CrdLike = {
  code?: string | null;
  name?: string | null;
  sector_name?: string | null;
  active?: boolean | null;
};

export function buildCrdFilterOptions(crds: CrdLike[]): SearchableSelectOption[] {
  const seen = new Set<string>();
  const options: SearchableSelectOption[] = [];

  for (const crd of crds) {
    if (crd.active === false) continue;
    const code = String(crd.code ?? '').trim();
    if (!code) continue;
    const key = normalizeCrdFilterCode(code);
    if (seen.has(key)) continue;
    seen.add(key);
    const name = String(crd.name ?? '').trim();
    const sector = String(crd.sector_name ?? '').trim();
    options.push({
      value: code,
      label: name ? `${code} — ${name}` : code,
      keywords: `${code} ${name} ${sector}`,
    });
  }

  options.sort((a, b) =>
    a.value.localeCompare(b.value, 'pt-BR', { numeric: true, sensitivity: 'base' })
  );

  return [{ value: '', label: 'Todos os CRDs' }, ...options];
}
