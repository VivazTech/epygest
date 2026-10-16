-- Contratos e Mensalidades (Fase 4.8)
-- Lançamento e acompanhamento de contratos/mensalidades por setor e CRD.

CREATE TABLE IF NOT EXISTS public.contratos (
  id              BIGSERIAL PRIMARY KEY,
  fornecedor      TEXT NOT NULL,
  valor           NUMERIC(18, 2) NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'ativo'
                  CHECK (status IN ('ativo', 'vencido', 'pendente_assinatura', 'encerrado')),
  ativo           BOOLEAN NOT NULL DEFAULT TRUE,
  assinado        BOOLEAN NOT NULL DEFAULT FALSE,
  sector_id       BIGINT REFERENCES public.sectors (id) ON DELETE SET NULL,
  crd_id          BIGINT REFERENCES public.crds (id) ON DELETE SET NULL,
  vencimento      DATE,
  periodicidade   TEXT NOT NULL DEFAULT 'mensal'
                  CHECK (periodicidade IN ('unica', 'mensal', 'trimestral', 'semestral', 'anual')),
  responsavel     TEXT,
  observacoes     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contratos_status ON public.contratos (status);
CREATE INDEX IF NOT EXISTS idx_contratos_sector ON public.contratos (sector_id);
CREATE INDEX IF NOT EXISTS idx_contratos_vencimento ON public.contratos (vencimento);
CREATE INDEX IF NOT EXISTS idx_contratos_ativo ON public.contratos (ativo);

ALTER TABLE public.contratos ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'contratos' AND policyname = 'contratos_all'
  ) THEN
    CREATE POLICY contratos_all ON public.contratos
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

GRANT ALL ON public.contratos TO authenticated, service_role;
GRANT SELECT ON public.contratos TO anon;
GRANT USAGE, SELECT ON SEQUENCE public.contratos_id_seq TO authenticated, service_role;
