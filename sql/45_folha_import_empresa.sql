-- Empresa identificada na importação do extrato mensal (filtro do painel RH).

ALTER TABLE public.folha_importacoes
  ADD COLUMN IF NOT EXISTS empresa_nome TEXT;

CREATE INDEX IF NOT EXISTS idx_folha_importacoes_empresa
  ON public.folha_importacoes (empresa_nome)
  WHERE empresa_nome IS NOT NULL;
