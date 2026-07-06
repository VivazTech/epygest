-- Comandas: registro manual de consumo (sem importação de documentos)
CREATE TABLE IF NOT EXISTS public.comandas (
  id BIGSERIAL PRIMARY KEY,
  consumer_name TEXT NOT NULL,
  consumed_at DATE NOT NULL,
  location TEXT NOT NULL,
  user_id BIGINT REFERENCES public.users(id),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'cancelled', 'posted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.comanda_items (
  id BIGSERIAL PRIMARY KEY,
  comanda_id BIGINT NOT NULL REFERENCES public.comandas(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity NUMERIC NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC NOT NULL CHECK (unit_price >= 0),
  total_amount NUMERIC NOT NULL CHECK (total_amount >= 0),
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_comandas_consumed_at ON public.comandas (consumed_at);
CREATE INDEX IF NOT EXISTS idx_comandas_status ON public.comandas (status);
CREATE INDEX IF NOT EXISTS idx_comanda_items_comanda_id ON public.comanda_items (comanda_id);
