-- Orçamento e crédito mensal da taxa de serviço (análise folha).

CREATE TABLE IF NOT EXISTS public.folha_taxa_servico_mensal (
  year INT NOT NULL,
  month INT NOT NULL CHECK (month BETWEEN 1 AND 12),
  orcado_bruto NUMERIC(14, 2) NOT NULL DEFAULT 0,
  credito_rds NUMERIC(14, 2),
  observacao TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (year, month)
);

COMMENT ON TABLE public.folha_taxa_servico_mensal IS
  'Orçado bruto e crédito RDS da taxa de serviço por competência (painel RH).';
