-- Colar este arquivo inteiro no SQL Editor do Supabase (schema + seed em um único script).
-- Não inclui RLS; use sql/03_rls_optional.sql depois, se precisar de políticas para o cliente Supabase.

-- ========== INÍCIO 01_schema ==========

CREATE TABLE IF NOT EXISTS public.sectors (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  budget_limit NUMERIC(18, 2) DEFAULT 0 NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.users (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL UNIQUE,
  password    TEXT NOT NULL,
  role        TEXT NOT NULL CHECK (role IN ('admin', 'finance', 'manager', 'viewer')),
  sector_id   BIGINT REFERENCES public.sectors (id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.categories (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('revenue', 'expense')),
  parent_id   BIGINT REFERENCES public.categories (id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.financial_records (
  id           BIGSERIAL PRIMARY KEY,
  date         DATE NOT NULL,
  description  TEXT,
  amount       NUMERIC(18, 2) NOT NULL,
  type         TEXT NOT NULL CHECK (type IN ('revenue', 'expense')),
  category_id  BIGINT REFERENCES public.categories (id) ON DELETE SET NULL,
  sector_id    BIGINT REFERENCES public.sectors (id) ON DELETE SET NULL,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue')),
  is_forecast  BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.invoices (
  id              BIGSERIAL PRIMARY KEY,
  invoice_number  TEXT NOT NULL,
  provider_name   TEXT NOT NULL,
  amount          NUMERIC(18, 2) NOT NULL,
  issue_date      DATE NOT NULL,
  due_date        DATE NOT NULL,
  status          TEXT NOT NULL DEFAULT 'control_pending' CHECK (status IN ('received', 'control_pending', 'control_approved', 'paid', 'overdue')),
  flow_stage      TEXT NOT NULL DEFAULT 'control_pending' CHECK (flow_stage IN ('control_pending', 'control_approved', 'paid', 'cancelled')),
  sector_id       BIGINT REFERENCES public.sectors (id) ON DELETE SET NULL,
  user_id         BIGINT REFERENCES public.users (id) ON DELETE SET NULL,
  file_path       TEXT,
  boleto_file_path TEXT,
  natureza       TEXT NOT NULL DEFAULT 'O' CHECK (natureza IN ('M','O')),
  crd            TEXT,
  payment_method TEXT CHECK (payment_method IN ('pix', 'boleto', 'cartao_credito', 'dinheiro')),
  pix_key        TEXT,
  approved_at     TIMESTAMPTZ,
  approved_by_sector TEXT,
  paid_at         TIMESTAMPTZ,
  paid_by_sector  TEXT,
  payment_receipt_path TEXT,
  cancelled_at    TIMESTAMPTZ,
  cancelled_by_sector TEXT,
  cancel_reason   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.scenarios (
  id             BIGSERIAL PRIMARY KEY,
  name           TEXT NOT NULL,
  year           INTEGER NOT NULL,
  target_revenue NUMERIC(18, 2),
  target_profit  NUMERIC(18, 2),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payment_methods (
  id BIGSERIAL PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crds (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  sector_id BIGINT REFERENCES public.sectors (id) ON DELETE SET NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (code, sector_id)
);

CREATE TABLE IF NOT EXISTS public.crd_monthly_values (
  id BIGSERIAL PRIMARY KEY,
  crd_id BIGINT NOT NULL REFERENCES public.crds (id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  value NUMERIC(18, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (crd_id, year, month)
);

CREATE TABLE IF NOT EXISTS public.sintase_occupancy (
  id BIGSERIAL PRIMARY KEY,
  year INTEGER NOT NULL UNIQUE,
  occupancy_percent NUMERIC(5, 2) NOT NULL DEFAULT 100 CHECK (occupancy_percent >= 0 AND occupancy_percent <= 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_financial_records_date ON public.financial_records (date DESC);
CREATE INDEX IF NOT EXISTS idx_financial_records_type ON public.financial_records (type);
CREATE INDEX IF NOT EXISTS idx_financial_records_category ON public.financial_records (category_id);
CREATE INDEX IF NOT EXISTS idx_financial_records_sector ON public.financial_records (sector_id);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON public.invoices (due_date);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices (status);
CREATE INDEX IF NOT EXISTS idx_invoices_sector ON public.invoices (sector_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users (email);
CREATE INDEX IF NOT EXISTS idx_crd_monthly_values_year ON public.crd_monthly_values (year);
CREATE INDEX IF NOT EXISTS idx_crd_monthly_values_crd ON public.crd_monthly_values (crd_id);
CREATE INDEX IF NOT EXISTS idx_sintase_occupancy_year ON public.sintase_occupancy (year);

CREATE OR REPLACE FUNCTION public.set_crd_monthly_values_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_crd_monthly_values_updated_at ON public.crd_monthly_values;

CREATE TRIGGER trg_crd_monthly_values_updated_at
BEFORE UPDATE ON public.crd_monthly_values
FOR EACH ROW
EXECUTE FUNCTION public.set_crd_monthly_values_updated_at();

CREATE OR REPLACE FUNCTION public.set_sintase_occupancy_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sintase_occupancy_updated_at ON public.sintase_occupancy;

CREATE TRIGGER trg_sintase_occupancy_updated_at
BEFORE UPDATE ON public.sintase_occupancy
FOR EACH ROW
EXECUTE FUNCTION public.set_sintase_occupancy_updated_at();

-- ========== INÍCIO 02_seed ==========

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

INSERT INTO public.payment_methods (key, name, active)
SELECT 'pix', 'Pix', true
WHERE NOT EXISTS (SELECT 1 FROM public.payment_methods WHERE key = 'pix');
INSERT INTO public.payment_methods (key, name, active)
SELECT 'boleto', 'Boleto', true
WHERE NOT EXISTS (SELECT 1 FROM public.payment_methods WHERE key = 'boleto');
INSERT INTO public.payment_methods (key, name, active)
SELECT 'cartao_credito', 'Cartão de crédito', true
WHERE NOT EXISTS (SELECT 1 FROM public.payment_methods WHERE key = 'cartao_credito');
INSERT INTO public.payment_methods (key, name, active)
SELECT 'dinheiro', 'Efetivo', true
WHERE NOT EXISTS (SELECT 1 FROM public.payment_methods WHERE key = 'dinheiro');

INSERT INTO public.crds (code, name, sector_id, active)
SELECT '350', 'SEGURO VIDA EM GRUPO', 3, true
WHERE NOT EXISTS (SELECT 1 FROM public.crds WHERE code = '350' AND sector_id = 3);
INSERT INTO public.crds (code, name, sector_id, active)
SELECT '379', 'SINDICATO HOTEIS E BARES', 3, true
WHERE NOT EXISTS (SELECT 1 FROM public.crds WHERE code = '379' AND sector_id = 3);
INSERT INTO public.crds (code, name, sector_id, active)
SELECT '398', 'DESPESAS MENSAIS RH', 3, true
WHERE NOT EXISTS (SELECT 1 FROM public.crds WHERE code = '398' AND sector_id = 3);
INSERT INTO public.crds (code, name, sector_id, active)
SELECT '536', 'COSTURAS ZZ', 3, true
WHERE NOT EXISTS (SELECT 1 FROM public.crds WHERE code = '536' AND sector_id = 3);
INSERT INTO public.crds (code, name, sector_id, active)
SELECT '423', 'CURSOS/TREINAMENTOS/CAPACITACOES', 3, true
WHERE NOT EXISTS (SELECT 1 FROM public.crds WHERE code = '423' AND sector_id = 3);
INSERT INTO public.crds (code, name, sector_id, active)
SELECT '439', 'XEROX/PLASTIFICACOES', 3, true
WHERE NOT EXISTS (SELECT 1 FROM public.crds WHERE code = '439' AND sector_id = 3);
INSERT INTO public.crds (code, name, sector_id, active)
SELECT '603', 'ENDOMARKETING', 3, true
WHERE NOT EXISTS (SELECT 1 FROM public.crds WHERE code = '603' AND sector_id = 3);
INSERT INTO public.crds (code, name, sector_id, active)
SELECT '664', 'COSTURAS UNIFORMES RH ZZ', 3, true
WHERE NOT EXISTS (SELECT 1 FROM public.crds WHERE code = '664' AND sector_id = 3);
INSERT INTO public.crds (code, name, sector_id, active)
SELECT '337', 'TAXA PROC TRABALHISTA', 3, true
WHERE NOT EXISTS (SELECT 1 FROM public.crds WHERE code = '337' AND sector_id = 3);
INSERT INTO public.crds (code, name, sector_id, active)
SELECT 'RH-RECURSOS-HUMANOS', 'RECURSOS HUMANOS', 3, true
WHERE NOT EXISTS (SELECT 1 FROM public.crds WHERE code = 'RH-RECURSOS-HUMANOS' AND sector_id = 3);
INSERT INTO public.crds (code, name, sector_id, active)
SELECT 'RH-UNIFORMES-EPIS', 'UNIFORMES E EPIS', 3, true
WHERE NOT EXISTS (SELECT 1 FROM public.crds WHERE code = 'RH-UNIFORMES-EPIS' AND sector_id = 3);
INSERT INTO public.crds (code, name, sector_id, active)
SELECT 'RH-FOLHA-PAGAMENTO', 'Folha de pagamento', 3, true
WHERE NOT EXISTS (SELECT 1 FROM public.crds WHERE code = 'RH-FOLHA-PAGAMENTO' AND sector_id = 3);
INSERT INTO public.crds (code, name, sector_id, active)
SELECT 'RH-EXTRAS', 'Extras', 3, true
WHERE NOT EXISTS (SELECT 1 FROM public.crds WHERE code = 'RH-EXTRAS' AND sector_id = 3);
INSERT INTO public.crds (code, name, sector_id, active)
SELECT 'RH-COMBUSTIVEL-FOLHA', 'COMBUSTIVEL FOLHA', 3, true
WHERE NOT EXISTS (SELECT 1 FROM public.crds WHERE code = 'RH-COMBUSTIVEL-FOLHA' AND sector_id = 3);
INSERT INTO public.crds (code, name, sector_id, active)
SELECT '267', 'VALE TRANSPORTE', 3, true
WHERE NOT EXISTS (SELECT 1 FROM public.crds WHERE code = '267' AND sector_id = 3);
INSERT INTO public.crds (code, name, sector_id, active)
SELECT '296', 'PROCESSO TRABALHISTA', 3, true
WHERE NOT EXISTS (SELECT 1 FROM public.crds WHERE code = '296' AND sector_id = 3);
INSERT INTO public.crds (code, name, sector_id, active)
SELECT '297', 'CONVENIOS MEDICOS', 3, true
WHERE NOT EXISTS (SELECT 1 FROM public.crds WHERE code = '297' AND sector_id = 3);
INSERT INTO public.crds (code, name, sector_id, active)
SELECT '299', 'CONVENIO ODONTOLOGICO', 3, true
WHERE NOT EXISTS (SELECT 1 FROM public.crds WHERE code = '299' AND sector_id = 3);
INSERT INTO public.crds (code, name, sector_id, active)
SELECT '300', 'AJUDA DE CUSTO', 3, true
WHERE NOT EXISTS (SELECT 1 FROM public.crds WHERE code = '300' AND sector_id = 3);
INSERT INTO public.crds (code, name, sector_id, active)
SELECT '306', 'RPA', 3, true
WHERE NOT EXISTS (SELECT 1 FROM public.crds WHERE code = '306' AND sector_id = 3);
INSERT INTO public.crds (code, name, sector_id, active)
SELECT '308', 'VALE ALIMENTACAO/REFEICAO HOTEL', 3, true
WHERE NOT EXISTS (SELECT 1 FROM public.crds WHERE code = '308' AND sector_id = 3);
INSERT INTO public.crds (code, name, sector_id, active)
SELECT '630', 'ASSIDUIDADE E BOAS PRATICAS', 3, true
WHERE NOT EXISTS (SELECT 1 FROM public.crds WHERE code = '630' AND sector_id = 3);
INSERT INTO public.crds (code, name, sector_id, active)
SELECT '378', 'SINDICATO PATRONAL', 3, true
WHERE NOT EXISTS (SELECT 1 FROM public.crds WHERE code = '378' AND sector_id = 3);
INSERT INTO public.crds (code, name, sector_id, active)
SELECT '382', 'SERV SEGURANCA TRABALHO', 3, true
WHERE NOT EXISTS (SELECT 1 FROM public.crds WHERE code = '382' AND sector_id = 3);
INSERT INTO public.crds (code, name, sector_id, active)
SELECT '528', 'COMPLEMENTO FOLHA ZZ', 3, true
WHERE NOT EXISTS (SELECT 1 FROM public.crds WHERE code = '528' AND sector_id = 3);
INSERT INTO public.crds (code, name, sector_id, active)
SELECT '302', 'AUTO INFRACAO MINISTERIO TRABALHO', 3, true
WHERE NOT EXISTS (SELECT 1 FROM public.crds WHERE code = '302' AND sector_id = 3);
