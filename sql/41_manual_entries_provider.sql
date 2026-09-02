-- Fornecedor nos lançamentos manuais.
ALTER TABLE public.manual_entries
  ADD COLUMN IF NOT EXISTS provider_name TEXT;

UPDATE public.manual_entries
SET provider_name = description
WHERE (provider_name IS NULL OR btrim(provider_name) = '')
  AND description IS NOT NULL
  AND btrim(description) <> '';
