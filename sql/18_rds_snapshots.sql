-- Relatório Diário de Situação (RDS): snapshot por competência (mês/ano).
-- Alimenta Apuração de Receita › Relatório Diário de Situação (Resumo + meses).
-- As planilhas "Relatório de RDS" e "Apoio RDS" continuam independentes.

CREATE TABLE IF NOT EXISTS public.rds_snapshots (
  id BIGSERIAL PRIMARY KEY,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  report_date TEXT,
  file_name TEXT,
  sections JSONB NOT NULL DEFAULT '[]'::jsonb,
  previsao_semana JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (year, month)
);

CREATE INDEX IF NOT EXISTS idx_rds_snapshots_year_month
  ON public.rds_snapshots (year, month);
