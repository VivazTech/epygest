-- Isolamento lógico Vivaz / Aquamania (empresa_key)
-- Dados existentes ficam como 'vivaz'. Aquamania começa limpa.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'sectors',
    'crds',
    'invoices',
    'manual_entries',
    'requisitions',
    'comandas',
    'estornos',
    'investimentos',
    'contrato_lancamentos',
    'crd_monthly_values',
    'financial_records',
    'orcamento_ajustes',
    'crd_realizado'
  ]
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS empresa_key TEXT NOT NULL DEFAULT %L',
        t, 'vivaz'
      );
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS idx_%I_empresa_key ON public.%I (empresa_key)',
        t, t
      );
    END IF;
  END LOOP;
END $$;
