/** Análise da taxa de serviço na folha — crédito, custo, encargos e impacto no desvio. */

import { classifyRubricaComposicao, type FolhaComposicaoItem } from './folhaComposicao.js';
import type { EncargosParametro } from './folhaApuracao.js';

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export type TaxaServicoRubrica = {
  codigo?: string;
  nome: string;
  valor: number;
};

export type TaxaServicoIncidencias = {
  inss: number;
  inss_13: number;
  inss_prov_ferias: number;
  fgts: number;
  fgts_prov_ferias: number;
  fgts_prov_13: number;
  provisao_13: number;
  provisao_ferias: number;
  provisao_um_terco: number;
  encargos_total: number;
  provisoes_total: number;
};

export type TaxaServicoAnalise = {
  /** Valor bruto pago na folha (rubricas taxa de serviço). */
  realizado_bruto: number;
  /** Crédito/arrecadação da taxa (RDS Hospedagem › TAXA DE SERVICO). */
  credito_rds: number | null;
  credito_fonte: string;
  /** Custo orçado da parcela taxa (tabela mensal ou proporcional ao orçado da folha). */
  orcado_bruto: number;
  orcado_fonte: string;
  /** Encargos e provisões incidentes sobre a taxa. */
  incidencias_realizado: TaxaServicoIncidencias;
  incidencias_orcado: TaxaServicoIncidencias;
  /** Bruto + encargos + provisões. */
  custo_realizado: number;
  custo_orcado: number;
  diferenca_custo: number;
  pct_diferenca_custo: number | null;
  /** Quanto do desvio total Orçado×Realizado da folha é explicado pela taxa. */
  impacto_no_desvio_folha: number;
  pct_impacto_desvio_folha: number | null;
  /** Desvio da folha não explicado pela taxa. */
  desvio_restante: number;
  rubricas: TaxaServicoRubrica[];
  composicao_realizado: Array<{ key: string; label: string; valor: number }>;
  composicao_orcado: Array<{ key: string; label: string; valor: number }>;
};

export const extractTaxaServicoRubricas = (
  rubricas: Array<{ codigo?: string; nome?: string; valor?: number; tipo?: string }>,
  scale = 1
): { total: number; itens: TaxaServicoRubrica[] } => {
  const itens: TaxaServicoRubrica[] = [];
  let total = 0;
  for (const rb of rubricas) {
    const cat = classifyRubricaComposicao(String(rb.nome ?? ''), String(rb.tipo ?? ''));
    if (cat !== 'taxa_servico') continue;
    const valor = num(rb.valor) * scale;
    if (Math.abs(valor) < 0.01) continue;
    total += valor;
    itens.push({
      codigo: rb.codigo ? String(rb.codigo) : undefined,
      nome: String(rb.nome ?? rb.codigo ?? 'Taxa de serviço'),
      valor,
    });
  }
  return { total, itens };
};

/** Calcula encargos/provisões sobre uma base salarial (mesma fórmula da apuração). */
export const calcIncidenciasSobreBase = (
  base: number,
  encargos: EncargosParametro
): TaxaServicoIncidencias => {
  if (base <= 0) {
    return {
      inss: 0,
      inss_13: 0,
      inss_prov_ferias: 0,
      fgts: 0,
      fgts_prov_ferias: 0,
      fgts_prov_13: 0,
      provisao_13: 0,
      provisao_ferias: 0,
      provisao_um_terco: 0,
      encargos_total: 0,
      provisoes_total: 0,
    };
  }
  const pct13 = num(encargos.percentual_provisao_13) || 1 / 12;
  const pctFerias = num(encargos.percentual_provisao_ferias) || 1 / 12;
  const pctUmTerco = num(encargos.percentual_um_terco_ferias) || 1 / 3;
  const pctFgts = num(encargos.percentual_fgts);
  const pctInss = num(encargos.percentual_inss);

  const provisao_13 = base * pct13;
  const provisao_ferias = base * pctFerias;
  const provisao_um_terco = provisao_ferias * pctUmTerco;
  const fgts = base * pctFgts;
  const fgts_prov_ferias = (provisao_ferias + provisao_um_terco) * pctFgts;
  const fgts_prov_13 = provisao_13 * pctFgts;
  const inss = base * pctInss;
  const inss_13 = provisao_13 * pctInss;
  const inss_prov_ferias = (provisao_ferias + provisao_um_terco) * pctInss;

  const encargos_total = inss + inss_13 + inss_prov_ferias + fgts + fgts_prov_ferias + fgts_prov_13;
  const provisoes_total = provisao_13 + provisao_ferias + provisao_um_terco;

  return {
    inss,
    inss_13,
    inss_prov_ferias,
    fgts,
    fgts_prov_ferias,
    fgts_prov_13,
    provisao_13,
    provisao_ferias,
    provisao_um_terco,
    encargos_total,
    provisoes_total,
  };
};

/** Rateia encargos da apuração proporcionalmente à participação da taxa no salário. */
export const ratearIncidenciasApuracao = (
  taxaBruta: number,
  apuracao: Record<string, unknown>,
  scale = 1
): TaxaServicoIncidencias => {
  const totalSalario = num(apuracao.total_salario) * scale;
  const share = totalSalario > 0 ? taxaBruta / totalSalario : 0;
  if (share <= 0) {
    return calcIncidenciasSobreBase(0, {
      ano: 0,
      percentual_fgts: 0,
      percentual_inss: 0,
      percentual_provisao_13: 0,
      percentual_provisao_ferias: 0,
      percentual_um_terco_ferias: 0,
    });
  }
  const provisao_13 = num(apuracao.provisao_13) * scale * share;
  const provisao_ferias = num(apuracao.provisao_ferias) * scale * share;
  const provisao_um_terco = num(apuracao.provisao_um_terco_ferias) * scale * share;
  const fgts = num(apuracao.fgts) * scale * share;
  const fgts_prov_ferias = num(apuracao.fgts_provisao_ferias) * scale * share;
  const fgts_prov_13 = num(apuracao.fgts_provisao_13) * scale * share;
  const inss = num(apuracao.inss) * scale * share;
  const inss_13 = num(apuracao.inss_13) * scale * share;
  const inss_prov_ferias = num(apuracao.inss_provisao_ferias) * scale * share;
  const encargos_total = inss + inss_13 + inss_prov_ferias + fgts + fgts_prov_ferias + fgts_prov_13;
  const provisoes_total = provisao_13 + provisao_ferias + provisao_um_terco;
  return {
    inss,
    inss_13,
    inss_prov_ferias,
    fgts,
    fgts_prov_ferias,
    fgts_prov_13,
    provisao_13,
    provisao_ferias,
    provisao_um_terco,
    encargos_total,
    provisoes_total,
  };
};

const normalizeRdsLabel = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ');

/** Extrai crédito da taxa de serviço do snapshot RDS (Hospedagem › TAXA DE SERVICO). */
export const extractCreditoTaxaRds = (sections: unknown): number | null => {
  const RDS_ACUMULADO_IDX = 2;
  const list = Array.isArray(sections) ? sections : [];
  const section = list.find((s: any) => String(s?.key ?? '') === 'hospedagem');
  if (!section || !Array.isArray((section as any).items)) return null;
  const wanted = normalizeRdsLabel('TAXA DE SERVICO');
  for (const item of (section as any).items) {
    if (normalizeRdsLabel(item?.label) !== wanted) continue;
    const acumulado = Number(Array.isArray(item?.values) ? item.values[RDS_ACUMULADO_IDX] : 0) || 0;
    return acumulado > 0 ? acumulado : null;
  }
  return null;
};

const linhasComposicao = (
  bruto: number,
  inc: TaxaServicoIncidencias
): Array<{ key: string; label: string; valor: number }> =>
  [
    { key: 'bruto', label: 'Taxa de serviço (bruto)', valor: bruto },
    { key: 'encargos', label: 'Encargos incidentes', valor: inc.encargos_total },
    { key: 'inss', label: 'INSS', valor: inc.inss },
    { key: 'inss_13', label: 'INSS 13º', valor: inc.inss_13 },
    { key: 'inss_prov', label: 'INSS prov. férias', valor: inc.inss_prov_ferias },
    { key: 'fgts', label: 'FGTS', valor: inc.fgts },
    { key: 'fgts_prov_f', label: 'FGTS prov. férias', valor: inc.fgts_prov_ferias },
    { key: 'fgts_prov_13', label: 'FGTS prov. 13º', valor: inc.fgts_prov_13 },
    { key: 'provisoes', label: 'Provisões incidentes', valor: inc.provisoes_total },
    { key: 'prov_13', label: 'Provisão 13º', valor: inc.provisao_13 },
    { key: 'prov_ferias', label: 'Provisão férias', valor: inc.provisao_ferias },
    { key: 'prov_terco', label: 'Provisão 1/3 férias', valor: inc.provisao_um_terco },
  ].filter((l) => Math.abs(l.valor) >= 0.01);

export type BuildTaxaServicoInput = {
  rubricas?: Array<{ codigo?: string; nome?: string; valor?: number; tipo?: string }>;
  apuracao?: Record<string, unknown> | null;
  encargos?: EncargosParametro | null;
  orcadoFolha: number;
  realizadoFolha: number;
  diferencaFolha: number;
  orcadoTaxaBruto?: number | null;
  creditoRds?: number | null;
  creditoRdsOverride?: number | null;
  scale?: number;
};

export const buildTaxaServicoAnalise = (input: BuildTaxaServicoInput): TaxaServicoAnalise | null => {
  const scale = input.scale ?? 1;
  const { total: realizado_bruto, itens: rubricas } = extractTaxaServicoRubricas(input.rubricas ?? [], scale);

  if (realizado_bruto <= 0 && !input.orcadoTaxaBruto) return null;

  const encargosDefault: EncargosParametro = {
    ano: new Date().getFullYear(),
    percentual_fgts: 0.08,
    percentual_inss: 0.2,
    percentual_provisao_13: 1 / 12,
    percentual_provisao_ferias: 1 / 12,
    percentual_um_terco_ferias: 1 / 3,
  };
  const encargos = input.encargos ?? encargosDefault;

  const incidencias_realizado =
    input.apuracao && num(input.apuracao.total_salario) > 0
      ? ratearIncidenciasApuracao(realizado_bruto, input.apuracao, scale)
      : calcIncidenciasSobreBase(realizado_bruto, encargos);

  const custo_realizado =
    realizado_bruto + incidencias_realizado.encargos_total + incidencias_realizado.provisoes_total;

  let orcado_bruto = num(input.orcadoTaxaBruto) * scale;
  let orcado_fonte = 'Cadastro mensal (folha_taxa_servico_mensal)';
  if (!orcado_bruto && input.orcadoFolha > 0 && custo_realizado > 0 && input.realizadoFolha > 0) {
    const shareCusto = custo_realizado / input.realizadoFolha;
    orcado_bruto = input.orcadoFolha * shareCusto;
    orcado_fonte = 'Proporcional ao orçado da folha (mesma participação da taxa no custo realizado)';
  } else if (!orcado_bruto && input.apuracao && num(input.apuracao.total_salario) > 0) {
    const shareSal = realizado_bruto / (num(input.apuracao.total_salario) * scale);
    orcado_bruto = input.orcadoFolha * shareSal;
    orcado_fonte = 'Proporcional ao orçado da folha (participação da taxa no salário)';
  }

  const incidencias_orcado = calcIncidenciasSobreBase(orcado_bruto, encargos);
  const custo_orcado =
    orcado_bruto + incidencias_orcado.encargos_total + incidencias_orcado.provisoes_total;

  const diferenca_custo = custo_realizado - custo_orcado;
  const pct_diferenca_custo = custo_orcado > 0 ? (diferenca_custo / custo_orcado) * 100 : null;

  const impacto_no_desvio_folha = diferenca_custo;
  const pct_impacto_desvio_folha =
    Math.abs(input.diferencaFolha) > 0.01 ? (impacto_no_desvio_folha / input.diferencaFolha) * 100 : null;
  const desvio_restante = input.diferencaFolha - impacto_no_desvio_folha;

  const credito_rds =
    input.creditoRdsOverride != null && input.creditoRdsOverride > 0
      ? input.creditoRdsOverride
      : input.creditoRds ?? null;

  return {
    realizado_bruto,
    credito_rds,
    credito_fonte: credito_rds
      ? input.creditoRdsOverride != null
        ? 'Cadastro mensal (override)'
        : 'RDS › Hospedagem › TAXA DE SERVICO (Acumulado R$)'
      : 'RDS não importado para a competência',
    orcado_bruto,
    orcado_fonte,
    incidencias_realizado,
    incidencias_orcado,
    custo_realizado,
    custo_orcado,
    diferenca_custo,
    pct_diferenca_custo,
    impacto_no_desvio_folha,
    pct_impacto_desvio_folha,
    desvio_restante,
    rubricas,
    composicao_realizado: linhasComposicao(realizado_bruto, incidencias_realizado),
    composicao_orcado: linhasComposicao(orcado_bruto, incidencias_orcado),
  };
};
