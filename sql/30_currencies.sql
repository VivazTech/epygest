-- Moedas cadastráveis (usadas no lançamento de notas).
CREATE TABLE IF NOT EXISTS public.currencies (
  id BIGSERIAL PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.currencies (key, name, active)
SELECT 'BRL', 'Real (BRL)', true
WHERE NOT EXISTS (SELECT 1 FROM public.currencies WHERE key = 'BRL');

INSERT INTO public.currencies (key, name, active)
SELECT 'USD', 'Dólar (USD)', true
WHERE NOT EXISTS (SELECT 1 FROM public.currencies WHERE key = 'USD');

INSERT INTO public.currencies (key, name, active)
SELECT 'EUR', 'Euro (EUR)', true
WHERE NOT EXISTS (SELECT 1 FROM public.currencies WHERE key = 'EUR');

INSERT INTO public.currencies (key, name, active)
SELECT 'ARS', 'Peso argentino (ARS)', true
WHERE NOT EXISTS (SELECT 1 FROM public.currencies WHERE key = 'ARS');

INSERT INTO public.currencies (key, name, active)
SELECT 'PYG', 'Guarani (PYG)', true
WHERE NOT EXISTS (SELECT 1 FROM public.currencies WHERE key = 'PYG');

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'BRL';
