-- Migração de campos financeiros no cadastro de CRD
-- Execute no Supabase SQL Editor

ALTER TABLE public.crds
  ADD COLUMN IF NOT EXISTS natureza TEXT NOT NULL DEFAULT 'O';

ALTER TABLE public.crds
  ADD COLUMN IF NOT EXISTS saldo_anterior NUMERIC(18, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.crds
  ADD COLUMN IF NOT EXISTS previsto_mes NUMERIC(18, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.crds
  ADD COLUMN IF NOT EXISTS disponivel_mes NUMERIC(18, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.crds
  ADD COLUMN IF NOT EXISTS realizado_mes NUMERIC(18, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.crds
  ADD COLUMN IF NOT EXISTS saldo NUMERIC(18, 2) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'crds_natureza_check'
  ) THEN
    ALTER TABLE public.crds
      ADD CONSTRAINT crds_natureza_check CHECK (natureza IN ('M', 'O'));
  END IF;
END $$;
