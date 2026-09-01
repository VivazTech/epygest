/** Meta de CMV — comparação com realizado, desvio e impacto financeiro. */

export const CMV_META_FALLBACK_PCT = 0.29;

export type CmvMetaConfigRow = {
  id: number;
  nome: string;
  meta_pct: number;
  vigencia_inicio: string;
  vigencia_fim: string | null;
  observacoes?: string | null;
  created_at?: string;
  created_by_name?: string | null;
  encerrado_em?: string | null;
};

export type CmvMetaSituacao = 'economia' | 'excesso' | 'neutro';

export type CmvMetaComparison = {
  meta_pct: number;
  realizado_pct: number;
  desvio_pp: number;
  impacto_financeiro: number;
  situacao: CmvMetaSituacao;
};

const parseIsoDate = (value: string): Date | null => {
  const s = String(value ?? '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return Number.isNaN(dt.getTime()) ? null : dt;
};

const vigenciaDays = (inicio: string, fim: string | null | undefined): number => {
  const start = parseIsoDate(inicio);
  const end = parseIsoDate(fim || inicio);
  if (!start || !end) return Number.MAX_SAFE_INTEGER;
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
};

const isActiveOnDate = (row: CmvMetaConfigRow, isoDate: string): boolean => {
  const d = parseIsoDate(isoDate);
  const ini = parseIsoDate(row.vigencia_inicio);
  if (!d || !ini || d < ini) return false;
  if (!row.vigencia_fim) return true;
  const fim = parseIsoDate(row.vigencia_fim);
  return Boolean(fim && d <= fim);
};

export const resolveCmvMetaForDate = (
  rows: CmvMetaConfigRow[],
  isoDate: string
): { meta_pct: number; config: CmvMetaConfigRow | null } => {
  const matching = rows.filter((r) => isActiveOnDate(r, isoDate));
  if (!matching.length) {
    return { meta_pct: CMV_META_FALLBACK_PCT, config: null };
  }
  matching.sort((a, b) => {
    const ra = vigenciaDays(a.vigencia_inicio, a.vigencia_fim);
    const rb = vigenciaDays(b.vigencia_inicio, b.vigencia_fim);
    if (ra !== rb) return ra - rb;
    return String(b.vigencia_inicio).localeCompare(String(a.vigencia_inicio));
  });
  const best = matching[0];
  const pct = Number(best.meta_pct);
  return {
    meta_pct: Number.isFinite(pct) && pct > 0 ? pct : CMV_META_FALLBACK_PCT,
    config: best,
  };
};

export const formatVigenciaMetaLabel = (
  row: Pick<CmvMetaConfigRow, 'vigencia_inicio' | 'vigencia_fim'>
): string => {
  const ini = String(row.vigencia_inicio).slice(0, 10);
  const fim = row.vigencia_fim ? String(row.vigencia_fim).slice(0, 10) : 'em aberto';
  return `${ini} → ${fim}`;
};

/** Compara CMV realizado com a meta (frações, ex.: 0.29 = 29%). */
export const computeCmvMetaComparison = (
  meta_pct: number,
  realizado_pct: number,
  receita_considerada: number,
  custo_ab: number
): CmvMetaComparison => {
  const meta = Number.isFinite(meta_pct) && meta_pct > 0 ? meta_pct : CMV_META_FALLBACK_PCT;
  const realizado = Number.isFinite(realizado_pct) ? realizado_pct : 0;
  const receita = Number.isFinite(receita_considerada) ? receita_considerada : 0;
  const custo = Number.isFinite(custo_ab) ? custo_ab : 0;
  const desvio_pp = (realizado - meta) * 100;
  const impacto_financeiro = receita * meta - custo;
  let situacao: CmvMetaSituacao = 'neutro';
  if (desvio_pp < -0.0005) situacao = 'economia';
  else if (desvio_pp > 0.0005) situacao = 'excesso';
  return {
    meta_pct: meta,
    realizado_pct: realizado,
    desvio_pp,
    impacto_financeiro,
    situacao,
  };
};

export const fmtDesvioPp = (pp: number): string => {
  const n = Number.isFinite(pp) ? pp : 0;
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} p.p.`;
};

export const impactoLabel = (situacao: CmvMetaSituacao): string => {
  if (situacao === 'economia') return 'Economia';
  if (situacao === 'excesso') return 'Excesso / perda';
  return 'No limite';
};
