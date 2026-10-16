-- Adiciona perfil Diretoria (Dashboard consolidado — Fase 4.9).
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check
  CHECK (role = ANY (ARRAY[
    'admin'::text,
    'finance'::text,
    'controle'::text,
    'manager'::text,
    'viewer'::text,
    'diretoria'::text
  ]));
