-- Módulo de absenteísmo: horas previstas, trabalhadas e ausências por funcionário/competência.

CREATE TABLE IF NOT EXISTS public.folha_absenteismo_config (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  horas_previstas_padrao NUMERIC(10, 2) NOT NULL DEFAULT 220,
  horas_dia_padrao NUMERIC(6, 2) NOT NULL DEFAULT 8,
  dias_uteis_padrao NUMERIC(6, 2) NOT NULL DEFAULT 22,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.folha_absenteismo_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.folha_absenteismo_mensal (
  id BIGSERIAL PRIMARY KEY,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  empresa_nome TEXT,
  codigo_funcionario TEXT NOT NULL,
  nome_funcionario TEXT,
  setor_nome TEXT,
  setor_codigo TEXT,
  horas_previstas NUMERIC(12, 2) NOT NULL DEFAULT 0,
  horas_trabalhadas NUMERIC(12, 2) NOT NULL DEFAULT 0,
  horas_ausencia NUMERIC(12, 2) NOT NULL DEFAULT 0,
  dias_faltas NUMERIC(10, 2) NOT NULL DEFAULT 0,
  absenteismo_pct NUMERIC(8, 4),
  fonte_previstas TEXT,
  fonte_trabalhadas TEXT,
  fonte_ausencias TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (year, month, codigo_funcionario)
);

CREATE INDEX IF NOT EXISTS idx_folha_absenteismo_comp
  ON public.folha_absenteismo_mensal (year, month);

CREATE INDEX IF NOT EXISTS idx_folha_absenteismo_setor
  ON public.folha_absenteismo_mensal (year, month, setor_nome);

CREATE TABLE IF NOT EXISTS public.folha_provisao_ferias (
  id BIGSERIAL PRIMARY KEY,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  codigo_funcionario TEXT NOT NULL,
  nome TEXT,
  faltas NUMERIC(10, 2) NOT NULL DEFAULT 0,
  fer_ven NUMERIC(12, 2) DEFAULT 0,
  fer_pro NUMERIC(12, 2) DEFAULT 0,
  salario NUMERIC(14, 2) DEFAULT 0,
  valor_mes NUMERIC(14, 2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (year, month, codigo_funcionario)
);

CREATE INDEX IF NOT EXISTS idx_folha_provisao_ferias_comp
  ON public.folha_provisao_ferias (year, month);
