/** Indicador de turnover — classificação e fórmulas (configurável até validação do RH). */

export type TurnoverFormula =
  | 'desligamentos_headcount_medio'
  | 'desligamentos_headcount_fim'
  | 'movimentacao_headcount_medio';

export type TurnoverConfig = {
  formula: TurnoverFormula;
  formula_label?: string | null;
  observacao?: string | null;
};

export type FolhaEmployeeSnapshot = {
  matricula: string;
  nome?: string;
  situacao?: string;
  setor_nome?: string;
  setor_codigo?: string | null;
};

export type TurnoverMovimento = {
  codigo_funcionario: string;
  nome_funcionario: string;
  setor_nome: string;
  setor_codigo?: string | null;
  tipo: 'admissao' | 'desligamento';
  situacao?: string;
};

export type TurnoverMesResumo = {
  year: number;
  month: number;
  setor_nome: string;
  setor_codigo?: string | null;
  headcount_inicio: number;
  headcount_fim: number;
  admissoes: number;
  desligamentos: number;
  turnover_pct: number | null;
};

export const FORMULA_OPTIONS: Array<{ id: TurnoverFormula; label: string; descricao: string }> = [
  {
    id: 'desligamentos_headcount_medio',
    label: 'Desligamentos ÷ headcount médio',
    descricao: '(Desligamentos / ((início + fim) / 2)) × 100',
  },
  {
    id: 'desligamentos_headcount_fim',
    label: 'Desligamentos ÷ headcount final',
    descricao: '(Desligamentos / headcount fim) × 100',
  },
  {
    id: 'movimentacao_headcount_medio',
    label: 'Movimentação ÷ headcount médio',
    descricao: '(((Admissões + Desligamentos) / 2) / headcount médio) × 100',
  },
];

export const normalizeTurnoverText = (v: string) =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

/** Situações que indicam desligamento no extrato Desbravador. */
export const SITUACAO_DESLIGAMENTO =
  /demit|deslig|rescind|dispens|afast.*defin|transfer.*sai|falec|termino.*contrato|exoner/i;

export const isSituacaoDesligamento = (situacao: string) =>
  SITUACAO_DESLIGAMENTO.test(normalizeTurnoverText(situacao));

export const isSituacaoAtivo = (situacao: string) => {
  const s = normalizeTurnoverText(situacao);
  if (!s) return true;
  if (isSituacaoDesligamento(s)) return false;
  return /trabalh|ativo|ferias|licen|normal/i.test(s) || !s;
};

export const calcularTurnoverPct = (
  admissoes: number,
  desligamentos: number,
  headcountInicio: number,
  headcountFim: number,
  formula: TurnoverFormula
): number | null => {
  const medio = (headcountInicio + headcountFim) / 2;
  if (formula === 'desligamentos_headcount_fim') {
    return headcountFim > 0 ? (desligamentos / headcountFim) * 100 : null;
  }
  if (medio <= 0) return null;
  if (formula === 'movimentacao_headcount_medio') {
    return (((admissoes + desligamentos) / 2) / medio) * 100;
  }
  return (desligamentos / medio) * 100;
};

const keyEmp = (mat: string) => String(mat ?? '').trim();

export const detectarMovimentosMes = (
  atual: FolhaEmployeeSnapshot[],
  anterior: FolhaEmployeeSnapshot[]
): TurnoverMovimento[] => {
  const prevMap = new Map(anterior.map((e) => [keyEmp(e.matricula), e]));
  const curMap = new Map(atual.map((e) => [keyEmp(e.matricula), e]));
  const movimentos: TurnoverMovimento[] = [];

  for (const [mat, emp] of curMap) {
    if (!mat) continue;
    const prev = prevMap.get(mat);
    if (!prev) {
      movimentos.push({
        codigo_funcionario: mat,
        nome_funcionario: String(emp.nome ?? '').trim(),
        setor_nome: String(emp.setor_nome ?? 'Sem setor').trim() || 'Sem setor',
        setor_codigo: emp.setor_codigo ?? null,
        tipo: 'admissao',
        situacao: emp.situacao,
      });
      continue;
    }
    if (isSituacaoDesligamento(String(emp.situacao ?? '')) && !isSituacaoDesligamento(String(prev.situacao ?? ''))) {
      movimentos.push({
        codigo_funcionario: mat,
        nome_funcionario: String(emp.nome ?? '').trim(),
        setor_nome: String(prev.setor_nome ?? emp.setor_nome ?? 'Sem setor').trim() || 'Sem setor',
        setor_codigo: prev.setor_codigo ?? emp.setor_codigo ?? null,
        tipo: 'desligamento',
        situacao: emp.situacao,
      });
    }
  }

  for (const [mat, emp] of prevMap) {
    if (!mat || curMap.has(mat)) continue;
    if (!isSituacaoAtivo(String(emp.situacao ?? ''))) continue;
    movimentos.push({
      codigo_funcionario: mat,
      nome_funcionario: String(emp.nome ?? '').trim(),
      setor_nome: String(emp.setor_nome ?? 'Sem setor').trim() || 'Sem setor',
      setor_codigo: emp.setor_codigo ?? null,
      tipo: 'desligamento',
      situacao: 'Saída (ausente no mês seguinte)',
    });
  }

  return movimentos;
};

export const buildTurnoverResumo = (
  year: number,
  month: number,
  setorNome: string,
  atual: FolhaEmployeeSnapshot[],
  anterior: FolhaEmployeeSnapshot[],
  movimentos: TurnoverMovimento[],
  formula: TurnoverFormula,
  setorCodigo?: string | null
): TurnoverMesResumo => {
  const normSetor = setorNome.trim();
  const filterSetor = (s: string) => normalizeTurnoverText(s) === normalizeTurnoverText(normSetor);

  const atualSetor = normSetor
    ? atual.filter((e) => filterSetor(String(e.setor_nome ?? 'Sem setor')))
    : atual;
  const anteriorSetor = normSetor
    ? anterior.filter((e) => filterSetor(String(e.setor_nome ?? 'Sem setor')))
    : anterior;
  const movSetor = normSetor
    ? movimentos.filter((m) => filterSetor(m.setor_nome))
    : movimentos;

  const headcount_fim = atualSetor.filter((e) => isSituacaoAtivo(String(e.situacao ?? ''))).length;
  const headcount_inicio = anteriorSetor.filter((e) => isSituacaoAtivo(String(e.situacao ?? ''))).length;
  const admissoes = movSetor.filter((m) => m.tipo === 'admissao').length;
  const desligamentos = movSetor.filter((m) => m.tipo === 'desligamento').length;

  return {
    year,
    month,
    setor_nome: normSetor,
    setor_codigo: setorCodigo ?? null,
    headcount_inicio,
    headcount_fim,
    admissoes,
    desligamentos,
    turnover_pct: calcularTurnoverPct(admissoes, desligamentos, headcount_inicio, headcount_fim, formula),
  };
};

export const summarizeTurnoverPeriodo = (meses: TurnoverMesResumo[]) => {
  const admissoes = meses.reduce((s, m) => s + m.admissoes, 0);
  const desligamentos = meses.reduce((s, m) => s + m.desligamentos, 0);
  const headcount_inicio = meses[0]?.headcount_inicio ?? 0;
  const headcount_fim = meses[meses.length - 1]?.headcount_fim ?? 0;
  return { admissoes, desligamentos, headcount_inicio, headcount_fim };
};
