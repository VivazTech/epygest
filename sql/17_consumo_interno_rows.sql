-- Consumo Interno: linhas importadas por competência.
-- Alimenta Apuração de Resultados › Consumo interno (Resumo + meses).
-- Continua também gravando o total em crd_realizado (Prev x Real › Controle).

CREATE TABLE IF NOT EXISTS public.consumo_interno_rows (
  id BIGSERIAL PRIMARY KEY,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  cliente_id TEXT,
  cliente_nome TEXT,
  produto_codigo TEXT,
  produto TEXT,
  unidade TEXT,
  nf TEXT,
  data TEXT,
  data_iso DATE,
  quantidade NUMERIC NOT NULL DEFAULT 0,
  vl_unitario NUMERIC NOT NULL DEFAULT 0,
  vl_total NUMERIC NOT NULL DEFAULT 0,
  vl_desconto NUMERIC NOT NULL DEFAULT 0,
  taxa_servico NUMERIC NOT NULL DEFAULT 0,
  vl_liquido NUMERIC NOT NULL DEFAULT 0,
  forma_pgto TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_consumo_interno_rows_year_month
  ON public.consumo_interno_rows (year, month);

CREATE INDEX IF NOT EXISTS idx_consumo_interno_rows_cliente
  ON public.consumo_interno_rows (cliente_nome);
