-- Sugestões e pedidos de novos módulos/funções
-- Status: a fazer | em desenvolvimento | aguardando informação | feito

ALTER TABLE public.user_suggestions
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'suggestion'
    CHECK (kind IN ('suggestion', 'module_request'));

ALTER TABLE public.user_suggestions
  ADD COLUMN IF NOT EXISTS title TEXT;

ALTER TABLE public.user_suggestions
  ADD COLUMN IF NOT EXISTS company_scope TEXT
    CHECK (company_scope IS NULL OR company_scope IN ('vivaz', 'aqua', 'both'));

ALTER TABLE public.user_suggestions
  ADD COLUMN IF NOT EXISTS file_label TEXT;

ALTER TABLE public.user_suggestions
  ADD COLUMN IF NOT EXISTS file_path TEXT;

ALTER TABLE public.user_suggestions
  ADD COLUMN IF NOT EXISTS file_name TEXT;

ALTER TABLE public.user_suggestions
  ADD COLUMN IF NOT EXISTS how_it_should_work TEXT;

ALTER TABLE public.user_suggestions
  ADD COLUMN IF NOT EXISTS answers JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.user_suggestions
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'todo'
    CHECK (status IN ('todo', 'in_progress', 'waiting_info', 'done'));

-- Compatibilidade: sugestões já marcadas como feitas
UPDATE public.user_suggestions
SET status = 'done'
WHERE done = true AND (status IS NULL OR status = 'todo');

CREATE INDEX IF NOT EXISTS user_suggestions_status_idx
  ON public.user_suggestions (status, created_at DESC);

CREATE INDEX IF NOT EXISTS user_suggestions_kind_idx
  ON public.user_suggestions (kind, created_at DESC);

-- Todos os perfis podem acompanhar os próprios pedidos (admin vê todos).
INSERT INTO public.role_permissions (role_slug, resource_key, can_view, can_create, can_edit, can_delete)
VALUES
  ('finance', 'sugestoes', true, false, false, false),
  ('controle', 'sugestoes', true, false, false, false),
  ('manager', 'sugestoes', true, false, false, false),
  ('estagiario', 'sugestoes', true, false, false, false),
  ('viewer', 'sugestoes', true, false, false, false),
  ('diretoria', 'sugestoes', true, false, false, false)
ON CONFLICT (role_slug, resource_key) DO UPDATE SET
  can_view = true;
