/** Cadastro de colaborador — remuneração e empresas (base para orçamento). */

export type ColaboradorEmpresaKey = 'vivaz' | 'aqua';

export const COLABORADOR_EMPRESAS: Array<{ key: ColaboradorEmpresaKey; nome: string }> = [
  { key: 'vivaz', nome: 'Vivaz Cataratas' },
  { key: 'aqua', nome: 'Aqua' },
];

export type OutroAdicional = {
  label: string;
  valor: number;
};

export type ColaboradorCadastro = {
  id?: number;
  nome: string;
  nome_oficial?: string | null;
  empresa_key?: ColaboradorEmpresaKey | string | null;
  empresa_nome?: string | null;
  sector_id?: number | null;
  sector_name?: string | null;
  cargo_descricao?: string | null;
  codigo_funcionario?: string | null;
  salario_base: number;
  adicionais_fixos: number;
  adicional_quebra_caixa: number;
  adicional_idioma: number;
  outros_adicionais: OutroAdicional[];
  observacao?: string | null;
  active?: boolean;
};

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const empresaNomeFromKey = (key?: string | null): string | null =>
  COLABORADOR_EMPRESAS.find((e) => e.key === key)?.nome ?? null;

export const resolveEmpresaKey = (raw?: string | null): ColaboradorEmpresaKey | null => {
  const n = String(raw ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (!n) return null;
  if (n === 'aqua' || n.includes('aquamania')) return 'aqua';
  if (n === 'vivaz' || n.includes('vivaz') || n.includes('hotel')) return 'vivaz';
  return null;
};

export const parseOutrosAdicionais = (raw: unknown): OutroAdicional[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => ({
      label: String((item as any)?.label ?? '').trim(),
      valor: num((item as any)?.valor),
    }))
    .filter((item) => item.label && item.valor !== 0);
};

export const calcularRemuneracaoTotal = (c: {
  salario_base?: unknown;
  adicionais_fixos?: unknown;
  adicional_quebra_caixa?: unknown;
  adicional_idioma?: unknown;
  outros_adicionais?: unknown;
}): number => {
  const base =
    num(c.salario_base) +
    num(c.adicionais_fixos) +
    num(c.adicional_quebra_caixa) +
    num(c.adicional_idioma);
  const outros = parseOutrosAdicionais(c.outros_adicionais).reduce((s, o) => s + o.valor, 0);
  return base + outros;
};

export const emptyColaboradorForm = () => ({
  nome: '',
  nome_oficial: '',
  empresa_key: '' as ColaboradorEmpresaKey | '',
  funcao_id: '',
  sector_id: '',
  codigo_funcionario: '',
  salario_base: '',
  adicionais_fixos: '',
  adicional_quebra_caixa: '',
  adicional_idioma: '',
  outros_adicionais: [] as OutroAdicional[],
  observacao: '',
});

export const colaboradorFromApi = (row: any) => ({
  ...row,
  nome_oficial: row.nome_oficial || row.nome,
  salario_base: num(row.salario_base),
  adicionais_fixos: num(row.adicionais_fixos),
  adicional_quebra_caixa: num(row.adicional_quebra_caixa),
  adicional_idioma: num(row.adicional_idioma),
  outros_adicionais: parseOutrosAdicionais(row.outros_adicionais),
  remuneracao_total: calcularRemuneracaoTotal(row),
});
