-- Meta de CMV (percentual alvo) com vigência e histórico.

CREATE TABLE IF NOT EXISTS public.cmv_meta_config (
  id BIGSERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  meta_pct NUMERIC NOT NULL DEFAULT 0.29
    CHECK (meta_pct > 0 AND meta_pct <= 1),
  vigencia_inicio DATE NOT NULL,
  vigencia_fim DATE,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_id BIGINT,
  created_by_name TEXT,
  encerrado_em TIMESTAMPTZ,
  CONSTRAINT cmv_meta_vigencia_valida CHECK (
    vigencia_fim IS NULL OR vigencia_fim >= vigencia_inicio
  )
);

CREATE INDEX IF NOT EXISTS idx_cmv_meta_vigencia
  ON public.cmv_meta_config (vigencia_inicio, vigencia_fim);

INSERT INTO public.cmv_meta_config (
  nome,
  meta_pct,
  vigencia_inicio,
  observacoes,
  created_by_name
)
SELECT
  'Meta padrão',
  0.29,
  '2026-01-01',
  'Meta de CMV A&B — 29% sobre a receita considerada.',
  'Sistema'
WHERE NOT EXISTS (SELECT 1 FROM public.cmv_meta_config);
