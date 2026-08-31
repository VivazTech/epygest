-- Apuração de C.M.V. (Custo de Mercadoria Vendida) por competência (mês/ano).
-- Alimenta Apuração de Resultados › CMV (Resumo/Sintético + meses).
-- Réplica da planilha "Apuração do CMV": guarda apenas os valores DIGITADOS
-- (receitas e requisições do fechamento do mês). Todos os indicadores
-- derivados (CMV Apurado, CMV Alimentos/Bebidas, valor sobre vendas, limite e
-- economia) são calculados na aplicação a partir destes campos.

CREATE TABLE IF NOT EXISTS public.cmv_apuracao (
  id BIGSERIAL PRIMARY KEY,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),

  -- RECEITAS (Vlr R$) --------------------------------------------------------
  venda_direta_total    NUMERIC NOT NULL DEFAULT 0, -- Venda Direta Total
  venda_direta_bebidas  NUMERIC NOT NULL DEFAULT 0, -- Venda Direta Bebidas (Alimentos = Total - Bebidas)
  cafe_manha_pensao     NUMERIC NOT NULL DEFAULT 0, -- Café da Manhã (Pensão)
  cafe_manha_chds       NUMERIC NOT NULL DEFAULT 0, -- Café da Manhã Chds (ajuste manual tarifário)
  almoco_jantar_pensao  NUMERIC NOT NULL DEFAULT 0, -- Almoço e Jantar (Pensão)
  almoco_jantar_chds    NUMERIC NOT NULL DEFAULT 0, -- Almoço e Jantar Chds (ajuste manual tarifário)
  almoco_jantar_antec   NUMERIC NOT NULL DEFAULT 0, -- Almoço e Jantar Vendas Antec. Rec. Chds Free
  ci_total              NUMERIC NOT NULL DEFAULT 0, -- C.I. (Venda Indireta) Total
  ci_bebidas            NUMERIC NOT NULL DEFAULT 0, -- C.I. (Venda Indireta) Bebidas (Alimentos = Total - Bebidas)

  -- REQUISIÇÕES --------------------------------------------------------------
  requisicoes_total     NUMERIC NOT NULL DEFAULT 0, -- Total das Requisições
  requisicoes_bebidas   NUMERIC NOT NULL DEFAULT 0, -- Requisições de Bebidas (Alimentos = Total - Bebidas)
  refeitorio            NUMERIC NOT NULL DEFAULT 0, -- Refeitório (SEM CRD) Uso e Consumo
  outros                NUMERIC NOT NULL DEFAULT 0, -- Outros*** Diretoria, recreação, R.H. (S/CRD) U.C.
  aquamania             NUMERIC NOT NULL DEFAULT 0, -- Aquamania Uso e Consumo

  -- PARÂMETRO ----------------------------------------------------------------
  limite_pct            NUMERIC NOT NULL DEFAULT 0.29, -- CMV Limite / Simulado (fração, ex.: 0.29 = 29%)

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT,
  UNIQUE (year, month)
);

CREATE INDEX IF NOT EXISTS idx_cmv_apuracao_year_month
  ON public.cmv_apuracao (year, month);
