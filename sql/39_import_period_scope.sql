-- Competência/período nas importações: acompanhamento semanal vs fechamento mensal.
-- Evita somar semanal + mensal e permite desfazer por importação.

ALTER TABLE public.import_history
  ADD COLUMN IF NOT EXISTS import_scope TEXT CHECK (import_scope IN ('acompanhamento', 'fechamento')),
  ADD COLUMN IF NOT EXISTS period_key TEXT,
  ADD COLUMN IF NOT EXISTS week_index SMALLINT CHECK (week_index IS NULL OR (week_index >= 1 AND week_index <= 5));

CREATE INDEX IF NOT EXISTS idx_import_history_period
  ON public.import_history (source_type, year, month, period_key);

ALTER TABLE public.rel_crd_rows
  ADD COLUMN IF NOT EXISTS import_scope TEXT NOT NULL DEFAULT 'fechamento'
    CHECK (import_scope IN ('acompanhamento', 'fechamento')),
  ADD COLUMN IF NOT EXISTS period_key TEXT,
  ADD COLUMN IF NOT EXISTS week_index SMALLINT,
  ADD COLUMN IF NOT EXISTS import_history_id BIGINT REFERENCES public.import_history (id) ON DELETE SET NULL;

-- Migra registros antigos como fechamento mensal
UPDATE public.rel_crd_rows
SET
  import_scope = COALESCE(import_scope, 'fechamento'),
  period_key = COALESCE(
    period_key,
    year::TEXT || '-' || LPAD(month::TEXT, 2, '0') || '-FECHAMENTO'
  )
WHERE period_key IS NULL;

ALTER TABLE public.rel_crd_rows DROP CONSTRAINT IF EXISTS rel_crd_rows_year_month_codigo_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_rel_crd_rows_period_unique
  ON public.rel_crd_rows (year, month, codigo, import_scope, COALESCE(period_key, ''));

CREATE INDEX IF NOT EXISTS idx_rel_crd_rows_scope
  ON public.rel_crd_rows (year, month, import_scope);

CREATE INDEX IF NOT EXISTS idx_rel_crd_rows_import_history
  ON public.rel_crd_rows (import_history_id);

ALTER TABLE public.consumo_interno_rows
  ADD COLUMN IF NOT EXISTS import_history_id BIGINT REFERENCES public.import_history (id) ON DELETE SET NULL;

ALTER TABLE public.requisicoes_rows
  ADD COLUMN IF NOT EXISTS import_history_id BIGINT REFERENCES public.import_history (id) ON DELETE SET NULL;

ALTER TABLE public.crd_realizado
  ADD COLUMN IF NOT EXISTS import_scope TEXT,
  ADD COLUMN IF NOT EXISTS period_key TEXT,
  ADD COLUMN IF NOT EXISTS import_history_id BIGINT REFERENCES public.import_history (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_crd_realizado_import_history
  ON public.crd_realizado (import_history_id);
