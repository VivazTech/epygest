-- Cadastro ampliado do colaborador (RH / orçamento futuro).

ALTER TABLE public.colaboradores
  ADD COLUMN IF NOT EXISTS nome_oficial TEXT,
  ADD COLUMN IF NOT EXISTS empresa_key TEXT,
  ADD COLUMN IF NOT EXISTS empresa_nome TEXT,
  ADD COLUMN IF NOT EXISTS sector_id BIGINT REFERENCES public.sectors (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS codigo_funcionario TEXT,
  ADD COLUMN IF NOT EXISTS salario_base NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS adicionais_fixos NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS adicional_quebra_caixa NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS adicional_idioma NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS outros_adicionais JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS observacao TEXT;

UPDATE public.colaboradores
SET nome_oficial = nome
WHERE nome_oficial IS NULL OR TRIM(nome_oficial) = '';

CREATE INDEX IF NOT EXISTS idx_colaboradores_codigo_func
  ON public.colaboradores (codigo_funcionario)
  WHERE codigo_funcionario IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_colaboradores_empresa
  ON public.colaboradores (empresa_key);

CREATE INDEX IF NOT EXISTS idx_colaboradores_sector
  ON public.colaboradores (sector_id);

-- Espelho na folha para apuração / painel RH
ALTER TABLE public.folha_funcionarios
  ADD COLUMN IF NOT EXISTS empresa_key TEXT,
  ADD COLUMN IF NOT EXISTS empresa_nome TEXT,
  ADD COLUMN IF NOT EXISTS adicionais_fixos NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS adicional_quebra_caixa NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS adicional_idioma NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS outros_adicionais JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS colaborador_id BIGINT REFERENCES public.colaboradores (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_folha_func_colaborador
  ON public.folha_funcionarios (colaborador_id);
