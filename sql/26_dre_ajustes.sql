-- Ajustes manuais do DRE: motivo + valor anterior na célula vigente
-- e histórico append-only de cada registro.

ALTER TABLE public.dre_cell_edits
  ADD COLUMN IF NOT EXISTS motivo TEXT,
  ADD COLUMN IF NOT EXISTS previous_value NUMERIC;

CREATE TABLE IF NOT EXISTS public.dre_cell_edit_history (
  id BIGSERIAL PRIMARY KEY,
  year INTEGER NOT NULL,
  row_key INTEGER NOT NULL,
  row_label TEXT,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  field TEXT NOT NULL CHECK (field IN ('prev', 'real')),
  previous_value NUMERIC,
  new_value NUMERIC NOT NULL,
  motivo TEXT NOT NULL,
  user_name TEXT,
  user_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dre_cell_edit_history_year_created
  ON public.dre_cell_edit_history (year, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_dre_cell_edit_history_cell
  ON public.dre_cell_edit_history (year, row_key, month, field);
