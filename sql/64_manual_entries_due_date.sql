-- Data de vencimento em lançamentos manuais
ALTER TABLE public.manual_entries
  ADD COLUMN IF NOT EXISTS due_date DATE;

CREATE INDEX IF NOT EXISTS idx_manual_entries_due_date ON public.manual_entries (due_date);
