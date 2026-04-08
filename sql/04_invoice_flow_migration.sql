-- Migração do fluxo de notas para:
-- solicitante importa -> CONTROLE aprova -> FINANCEIRO paga + comprovante

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS flow_stage TEXT,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by_sector TEXT,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paid_by_sector TEXT,
  ADD COLUMN IF NOT EXISTS payment_receipt_path TEXT;

UPDATE public.invoices
SET flow_stage = 'control_pending'
WHERE flow_stage IS NULL;

ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_status_check;

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_status_check
  CHECK (status IN ('received', 'control_pending', 'control_approved', 'paid', 'overdue'));

ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_flow_stage_check;

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_flow_stage_check
  CHECK (flow_stage IN ('control_pending', 'control_approved', 'paid'));
