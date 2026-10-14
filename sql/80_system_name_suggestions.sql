-- Uma sugestão de nome do sistema por usuário. Não depende da empresa ativa.
CREATE TABLE IF NOT EXISTS public.system_name_suggestions (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  user_name   TEXT,
  user_email  TEXT,
  user_role   TEXT,
  suggestion  TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT system_name_suggestions_user_id_key UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS system_name_suggestions_created_at_idx
  ON public.system_name_suggestions (created_at DESC);

ALTER TABLE public.system_name_suggestions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'system_name_suggestions'
      AND policyname = 'system_name_suggestions_all'
  ) THEN
    CREATE POLICY system_name_suggestions_all ON public.system_name_suggestions
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

GRANT ALL ON public.system_name_suggestions TO authenticated, service_role;
GRANT SELECT ON public.system_name_suggestions TO anon;
GRANT USAGE, SELECT ON SEQUENCE public.system_name_suggestions_id_seq TO authenticated, service_role;
