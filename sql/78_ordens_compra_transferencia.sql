-- Permite transferência bancária nas condições de pagamento da ordem de compra

ALTER TABLE public.ordens_compra DROP CONSTRAINT IF EXISTS ordens_compra_pagamento_check;
ALTER TABLE public.ordens_compra ADD CONSTRAINT ordens_compra_pagamento_check
  CHECK (pagamento IS NULL OR pagamento IN ('cartao', 'avista', 'boleto', 'pix', 'transferencia'));
