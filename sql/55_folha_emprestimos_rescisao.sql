-- Empréstimos: rescisão, responsabilidade pós-desligamento e projeção de parcelas.

ALTER TABLE public.folha_emprestimos_consignados
  ADD COLUMN IF NOT EXISTS responsabilidade TEXT NOT NULL DEFAULT 'empresa'
    CHECK (responsabilidade IN ('empresa', 'colaborador', 'instituicao', 'encerrado')),
  ADD COLUMN IF NOT EXISTS data_desligamento DATE,
  ADD COLUMN IF NOT EXISTS projeta_parcelas BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS motivo_encerramento TEXT;

COMMENT ON COLUMN public.folha_emprestimos_consignados.responsabilidade IS
  'Quem responde pelo contrato após desligamento (definido manualmente pelo RH).';
COMMENT ON COLUMN public.folha_emprestimos_consignados.projeta_parcelas IS
  'FALSE após desligamento — não projeta parcelas futuras como responsabilidade da empresa.';
