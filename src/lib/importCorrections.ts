/** Correções manuais em valores importados — tipos e configuração de campos. */

export type ImportCorrectionSourceTable =
  | 'requisicoes_rows'
  | 'rel_crd_rows'
  | 'consumo_interno_rows';

export type ImportCorrectionFieldConfig = {
  label: string;
  currency?: boolean;
  decimals?: number;
};

export const IMPORT_CORRECTION_SOURCES: Record<
  ImportCorrectionSourceTable,
  { label: string; fields: Record<string, ImportCorrectionFieldConfig> }
> = {
  requisicoes_rows: {
    label: 'Requisições',
    fields: {
      valor: { label: 'Valor', currency: true },
    },
  },
  rel_crd_rows: {
    label: 'Rel. CRD',
    fields: {
      saldo_lanc: { label: 'Saldo lanç.', currency: true },
      quantidade: { label: 'Quantidade', currency: false, decimals: 2 },
    },
  },
  consumo_interno_rows: {
    label: 'Consumo interno',
    fields: {
      quantidade: { label: 'Quantidade', currency: false, decimals: 2 },
      vl_liquido: { label: 'Valor líquido', currency: true },
    },
  },
};

export type ImportRowCorrection = {
  id: number;
  source_table: ImportCorrectionSourceTable | string;
  row_id: number;
  field_name: string;
  year: number;
  month: number;
  valor_original: number;
  valor_corrigido: number;
  row_label?: string | null;
  motivo?: string | null;
  user_name?: string | null;
  user_email?: string | null;
  updated_at?: string;
  created_at?: string;
};

export type ImportRowCorrectionHistory = ImportRowCorrection & {
  valor_anterior?: number | null;
  correction_id?: number | null;
};

export type CorrectableValueMeta = {
  value: number;
  valor_original: number;
  valor_corrigido?: number;
  is_corrected: boolean;
  correction_id?: number;
  corrected_by?: string | null;
  corrected_at?: string | null;
  motivo?: string | null;
};

export const isImportCorrectionSource = (v: string): v is ImportCorrectionSourceTable =>
  v in IMPORT_CORRECTION_SOURCES;

export const isImportCorrectionField = (
  source: ImportCorrectionSourceTable,
  field: string
): boolean => Boolean(IMPORT_CORRECTION_SOURCES[source]?.fields[field]);

export const correctionKey = (source: string, rowId: number, field: string) =>
  `${source}:${rowId}:${field}`;

export const buildCorrectionMap = (
  rows: Array<Pick<ImportRowCorrection, 'source_table' | 'row_id' | 'field_name' | 'valor_original' | 'valor_corrigido' | 'id' | 'motivo' | 'user_name' | 'updated_at'>>
): Map<string, ImportRowCorrection> => {
  const map = new Map<string, ImportRowCorrection>();
  for (const r of rows) {
    map.set(correctionKey(r.source_table, r.row_id, r.field_name), r as ImportRowCorrection);
  }
  return map;
};

export const applyFieldCorrection = (
  importedValue: number,
  correction: ImportRowCorrection | undefined
): CorrectableValueMeta => {
  const original = Number.isFinite(importedValue) ? importedValue : 0;
  if (!correction) {
    return {
      value: original,
      valor_original: original,
      is_corrected: false,
    };
  }
  const corrected = Number(correction.valor_corrigido);
  return {
    value: Number.isFinite(corrected) ? corrected : original,
    valor_original: Number(correction.valor_original) || original,
    valor_corrigido: corrected,
    is_corrected: true,
    correction_id: correction.id,
    corrected_by: correction.user_name || correction.user_email || null,
    corrected_at: correction.updated_at || correction.created_at || null,
    motivo: correction.motivo ?? null,
  };
};

export const parseCorrectionNumber = (raw: unknown): number | null => {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim().replace(/\s/g, '');
  let normalized = s;
  if (s.includes('.') && s.includes(',')) normalized = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) normalized = s.replace(',', '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
};
