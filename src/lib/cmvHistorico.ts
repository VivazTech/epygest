import type { ImportScope } from './importPeriod';

export type CmvApuracaoHistoricoRow = {
  id: number;
  year: number;
  month: number;
  apuracao_scope: ImportScope | string;
  periodo_inicio: string;
  periodo_fim: string;
  period_key: string;
  period_label: string;
  receita_considerada: number;
  custo_ab: number;
  cmv_apurado: number;
  limite_pct: number;
  created_at?: string;
  created_by?: string | null;
  venda_direta_total?: number;
  venda_direta_bebidas?: number;
  cafe_manha_pensao?: number;
  cafe_manha_chds?: number;
  almoco_jantar_pensao?: number;
  almoco_jantar_chds?: number;
  almoco_jantar_antec?: number;
  ci_total?: number;
  ci_bebidas?: number;
  requisicoes_total?: number;
  requisicoes_bebidas?: number;
  refeitorio?: number;
  outros?: number;
  aquamania?: number;
};

export type ParsedCmvApuracaoPeriod = {
  scope: ImportScope;
  periodo_inicio: string;
  periodo_fim: string;
  period_key: string;
  period_label: string;
};

const pad2 = (n: number) => String(n).padStart(2, '0');

export const lastDayOfMonth = (year: number, month: number): number => {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
};

export const buildCmvPeriodLabel = (month: number, periodoFimDia: number): string =>
  `01–${pad2(periodoFimDia)}/${pad2(month)}`;

/** Sugere o dia final do período parcial (hoje, se no mesmo mês/ano). */
export const suggestCmvPeriodoFimDia = (
  year: number,
  month: number,
  date: Date = new Date()
): number => {
  const last = lastDayOfMonth(year, month);
  if (date.getFullYear() === year && date.getMonth() + 1 === month) {
    return Math.min(last, Math.max(1, date.getDate()));
  }
  return Math.min(last, 7);
};

export const parseCmvApuracaoPeriod = (
  year: number,
  month: number,
  apuracao_scope?: string | null,
  periodo_fim_dia?: number | string | null
): ParsedCmvApuracaoPeriod | { error: string } => {
  if (!Number.isFinite(year) || year < 2000) return { error: 'Ano inválido.' };
  if (!Number.isFinite(month) || month < 1 || month > 12) return { error: 'Mês inválido.' };

  const ym = `${year}-${pad2(month)}`;
  const periodo_inicio = `${ym}-01`;
  const last = lastDayOfMonth(year, month);
  const scope: ImportScope = apuracao_scope === 'acompanhamento' ? 'acompanhamento' : 'fechamento';

  if (scope === 'fechamento') {
    return {
      scope,
      periodo_inicio,
      periodo_fim: `${ym}-${pad2(last)}`,
      period_key: `${ym}-FECHAMENTO`,
      period_label: 'Fechamento',
    };
  }

  const day = Number(periodo_fim_dia);
  if (!Number.isFinite(day) || day < 1 || day > last) {
    return { error: `Informe o dia final do período (1 a ${last}).` };
  }

  return {
    scope,
    periodo_inicio,
    periodo_fim: `${ym}-${pad2(day)}`,
    period_key: `${ym}-ATE-${pad2(day)}`,
    period_label: buildCmvPeriodLabel(month, day),
  };
};

export const historicoRowToInputs = (row: CmvApuracaoHistoricoRow) => ({
  venda_direta_total: Number(row.venda_direta_total) || 0,
  venda_direta_bebidas: Number(row.venda_direta_bebidas) || 0,
  cafe_manha_pensao: Number(row.cafe_manha_pensao) || 0,
  cafe_manha_chds: Number(row.cafe_manha_chds) || 0,
  almoco_jantar_pensao: Number(row.almoco_jantar_pensao) || 0,
  almoco_jantar_chds: Number(row.almoco_jantar_chds) || 0,
  almoco_jantar_antec: Number(row.almoco_jantar_antec) || 0,
  ci_total: Number(row.ci_total) || 0,
  ci_bebidas: Number(row.ci_bebidas) || 0,
  requisicoes_total: Number(row.requisicoes_total) || 0,
  requisicoes_bebidas: Number(row.requisicoes_bebidas) || 0,
  refeitorio: Number(row.refeitorio) || 0,
  outros: Number(row.outros) || 0,
  aquamania: Number(row.aquamania) || 0,
  limite_pct: Number(row.limite_pct) || 0.29,
});
