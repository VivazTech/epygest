-- Vendas por Ambiente (Desbravador) — módulo Aquamania / PDVs
CREATE TABLE IF NOT EXISTS public.vendas_ambiente_rows (
  id BIGSERIAL PRIMARY KEY,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  ambiente TEXT NOT NULL,
  ambiente_codigo TEXT,
  quantidade NUMERIC NOT NULL DEFAULT 0,
  valor_bruto NUMERIC NOT NULL DEFAULT 0,
  valor_desconto NUMERIC NOT NULL DEFAULT 0,
  valor_liquido NUMERIC NOT NULL DEFAULT 0,
  ticket_medio NUMERIC NOT NULL DEFAULT 0,
  import_history_id BIGINT,
  empresa_key TEXT NOT NULL DEFAULT 'vivaz',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vendas_ambiente_rows_period
  ON public.vendas_ambiente_rows (empresa_key, year, month);

CREATE INDEX IF NOT EXISTS idx_vendas_ambiente_rows_ambiente
  ON public.vendas_ambiente_rows (empresa_key, ambiente);
