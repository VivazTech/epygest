-- Escopo/período semanal em Consumo Interno e Requisições Sintética.

ALTER TABLE public.consumo_interno_rows
  ADD COLUMN IF NOT EXISTS import_scope TEXT NOT NULL DEFAULT 'fechamento'
    CHECK (import_scope IN ('acompanhamento', 'fechamento')),
  ADD COLUMN IF NOT EXISTS period_key TEXT,
  ADD COLUMN IF NOT EXISTS week_index SMALLINT;

UPDATE public.consumo_interno_rows
SET
  import_scope = COALESCE(import_scope, 'fechamento'),
  period_key = COALESCE(
    period_key,
    year::TEXT || '-' || LPAD(month::TEXT, 2, '0') || '-FECHAMENTO'
  )
WHERE period_key IS NULL;

CREATE INDEX IF NOT EXISTS idx_consumo_interno_rows_scope
  ON public.consumo_interno_rows (year, month, import_scope);

CREATE INDEX IF NOT EXISTS idx_consumo_interno_rows_period
  ON public.consumo_interno_rows (year, month, period_key);

ALTER TABLE public.requisicoes_rows
  ADD COLUMN IF NOT EXISTS import_scope TEXT NOT NULL DEFAULT 'fechamento'
    CHECK (import_scope IN ('acompanhamento', 'fechamento')),
  ADD COLUMN IF NOT EXISTS period_key TEXT,
  ADD COLUMN IF NOT EXISTS week_index SMALLINT;

UPDATE public.requisicoes_rows
SET
  import_scope = COALESCE(import_scope, 'fechamento'),
  period_key = COALESCE(
    period_key,
    year::TEXT || '-' || LPAD(month::TEXT, 2, '0') || '-FECHAMENTO'
  )
WHERE period_key IS NULL;

ALTER TABLE public.requisicoes_rows DROP CONSTRAINT IF EXISTS requisicoes_rows_year_month_setor_codigo_grupo_codigo_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_requisicoes_rows_period_unique
  ON public.requisicoes_rows (year, month, setor_codigo, grupo_codigo, import_scope, COALESCE(period_key, ''));

CREATE INDEX IF NOT EXISTS idx_requisicoes_rows_scope
  ON public.requisicoes_rows (year, month, import_scope);
