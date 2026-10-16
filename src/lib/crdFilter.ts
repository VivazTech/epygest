/** Filtro de listagem por código CRD (auditoria previsto × realizado). */

import type { SearchableSelectOption } from '../components/SearchableSelect';

export function normalizeCrdFilterCode(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

/**
 * Código contábil costuma vir entre parênteses no nome
 * (ex.: "DESPESA COMERCIAL … (352)" → "352").
 * O campo `code` às vezes é só a linha do setor (ex.: "7").
 */
export function extractCrdAccountCode(name: unknown): string | null {
  const m = String(name ?? '').trim().match(/\((\d{2,6})\)\s*$/);
  return m ? m[1] : null;
}

export function resolveCrdDisplayCodes(crd: {
  code?: string | null;
  name?: string | null;
}): { internalCode: string; displayCode: string; name: string } {
  const internalCode = String(crd.code ?? '').trim();
  const name = String(crd.name ?? '').trim();
  const account = extractCrdAccountCode(name);
  return {
    internalCode,
    displayCode: account || internalCode,
    name,
  };
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
    if (codePart === filter) return true;
    // Nome com código contábil entre parênteses
    const account = extractCrdAccountCode(raw);
    return account != null && normalizeCrdFilterCode(account) === filter;
  });
}

type CrdLike = {
  code?: string | null;
  name?: string | null;
  sector_id?: number | string | null;
  sector_name?: string | null;
  active?: boolean | null;
};

export function buildCrdFilterOptions(crds: CrdLike[]): SearchableSelectOption[] {
  const seen = new Set<string>();
  const options: SearchableSelectOption[] = [];

  for (const crd of crds) {
    if (crd.active === false) continue;
    const { internalCode, displayCode, name } = resolveCrdDisplayCodes(crd);
    if (!internalCode && !displayCode) continue;
    const key = normalizeCrdFilterCode(displayCode);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const sector = String(crd.sector_name ?? '').trim();
    options.push({
      value: displayCode,
      label: name ? `${displayCode} — ${name}` : displayCode,
      keywords: `${displayCode} ${internalCode} ${name} ${sector}`,
    });
  }

  options.sort((a, b) =>
    a.value.localeCompare(b.value, 'pt-BR', { numeric: true, sensitivity: 'base' })
  );

  return [{ value: '', label: 'Todos os CRDs' }, ...options];
}
