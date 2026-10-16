-- Multi-tenant completo: empresa_key em tabelas de negócio + membership + UNIQUE por empresa
-- Dados existentes → 'vivaz'. Aquamania começa isolada.

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'cargos',
    'categories',
    'cmv_apuracao',
    'cmv_apuracao_historico',
    'cmv_meta_config',
    'cmv_tarifas_config',
    'colaborador_funcoes',
    'colaboradores',
    'comanda_items',
    'consumo_interno_rows',
    'contratos',
    'dre_cell_edit_history',
    'dre_cell_edits',
    'folha_absenteismo_config',
    'folha_absenteismo_mensal',
    'folha_apuracao_auditoria',
    'folha_apuracoes_mensais',
    'folha_cargos',
    'folha_config',
    'folha_custo_manual',
    'folha_emprestimos_conciliacao_mensal',
    'folha_emprestimos_consignados',
    'folha_emprestimos_divergencias',
    'folha_fgts_guia_mensal',
    'folha_funcionarios',
    'folha_importacoes',
    'folha_lancamentos',
    'folha_lancamentos_importados',
    'folha_pagamento',
    'folha_parametros_encargos',
    'folha_provisao_13',
    'folha_provisao_ferias',
    'folha_rubricas',
    'folha_rubricas_ignoradas',
    'folha_rubricas_parametros',
    'folha_setores',
    'folha_situacoes_resumo',
    'folha_taxa_servico_mensal',
    'folha_turnover_config',
    'folha_turnover_mensal',
    'folha_turnover_movimentos',
    'import_history',
    'import_row_correction_history',
    'import_row_corrections',
    'indicadores_mensais',
    'indicadores_parametros',
    'invoice_edit_history',
    'painel_ab_quebras',
    'painel_ab_sobras',
    'painel_controladoria_semanal',
    'painel_nutri_acoes',
    'painel_observacoes',
    'pdv_locais',
    'rds_snapshots',
    'rel_crd_rows',
    'requisicoes_rows',
    'scenarios',
    'sintase_occupancy',
    'uso_consumo_subgrupos',
    'user_suggestions'
  ];
BEGIN
  FOREACH t IN ARRAY tables
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

-- Membership: quais empresas cada usuário pode acessar
CREATE TABLE IF NOT EXISTS public.user_empresas (
  user_id BIGINT NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  empresa_key TEXT NOT NULL CHECK (empresa_key IN ('vivaz', 'aqua')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, empresa_key)
);

CREATE INDEX IF NOT EXISTS idx_user_empresas_empresa
  ON public.user_empresas (empresa_key);

-- Usuários existentes → Vivaz e Aqua (todo login acessa as duas empresas)
INSERT INTO public.user_empresas (user_id, empresa_key)
SELECT u.id, 'vivaz'
FROM public.users u
ON CONFLICT DO NOTHING;

INSERT INTO public.user_empresas (user_id, empresa_key)
SELECT u.id, 'aqua'
FROM public.users u
ON CONFLICT DO NOTHING;

-- UNIQUE de setor por empresa (permite mesmo código em Vivaz e Aqua)
DROP INDEX IF EXISTS public.idx_sectors_code_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_sectors_code_empresa_unique
  ON public.sectors (empresa_key, code)
  WHERE code IS NOT NULL;

-- CRDs: código único por setor (já era); garante índice com empresa se útil
CREATE INDEX IF NOT EXISTS idx_crds_empresa_code
  ON public.crds (empresa_key, code);
