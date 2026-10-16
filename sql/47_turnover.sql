-- Módulo de turnover (rotatividade de pessoal).

CREATE TABLE IF NOT EXISTS public.folha_turnover_config (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  formula TEXT NOT NULL DEFAULT 'desligamentos_headcount_medio',
  formula_label TEXT DEFAULT 'Desligamentos ÷ headcount médio × 100',
  observacao TEXT DEFAULT 'Fórmula provisória — confirmar com o RH.',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.folha_turnover_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.folha_turnover_mensal (
  id BIGSERIAL PRIMARY KEY,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  empresa_nome TEXT,
  setor_nome TEXT NOT NULL DEFAULT '',
  setor_codigo TEXT,
  headcount_inicio INTEGER NOT NULL DEFAULT 0,
  headcount_fim INTEGER NOT NULL DEFAULT 0,
  admissoes INTEGER NOT NULL DEFAULT 0,
  desligamentos INTEGER NOT NULL DEFAULT 0,
  turnover_pct NUMERIC(8, 4),
  formula TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (year, month, setor_nome)
);

CREATE INDEX IF NOT EXISTS idx_folha_turnover_comp
  ON public.folha_turnover_mensal (year, month);

CREATE TABLE IF NOT EXISTS public.folha_turnover_movimentos (
  id BIGSERIAL PRIMARY KEY,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  empresa_nome TEXT,
  codigo_funcionario TEXT NOT NULL,
  nome_funcionario TEXT,
  setor_nome TEXT,
  setor_codigo TEXT,
  tipo TEXT NOT NULL CHECK (tipo IN ('admissao', 'desligamento')),
  situacao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_folha_turnover_mov_comp
  ON public.folha_turnover_movimentos (year, month, tipo);
