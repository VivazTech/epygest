-- Número do documento ou da nota no lançamento manual.
ALTER TABLE public.manual_entries
  ADD COLUMN IF NOT EXISTS document_number TEXT;
