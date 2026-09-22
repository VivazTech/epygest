-- CRDs liberados por usuário (além dos setores vinculados).
-- Ex.: Fabiana (Hospedagem/Eventos) pode lançar e ver só o CRD 399 de outro setor.

CREATE TABLE IF NOT EXISTS public.user_crds (
  user_id    BIGINT NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  crd_id     BIGINT NOT NULL REFERENCES public.crds (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, crd_id)
);

CREATE INDEX IF NOT EXISTS user_crds_crd_id_idx ON public.user_crds (crd_id);
CREATE INDEX IF NOT EXISTS user_crds_user_id_idx ON public.user_crds (user_id);

COMMENT ON TABLE public.user_crds IS
  'CRDs extras liberados ao usuário fora dos setores vinculados. Usado em lançamentos e Prev x Real (só essas linhas).';
