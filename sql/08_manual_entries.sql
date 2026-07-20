-- Lançamentos manuais: compromissos por setor que compõem o orçamento (como notas e requisições)
CREATE TABLE IF NOT EXISTS public.manual_entries (
  id BIGSERIAL PRIMARY KEY,
  sector_id BIGINT NOT NULL REFERENCES public.sectors(id),
  crd_id BIGINT REFERENCES public.crds(id),
  user_id BIGINT REFERENCES public.users(id),
  description TEXT,
  amount NUMERIC NOT NULL CHECK (amount >= 0),
  issue_date DATE NOT NULL,
  date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'cancelled', 'posted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_manual_entries_sector_id ON public.manual_entries (sector_id);
CREATE INDEX IF NOT EXISTS idx_manual_entries_issue_date ON public.manual_entries (issue_date);
CREATE INDEX IF NOT EXISTS idx_manual_entries_date ON public.manual_entries (date);
CREATE INDEX IF NOT EXISTS idx_manual_entries_status ON public.manual_entries (status);
