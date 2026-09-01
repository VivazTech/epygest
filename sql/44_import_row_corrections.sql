-- Correções manuais excepcionais em valores importados (com auditoria).

CREATE TABLE IF NOT EXISTS public.import_row_corrections (
  id BIGSERIAL PRIMARY KEY,
  source_table TEXT NOT NULL
    CHECK (source_table IN ('requisicoes_rows', 'rel_crd_rows', 'consumo_interno_rows')),
  row_id BIGINT NOT NULL,
  field_name TEXT NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  valor_original NUMERIC NOT NULL,
  valor_corrigido NUMERIC NOT NULL,
  row_label TEXT,
  motivo TEXT NOT NULL,
  user_id TEXT,
  user_name TEXT,
  user_email TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source_table, row_id, field_name)
);

CREATE TABLE IF NOT EXISTS public.import_row_correction_history (
  id BIGSERIAL PRIMARY KEY,
  correction_id BIGINT REFERENCES public.import_row_corrections (id) ON DELETE SET NULL,
  source_table TEXT NOT NULL,
  row_id BIGINT NOT NULL,
  field_name TEXT NOT NULL,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  valor_original NUMERIC NOT NULL,
  valor_anterior NUMERIC,
  valor_corrigido NUMERIC NOT NULL,
  row_label TEXT,
  motivo TEXT NOT NULL,
  user_id TEXT,
  user_name TEXT,
  user_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_import_row_corrections_lookup
  ON public.import_row_corrections (source_table, row_id);

CREATE INDEX IF NOT EXISTS idx_import_row_corrections_comp
  ON public.import_row_corrections (source_table, year, month);

CREATE INDEX IF NOT EXISTS idx_import_row_correction_history_row
  ON public.import_row_correction_history (source_table, row_id, field_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_import_row_correction_history_comp
  ON public.import_row_correction_history (year, month, created_at DESC);
