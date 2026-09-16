-- Protocolo interno de lançamentos (controladoria)
-- Formato: PREFIX-YYYYMMDD-####  (ex.: REQ-20260916-0042)

CREATE TABLE IF NOT EXISTS public.document_sequences (
  prefix TEXT NOT NULL,
  day DATE NOT NULL,
  last_n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (prefix, day)
);

CREATE OR REPLACE FUNCTION public.allocate_document_protocol(p_prefix TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  d DATE := (timezone('America/Sao_Paulo', now()))::date;
  n INTEGER;
BEGIN
  IF p_prefix IS NULL OR length(trim(p_prefix)) = 0 THEN
    RAISE EXCEPTION 'prefix inválido';
  END IF;

  INSERT INTO public.document_sequences (prefix, day, last_n)
  VALUES (upper(trim(p_prefix)), d, 1)
  ON CONFLICT (prefix, day)
  DO UPDATE SET last_n = public.document_sequences.last_n + 1
  RETURNING last_n INTO n;

  RETURN upper(trim(p_prefix)) || '-' || to_char(d, 'YYYYMMDD') || '-' || lpad(n::text, 4, '0');
END;
$$;

ALTER TABLE public.comandas ADD COLUMN IF NOT EXISTS protocol TEXT;
ALTER TABLE public.manual_entries ADD COLUMN IF NOT EXISTS protocol TEXT;
ALTER TABLE public.estornos ADD COLUMN IF NOT EXISTS protocol TEXT;
ALTER TABLE public.requisitions ADD COLUMN IF NOT EXISTS protocol TEXT;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS protocol TEXT;
ALTER TABLE public.contrato_lancamentos ADD COLUMN IF NOT EXISTS protocol TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_comandas_protocol ON public.comandas (protocol) WHERE protocol IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_manual_entries_protocol ON public.manual_entries (protocol) WHERE protocol IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_estornos_protocol ON public.estornos (protocol) WHERE protocol IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_requisitions_protocol ON public.requisitions (protocol) WHERE protocol IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_protocol ON public.invoices (protocol) WHERE protocol IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_contrato_lancamentos_protocol ON public.contrato_lancamentos (protocol) WHERE protocol IS NOT NULL;

-- Backfill registros existentes (único por tipo+id, sem consumir a sequência diária)
UPDATE public.comandas
SET protocol = 'COM-ID-' || lpad(id::text, 6, '0')
WHERE protocol IS NULL;

UPDATE public.manual_entries
SET protocol = 'MAN-ID-' || lpad(id::text, 6, '0')
WHERE protocol IS NULL;

UPDATE public.estornos
SET protocol = 'EST-ID-' || lpad(id::text, 6, '0')
WHERE protocol IS NULL;

UPDATE public.requisitions
SET protocol = 'REQ-ID-' || lpad(id::text, 6, '0')
WHERE protocol IS NULL;

UPDATE public.invoices
SET protocol = CASE
  WHEN length(regexp_replace(coalesce(invoice_number, ''), '\D', '', 'g')) = 44
    THEN 'DAN-ID-' || lpad(id::text, 6, '0')
  ELSE 'NOT-ID-' || lpad(id::text, 6, '0')
END
WHERE protocol IS NULL;

UPDATE public.contrato_lancamentos
SET protocol = 'MEN-ID-' || lpad(id::text, 6, '0')
WHERE protocol IS NULL;
