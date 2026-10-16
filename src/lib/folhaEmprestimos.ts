/** Empréstimos consignados — tipos, status e agrupamento por colaborador. */

export type EmprestimoStatus = 'ativo' | 'quitado' | 'suspenso' | 'cancelado';

export type EmprestimoResponsabilidade = 'empresa' | 'colaborador' | 'instituicao' | 'encerrado';

export type EmprestimoOrigemDesconto = 'folha_normal' | 'rescisao';

export const EMPRESTIMO_RESPONSABILIDADE_OPTIONS: Array<{ id: EmprestimoResponsabilidade; label: string }> = [
  { id: 'empresa', label: 'Empresa (repasse ativo)' },
  { id: 'colaborador', label: 'Colaborador' },
  { id: 'instituicao', label: 'Instituição financeira' },
  { id: 'encerrado', label: 'Encerrado / quitado' },
];

export const REGRAS_RESCISAO_PENDENTES =
  'Regras das verbas rescisórias ainda não confirmadas pelo RH — descontos de rescisão são identificados, mas não entram como parcela mensal nem disparam cálculos automáticos.';

export const EMPRESTIMO_STATUS_OPTIONS: Array<{ id: EmprestimoStatus; label: string }> = [
  { id: 'ativo', label: 'Ativo' },
  { id: 'quitado', label: 'Quitado' },
  { id: 'suspenso', label: 'Suspenso' },
  { id: 'cancelado', label: 'Cancelado' },
];

export type EmprestimoRow = {
  id: number;
  colaborador_id: number | null;
  codigo_funcionario: string | null;
  nome_colaborador: string;
  setor_nome: string | null;
  empresa_nome: string | null;
  instituicao_financeira: string;
  valor_contratado: number | null;
  valor_recebido: number | null;
  valor_parcela: number;
  quantidade_parcelas: number;
  parcelas_pagas: number;
  parcelas_restantes: number;
  data_inicio: string | null;
  previsao_termino: string | null;
  status: EmprestimoStatus;
  rubrica_codigo: string | null;
  rubrica_nome: string | null;
  observacao: string | null;
  responsabilidade: EmprestimoResponsabilidade;
  data_desligamento: string | null;
  projeta_parcelas: boolean;
  motivo_encerramento: string | null;
  parcelas_restantes_exibicao: number | null;
  created_at?: string;
  updated_at?: string;
};

export type EmprestimoColaboradorGrupo = {
  key: string;
  colaborador_id: number | null;
  codigo_funcionario: string | null;
  nome_colaborador: string;
  setor_nome: string | null;
  empresa_nome: string | null;
  qtd_emprestimos: number;
  parcela_mensal_total: number;
  emprestimos: EmprestimoRow[];
};

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const normalizeNome = (nome: string) =>
  String(nome ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const isLoanRelatedNome = (norm: string) =>
  /emprest|consignado|credito\s*trabalhador/.test(norm);

export type EmprestimoLancamentoTipo = 'desconto' | 'estorno';

/** Classifica lançamento de folha: desconto, estorno ou fora do escopo de empréstimo. */
export const classifyEmprestimoLancamento = (
  nome: string,
  tipo = '',
  valorOriginal = 0
): EmprestimoLancamentoTipo | null => {
  const norm = normalizeNome(nome);
  const tipoUp = String(tipo ?? '').trim().toUpperCase();
  const loanRelated = isLoanRelatedNome(norm);

  if (!loanRelated && !/estorno/.test(norm)) return null;

  if (/estorno/.test(norm) && (loanRelated || /emprest|consignado/.test(norm))) return 'estorno';
  if (loanRelated && Number(valorOriginal) < -0.009) return 'estorno';
  if (loanRelated && (tipoUp === 'P' || tipoUp.startsWith('PROV'))) return 'estorno';
  if (loanRelated && (tipoUp === 'D' || tipoUp.startsWith('DESC') || !tipoUp)) return 'desconto';
  if (loanRelated) return 'desconto';

  return null;
};

export const isEmprestimoRubricaNome = (nome: string, tipo = '', valorOriginal = 0) =>
  classifyEmprestimoLancamento(nome, tipo, valorOriginal) !== null;

/** Identifica se o desconto veio da folha mensal ou de verbas de rescisão (sem calcular verbas). */
export const classifyEmprestimoOrigem = (
  descricaoRubrica: string,
  situacaoFuncionario?: string | null
): EmprestimoOrigemDesconto => {
  const norm = normalizeNome(descricaoRubrica);
  if (
    /rescis|recisao|trct|homolog|verba.*rescis|folha.*rescis|resil|quitac.*contrato|demiss.*consign|deslig.*consign/.test(
      norm
    )
  ) {
    return 'rescisao';
  }
  if (situacaoFuncionario) {
    const sit = normalizeNome(situacaoFuncionario);
    if (/demit|deslig|rescind|dispens|exoner|trct|homolog/.test(sit) && /rescis|recisao|trct/.test(norm)) {
      return 'rescisao';
    }
  }
  return 'folha_normal';
};

export const shouldProjectEmprestimoParcelas = (row: {
  projeta_parcelas?: boolean | null;
  responsabilidade?: string | null;
  data_desligamento?: string | null;
  status?: string | null;
}) => {
  if (row.projeta_parcelas === false) return false;
  if (row.data_desligamento) return false;
  const resp = String(row.responsabilidade ?? 'empresa');
  if (resp === 'encerrado' || resp === 'colaborador' || resp === 'instituicao') return false;
  if (row.status === 'cancelado' || row.status === 'quitado') return false;
  return true;
};

export const computeParcelasRestantes = (quantidade: number, pagas: number) =>
  Math.max(0, Math.round(quantidade) - Math.round(pagas));

export const computePrevisaoTermino = (
  dataInicio: string | null | undefined,
  quantidadeParcelas: number,
  parcelasPagas = 0
): string | null => {
  if (!dataInicio) return null;
  const d = new Date(`${dataInicio}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const restantes = computeParcelasRestantes(quantidadeParcelas, parcelasPagas);
  if (restantes <= 0) return dataInicio.slice(0, 10);
  d.setMonth(d.getMonth() + quantidadeParcelas - 1);
  return d.toISOString().slice(0, 10);
};

export const inferStatusFromParcelas = (
  status: EmprestimoStatus,
  quantidade: number,
  pagas: number
): EmprestimoStatus => {
  if (status === 'cancelado' || status === 'suspenso') return status;
  if (quantidade > 0 && pagas >= quantidade) return 'quitado';
  return status === 'quitado' && pagas < quantidade ? 'ativo' : status;
};

export const extractInstituicaoFromRubrica = (nome: string) => {
  const raw = String(nome ?? '').trim();
  if (!raw) return 'Instituição não informada';
  const cleaned = raw
    .replace(/^estorno\s+(de\s+)?/i, '')
    .replace(/^(desconto\s+de\s+)?(emprestimo|empréstimo|consignado)\s*/i, '')
    .replace(/\s*-\s*parcela.*$/i, '')
    .trim();
  return cleaned || raw;
};

export const emprestimoConciliacaoKey = (codigoFuncionario: string, descricaoRubrica: string) => {
  const inst = extractInstituicaoFromRubrica(descricaoRubrica)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
  return `${String(codigoFuncionario ?? '').trim()}|${inst}`;
};

export type EmprestimoLancamentoDetalhe = {
  tipo: EmprestimoLancamentoTipo;
  origem: EmprestimoOrigemDesconto;
  codigo_rubrica: string;
  descricao_rubrica: string;
  valor: number;
};

export type EmprestimoConciliacaoLinha = {
  key: string;
  codigo_funcionario: string;
  nome_funcionario: string;
  setor_nome: string | null;
  instituicao_financeira: string;
  rubrica_codigo: string | null;
  rubrica_nome: string | null;
  descontos: number;
  descontos_folha_normal: number;
  descontos_rescisao: number;
  estornos: number;
  estornos_folha_normal: number;
  estornos_rescisao: number;
  desconto_liquido: number;
  desconto_liquido_folha: number;
  valor_cadastro: number | null;
  emprestimo_id: number | null;
  diferenca: number | null;
  lancamentos: EmprestimoLancamentoDetalhe[];
};

export type FolhaLancamentoEmprestimoInput = {
  codigo_funcionario?: string | null;
  nome_funcionario?: string | null;
  setor_nome?: string | null;
  situacao?: string | null;
  codigo_rubrica?: string | null;
  descricao_rubrica?: string | null;
  tipo_original?: string | null;
  valor_original?: number | null;
};

/** Agrega descontos e estornos por colaborador + instituição (não soma tudo como desconto). */
export const aggregateEmprestimoLancamentos = (
  rows: FolhaLancamentoEmprestimoInput[]
): EmprestimoConciliacaoLinha[] => {
  const map = new Map<string, EmprestimoConciliacaoLinha>();

  for (const row of rows) {
    const codigo = String(row.codigo_funcionario ?? '').trim();
    const descricao = String(row.descricao_rubrica ?? '').trim();
    if (!codigo || !descricao) continue;

    const tipoLanc = classifyEmprestimoLancamento(
      descricao,
      String(row.tipo_original ?? ''),
      Number(row.valor_original) || 0
    );
    if (!tipoLanc) continue;

    const key = emprestimoConciliacaoKey(codigo, descricao);
    const valor = Math.abs(Number(row.valor_original) || 0);
    if (valor < 0.009) continue;

    if (!map.has(key)) {
      map.set(key, {
        key,
        codigo_funcionario: codigo,
        nome_funcionario: String(row.nome_funcionario ?? codigo),
        setor_nome: row.setor_nome ? String(row.setor_nome) : null,
        instituicao_financeira: extractInstituicaoFromRubrica(descricao),
        rubrica_codigo: row.codigo_rubrica ? String(row.codigo_rubrica) : null,
        rubrica_nome: descricao,
        descontos: 0,
        descontos_folha_normal: 0,
        descontos_rescisao: 0,
        estornos: 0,
        estornos_folha_normal: 0,
        estornos_rescisao: 0,
        desconto_liquido: 0,
        desconto_liquido_folha: 0,
        valor_cadastro: null,
        emprestimo_id: null,
        diferenca: null,
        lancamentos: [],
      });
    }

    const agg = map.get(key)!;
    const origem = classifyEmprestimoOrigem(descricao, row.situacao);
    if (tipoLanc === 'desconto') {
      agg.descontos += valor;
      if (origem === 'rescisao') agg.descontos_rescisao += valor;
      else agg.descontos_folha_normal += valor;
    } else {
      agg.estornos += valor;
      if (origem === 'rescisao') agg.estornos_rescisao += valor;
      else agg.estornos_folha_normal += valor;
    }
    if (!agg.nome_funcionario && row.nome_funcionario) {
      agg.nome_funcionario = String(row.nome_funcionario);
    }
    if (!agg.setor_nome && row.setor_nome) agg.setor_nome = String(row.setor_nome);
    if (tipoLanc === 'desconto' && row.codigo_rubrica) {
      agg.rubrica_codigo = String(row.codigo_rubrica);
      agg.rubrica_nome = descricao;
    }
    agg.lancamentos.push({
      tipo: tipoLanc,
      origem,
      codigo_rubrica: String(row.codigo_rubrica ?? ''),
      descricao_rubrica: descricao,
      valor,
    });
  }

  return Array.from(map.values())
    .map((agg) => {
      const desconto_liquido = Math.max(0, agg.descontos - agg.estornos);
      const desconto_liquido_folha = Math.max(0, agg.descontos_folha_normal - agg.estornos_folha_normal);
      return { ...agg, desconto_liquido, desconto_liquido_folha };
    })
    .sort((a, b) => a.nome_funcionario.localeCompare(b.nome_funcionario, 'pt-BR'));
};

export const sumConciliacao = (linhas: EmprestimoConciliacaoLinha[]) => ({
  descontos: linhas.reduce((s, l) => s + l.descontos, 0),
  descontos_folha_normal: linhas.reduce((s, l) => s + l.descontos_folha_normal, 0),
  descontos_rescisao: linhas.reduce((s, l) => s + l.descontos_rescisao, 0),
  estornos: linhas.reduce((s, l) => s + l.estornos, 0),
  estornos_folha_normal: linhas.reduce((s, l) => s + l.estornos_folha_normal, 0),
  estornos_rescisao: linhas.reduce((s, l) => s + l.estornos_rescisao, 0),
  desconto_liquido: linhas.reduce((s, l) => s + l.desconto_liquido, 0),
  desconto_liquido_folha: linhas.reduce((s, l) => s + l.desconto_liquido_folha, 0),
});

export type EmprestimoPeriodo = {
  desde_inicio: boolean;
  year_from: number;
  month_from: number;
  year_to: number;
  month_to: number;
};

export type EmprestimoHistoricoResumo = {
  pago_repassado: number;
  descontado: number;
  descontado_folha_normal: number;
  descontado_rescisao: number;
  estornos: number;
  diferenca_acumulada: number;
};

export type EmprestimoHistoricoMensal = {
  year: number;
  month: number;
  descontos: number;
  estornos: number;
  desconto_liquido: number;
  diferenca_mes: number;
};

export type EmprestimoHistoricoColaborador = {
  key: string;
  codigo_funcionario: string;
  nome_funcionario: string;
  instituicao_financeira: string;
  pago_repassado: number;
  descontado: number;
  estornos: number;
  diferenca_acumulada: number;
};

export type EmprestimoHistoricoResponse = {
  periodo: EmprestimoPeriodo & {
    label: string;
    competencias: number;
  };
  resumo: EmprestimoHistoricoResumo;
  evolucao_mensal: EmprestimoHistoricoMensal[];
  por_colaborador: EmprestimoHistoricoColaborador[];
};

export const competenciaValor = (year: number, month: number) => year * 100 + month;

export const isCompetenciaNoPeriodo = (
  year: number,
  month: number,
  periodo: Pick<EmprestimoPeriodo, 'year_from' | 'month_from' | 'year_to' | 'month_to'>
) => {
  const v = competenciaValor(year, month);
  const from = competenciaValor(periodo.year_from, periodo.month_from);
  const to = competenciaValor(periodo.year_to, periodo.month_to);
  return v >= from && v <= to;
};

export type FolhaLancamentoEmprestimoPeriodo = FolhaLancamentoEmprestimoInput & {
  competencia_ano?: number | null;
  competencia_mes?: number | null;
};

/** Agrega histórico: pago/repassado (descontos) − descontado (líquido) = diferença (estornos). */
export const buildEmprestimoHistorico = (
  rows: FolhaLancamentoEmprestimoPeriodo[],
  periodo: EmprestimoPeriodo
): EmprestimoHistoricoResponse => {
  const filtrados = rows.filter((row) => {
    const year = Number(row.competencia_ano);
    const month = Number(row.competencia_mes);
    if (!year || !month) return false;
    return isCompetenciaNoPeriodo(year, month, periodo);
  });

  const porMes = new Map<string, FolhaLancamentoEmprestimoPeriodo[]>();
  for (const row of filtrados) {
    const year = Number(row.competencia_ano);
    const month = Number(row.competencia_mes);
    const k = `${year}-${month}`;
    if (!porMes.has(k)) porMes.set(k, []);
    porMes.get(k)!.push(row);
  }

  const evolucao_mensal: EmprestimoHistoricoMensal[] = Array.from(porMes.entries())
    .map(([k, lancs]) => {
      const [year, month] = k.split('-').map(Number);
      const linhas = aggregateEmprestimoLancamentos(lancs);
      const totais = sumConciliacao(linhas);
      return {
        year,
        month,
        descontos: totais.descontos,
        estornos: totais.estornos,
        desconto_liquido: totais.desconto_liquido,
        diferenca_mes: totais.descontos - totais.desconto_liquido,
      };
    })
    .sort((a, b) => competenciaValor(a.year, a.month) - competenciaValor(b.year, b.month));

  const todasLinhas = aggregateEmprestimoLancamentos(filtrados);
  const totais = sumConciliacao(todasLinhas);

  const por_colaborador: EmprestimoHistoricoColaborador[] = todasLinhas
    .map((l) => ({
      key: l.key,
      codigo_funcionario: l.codigo_funcionario,
      nome_funcionario: l.nome_funcionario,
      instituicao_financeira: l.instituicao_financeira,
      pago_repassado: l.descontos,
      descontado: l.desconto_liquido,
      estornos: l.estornos,
      diferenca_acumulada: l.descontos - l.desconto_liquido,
    }))
    .sort((a, b) => {
      const byNome = a.nome_funcionario.localeCompare(b.nome_funcionario, 'pt-BR');
      if (byNome !== 0) return byNome;
      return a.instituicao_financeira.localeCompare(b.instituicao_financeira, 'pt-BR');
    });

  const label = periodo.desde_inicio
    ? `Desde ${MESES_LABEL[periodo.month_from] ?? periodo.month_from}/${periodo.year_from} até ${MESES_LABEL[periodo.month_to] ?? periodo.month_to}/${periodo.year_to}`
    : `${MESES_LABEL[periodo.month_from] ?? periodo.month_from}/${periodo.year_from} a ${MESES_LABEL[periodo.month_to] ?? periodo.month_to}/${periodo.year_to}`;

  return {
    periodo: {
      ...periodo,
      label,
      competencias: evolucao_mensal.length,
    },
    resumo: {
      pago_repassado: totais.descontos,
      descontado: totais.desconto_liquido,
      descontado_folha_normal: totais.desconto_liquido_folha,
      descontado_rescisao: Math.max(0, totais.descontos_rescisao - totais.estornos_rescisao),
      estornos: totais.estornos,
      diferenca_acumulada: totais.descontos - totais.desconto_liquido,
    },
    evolucao_mensal,
    por_colaborador,
  };
};

const MESES_LABEL = [
  '',
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
];

export const resolveEmprestimoHistoricoPeriodo = (
  rows: FolhaLancamentoEmprestimoPeriodo[],
  input: {
    desde_inicio?: boolean;
    year_from?: number;
    month_from?: number;
    year_to?: number;
    month_to?: number;
  }
): EmprestimoPeriodo | null => {
  const candidatos = rows
    .map((r) => ({
      year: Number(r.competencia_ano),
      month: Number(r.competencia_mes),
    }))
    .filter((r) => r.year && r.month >= 1 && r.month <= 12);

  if (!candidatos.length) return null;

  const valores = candidatos.map((r) => competenciaValor(r.year, r.month));
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  const minYear = Math.floor(min / 100);
  const minMonth = min % 100;
  const maxYear = Math.floor(max / 100);
  const maxMonth = max % 100;

  const now = new Date();
  const defaultTo = {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
  };

  const desdeInicio = Boolean(input.desde_inicio);
  const year_to = Number(input.year_to) || maxYear || defaultTo.year;
  const month_to = Number(input.month_to) || (desdeInicio ? maxMonth : defaultTo.month);
  const year_from = desdeInicio ? minYear : Number(input.year_from) || year_to;
  const month_from = desdeInicio ? minMonth : Number(input.month_from) || 1;

  if (month_from < 1 || month_from > 12 || month_to < 1 || month_to > 12) return null;
  if (competenciaValor(year_from, month_from) > competenciaValor(year_to, month_to)) return null;

  return {
    desde_inicio: desdeInicio,
    year_from,
    month_from,
    year_to,
    month_to,
  };
};

export const mapEmprestimoRow = (row: Record<string, unknown>): EmprestimoRow => {
  const quantidade_parcelas = Math.max(1, Math.round(num(row.quantidade_parcelas) || 1));
  const parcelas_pagas = Math.max(0, Math.round(num(row.parcelas_pagas)));
  const projeta = shouldProjectEmprestimoParcelas({
    projeta_parcelas: row.projeta_parcelas as boolean | null,
    responsabilidade: row.responsabilidade as string | null,
    data_desligamento: row.data_desligamento as string | null,
    status: row.status as string | null,
  });
  const parcelas_restantes_calc = computeParcelasRestantes(quantidade_parcelas, parcelas_pagas);
  const status = inferStatusFromParcelas(
    String(row.status ?? 'ativo') as EmprestimoStatus,
    quantidade_parcelas,
    parcelas_pagas
  );
  const data_inicio = row.data_inicio ? String(row.data_inicio).slice(0, 10) : null;

  return {
    id: Number(row.id),
    colaborador_id: row.colaborador_id != null ? Number(row.colaborador_id) : null,
    codigo_funcionario: row.codigo_funcionario ? String(row.codigo_funcionario) : null,
    nome_colaborador: String(row.nome_colaborador ?? 'Colaborador'),
    setor_nome: row.setor_nome ? String(row.setor_nome) : null,
    empresa_nome: row.empresa_nome ? String(row.empresa_nome) : null,
    instituicao_financeira: String(row.instituicao_financeira ?? ''),
    valor_contratado: row.valor_contratado != null ? num(row.valor_contratado) : null,
    valor_recebido: row.valor_recebido != null ? num(row.valor_recebido) : null,
    valor_parcela: num(row.valor_parcela),
    quantidade_parcelas,
    parcelas_pagas,
    parcelas_restantes: projeta ? parcelas_restantes_calc : 0,
    data_inicio,
    previsao_termino: projeta
      ? row.previsao_termino
        ? String(row.previsao_termino).slice(0, 10)
        : computePrevisaoTermino(data_inicio, quantidade_parcelas, parcelas_pagas)
      : null,
    status,
    rubrica_codigo: row.rubrica_codigo ? String(row.rubrica_codigo) : null,
    rubrica_nome: row.rubrica_nome ? String(row.rubrica_nome) : null,
    observacao: row.observacao ? String(row.observacao) : null,
    responsabilidade: (String(row.responsabilidade ?? 'empresa') as EmprestimoResponsabilidade) || 'empresa',
    data_desligamento: row.data_desligamento ? String(row.data_desligamento).slice(0, 10) : null,
    projeta_parcelas: projeta,
    motivo_encerramento: row.motivo_encerramento ? String(row.motivo_encerramento) : null,
    parcelas_restantes_exibicao: projeta ? parcelas_restantes_calc : null,
    created_at: row.created_at ? String(row.created_at) : undefined,
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
  };
};

export const groupEmprestimosPorColaborador = (rows: EmprestimoRow[]): EmprestimoColaboradorGrupo[] => {
  const map = new Map<string, EmprestimoColaboradorGrupo>();

  for (const e of rows) {
    const key =
      e.colaborador_id != null
        ? `c:${e.colaborador_id}`
        : e.codigo_funcionario
          ? `m:${e.codigo_funcionario}`
          : `n:${e.nome_colaborador}`;
    if (!map.has(key)) {
      map.set(key, {
        key,
        colaborador_id: e.colaborador_id,
        codigo_funcionario: e.codigo_funcionario,
        nome_colaborador: e.nome_colaborador,
        setor_nome: e.setor_nome,
        empresa_nome: e.empresa_nome,
        qtd_emprestimos: 0,
        parcela_mensal_total: 0,
        emprestimos: [],
      });
    }
    const g = map.get(key)!;
    g.emprestimos.push(e);
    g.qtd_emprestimos += 1;
    if (e.status === 'ativo' && e.projeta_parcelas) g.parcela_mensal_total += e.valor_parcela;
    if (!g.setor_nome && e.setor_nome) g.setor_nome = e.setor_nome;
    if (!g.empresa_nome && e.empresa_nome) g.empresa_nome = e.empresa_nome;
  }

  return Array.from(map.values())
    .map((g) => ({
      ...g,
      emprestimos: g.emprestimos.sort((a, b) => a.instituicao_financeira.localeCompare(b.instituicao_financeira, 'pt-BR')),
    }))
    .sort((a, b) => a.nome_colaborador.localeCompare(b.nome_colaborador, 'pt-BR'));
};

export type EmprestimosListResponse = {
  resumo: {
    colaboradores: number;
    total_emprestimos: number;
    ativos: number;
    parcela_mensal_total: number;
  };
  filtros: {
    empresas: string[];
    setores: string[];
  };
  grupos: EmprestimoColaboradorGrupo[];
};

export const buildEmprestimosListResponse = (rows: EmprestimoRow[]): EmprestimosListResponse => {
  const grupos = groupEmprestimosPorColaborador(rows);
  const empresas = new Set<string>();
  const setores = new Set<string>();
  for (const g of grupos) {
    if (g.empresa_nome) empresas.add(g.empresa_nome);
    if (g.setor_nome) setores.add(g.setor_nome);
  }
  return {
    resumo: {
      colaboradores: grupos.length,
      total_emprestimos: rows.length,
      ativos: rows.filter((r) => r.status === 'ativo').length,
      parcela_mensal_total: rows.filter((r) => r.status === 'ativo' && r.projeta_parcelas).reduce((s, r) => s + r.valor_parcela, 0),
    },
    filtros: {
      empresas: Array.from(empresas).sort((a, b) => a.localeCompare(b, 'pt-BR')),
      setores: Array.from(setores).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    },
    grupos,
  };
};

export type EmprestimoDivergenciaMotivo =
  | 'rescisao'
  | 'estorno'
  | 'parcela_nao_descontada'
  | 'reembolso'
  | 'diferenca_competencia'
  | 'erro_inconsistencia'
  | 'outro';

export const EMPRESTIMO_DIVERGENCIA_MOTIVOS: Array<{ id: EmprestimoDivergenciaMotivo; label: string }> = [
  { id: 'rescisao', label: 'Rescisão' },
  { id: 'estorno', label: 'Estorno' },
  { id: 'parcela_nao_descontada', label: 'Parcela não descontada' },
  { id: 'reembolso', label: 'Reembolso' },
  { id: 'diferenca_competencia', label: 'Diferença de competência' },
  { id: 'erro_inconsistencia', label: 'Erro/inconsistência' },
  { id: 'outro', label: 'Outro' },
];

export type EmprestimoDivergencia = {
  conciliacao_key: string;
  emprestimo_id: number | null;
  codigo_funcionario: string;
  nome_colaborador: string;
  setor_nome: string | null;
  instituicao_financeira: string;
  valor_esperado: number | null;
  valor_descontado: number;
  valor_repassado: number;
  diferenca: number;
  descontos_rescisao: number;
  estornos: number;
  motivo: EmprestimoDivergenciaMotivo | null;
  justificativa: string | null;
  justificado: boolean;
  motivo_sugerido: EmprestimoDivergenciaMotivo | null;
};

const DIVERGENCIA_TOLERANCIA = 0.009;

export const isEmprestimoDivergenciaLinha = (linha: EmprestimoConciliacaoLinha) => {
  if (linha.valor_cadastro != null) {
    return linha.diferenca != null && Math.abs(linha.diferenca) > DIVERGENCIA_TOLERANCIA;
  }
  return linha.desconto_liquido_folha > DIVERGENCIA_TOLERANCIA || linha.descontos_folha_normal > DIVERGENCIA_TOLERANCIA;
};

export const inferEmprestimoDivergenciaMotivo = (
  linha: Pick<
    EmprestimoConciliacaoLinha,
    'descontos_rescisao' | 'estornos' | 'desconto_liquido_folha' | 'valor_cadastro' | 'diferenca'
  >
): EmprestimoDivergenciaMotivo | null => {
  if (linha.descontos_rescisao > DIVERGENCIA_TOLERANCIA) return 'rescisao';
  if (linha.estornos > DIVERGENCIA_TOLERANCIA) return 'estorno';
  if (linha.valor_cadastro != null && linha.desconto_liquido_folha < DIVERGENCIA_TOLERANCIA) {
    return 'parcela_nao_descontada';
  }
  if (linha.diferenca != null && linha.diferenca < -DIVERGENCIA_TOLERANCIA) return 'reembolso';
  if (linha.valor_cadastro == null && linha.desconto_liquido_folha > DIVERGENCIA_TOLERANCIA) {
    return 'erro_inconsistencia';
  }
  return null;
};

export const buildEmprestimoDivergenciaFromLinha = (
  linha: EmprestimoConciliacaoLinha,
  justificativa?: { motivo?: string | null; justificativa?: string | null } | null
): EmprestimoDivergencia => {
  const valor_esperado = linha.valor_cadastro;
  const valor_descontado = linha.desconto_liquido_folha;
  const valor_repassado = linha.descontos_folha_normal;
  const diferenca =
    linha.diferenca != null
      ? linha.diferenca
      : valor_esperado != null
        ? valor_descontado - valor_esperado
        : valor_descontado;

  const motivoSalvo = justificativa?.motivo as EmprestimoDivergenciaMotivo | undefined;
  const motivoValido =
    motivoSalvo && EMPRESTIMO_DIVERGENCIA_MOTIVOS.some((m) => m.id === motivoSalvo) ? motivoSalvo : null;
  const motivo_sugerido = inferEmprestimoDivergenciaMotivo(linha);

  return {
    conciliacao_key: linha.key,
    emprestimo_id: linha.emprestimo_id,
    codigo_funcionario: linha.codigo_funcionario,
    nome_colaborador: linha.nome_funcionario,
    setor_nome: linha.setor_nome,
    instituicao_financeira: linha.instituicao_financeira,
    valor_esperado,
    valor_descontado,
    valor_repassado,
    diferenca,
    descontos_rescisao: linha.descontos_rescisao,
    estornos: linha.estornos,
    motivo: motivoValido,
    justificativa: justificativa?.justificativa ? String(justificativa.justificativa) : null,
    justificado: Boolean(motivoValido && String(justificativa?.justificativa ?? '').trim()),
    motivo_sugerido,
  };
};

/** Monta lista de divergências a partir da conciliação + cadastros ativos sem desconto na folha. */
export const buildEmprestimoDivergencias = (
  linhas: EmprestimoConciliacaoLinha[],
  cadastroRows: EmprestimoRow[],
  justificativas: Array<{
    conciliacao_key: string;
    motivo?: string | null;
    justificativa?: string | null;
  }> = []
): EmprestimoDivergencia[] => {
  const justMap = new Map(justificativas.map((j) => [j.conciliacao_key, j]));
  const divergencias: EmprestimoDivergencia[] = [];
  const keysComDivergencia = new Set<string>();

  for (const linha of linhas) {
    if (!isEmprestimoDivergenciaLinha(linha)) continue;
    keysComDivergencia.add(linha.key);
    divergencias.push(buildEmprestimoDivergenciaFromLinha(linha, justMap.get(linha.key)));
  }

  for (const emp of cadastroRows) {
    if (emp.status !== 'ativo' || !emp.projeta_parcelas || emp.valor_parcela < DIVERGENCIA_TOLERANCIA) continue;
    const codigo = String(emp.codigo_funcionario ?? '').trim();
    if (!codigo) continue;
    const key = emprestimoConciliacaoKey(codigo, emp.rubrica_nome ?? emp.instituicao_financeira);
    if (keysComDivergencia.has(key)) continue;

    const linhaFolha = linhas.find((l) => l.key === key);
    if (linhaFolha && linhaFolha.desconto_liquido_folha > DIVERGENCIA_TOLERANCIA) continue;

    const linhaVirtual: EmprestimoConciliacaoLinha = linhaFolha ?? {
      key,
      codigo_funcionario: codigo,
      nome_funcionario: emp.nome_colaborador,
      setor_nome: emp.setor_nome,
      instituicao_financeira: emp.instituicao_financeira,
      rubrica_codigo: emp.rubrica_codigo,
      rubrica_nome: emp.rubrica_nome,
      descontos: 0,
      descontos_folha_normal: 0,
      descontos_rescisao: 0,
      estornos: 0,
      estornos_folha_normal: 0,
      estornos_rescisao: 0,
      desconto_liquido: 0,
      desconto_liquido_folha: 0,
      valor_cadastro: emp.valor_parcela,
      emprestimo_id: emp.id,
      diferenca: -(emp.valor_parcela || 0),
      lancamentos: [],
    };

    if (!isEmprestimoDivergenciaLinha(linhaVirtual)) continue;
    keysComDivergencia.add(key);
    divergencias.push(buildEmprestimoDivergenciaFromLinha(linhaVirtual, justMap.get(key)));
  }

  return divergencias.sort((a, b) => {
    const byNome = a.nome_colaborador.localeCompare(b.nome_colaborador, 'pt-BR');
    if (byNome !== 0) return byNome;
    return a.instituicao_financeira.localeCompare(b.instituicao_financeira, 'pt-BR');
  });
};

export type EmprestimoConciliacaoResponse = {
  year: number;
  month: number;
  resumo: ReturnType<typeof sumConciliacao> & {
    linhas: number;
    divergencias: number;
    divergencias_justificadas: number;
    divergencias_pendentes: number;
  };
  linhas: EmprestimoConciliacaoLinha[];
  divergencias_lista: EmprestimoDivergencia[];
};
