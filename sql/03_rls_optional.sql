-- Opcional: Row Level Security no Supabase
-- Use SOMENTE se for acessar essas tabelas direto do browser com anon/authenticated.
-- Backend Node com connection string "postgres" (ou service_role) ignora RLS.
--
-- Políticas abaixo liberam leitura/escrita para qualquer usuário autenticado.
-- Para desenvolvimento com anon, troque TO authenticated por TO anon (menos seguro).

ALTER TABLE public.sectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scenarios ENABLE ROW LEVEL SECURITY;

-- Remover políticas antigas com o mesmo nome (reexecução segura)
DROP POLICY IF EXISTS "sectors_all_authenticated" ON public.sectors;
DROP POLICY IF EXISTS "users_all_authenticated" ON public.users;
DROP POLICY IF EXISTS "categories_all_authenticated" ON public.categories;
DROP POLICY IF EXISTS "financial_records_all_authenticated" ON public.financial_records;
DROP POLICY IF EXISTS "invoices_all_authenticated" ON public.invoices;
DROP POLICY IF EXISTS "scenarios_all_authenticated" ON public.scenarios;

CREATE POLICY "sectors_all_authenticated"
  ON public.sectors FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "users_all_authenticated"
  ON public.users FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "categories_all_authenticated"
  ON public.categories FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "financial_records_all_authenticated"
  ON public.financial_records FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "invoices_all_authenticated"
  ON public.invoices FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "scenarios_all_authenticated"
  ON public.scenarios FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Se precisar leitura pública para testes (não recomendado em produção):
-- CREATE POLICY "sectors_read_anon" ON public.sectors FOR SELECT TO anon USING (true);
