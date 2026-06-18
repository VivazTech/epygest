-- Cole no SQL Editor do Supabase para habilitar o histórico de importações.

CREATE TABLE IF NOT EXISTS public.import_history (
  id BIGSERIAL PRIMARY KEY,
  source_type TEXT NOT NULL,
  file_name TEXT,
  status TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'error')),
  year INTEGER,
  month INTEGER CHECK (month IS NULL OR (month >= 1 AND month <= 12)),
  records_count INTEGER,
  total_amount NUMERIC,
  user_id BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
  user_name TEXT,
  user_email TEXT,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_import_history_created_at ON public.import_history (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_import_history_source_type ON public.import_history (source_type);
CREATE INDEX IF NOT EXISTS idx_import_history_year_month ON public.import_history (year, month);
