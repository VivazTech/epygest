-- Complemento do módulo de Apuração de Folha (execute após folha_apuracao_module.sql)

-- Configurações globais do módulo (singleton id=1)
CREATE TABLE IF NOT EXISTS folha_config (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  comissao_produtividade_separadas BOOLEAN NOT NULL DEFAULT TRUE,
  incluir_retorno_total_custo BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO folha_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Setores da folha (pode espelhar sectors ou ser independente)
CREATE TABLE IF NOT EXISTS folha_setores (
  id BIGSERIAL PRIMARY KEY,
  nome TEXT NOT NULL UNIQUE,
  codigo TEXT,
  sector_id BIGINT,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cargos
CREATE TABLE IF NOT EXISTS folha_cargos (
  id BIGSERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  codigo TEXT,
  cbo TEXT,
  setor_id BIGINT REFERENCES folha_setores(id) ON DELETE SET NULL,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Funcionários (sincronizados na importação)
CREATE TABLE IF NOT EXISTS folha_funcionarios (
  id BIGSERIAL PRIMARY KEY,
  codigo_funcionario TEXT NOT NULL,
  nome TEXT NOT NULL,
  cpf TEXT,
  cargo_id BIGINT REFERENCES folha_cargos(id) ON DELETE SET NULL,
  cargo_nome TEXT,
  setor_id BIGINT REFERENCES folha_setores(id) ON DELETE SET NULL,
  setor_nome TEXT,
  data_admissao DATE,
  situacao_atual TEXT,
  salario_base NUMERIC(14, 2) DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (codigo_funcionario)
);

-- Lançamentos brutos por funcionário (extraídos do extrato na importação)
CREATE TABLE IF NOT EXISTS folha_lancamentos_importados (
  id BIGSERIAL PRIMARY KEY,
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
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_folha_lanc_imp_comp
  ON folha_lancamentos_importados (competencia_ano, competencia_mes);

-- Rubricas ignoradas (não entram na apuração)
CREATE TABLE IF NOT EXISTS folha_rubricas_ignoradas (
  codigo_rubrica TEXT PRIMARY KEY,
  descricao TEXT,
  ignorado_por BIGINT,
  ignorado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Auditoria de processamento e bloqueios
CREATE TABLE IF NOT EXISTS folha_apuracao_auditoria (
  id BIGSERIAL PRIMARY KEY,
  competencia_ano SMALLINT,
  competencia_mes SMALLINT,
  acao TEXT NOT NULL,
  usuario_id BIGINT,
  detalhes JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_folha_auditoria_comp
  ON folha_apuracao_auditoria (competencia_ano, competencia_mes);

-- Situações contabilizadas na apuração
CREATE TABLE IF NOT EXISTS folha_situacoes_resumo (
  id BIGSERIAL PRIMARY KEY,
  competencia_ano SMALLINT NOT NULL,
  competencia_mes SMALLINT NOT NULL,
  situacao TEXT NOT NULL,
  quantidade INT NOT NULL DEFAULT 0,
  UNIQUE (competencia_ano, competencia_mes, situacao)
);
