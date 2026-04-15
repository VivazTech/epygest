-- Migração do fluxo de notas para:
-- solicitante importa -> CONTROLE aprova -> FINANCEIRO paga + comprovante

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS boleto_file_path TEXT,
  ADD COLUMN IF NOT EXISTS crd TEXT,
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS pix_key TEXT,
  ADD COLUMN IF NOT EXISTS flow_stage TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by_sector TEXT,
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by_sector TEXT,
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paid_by_sector TEXT,
  ADD COLUMN IF NOT EXISTS payment_receipt_path TEXT;

CREATE TABLE IF NOT EXISTS public.payment_methods (
  id BIGSERIAL PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crds (
  id BIGSERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS natureza TEXT;

UPDATE public.invoices
SET natureza = 'O'
WHERE natureza IS NULL;

ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_natureza_check;

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_natureza_check
  CHECK (natureza IN ('M','O'));

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
  CHECK (flow_stage IN ('control_pending', 'control_approved', 'paid', 'cancelled'));
