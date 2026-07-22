-- DRE Gerencial: edições manuais por célula (sobrepõem os valores importados
-- da planilha Prev x Real). A linha é identificada pelo número da linha na
-- planilha (row_key), o mesmo usado em src/data/dre2026.json.

CREATE TABLE IF NOT EXISTS public.dre_cell_edits (
  id BIGSERIAL PRIMARY KEY,
  year INTEGER NOT NULL,
  row_key INTEGER NOT NULL,
  row_label TEXT,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  field TEXT NOT NULL CHECK (field IN ('prev', 'real')),
  value NUMERIC NOT NULL,
  user_name TEXT,
  user_email TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (year, row_key, month, field)
);

CREATE INDEX IF NOT EXISTS idx_dre_cell_edits_year ON public.dre_cell_edits (year);
