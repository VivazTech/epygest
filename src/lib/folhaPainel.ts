/** Painel consolidado de custos e indicadores de RH. */

export type FolhaPainelComponente = {
  key: string;
  label: string;
  valor: number;
  pct: number;
};

export type FolhaPainelSetorResumo = {
  setor: string;
  setor_codigo?: string | null;
  orcado: number;
  realizado: number;
  diferenca: number;
  pct_diferenca: number | null;
  acima_orcamento: boolean;
  status_label: string;
  funcionarios: number;
};

export type FolhaPainelFuncionarioDetalhe = {
  codigo_funcionario: string;
  nome: string;
  orcado: number;
  realizado: number;
  diferenca: number;
  pct_diferenca: number | null;
  acima_orcamento: boolean;
  status_label: string;
  peso_salarial: number;
};

export type FolhaPainelDrilldown = {
  setor: string;
  funcionarios: FolhaPainelFuncionarioDetalhe[];
};

export type { FolhaComposicaoCusto, FolhaComposicaoLinha, FolhaComposicaoItem } from './folhaComposicao.js';
export type { TaxaServicoAnalise } from './folhaTaxaServico.js';
export type { FgtsAnalise, FgtsComponente } from './folhaFgts.js';

export type FolhaPainelFiltroSetor = {
  nome: string;
  codigo?: string | null;
};

export type FolhaPainelResponse = {
  year: number;
  month: number;
  empresa: string | null;
  setor: string | null;
  filtros: {
    empresas: string[];
    setores: FolhaPainelFiltroSetor[];
  };
  orcado: number;
  realizado: number;
  diferenca: number;
  pct_diferenca: number | null;
  acima_orcamento: boolean;
  status_label: string;
  drilldown: FolhaPainelDrilldown | null;
  componentes: FolhaPainelComponente[];
  composicao: import('./folhaComposicao.js').FolhaComposicaoCusto | null;
  taxa_servico: import('./folhaTaxaServico.js').TaxaServicoAnalise | null;
  fgts: import('./folhaFgts.js').FgtsAnalise | null;
  setores_resumo: FolhaPainelSetorResumo[];
  indicadores: {
    funcionarios: number;
    trabalhando: number;
    custo_medio: number;
    apuracao_calculada: boolean;
    importado: boolean;
  };
  fontes: {
    orcado: string;
    realizado: string;
    setor?: string;
  };
  sem_setor?: number;
};

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const normalizeFolhaFilterText = (v: string) =>
  String(v ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

export const matchFolhaSetor = (setorNome: string, filtro: string) => {
  const a = normalizeFolhaFilterText(setorNome);
  const b = normalizeFolhaFilterText(filtro);
  return a === b || a.includes(b) || b.includes(a);
};

export type SetorAgg = {
  setor: string;
  total_salario: number;
  funcionarios: Set<string>;
};

export const aggregateLancamentosPorSetor = (lancamentos: any[]): Map<string, SetorAgg> => {
  const map = new Map<string, SetorAgg>();
  for (const l of lancamentos) {
    const setor = String(l.setor_nome || 'Sem setor').trim() || 'Sem setor';
    const mat = String(l.codigo_funcionario || '').trim();
    const g =
      map.get(setor) ||
      ({
        setor,
        total_salario: 0,
        funcionarios: new Set<string>(),
      } as SetorAgg);
    g.total_salario +=
      num(l.valor_provento) + num(l.valor_comissao) + num(l.valor_produtividade) - num(l.valor_retorno);
    if (mat) g.funcionarios.add(mat);
    map.set(setor, g);
  }
  return map;
};

export const allocateValorPorSetor = (
  setorStats: Map<string, SetorAgg>,
  totalValor: number,
  totalSalarioGlobal: number
): Map<string, number> => {
  const result = new Map<string, number>();
  if (!totalSalarioGlobal) {
    for (const [setor] of setorStats) result.set(setor, 0);
    return result;
  }
  for (const [setor, stats] of setorStats) {
    result.set(setor, (stats.total_salario / totalSalarioGlobal) * totalValor);
  }
  return result;
};

export const buildStatusLabel = (diferenca: number) => {
  if (Math.abs(diferenca) < 0.01) return 'NO ORÇAMENTO';
  return diferenca > 0 ? 'ACIMA DO ORÇAMENTO' : 'ABAIXO DO ORÇAMENTO';
};

/** Percentual do desvio sobre o orçado: (Realizado − Orçado) / Orçado × 100 */
export const calcPctDesvio = (orcado: number, diferenca: number): number | null => {
  if (!orcado || Math.abs(orcado) < 0.01) return null;
  return (diferenca / orcado) * 100;
};

export const enrichDesvio = (orcado: number, realizado: number) => {
  const diferenca = realizado - orcado;
  return {
    orcado,
    realizado,
    diferenca,
    pct_diferenca: calcPctDesvio(orcado, diferenca),
    acima_orcamento: diferenca > 0.009,
    status_label: buildStatusLabel(diferenca),
  };
};

export const componentesFromApuracao = (ap: Record<string, unknown>, scale = 1): FolhaPainelComponente[] => {
  const raw = [
    { key: 'total_salario', label: 'Salários', valor: num(ap.total_salario) * scale },
    { key: 'total_comissao', label: 'Comissões', valor: num(ap.total_comissao) * scale },
    { key: 'total_produtividade', label: 'Produtividade', valor: num(ap.total_produtividade) * scale },
    { key: 'provisao_13', label: 'Provisão 13º', valor: num(ap.provisao_13) * scale },
    { key: 'provisao_ferias', label: 'Provisão férias', valor: num(ap.provisao_ferias) * scale },
    { key: 'provisao_um_terco_ferias', label: 'Provisão 1/3 férias', valor: num(ap.provisao_um_terco_ferias) * scale },
    { key: 'fgts', label: 'FGTS', valor: num(ap.fgts) * scale },
    { key: 'fgts_provisao_ferias', label: 'FGTS prov. férias', valor: num(ap.fgts_provisao_ferias) * scale },
    { key: 'fgts_provisao_13', label: 'FGTS prov. 13º', valor: num(ap.fgts_provisao_13) * scale },
    { key: 'inss', label: 'INSS', valor: num(ap.inss) * scale },
    { key: 'inss_13', label: 'INSS 13º', valor: num(ap.inss_13) * scale },
    { key: 'inss_provisao_ferias', label: 'INSS prov. férias', valor: num(ap.inss_provisao_ferias) * scale },
    { key: 'total_retorno', label: 'Retornos', valor: -Math.abs(num(ap.total_retorno) * scale) },
  ].filter((item) => Math.abs(item.valor) >= 0.01);

  const totalPositivo = raw.reduce((s, item) => s + Math.max(0, item.valor), 0);
  return raw.map((item) => ({
    ...item,
    pct: totalPositivo ? (Math.max(0, item.valor) / totalPositivo) * 100 : 0,
  }));
};

export const componentesFromCustoLinhas = (
  linhas: Array<{ key: string; label: string; valor: number }>,
  scale = 1
): FolhaPainelComponente[] => {
  const raw = linhas
    .filter((l) => l.key !== 'total_custo' && l.key !== 'total_salario' && Math.abs(num(l.valor)) >= 0.01)
    .map((l) => ({
      key: l.key,
      label: l.label,
      valor: num(l.valor) * scale,
    }));
  const totalPositivo = raw.reduce((s, item) => s + Math.max(0, item.valor), 0);
  return raw.map((item) => ({
    ...item,
    pct: totalPositivo ? (Math.max(0, item.valor) / totalPositivo) * 100 : 0,
  }));
};

export const resolveSectorMonthlyBudget = (budgetLimit: number) => num(budgetLimit);
