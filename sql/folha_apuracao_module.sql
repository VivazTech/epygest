-- Módulo de Apuração de Folha
-- Execute no Supabase SQL Editor

-- Importações (metadados por competência)
CREATE TABLE IF NOT EXISTS folha_importacoes (
  id BIGSERIAL PRIMARY KEY,
  nome_arquivo TEXT,
  competencia_mes SMALLINT NOT NULL CHECK (competencia_mes BETWEEN 1 AND 12),
  competencia_ano SMALLINT NOT NULL,
  data_importacao TIMESTAMPTZ DEFAULT NOW(),
  usuario_id BIGINT,
  status TEXT DEFAULT 'importado',
  total_funcionarios INT DEFAULT 0,
  total_rubricas INT DEFAULT 0,
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (competencia_ano, competencia_mes)
);

-- Parâmetros de classificação de rubricas
CREATE TABLE IF NOT EXISTS folha_rubricas_parametros (
  id BIGSERIAL PRIMARY KEY,
  codigo_rubrica TEXT NOT NULL,
  descricao TEXT NOT NULL DEFAULT '',
  categoria TEXT NOT NULL DEFAULT 'neutro',
  entra_provento BOOLEAN NOT NULL DEFAULT FALSE,
  entra_retorno BOOLEAN NOT NULL DEFAULT FALSE,
  entra_comissao BOOLEAN NOT NULL DEFAULT FALSE,
  entra_produtividade BOOLEAN NOT NULL DEFAULT FALSE,
  entra_base_salario BOOLEAN NOT NULL DEFAULT TRUE,
  entra_encargos BOOLEAN NOT NULL DEFAULT FALSE,
  fator_provento NUMERIC(12, 4) NOT NULL DEFAULT 1,
  fator_retorno NUMERIC(12, 4) NOT NULL DEFAULT -1,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (codigo_rubrica)
);

-- Parâmetros de encargos por ano
CREATE TABLE IF NOT EXISTS folha_parametros_encargos (
  id BIGSERIAL PRIMARY KEY,
  ano SMALLINT NOT NULL,
  percentual_fgts NUMERIC(8, 4) NOT NULL DEFAULT 0.08,
  percentual_inss NUMERIC(8, 4) NOT NULL DEFAULT 0.20,
  percentual_fgts_aprendiz NUMERIC(8, 4) NOT NULL DEFAULT 0.02,
  percentual_provisao_13 NUMERIC(8, 4) NOT NULL DEFAULT 0.083333,
  percentual_provisao_ferias NUMERIC(8, 4) NOT NULL DEFAULT 0.083333,
  percentual_um_terco_ferias NUMERIC(8, 4) NOT NULL DEFAULT 0.333333,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (ano)
);

-- Lançamentos classificados (derivados de folha_rubricas + funcionários)
CREATE TABLE IF NOT EXISTS folha_lancamentos (
  id BIGSERIAL PRIMARY KEY,
  importacao_id BIGINT REFERENCES folha_importacoes(id) ON DELETE SET NULL,
  competencia_mes SMALLINT NOT NULL,
  competencia_ano SMALLINT NOT NULL,
  codigo_funcionario TEXT,
  nome_funcionario TEXT,
  cpf_funcionario TEXT,
  cargo_nome TEXT,
  setor_nome TEXT,
  situacao TEXT,
  codigo_rubrica TEXT NOT NULL,
  descricao_rubrica TEXT,
  tipo_original TEXT,
  quantidade TEXT,
  valor_original NUMERIC(14, 2) NOT NULL DEFAULT 0,
  valor_provento NUMERIC(14, 2) NOT NULL DEFAULT 0,
  valor_retorno NUMERIC(14, 2) NOT NULL DEFAULT 0,
  valor_comissao NUMERIC(14, 2) NOT NULL DEFAULT 0,
  valor_produtividade NUMERIC(14, 2) NOT NULL DEFAULT 0,
  status_mapeamento TEXT NOT NULL DEFAULT 'mapeado',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_folha_lancamentos_competencia
  ON folha_lancamentos (competencia_ano, competencia_mes);

CREATE INDEX IF NOT EXISTS idx_folha_lancamentos_rubrica
  ON folha_lancamentos (codigo_rubrica);

-- Apuração mensal consolidada
CREATE TABLE IF NOT EXISTS folha_apuracoes_mensais (
  id BIGSERIAL PRIMARY KEY,
  competencia_mes SMALLINT NOT NULL,
  competencia_ano SMALLINT NOT NULL,
  total_proventos NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_retorno NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_comissao NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_produtividade NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_salario NUMERIC(14, 2) NOT NULL DEFAULT 0,
  provisao_13 NUMERIC(14, 2) NOT NULL DEFAULT 0,
  provisao_ferias NUMERIC(14, 2) NOT NULL DEFAULT 0,
  provisao_um_terco_ferias NUMERIC(14, 2) NOT NULL DEFAULT 0,
  fgts NUMERIC(14, 2) NOT NULL DEFAULT 0,
  fgts_provisao_ferias NUMERIC(14, 2) NOT NULL DEFAULT 0,
  fgts_provisao_13 NUMERIC(14, 2) NOT NULL DEFAULT 0,
  inss NUMERIC(14, 2) NOT NULL DEFAULT 0,
  inss_13 NUMERIC(14, 2) NOT NULL DEFAULT 0,
  inss_provisao_ferias NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_custo NUMERIC(14, 2) NOT NULL DEFAULT 0,
  qtd_trabalhando INT NOT NULL DEFAULT 0,
  qtd_funcionarios INT NOT NULL DEFAULT 0,
  rubricas_nao_mapeadas INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'calculado',
  bloqueado BOOLEAN NOT NULL DEFAULT FALSE,
  calculado_por BIGINT,
  calculado_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (competencia_ano, competencia_mes)
);

-- Cargos da folha (opcional, para cadastro futuro)
CREATE TABLE IF NOT EXISTS folha_cargos (
  id BIGSERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  codigo TEXT,
  cbo TEXT,
  setor_id BIGINT,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seeds: rubricas conhecidas da planilha
INSERT INTO folha_rubricas_parametros (
  codigo_rubrica, descricao, categoria,
  entra_provento, entra_retorno, entra_comissao, entra_produtividade,
  fator_provento, fator_retorno
) VALUES
  ('37', 'COMISSAO', 'comissao', FALSE, FALSE, TRUE, FALSE, 1, -1),
  ('853', 'REFLEXO COMISSAO DSR', 'comissao', FALSE, FALSE, TRUE, FALSE, 1, -1),
  ('44', 'PRODUTIVIDADE', 'produtividade', FALSE, FALSE, FALSE, TRUE, 1, -1)
ON CONFLICT (codigo_rubrica) DO NOTHING;

-- Parâmetros de encargos 2026
INSERT INTO folha_parametros_encargos (ano, percentual_fgts, percentual_inss)
VALUES (2026, 0.08, 0.20)
ON CONFLICT (ano) DO NOTHING;
