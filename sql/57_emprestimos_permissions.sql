-- Permissão confidencial: empréstimos consignados (RH / financeiro).

INSERT INTO public.role_permissions (role_slug, resource_key, can_view, can_create, can_edit, can_delete)
VALUES
  ('finance', 'emprestimos', true, false, true, false),
  ('controle', 'emprestimos', true, true, true, true)
ON CONFLICT (role_slug, resource_key) DO UPDATE SET
  can_view = EXCLUDED.can_view,
  can_create = EXCLUDED.can_create,
  can_edit = EXCLUDED.can_edit,
  can_delete = EXCLUDED.can_delete;
