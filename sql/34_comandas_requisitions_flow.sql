-- Fluxo de comandas e requisições: open → approved (Controle) → posted (Financeiro)

ALTER TABLE public.comandas
  DROP CONSTRAINT IF EXISTS comandas_status_check;

ALTER TABLE public.comandas
  ADD CONSTRAINT comandas_status_check
  CHECK (status IN ('open', 'approved', 'cancelled', 'posted'));

ALTER TABLE public.requisitions
  DROP CONSTRAINT IF EXISTS requisitions_status_check;

ALTER TABLE public.requisitions
  ADD CONSTRAINT requisitions_status_check
  CHECK (status IN ('open', 'approved', 'cancelled', 'posted'));
