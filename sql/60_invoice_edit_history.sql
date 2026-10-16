-- Histórico append-only de edições em notas (lançamentos).
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS edit_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_edited_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.invoice_edit_history (
  id BIGSERIAL PRIMARY KEY,
  invoice_id BIGINT NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
  editor_name TEXT,
  changes JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS invoice_edit_history_invoice_id_idx
  ON public.invoice_edit_history (invoice_id, created_at DESC);

ALTER TABLE public.invoice_edit_history ENABLE ROW LEVEL SECURITY;
