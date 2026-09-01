-- Conciliação mensal de empréstimos: descontos − estornos = desconto líquido.

CREATE TABLE IF NOT EXISTS public.folha_emprestimos_conciliacao_mensal (
  id BIGSERIAL PRIMARY KEY,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  codigo_funcionario TEXT NOT NULL,
  conciliacao_key TEXT NOT NULL,
  emprestimo_id BIGINT REFERENCES public.folha_emprestimos_consignados (id) ON DELETE SET NULL,
  nome_colaborador TEXT,
  setor_nome TEXT,
  instituicao_financeira TEXT,
  rubrica_codigo TEXT,
  rubrica_nome TEXT,
  descontos NUMERIC(14, 2) NOT NULL DEFAULT 0,
  estornos NUMERIC(14, 2) NOT NULL DEFAULT 0,
  desconto_liquido NUMERIC(14, 2) NOT NULL DEFAULT 0,
  valor_cadastro NUMERIC(14, 2),
  diferenca NUMERIC(14, 2),
  lancamentos JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (year, month, conciliacao_key)
);

CREATE INDEX IF NOT EXISTS idx_folha_emp_conc_comp
  ON public.folha_emprestimos_conciliacao_mensal (year, month);

CREATE INDEX IF NOT EXISTS idx_folha_emp_conc_func
  ON public.folha_emprestimos_conciliacao_mensal (codigo_funcionario);

COMMENT ON TABLE public.folha_emprestimos_conciliacao_mensal IS
  'Conciliação mensal: descontos − estornos = desconto líquido por colaborador/instituição.';
