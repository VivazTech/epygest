-- Integração Tangerino — indicadores de ponto (horas previstas, trabalhadas, ausências).
-- Importação via CSV preparada; parser de PDF será mapeado posteriormente.

CREATE TABLE IF NOT EXISTS public.tangerino_empresas (
  empresa_key TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.tangerino_empresas (empresa_key, nome) VALUES
  ('vivaz', 'Vivaz Cataratas'),
  ('aqua', 'Aqua')
ON CONFLICT (empresa_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.tangerino_importacoes (
  id BIGSERIAL PRIMARY KEY,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  empresa_key TEXT NOT NULL REFERENCES public.tangerino_empresas (empresa_key),
  arquivo_nome TEXT,
  origem TEXT NOT NULL DEFAULT 'csv' CHECK (origem IN ('csv', 'pdf', 'manual')),
  linhas INTEGER NOT NULL DEFAULT 0,
  usuario TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tangerino_import_comp
  ON public.tangerino_importacoes (year, month, empresa_key);

CREATE TABLE IF NOT EXISTS public.tangerino_colaborador_vinculo (
  id BIGSERIAL PRIMARY KEY,
  empresa_key TEXT NOT NULL REFERENCES public.tangerino_empresas (empresa_key),
  tangerino_id TEXT,
  nome_tangerino TEXT NOT NULL,
  codigo_funcionario TEXT,
  setor_nome TEXT,
  setor_codigo TEXT,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  observacao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_key, nome_tangerino)
);

CREATE INDEX IF NOT EXISTS idx_tangerino_vinculo_codigo
  ON public.tangerino_colaborador_vinculo (codigo_funcionario);

CREATE TABLE IF NOT EXISTS public.tangerino_ponto_mensal (
  id BIGSERIAL PRIMARY KEY,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  empresa_key TEXT NOT NULL REFERENCES public.tangerino_empresas (empresa_key),
  colaborador_chave TEXT NOT NULL,
  tangerino_id TEXT,
  codigo_funcionario TEXT,
  nome_colaborador TEXT NOT NULL,
  setor_nome TEXT,
  setor_codigo TEXT,
  horas_previstas NUMERIC(12, 2) NOT NULL DEFAULT 0,
  horas_trabalhadas NUMERIC(12, 2) NOT NULL DEFAULT 0,
  horas_ausencia NUMERIC(12, 2) NOT NULL DEFAULT 0,
  dias_faltas NUMERIC(10, 2) NOT NULL DEFAULT 0,
  importacao_id BIGINT REFERENCES public.tangerino_importacoes (id) ON DELETE SET NULL,
  vinculo_automatico BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (year, month, empresa_key, colaborador_chave)
);

CREATE INDEX IF NOT EXISTS idx_tangerino_ponto_comp
  ON public.tangerino_ponto_mensal (year, month, empresa_key);

CREATE INDEX IF NOT EXISTS idx_tangerino_ponto_setor
  ON public.tangerino_ponto_mensal (year, month, setor_nome);

CREATE INDEX IF NOT EXISTS idx_tangerino_ponto_codigo
  ON public.tangerino_ponto_mensal (codigo_funcionario);
