-- Colaboradores (Cadastros e Parametrizações).
-- Campos vindos da planilha de admissões: Nome, Descrição cargo, Descrição Ccusto.

CREATE TABLE IF NOT EXISTS public.colaboradores (
  id                BIGSERIAL PRIMARY KEY,
  nome              TEXT NOT NULL,
  cargo_descricao   TEXT,
  ccusto_descricao  TEXT,
  active            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_colaboradores_active ON public.colaboradores (active);
CREATE INDEX IF NOT EXISTS idx_colaboradores_nome ON public.colaboradores (lower(trim(nome)));

ALTER TABLE public.colaboradores ENABLE ROW LEVEL SECURITY;
