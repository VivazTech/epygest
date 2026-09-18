import type { Request } from "express";
import {
  COMPANY_HEADER,
  DEFAULT_COMPANY_KEY,
  isCompanyKey,
  type CompanyKey,
} from "./companies.js";

/**
 * Tabelas com coluna empresa_key (isolamento Vivaz / Aquamania).
 * Globais (sem coluna): users, app_roles, role_permissions, payment_methods,
 * currencies, tangerino_empresas, password_reset_tokens, document_sequences, user_empresas.
 */
export const EMPRESA_SCOPED_TABLES = new Set([
  "sectors",
  "crds",
  "invoices",
  "invoice_edit_history",
  "manual_entries",
  "requisitions",
  "comandas",
  "comanda_items",
  "estornos",
  "investimentos",
  "contratos",
  "contrato_lancamentos",
  "crd_monthly_values",
  "financial_records",
  "orcamento_ajustes",
  "crd_realizado",
  "colaboradores",
  "colaborador_funcoes",
  "cargos",
  "categories",
  "scenarios",
  "pdv_locais",
  "sintase_occupancy",
  "rds_snapshots",
  "import_history",
  "import_row_corrections",
  "import_row_correction_history",
  "rel_crd_rows",
  "requisicoes_rows",
  "consumo_interno_rows",
  "dre_cell_edits",
  "dre_cell_edit_history",
  "indicadores_mensais",
  "indicadores_parametros",
  "painel_observacoes",
  "painel_ab_quebras",
  "painel_ab_sobras",
  "painel_nutri_acoes",
  "painel_controladoria_semanal",
  "cmv_apuracao",
  "cmv_apuracao_historico",
  "cmv_tarifas_config",
  "cmv_meta_config",
  "uso_consumo_subgrupos",
  "user_suggestions",
  "folha_funcionarios",
  "folha_pagamento",
  "folha_lancamentos",
  "folha_lancamentos_importados",
  "folha_importacoes",
  "folha_setores",
  "folha_cargos",
  "folha_config",
  "folha_custo_manual",
  "folha_rubricas",
  "folha_rubricas_parametros",
  "folha_rubricas_ignoradas",
  "folha_parametros_encargos",
  "folha_apuracoes_mensais",
  "folha_apuracao_auditoria",
  "folha_situacoes_resumo",
  "folha_absenteismo_config",
  "folha_absenteismo_mensal",
  "folha_turnover_config",
  "folha_turnover_mensal",
  "folha_turnover_movimentos",
  "folha_provisao_ferias",
  "folha_provisao_13",
  "folha_fgts_guia_mensal",
  "folha_taxa_servico_mensal",
  "folha_emprestimos_consignados",
  "folha_emprestimos_conciliacao_mensal",
  "folha_emprestimos_divergencias",
  "tangerino_importacoes",
  "tangerino_colaborador_vinculo",
  "tangerino_ponto_mensal",
]);

export const readEmpresaKeyFromRequest = (req: Request): CompanyKey => {
  const headerName = COMPANY_HEADER.toLowerCase();
  const raw = String(
    req.headers[headerName] ||
      req.headers["x-empresa-key"] ||
      ""
  ).trim();
  return isCompanyKey(raw) ? raw : DEFAULT_COMPANY_KEY;
};

export const empresaKeyOf = (req: Request): CompanyKey =>
  req.empresaKey || DEFAULT_COMPANY_KEY;

/** Prefixo de protocolo por empresa (Aqua ≠ Vivaz). */
export const protocolPrefixForEmpresa = (prefix: string, empresaKey: CompanyKey): string => {
  const base = String(prefix || "").trim().toUpperCase();
  if (!base) return base;
  if (empresaKey === "aqua") return `A-${base}`;
  return base;
};

/** Aplica filtro de empresa em queries Supabase (.eq). */
export const filterByEmpresa = (query: any, req: Request, table?: string): any => {
  if (table && !EMPRESA_SCOPED_TABLES.has(table)) return query;
  return query.eq("empresa_key", empresaKeyOf(req));
};

export const filterByEmpresaKey = (query: any, empresaKey: CompanyKey, table?: string): any => {
  if (table && !EMPRESA_SCOPED_TABLES.has(table)) return query;
  return query.eq("empresa_key", empresaKey);
};

export const withEmpresaKey = <T extends Record<string, unknown>>(
  row: T,
  req: Request
): T & { empresa_key: CompanyKey } => ({
  ...row,
  empresa_key: empresaKeyOf(req),
});

export const withEmpresaKeyValue = <T extends Record<string, unknown>>(
  row: T,
  empresaKey: CompanyKey
): T & { empresa_key: CompanyKey } => ({
  ...row,
  empresa_key: empresaKey,
});

/** Encadeia .eq('empresa_key') em update/delete por id. */
export const scopeByEmpresa = (query: any, req: Request): any =>
  query.eq("empresa_key", empresaKeyOf(req));

export const rowBelongsToEmpresa = (row: { empresa_key?: string | null } | null | undefined, req: Request) => {
  if (!row) return false;
  const key = String(row.empresa_key || DEFAULT_COMPANY_KEY);
  return key === empresaKeyOf(req);
};
