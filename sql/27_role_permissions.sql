-- Níveis de usuário (roles) e matriz de permissões por tela/ação.
-- Admin continua com acesso total no código; demais perfis usam role_permissions.

CREATE TABLE IF NOT EXISTS public.app_roles (
  slug text PRIMARY KEY,
  label text NOT NULL,
  description text,
  is_system boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.role_permissions (
  role_slug text NOT NULL REFERENCES public.app_roles(slug) ON DELETE CASCADE,
  resource_key text NOT NULL,
  can_view boolean NOT NULL DEFAULT false,
  can_create boolean NOT NULL DEFAULT false,
  can_edit boolean NOT NULL DEFAULT false,
  can_delete boolean NOT NULL DEFAULT false,
  PRIMARY KEY (role_slug, resource_key)
);

CREATE INDEX IF NOT EXISTS role_permissions_resource_idx
  ON public.role_permissions (resource_key);

-- Roles de sistema
INSERT INTO public.app_roles (slug, label, description, is_system, sort_order) VALUES
  ('admin', 'Administrador', 'Acesso total ao sistema.', true, 10),
  ('finance', 'Financeiro', 'Lançamentos, notas e rotinas financeiras.', true, 20),
  ('controle', 'Controle', 'Controle gerencial e cadastros.', true, 30),
  ('manager', 'Gestor', 'Visão gerencial e painéis setoriais.', true, 40),
  ('viewer', 'Visualizador', 'Acesso somente leitura ao dashboard.', true, 50),
  ('diretoria', 'Diretoria', 'Indicadores e visão consolidada.', true, 60)
ON CONFLICT (slug) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  is_system = EXCLUDED.is_system,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

-- Libera o CHECK fixo de roles para permitir níveis customizados.
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;

-- Garante que roles existentes estejam em app_roles antes da FK.
INSERT INTO public.app_roles (slug, label, is_system, sort_order)
SELECT DISTINCT u.role, initcap(replace(u.role, '-', ' ')), false, 200
FROM public.users u
WHERE u.role IS NOT NULL
  AND u.role <> ''
  AND NOT EXISTS (SELECT 1 FROM public.app_roles r WHERE r.slug = u.role)
ON CONFLICT (slug) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_role_fkey'
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_role_fkey
      FOREIGN KEY (role) REFERENCES public.app_roles(slug);
  END IF;
END $$;

-- Seed de permissões padrão (somente se a role ainda não tiver linhas).
-- admin
INSERT INTO public.role_permissions (role_slug, resource_key, can_view, can_create, can_edit, can_delete)
SELECT 'admin', x.key, true, x.c, x.e, x.d
FROM (VALUES
  ('dashboard', false, false, false),
  ('analise', false, false, false),
  ('dre', false, true, false),
  ('planejamento', false, true, false),
  ('importacao', true, false, false),
  ('cadastros', true, true, true),
  ('prev-real', false, false, false),
  ('indicadores', false, false, false),
  ('investimentos', true, true, true),
  ('usuarios', true, true, true),
  ('configuracoes', false, true, false),
  ('comandas', true, true, false),
  ('lancamentos-manuais', true, true, true),
  ('requisicoes', true, true, false),
  ('notas', true, true, false),
  ('danfe', true, true, false),
  ('mensalidades', true, true, false),
  ('compras-ordem', true, true, false),
  ('painel-operacional', false, true, false),
  ('painel-ab', false, true, false),
  ('painel-spa', false, true, false),
  ('painel-hospedagem', false, true, false),
  ('painel-nutricionista', false, true, false),
  ('painel-controladoria', false, true, false),
  ('apuracao-resultados', false, false, false),
  ('apuracao-receita', false, false, false),
  ('base-orcamento', false, false, false),
  ('folha', false, true, false),
  ('tutorial', false, false, false)
) AS x(key, c, e, d)
WHERE NOT EXISTS (SELECT 1 FROM public.role_permissions rp WHERE rp.role_slug = 'admin')
ON CONFLICT DO NOTHING;

-- finance
INSERT INTO public.role_permissions (role_slug, resource_key, can_view, can_create, can_edit, can_delete)
SELECT 'finance', x.key, true, x.c, x.e, x.d
FROM (VALUES
  ('investimentos', false, false, false),
  ('comandas', true, true, false),
  ('lancamentos-manuais', true, true, false),
  ('requisicoes', true, true, false),
  ('notas', true, true, false),
  ('danfe', true, true, false),
  ('mensalidades', true, true, false),
  ('tutorial', false, false, false)
) AS x(key, c, e, d)
WHERE NOT EXISTS (SELECT 1 FROM public.role_permissions rp WHERE rp.role_slug = 'finance')
ON CONFLICT DO NOTHING;

-- controle (quase tudo, sem usuarios/config)
INSERT INTO public.role_permissions (role_slug, resource_key, can_view, can_create, can_edit, can_delete)
SELECT 'controle', x.key, true, x.c, x.e, x.d
FROM (VALUES
  ('dashboard', false, false, false),
  ('analise', false, false, false),
  ('dre', false, true, false),
  ('planejamento', false, true, false),
  ('importacao', true, false, false),
  ('cadastros', true, true, true),
  ('prev-real', false, false, false),
  ('indicadores', false, false, false),
  ('investimentos', true, true, true),
  ('comandas', true, true, false),
  ('lancamentos-manuais', true, true, true),
  ('requisicoes', true, true, false),
  ('notas', true, true, false),
  ('danfe', true, true, false),
  ('mensalidades', true, true, false),
  ('compras-ordem', true, true, false),
  ('painel-operacional', false, true, false),
  ('painel-ab', false, true, false),
  ('painel-spa', false, true, false),
  ('painel-hospedagem', false, true, false),
  ('painel-nutricionista', false, true, false),
  ('painel-controladoria', false, true, false),
  ('apuracao-resultados', false, false, false),
  ('apuracao-receita', false, false, false),
  ('base-orcamento', false, false, false),
  ('folha', false, true, false),
  ('tutorial', false, false, false)
) AS x(key, c, e, d)
WHERE NOT EXISTS (SELECT 1 FROM public.role_permissions rp WHERE rp.role_slug = 'controle')
ON CONFLICT DO NOTHING;

-- manager
INSERT INTO public.role_permissions (role_slug, resource_key, can_view, can_create, can_edit, can_delete)
SELECT 'manager', x.key, true, x.c, x.e, x.d
FROM (VALUES
  ('dashboard', false, false, false),
  ('analise', false, false, false),
  ('planejamento', false, false, false),
  ('prev-real', false, false, false),
  ('indicadores', false, false, false),
  ('investimentos', false, false, false),
  ('comandas', true, true, false),
  ('lancamentos-manuais', true, true, false),
  ('requisicoes', true, true, false),
  ('notas', true, true, false),
  ('danfe', true, true, false),
  ('mensalidades', true, true, false),
  ('compras-ordem', true, true, false),
  ('painel-operacional', false, true, false),
  ('painel-ab', false, true, false),
  ('painel-spa', false, true, false),
  ('painel-hospedagem', false, true, false),
  ('painel-nutricionista', false, true, false),
  ('painel-controladoria', false, true, false),
  ('base-orcamento', false, false, false),
  ('tutorial', false, false, false)
) AS x(key, c, e, d)
WHERE NOT EXISTS (SELECT 1 FROM public.role_permissions rp WHERE rp.role_slug = 'manager')
ON CONFLICT DO NOTHING;

-- viewer
INSERT INTO public.role_permissions (role_slug, resource_key, can_view, can_create, can_edit, can_delete)
SELECT 'viewer', x.key, true, false, false, false
FROM (VALUES ('dashboard'), ('tutorial')) AS x(key)
WHERE NOT EXISTS (SELECT 1 FROM public.role_permissions rp WHERE rp.role_slug = 'viewer')
ON CONFLICT DO NOTHING;

-- diretoria
INSERT INTO public.role_permissions (role_slug, resource_key, can_view, can_create, can_edit, can_delete)
SELECT 'diretoria', x.key, true, false, false, false
FROM (VALUES
  ('dashboard'),
  ('dre'),
  ('indicadores'),
  ('investimentos'),
  ('mensalidades'),
  ('painel-operacional'),
  ('painel-ab'),
  ('painel-spa'),
  ('painel-hospedagem'),
  ('painel-nutricionista'),
  ('painel-controladoria'),
  ('tutorial')
) AS x(key)
WHERE NOT EXISTS (SELECT 1 FROM public.role_permissions rp WHERE rp.role_slug = 'diretoria')
ON CONFLICT DO NOTHING;
