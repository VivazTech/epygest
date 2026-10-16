/**
 * Orçamento Aquamania — cálculos puros (sem I/O), compartilhados por API, tela e
 * script de conferência. Replica as fórmulas das planilhas:
 *  - "Aquamania Dados para Orçamento 2026-27" › abas Síntese e Prev x Real 2026-27
 *  - "Quadro de Empregados - Aquamania - Orçamento 2026_2027" › BAIXA / ALTA / Recreação
 */

// ─── Temporada (set→ago) ────────────────────────────────────────────────────

export type AquaMes = { ano: number; mes: number; key: string; label: string };

const MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export const ymKey = (ano: number, mes: number) => `${ano}-${String(mes).padStart(2, '0')}`;

export function mesesDaTemporada(anoInicio: number, mesInicio: number): AquaMes[] {
  const out: AquaMes[] = [];
  for (let i = 0; i < 12; i++) {
    const idx = mesInicio - 1 + i;
    const ano = anoInicio + Math.floor(idx / 12);
    const mes = (idx % 12) + 1;
    out.push({ ano, mes, key: ymKey(ano, mes), label: `${MESES_CURTOS[mes - 1]}/${String(ano).slice(2)}` });
  }
  return out;
}

/** Meses que entram no acumulado ("Números acumulados até"). Sem data = todos. */
export function mesesAcumulados(meses: AquaMes[], ateAno?: number | null, ateMes?: number | null): Set<string> {
  if (!ateAno || !ateMes) return new Set(meses.map((m) => m.key));
  const limite = ateAno * 12 + ateMes;
  return new Set(meses.filter((m) => m.ano * 12 + m.mes <= limite).map((m) => m.key));
}

// ─── Parâmetros ─────────────────────────────────────────────────────────────

export type AquaParametros = {
  aliq_iss: number;
  aliq_icms: number;
  aliq_pis: number;
  aliq_cofins: number;
  aliq_csll: number;
  aliq_irpj: number;
  pct_cmv: number;
  pct_comissao_cartao: number;
  pct_influencer_base: number;
  pct_influencer: number;
  valor_vale_alimentacao: number;
  /** Planilha soma os passantes do ano anterior na base do A&B Bar (Síntese!D169). */
  bar_inclui_passantes_ano_ant: boolean;
  pct_fgts: number;
  pct_inss: number;
  pct_13: number;
  pct_ferias: number;
  pct_terco_ferias: number;
  vt_base: number;
  vt_pct_desconto: number;
  pct_quebra_caixa: number;
  beneficio_assiduidade: number;
  beneficio_boas_praticas: number;
  /** Grupos de itens das Requisições tratados como Uso e Consumo (Contas novas!J19:J52). */
  req_grupos_uso_consumo: number[];
  /** Grupos de itens das Requisições tratados como CMV (Contas novas!M18:M50). */
  req_grupos_cmv: number[];
  /** Setores cujo CMV é Consumo Interno (Prev x Real linhas 268-271). */
  setores_consumo_interno: string[];
};

export const AQUA_PARAMETROS_PADRAO: AquaParametros = {
  aliq_iss: 0.05,
  aliq_icms: 0.038,
  aliq_pis: 0.0065,
  aliq_cofins: 0.03,
  aliq_csll: 0.0121,
  aliq_irpj: 0.0184,
  pct_cmv: 0.34,
  pct_comissao_cartao: 0.06,
  pct_influencer_base: 0.5,
  pct_influencer: 0.15,
  valor_vale_alimentacao: 300,
  bar_inclui_passantes_ano_ant: true,
  pct_fgts: 0.08,
  pct_inss: 0.285,
  pct_13: 0.0833,
  pct_ferias: 0.0833,
  pct_terco_ferias: 0.0278,
  vt_base: 220,
  vt_pct_desconto: 0.06,
  pct_quebra_caixa: 0.1,
  beneficio_assiduidade: 200,
  beneficio_boas_praticas: 100,
  req_grupos_uso_consumo: [
    29, 40, 42, 43, 44, 45, 46, 47, 58, 69, 74, 80, 81, 84, 91, 101, 104, 109, 111, 49, 41, 98, 54, 52, 56, 51, 53,
    86, 118, 83,
  ],
  req_grupos_cmv: [
    7, 8, 10, 11, 14, 15, 16, 17, 18, 19, 20, 22, 24, 25, 26, 27, 28, 30, 32, 33, 34, 35, 36, 37, 38, 39, 61, 66,
    67, 68, 99, 100,
  ],
  setores_consumo_interno: ['REFEITORIO', 'DIRETORIA', 'RECURSOS HUMANOS', 'ACQUAMANIA'],
};

export function normalizarParametros(raw: unknown): AquaParametros {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out: any = { ...AQUA_PARAMETROS_PADRAO };
  for (const [k, def] of Object.entries(AQUA_PARAMETROS_PADRAO)) {
    const v = src[k];
    if (v === undefined || v === null || v === '') continue;
    if (typeof def === 'boolean') out[k] = v === true || v === 'true';
    else if (Array.isArray(def)) {
      if (Array.isArray(v)) out[k] = typeof def[0] === 'number' ? v.map(Number).filter(Number.isFinite) : v.map(String);
    } else {
      const n = Number(v);
      if (Number.isFinite(n)) out[k] = n;
    }
  }
  return out as AquaParametros;
}

// ─── Síntese (previsto calculado a partir das premissas) ────────────────────

export type AquaPremissas = {
  passantes: number;
  passantes_ano_ant: number;
  hospedes: number;
  ingresso_pax: number;
  servicos_passante: number;
  bar_pax: number;
  lanchonete_pax: number;
  repasse_pax: number;
  qtd_vale_alimentacao: number;
};

export const PREMISSAS_VAZIAS: AquaPremissas = {
  passantes: 0,
  passantes_ano_ant: 0,
  hospedes: 0,
  ingresso_pax: 0,
  servicos_passante: 0,
  bar_pax: 0,
  lanchonete_pax: 0,
  repasse_pax: 0,
  qtd_vale_alimentacao: 0,
};

export type AquaSinteseMes = {
  ingressos: number;
  servicos: number;
  bar: number;
  lanchonete: number;
  comissao_influencer: number;
  comissao_cartao: number;
  vale_alimentacao: number;
  iss: number;
  icms: number;
  pis: number;
  cofins: number;
  cmv: number;
};

const n = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

/** Valor digitado por cima da fórmula (substitui) e/ou constante somada a ela, como na planilha. */
export type AquaAjusteCalculo = { substitui?: number | null; soma?: number };
export type AquaAjustesSintese = Partial<Record<keyof AquaSinteseMes, AquaAjusteCalculo>>;

const aplicar = (calc: number, a?: AquaAjusteCalculo) =>
  (a?.substitui !== null && a?.substitui !== undefined ? n(a.substitui) : calc) + n(a?.soma);

/**
 * Fórmulas da aba Síntese (linhas 32, 36, 150, 157-160, 168-171) e Prev x Real (266).
 * Os ajustes entram antes dos impostos/CMV, que usam as receitas já ajustadas (igual à planilha).
 */
export function calcularSintese(
  p: AquaPremissas,
  params: AquaParametros,
  repasse: number,
  ajustes: AquaAjustesSintese = {}
): AquaSinteseMes {
  const passantes = n(p.passantes);
  const anoAnt = n(p.passantes_ano_ant);
  const hospedes = n(p.hospedes);
  const ingressos = aplicar(passantes * n(p.ingresso_pax), ajustes.ingressos);
  const servicos = aplicar(passantes * n(p.servicos_passante), ajustes.servicos);
  const bar = aplicar((passantes + (params.bar_inclui_passantes_ano_ant ? anoAnt : 0) + hospedes) * n(p.bar_pax), ajustes.bar);
  const lanchonete = aplicar((passantes + hospedes) * n(p.lanchonete_pax), ajustes.lanchonete);
  const delta = passantes - anoAnt;
  const comissao_influencer = delta > 0 ? delta * n(p.ingresso_pax) * params.pct_influencer_base * params.pct_influencer : 0;
  const comissao_cartao = delta > 0 ? delta * n(p.ingresso_pax) * params.pct_comissao_cartao : 0;
  const rep = n(repasse);
  return {
    ingressos,
    servicos,
    bar,
    lanchonete,
    comissao_influencer: aplicar(comissao_influencer, ajustes.comissao_influencer),
    comissao_cartao: aplicar(comissao_cartao, ajustes.comissao_cartao),
    vale_alimentacao: aplicar(n(p.qtd_vale_alimentacao) * params.valor_vale_alimentacao, ajustes.vale_alimentacao),
    iss: aplicar((rep + ingressos) * params.aliq_iss, ajustes.iss),
    icms: aplicar((bar + lanchonete) * params.aliq_icms, ajustes.icms),
    pis: aplicar((rep + ingressos + bar + lanchonete) * params.aliq_pis, ajustes.pis),
    cofins: aplicar((rep + ingressos + bar + lanchonete) * params.aliq_cofins, ajustes.cofins),
    cmv: aplicar((bar + lanchonete) * params.pct_cmv, ajustes.cmv),
  };
}

export const REGRAS_SINTESE = new Set<string>([
  'ingressos',
  'servicos',
  'bar',
  'lanchonete',
  'comissao_influencer',
  'comissao_cartao',
  'vale_alimentacao',
  'iss',
  'icms',
  'pis',
  'cofins',
  'cmv',
]);

// ─── Quadro de Empregados ───────────────────────────────────────────────────

export type AquaCenario = 'baixa' | 'alta' | 'recreacao';

export type AquaVaga = {
  id?: number;
  cenario: AquaCenario;
  setor: string;
  cargo: string;
  nome?: string | null;
  ordem?: number;
  salario: number;
  adicional_fixo: number;
  recebe_quebra_caixa: boolean;
  premiacao: number;
  quantidade: number;
  encargos_zerados: boolean;
  sem_beneficios: boolean;
  beneficios_no_total: boolean;
  vale_transporte_fixo?: number | null;
};

export type AquaModoQuadro = 'planilha' | 'corrigido';

export type AquaCustoVaga = {
  salario: number;
  adicional: number;
  quebra_caixa: number;
  salario_adicionais: number;
  fgts: number;
  inss: number;
  decimo: number;
  fgts_13: number;
  inss_13: number;
  ferias: number;
  terco_ferias: number;
  fgts_ferias: number;
  inss_ferias: number;
  vale_transporte: number;
  total_encargos: number;
  premiacao: number;
  beneficio_assiduidade: number;
  beneficio_boas_praticas: number;
  /** Coluna TOTAL como a planilha calcula (salário + encargos; benefícios só quando a linha os soma). */
  total_planilha: number;
  /** Custo completo: salário + encargos + premiação + benefícios. */
  total_com_beneficios: number;
  alertas: string[];
};

/** Mesmas colunas e fórmulas do Quadro (B..S): FGTS/INSS também sobre 13º e férias + 1/3. */
export function calcularCustoVaga(v: AquaVaga, params: AquaParametros, modo: AquaModoQuadro = 'planilha'): AquaCustoVaga {
  const alertas: string[] = [];
  const salario = n(v.salario);
  const adicional = n(v.adicional_fixo);
  const quebra_caixa = v.recebe_quebra_caixa ? salario * params.pct_quebra_caixa : 0;
  const sa = salario + adicional + quebra_caixa;
  const fgts = sa * params.pct_fgts;
  const inss = sa * params.pct_inss;
  const decimo = sa * params.pct_13;
  const fgts_13 = decimo * params.pct_fgts;
  const inss_13 = decimo * params.pct_inss;
  const ferias = sa * params.pct_ferias;
  const terco_ferias = sa * params.pct_terco_ferias;
  const fgts_ferias = (ferias + terco_ferias) * params.pct_fgts;
  const inss_ferias = (ferias + terco_ferias) * params.pct_inss;

  const vtFixo = v.vale_transporte_fixo;
  let vale_transporte =
    vtFixo !== null && vtFixo !== undefined ? n(vtFixo) : params.vt_base - salario * params.vt_pct_desconto;
  if (vale_transporte < 0) alertas.push('VT negativo na planilha (salário acima do teto do desconto de 6%)');
  if (salario <= 0 && vale_transporte > 0) alertas.push('Vaga sem salário gera custo só de VT');
  if (modo === 'corrigido') {
    if (salario <= 0) vale_transporte = 0;
    vale_transporte = Math.max(0, vale_transporte);
  }

  let total_encargos =
    fgts + inss + decimo + fgts_13 + inss_13 + ferias + terco_ferias + fgts_ferias + inss_ferias + vale_transporte;
  if (v.encargos_zerados) {
    alertas.push('Encargos zerados manualmente na planilha');
    total_encargos = 0;
  }

  const premiacao = n(v.premiacao);
  const beneficio_assiduidade = v.sem_beneficios ? 0 : params.beneficio_assiduidade;
  const beneficio_boas_praticas = v.sem_beneficios ? 0 : params.beneficio_boas_praticas;
  const extras = premiacao + beneficio_assiduidade + beneficio_boas_praticas;

  return {
    salario,
    adicional,
    quebra_caixa,
    salario_adicionais: sa,
    fgts,
    inss,
    decimo,
    fgts_13,
    inss_13,
    ferias,
    terco_ferias,
    fgts_ferias,
    inss_ferias,
    vale_transporte,
    total_encargos,
    premiacao,
    beneficio_assiduidade,
    beneficio_boas_praticas,
    total_planilha: sa + total_encargos + (v.beneficios_no_total ? extras : 0),
    total_com_beneficios: sa + total_encargos + extras,
    alertas,
  };
}

export type AquaResumoSetor = {
  setor: string;
  quantidade: number;
  total_planilha: number;
  total_com_beneficios: number;
  beneficios: number;
};

export type AquaResumoQuadro = {
  setores: AquaResumoSetor[];
  quantidade: number;
  total_planilha: number;
  total_com_beneficios: number;
  beneficios: number;
  /** Total sem benefícios = custo completo − benefícios (a planilha subtrai benefícios que não somou). */
  total_sem_beneficios: number;
};

export function resumirQuadro(vagas: AquaVaga[], params: AquaParametros, modo: AquaModoQuadro = 'planilha'): AquaResumoQuadro {
  const porSetor = new Map<string, AquaResumoSetor>();
  for (const v of vagas) {
    const c = calcularCustoVaga(v, params, modo);
    const q = n(v.quantidade) || 0;
    const setor = v.setor || 'SEM SETOR';
    const s = porSetor.get(setor) ?? { setor, quantidade: 0, total_planilha: 0, total_com_beneficios: 0, beneficios: 0 };
    s.quantidade += q;
    s.total_planilha += c.total_planilha * q;
    s.total_com_beneficios += c.total_com_beneficios * q;
    s.beneficios += (c.beneficio_assiduidade + c.beneficio_boas_praticas) * q;
    porSetor.set(setor, s);
  }
  const setores = [...porSetor.values()];
  const sum = (k: keyof AquaResumoSetor) => setores.reduce((acc, s) => acc + (s[k] as number), 0);
  const total_com_beneficios = sum('total_com_beneficios');
  const beneficios = sum('beneficios');
  return {
    setores,
    quantidade: sum('quantidade'),
    total_planilha: sum('total_planilha'),
    total_com_beneficios,
    beneficios,
    total_sem_beneficios: total_com_beneficios - beneficios,
  };
}

// ─── Prev x Real ────────────────────────────────────────────────────────────

export type AquaBloco = 'FATURAMENTO' | 'DESPESAS' | 'IMP_FAT' | 'IMP_RES' | 'OBRAS' | 'CMV';

export const AQUA_BLOCOS: { bloco: AquaBloco; rotulo: string }[] = [
  { bloco: 'FATURAMENTO', rotulo: 'FATURAMENTO' },
  { bloco: 'DESPESAS', rotulo: 'DESPESAS TOTAIS' },
  { bloco: 'IMP_FAT', rotulo: 'IMPOSTOS S/ FATURAMENTO' },
  { bloco: 'IMP_RES', rotulo: 'IMPOSTOS S/ RESULTADO' },
  { bloco: 'OBRAS', rotulo: 'OBRAS E INVESTIMENTOS' },
  { bloco: 'CMV', rotulo: 'CONSUMO DE ALIMENTOS E BEBIDAS' },
];

export const REGRAS_PREVISTO = [
  'manual',
  'soma_filhos',
  'repasse_vivaz',
  'ingressos',
  'servicos',
  'bar',
  'lanchonete',
  'comissao_influencer',
  'comissao_cartao',
  'vale_alimentacao',
  'iss',
  'icms',
  'pis',
  'cofins',
  'csll',
  'irpj',
  'cmv',
  'folha_quadro',
] as const;

export const REGRAS_REALIZADO = [
  'manual',
  'soma_filhos',
  'crd',
  'vendas',
  'req_uso_consumo',
  'req_cmv',
  'req_grupo',
  'cmv_liquido',
  'folha',
] as const;

export type AquaRegraPrevisto = (typeof REGRAS_PREVISTO)[number];
export type AquaRegraRealizado = (typeof REGRAS_REALIZADO)[number];

export const DESCRICAO_REGRA_PREVISTO: Record<AquaRegraPrevisto, string> = {
  manual: 'Digitado',
  soma_filhos: 'Soma das linhas abaixo',
  repasse_vivaz: 'Repasse Vivaz (digitado / importado do Prev x Real do Vivaz)',
  ingressos: 'Passantes × ingresso/pax',
  servicos: 'Passantes × serviços/passante',
  bar: '(Passantes + passantes ano ant. + hóspedes) × bar/pax',
  lanchonete: '(Passantes + hóspedes) × lanchonete/pax',
  comissao_influencer: 'Se passantes > ano ant.: Δ × ingresso/pax × 50% × 15%',
  comissao_cartao: 'Se passantes > ano ant.: Δ × ingresso/pax × 6%',
  vale_alimentacao: 'Nº funcionários × valor do VA',
  iss: '(Repasse + Ingressos) × ISS',
  icms: '(Bar + Lanchonete) × ICMS',
  pis: '(Repasse + Ingressos + Bar + Lanchonete) × PIS',
  cofins: '(Repasse + Ingressos + Bar + Lanchonete) × COFINS',
  csll: 'Faturamento × CSLL',
  irpj: 'Faturamento × IRPJ',
  cmv: '(Bar + Lanchonete) × % CMV',
  folha_quadro: 'Quadro de Pessoal do cenário do mês (alta/baixa)',
};

export const DESCRICAO_REGRA_REALIZADO: Record<AquaRegraRealizado, string> = {
  manual: 'Digitado',
  soma_filhos: 'Soma das linhas abaixo',
  crd: 'Rel. CRD (SALDO LANÇ) pelo código da conta',
  vendas: 'Vendas por Ambiente (valor líquido)',
  req_uso_consumo: 'Requisições — Uso e Consumo do setor',
  req_cmv: 'Requisições — CMV do setor',
  req_grupo: 'Requisições — grupos de itens',
  cmv_liquido: 'Requisições CMV + Rel. CRD − Consumo interno',
  folha: 'Folha importada (custo total da apuração)',
};

export type AquaLinha = {
  id: number;
  parent_id: number | null;
  ordem: number;
  tipo: 'bloco' | 'grupo' | 'subgrupo' | 'conta' | 'centro_custo';
  rotulo: string;
  codigo_conta: string | null;
  bloco: AquaBloco;
  grupo: string | null;
  subgrupo: string | null;
  sintese_pessoal: 'Pessoal' | 'Extras' | 'Benefícios' | null;
  regra_previsto: AquaRegraPrevisto | string;
  regra_realizado: AquaRegraRealizado | string;
  chave_realizado: string | null;
  ativo: boolean;
};

export type AquaValorCelula = {
  /** Regra "manual": o valor; regras calculadas: substitui a fórmula quando preenchido. */
  previsto_manual: number | null;
  /** Somado ao previsto calculado. */
  ajuste_previsto?: number;
  ajuste_realizado: number;
  obs?: string | null;
};

/** Séries do realizado por chave normalizada → ym → valor. */
export type AquaFontesRealizado = {
  crd: Record<string, Record<string, number>>;
  vendas: Record<string, Record<string, number>>;
  reqUsoConsumo: Record<string, Record<string, number>>;
  reqCmv: Record<string, Record<string, number>>;
  reqGrupo: Record<string, Record<string, number>>;
  folha: Record<string, number>;
};

export const FONTES_VAZIAS: AquaFontesRealizado = { crd: {}, vendas: {}, reqUsoConsumo: {}, reqCmv: {}, reqGrupo: {}, folha: {} };

export const normalizarChave = (s: string) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();

/** Código entre parênteses no fim do rótulo: "ENERGIA (367)" → "367". */
export const codigoDoRotulo = (rotulo: string): string | null => {
  const m = String(rotulo ?? '').match(/\((\d{2,4})\)\s*$/);
  return m ? m[1] : null;
};

const splitChave = (chave: string | null) =>
  String(chave ?? '')
    .split(/[|;,]/)
    .map((s) => s.trim())
    .filter(Boolean);

export type AquaCelula = {
  previsto: number;
  realizado: number;
  diferenca: number;
  fonte: number;
  ajuste: number;
};

export type AquaLinhaResultado = {
  id: number | string;
  parent_id: number | string | null;
  depth: number;
  rotulo: string;
  tipo: string;
  bloco: AquaBloco | 'RESULTADO' | 'SINTESE';
  regra_previsto: string;
  regra_realizado: string;
  chave_realizado: string | null;
  tem_filhos: boolean;
  meses: Record<string, AquaCelula>;
  acumulado: { previsto: number; realizado: number; diferenca: number; pct: number | null };
};

export type AquaPrevRealEntrada = {
  meses: AquaMes[];
  acumulado: Set<string>;
  linhas: AquaLinha[];
  /** linha_id → ym → célula */
  valores: Record<number, Record<string, AquaValorCelula>>;
  premissas: Record<string, AquaPremissas>;
  parametros: AquaParametros;
  fontes: AquaFontesRealizado;
  /** ym → custo do quadro no cenário do mês (para a regra folha_quadro). */
  folhaQuadro?: Record<string, number>;
};

export type AquaPrevRealSaida = {
  meses: AquaMes[];
  linhas: AquaLinhaResultado[];
  sintese: Record<string, AquaSinteseMes>;
};

/**
 * Monta o Prev x Real (mesma árvore e totais da planilha):
 * RESULTADO = Faturamento − Despesas totais − Imp. s/ faturamento − Imp. s/ resultado − Obras − CMV.
 */
export function montarPrevReal(e: AquaPrevRealEntrada): AquaPrevRealSaida {
  const { meses, parametros } = e;
  const ativas = e.linhas.filter((l) => l.ativo !== false);
  const filhos = new Map<number | null, AquaLinha[]>();
  for (const l of ativas) {
    const k = l.parent_id ?? null;
    if (!filhos.has(k)) filhos.set(k, []);
    filhos.get(k)!.push(l);
  }
  for (const arr of filhos.values()) arr.sort((a, b) => a.ordem - b.ordem || a.id - b.id);

  const celula = (id: number, ym: string): AquaValorCelula =>
    e.valores[id]?.[ym] ?? { previsto_manual: null, ajuste_realizado: 0 };

  // Repasse do mês (necessário como base de ISS/PIS/COFINS)
  const linhaRepasse = ativas.find((l) => l.regra_previsto === 'repasse_vivaz');
  const linhasSintese = ativas.filter((l) => REGRAS_SINTESE.has(l.regra_previsto));
  const sintese: Record<string, AquaSinteseMes> = {};
  for (const m of meses) {
    const repasse = linhaRepasse ? n(celula(linhaRepasse.id, m.key).previsto_manual) : 0;
    const ajustes: AquaAjustesSintese = {};
    for (const l of linhasSintese) {
      const c = celula(l.id, m.key);
      if (c.previsto_manual === null && !n(c.ajuste_previsto)) continue;
      ajustes[l.regra_previsto as keyof AquaSinteseMes] = { substitui: c.previsto_manual, soma: n(c.ajuste_previsto) };
    }
    sintese[m.key] = calcularSintese(e.premissas[m.key] ?? PREMISSAS_VAZIAS, parametros, repasse, ajustes);
  }

  const raizBloco = new Map<AquaBloco, AquaLinha>();
  for (const l of filhos.get(null) ?? []) if (!raizBloco.has(l.bloco)) raizBloco.set(l.bloco, l);

  const memoPrev = new Map<string, number>();
  const prev = (l: AquaLinha, ym: string): number => {
    const k = `${l.id}|${ym}`;
    if (memoPrev.has(k)) return memoPrev.get(k)!;
    memoPrev.set(k, 0); // proteção contra ciclos
    const s = sintese[ym];
    const manual = celula(l.id, ym).previsto_manual;
    let v = 0;
    switch (l.regra_previsto) {
      case 'soma_filhos':
        v = (filhos.get(l.id) ?? []).reduce((acc, f) => acc + prev(f, ym), 0);
        break;
      case 'ingressos':
      case 'servicos':
      case 'bar':
      case 'lanchonete':
      case 'comissao_influencer':
      case 'comissao_cartao':
      case 'vale_alimentacao':
      case 'iss':
      case 'icms':
      case 'pis':
      case 'cofins':
      case 'cmv':
        v = s[l.regra_previsto];
        break;
      case 'csll':
      case 'irpj': {
        const fat = raizBloco.get('FATURAMENTO');
        const base = fat ? prev(fat, ym) : 0;
        v = aplicar(base * (l.regra_previsto === 'csll' ? parametros.aliq_csll : parametros.aliq_irpj), {
          substitui: manual,
          soma: celula(l.id, ym).ajuste_previsto,
        });
        break;
      }
      case 'folha_quadro':
        v = aplicar(n(e.folhaQuadro?.[ym]), { substitui: manual, soma: celula(l.id, ym).ajuste_previsto });
        break;
      default:
        v = n(manual);
    }
    memoPrev.set(k, v);
    return v;
  };

  const serie = (src: Record<string, Record<string, number>>, chaves: string[], ym: string) =>
    chaves.reduce((acc, c) => acc + n(src[normalizarChave(c)]?.[ym]), 0);

  const memoFonte = new Map<string, number>();
  const fonte = (l: AquaLinha, ym: string): number => {
    const k = `${l.id}|${ym}`;
    if (memoFonte.has(k)) return memoFonte.get(k)!;
    memoFonte.set(k, 0);
    const chaves = splitChave(l.chave_realizado);
    const f = e.fontes;
    let v = 0;
    switch (l.regra_realizado) {
      case 'soma_filhos':
        v = (filhos.get(l.id) ?? []).reduce((acc, c) => acc + real(c, ym), 0);
        break;
      case 'crd': {
        const codigos = chaves.length ? chaves : [l.codigo_conta ?? codigoDoRotulo(l.rotulo) ?? ''].filter(Boolean);
        v = serie(f.crd, codigos, ym);
        break;
      }
      case 'vendas':
        v = serie(f.vendas, chaves.length ? chaves : [l.rotulo], ym);
        break;
      case 'req_uso_consumo':
        v = serie(f.reqUsoConsumo, chaves.length ? chaves : [l.rotulo], ym);
        break;
      case 'req_cmv':
        v = serie(f.reqCmv, chaves.length ? chaves : [l.rotulo], ym);
        break;
      case 'req_grupo':
        v = serie(f.reqGrupo, chaves, ym);
        break;
      case 'cmv_liquido': {
        const total = Object.values(f.reqCmv).reduce((acc, s) => acc + n(s[ym]), 0);
        const crd = serie(f.crd, chaves, ym);
        const interno = serie(f.reqCmv, parametros.setores_consumo_interno, ym);
        v = total + crd - interno;
        break;
      }
      case 'folha':
        v = n(f.folha[ym]);
        break;
      default:
        v = 0;
    }
    memoFonte.set(k, v);
    return v;
  };
  const real = (l: AquaLinha, ym: string) => fonte(l, ym) + n(celula(l.id, ym).ajuste_realizado);

  const out: AquaLinhaResultado[] = [];
  const montarAcumulado = (cel: Record<string, AquaCelula>) => {
    let p = 0;
    let r = 0;
    for (const m of meses) {
      if (!e.acumulado.has(m.key)) continue;
      p += cel[m.key].previsto;
      r += cel[m.key].realizado;
    }
    return { previsto: p, realizado: r, diferenca: r - p, pct: p !== 0 ? (r - p) / p : null };
  };

  const visitar = (l: AquaLinha, depth: number) => {
    const cel: Record<string, AquaCelula> = {};
    for (const m of meses) {
      const previsto = prev(l, m.key);
      const fv = fonte(l, m.key);
      const ajuste = n(celula(l.id, m.key).ajuste_realizado);
      const realizado = fv + ajuste;
      cel[m.key] = { previsto, realizado, diferenca: realizado - previsto, fonte: fv, ajuste };
    }
    const kids = filhos.get(l.id) ?? [];
    out.push({
      id: l.id,
      parent_id: l.parent_id,
      depth,
      rotulo: l.rotulo,
      tipo: l.tipo,
      bloco: l.bloco,
      regra_previsto: l.regra_previsto,
      regra_realizado: l.regra_realizado,
      chave_realizado: l.chave_realizado,
      tem_filhos: kids.length > 0,
      meses: cel,
      acumulado: montarAcumulado(cel),
    });
    for (const k of kids) visitar(k, depth + 1);
  };

  // RESULTADO no topo
  const resultado: Record<string, AquaCelula> = {};
  for (const m of meses) {
    const calc = (fn: (l: AquaLinha, ym: string) => number) => {
      const v = (b: AquaBloco) => {
        const r = raizBloco.get(b);
        return r ? fn(r, m.key) : 0;
      };
      return v('FATURAMENTO') - v('DESPESAS') - v('IMP_FAT') - v('IMP_RES') - v('OBRAS') - v('CMV');
    };
    const previsto = calc(prev);
    const realizado = calc(real);
    resultado[m.key] = { previsto, realizado, diferenca: realizado - previsto, fonte: realizado, ajuste: 0 };
  }
  out.push({
    id: 'RESULTADO',
    parent_id: null,
    depth: 0,
    rotulo: 'RESULTADO',
    tipo: 'bloco',
    bloco: 'RESULTADO',
    regra_previsto: 'resultado',
    regra_realizado: 'resultado',
    chave_realizado: null,
    tem_filhos: false,
    meses: resultado,
    acumulado: montarAcumulado(resultado),
  });

  for (const raiz of filhos.get(null) ?? []) visitar(raiz, 0);

  // Síntese despesas com pessoal (Pessoal / Extras / Benefícios)
  const tags: Array<'Pessoal' | 'Extras' | 'Benefícios'> = ['Pessoal', 'Extras', 'Benefícios'];
  const porTag = tags.map((tag) => {
    const ls = ativas.filter((l) => l.sintese_pessoal === tag);
    const cel: Record<string, AquaCelula> = {};
    for (const m of meses) {
      const previsto = ls.reduce((acc, l) => acc + prev(l, m.key), 0);
      const realizado = ls.reduce((acc, l) => acc + real(l, m.key), 0);
      cel[m.key] = { previsto, realizado, diferenca: realizado - previsto, fonte: realizado, ajuste: 0 };
    }
    return { tag, cel };
  });
  if (porTag.some((t) => ativas.some((l) => l.sintese_pessoal === t.tag))) {
    const total: Record<string, AquaCelula> = {};
    for (const m of meses) {
      const previsto = porTag.reduce((acc, t) => acc + t.cel[m.key].previsto, 0);
      const realizado = porTag.reduce((acc, t) => acc + t.cel[m.key].realizado, 0);
      total[m.key] = { previsto, realizado, diferenca: realizado - previsto, fonte: realizado, ajuste: 0 };
    }
    const base = { tipo: 'grupo', bloco: 'SINTESE' as const, regra_previsto: 'sintese', regra_realizado: 'sintese', chave_realizado: null };
    out.push({ ...base, id: 'SINTESE_PESSOAL', parent_id: null, depth: 0, rotulo: 'SÍNTESE DESPESAS COM PESSOAL', tem_filhos: true, meses: total, acumulado: montarAcumulado(total) });
    for (const t of porTag) {
      out.push({ ...base, tipo: 'conta', id: `SINTESE_${t.tag}`, parent_id: 'SINTESE_PESSOAL', depth: 1, rotulo: t.tag, tem_filhos: false, meses: t.cel, acumulado: montarAcumulado(t.cel) });
    }
  }

  return { meses, linhas: out, sintese };
}
