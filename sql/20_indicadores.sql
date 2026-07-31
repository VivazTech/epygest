-- ---------------------------------------------------------------------------
-- Indicadores Gerenciais (Números Vivaz): Realizado x Metas por (ano, mês)
-- Origem: planilha "Vivaz - Números.xlsx" (abas Dados = realizado, Metas = meta).
--
-- Modelo "inputs + cálculo no sistema": guardamos APENAS os valores de entrada
-- (RN, receitas por PDV, despesas, etc). Ocupação, Diária Média, RevPAR,
-- Faturamento, EBITDA, Resultado etc. são CALCULADOS pelo backend com as mesmas
-- fórmulas da planilha. Assim, ao adicionar um ano novo, basta digitar os inputs
-- que os indicadores saem automáticos.
--
-- Execute no SQL Editor do Supabase.
-- ---------------------------------------------------------------------------

-- Parâmetros por ano (UHs = nº de unidades habitacionais disponíveis)
CREATE TABLE IF NOT EXISTS public.indicadores_parametros (
  year        INTEGER PRIMARY KEY,
  uhs         INTEGER NOT NULL DEFAULT 172 CHECK (uhs > 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Valores de entrada por escopo (realizado/meta), ano e mês
CREATE TABLE IF NOT EXISTS public.indicadores_mensais (
  id                    BIGSERIAL PRIMARY KEY,
  escopo                TEXT NOT NULL CHECK (escopo IN ('realizado', 'meta')),
  year                  INTEGER NOT NULL,
  month                 INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),

  -- Hospedagem (inputs)
  rn                    NUMERIC(18, 4) NOT NULL DEFAULT 0,   -- room-nights vendidos
  receita_hospedagem    NUMERIC(18, 2) NOT NULL DEFAULT 0,   -- receita de diárias/hospedagem
  pax                   NUMERIC(18, 4) NOT NULL DEFAULT 0,   -- nº de hóspedes

  -- A&B / PDVs (inputs)
  frigobar              NUMERIC(18, 2) NOT NULL DEFAULT 0,
  room_service          NUMERIC(18, 2) NOT NULL DEFAULT 0,
  bar_gaia              NUMERIC(18, 2) NOT NULL DEFAULT 0,
  rest_allegro          NUMERIC(18, 2) NOT NULL DEFAULT 0,
  rest_terraza          NUMERIC(18, 2) NOT NULL DEFAULT 0,
  map_comercial         NUMERIC(18, 2) NOT NULL DEFAULT 0,
  eventos_banquetes     NUMERIC(18, 2) NOT NULL DEFAULT 0,

  -- Outras receitas (inputs)
  eventos               NUMERIC(18, 2) NOT NULL DEFAULT 0,
  outras_receitas       NUMERIC(18, 2) NOT NULL DEFAULT 0,
  nao_operacional       NUMERIC(18, 2) NOT NULL DEFAULT 0,

  -- Despesas / DRE (inputs)
  cmv                   NUMERIC(18, 2) NOT NULL DEFAULT 0,
  csp                   NUMERIC(18, 2) NOT NULL DEFAULT 0,   -- CSP - Aquamania
  impostos_faturamento  NUMERIC(18, 2) NOT NULL DEFAULT 0,
  desp_operacional      NUMERIC(18, 2) NOT NULL DEFAULT 0,
  desp_pessoal          NUMERIC(18, 2) NOT NULL DEFAULT 0,
  desp_vendas           NUMERIC(18, 2) NOT NULL DEFAULT 0,
  pessoal_zz            NUMERIC(18, 2) NOT NULL DEFAULT 0,   -- ajuste extra-operacional (Pessoal ZZ)
  despesas_zz           NUMERIC(18, 2) NOT NULL DEFAULT 0,   -- ajuste extra-operacional (Despesas ZZ)
  csll_ir               NUMERIC(18, 2) NOT NULL DEFAULT 0,
  investimentos         NUMERIC(18, 2) NOT NULL DEFAULT 0,

  -- Repasses / equipe (inputs)
  map_repasse           NUMERIC(18, 2) NOT NULL DEFAULT 0,   -- MAP
  cafe_repasse          NUMERIC(18, 2) NOT NULL DEFAULT 0,   -- Café
  qtd_equipe            NUMERIC(18, 2) NOT NULL DEFAULT 0,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (escopo, year, month)
);

CREATE INDEX IF NOT EXISTS idx_indicadores_mensais_year
  ON public.indicadores_mensais (year);
CREATE INDEX IF NOT EXISTS idx_indicadores_mensais_escopo_year
  ON public.indicadores_mensais (escopo, year);

-- Trigger de updated_at (reutilizável)
CREATE OR REPLACE FUNCTION public.set_indicadores_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_indicadores_mensais_updated_at ON public.indicadores_mensais;
CREATE TRIGGER trg_indicadores_mensais_updated_at
BEFORE UPDATE ON public.indicadores_mensais
FOR EACH ROW EXECUTE FUNCTION public.set_indicadores_updated_at();

DROP TRIGGER IF EXISTS trg_indicadores_parametros_updated_at ON public.indicadores_parametros;
CREATE TRIGGER trg_indicadores_parametros_updated_at
BEFORE UPDATE ON public.indicadores_parametros
FOR EACH ROW EXECUTE FUNCTION public.set_indicadores_updated_at();
