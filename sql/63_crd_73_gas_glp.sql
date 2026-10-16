-- Adiciona CRD 73 — GAS GLP no Setor Operacional (Prev x Real Diário).
-- Idempotente: só insere se ainda não existir o código 73.

INSERT INTO crds (
  natureza,
  code,
  name,
  sector_id,
  saldo_anterior,
  previsto_mes,
  disponivel_mes,
  realizado_mes,
  saldo,
  active
)
SELECT
  'O',
  '73',
  'GAS GLP',
  s.id,
  0,
  0,
  0,
  0,
  0,
  true
FROM sectors s
WHERE lower(s.name) = 'operacional'
  AND NOT EXISTS (
    SELECT 1 FROM crds c WHERE trim(c.code) = '73'
  );
