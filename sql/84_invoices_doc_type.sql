-- Lista explícita do lançamento (DANFE ou nota de serviço).
-- Nulo = inferir pelo número da nota (44 dígitos = DANFE).
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS doc_type TEXT;

ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_doc_type_check;

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_doc_type_check
  CHECK (doc_type IS NULL OR doc_type IN ('danfe', 'nota'));

NOTIFY pgrst, 'reload schema';
