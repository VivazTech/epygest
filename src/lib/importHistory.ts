import type { SessionUser } from "./auth.js";
import { supabase } from "./supabase.js";

export type ImportHistoryStatus = "success" | "error";

export type ImportHistorySource =
  | "consumo_interno"
  | "extrato_mensal"
  | "crds"
  | "orcamento"
  | "ajustes"
  | "rel_crd"
  | "requisicoes_sintetica"
  | "rds";

export const IMPORT_SOURCE_LABELS: Record<ImportHistorySource, string> = {
  consumo_interno: "Consumo interno",
  extrato_mensal: "Extrato mensal / Folha",
  crds: "CRDs",
  orcamento: "Orçamento",
  ajustes: "Ajustes",
  rel_crd: "Rel. CRD",
  requisicoes_sintetica: "Requisições Sintética",
  rds: "Relatório Diário de Situação",
};

export type ImportHistoryLogInput = {
  source_type: ImportHistorySource;
  file_name?: string | null;
  status: ImportHistoryStatus;
  year?: number | null;
  month?: number | null;
  import_scope?: 'acompanhamento' | 'fechamento' | null;
  period_key?: string | null;
  week_index?: number | null;
  records_count?: number | null;
  total_amount?: number | null;
  user?: SessionUser | null;
  summary?: Record<string, unknown>;
  error_message?: string | null;
};

export const logImportHistory = async (input: ImportHistoryLogInput): Promise<number | null> => {
  const { data, error } = await supabase
    .from("import_history")
    .insert({
      source_type: input.source_type,
      file_name: input.file_name ?? null,
      status: input.status,
      year: Number.isFinite(Number(input.year)) ? Number(input.year) : null,
      month: Number.isFinite(Number(input.month)) ? Number(input.month) : null,
      import_scope: input.import_scope ?? null,
      period_key: input.period_key ?? null,
      week_index:
        Number.isFinite(Number(input.week_index)) && Number(input.week_index) > 0
          ? Number(input.week_index)
          : null,
      records_count: Number.isFinite(Number(input.records_count)) ? Number(input.records_count) : null,
      total_amount: Number.isFinite(Number(input.total_amount)) ? Number(input.total_amount) : null,
      user_id: input.user?.id !== undefined && input.user?.id !== null ? Number(input.user.id) : null,
      user_name: input.user?.name ?? null,
      user_email: input.user?.email ?? null,
      summary: input.summary ?? {},
      error_message: input.error_message ?? null,
    })
    .select("id")
    .single();

  if (error) {
    console.error("Erro ao registrar histórico de importação:", error.message);
    return null;
  }
  return data?.id != null ? Number(data.id) : null;
};
