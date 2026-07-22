-- Requisições Sintética por Grupo de Itens: linhas importadas por competência.
-- Alimenta Apuração de Resultados › Requisições (Resumo + meses).

CREATE TABLE IF NOT EXISTS public.requisicoes_rows (
  id BIGSERIAL PRIMARY KEY,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  setor_codigo INTEGER NOT NULL,
  setor_nome TEXT NOT NULL,
  grupo_codigo INTEGER NOT NULL,
  grupo_nome TEXT NOT NULL,
  valor NUMERIC NOT NULL DEFAULT 0,
  destino TEXT, -- cmv | uso_consumo | investimento | NULL (não classificado)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (year, month, setor_codigo, grupo_codigo)
);

CREATE INDEX IF NOT EXISTS idx_requisicoes_rows_year_month ON public.requisicoes_rows (year, month);
CREATE INDEX IF NOT EXISTS idx_requisicoes_rows_grupo ON public.requisicoes_rows (grupo_codigo);
