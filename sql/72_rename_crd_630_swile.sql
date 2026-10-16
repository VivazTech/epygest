-- Renomeia o CRD 630 para Swile.
UPDATE public.crds
SET name = 'Swile'
WHERE trim(code) = '630';
