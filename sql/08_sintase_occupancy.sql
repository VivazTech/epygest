-- Ocupação da Síntase por ano (percentual de liberação)
-- Execute no Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.sintase_occupancy (
  id BIGSERIAL PRIMARY KEY,
  year INTEGER NOT NULL UNIQUE,
  occupancy_percent NUMERIC(5, 2) NOT NULL DEFAULT 100 CHECK (occupancy_percent >= 0 AND occupancy_percent <= 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.set_sintase_occupancy_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sintase_occupancy_updated_at ON public.sintase_occupancy;

CREATE TRIGGER trg_sintase_occupancy_updated_at
BEFORE UPDATE ON public.sintase_occupancy
FOR EACH ROW
EXECUTE FUNCTION public.set_sintase_occupancy_updated_at();
