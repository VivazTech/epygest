-- Cargos vinculados a setores / centros de custo (Cadastros e Parametrizações).
-- Usados no select de cargo ao importar a folha.

CREATE TABLE IF NOT EXISTS public.cargos (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  sector_id   BIGINT NOT NULL REFERENCES public.sectors (id) ON DELETE CASCADE,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cargos_sector_id ON public.cargos (sector_id);
CREATE INDEX IF NOT EXISTS idx_cargos_active ON public.cargos (active);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cargos_sector_name
  ON public.cargos (sector_id, lower(trim(name)));
