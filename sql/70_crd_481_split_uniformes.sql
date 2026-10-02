-- Divide CRD 481 (UNIFORMES E EPIs) em:
--   481  → Folha de Pagamento
--   4812 → Extras
-- Idempotente. Mantém o mesmo setor (e empresa_key, se existir) do 481.

-- 1) Atualiza o nome do 481 para deixar claro que é Folha
UPDATE public.crds
SET name = 'UNIFORMES E EPIS - FOLHA DE PAGAMENTO'
WHERE trim(code) = '481'
  AND name IS DISTINCT FROM 'UNIFORMES E EPIS - FOLHA DE PAGAMENTO';

-- 2) Cria 4812 no mesmo setor do 481 (para cada empresa_key existente)
INSERT INTO public.crds (
  natureza,
  code,
  name,
  sector_id,
  saldo_anterior,
  previsto_mes,
  disponivel_mes,
  realizado_mes,
  saldo,
  active,
  empresa_key
)
SELECT
  COALESCE(c.natureza, 'O'),
  '4812',
  'UNIFORMES E EPIS - EXTRAS',
  c.sector_id,
  0,
  0,
  0,
  0,
  0,
  true,
  COALESCE(c.empresa_key, 'vivaz')
FROM public.crds c
WHERE trim(c.code) = '481'
  AND NOT EXISTS (
    SELECT 1
    FROM public.crds x
    WHERE trim(x.code) = '4812'
      AND x.sector_id IS NOT DISTINCT FROM c.sector_id
      AND COALESCE(x.empresa_key, 'vivaz') = COALESCE(c.empresa_key, 'vivaz')
  );
