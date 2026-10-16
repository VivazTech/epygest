-- Marca sugestões como feitas.
ALTER TABLE public.user_suggestions
  ADD COLUMN IF NOT EXISTS done BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.user_suggestions
  ADD COLUMN IF NOT EXISTS done_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS user_suggestions_done_idx
  ON public.user_suggestions (done, created_at DESC);
