-- Adiciona data de emissão aos lançamentos manuais.
-- A coluna `date` continua sendo a data de lançamento (competência orçamentária).
ALTER TABLE public.manual_entries
  ADD COLUMN IF NOT EXISTS issue_date DATE;

-- Backfill: registros antigos usam a data de lançamento como emissão.
UPDATE public.manual_entries
SET issue_date = date
WHERE issue_date IS NULL;

ALTER TABLE public.manual_entries
  ALTER COLUMN issue_date SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_manual_entries_issue_date ON public.manual_entries (issue_date);
