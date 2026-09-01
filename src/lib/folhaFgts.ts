/** FGTS no painel RH — componentes separados, fonte da guia importada quando disponível. */

import { classifyEmprestimoLancamento } from './folhaEmprestimos.js';

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export type FgtsComponente = {
  key: string;
  label: string;
  valor: number;
  fonte: string;
  pct: number;
};

export type FgtsEmprestimoItem = {
  codigo?: string;
  nome: string;
  valor: number;
};

export type FgtsAnalise = {
  componentes: FgtsComponente[];
  total_fgts: number;
  emprestimos_excluidos: number;
  emprestimos_itens: FgtsEmprestimoItem[];
  aviso_emprestimos: string;
};

export const extractEmprestimosRubricas = (
  rubricas: Array<{ codigo?: string; nome?: string; valor?: number; tipo?: string }>,
  scale = 1
): { total: number; itens: FgtsEmprestimoItem[] } => {
  const grupos = new Map<string, { nome: string; codigo?: string; descontos: number; estornos: number }>();

  for (const rb of rubricas) {
    const nome = String(rb.nome ?? '');
    const valorRaw = num(rb.valor) * scale;
    const tipoLanc = classifyEmprestimoLancamento(nome, String(rb.tipo ?? ''), valorRaw);
    if (!tipoLanc) continue;
    const valor = Math.abs(valorRaw);
    if (valor < 0.01) continue;

    const key = String(rb.codigo ?? nome).trim() || nome;
    if (!grupos.has(key)) {
      grupos.set(key, { nome: nome || String(rb.codigo ?? 'Empréstimo'), codigo: rb.codigo, descontos: 0, estornos: 0 });
    }
    const g = grupos.get(key)!;
    if (tipoLanc === 'desconto') g.descontos += valor;
    else g.estornos += valor;
  }

  const itens: FgtsEmprestimoItem[] = [];
  let total = 0;
  for (const g of grupos.values()) {
    const liquido = Math.max(0, g.descontos - g.estornos);
    if (liquido < 0.01) continue;
    total += liquido;
    itens.push({
      codigo: g.codigo,
      nome: g.nome,
      valor: liquido,
    });
  }

  return { total, itens };
};

const pickValor = (
  candidates: Array<{ valor: number; fonte: string }>
): { valor: number; fonte: string } => {
  for (const c of candidates) {
    if (c.valor > 0.009) return c;
  }
  return candidates[candidates.length - 1] ?? { valor: 0, fonte: 'Não informado' };
};

export type BuildFgtsInput = {
  scale?: number;
  apuracao?: Record<string, unknown> | null;
  manual?: { fgts?: number; fgts_prov_ferias?: number; fgts_prov_13?: number } | null;
  guiaMensal?: {
    fgts_normal?: number;
    fgts_ferias?: number;
    fgts_13?: number;
    fgts_outros?: number;
    fonte_normal?: string | null;
    fonte_ferias?: string | null;
    fonte_13?: string | null;
    fonte_outros?: string | null;
  } | null;
  provisaoFeriasFgtsSum?: number;
  provisao13FgtsSum?: number;
  rubricas?: Array<{ codigo?: string; nome?: string; valor?: number; tipo?: string }>;
};

/** Monta FGTS normal / férias / 13º / demais sem misturar empréstimos. */
export const buildFgtsAnalise = (input: BuildFgtsInput): FgtsAnalise => {
  const scale = input.scale ?? 1;
  const ap = input.apuracao ?? {};
  const manual = input.manual ?? {};
  const guia = input.guiaMensal ?? {};

  const fgts_normal = pickValor([
    { valor: num(guia.fgts_normal) * scale, fonte: guia.fonte_normal || 'Guia / cadastro mensal FGTS' },
    { valor: num(manual.fgts) * scale, fonte: 'Cadastro manual (folha_custo_manual)' },
    { valor: num(ap.fgts) * scale, fonte: 'Apuração mensal (calculado sobre salário)' },
    { valor: 0, fonte: 'Não informado — importe guia ou processe apuração' },
  ]);

  const fgts_ferias = pickValor([
    { valor: num(guia.fgts_ferias) * scale, fonte: guia.fonte_ferias || 'Guia Provisão de Férias (importada)' },
    { valor: num(input.provisaoFeriasFgtsSum) * scale, fonte: 'Soma FGTS — funcionários (Provisão Férias)' },
    { valor: num(manual.fgts_prov_ferias) * scale, fonte: 'Cadastro manual (folha_custo_manual)' },
    { valor: num(ap.fgts_provisao_ferias) * scale, fonte: 'Apuração mensal (provisão férias)' },
    { valor: 0, fonte: 'Não informado' },
  ]);

  const fgts_13 = pickValor([
    { valor: num(guia.fgts_13) * scale, fonte: guia.fonte_13 || 'Guia Provisão 13º (importada)' },
    { valor: num(input.provisao13FgtsSum) * scale, fonte: 'Soma FGTS — funcionários (Provisão 13º)' },
    { valor: num(manual.fgts_prov_13) * scale, fonte: 'Cadastro manual (folha_custo_manual)' },
    { valor: num(ap.fgts_provisao_13) * scale, fonte: 'Apuração mensal (provisão 13º)' },
    { valor: 0, fonte: 'Não informado' },
  ]);

  const fgts_outros_base = num(guia.fgts_outros) * scale;
  const fgts_outros = pickValor([
    { valor: fgts_outros_base, fonte: guia.fonte_outros || 'Demais guias / ajustes' },
    { valor: 0, fonte: '—' },
  ]);

  const componentesRaw: FgtsComponente[] = [
    { key: 'fgts_normal', label: 'FGTS normal', valor: fgts_normal.valor, fonte: fgts_normal.fonte, pct: 0 },
    { key: 'fgts_ferias', label: 'FGTS férias', valor: fgts_ferias.valor, fonte: fgts_ferias.fonte, pct: 0 },
    { key: 'fgts_13', label: 'FGTS 13º', valor: fgts_13.valor, fonte: fgts_13.fonte, pct: 0 },
  ];

  if (fgts_outros.valor > 0.009) {
    componentesRaw.push({
      key: 'fgts_outros',
      label: 'Demais FGTS',
      valor: fgts_outros.valor,
      fonte: fgts_outros.fonte,
      pct: 0,
    });
  }

  const total_fgts = componentesRaw.reduce((s, c) => s + c.valor, 0);
  const componentes = componentesRaw
    .filter((c) => Math.abs(c.valor) >= 0.01)
    .map((c) => ({
      ...c,
      pct: total_fgts > 0 ? (c.valor / total_fgts) * 100 : 0,
    }));

  const { total: emprestimos_excluidos, itens: emprestimos_itens } = extractEmprestimosRubricas(
    input.rubricas ?? [],
    scale
  );

  return {
    componentes,
    total_fgts,
    emprestimos_excluidos,
    emprestimos_itens,
    aviso_emprestimos:
      emprestimos_excluidos > 0
        ? 'Empréstimos/consignados do extrato (desconto líquido) não entram na base de FGTS nem no total abaixo.'
        : 'Empréstimos não identificados no extrato desta competência.',
  };
};

/** Oculta rubricas/nomes de empréstimos para quem não tem acesso confidencial. */
export const sanitizeFgtsEmprestimosDetalhe = (
  fgts: FgtsAnalise,
  canViewDetalhe: boolean
): FgtsAnalise => {
  if (canViewDetalhe) return fgts;
  return {
    ...fgts,
    emprestimos_itens: [],
    aviso_emprestimos:
      fgts.emprestimos_excluidos > 0.009
        ? 'Empréstimos excluídos do FGTS — detalhes por colaborador restritos ao RH e ao financeiro.'
        : fgts.aviso_emprestimos,
  };
};
