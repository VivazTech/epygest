-- Valores mensais por CRD na Síntase (por ano e mês)
-- Execute no Supabase SQL Editor antes de usar edição por célula na Síntase.

CREATE TABLE IF NOT EXISTS public.crd_monthly_values (
  id BIGSERIAL PRIMARY KEY,
  crd_id BIGINT NOT NULL REFERENCES public.crds (id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  value NUMERIC(18, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (crd_id, year, month)
);

CREATE INDEX IF NOT EXISTS idx_crd_monthly_values_year ON public.crd_monthly_values (year);
CREATE INDEX IF NOT EXISTS idx_crd_monthly_values_crd ON public.crd_monthly_values (crd_id);

CREATE OR REPLACE FUNCTION public.set_crd_monthly_values_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_crd_monthly_values_updated_at ON public.crd_monthly_values;

CREATE TRIGGER trg_crd_monthly_values_updated_at
BEFORE UPDATE ON public.crd_monthly_values
FOR EACH ROW
EXECUTE FUNCTION public.set_crd_monthly_values_updated_at();
