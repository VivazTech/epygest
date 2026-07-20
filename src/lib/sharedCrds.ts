/** CRDs visíveis e utilizáveis por qualquer usuário, independente do setor vinculado. */
export const SHARED_CRD_CODES = ["326"] as const;

export function normalizeCrdCode(code: unknown): string {
  return String(code ?? "").trim().toLowerCase();
}

export function isSharedCrdCode(code: unknown): boolean {
  const normalized = normalizeCrdCode(code);
  return SHARED_CRD_CODES.some((shared) => normalizeCrdCode(shared) === normalized);
}
