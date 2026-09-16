/** Protocolos internos de lançamento (controladoria). */

export const PROTOCOL_PREFIX = {
  comanda: 'COM',
  manual: 'MAN',
  estorno: 'EST',
  requisicao: 'REQ',
  nota: 'NOT',
  danfe: 'DAN',
  mensalidade: 'MEN',
} as const;

export type ProtocolKind = keyof typeof PROTOCOL_PREFIX;

export function invoiceProtocolPrefix(invoiceNumber: unknown): 'NOT' | 'DAN' {
  const digits = String(invoiceNumber ?? '').replace(/\D/g, '');
  return digits.length === 44 ? 'DAN' : 'NOT';
}
