-- Esquema alinhado a src/db.ts e server.ts (SQLite → PostgreSQL / Supabase)
-- Execute no SQL Editor do Supabase antes do seed.

-- Opcional: schema dedicado (descomente se quiser isolar)
-- CREATE SCHEMA IF NOT EXISTS finance;
-- SET search_path TO finance, public;

-- ---------------------------------------------------------------------------
-- Tabelas (ordem respeita FKs)
-- ---------------------------------------------------------------------------

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
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Índices úteis para consultas do servidor e futuras APIs
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_financial_records_date ON public.financial_records (date DESC);
CREATE INDEX IF NOT EXISTS idx_financial_records_type ON public.financial_records (type);
CREATE INDEX IF NOT EXISTS idx_financial_records_category ON public.financial_records (category_id);
CREATE INDEX IF NOT EXISTS idx_financial_records_sector ON public.financial_records (sector_id);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON public.invoices (due_date);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices (status);
CREATE INDEX IF NOT EXISTS idx_invoices_sector ON public.invoices (sector_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users (email);
