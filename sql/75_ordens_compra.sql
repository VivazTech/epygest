-- Ordens de compra geradas em Compras.
-- Fluxo: open (ou pending_manager para estagiário) → approved (Controle) → posted (Financeiro)

CREATE TABLE IF NOT EXISTS public.ordens_compra (
  id                    BIGSERIAL PRIMARY KEY,
  empresa_key           TEXT NOT NULL DEFAULT 'vivaz',
  protocol              TEXT,
  user_id               BIGINT REFERENCES public.users (id) ON DELETE SET NULL,
  data_execucao         DATE,
  prestador             TEXT NOT NULL,
  telefone              TEXT,
  servico_executado     TEXT,
  servico_sector_id     BIGINT REFERENCES public.sectors (id) ON DELETE SET NULL,
  servico_crd_id        BIGINT REFERENCES public.crds (id) ON DELETE SET NULL,
  materiais_descricao   TEXT,
  materiais_sector_id   BIGINT REFERENCES public.sectors (id) ON DELETE SET NULL,
  materiais_crd_id      BIGINT REFERENCES public.crds (id) ON DELETE SET NULL,
  valor                 NUMERIC(18, 2) NOT NULL CHECK (valor >= 0),
  faturamento           TEXT CHECK (faturamento IS NULL OR faturamento IN ('nf_recibo', 'recibo')),
  pagamento             TEXT CHECK (pagamento IS NULL OR pagamento IN ('cartao', 'avista', 'boleto', 'pix', 'transferencia')),
  pix_chave             TEXT,
  banco                 TEXT,
  agencia               TEXT,
  conta_corrente        TEXT,
  cnpj_cpf              TEXT,
  nome_titular          TEXT,
  observacao            TEXT,
  solicitado_por        TEXT,
  nota_file_path        TEXT,
  nota_file_name        TEXT,
  recibo_file_path      TEXT,
  recibo_file_name      TEXT,
  boleto_file_path      TEXT,
  boleto_file_name      TEXT,
  status                TEXT NOT NULL DEFAULT 'open'
                        CHECK (status IN ('pending_manager', 'open', 'approved', 'cancelled', 'posted')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ordens_compra_empresa_key ON public.ordens_compra (empresa_key);
CREATE INDEX IF NOT EXISTS idx_ordens_compra_status ON public.ordens_compra (status);
CREATE INDEX IF NOT EXISTS idx_ordens_compra_created_at ON public.ordens_compra (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ordens_compra_servico_sector ON public.ordens_compra (servico_sector_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ordens_compra_protocol ON public.ordens_compra (protocol) WHERE protocol IS NOT NULL;

ALTER TABLE public.ordens_compra ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ordens_compra' AND policyname = 'ordens_compra_all'
  ) THEN
    CREATE POLICY ordens_compra_all ON public.ordens_compra
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

GRANT ALL ON public.ordens_compra TO authenticated, service_role;
GRANT SELECT ON public.ordens_compra TO anon;
GRANT USAGE, SELECT ON SEQUENCE public.ordens_compra_id_seq TO authenticated, service_role;
