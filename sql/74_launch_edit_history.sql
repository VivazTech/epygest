-- Histórico de edições de lançamentos (manual / estorno / requisição).
-- Espelha o padrão de invoice_edit_history: só edita antes da aprovação do Controle.

ALTER TABLE public.manual_entries
  ADD COLUMN IF NOT EXISTS edit_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_edited_at TIMESTAMPTZ;

ALTER TABLE public.estornos
  ADD COLUMN IF NOT EXISTS edit_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_edited_at TIMESTAMPTZ;

ALTER TABLE public.requisitions
  ADD COLUMN IF NOT EXISTS edit_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_edited_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.launch_edit_history (
  id BIGSERIAL PRIMARY KEY,
  source_type TEXT NOT NULL CHECK (source_type IN ('manual', 'estorno', 'requisicao')),
  source_id BIGINT NOT NULL,
  user_id BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
  editor_name TEXT,
  changes JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS launch_edit_history_source_idx
  ON public.launch_edit_history (source_type, source_id, created_at DESC);

ALTER TABLE public.launch_edit_history ENABLE ROW LEVEL SECURITY;
