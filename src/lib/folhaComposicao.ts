/** Composição hierárquica do custo da folha — drill-down para o painel RH. */

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export type FolhaComposicaoItem = {
  codigo?: string;
  nome: string;
  valor: number;
};

export type FolhaComposicaoLinha = {
  key: string;
  label: string;
  valor: number;
  pct: number;
  tipo: 'grupo' | 'item' | 'total';
  children?: FolhaComposicaoLinha[];
  itens?: FolhaComposicaoItem[];
};

export type FolhaComposicaoCusto = {
  total_custo: number;
  grupos: FolhaComposicaoLinha[];
  fonte: string;
};

const normNome = (nome: string) =>
  String(nome ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

/** Classifica rubrica do extrato para composição do custo. */
export const classifyRubricaComposicao = (nome: string, tipo: string): string => {
  const norm = normNome(nome);
  const inssKey = norm.replace(/[^a-z0-9]/g, '');
  const has13 = /(^|[^0-9])13([^0-9]|$)|13o|decimo terceiro/.test(norm);

  if (/taxa\s*(de\s*)?servi|gorjeta|gratificacao\s*servico/.test(norm)) return 'taxa_servico';
  if (/quebra\s*(de\s*)?caixa|adicional\s*idioma|idioma|noturno|insalub|pericul|adicional/.test(norm)) {
    return 'adicional_outro';
  }
  if (/comiss/.test(norm)) return 'adicional_comissao';
  if (/produtiv/.test(norm)) return 'adicional_produtividade';
  if (/1\/3/.test(nome)) return 'ferias_pagamento';
  if (/inss/.test(inssKey)) {
    if (has13) return 'inss_13';
    if (/feria/.test(norm)) return 'inss_prov_ferias';
    return 'inss';
  }
  if (has13) return 'decimo_pagamento';
  if (/feria|abono/.test(norm)) return 'ferias_pagamento';
  return tipo === 'P' ? 'salario' : 'retorno';
};

const linhaItem = (
  key: string,
  label: string,
  valor: number,
  itens?: FolhaComposicaoItem[]
): FolhaComposicaoLinha => ({
  key,
  label,
  valor,
  pct: 0,
  tipo: 'item',
  itens: itens?.length ? itens : undefined,
});

const linhaGrupo = (key: string, label: string, children: FolhaComposicaoLinha[]): FolhaComposicaoLinha => {
  const valor = children.reduce((s, c) => s + c.valor, 0);
  return { key, label, valor, pct: 0, tipo: 'grupo', children: children.filter((c) => Math.abs(c.valor) >= 0.01) };
};

const applyPct = (grupos: FolhaComposicaoLinha[], total: number): FolhaComposicaoLinha[] => {
  const pctOf = (v: number) => (total > 0 ? (v / total) * 100 : 0);
  const mapLine = (l: FolhaComposicaoLinha): FolhaComposicaoLinha => ({
    ...l,
    pct: pctOf(l.valor),
    children: l.children?.map(mapLine),
  });
  return grupos.map(mapLine);
};

export type BuildComposicaoInput = {
  apuracao?: Record<string, unknown> | null;
  rubricas?: Array<{ codigo?: string; nome?: string; valor?: number; tipo?: string }>;
  manualFgts?: { fgts?: number; fgts_prov_ferias?: number; fgts_prov_13?: number };
  scale?: number;
  fonte?: string;
};

/** Monta a árvore CUSTO DA FOLHA com drill-down por grupo e rubrica. */
export const buildComposicaoCusto = (input: BuildComposicaoInput): FolhaComposicaoCusto => {
  const scale = input.scale ?? 1;
  const ap = input.apuracao ?? {};
  const rubricas = input.rubricas ?? [];

  const rubricaGroups = new Map<string, { valor: number; itens: FolhaComposicaoItem[] }>();
  for (const rb of rubricas) {
    const cat = classifyRubricaComposicao(String(rb.nome ?? ''), String(rb.tipo ?? ''));
    const v = num(rb.valor) * scale;
    if (Math.abs(v) < 0.01) continue;
    const g = rubricaGroups.get(cat) ?? { valor: 0, itens: [] };
    g.valor += v;
    g.itens.push({
      codigo: rb.codigo ? String(rb.codigo) : undefined,
      nome: String(rb.nome ?? rb.codigo ?? 'Rubrica'),
      valor: v,
    });
    rubricaGroups.set(cat, g);
  }
  const rg = (k: string) => rubricaGroups.get(k) ?? { valor: 0, itens: [] };

  const total_proventos = num(ap.total_proventos) * scale;
  const total_comissao = num(ap.total_comissao) * scale || rg('adicional_comissao').valor;
  const total_produtividade = num(ap.total_produtividade) * scale || rg('adicional_produtividade').valor;
  const taxa_servico = rg('taxa_servico').valor;
  const adicional_outro = rg('adicional_outro').valor;

  const salario_rubricas = rg('salario');
  const salario_bruto =
    ap.total_proventos != null
      ? Math.max(0, total_proventos - taxa_servico - adicional_outro)
      : salario_rubricas.valor;

  const inss = num(ap.inss) * scale || rg('inss').valor;
  const inss_13 = num(ap.inss_13) * scale || rg('inss_13').valor;
  const inss_prov_ferias = num(ap.inss_provisao_ferias) * scale || rg('inss_prov_ferias').valor;

  const manual = input.manualFgts ?? {};
  const fgts = (num(ap.fgts) || num(manual.fgts)) * scale;
  const fgts_prov_ferias = (num(ap.fgts_provisao_ferias) || num(manual.fgts_prov_ferias)) * scale;
  const fgts_prov_13 = (num(ap.fgts_provisao_13) || num(manual.fgts_prov_13)) * scale;

  const provisao_13 = num(ap.provisao_13) * scale;
  const provisao_ferias = num(ap.provisao_ferias) * scale;
  const provisao_um_terco = num(ap.provisao_um_terco_ferias) * scale;
  const ferias_pagamento = rg('ferias_pagamento').valor;
  const decimo_pagamento = rg('decimo_pagamento').valor;

  const total_retorno = -Math.abs(num(ap.total_retorno) * scale || rg('retorno').valor);
  const outros_rubricas = rg('outro').valor;

  const grupoSalario = linhaGrupo('salario_bruto', 'Salário bruto', [
    linhaItem('proventos', 'Proventos / salário base', salario_bruto, salario_rubricas.itens),
  ]);

  const grupoAdicionais = linhaGrupo('adicionais', 'Adicionais', [
    linhaItem('comissao', 'Comissões', total_comissao, rg('adicional_comissao').itens),
    linhaItem('produtividade', 'Produtividade', total_produtividade, rg('adicional_produtividade').itens),
    linhaItem('adicional_outro', 'Outros adicionais', adicional_outro, rg('adicional_outro').itens),
  ]);

  const grupoTaxaServico = linhaGrupo('taxa_servico', 'Taxa de serviço', [
    linhaItem('taxa_servico_bruto', 'Distribuição na folha', taxa_servico, rg('taxa_servico').itens),
  ]);

  const grupoEncargos = linhaGrupo('encargos', 'Encargos (INSS)', [
    linhaItem('inss', 'INSS', inss, rg('inss').itens),
    linhaItem('inss_13', 'INSS 13º', inss_13, rg('inss_13').itens),
    linhaItem('inss_prov_ferias', 'INSS prov. férias', inss_prov_ferias, rg('inss_prov_ferias').itens),
  ]);

  const grupoFgts = linhaGrupo('fgts', 'FGTS', [
    linhaItem('fgts', 'FGTS normal', fgts),
    linhaItem('fgts_prov_ferias', 'FGTS férias', fgts_prov_ferias),
    linhaItem('fgts_prov_13', 'FGTS 13º', fgts_prov_13),
  ]);

  const grupoProvisoes = linhaGrupo('provisoes', 'Provisões', [
    linhaItem('provisao_13', 'Provisão 13º', provisao_13),
    linhaItem('provisao_ferias', 'Provisão férias', provisao_ferias),
    linhaItem('provisao_um_terco', 'Provisão 1/3 férias', provisao_um_terco),
    linhaItem('ferias_pagamento', 'Férias (pagamento)', ferias_pagamento, rg('ferias_pagamento').itens),
    linhaItem('decimo_pagamento', '13º (pagamento)', decimo_pagamento, rg('decimo_pagamento').itens),
  ]);

  const grupoOutros = linhaGrupo('outros', 'Outros', [
    linhaItem('retornos', 'Retornos / descontos', total_retorno, rg('retorno').itens),
    linhaItem('outros_rubricas', 'Demais variáveis', outros_rubricas, rg('outro').itens),
  ]);

  const gruposRaw = [
    grupoSalario,
    grupoAdicionais,
    ...(Math.abs(taxa_servico) >= 0.01 ? [grupoTaxaServico] : []),
    grupoEncargos,
    ...(Math.abs(fgts + fgts_prov_ferias + fgts_prov_13) >= 0.01 ? [grupoFgts] : []),
    grupoProvisoes,
    grupoOutros,
  ].filter((g) => Math.abs(g.valor) >= 0.01 || (g.children?.length ?? 0) > 0);

  const totalFromAp = num(ap.total_custo) * scale;
  const totalFromGrupos = gruposRaw.reduce((s, g) => s + g.valor, 0);
  const total_custo = totalFromAp > 0 ? totalFromAp : totalFromGrupos;

  const grupos = applyPct(gruposRaw, total_custo);

  const totalLinha: FolhaComposicaoLinha = {
    key: 'total_custo',
    label: 'Custo empresa',
    valor: total_custo,
    pct: 100,
    tipo: 'total',
  };

  return {
    total_custo,
    grupos: [...grupos, totalLinha],
    fonte: input.fonte ?? (ap.total_custo != null ? 'Apuração mensal' : 'Rubricas importadas'),
  };
};
