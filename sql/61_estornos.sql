-- Estornos de lançamentos: mesmo fluxo open → approved (Controle) → posted (Financeiro recebe).
CREATE TABLE IF NOT EXISTS public.estornos (
  id BIGSERIAL PRIMARY KEY,
  sector_id BIGINT NOT NULL REFERENCES public.sectors(id),
  crd_id BIGINT REFERENCES public.crds(id),
  user_id BIGINT REFERENCES public.users(id),
  provider_name TEXT,
  description TEXT,
  amount NUMERIC NOT NULL CHECK (amount >= 0),
  issue_date DATE NOT NULL,
  date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'approved', 'cancelled', 'posted')),
  file_path TEXT,
  file_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_estornos_sector_id ON public.estornos (sector_id);
CREATE INDEX IF NOT EXISTS idx_estornos_date ON public.estornos (date);
CREATE INDEX IF NOT EXISTS idx_estornos_status ON public.estornos (status);

ALTER TABLE public.estornos ENABLE ROW LEVEL SECURITY;

INSERT INTO public.role_permissions (role_slug, resource_key, can_view, can_create, can_edit, can_delete)
VALUES
  ('finance', 'estornos', true, true, true, false),
  ('controle', 'estornos', true, true, true, true),
  ('manager', 'estornos', true, true, true, false)
ON CONFLICT (role_slug, resource_key) DO UPDATE SET
  can_view = EXCLUDED.can_view,
  can_create = EXCLUDED.can_create,
  can_edit = EXCLUDED.can_edit,
  can_delete = EXCLUDED.can_delete;
