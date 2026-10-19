/** Protocolos internos de lançamento (controladoria). */

export const PROTOCOL_PREFIX = {
  comanda: 'COM',
  manual: 'MAN',
  estorno: 'EST',
  requisicao: 'REQ',
  nota: 'NOT',
  danfe: 'DAN',
  mensalidade: 'MEN',
  ordem: 'ORD',
} as const;

export type ProtocolKind = keyof typeof PROTOCOL_PREFIX;

export type InvoiceDocType = 'danfe' | 'nota';

/** Classificação pelo número: chave de 44 dígitos é DANFE. */
export function inferInvoiceDocTypeFromNumber(invoiceNumber: unknown): InvoiceDocType {
  const digits = String(invoiceNumber ?? '').replace(/\D/g, '');
  return digits.length === 44 ? 'danfe' : 'nota';
}

/**
 * Lista do lançamento. `doc_type` preenchido vale sobre o número da nota,
 * para a edição mover o registro sem alterar o fluxo nem o protocolo.
 */
export function resolveInvoiceDocType(invoice: {
  invoice_number?: unknown;
  doc_type?: unknown;
}): InvoiceDocType {
  const stored = String(invoice.doc_type ?? '').trim().toLowerCase();
  if (stored === 'danfe') return 'danfe';
  if (stored === 'nota' || stored === 'servico') return 'nota';
  return inferInvoiceDocTypeFromNumber(invoice.invoice_number);
}

export function invoiceDocTypeLabel(docType: InvoiceDocType): string {
  return docType === 'danfe' ? 'DANFE' : 'Nota Fiscal de Serviço';
}

export function invoiceProtocolPrefix(invoiceNumber: unknown): 'NOT' | 'DAN' {
  return inferInvoiceDocTypeFromNumber(invoiceNumber) === 'danfe' ? 'DAN' : 'NOT';
}
