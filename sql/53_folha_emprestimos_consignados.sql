-- Empréstimos consignados por colaborador (múltiplos por pessoa).

CREATE TABLE IF NOT EXISTS public.folha_emprestimos_consignados (
  id BIGSERIAL PRIMARY KEY,
  colaborador_id BIGINT REFERENCES public.colaboradores (id) ON DELETE SET NULL,
  codigo_funcionario TEXT,
  nome_colaborador TEXT,
  setor_nome TEXT,
  empresa_nome TEXT,
  instituicao_financeira TEXT NOT NULL,
  valor_contratado NUMERIC(14, 2),
  valor_recebido NUMERIC(14, 2),
  valor_parcela NUMERIC(14, 2) NOT NULL DEFAULT 0,
  quantidade_parcelas INTEGER NOT NULL DEFAULT 1 CHECK (quantidade_parcelas >= 1),
  parcelas_pagas INTEGER NOT NULL DEFAULT 0 CHECK (parcelas_pagas >= 0),
  data_inicio DATE,
  previsao_termino DATE,
  status TEXT NOT NULL DEFAULT 'ativo'
    CHECK (status IN ('ativo', 'quitado', 'suspenso', 'cancelado')),
  rubrica_codigo TEXT,
  rubrica_nome TEXT,
  observacao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_folha_emprestimos_colaborador
  ON public.folha_emprestimos_consignados (colaborador_id);

CREATE INDEX IF NOT EXISTS idx_folha_emprestimos_codigo
  ON public.folha_emprestimos_consignados (codigo_funcionario);

CREATE INDEX IF NOT EXISTS idx_folha_emprestimos_status
  ON public.folha_emprestimos_consignados (status);

CREATE INDEX IF NOT EXISTS idx_folha_emprestimos_rubrica
  ON public.folha_emprestimos_consignados (codigo_funcionario, rubrica_codigo);

COMMENT ON TABLE public.folha_emprestimos_consignados IS
  'Cadastro de empréstimos consignados — múltiplos por colaborador, separado do FGTS.';
