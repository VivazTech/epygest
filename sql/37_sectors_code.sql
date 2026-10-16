-- Código do setor como identificador canônico (Desbravador / ERP).
-- Execute no Supabase após as migrations anteriores.

ALTER TABLE public.sectors
  ADD COLUMN IF NOT EXISTS code TEXT,
  ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sectors_code_unique
  ON public.sectors (code)
  WHERE code IS NOT NULL;

-- Backfill: códigos vindos das requisições sintéticas (setor_codigo + setor_nome)
UPDATE public.sectors s
SET code = sub.codigo::TEXT
FROM (
  SELECT DISTINCT ON (UPPER(TRIM(setor_nome)))
    UPPER(TRIM(setor_nome)) AS nome_key,
    setor_codigo AS codigo
  FROM public.requisicoes_rows
  WHERE setor_codigo IS NOT NULL
  ORDER BY UPPER(TRIM(setor_nome)), setor_codigo
) sub
WHERE s.code IS NULL
  AND UPPER(TRIM(s.name)) = sub.nome_key;

-- Backfill: códigos da folha_setores
UPDATE public.sectors s
SET code = fs.codigo
FROM public.folha_setores fs
WHERE s.code IS NULL
  AND fs.sector_id = s.id
  AND fs.codigo IS NOT NULL
  AND TRIM(fs.codigo) <> '';

-- Backfill: slug a partir do nome para setores sem código ERP (sufixo id garante unicidade)
UPDATE public.sectors s
SET code = UPPER(
  REGEXP_REPLACE(
    REGEXP_REPLACE(
      TRANSLATE(
        TRIM(s.name),
        'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
        'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN'
      ),
      '[^A-Za-z0-9]+',
      '_',
      'g'
    ),
    '^_|_$',
    '',
    'g'
  )
) || '_' || s.id::TEXT
WHERE s.code IS NULL OR TRIM(s.code) = '';

-- Vínculo canônico nas importações
ALTER TABLE public.requisicoes_rows
  ADD COLUMN IF NOT EXISTS sector_id BIGINT REFERENCES public.sectors (id) ON DELETE SET NULL;

UPDATE public.requisicoes_rows r
SET sector_id = s.id
FROM public.sectors s
WHERE r.sector_id IS NULL
  AND s.code IS NOT NULL
  AND s.code = r.setor_codigo::TEXT;

UPDATE public.requisicoes_rows r
SET sector_id = s.id
FROM public.sectors s
WHERE r.sector_id IS NULL
  AND UPPER(TRIM(s.name)) = UPPER(TRIM(r.setor_nome));

CREATE INDEX IF NOT EXISTS idx_requisicoes_rows_sector_id
  ON public.requisicoes_rows (sector_id);

ALTER TABLE public.folha_lancamentos_importados
  ADD COLUMN IF NOT EXISTS setor_codigo TEXT,
  ADD COLUMN IF NOT EXISTS sector_id BIGINT REFERENCES public.sectors (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_folha_lanc_imp_sector
  ON public.folha_lancamentos_importados (sector_id);

ALTER TABLE public.folha_funcionarios
  ADD COLUMN IF NOT EXISTS setor_codigo TEXT,
  ADD COLUMN IF NOT EXISTS sector_id BIGINT REFERENCES public.sectors (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_folha_funcionarios_sector
  ON public.folha_funcionarios (sector_id);

ALTER TABLE public.consumo_interno_rows
  ADD COLUMN IF NOT EXISTS sector_id BIGINT REFERENCES public.sectors (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_consumo_interno_rows_sector
  ON public.consumo_interno_rows (sector_id);
