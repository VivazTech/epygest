-- Remove (desativa) o CRD 53 ENDOMARKETING.
-- Mantém o registro para preservar histórico de lançamentos.
-- O CRD 603 ENDOMARKETING (se existir) não é alterado.

UPDATE public.crds
SET active = false
WHERE trim(code) = '53'
  AND upper(name) LIKE '%ENDOMARKETING%';
