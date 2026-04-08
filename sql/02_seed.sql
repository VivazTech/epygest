-- Dados iniciais equivalentes ao seed em src/db.ts
-- Execute depois de 01_schema.sql.
-- IDs fixos para bater com category_id usados nos lançamentos (2,3 e 5,6,7).
-- Segunda execução: setores/usuários/categorias ignoram conflito; cenários/lançamentos/NF só entram se ainda não existirem.

INSERT INTO public.sectors (id, name, budget_limit) VALUES
  (1, 'Marketing', 50000),
  (2, 'TI', 80000),
  (3, 'RH', 30000),
  (4, 'Vendas', 100000)
ON CONFLICT (id) DO NOTHING;

SELECT setval(
  pg_get_serial_sequence('public.sectors', 'id'),
  COALESCE((SELECT MAX(id) FROM public.sectors), 1)
);

INSERT INTO public.users (id, name, email, password, role, sector_id) VALUES
  (1, 'Admin EpyGest', 'admin@epygest.com', 'admin123', 'admin', NULL),
  (2, 'Financeiro João', 'finance@epygest.com', 'finance123', 'finance', NULL),
  (3, 'Gestor Maria', 'maria@marketing.com', 'maria123', 'manager', 1)
ON CONFLICT (id) DO NOTHING;

SELECT setval(
  pg_get_serial_sequence('public.users', 'id'),
  COALESCE((SELECT MAX(id) FROM public.users), 1)
);

INSERT INTO public.categories (id, name, type, parent_id) VALUES
  (1, 'Receitas Operacionais', 'revenue', NULL),
  (2, 'Venda de Produtos', 'revenue', 1),
  (3, 'Prestação de Serviços', 'revenue', 1),
  (4, 'Despesas Operacionais', 'expense', NULL),
  (5, 'Salários', 'expense', 4),
  (6, 'Marketing e Publicidade', 'expense', 4),
  (7, 'Infraestrutura', 'expense', 4)
ON CONFLICT (id) DO NOTHING;

SELECT setval(
  pg_get_serial_sequence('public.categories', 'id'),
  COALESCE((SELECT MAX(id) FROM public.categories), 1)
);

INSERT INTO public.scenarios (name, year, target_revenue, target_profit)
SELECT 'Otimista', 2026, 3000000, 600000
WHERE NOT EXISTS (SELECT 1 FROM public.scenarios s WHERE s.name = 'Otimista' AND s.year = 2026);

INSERT INTO public.scenarios (name, year, target_revenue, target_profit)
SELECT 'Regular', 2026, 2500000, 400000
WHERE NOT EXISTS (SELECT 1 FROM public.scenarios s WHERE s.name = 'Regular' AND s.year = 2026);

INSERT INTO public.scenarios (name, year, target_revenue, target_profit)
SELECT 'Pessimista', 2026, 2000000, 200000
WHERE NOT EXISTS (SELECT 1 FROM public.scenarios s WHERE s.name = 'Pessimista' AND s.year = 2026);

-- Lançamentos: 12 meses retroativos (só se a tabela ainda estiver vazia)
DO $$
DECLARE
  d           date;
  i           int;
  sales_id    bigint := 4;
  it_id       bigint := 2;
  hr_id       bigint := 3;
BEGIN
  IF EXISTS (SELECT 1 FROM public.financial_records LIMIT 1) THEN
    RETURN;
  END IF;

  FOR i IN 0..11 LOOP
    d := ((date_trunc('month', current_date) - (i || ' months')::interval) + interval '14 days')::date;

    INSERT INTO public.financial_records (date, amount, type, category_id, sector_id, status)
    VALUES
      (d, 150000 + (random() * 50000)::numeric(18,2), 'revenue', 2, sales_id, 'paid'),
      (d, 80000 + (random() * 20000)::numeric(18,2), 'revenue', 3, sales_id, 'paid'),
      (d, 40000, 'expense', 5, hr_id, 'paid'),
      (d, 15000 + (random() * 5000)::numeric(18,2), 'expense', 6, 1, 'paid'),
      (d, 10000 + (random() * 2000)::numeric(18,2), 'expense', 7, it_id, 'paid');
  END LOOP;
END $$;

SELECT setval(
  pg_get_serial_sequence('public.financial_records', 'id'),
  COALESCE((SELECT MAX(id) FROM public.financial_records), 1)
);

INSERT INTO public.invoices (
  invoice_number, provider_name, amount, issue_date, due_date,
  status, flow_stage, sector_id, user_id
)
SELECT
  'NF-EXEMPLO-001',
  'Fornecedor Demonstração',
  1250.00,
  current_date,
  current_date + 30,
  'received',
  'control_pending',
  1,
  1
WHERE NOT EXISTS (
  SELECT 1 FROM public.invoices i WHERE i.invoice_number = 'NF-EXEMPLO-001'
);

SELECT setval(
  pg_get_serial_sequence('public.invoices', 'id'),
  COALESCE((SELECT MAX(id) FROM public.invoices), 1)
);

SELECT setval(
  pg_get_serial_sequence('public.scenarios', 'id'),
  COALESCE((SELECT MAX(id) FROM public.scenarios), 1)
);
