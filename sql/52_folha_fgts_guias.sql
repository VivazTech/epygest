-- FGTS: guias importadas (provisão férias / 13º) e totais mensais.

ALTER TABLE public.folha_provisao_ferias
  ADD COLUMN IF NOT EXISTS inss NUMERIC(14, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fgts NUMERIC(14, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pis NUMERIC(14, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS media_vantagens NUMERIC(14, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS terco_ferias NUMERIC(14, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_devido NUMERIC(14, 2) DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.folha_provisao_13 (
  id BIGSERIAL PRIMARY KEY,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  codigo_funcionario TEXT NOT NULL,
  nome TEXT,
  salario_13 NUMERIC(14, 2) DEFAULT 0,
  media_vantagens NUMERIC(14, 2) DEFAULT 0,
  adiantamento_13 NUMERIC(14, 2) DEFAULT 0,
  valor_devido NUMERIC(14, 2) DEFAULT 0,
  valor_mes NUMERIC(14, 2) DEFAULT 0,
  inss NUMERIC(14, 2) DEFAULT 0,
  fgts NUMERIC(14, 2) DEFAULT 0,
  pis NUMERIC(14, 2) DEFAULT 0,
  avos TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (year, month, codigo_funcionario)
);

CREATE INDEX IF NOT EXISTS idx_folha_provisao_13_comp
  ON public.folha_provisao_13 (year, month);

CREATE TABLE IF NOT EXISTS public.folha_fgts_guia_mensal (
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  fgts_normal NUMERIC(14, 2) NOT NULL DEFAULT 0,
  fgts_ferias NUMERIC(14, 2) NOT NULL DEFAULT 0,
  fgts_13 NUMERIC(14, 2) NOT NULL DEFAULT 0,
  fgts_outros NUMERIC(14, 2) NOT NULL DEFAULT 0,
  fonte_normal TEXT,
  fonte_ferias TEXT,
  fonte_13 TEXT,
  fonte_outros TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (year, month)
);

COMMENT ON TABLE public.folha_fgts_guia_mensal IS
  'Totais de FGTS por componente, priorizando guias importadas (provisão férias / 13º) e cadastro manual.';
