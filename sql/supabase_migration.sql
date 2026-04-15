-- ============================================================
-- MIGRAÇÃO SUPABASE — Sistema Financeiro (EpyGest)
-- Execute este script no SQL Editor do seu projeto Supabase
-- ============================================================

-- Tabela: sectors
CREATE TABLE IF NOT EXISTS sectors (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  budget_limit NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela: users
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT CHECK(role IN ('admin', 'finance', 'manager', 'viewer')) NOT NULL,
  sector_id BIGINT REFERENCES sectors(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela: categories
CREATE TABLE IF NOT EXISTS categories (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT CHECK(type IN ('revenue', 'expense')) NOT NULL,
  parent_id BIGINT REFERENCES categories(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela: financial_records
CREATE TABLE IF NOT EXISTS financial_records (
  id BIGSERIAL PRIMARY KEY,
  date DATE NOT NULL,
  description TEXT,
  amount NUMERIC NOT NULL,
  type TEXT CHECK(type IN ('revenue', 'expense')) NOT NULL,
  category_id BIGINT REFERENCES categories(id),
  sector_id BIGINT REFERENCES sectors(id),
  status TEXT CHECK(status IN ('pending', 'paid', 'overdue')) DEFAULT 'pending',
  is_forecast BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela: invoices
CREATE TABLE IF NOT EXISTS invoices (
  id BIGSERIAL PRIMARY KEY,
  invoice_number TEXT NOT NULL,
  provider_name TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  issue_date DATE NOT NULL,
  due_date DATE NOT NULL,
  status TEXT CHECK(status IN ('received', 'control_pending', 'control_approved', 'paid', 'overdue')) DEFAULT 'control_pending',
  flow_stage TEXT CHECK(flow_stage IN ('control_pending', 'control_approved', 'paid', 'cancelled')) DEFAULT 'control_pending',
  sector_id BIGINT REFERENCES sectors(id),
  user_id BIGINT REFERENCES users(id),
  file_path TEXT,
  boleto_file_path TEXT,
  natureza TEXT CHECK(natureza IN ('M', 'O')) DEFAULT 'O',
  crd TEXT,
  payment_method TEXT CHECK(payment_method IN ('pix', 'boleto', 'cartao_credito', 'dinheiro')),
  pix_key TEXT,
  approved_at TIMESTAMPTZ,
  approved_by_sector TEXT,
  paid_at TIMESTAMPTZ,
  paid_by_sector TEXT,
  payment_receipt_path TEXT,
  cancelled_at TIMESTAMPTZ,
  cancelled_by_sector TEXT,
  cancel_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela: scenarios
CREATE TABLE IF NOT EXISTS scenarios (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  year INTEGER NOT NULL,
  target_revenue NUMERIC,
  target_profit NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela: payment_methods
CREATE TABLE IF NOT EXISTS payment_methods (
  id BIGSERIAL PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela: crds
CREATE TABLE IF NOT EXISTS crds (
  id BIGSERIAL PRIMARY KEY,
  natureza TEXT CHECK(natureza IN ('M', 'O')) DEFAULT 'O',
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  sector_id BIGINT REFERENCES sectors(id),
  saldo_anterior NUMERIC DEFAULT 0,
  previsto_mes NUMERIC DEFAULT 0,
  disponivel_mes NUMERIC DEFAULT 0,
  realizado_mes NUMERIC DEFAULT 0,
  saldo NUMERIC DEFAULT 0,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(code, sector_id)
);

-- Tabela: requisitions
CREATE TABLE IF NOT EXISTS requisitions (
  id BIGSERIAL PRIMARY KEY,
  sector_id BIGINT NOT NULL REFERENCES sectors(id),
  description TEXT,
  amount NUMERIC NOT NULL,
  date DATE NOT NULL,
  status TEXT CHECK(status IN ('open', 'cancelled', 'posted')) DEFAULT 'open',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SEED: Formas de pagamento
-- ============================================================
INSERT INTO payment_methods (key, name, active)
VALUES
  ('pix', 'Pix', TRUE),
  ('boleto', 'Boleto', TRUE),
  ('cartao_credito', 'Cartão de crédito', TRUE),
  ('dinheiro', 'Dinheiro', TRUE)
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- SEED: Setores iniciais
-- ============================================================
INSERT INTO sectors (name, budget_limit)
VALUES
  ('Marketing', 50000),
  ('TI', 80000),
  ('RH', 30000),
  ('Vendas', 100000)
ON CONFLICT DO NOTHING;

-- ============================================================
-- SEED: Usuários iniciais
-- ============================================================
INSERT INTO users (name, email, password, role, sector_id)
VALUES
  ('Admin EpyGest', 'admin@epygest.com', 'admin123', 'admin', NULL),
  ('Financeiro João', 'finance@epygest.com', 'finance123', 'finance', NULL),
  ('Gestor Maria', 'maria@marketing.com', 'maria123', 'manager', (SELECT id FROM sectors WHERE name = 'Marketing' LIMIT 1))
ON CONFLICT (email) DO NOTHING;

-- ============================================================
-- SEED: Categorias
-- ============================================================
WITH ins_rev AS (
  INSERT INTO categories (name, type, parent_id)
  VALUES ('Receitas Operacionais', 'revenue', NULL)
  ON CONFLICT DO NOTHING
  RETURNING id
)
INSERT INTO categories (name, type, parent_id)
SELECT name, type, (SELECT id FROM ins_rev) FROM (VALUES
  ('Venda de Produtos', 'revenue'),
  ('Prestação de Serviços', 'revenue')
) AS t(name, type)
ON CONFLICT DO NOTHING;

WITH ins_exp AS (
  INSERT INTO categories (name, type, parent_id)
  VALUES ('Despesas Operacionais', 'expense', NULL)
  ON CONFLICT DO NOTHING
  RETURNING id
)
INSERT INTO categories (name, type, parent_id)
SELECT name, type, (SELECT id FROM ins_exp) FROM (VALUES
  ('Salários', 'expense'),
  ('Marketing e Publicidade', 'expense'),
  ('Infraestrutura', 'expense')
) AS t(name, type)
ON CONFLICT DO NOTHING;

-- ============================================================
-- SEED: Cenários
-- ============================================================
INSERT INTO scenarios (name, year, target_revenue, target_profit)
VALUES
  ('Otimista', 2024, 3000000, 600000),
  ('Regular', 2024, 2500000, 400000),
  ('Pessimista', 2024, 2000000, 200000)
ON CONFLICT DO NOTHING;

-- ============================================================
-- SEED: CRDs do setor RH
-- ============================================================
DO $$
DECLARE rh_id BIGINT;
BEGIN
  SELECT id INTO rh_id FROM sectors WHERE UPPER(name) = 'RH' LIMIT 1;
  IF rh_id IS NOT NULL THEN
    INSERT INTO crds (code, name, sector_id, active) VALUES
      ('350', 'SEGURO VIDA EM GRUPO', rh_id, TRUE),
      ('379', 'SINDICATO HOTEIS E BARES', rh_id, TRUE),
      ('398', 'DESPESAS MENSAIS RH', rh_id, TRUE),
      ('536', 'COSTURAS ZZ', rh_id, TRUE),
      ('423', 'CURSOS/TREINAMENTOS/CAPACITACOES', rh_id, TRUE),
      ('439', 'XEROX/PLASTIFICACOES', rh_id, TRUE),
      ('603', 'ENDOMARKETING', rh_id, TRUE),
      ('664', 'COSTURAS UNIFORMES RH ZZ', rh_id, TRUE),
      ('337', 'TAXA PROC TRABALHISTA', rh_id, TRUE),
      ('RH-RECURSOS-HUMANOS', 'RECURSOS HUMANOS', rh_id, TRUE),
      ('RH-UNIFORMES-EPIS', 'UNIFORMES E EPIS', rh_id, TRUE),
      ('RH-FOLHA-PAGAMENTO', 'Folha de pagamento', rh_id, TRUE),
      ('RH-EXTRAS', 'Extras', rh_id, TRUE),
      ('RH-COMBUSTIVEL-FOLHA', 'COMBUSTIVEL FOLHA', rh_id, TRUE),
      ('267', 'VALE TRANSPORTE', rh_id, TRUE),
      ('296', 'PROCESSO TRABALHISTA', rh_id, TRUE),
      ('297', 'CONVENIOS MEDICOS', rh_id, TRUE),
      ('299', 'CONVENIO ODONTOLOGICO', rh_id, TRUE),
      ('300', 'AJUDA DE CUSTO', rh_id, TRUE),
      ('306', 'RPA', rh_id, TRUE),
      ('308', 'VALE ALIMENTACAO/REFEICAO HOTEL', rh_id, TRUE),
      ('630', 'ASSIDUIDADE E BOAS PRATICAS', rh_id, TRUE),
      ('378', 'SINDICATO PATRONAL', rh_id, TRUE),
      ('382', 'SERV SEGURANCA TRABALHO', rh_id, TRUE),
      ('528', 'COMPLEMENTO FOLHA ZZ', rh_id, TRUE),
      ('302', 'AUTO INFRACAO MINISTERIO TRABALHO', rh_id, TRUE)
    ON CONFLICT (code, sector_id) DO NOTHING;
  END IF;
END $$;

-- ============================================================
-- Bucket de storage para arquivos de notas fiscais
-- (Execute no Supabase Dashboard > Storage > New Bucket)
-- Nome: invoice-files | Public: TRUE
-- ============================================================
