-- Vários boletos por nota fiscal.
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS boleto_file_paths JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.invoices
SET boleto_file_paths = jsonb_build_array(boleto_file_path)
WHERE boleto_file_path IS NOT NULL
  AND btrim(boleto_file_path) <> ''
  AND (boleto_file_paths IS NULL OR boleto_file_paths = '[]'::jsonb);
