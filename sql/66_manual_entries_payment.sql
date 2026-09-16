-- Forma de pagamento, moeda e chave Pix em lançamentos manuais (paridade com notas)
ALTER TABLE public.manual_entries
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'BRL',
  ADD COLUMN IF NOT EXISTS pix_key TEXT;

CREATE INDEX IF NOT EXISTS idx_manual_entries_payment_method
  ON public.manual_entries (payment_method);

-- Garante formas básicas usadas nas notas (idempotente)
INSERT INTO public.payment_methods (key, name, active)
SELECT v.key, v.name, true
FROM (VALUES
  ('pix', 'Pix'),
  ('boleto', 'Boleto'),
  ('cartao_credito', 'Cartão de crédito'),
  ('dinheiro', 'Dinheiro')
) AS v(key, name)
WHERE NOT EXISTS (
  SELECT 1 FROM public.payment_methods pm WHERE pm.key = v.key
);
