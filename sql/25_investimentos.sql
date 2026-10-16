-- Investimentos (Fase 4.7)
-- Acompanhamento previsto / lançado / realizado por setor e CRD.

CREATE TABLE IF NOT EXISTS public.investimentos (
  id                BIGSERIAL PRIMARY KEY,
  nome              TEXT NOT NULL,
  valor_previsto    NUMERIC(18, 2) NOT NULL DEFAULT 0,
  valor_lancado     NUMERIC(18, 2) NOT NULL DEFAULT 0,
  valor_realizado   NUMERIC(18, 2) NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'planejado'
                    CHECK (status IN ('planejado', 'em_andamento', 'concluido', 'cancelado')),
  sector_id         BIGINT REFERENCES public.sectors (id) ON DELETE SET NULL,
  crd_id            BIGINT REFERENCES public.crds (id) ON DELETE SET NULL,
  responsavel       TEXT,
  observacoes       TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_investimentos_status ON public.investimentos (status);
CREATE INDEX IF NOT EXISTS idx_investimentos_sector ON public.investimentos (sector_id);
CREATE INDEX IF NOT EXISTS idx_investimentos_crd ON public.investimentos (crd_id);

ALTER TABLE public.investimentos ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'investimentos' AND policyname = 'investimentos_all'
  ) THEN
    CREATE POLICY investimentos_all ON public.investimentos
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

GRANT ALL ON public.investimentos TO authenticated, service_role;
GRANT SELECT ON public.investimentos TO anon;
GRANT USAGE, SELECT ON SEQUENCE public.investimentos_id_seq TO authenticated, service_role;
