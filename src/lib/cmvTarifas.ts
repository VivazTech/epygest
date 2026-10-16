/** Tarifas internas do CMV — café da manhã e pensão por vigência. */

export type CmvTarifaMotivo =
  | 'padrao'
  | 'carnaval'
  | 'reveillon'
  | 'pacote'
  | 'promocao'
  | 'outro';

export const CMV_TARIFA_MOTIVO_LABELS: Record<CmvTarifaMotivo, string> = {
  padrao: 'Padrão',
  carnaval: 'Carnaval',
  reveillon: 'Réveillon / Fim de ano',
  pacote: 'Pacote especial',
  promocao: 'Promoção',
  outro: 'Outro',
};

export const CMV_TARIFA_MOTIVO_PRIORIDADE: Record<CmvTarifaMotivo, number> = {
  padrao: 0,
  promocao: 5,
  pacote: 8,
  carnaval: 10,
  reveillon: 10,
  outro: 5,
};

export type CmvTarifaRates = {
  cafe_manha_adulto: number;
  cafe_manha_crianca: number;
  pensao_adulto: number;
  pensao_crianca: number;
};

export type CmvTarifaConfigRow = {
  id: number;
  nome: string;
  motivo: CmvTarifaMotivo | string;
  prioridade: number;
  vigencia_inicio: string;
  vigencia_fim: string | null;
  cafe_manha_adulto: number;
  cafe_manha_crianca: number;
  pensao_adulto: number;
  pensao_crianca: number;
  observacoes?: string | null;
  created_at?: string;
  created_by_name?: string | null;
  encerrado_em?: string | null;
};

/** Fallback apenas quando não há configuração no banco para a data. */
export const CMV_TARIFA_FALLBACK: CmvTarifaRates = {
  cafe_manha_adulto: 70,
  cafe_manha_crianca: 35,
  pensao_adulto: 130,
  pensao_crianca: 65,
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

const isActiveOnDate = (row: CmvTarifaConfigRow, isoDate: string): boolean => {
  const d = parseIsoDate(isoDate);
  const ini = parseIsoDate(row.vigencia_inicio);
  if (!d || !ini || d < ini) return false;
  if (!row.vigencia_fim) return true;
  const fim = parseIsoDate(row.vigencia_fim);
  return Boolean(fim && d <= fim);
};

export const rowToRates = (row: CmvTarifaConfigRow): CmvTarifaRates => ({
  cafe_manha_adulto: Number(row.cafe_manha_adulto) || 0,
  cafe_manha_crianca: Number(row.cafe_manha_crianca) || 0,
  pensao_adulto: Number(row.pensao_adulto) || 0,
  pensao_crianca: Number(row.pensao_crianca) || 0,
});

/** Escolhe a vigência mais específica para a data (prioridade + menor intervalo). */
export const resolveCmvTarifasForDate = (
  rows: CmvTarifaConfigRow[],
  isoDate: string
): { rates: CmvTarifaRates; config: CmvTarifaConfigRow | null } => {
  const matching = rows.filter((r) => isActiveOnDate(r, isoDate));
  if (!matching.length) {
    return { rates: { ...CMV_TARIFA_FALLBACK }, config: null };
  }
  matching.sort((a, b) => {
    const pa = Number(a.prioridade) || 0;
    const pb = Number(b.prioridade) || 0;
    if (pb !== pa) return pb - pa;
    const ra = vigenciaDays(a.vigencia_inicio, a.vigencia_fim);
    const rb = vigenciaDays(b.vigencia_inicio, b.vigencia_fim);
    if (ra !== rb) return ra - rb;
    return String(b.vigencia_inicio).localeCompare(String(a.vigencia_inicio));
  });
  const best = matching[0];
  return { rates: rowToRates(best), config: best };
};

export const lastDayOfMonthIso = (year: number, month: number): string => {
  const y = Number(year);
  const m = Number(month);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) {
    return new Date().toISOString().slice(0, 10);
  }
  const last = new Date(Date.UTC(y, m, 0));
  return last.toISOString().slice(0, 10);
};

export const calcularValorTarifa = (
  adultos: number,
  criancas: number,
  tarifas: CmvTarifaRates,
  tipo: 'cafe_manha' | 'pensao'
): number => {
  const a = Math.max(0, Number(adultos) || 0);
  const c = Math.max(0, Number(criancas) || 0);
  if (tipo === 'cafe_manha') {
    return a * tarifas.cafe_manha_adulto + c * tarifas.cafe_manha_crianca;
  }
  return a * tarifas.pensao_adulto + c * tarifas.pensao_crianca;
};

export const formatVigenciaLabel = (row: Pick<CmvTarifaConfigRow, 'vigencia_inicio' | 'vigencia_fim'>): string => {
  const ini = String(row.vigencia_inicio).slice(0, 10);
  const fim = row.vigencia_fim ? String(row.vigencia_fim).slice(0, 10) : 'em aberto';
  return `${ini} → ${fim}`;
};
