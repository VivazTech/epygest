export type FolhaConfig = {
  comissao_produtividade_separadas: boolean;
  incluir_retorno_total_custo: boolean;
};

export type RubricaParametro = {
  id?: number;
  codigo_rubrica: string;
  descricao: string;
  categoria: string;
  entra_provento: boolean;
  entra_retorno: boolean;
  entra_comissao: boolean;
  entra_produtividade: boolean;
  entra_base_salario?: boolean;
  fator_provento: number;
  fator_retorno: number;
  ativo: boolean;
  observacoes?: string | null;
};

export type EncargosParametro = {
  ano: number;
  percentual_fgts: number;
  percentual_inss: number;
  percentual_fgts_aprendiz?: number;
  percentual_provisao_13: number;
  percentual_provisao_ferias: number;
  percentual_um_terco_ferias: number;
  ativo?: boolean;
};

export type LancamentoInput = {
  codigo_rubrica: string;
  descricao_rubrica?: string;
  tipo_original?: string;
  valor_original: number;
  codigo_funcionario?: string | null;
  nome_funcionario?: string | null;
  cpf_funcionario?: string | null;
  cargo_nome?: string | null;
  setor_nome?: string | null;
  situacao?: string | null;
  quantidade?: string | null;
};

export type LancamentoClassificado = LancamentoInput & {
  valor_provento: number;
  valor_retorno: number;
  valor_comissao: number;
  valor_produtividade: number;
  status_mapeamento: 'mapeado' | 'pendente';
};

export type ApuracaoMensal = {
  competencia_mes: number;
  competencia_ano: number;
  total_proventos: number;
  total_retorno: number;
  total_comissao: number;
  total_produtividade: number;
  total_salario: number;
  provisao_13: number;
  provisao_ferias: number;
  provisao_um_terco_ferias: number;
  fgts: number;
  fgts_provisao_ferias: number;
  fgts_provisao_13: number;
  inss: number;
  inss_13: number;
  inss_provisao_ferias: number;
  total_custo: number;
  qtd_trabalhando: number;
  qtd_funcionarios: number;
  rubricas_nao_mapeadas: number;
};

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Equivalente à coluna A (PROVENTOS) da aba Dados 2026, por lançamento.
 * Usa exclusivamente o cadastro de parâmetros de rubricas — sem inferência.
 *
 * se rubrica.entra_provento = true → valor_original * fator_provento (padrão 1)
 * senão → 0
 * rubrica ausente/inativa → 0 + pendente
 */
export function calcularValorProvento(
  valorOriginal: number,
  param: RubricaParametro | undefined | null
): { valor_provento: number; status_mapeamento: 'mapeado' | 'pendente' } {
  if (!param || !param.ativo) {
    return { valor_provento: 0, status_mapeamento: 'pendente' };
  }
  if (!param.entra_provento) {
    return { valor_provento: 0, status_mapeamento: 'mapeado' };
  }
  const fator = num(param.fator_provento) || 1;
  return { valor_provento: num(valorOriginal) * fator, status_mapeamento: 'mapeado' };
}

/**
 * Equivalente à fórmula SOMASES da planilha mensal (ex.: E5):
 * =SOMASES('Dados 2026'!A:A; 'Dados 2026'!$F:$F; ano; 'Dados 2026'!$E:$E; mes)
 */
export function calcularTotalProventos(
  lancamentos: Iterable<Pick<LancamentoClassificado, 'valor_provento'>>
): number {
  let total = 0;
  for (const l of lancamentos) total += num(l.valor_provento);
  return total;
}

/** Converte linha de folha_lancamentos_importados para LancamentoInput. */
export function mapLancamentoImportadoDetalhe(raw: Record<string, unknown>): LancamentoInput {
  return {
    codigo_rubrica: String(raw.codigo_rubrica ?? '').trim(),
    descricao_rubrica: String(raw.descricao_rubrica ?? ''),
    tipo_original: String(raw.tipo_original ?? ''),
    valor_original: num(raw.valor_original),
    codigo_funcionario: raw.codigo_funcionario != null ? String(raw.codigo_funcionario) : null,
    nome_funcionario: raw.nome_funcionario != null ? String(raw.nome_funcionario) : null,
    cpf_funcionario: raw.cpf_funcionario != null ? String(raw.cpf_funcionario) : null,
    cargo_nome: raw.cargo_nome != null ? String(raw.cargo_nome) : null,
    setor_nome: raw.setor_nome != null ? String(raw.setor_nome) : null,
    situacao: raw.situacao != null ? String(raw.situacao) : null,
    quantidade: raw.quantidade != null ? String(raw.quantidade) : null,
  };
}

/** Converte linha de folha_rubricas (resumo do extrato importado) para LancamentoInput. */
export function mapLancamentoImportadoResumo(raw: Record<string, unknown>): LancamentoInput {
  return {
    codigo_rubrica: String(raw.codigo ?? '').trim(),
    descricao_rubrica: String(raw.nome ?? ''),
    tipo_original: String(raw.tipo ?? ''),
    valor_original: num(raw.valor),
    quantidade: raw.horas != null ? String(raw.horas) : null,
  };
}

/**
 * Seleciona lançamentos da importação para a competência.
 * Equivalente às linhas de Dados 2026 filtradas por ano/mês.
 * Usa resumo (folha_rubricas) quando o detalhe por funcionário estiver incompleto.
 */
export function lancamentosDaImportacao(
  detalheImportado: Record<string, unknown>[] | null | undefined,
  rubricasResumo: Record<string, unknown>[] | null | undefined
): LancamentoInput[] {
  const detalhe = detalheImportado ?? [];
  const resumo = rubricasResumo ?? [];

  // O "Resumo por Rubrica" é a fonte oficial dos totais mensais — é exatamente o que a
  // apuração da planilha agrega (Dados 2026 → SOMASES). O detalhe por funcionário é usado
  // apenas como fallback (o parser por holerite pode duplicar/inflar valores).
  if (resumo.length) {
    return resumo.map(mapLancamentoImportadoResumo);
  }
  return detalhe.map(mapLancamentoImportadoDetalhe);
}

/**
 * Mapeia rubrica do extrato importado → parâmetro de apuração.
 * Espelha a tabela de classificação da planilha / tela Custo da Folha.
 * Usado na importação para criar cadastro inicial (não entra no cálculo sem estar em folha_rubricas_parametros).
 */
export function mapearRubricaImportadaParaParametro(
  codigo: string,
  nome: string,
  tipoOriginal?: string
): Omit<RubricaParametro, 'id'> {
  const tipo = String(tipoOriginal ?? '').trim().toUpperCase();
  const norm = String(nome ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const inssKey = norm.replace(/[^a-z0-9]/g, '');
  const base = {
    codigo_rubrica: String(codigo).trim(),
    descricao: String(nome || codigo).trim(),
    ativo: true,
    entra_base_salario: true,
    entra_encargos: false,
    fator_provento: 1,
    fator_retorno: -1,
    observacoes: 'Cadastro gerado na importação do extrato',
  };

  if (/comiss/.test(norm)) {
    return { ...base, categoria: 'comissao', entra_provento: false, entra_retorno: false, entra_comissao: true, entra_produtividade: false };
  }
  if (/produtiv/.test(norm)) {
    return { ...base, categoria: 'produtividade', entra_provento: false, entra_retorno: false, entra_comissao: false, entra_produtividade: true };
  }
  if (/inss/.test(inssKey)) {
    return { ...base, categoria: 'desconto', entra_provento: false, entra_retorno: true, entra_comissao: false, entra_produtividade: false, entra_base_salario: false };
  }
  if (/(^|[^0-9])13([^0-9]|$)|13o|decimo terceiro/.test(norm) || /feria|abono/.test(norm) || /1\/3/.test(String(nome ?? ''))) {
    return { ...base, categoria: 'provento', entra_provento: true, entra_retorno: false, entra_comissao: false, entra_produtividade: false };
  }
  if (tipo === 'D' || /desconto|irrf|vale|falta|atraso|emprest|adiant|pensao|contrib/.test(norm)) {
    return { ...base, categoria: 'desconto', entra_provento: false, entra_retorno: true, entra_comissao: false, entra_produtividade: false };
  }
  if (tipo === 'P' || !tipo) {
    return { ...base, categoria: 'provento', entra_provento: true, entra_retorno: false, entra_comissao: false, entra_produtividade: false };
  }
  return { ...base, categoria: 'neutro', entra_provento: false, entra_retorno: false, entra_comissao: false, entra_produtividade: false, entra_base_salario: false };
}

/** Rubricas únicas encontradas no extrato que ainda não existem no cadastro. */
export function listarRubricasNovasParaCadastro(
  rubricasImportadas: { codigo: string; nome: string; tipo: string }[],
  codigosCadastrados: Set<string>
): Omit<RubricaParametro, 'id'>[] {
  const seen = new Set<string>();
  const novas: Omit<RubricaParametro, 'id'>[] = [];
  for (const rb of rubricasImportadas) {
    const cod = String(rb.codigo ?? '').trim();
    if (!cod || seen.has(cod) || codigosCadastrados.has(cod)) continue;
    seen.add(cod);
    novas.push(mapearRubricaImportadaParaParametro(cod, rb.nome, rb.tipo));
  }
  return novas;
}

/** Classifica um lançamento importado usando o cadastro de parâmetros de rubricas. */
export function classificarLancamento(
  lanc: LancamentoInput,
  paramsByCodigo: Map<string, RubricaParametro>
): LancamentoClassificado {
  const valor = num(lanc.valor_original);
  const codigo = String(lanc.codigo_rubrica ?? '').trim();
  const param = paramsByCodigo.get(codigo);

  const { valor_provento, status_mapeamento: statusProv } = calcularValorProvento(valor, param);

  if (statusProv === 'pendente') {
    return {
      ...lanc,
      valor_provento: 0,
      valor_retorno: 0,
      valor_comissao: 0,
      valor_produtividade: 0,
      status_mapeamento: 'pendente',
    };
  }

  const fatorRet = num(param!.fator_retorno) || -1;
  return {
    ...lanc,
    valor_provento,
    valor_retorno: param!.entra_retorno ? valor * fatorRet : 0,
    valor_comissao: param!.entra_comissao ? valor : 0,
    valor_produtividade: param!.entra_produtividade ? valor : 0,
    status_mapeamento: 'mapeado',
  };
}

/** Classifica todos os lançamentos importados da competência. */
export function classificarLancamentosImportacao(
  rawLancamentos: LancamentoInput[],
  paramsByCodigo: Map<string, RubricaParametro>
): LancamentoClassificado[] {
  return rawLancamentos.map((l) => classificarLancamento(l, paramsByCodigo));
}

/** Sugestão ao mapear pendência manualmente na UI. */
export function inferirParametroRubrica(
  codigo: string,
  descricao: string,
  tipoOriginal?: string
): Omit<RubricaParametro, 'id'> {
  return {
    ...mapearRubricaImportadaParaParametro(codigo, descricao, tipoOriginal),
    observacoes: 'Sugestão ao mapear pendência',
  };
}

/** Calcula totais mensais a partir dos lançamentos classificados. */
export function calcularApuracaoMensal(
  year: number,
  month: number,
  lancamentos: LancamentoClassificado[],
  encargos: EncargosParametro,
  qtdTrabalhando = 0,
  qtdFuncionarios = 0,
  config: FolhaConfig = { comissao_produtividade_separadas: true, incluir_retorno_total_custo: false }
): ApuracaoMensal {
  const sum = (fn: (l: LancamentoClassificado) => number) =>
    lancamentos.reduce((acc, l) => acc + fn(l), 0);

  // SOMASES planilha: soma coluna PROVENTOS (valor_provento) filtrada por ano/mês na importação
  const total_proventos = calcularTotalProventos(lancamentos);
  const total_retorno = sum((l) => l.valor_retorno);
  const total_comissao = sum((l) => l.valor_comissao);
  const total_produtividade = sum((l) => l.valor_produtividade);
  const total_salario = config.comissao_produtividade_separadas
    ? total_proventos + total_comissao + total_produtividade
    : total_proventos;

  const pct13 = num(encargos.percentual_provisao_13) || 1 / 12;
  const pctFerias = num(encargos.percentual_provisao_ferias) || 1 / 12;
  const pctUmTerco = num(encargos.percentual_um_terco_ferias) || 1 / 3;
  const pctFgts = num(encargos.percentual_fgts);
  const pctInss = num(encargos.percentual_inss);

  const provisao_13 = total_salario * pct13;
  const provisao_ferias = total_salario * pctFerias;
  const provisao_um_terco_ferias = provisao_ferias * pctUmTerco;

  const fgts = total_salario * pctFgts;
  const fgts_provisao_ferias = (provisao_ferias + provisao_um_terco_ferias) * pctFgts;
  const fgts_provisao_13 = provisao_13 * pctFgts;

  const inss = total_salario * pctInss;
  const inss_13 = provisao_13 * pctInss;
  const inss_provisao_ferias = (provisao_ferias + provisao_um_terco_ferias) * pctInss;

  const total_custo =
    total_salario +
    provisao_13 +
    provisao_ferias +
    provisao_um_terco_ferias +
    fgts +
    fgts_provisao_ferias +
    fgts_provisao_13 +
    inss +
    inss_13 +
    inss_provisao_ferias +
    (config.incluir_retorno_total_custo ? total_retorno : 0);

  const rubricas_nao_mapeadas = new Set(
    lancamentos.filter((l) => l.status_mapeamento === 'pendente').map((l) => l.codigo_rubrica)
  ).size;

  return {
    competencia_mes: month,
    competencia_ano: year,
    total_proventos,
    total_retorno,
    total_comissao,
    total_produtividade,
    total_salario,
    provisao_13,
    provisao_ferias,
    provisao_um_terco_ferias,
    fgts,
    fgts_provisao_ferias,
    fgts_provisao_13,
    inss,
    inss_13,
    inss_provisao_ferias,
    total_custo,
    qtd_trabalhando: qtdTrabalhando,
    qtd_funcionarios: qtdFuncionarios,
    rubricas_nao_mapeadas,
  };
}

export const MESES_LABEL = [
  '', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

export const CATEGORIAS_RUBRICA = [
  'provento', 'desconto', 'comissao', 'produtividade',
  'encargo', 'informativo', 'informativo_dedutor', 'neutro',
] as const;
