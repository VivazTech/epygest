export const STORAGE_BUCKET = "invoice-files";
export const STORAGE_PREFIXES = ["invoices", "receipts", "boletos", "manual-entries"] as const;

export type StorageDocumentField = "file_path" | "boleto_file_path" | "payment_receipt_path";

/** Converte o valor salvo no banco (path ou URL Supabase) no object path do bucket. */
export function normalizeStorageObjectPath(raw: string | null | undefined): string | null {
  let path = String(raw ?? "").trim();
  if (!path) return null;

  try {
    if (/%[0-9a-f]{2}/i.test(path)) path = decodeURIComponent(path);
  } catch {
    // mantém path original
  }

  if (/^https?:\/\//i.test(path)) {
    const extracted =
      path.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/invoice-files\/([^?#]+)/i)?.[1] ??
      path.match(/\/invoice-files\/([^?#]+)/i)?.[1];
    if (!extracted) return null;
    try {
      path = decodeURIComponent(extracted);
    } catch {
      path = extracted;
    }
  }

  path = path.replace(/\\/g, "/").replace(/^\/+/, "");
  if (path.toLowerCase().startsWith(`${STORAGE_BUCKET}/`)) {
    path = path.slice(STORAGE_BUCKET.length + 1);
  }

  const prefix = path.split("/")[0];
  if (!STORAGE_PREFIXES.includes(prefix as (typeof STORAGE_PREFIXES)[number]) || path.includes("..")) {
    return null;
  }

  return path;
}

/** URL HTTP que pode ser aberta diretamente (não é object path do Supabase). */
export function isDirectDocumentUrl(path: string): boolean {
  return /^https?:\/\//i.test(path) && !/\/storage\/v1\/object\//i.test(path);
}

export function collectBoletoPaths(invoice: {
  boleto_file_path?: string | null;
  boleto_file_paths?: unknown;
}): string[] {
  const extra = invoice.boleto_file_paths;
  let fromJson: string[] = [];
  if (Array.isArray(extra)) {
    fromJson = extra.map((p) => String(p ?? "").trim()).filter(Boolean);
  } else if (typeof extra === "string" && extra.trim()) {
    try {
      const parsed = JSON.parse(extra);
      if (Array.isArray(parsed)) {
        fromJson = parsed.map((p) => String(p ?? "").trim()).filter(Boolean);
      }
    } catch {
      // ignora JSON inválido
    }
  }
  if (fromJson.length) return fromJson;
  const first = String(invoice.boleto_file_path ?? "").trim();
  return first ? [first] : [];
}
