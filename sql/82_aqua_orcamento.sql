-- Orçamento Aquamania (temporada set→ago): substitui as planilhas
-- "Aquamania Dados para Orçamento 2026-27" (Síntese + Prev x Real) e
-- "Quadro de Empregados - Aquamania - Orçamento 2026_2027".
-- Rodar manualmente no SQL Editor do Supabase. Idempotente.

CREATE TABLE IF NOT EXISTS public.aqua_temporadas (
  id BIGSERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  ano_inicio INTEGER NOT NULL,
  mes_inicio INTEGER NOT NULL DEFAULT 9 CHECK (mes_inicio BETWEEN 1 AND 12),
  acumulado_ate_ano INTEGER,
  acumulado_ate_mes INTEGER CHECK (acumulado_ate_mes IS NULL OR acumulado_ate_mes BETWEEN 1 AND 12),
  status TEXT NOT NULL DEFAULT 'aberta',
  empresa_key TEXT NOT NULL DEFAULT 'aqua',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_key, nome)
);

-- Calendário alta/baixa (rodapé do Quadro de Empregados)
CREATE TABLE IF NOT EXISTS public.aqua_temporada_meses (
  id BIGSERIAL PRIMARY KEY,
  temporada_id BIGINT NOT NULL REFERENCES public.aqua_temporadas(id) ON DELETE CASCADE,
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  cenario_quadro TEXT NOT NULL DEFAULT 'fechado' CHECK (cenario_quadro IN ('alta', 'baixa', 'fechado')),
  empresa_key TEXT NOT NULL DEFAULT 'aqua',
  UNIQUE (temporada_id, ano, mes)
);

-- Premissas mensais da aba Síntese (células amarelas)
CREATE TABLE IF NOT EXISTS public.aqua_premissas (
  id BIGSERIAL PRIMARY KEY,
  temporada_id BIGINT NOT NULL REFERENCES public.aqua_temporadas(id) ON DELETE CASCADE,
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  passantes NUMERIC NOT NULL DEFAULT 0,
  passantes_ano_ant NUMERIC NOT NULL DEFAULT 0,
  hospedes NUMERIC NOT NULL DEFAULT 0,
  ingresso_pax NUMERIC NOT NULL DEFAULT 0,
  servicos_passante NUMERIC NOT NULL DEFAULT 0,
  bar_pax NUMERIC NOT NULL DEFAULT 0,
  lanchonete_pax NUMERIC NOT NULL DEFAULT 0,
  repasse_pax NUMERIC NOT NULL DEFAULT 0,
  qtd_vale_alimentacao NUMERIC NOT NULL DEFAULT 0,
  empresa_key TEXT NOT NULL DEFAULT 'aqua',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (temporada_id, ano, mes)
);

-- Parâmetros (alíquotas, % e encargos do quadro) — JSON para evoluir sem migração
CREATE TABLE IF NOT EXISTS public.aqua_parametros (
  id BIGSERIAL PRIMARY KEY,
  temporada_id BIGINT NOT NULL REFERENCES public.aqua_temporadas(id) ON DELETE CASCADE,
  valores JSONB NOT NULL DEFAULT '{}'::jsonb,
  empresa_key TEXT NOT NULL DEFAULT 'aqua',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (temporada_id)
);

-- Estrutura (árvore) do Prev x Real
CREATE TABLE IF NOT EXISTS public.aqua_orc_linhas (
  id BIGSERIAL PRIMARY KEY,
  temporada_id BIGINT NOT NULL REFERENCES public.aqua_temporadas(id) ON DELETE CASCADE,
  parent_id BIGINT REFERENCES public.aqua_orc_linhas(id) ON DELETE CASCADE,
  ordem INTEGER NOT NULL DEFAULT 0,
  tipo TEXT NOT NULL DEFAULT 'conta' CHECK (tipo IN ('bloco', 'grupo', 'subgrupo', 'conta', 'centro_custo')),
  rotulo TEXT NOT NULL,
  codigo_conta TEXT,
  bloco TEXT NOT NULL CHECK (bloco IN ('FATURAMENTO', 'DESPESAS', 'IMP_FAT', 'IMP_RES', 'OBRAS', 'CMV')),
  grupo TEXT,
  subgrupo TEXT,
  sintese_pessoal TEXT CHECK (sintese_pessoal IS NULL OR sintese_pessoal IN ('Pessoal', 'Extras', 'Benefícios')),
  regra_previsto TEXT NOT NULL DEFAULT 'manual',
  regra_realizado TEXT NOT NULL DEFAULT 'manual',
  chave_realizado TEXT,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  empresa_key TEXT NOT NULL DEFAULT 'aqua',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_aqua_orc_linhas_temporada ON public.aqua_orc_linhas (temporada_id, ordem);

-- Valores por célula: previsto digitado e ajuste somado ao realizado da fonte
CREATE TABLE IF NOT EXISTS public.aqua_orc_valores (
  id BIGSERIAL PRIMARY KEY,
  linha_id BIGINT NOT NULL REFERENCES public.aqua_orc_linhas(id) ON DELETE CASCADE,
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  previsto_manual NUMERIC,
  -- Somado ao previsto calculado (ex.: planilha "=IF(...)-9000")
  ajuste_previsto NUMERIC NOT NULL DEFAULT 0,
  ajuste_realizado NUMERIC NOT NULL DEFAULT 0,
  obs TEXT,
  empresa_key TEXT NOT NULL DEFAULT 'aqua',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (linha_id, ano, mes)
);

-- Quadro de Empregados orçado (abas BAIXA / ALTA / Recreação)
CREATE TABLE IF NOT EXISTS public.aqua_quadro_vagas (
  id BIGSERIAL PRIMARY KEY,
  temporada_id BIGINT NOT NULL REFERENCES public.aqua_temporadas(id) ON DELETE CASCADE,
  cenario TEXT NOT NULL CHECK (cenario IN ('baixa', 'alta', 'recreacao')),
  setor TEXT NOT NULL,
  cargo TEXT NOT NULL DEFAULT '',
  nome TEXT,
  ordem INTEGER NOT NULL DEFAULT 0,
  salario NUMERIC NOT NULL DEFAULT 0,
  adicional_fixo NUMERIC NOT NULL DEFAULT 0,
  recebe_quebra_caixa BOOLEAN NOT NULL DEFAULT FALSE,
  premiacao NUMERIC NOT NULL DEFAULT 0,
  quantidade NUMERIC NOT NULL DEFAULT 1,
  encargos_zerados BOOLEAN NOT NULL DEFAULT FALSE,
  -- VT digitado (substitui 220 − salário × 6%)
  vale_transporte_fixo NUMERIC,
  sem_beneficios BOOLEAN NOT NULL DEFAULT FALSE,
  beneficios_no_total BOOLEAN NOT NULL DEFAULT FALSE,
  empresa_key TEXT NOT NULL DEFAULT 'aqua',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_aqua_quadro_vagas_temporada ON public.aqua_quadro_vagas (temporada_id, cenario, ordem);
