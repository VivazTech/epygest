-- Quem deu a baixa (Financeiro) em cada lançamento + forma de pagamento "Permuta".
-- Sem FK para users: uma segunda FK deixaria ambíguo o embed users(...) já usado nas consultas.

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS paid_by_user_id BIGINT,
  ADD COLUMN IF NOT EXISTS paid_by_user_name TEXT;

ALTER TABLE public.manual_entries
  ADD COLUMN IF NOT EXISTS paid_by_user_id BIGINT,
  ADD COLUMN IF NOT EXISTS paid_by_user_name TEXT;

ALTER TABLE public.estornos
  ADD COLUMN IF NOT EXISTS paid_by_user_id BIGINT,
  ADD COLUMN IF NOT EXISTS paid_by_user_name TEXT;

ALTER TABLE public.requisitions
  ADD COLUMN IF NOT EXISTS paid_by_user_id BIGINT,
  ADD COLUMN IF NOT EXISTS paid_by_user_name TEXT;

ALTER TABLE public.comandas
  ADD COLUMN IF NOT EXISTS paid_by_user_id BIGINT,
  ADD COLUMN IF NOT EXISTS paid_by_user_name TEXT;

ALTER TABLE public.contrato_lancamentos
  ADD COLUMN IF NOT EXISTS paid_by_user_id BIGINT,
  ADD COLUMN IF NOT EXISTS paid_by_user_name TEXT;

ALTER TABLE public.ordens_compra
  ADD COLUMN IF NOT EXISTS paid_by_user_id BIGINT,
  ADD COLUMN IF NOT EXISTS paid_by_user_name TEXT;

CREATE INDEX IF NOT EXISTS idx_invoices_paid_by_user ON public.invoices (paid_by_user_id);
CREATE INDEX IF NOT EXISTS idx_manual_entries_paid_by_user ON public.manual_entries (paid_by_user_id);
CREATE INDEX IF NOT EXISTS idx_estornos_paid_by_user ON public.estornos (paid_by_user_id);
CREATE INDEX IF NOT EXISTS idx_requisitions_paid_by_user ON public.requisitions (paid_by_user_id);
CREATE INDEX IF NOT EXISTS idx_comandas_paid_by_user ON public.comandas (paid_by_user_id);
CREATE INDEX IF NOT EXISTS idx_contrato_lancamentos_paid_by_user ON public.contrato_lancamentos (paid_by_user_id);
CREATE INDEX IF NOT EXISTS idx_ordens_compra_paid_by_user ON public.ordens_compra (paid_by_user_id);

INSERT INTO public.payment_methods (key, name, active)
SELECT 'permuta', 'Permuta', true
WHERE NOT EXISTS (
  SELECT 1 FROM public.payment_methods pm WHERE pm.key = 'permuta'
);

-- Formas de pagamento das notas vêm da tabela payment_methods (Cadastros);
-- o CHECK fixo do schema original bloquearia Permuta e qualquer forma nova.
ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_payment_method_check;

ALTER TABLE public.ordens_compra
  DROP CONSTRAINT IF EXISTS ordens_compra_pagamento_check;

ALTER TABLE public.ordens_compra
  ADD CONSTRAINT ordens_compra_pagamento_check
  CHECK (pagamento IS NULL OR pagamento IN ('cartao', 'avista', 'boleto', 'pix', 'transferencia', 'permuta'));

NOTIFY pgrst, 'reload schema';
