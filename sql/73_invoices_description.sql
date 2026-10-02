-- Descrição opcional do lançamento (DANFE / Nota), igual ao lançamento manual.
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS description TEXT;
