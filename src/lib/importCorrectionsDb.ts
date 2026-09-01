import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildCorrectionMap,
  correctionKey,
  type ImportCorrectionSourceTable,
  type ImportRowCorrection,
} from './importCorrections.js';

export const mapCorrectionRow = (row: any): ImportRowCorrection => ({
  id: Number(row.id),
  source_table: String(row.source_table),
  row_id: Number(row.row_id),
  field_name: String(row.field_name),
  year: Number(row.year),
  month: Number(row.month),
  valor_original: Number(row.valor_original) || 0,
  valor_corrigido: Number(row.valor_corrigido) || 0,
  row_label: row.row_label ?? null,
  motivo: row.motivo ?? null,
  user_name: row.user_name ?? null,
  user_email: row.user_email ?? null,
  updated_at: row.updated_at ?? null,
  created_at: row.created_at ?? null,
});

export const fetchCorrectionsForRows = async (
  supabase: SupabaseClient,
  sourceTable: ImportCorrectionSourceTable,
  rowIds: number[]
): Promise<Map<string, ImportRowCorrection>> => {
  const ids = Array.from(new Set(rowIds.filter((id) => Number.isFinite(id) && id > 0)));
  if (!ids.length) return new Map();
  const { data, error } = await supabase
    .from('import_row_corrections')
    .select('*')
    .eq('source_table', sourceTable)
    .in('row_id', ids);
  if (error) {
    console.error('import_row_corrections select:', error);
    return new Map();
  }
  return buildCorrectionMap((data ?? []).map(mapCorrectionRow));
};

export const fetchCorrectionsForCompetencia = async (
  supabase: SupabaseClient,
  sourceTable: ImportCorrectionSourceTable,
  year: number,
  month: number
): Promise<Map<string, ImportRowCorrection>> => {
  const { data, error } = await supabase
    .from('import_row_corrections')
    .select('*')
    .eq('source_table', sourceTable)
    .eq('year', year)
    .eq('month', month);
  if (error) {
    console.error('import_row_corrections competencia:', error);
    return new Map();
  }
  return buildCorrectionMap((data ?? []).map(mapCorrectionRow));
};

export const getCorrectionFromMap = (
  map: Map<string, ImportRowCorrection>,
  sourceTable: string,
  rowId: number,
  fieldName: string
) => map.get(correctionKey(sourceTable, rowId, fieldName));
