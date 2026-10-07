-- Boleto vinculado à ordem de compra (Condições de Pagamento)

ALTER TABLE public.ordens_compra ADD COLUMN IF NOT EXISTS boleto_file_path TEXT;
ALTER TABLE public.ordens_compra ADD COLUMN IF NOT EXISTS boleto_file_name TEXT;
