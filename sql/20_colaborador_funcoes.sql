-- Funções (cargos) ↔ colaboradores (N:N).
-- Setores ↔ funções já existe via cargos.sector_id (1 setor : N funções).
-- Ao escolher a função principal do colaborador, o setor/ccusto é preenchido
-- automaticamente a partir de cargos.sector_id.

CREATE TABLE IF NOT EXISTS public.colaborador_funcoes (
  colaborador_id BIGINT NOT NULL REFERENCES public.colaboradores (id) ON DELETE CASCADE,
  cargo_id       BIGINT NOT NULL REFERENCES public.cargos (id) ON DELETE CASCADE,
  is_primary     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (colaborador_id, cargo_id)
);

CREATE INDEX IF NOT EXISTS idx_colaborador_funcoes_cargo
  ON public.colaborador_funcoes (cargo_id);

CREATE INDEX IF NOT EXISTS idx_colaborador_funcoes_primary
  ON public.colaborador_funcoes (colaborador_id)
  WHERE is_primary;

-- No máximo uma função principal por colaborador
CREATE UNIQUE INDEX IF NOT EXISTS uq_colaborador_funcoes_one_primary
  ON public.colaborador_funcoes (colaborador_id)
  WHERE is_primary;

ALTER TABLE public.colaborador_funcoes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'colaborador_funcoes' AND policyname = 'colaborador_funcoes_all'
  ) THEN
    CREATE POLICY colaborador_funcoes_all ON public.colaborador_funcoes
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

GRANT ALL ON public.colaborador_funcoes TO authenticated, service_role;
GRANT SELECT ON public.colaborador_funcoes TO anon;
