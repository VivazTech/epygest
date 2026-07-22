-- Relatório de CRD: linhas importadas do Rel. CRD (Desbravador) por competência.
-- O Prev x Real Mensal continua recebendo saldo_lanc via crd_realizado (source = rel_crd).

CREATE TABLE IF NOT EXISTS public.rel_crd_rows (
  id BIGSERIAL PRIMARY KEY,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  nivel INTEGER NOT NULL DEFAULT 1,
  codigo TEXT NOT NULL,
  nome TEXT,
  lancamentos NUMERIC NOT NULL DEFAULT 0,
  cancelamentos NUMERIC NOT NULL DEFAULT 0,
  saldo_lanc NUMERIC NOT NULL DEFAULT 0,
  baixas NUMERIC NOT NULL DEFAULT 0,
  estorno NUMERIC NOT NULL DEFAULT 0,
  baixas_liquido NUMERIC NOT NULL DEFAULT 0,
  lanc_liquido NUMERIC NOT NULL DEFAULT 0,
  crd_id BIGINT REFERENCES public.crds(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (year, month, codigo)
);

CREATE INDEX IF NOT EXISTS idx_rel_crd_rows_year_month ON public.rel_crd_rows (year, month);
CREATE INDEX IF NOT EXISTS idx_rel_crd_rows_codigo ON public.rel_crd_rows (codigo);
