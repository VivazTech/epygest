// Manifesto das planilhas extraídas (pasta Extracao_Planilhas).
// O nome de cada aba é o que vem depois de "aba_NNN_" no arquivo
// (versão legível, conforme campo "nome" do próprio JSON).

export interface PlanilhaMeta {
  indice: number;
  nome: string;
  arquivo: string;
}

export const PLANILHAS: PlanilhaMeta[] = [
  { indice: 1, nome: 'Síntese', arquivo: 'aba_001_S_ntese.json' },
  { indice: 2, nome: 'Prev x Real 2026', arquivo: 'aba_002_Prev_x_Real_2026.json' },
  { indice: 3, nome: 'Ajustes', arquivo: 'aba_003_Ajustes.json' },
  { indice: 4, nome: 'Orçamento 2026', arquivo: 'aba_004_Or_amento_2026.json' },
  { indice: 7, nome: 'Relatorio de CRD', arquivo: 'aba_007_RELAT_RIO_CRD_.json' },
  { indice: 12, nome: 'RDS', arquivo: 'aba_012_RDS.json' },
  { indice: 13, nome: 'Apoio RDS', arquivo: 'aba_013_Apoio_RDS.json' },
  { indice: 14, nome: 'Consumo Interno', arquivo: 'aba_014_Consumo_Interno.json' },
  { indice: 15, nome: 'Contas novas', arquivo: 'aba_015_Contas_novas.json' },
  { indice: 16, nome: 'Setores', arquivo: 'aba_016_Setores.json' },
  { indice: 17, nome: 'Dados Folha e Extras', arquivo: 'aba_017_Dados_Folha_e_Extras.json' },
  { indice: 18, nome: 'Acomp. Orçamento', arquivo: 'aba_018_Acomp__Or_amento.json' },
];

/** Itens da seção Apuração de Receita (planilhas RDS). */
export const APURACAO_RECEITA_ITENS: PlanilhaMeta[] = [
  { indice: 12, nome: 'Relatório de RDS', arquivo: 'aba_012_RDS.json' },
  { indice: 13, nome: 'Apoio RDS', arquivo: 'aba_013_Apoio_RDS.json' },
];

/** Itens da seção Base de Orçamento. */
export const BASE_ORCAMENTO_ITENS: Array<PlanilhaMeta & { tabId: string }> = [
  { indice: 1, nome: 'Síntase', arquivo: 'aba_001_S_ntese.json', tabId: 'sintase' },
  { indice: 14, nome: 'Consumo Interno', arquivo: 'aba_014_Consumo_Interno.json', tabId: 'planilha-14' },
  { indice: 15, nome: 'Contas novas', arquivo: 'aba_015_Contas_novas.json', tabId: 'planilha-15' },
  { indice: 16, nome: 'Setores', arquivo: 'aba_016_Setores.json', tabId: 'planilha-16' },
  { indice: 17, nome: 'Dados Folha e Extras', arquivo: 'aba_017_Dados_Folha_e_Extras.json', tabId: 'planilha-17' },
  { indice: 18, nome: 'Acomp. Orçamento', arquivo: 'aba_018_Acomp__Or_amento.json', tabId: 'planilha-18' },
];

const APURACAO_RECEITA_INDICES = new Set(APURACAO_RECEITA_ITENS.map((p) => p.indice));
const BASE_ORCAMENTO_INDICES = new Set(BASE_ORCAMENTO_ITENS.map((p) => p.indice));

/** Planilhas listadas em Apuração de Resultados (exclui receita e base de orçamento). */
export const PLANILHAS_RESULTADOS = PLANILHAS.filter(
  (p) => !APURACAO_RECEITA_INDICES.has(p.indice) && !BASE_ORCAMENTO_INDICES.has(p.indice)
).map((p) => (p.indice === 2 ? { ...p, nome: 'Prev x Real Mensal' } : p));

export const isApuracaoReceitaPlanilha = (indice: number) => APURACAO_RECEITA_INDICES.has(indice);
export const isBaseOrcamentoPlanilha = (indice: number) => BASE_ORCAMENTO_INDICES.has(indice);
export const isBaseOrcamentoTab = (tab: string) =>
  tab === 'sintase' ||
  (tab.startsWith('planilha-') && isBaseOrcamentoPlanilha(Number(tab.slice('planilha-'.length))));

const normalizeNome = (nome: string) =>
  nome.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

// Localiza uma planilha do manifesto pelo nome usado nas referências (ex.: "Síntese!C48").
export const findPlanilhaByNome = (nome: string): PlanilhaMeta | undefined =>
  PLANILHAS.find((p) => normalizeNome(p.nome) === normalizeNome(nome));

// Converte índice de coluna (1-based) em letra de coluna estilo planilha (1 -> A, 27 -> AA).
export const colLetter = (n: number): string => {
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

// Converte letra de coluna em índice 1-based (A -> 1, AA -> 27).
export const colIndex = (letters: string): number => {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
};

// Extrai a primeira célula de uma referência tipo "C48" ou "B10:O10".
export const parseCellRef = (ref: string): { row: number; col: number } | null => {
  const m = /^\$?([A-Za-z]+)\$?(\d+)/.exec(ref.trim());
  if (!m) return null;
  return { row: Number(m[2]), col: colIndex(m[1]) };
};

// ---------- Tipos do JSON extraído ----------

export interface PlanilhaDependencia {
  tipo: 'local' | 'aba_externa' | string;
  celulas?: string[];
  abaOrigem?: string;
  abaDestino?: string;
  celula?: string;
  referencia?: string;
}

export interface PlanilhaCelula {
  celula: string;
  linha: number;
  coluna: number;
  colunaLetra: string;
  valor?: any;
  valorReal?: any;
  tipoValor?: string;
  formula?: string;
  tipoFormula?: string;
  dependencias?: PlanilhaDependencia[];
  valorCalculado?: any;
}

export interface PlanilhaData {
  id: number;
  nome: string;
  indice: number;
  totalLinhas: number;
  totalColunas: number;
  cabecalhos: { coluna: string; indice: number; texto: string }[];
  celulas: PlanilhaCelula[];
  resumo: {
    totalCelulasComFormula: number;
    totalCelulasComValor: number;
    formulasUsadas: Record<string, number>;
    dependenciasExternas: PlanilhaDependencia[];
  };
}

// ---------- Dicionário explicativo das fórmulas (rodapé) ----------

export interface FormulaInfo {
  sintaxe: string;
  descricao: string;
}

export const FORMULA_DESCRIPTIONS: Record<string, FormulaInfo> = {
  IMPORTRANGE: {
    sintaxe: 'IMPORTRANGE(url_planilha; "Aba!A1:B10")',
    descricao:
      'Importa um intervalo de células de OUTRA planilha do Google. É assim que esta planilha "conversa" com arquivos externos (ex.: Projeção Comercial, Folha). Quando o acesso não está autorizado, o resultado aparece como #REF!.',
  },
  EOMONTH: {
    sintaxe: 'EOMONTH(data_inicial; meses)',
    descricao:
      'Retorna o último dia do mês, deslocado N meses a partir da data inicial. Usada para gerar a sequência de competências mensais (jan/2026, fev/2026, ...) a partir de uma única data digitada.',
  },
  IFERROR: {
    sintaxe: 'IFERROR(valor; valor_se_erro)',
    descricao:
      'Se o cálculo principal der erro (#N/A, #DIV/0!, #REF!...), exibe o valor alternativo (geralmente vazio ou zero). Evita que erros de busca "sujem" o relatório.',
  },
  OFFSET: {
    sintaxe: 'OFFSET(referência; deslocar_linhas; deslocar_colunas; [altura]; [largura])',
    descricao:
      'Cria uma referência dinâmica deslocada a partir de uma célula âncora. Combinada com MATCH, permite buscar o intervalo do mês correto sem reescrever a fórmula a cada coluna.',
  },
  MATCH: {
    sintaxe: 'MATCH(valor_procurado; intervalo; 0)',
    descricao:
      'Retorna a POSIÇÃO de um valor dentro de um intervalo (ex.: em qual coluna está o mês "3/2026"). É o "GPS" usado por INDEX e OFFSET para localizar linhas e colunas.',
  },
  INDEX: {
    sintaxe: 'INDEX(intervalo; linha; [coluna])',
    descricao:
      'Retorna o valor que está em determinada linha/coluna de um intervalo. Em dupla com MATCH (INDEX+MATCH) funciona como um PROCV mais flexível: busca um CRD/conta em outra aba e traz o valor correspondente.',
  },
  SUM: {
    sintaxe: 'SUM(intervalo)',
    descricao: 'Soma todos os números do intervalo. Usada nos totais de linhas, colunas e grupos de contas.',
  },
  SUMIF: {
    sintaxe: 'SUMIF(intervalo_critério; critério; intervalo_soma)',
    descricao:
      'Soma somente os valores cujas linhas atendem a UM critério (ex.: somar tudo do CRD "522" ou de um mês específico).',
  },
  SUMIFS: {
    sintaxe: 'SUMIFS(intervalo_soma; intervalo1; critério1; intervalo2; critério2; ...)',
    descricao:
      'Soma com VÁRIOS critérios ao mesmo tempo (ex.: conta + mês + ano). É a fórmula que consolida o realizado por conta/competência a partir das abas de lançamentos.',
  },
  SUBTOTAL: {
    sintaxe: 'SUBTOTAL(9; intervalo)',
    descricao:
      'Soma (código 9) respeitando filtros aplicados na aba: linhas ocultadas pelo filtro ficam fora do total. Usada nos relatórios de requisições e consumo interno.',
  },
  COUNTIF: {
    sintaxe: 'COUNTIF(intervalo; critério)',
    descricao: 'Conta quantas células do intervalo atendem ao critério (ex.: quantas vezes uma conta aparece).',
  },
  IF: {
    sintaxe: 'IF(condição; valor_se_verdadeiro; valor_se_falso)',
    descricao:
      'Decide entre dois resultados conforme uma condição (ex.: se a data pertence ao mês da coluna, traz o valor; senão, deixa vazio).',
  },
  AND: {
    sintaxe: 'AND(condição1; condição2; ...)',
    descricao:
      'Retorna VERDADEIRO somente se TODAS as condições forem verdadeiras. Usada dentro do IF para testar mês E ano ao mesmo tempo.',
  },
  YEAR: {
    sintaxe: 'YEAR(data)',
    descricao: 'Extrai o ano de uma data (ex.: 2026). Usada para classificar lançamentos por exercício.',
  },
  MONTH: {
    sintaxe: 'MONTH(data)',
    descricao: 'Extrai o mês de uma data (1 a 12). Usada para alocar cada lançamento na coluna do mês correto.',
  },
  DAY: {
    sintaxe: 'DAY(data)',
    descricao: 'Extrai o dia do mês de uma data (1 a 31).',
  },
  ROUNDDOWN: {
    sintaxe: 'ROUNDDOWN(número; casas)',
    descricao: 'Arredonda o número PARA BAIXO com a quantidade de casas indicada (truncamento controlado).',
  },
  LEFT: {
    sintaxe: 'LEFT(texto; n)',
    descricao:
      'Retorna os N primeiros caracteres de um texto. Usada para extrair o código do CRD/conta do início da descrição.',
  },
  RIGHT: {
    sintaxe: 'RIGHT(texto; n)',
    descricao: 'Retorna os N últimos caracteres de um texto (ex.: extrair o código entre parênteses no fim do nome da conta).',
  },
  LEN: {
    sintaxe: 'LEN(texto)',
    descricao: 'Retorna o tamanho (nº de caracteres) do texto. Apoia LEFT/RIGHT no recorte de códigos.',
  },
  FIND: {
    sintaxe: 'FIND(procurar; texto)',
    descricao:
      'Retorna a posição em que um caractere aparece no texto (ex.: posição do "(" ). Define onde LEFT/RIGHT devem cortar.',
  },
  SUBSTITUTE: {
    sintaxe: 'SUBSTITUTE(texto; antigo; novo)',
    descricao: 'Substitui parte do texto por outro valor (ex.: remover parênteses ou padronizar descrições).',
  },
  TRANSPOSE: {
    sintaxe: 'TRANSPOSE(intervalo)',
    descricao: 'Converte linhas em colunas (e vice-versa). Usada para espelhar a linha de meses na vertical.',
  },
  VIVAZ: {
    sintaxe: "'VIVAZ ...'!intervalo",
    descricao:
      'Não é uma função: é uma referência a intervalo/planilha nomeada "VIVAZ" detectada pelo extrator dentro de fórmulas (ex.: IMPORTRANGE de outro arquivo do grupo Vivaz).',
  },
};

// Rótulos amigáveis para a classificação de fórmula feita pelo extrator.
export const TIPO_FORMULA_LABELS: Record<string, string> = {
  importacao_externa: 'Importação externa (IMPORTRANGE)',
  referencia_dinamica: 'Referência dinâmica (OFFSET/INDEX)',
  soma: 'Soma / total (SUM)',
  soma_condicional: 'Soma condicional (SUMIF/SUMIFS)',
  contagem_condicional: 'Contagem condicional (COUNTIF)',
  busca_avancada: 'Busca avançada (INDEX+MATCH)',
  condicional: 'Condicional (IF)',
  outro: 'Outras fórmulas',
};
