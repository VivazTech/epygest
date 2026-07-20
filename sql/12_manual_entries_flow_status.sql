-- Fluxo de lançamentos manuais: open → approved (Controle) → posted (Financeiro)
-- Mantém open/cancelled/posted e adiciona approved.

ALTER TABLE public.manual_entries
  DROP CONSTRAINT IF EXISTS manual_entries_status_check;

ALTER TABLE public.manual_entries
  ADD CONSTRAINT manual_entries_status_check
  CHECK (status IN ('open', 'approved', 'cancelled', 'posted'));
