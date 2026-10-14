export type InvoiceDuplicateRow = {
  id: number;
  invoice_number?: string | null;
  protocol?: string | null;
  provider_name?: string | null;
  flow_stage?: string | null;
};

/** Número comparável: sem #, espaços e separadores. */
export const invoiceNumberKey = (value: unknown) =>
  String(value ?? "")
    .trim()
    .replace(/^#+/, "")
    .replace(/[\s.\-/]/g, "")
    .toLowerCase();

/** "0" ou vazio vem de PDF sem número — não identifica uma nota real. */
export const isBlankInvoiceNumber = (key: string) => !key || /^0+$/.test(key);

export const providerNameKey = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();

/**
 * Duplicata: mesmo número de nota e mesmo fornecedor, em lançamento que não foi cancelado.
 * O número sozinho não basta — fornecedores diferentes podem ter o mesmo número.
 */
export const findInvoiceDuplicate = (
  rows: InvoiceDuplicateRow[],
  invoiceNumber: unknown,
  providerName: unknown,
  ignoreId?: number
) => {
  const numberKey = invoiceNumberKey(invoiceNumber);
  if (isBlankInvoiceNumber(numberKey)) return null;
  const providerKey = providerNameKey(providerName);
  if (!providerKey) return null;

  return (
    rows.find((row) => {
      if (ignoreId != null && Number(row.id) === Number(ignoreId)) return false;
      if (String(row.flow_stage || "") === "cancelled") return false;
      return (
        invoiceNumberKey(row.invoice_number) === numberKey &&
        providerNameKey(row.provider_name) === providerKey
      );
    }) ?? null
  );
};
