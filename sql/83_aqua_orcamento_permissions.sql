-- Permissão do módulo Orçamento Aquamania (admin sempre tem acesso).

INSERT INTO public.role_permissions (role_slug, resource_key, can_view, can_create, can_edit, can_delete)
VALUES
  ('finance', 'aqua-orcamento', true, false, false, false),
  ('controle', 'aqua-orcamento', true, true, true, true),
  ('diretoria', 'aqua-orcamento', true, false, false, false)
ON CONFLICT (role_slug, resource_key) DO UPDATE SET
  can_view = EXCLUDED.can_view,
  can_create = EXCLUDED.can_create,
  can_edit = EXCLUDED.can_edit,
  can_delete = EXCLUDED.can_delete;
