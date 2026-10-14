-- Competência da folha passa a ser única por empresa.
-- Dados existentes já têm empresa_key = 'vivaz'.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname, c.conrelid::regclass AS tbl
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname IN (
        'folha_importacoes',
        'folha_apuracoes_mensais',
        'folha_funcionarios',
        'folha_situacoes_resumo',
        'folha_custo_manual'
      )
      AND c.contype = 'u'
      AND NOT EXISTS (
        SELECT 1
        FROM unnest(c.conkey) AS k
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k
        WHERE a.attname = 'empresa_key'
      )
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
  END LOOP;
END $$;

-- Índices únicos soltos (sem constraint) que ainda ignoram empresa_key.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT i.indexrelid::regclass AS idx
    FROM pg_index i
    JOIN pg_class t ON t.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname IN (
        'folha_importacoes',
        'folha_apuracoes_mensais',
        'folha_funcionarios',
        'folha_situacoes_resumo',
        'folha_custo_manual'
      )
      AND i.indisunique
      AND NOT i.indisprimary
      AND NOT EXISTS (
        SELECT 1
        FROM unnest(i.indkey) AS k
        JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k
        WHERE a.attname = 'empresa_key'
      )
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS %s', r.idx);
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_folha_importacoes_empresa_comp
  ON public.folha_importacoes (empresa_key, competencia_ano, competencia_mes);

CREATE UNIQUE INDEX IF NOT EXISTS uq_folha_apuracoes_empresa_comp
  ON public.folha_apuracoes_mensais (empresa_key, competencia_ano, competencia_mes);

CREATE UNIQUE INDEX IF NOT EXISTS uq_folha_funcionarios_empresa_codigo
  ON public.folha_funcionarios (empresa_key, codigo_funcionario);

CREATE UNIQUE INDEX IF NOT EXISTS uq_folha_situacoes_empresa_comp
  ON public.folha_situacoes_resumo (empresa_key, competencia_ano, competencia_mes, situacao);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'folha_custo_manual' AND column_name = 'year'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'folha_custo_manual' AND column_name = 'month'
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS uq_folha_custo_manual_empresa_comp ON public.folha_custo_manual (empresa_key, year, month)';
  END IF;
END $$;

UPDATE public.folha_funcionarios
SET empresa_key = 'vivaz'
WHERE empresa_key IS NULL;

ALTER TABLE public.folha_funcionarios
  ALTER COLUMN empresa_key SET DEFAULT 'vivaz';

ALTER TABLE public.folha_funcionarios
  ALTER COLUMN empresa_key SET NOT NULL;
