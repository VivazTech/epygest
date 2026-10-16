-- Justificativas de divergências na conciliação mensal de empréstimos.

CREATE TABLE IF NOT EXISTS public.folha_emprestimos_divergencias (
  id BIGSERIAL PRIMARY KEY,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  conciliacao_key TEXT NOT NULL,
  emprestimo_id BIGINT REFERENCES public.folha_emprestimos_consignados (id) ON DELETE SET NULL,
  codigo_funcionario TEXT NOT NULL,
  nome_colaborador TEXT,
  instituicao_financeira TEXT,
  valor_esperado NUMERIC(14, 2),
  valor_descontado NUMERIC(14, 2) NOT NULL DEFAULT 0,
  valor_repassado NUMERIC(14, 2) NOT NULL DEFAULT 0,
  diferenca NUMERIC(14, 2) NOT NULL DEFAULT 0,
  motivo TEXT NOT NULL DEFAULT 'outro'
    CHECK (
      motivo IN (
        'rescisao',
        'estorno',
        'parcela_nao_descontada',
        'reembolso',
        'diferenca_competencia',
        'erro_inconsistencia',
        'outro'
      )
    ),
  justificativa TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (year, month, conciliacao_key)
);

CREATE INDEX IF NOT EXISTS idx_folha_emp_div_comp
  ON public.folha_emprestimos_divergencias (year, month);

CREATE INDEX IF NOT EXISTS idx_folha_emp_div_func
  ON public.folha_emprestimos_divergencias (codigo_funcionario);

COMMENT ON TABLE public.folha_emprestimos_divergencias IS
  'Justificativas de divergências entre valor cadastrado e desconto efetivo na folha.';
