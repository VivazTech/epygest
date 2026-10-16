-- Tarifas internas do CMV (café da manhã, pensão) com vigência e histórico.

CREATE TABLE IF NOT EXISTS public.cmv_tarifas_config (
  id BIGSERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  motivo TEXT NOT NULL DEFAULT 'padrao'
    CHECK (motivo IN ('padrao', 'carnaval', 'reveillon', 'pacote', 'promocao', 'outro')),
  prioridade SMALLINT NOT NULL DEFAULT 0,
  vigencia_inicio DATE NOT NULL,
  vigencia_fim DATE,
  cafe_manha_adulto NUMERIC NOT NULL DEFAULT 0 CHECK (cafe_manha_adulto >= 0),
  cafe_manha_crianca NUMERIC NOT NULL DEFAULT 0 CHECK (cafe_manha_crianca >= 0),
  pensao_adulto NUMERIC NOT NULL DEFAULT 0 CHECK (pensao_adulto >= 0),
  pensao_crianca NUMERIC NOT NULL DEFAULT 0 CHECK (pensao_crianca >= 0),
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_id BIGINT,
  created_by_name TEXT,
  encerrado_em TIMESTAMPTZ,
  CONSTRAINT cmv_tarifas_vigencia_valida CHECK (
    vigencia_fim IS NULL OR vigencia_fim >= vigencia_inicio
  )
);

CREATE INDEX IF NOT EXISTS idx_cmv_tarifas_vigencia
  ON public.cmv_tarifas_config (vigencia_inicio, vigencia_fim);

CREATE INDEX IF NOT EXISTS idx_cmv_tarifas_motivo
  ON public.cmv_tarifas_config (motivo);

-- Tarifa padrão inicial (somente se a tabela estiver vazia).
INSERT INTO public.cmv_tarifas_config (
  nome,
  motivo,
  prioridade,
  vigencia_inicio,
  cafe_manha_adulto,
  cafe_manha_crianca,
  pensao_adulto,
  pensao_crianca,
  observacoes,
  created_by_name
)
SELECT
  'Tarifa padrão',
  'padrao',
  0,
  '2026-01-01',
  70,
  35,
  130,
  65,
  'Valores de referência para café da manhã e pensão/almoço/jantar.',
  'Sistema'
WHERE NOT EXISTS (SELECT 1 FROM public.cmv_tarifas_config);
