-- Migração: vincular requisições internas ao CRD
-- Execute no Supabase SQL Editor.

ALTER TABLE public.requisitions
  ADD COLUMN IF NOT EXISTS crd_id BIGINT REFERENCES public.crds (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_requisitions_crd_id ON public.requisitions (crd_id);

-- Backfill opcional para bases antigas:
-- tenta inferir crd_id quando houver apenas um CRD ativo no setor.
UPDATE public.requisitions r
SET crd_id = c.id
FROM public.crds c
WHERE r.crd_id IS NULL
  AND r.sector_id = c.sector_id
  AND c.active = true
  AND (
    SELECT COUNT(*)
    FROM public.crds c2
    WHERE c2.sector_id = r.sector_id
      AND c2.active = true
  ) = 1;
