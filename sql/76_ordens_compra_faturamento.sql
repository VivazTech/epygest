-- Nota fiscal e recibo vinculados à ordem de compra (Valor e Faturamento)

ALTER TABLE public.ordens_compra ADD COLUMN IF NOT EXISTS nota_file_path TEXT;
ALTER TABLE public.ordens_compra ADD COLUMN IF NOT EXISTS nota_file_name TEXT;
ALTER TABLE public.ordens_compra ADD COLUMN IF NOT EXISTS recibo_file_path TEXT;
ALTER TABLE public.ordens_compra ADD COLUMN IF NOT EXISTS recibo_file_name TEXT;
