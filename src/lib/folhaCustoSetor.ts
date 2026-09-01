/** Custo da folha por setor — setor definido pelo cadastro do funcionário (folha_funcionarios). */

import {
  allocateValorPorSetor,
  calcPctDesvio,
  buildStatusLabel,
  matchFolhaSetor,
  type SetorAgg,
} from './folhaPainel.js';

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export type FuncionarioSetorCadastro = {
  codigo_funcionario: string;
  nome?: string;
  setor_nome: string;
  setor_codigo?: string | null;
  sector_id?: number | null;
};

export type EmployeeCostWeight = {
  codigo_funcionario: string;
  setor_nome: string;
  setor_codigo?: string | null;
  peso: number;
};

export const normalizeSetorKey = (v: string) =>
  String(v ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

export const buildCadastroSetorMap = (funcionarios: any[]): Map<string, FuncionarioSetorCadastro> => {
  const map = new Map<string, FuncionarioSetorCadastro>();
  for (const f of funcionarios ?? []) {
    const codigo = String(f.codigo_funcionario ?? '').trim();
    if (!codigo) continue;
    const setor = String(f.setor_nome ?? '').trim();
    map.set(codigo, {
      codigo_funcionario: codigo,
      nome: String(f.nome ?? '').trim() || undefined,
      setor_nome: setor || 'Sem setor',
      setor_codigo: f.setor_codigo ? String(f.setor_codigo) : null,
      sector_id: f.sector_id != null ? Number(f.sector_id) : null,
    });
  }
  return map;
};

/** Setor canônico: cadastro do funcionário (persistente) → lançamento do mês → Sem setor. */
export const resolveSetorFuncionario = (
  codigo: string,
  cadastro: Map<string, FuncionarioSetorCadastro>,
  lancamentoSetor?: string | null
): { setor_nome: string; setor_codigo: string | null; fonte: 'cadastro' | 'lancamento' | 'sem' } => {
  const cad = cadastro.get(codigo);
  if (cad?.setor_nome && cad.setor_nome !== 'Sem setor') {
    return { setor_nome: cad.setor_nome, setor_codigo: cad.setor_codigo ?? null, fonte: 'cadastro' };
  }
  const lanc = String(lancamentoSetor ?? '').trim();
  if (lanc) return { setor_nome: lanc, setor_codigo: null, fonte: 'lancamento' };
  if (cad?.setor_nome) return { setor_nome: cad.setor_nome, setor_codigo: cad.setor_codigo ?? null, fonte: 'cadastro' };
  return { setor_nome: 'Sem setor', setor_codigo: null, fonte: 'sem' };
};

const lancamentoPeso = (l: any) =>
  num(l.valor_provento) + num(l.valor_comissao) + num(l.valor_produtividade) - num(l.valor_retorno);

/** Monta pesos por funcionário para rateio do custo total (salário base por cadastro de setor). */
export const buildEmployeeCostWeights = (
  lancamentos: any[],
  folhaPagamento: any[],
  cadastro: Map<string, FuncionarioSetorCadastro>
): EmployeeCostWeight[] => {
  const pesoByCodigo = new Map<string, number>();
  const lancSetorByCodigo = new Map<string, string>();

  for (const l of lancamentos ?? []) {
    const cod = String(l.codigo_funcionario ?? '').trim();
    if (!cod) continue;
    const val = lancamentoPeso(l);
    if (val !== 0) pesoByCodigo.set(cod, (pesoByCodigo.get(cod) ?? 0) + val);
    const setorLanc = String(l.setor_nome ?? '').trim();
    if (setorLanc && !lancSetorByCodigo.has(cod)) lancSetorByCodigo.set(cod, setorLanc);
  }

  for (const f of folhaPagamento ?? []) {
    const cod = String(f.matricula ?? '').trim();
    if (!cod || pesoByCodigo.has(cod)) continue;
    const val = num(f.proventos) || num(f.salario) || num(f.liquido);
    if (val > 0) pesoByCodigo.set(cod, val);
  }

  const weights: EmployeeCostWeight[] = [];
  for (const [codigo, peso] of pesoByCodigo) {
    if (peso <= 0) continue;
    const resolved = resolveSetorFuncionario(codigo, cadastro, lancSetorByCodigo.get(codigo));
    weights.push({
      codigo_funcionario: codigo,
      setor_nome: resolved.setor_nome,
      setor_codigo: resolved.setor_codigo,
      peso,
    });
  }
  return weights;
};

export const aggregateSetorStatsFromCadastro = (weights: EmployeeCostWeight[]): Map<string, SetorAgg> => {
  const map = new Map<string, SetorAgg>();
  for (const w of weights) {
    const setor = w.setor_nome || 'Sem setor';
    const g =
      map.get(setor) ||
      ({
        setor,
        total_salario: 0,
        funcionarios: new Set<string>(),
      } as SetorAgg);
    g.total_salario += w.peso;
    g.funcionarios.add(w.codigo_funcionario);
    map.set(setor, g);
  }
  return map;
};

export type SetorCustoCalculado = {
  setor: string;
  setor_codigo: string | null;
  orcado: number;
  realizado: number;
  diferenca: number;
  pct_diferenca: number | null;
  acima_orcamento: boolean;
  status_label: string;
  funcionarios: number;
  peso_salarial: number;
};

export const calcularCustoPorSetor = (input: {
  weights: EmployeeCostWeight[];
  totalCusto: number;
  sectorBudgetByName: Map<string, { budget: number; code: string | null }>;
  setoresCatalogo?: Array<{ nome: string; codigo?: string | null }>;
}): {
  setorStats: Map<string, SetorAgg>;
  custoPorSetor: Map<string, number>;
  resumos: SetorCustoCalculado[];
  totalSalarioGlobal: number;
} => {
  const setorStats = aggregateSetorStatsFromCadastro(input.weights);
  const totalSalarioGlobal = Array.from(setorStats.values()).reduce((s, g) => s + g.total_salario, 0);
  const custoPorSetor = allocateValorPorSetor(setorStats, input.totalCusto, totalSalarioGlobal);

  const allSetores = new Map<string, { codigo: string | null }>();
  for (const s of input.setoresCatalogo ?? []) {
    const nome = String(s.nome ?? '').trim();
    if (!nome) continue;
    allSetores.set(normalizeSetorKey(nome), { codigo: s.codigo ?? null });
  }
  for (const [setor] of setorStats) {
    const key = normalizeSetorKey(setor);
    if (!allSetores.has(key)) allSetores.set(key, { codigo: null });
  }

  const resumos: SetorCustoCalculado[] = [];

  for (const [setor, stats] of setorStats) {
    const meta = input.sectorBudgetByName.get(normalizeSetorKey(setor));
    const orcado = meta?.budget ?? 0;
    const realizado = custoPorSetor.get(setor) ?? 0;
    const diferenca = realizado - orcado;
    resumos.push({
      setor,
      setor_codigo: meta?.code ?? null,
      orcado,
      realizado,
      diferenca,
      pct_diferenca: calcPctDesvio(orcado, diferenca),
      acima_orcamento: diferenca > 0.009,
      status_label: buildStatusLabel(diferenca),
      funcionarios: stats.funcionarios.size,
      peso_salarial: stats.total_salario,
    });
  }

  for (const [key, meta] of allSetores) {
    const exists = resumos.some((r) => normalizeSetorKey(r.setor) === key);
    if (exists) continue;
    const nome =
      input.setoresCatalogo?.find((s) => normalizeSetorKey(s.nome) === key)?.nome ??
      Array.from(setorStats.keys()).find((k) => normalizeSetorKey(k) === key) ??
      key;
    const budgetMeta = input.sectorBudgetByName.get(key);
    resumos.push({
      setor: nome,
      setor_codigo: meta.codigo ?? budgetMeta?.code ?? null,
      orcado: budgetMeta?.budget ?? 0,
      realizado: 0,
      diferenca: -(budgetMeta?.budget ?? 0),
      pct_diferenca: budgetMeta?.budget ? -100 : null,
      acima_orcamento: false,
      status_label: buildStatusLabel(-(budgetMeta?.budget ?? 0)),
      funcionarios: 0,
      peso_salarial: 0,
    });
  }

  resumos.sort((a, b) => b.realizado - a.realizado || a.setor.localeCompare(b.setor, 'pt-BR'));

  return { setorStats, custoPorSetor, resumos, totalSalarioGlobal };
};

export type FuncionarioDrilldownRow = {
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

/** Drill-down: rateia orçado e realizado do setor pelo peso salarial de cada funcionário. */
export const buildFuncionariosDrilldown = (input: {
  setor: string;
  weights: EmployeeCostWeight[];
  orcadoSetor: number;
  realizadoSetor: number;
  cadastro: Map<string, FuncionarioSetorCadastro>;
  folhaPagamento?: Array<{ matricula?: string; nome?: string }>;
}): FuncionarioDrilldownRow[] => {
  const nomeByCod = new Map<string, string>();
  for (const f of input.folhaPagamento ?? []) {
    const cod = String(f.matricula ?? '').trim();
    if (cod && f.nome) nomeByCod.set(cod, String(f.nome).trim());
  }
  for (const [cod, cad] of input.cadastro) {
    if (cad.nome) nomeByCod.set(cod, cad.nome);
  }

  const setorWeights = input.weights.filter((w) => matchFolhaSetor(w.setor_nome, input.setor));
  const totalPeso = setorWeights.reduce((s, w) => s + w.peso, 0);

  return setorWeights
    .map((w) => {
      const share = totalPeso > 0 ? w.peso / totalPeso : 0;
      const orcado = input.orcadoSetor * share;
      const realizado = input.realizadoSetor * share;
      const diferenca = realizado - orcado;
      return {
        codigo_funcionario: w.codigo_funcionario,
        nome: nomeByCod.get(w.codigo_funcionario) || w.codigo_funcionario,
        orcado,
        realizado,
        diferenca,
        pct_diferenca: calcPctDesvio(orcado, diferenca),
        acima_orcamento: diferenca > 0.009,
        status_label: buildStatusLabel(diferenca),
        peso_salarial: w.peso,
      };
    })
    .sort((a, b) => b.realizado - a.realizado || a.nome.localeCompare(b.nome, 'pt-BR'));
};

/** Enriquece lançamentos com setor do cadastro (evita reclassificar todo mês). */
export const enrichLancamentosComCadastroSetor = <T extends { codigo_funcionario?: string | null; setor_nome?: string | null }>(
  lancamentos: T[],
  cadastro: Map<string, FuncionarioSetorCadastro>
): T[] =>
  lancamentos.map((l) => {
    const cod = String(l.codigo_funcionario ?? '').trim();
    if (!cod) return l;
    const cad = cadastro.get(cod);
    if (!cad?.setor_nome || cad.setor_nome === 'Sem setor') return l;
    return { ...l, setor_nome: cad.setor_nome };
  });
