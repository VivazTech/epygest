-- Histórico de apurações CMV (parciais no mês + fechamento). Insert-only por período.

CREATE TABLE IF NOT EXISTS public.cmv_apuracao_historico (
  id BIGSERIAL PRIMARY KEY,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  apuracao_scope TEXT NOT NULL DEFAULT 'acompanhamento'
    CHECK (apuracao_scope IN ('acompanhamento', 'fechamento')),
  periodo_inicio DATE NOT NULL,
  periodo_fim DATE NOT NULL,
  period_key TEXT NOT NULL,
  period_label TEXT NOT NULL,

  venda_direta_total    NUMERIC NOT NULL DEFAULT 0,
  venda_direta_bebidas  NUMERIC NOT NULL DEFAULT 0,
  cafe_manha_pensao     NUMERIC NOT NULL DEFAULT 0,
  cafe_manha_chds       NUMERIC NOT NULL DEFAULT 0,
  almoco_jantar_pensao  NUMERIC NOT NULL DEFAULT 0,
  almoco_jantar_chds    NUMERIC NOT NULL DEFAULT 0,
  almoco_jantar_antec   NUMERIC NOT NULL DEFAULT 0,
  ci_total              NUMERIC NOT NULL DEFAULT 0,
  ci_bebidas            NUMERIC NOT NULL DEFAULT 0,
  requisicoes_total     NUMERIC NOT NULL DEFAULT 0,
  requisicoes_bebidas   NUMERIC NOT NULL DEFAULT 0,
  refeitorio            NUMERIC NOT NULL DEFAULT 0,
  outros                NUMERIC NOT NULL DEFAULT 0,
  aquamania             NUMERIC NOT NULL DEFAULT 0,
  limite_pct            NUMERIC NOT NULL DEFAULT 0.29,

  receita_considerada NUMERIC NOT NULL DEFAULT 0,
  custo_ab            NUMERIC NOT NULL DEFAULT 0,
  cmv_apurado         NUMERIC NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT,

  CONSTRAINT cmv_historico_periodo_valido CHECK (periodo_fim >= periodo_inicio),
  CONSTRAINT cmv_historico_period_key_unique UNIQUE (period_key)
);

CREATE INDEX IF NOT EXISTS idx_cmv_historico_year_month
  ON public.cmv_apuracao_historico (year, month, periodo_fim);

CREATE INDEX IF NOT EXISTS idx_cmv_historico_scope
  ON public.cmv_apuracao_historico (year, month, apuracao_scope);

-- Migra fechamentos já existentes em cmv_apuracao para o histórico.
INSERT INTO public.cmv_apuracao_historico (
  year,
  month,
  apuracao_scope,
  periodo_inicio,
  periodo_fim,
  period_key,
  period_label,
  venda_direta_total,
  venda_direta_bebidas,
  cafe_manha_pensao,
  cafe_manha_chds,
  almoco_jantar_pensao,
  almoco_jantar_chds,
  almoco_jantar_antec,
  ci_total,
  ci_bebidas,
  requisicoes_total,
  requisicoes_bebidas,
  refeitorio,
  outros,
  aquamania,
  limite_pct,
  receita_considerada,
  custo_ab,
  cmv_apurado,
  created_at,
  created_by
)
SELECT
  a.year,
  a.month,
  'fechamento',
  make_date(a.year, a.month, 1),
  (make_date(a.year, a.month, 1) + INTERVAL '1 month' - INTERVAL '1 day')::date,
  a.year::TEXT || '-' || LPAD(a.month::TEXT, 2, '0') || '-FECHAMENTO',
  'Fechamento',
  a.venda_direta_total,
  a.venda_direta_bebidas,
  a.cafe_manha_pensao,
  a.cafe_manha_chds,
  a.almoco_jantar_pensao,
  a.almoco_jantar_chds,
  a.almoco_jantar_antec,
  a.ci_total,
  a.ci_bebidas,
  a.requisicoes_total,
  a.requisicoes_bebidas,
  a.refeitorio,
  a.outros,
  a.aquamania,
  a.limite_pct,
  a.venda_direta_total
    + a.cafe_manha_pensao + a.cafe_manha_chds
    + a.almoco_jantar_pensao + a.almoco_jantar_chds + a.almoco_jantar_antec
    + a.ci_total,
  GREATEST(
    0,
    (a.requisicoes_total - a.requisicoes_bebidas - a.refeitorio - a.outros - a.aquamania)
    + a.requisicoes_bebidas
    + a.refeitorio + a.outros + a.aquamania
  ),
  CASE
    WHEN (
      a.venda_direta_total
      + a.cafe_manha_pensao + a.cafe_manha_chds
      + a.almoco_jantar_pensao + a.almoco_jantar_chds + a.almoco_jantar_antec
      + a.ci_total
    ) = 0 THEN 0
    ELSE (
      (a.requisicoes_total - a.refeitorio - a.outros - a.aquamania)
      / NULLIF(
        a.venda_direta_total
        + a.cafe_manha_pensao + a.cafe_manha_chds
        + a.almoco_jantar_pensao + a.almoco_jantar_chds + a.almoco_jantar_antec
        + a.ci_total,
        0
      )
    )
  END,
  COALESCE(a.updated_at, NOW()),
  a.updated_by
FROM public.cmv_apuracao a
WHERE NOT EXISTS (
  SELECT 1 FROM public.cmv_apuracao_historico h
  WHERE h.period_key = a.year::TEXT || '-' || LPAD(a.month::TEXT, 2, '0') || '-FECHAMENTO'
);
