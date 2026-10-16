-- Anexo opcional em lançamentos manuais.
ALTER TABLE public.manual_entries
  ADD COLUMN IF NOT EXISTS file_path TEXT;

ALTER TABLE public.manual_entries
  ADD COLUMN IF NOT EXISTS file_name TEXT;
