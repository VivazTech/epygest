-- Lançamentos de pagamento de mensalidades/contratos
-- Fluxo: open → approved (Controle) → posted (Financeiro)

CREATE TABLE IF NOT EXISTS public.contrato_lancamentos (
  id            BIGSERIAL PRIMARY KEY,
  contrato_id   BIGINT NOT NULL REFERENCES public.contratos (id) ON DELETE CASCADE,
  user_id       BIGINT REFERENCES public.users (id) ON DELETE SET NULL,
  competencia   DATE NOT NULL,
  valor         NUMERIC(18, 2) NOT NULL DEFAULT 0,
  observacao    TEXT,
  status        TEXT NOT NULL DEFAULT 'open'
                CHECK (status IN ('open', 'approved', 'cancelled', 'posted')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contrato_lancamentos_contrato ON public.contrato_lancamentos (contrato_id);
CREATE INDEX IF NOT EXISTS idx_contrato_lancamentos_status ON public.contrato_lancamentos (status);
CREATE INDEX IF NOT EXISTS idx_contrato_lancamentos_competencia ON public.contrato_lancamentos (competencia);

ALTER TABLE public.contrato_lancamentos ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'contrato_lancamentos' AND policyname = 'contrato_lancamentos_all'
  ) THEN
    CREATE POLICY contrato_lancamentos_all ON public.contrato_lancamentos
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

GRANT ALL ON public.contrato_lancamentos TO authenticated, service_role;
GRANT SELECT ON public.contrato_lancamentos TO anon;
GRANT USAGE, SELECT ON SEQUENCE public.contrato_lancamentos_id_seq TO authenticated, service_role;
