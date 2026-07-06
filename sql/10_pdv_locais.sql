-- Locais PDV: pontos de venda para lançamento de comandas
CREATE TABLE IF NOT EXISTS public.pdv_locais (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pdv_locais_name_unique UNIQUE (name)
);

CREATE INDEX IF NOT EXISTS idx_pdv_locais_active ON public.pdv_locais (active);
CREATE INDEX IF NOT EXISTS idx_pdv_locais_sort_order ON public.pdv_locais (sort_order);
