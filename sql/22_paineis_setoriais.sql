-- Painéis setoriais (Fase 4.1–4.6)
-- Observações do gestor, quebras/sobras A&B, ações nutricionista, relatório semanal controladoria.

CREATE TABLE IF NOT EXISTS public.painel_observacoes (
  id          BIGSERIAL PRIMARY KEY,
  painel_key  TEXT NOT NULL,
  year        INTEGER NOT NULL,
  month       INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  texto       TEXT NOT NULL DEFAULT '',
  user_id     BIGINT,
  user_name   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (painel_key, year, month)
);

CREATE INDEX IF NOT EXISTS idx_painel_observacoes_key_ym
  ON public.painel_observacoes (painel_key, year, month);

CREATE TABLE IF NOT EXISTS public.painel_ab_quebras (
  id          BIGSERIAL PRIMARY KEY,
  year        INTEGER NOT NULL,
  month       INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  item        TEXT NOT NULL DEFAULT '',
  quantidade  NUMERIC(18, 2) NOT NULL DEFAULT 0,
  custo       NUMERIC(18, 2) NOT NULL DEFAULT 0,
  observacao  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_painel_ab_quebras_ym
  ON public.painel_ab_quebras (year, month);

CREATE TABLE IF NOT EXISTS public.painel_ab_sobras (
  id          BIGSERIAL PRIMARY KEY,
  year        INTEGER NOT NULL,
  month       INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  local       TEXT NOT NULL DEFAULT '',
  custo       NUMERIC(18, 2) NOT NULL DEFAULT 0,
  observacao  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_painel_ab_sobras_ym
  ON public.painel_ab_sobras (year, month);

CREATE TABLE IF NOT EXISTS public.painel_nutri_acoes (
  id               BIGSERIAL PRIMARY KEY,
  titulo           TEXT NOT NULL,
  responsavel      TEXT,
  prazo            DATE,
  status           TEXT NOT NULL DEFAULT 'pendente'
                   CHECK (status IN ('pendente', 'em_andamento', 'concluida', 'cancelada')),
  custo_previsto   NUMERIC(18, 2) NOT NULL DEFAULT 0,
  custo_realizado  NUMERIC(18, 2) NOT NULL DEFAULT 0,
  observacoes      TEXT,
  active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_painel_nutri_acoes_status
  ON public.painel_nutri_acoes (status) WHERE active;

CREATE TABLE IF NOT EXISTS public.painel_controladoria_semanal (
  id                 BIGSERIAL PRIMARY KEY,
  semana_inicio      DATE NOT NULL,
  item               TEXT NOT NULL,
  previsto           NUMERIC(18, 2) NOT NULL DEFAULT 0,
  realizado          NUMERIC(18, 2) NOT NULL DEFAULT 0,
  setor_responsavel  TEXT,
  observacoes        TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_painel_controladoria_semana
  ON public.painel_controladoria_semanal (semana_inicio DESC);

ALTER TABLE public.painel_observacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.painel_ab_quebras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.painel_ab_sobras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.painel_nutri_acoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.painel_controladoria_semanal ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'painel_observacoes' AND policyname = 'painel_observacoes_all') THEN
    CREATE POLICY painel_observacoes_all ON public.painel_observacoes FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'painel_ab_quebras' AND policyname = 'painel_ab_quebras_all') THEN
    CREATE POLICY painel_ab_quebras_all ON public.painel_ab_quebras FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'painel_ab_sobras' AND policyname = 'painel_ab_sobras_all') THEN
    CREATE POLICY painel_ab_sobras_all ON public.painel_ab_sobras FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'painel_nutri_acoes' AND policyname = 'painel_nutri_acoes_all') THEN
    CREATE POLICY painel_nutri_acoes_all ON public.painel_nutri_acoes FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'painel_controladoria_semanal' AND policyname = 'painel_controladoria_semanal_all') THEN
    CREATE POLICY painel_controladoria_semanal_all ON public.painel_controladoria_semanal FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

GRANT ALL ON public.painel_observacoes TO authenticated, service_role;
GRANT ALL ON public.painel_ab_quebras TO authenticated, service_role;
GRANT ALL ON public.painel_ab_sobras TO authenticated, service_role;
GRANT ALL ON public.painel_nutri_acoes TO authenticated, service_role;
GRANT ALL ON public.painel_controladoria_semanal TO authenticated, service_role;
GRANT SELECT ON public.painel_observacoes TO anon;
GRANT SELECT ON public.painel_ab_quebras TO anon;
GRANT SELECT ON public.painel_ab_sobras TO anon;
GRANT SELECT ON public.painel_nutri_acoes TO anon;
GRANT SELECT ON public.painel_controladoria_semanal TO anon;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
