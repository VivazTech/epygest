// Réplica das fórmulas da planilha "Apuração do CMV" (Vivaz Cataratas).
// Guardamos apenas os valores digitados (CmvInputs) e derivamos aqui todos os
// indicadores, exatamente como as fórmulas das abas mensais e da aba
// "CMV SINTETICO RESULTADO MENSAL".

export const MESES_CMV = [
  '', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

/** Campos digitados por competência (fechamento do mês). */
export interface CmvInputs {
  venda_direta_total: number;
  venda_direta_bebidas: number;
  cafe_manha_pensao: number;
  cafe_manha_chds: number;
  almoco_jantar_pensao: number;
  almoco_jantar_chds: number;
  almoco_jantar_antec: number;
  ci_total: number;
  ci_bebidas: number;
  requisicoes_total: number;
  requisicoes_bebidas: number;
  refeitorio: number;
  outros: number;
  aquamania: number;
  limite_pct: number;
}

export const CMV_INPUT_KEYS: (keyof CmvInputs)[] = [
  'venda_direta_total',
  'venda_direta_bebidas',
  'cafe_manha_pensao',
  'cafe_manha_chds',
  'almoco_jantar_pensao',
  'almoco_jantar_chds',
  'almoco_jantar_antec',
  'ci_total',
  'ci_bebidas',
  'requisicoes_total',
  'requisicoes_bebidas',
  'refeitorio',
  'outros',
  'aquamania',
  'limite_pct',
];

export const emptyCmvInputs = (): CmvInputs => ({
  venda_direta_total: 0,
  venda_direta_bebidas: 0,
  cafe_manha_pensao: 0,
  cafe_manha_chds: 0,
  almoco_jantar_pensao: 0,
  almoco_jantar_chds: 0,
  almoco_jantar_antec: 0,
  ci_total: 0,
  ci_bebidas: 0,
  requisicoes_total: 0,
  requisicoes_bebidas: 0,
  refeitorio: 0,
  outros: 0,
  aquamania: 0,
  limite_pct: 0.29,
});

/** Normaliza uma linha vinda da API para CmvInputs (números seguros). */
export const toCmvInputs = (row: Partial<Record<keyof CmvInputs, any>> | null | undefined): CmvInputs => {
  const base = emptyCmvInputs();
  if (!row) return base;
  const num = (v: any, fallback: number) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
  for (const key of CMV_INPUT_KEYS) {
    if (key === 'limite_pct') base[key] = num(row[key], 0.29);
    else base[key] = num(row[key], 0);
  }
  return base;
};

export interface CmvDerived {
  /** CMV A&B — receitas */
  venda_ab: number;
  cafe_manha: number;
  pensao: number;
  consumo_interno: number;
  receita_considerada: number;
  /** CMV A&B — custos */
  custo_alimentos: number;
  custo_bebidas: number;
  outros_custos_cmv: number;
  custo_ab: number;
  /** Detalhes legados / apoio */
  venda_direta_alimentos: number;
  ci_alimentos: number;
  receita_total: number;
  ci_pct_receita: number;
  requisicoes_alimentos: number;
  requisicoes_cmv: number;
  cmv_apurado: number;
  cmv_alimentos: number;
  cmv_bebidas: number;
  vlr_cmv_sobre_vendas: number;
  cmv_sobre_ci: number;
  cmv_limite_valor: number;
  economia: number;
}

const safeDiv = (a: number, b: number) => (b === 0 ? 0 : a / b);

/** Calcula os indicadores derivados de uma competência. */
export const computeCmv = (i: CmvInputs): CmvDerived => {
  const venda_ab = i.venda_direta_total;
  const cafe_manha = i.cafe_manha_pensao + i.cafe_manha_chds;
  const pensao = i.almoco_jantar_pensao + i.almoco_jantar_chds + i.almoco_jantar_antec;
  const consumo_interno = i.ci_total;
  const receita_considerada = venda_ab + cafe_manha + pensao + consumo_interno;

  const requisicoes_alimentos = i.requisicoes_total - i.requisicoes_bebidas;
  const custo_alimentos = requisicoes_alimentos - i.refeitorio - i.outros - i.aquamania;
  const custo_bebidas = i.requisicoes_bebidas;
  const outros_custos_cmv = i.refeitorio + i.outros + i.aquamania;
  const custo_ab = custo_alimentos + custo_bebidas + outros_custos_cmv;

  const venda_direta_alimentos = i.venda_direta_total - i.venda_direta_bebidas;
  const ci_alimentos = i.ci_total - i.ci_bebidas;
  const receita_total = receita_considerada;
  const ci_pct_receita = safeDiv(i.ci_total, receita_considerada);
  const requisicoes_cmv = i.requisicoes_total - i.refeitorio - i.outros - i.aquamania;
  const cmv_apurado = safeDiv(custo_ab, receita_considerada);
  const cmv_alimentos = safeDiv(
    custo_alimentos,
    venda_direta_alimentos + cafe_manha + pensao + ci_alimentos
  );
  const cmv_bebidas = safeDiv(i.requisicoes_bebidas, i.venda_direta_bebidas + i.ci_bebidas);
  const vlr_cmv_sobre_vendas = (receita_considerada - i.ci_total) * cmv_apurado;
  const cmv_sobre_ci = i.ci_total * cmv_apurado;
  const cmv_limite_valor = receita_considerada * i.limite_pct;
  const economia = cmv_limite_valor - custo_ab;

  return {
    venda_ab,
    cafe_manha,
    pensao,
    consumo_interno,
    receita_considerada,
    custo_alimentos,
    custo_bebidas,
    outros_custos_cmv,
    custo_ab,
    venda_direta_alimentos,
    ci_alimentos,
    receita_total,
    ci_pct_receita,
    requisicoes_alimentos,
    requisicoes_cmv,
    cmv_apurado,
    cmv_alimentos,
    cmv_bebidas,
    vlr_cmv_sobre_vendas,
    cmv_sobre_ci,
    cmv_limite_valor,
    economia,
  };
};

export interface CmvMonthData {
  month: number;
  importado: boolean;
  inputs: CmvInputs;
  derived: CmvDerived;
}

export interface CmvSintetico {
  venda_ab: number;
  cafe_manha: number;
  pensao: number;
  consumo_interno: number;
  receita_considerada: number;
  custo_alimentos: number;
  custo_bebidas: number;
  outros_custos_cmv: number;
  custo_ab: number;
  // Somatórios anuais dos campos digitados / valores.
  venda_direta_total: number;
  venda_direta_alimentos: number;
  venda_direta_bebidas: number;
  cafe_manha_pensao: number;
  cafe_manha_chds: number;
  almoco_jantar_pensao: number;
  almoco_jantar_chds: number;
  almoco_jantar_antec: number;
  ci_total: number;
  ci_alimentos: number;
  ci_bebidas: number;
  receita_total: number;
  requisicoes_total: number;
  requisicoes_alimentos: number;
  requisicoes_bebidas: number;
  refeitorio: number;
  outros: number;
  aquamania: number;
  requisicoes_cmv: number;
  vlr_cmv_sobre_vendas: number;
  cmv_sobre_ci: number;
  cmv_limite_valor: number;
  economia: number;
  // Índices anuais recalculados a partir dos somatórios (coluna N da aba sintética).
  ci_pct_receita: number;
  cmv_apurado: number;
  cmv_alimentos: number;
  cmv_bebidas: number;
  economia_pct: number;
}

/** Consolida os 12 meses como a aba "CMV SINTETICO RESULTADO MENSAL" (coluna N). */
export const computeSintetico = (months: CmvMonthData[]): CmvSintetico => {
  const s: CmvSintetico = {
    venda_ab: 0,
    cafe_manha: 0,
    pensao: 0,
    consumo_interno: 0,
    receita_considerada: 0,
    custo_alimentos: 0,
    custo_bebidas: 0,
    outros_custos_cmv: 0,
    custo_ab: 0,
    venda_direta_total: 0,
    venda_direta_alimentos: 0,
    venda_direta_bebidas: 0,
    cafe_manha_pensao: 0,
    cafe_manha_chds: 0,
    almoco_jantar_pensao: 0,
    almoco_jantar_chds: 0,
    almoco_jantar_antec: 0,
    ci_total: 0,
    ci_alimentos: 0,
    ci_bebidas: 0,
    receita_total: 0,
    requisicoes_total: 0,
    requisicoes_alimentos: 0,
    requisicoes_bebidas: 0,
    refeitorio: 0,
    outros: 0,
    aquamania: 0,
    requisicoes_cmv: 0,
    vlr_cmv_sobre_vendas: 0,
    cmv_sobre_ci: 0,
    cmv_limite_valor: 0,
    economia: 0,
    ci_pct_receita: 0,
    cmv_apurado: 0,
    cmv_alimentos: 0,
    cmv_bebidas: 0,
    economia_pct: 0,
  };

  for (const m of months) {
    const i = m.inputs;
    const d = m.derived;
    s.venda_ab += d.venda_ab;
    s.cafe_manha += d.cafe_manha;
    s.pensao += d.pensao;
    s.consumo_interno += d.consumo_interno;
    s.receita_considerada += d.receita_considerada;
    s.custo_alimentos += d.custo_alimentos;
    s.custo_bebidas += d.custo_bebidas;
    s.outros_custos_cmv += d.outros_custos_cmv;
    s.custo_ab += d.custo_ab;
    s.venda_direta_total += i.venda_direta_total;
    s.venda_direta_alimentos += d.venda_direta_alimentos;
    s.venda_direta_bebidas += i.venda_direta_bebidas;
    s.cafe_manha_pensao += i.cafe_manha_pensao;
    s.cafe_manha_chds += i.cafe_manha_chds;
    s.almoco_jantar_pensao += i.almoco_jantar_pensao;
    s.almoco_jantar_chds += i.almoco_jantar_chds;
    s.almoco_jantar_antec += i.almoco_jantar_antec;
    s.ci_total += i.ci_total;
    s.ci_alimentos += d.ci_alimentos;
    s.ci_bebidas += i.ci_bebidas;
    s.receita_total += d.receita_total;
    s.requisicoes_total += i.requisicoes_total;
    s.requisicoes_alimentos += d.requisicoes_alimentos;
    s.requisicoes_bebidas += i.requisicoes_bebidas;
    s.refeitorio += i.refeitorio;
    s.outros += i.outros;
    s.aquamania += i.aquamania;
    s.requisicoes_cmv += d.requisicoes_cmv;
    s.vlr_cmv_sobre_vendas += d.vlr_cmv_sobre_vendas;
    s.cmv_sobre_ci += d.cmv_sobre_ci;
    s.cmv_limite_valor += d.cmv_limite_valor;
    s.economia += d.economia;
  }

  // Índices anuais recalculados dos somatórios (não é média das colunas).
  s.ci_pct_receita = safeDiv(s.ci_total, s.receita_considerada);
  s.cmv_apurado = safeDiv(s.custo_ab, s.receita_considerada);
  s.cmv_alimentos = safeDiv(
    s.custo_alimentos,
    s.venda_direta_alimentos + s.cafe_manha + s.pensao + s.ci_alimentos
  );
  s.cmv_bebidas = safeDiv(s.requisicoes_bebidas, s.venda_direta_bebidas + s.ci_bebidas);
  s.economia_pct = safeDiv(s.economia, s.receita_considerada);

  return s;
};

export const isCmvTab = (tab: string) =>
  tab === 'cmv' || tab === 'cmv-tarifas' || /^cmv-\d+$/.test(tab);
