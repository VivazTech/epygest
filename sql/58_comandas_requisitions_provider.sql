-- Fornecedor em comandas e requisições internas.
ALTER TABLE public.comandas
  ADD COLUMN IF NOT EXISTS provider_name TEXT;

ALTER TABLE public.requisitions
  ADD COLUMN IF NOT EXISTS provider_name TEXT;

UPDATE public.requisitions
SET provider_name = description
WHERE (provider_name IS NULL OR btrim(provider_name) = '')
  AND description IS NOT NULL
  AND btrim(description) <> '';
