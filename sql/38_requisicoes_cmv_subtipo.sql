-- Subclassificação CMV nas requisições sintéticas (Alimentos / Bebidas).

ALTER TABLE public.requisicoes_rows
  ADD COLUMN IF NOT EXISTS cmv_subtipo TEXT;

COMMENT ON COLUMN public.requisicoes_rows.cmv_subtipo IS
  'Subclassificação CMV: alimentos | bebidas. Válido quando destino = cmv ou credito_cmv.';

CREATE INDEX IF NOT EXISTS idx_requisicoes_rows_cmv_subtipo
  ON public.requisicoes_rows (cmv_subtipo)
  WHERE cmv_subtipo IS NOT NULL;

-- CMV sem subtipo definido → alimentos (padrão operacional)
UPDATE public.requisicoes_rows
SET cmv_subtipo = 'alimentos'
WHERE cmv_subtipo IS NULL
  AND destino IN ('cmv', 'credito_cmv');
