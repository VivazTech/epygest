-- Perfil Estagiário e passo extra: Gestor do setor aprova antes do Controle.
-- Fluxo estagiário: pending_manager → open (Gestor) → approved (Controle) → posted (Financeiro)
-- Fluxo demais: open → approved → posted

INSERT INTO public.app_roles (slug, label, description, is_system, sort_order)
VALUES (
  'estagiario',
  'Estagiário',
  'Lança nos setores vinculados. O gestor do setor precisa aprovar antes do Controle e do Financeiro.',
  true,
  45
)
ON CONFLICT (slug) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  is_system = EXCLUDED.is_system,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

ALTER TABLE public.manual_entries DROP CONSTRAINT IF EXISTS manual_entries_status_check;
ALTER TABLE public.manual_entries ADD CONSTRAINT manual_entries_status_check
  CHECK (status IN ('pending_manager', 'open', 'approved', 'cancelled', 'posted'));

ALTER TABLE public.estornos DROP CONSTRAINT IF EXISTS estornos_status_check;
ALTER TABLE public.estornos ADD CONSTRAINT estornos_status_check
  CHECK (status IN ('pending_manager', 'open', 'approved', 'cancelled', 'posted'));

ALTER TABLE public.requisitions DROP CONSTRAINT IF EXISTS requisitions_status_check;
ALTER TABLE public.requisitions ADD CONSTRAINT requisitions_status_check
  CHECK (status IN ('pending_manager', 'open', 'approved', 'cancelled', 'posted'));

ALTER TABLE public.comandas DROP CONSTRAINT IF EXISTS comandas_status_check;
ALTER TABLE public.comandas ADD CONSTRAINT comandas_status_check
  CHECK (status IN ('pending_manager', 'open', 'approved', 'cancelled', 'posted'));

ALTER TABLE public.contrato_lancamentos DROP CONSTRAINT IF EXISTS contrato_lancamentos_status_check;
ALTER TABLE public.contrato_lancamentos ADD CONSTRAINT contrato_lancamentos_status_check
  CHECK (status IN ('pending_manager', 'open', 'approved', 'cancelled', 'posted'));

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_flow_stage_check;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_flow_stage_check
  CHECK (flow_stage IN ('manager_pending', 'control_pending', 'control_approved', 'paid', 'cancelled'));

INSERT INTO public.role_permissions (role_slug, resource_key, can_view, can_create, can_edit, can_delete)
VALUES
  ('estagiario', 'dashboard', true, false, false, false),
  ('estagiario', 'comandas', true, true, true, false),
  ('estagiario', 'lancamentos-manuais', true, true, true, false),
  ('estagiario', 'estornos', true, true, true, false),
  ('estagiario', 'requisicoes', true, true, true, false),
  ('estagiario', 'notas', true, true, true, false),
  ('estagiario', 'danfe', true, true, true, false),
  ('estagiario', 'mensalidades', true, true, true, false),
  ('estagiario', 'tutorial', true, false, false, false),
  ('manager', 'aprovacoes', true, false, true, false)
ON CONFLICT (role_slug, resource_key) DO UPDATE SET
  can_view = EXCLUDED.can_view,
  can_create = EXCLUDED.can_create,
  can_edit = EXCLUDED.can_edit,
  can_delete = EXCLUDED.can_delete;
