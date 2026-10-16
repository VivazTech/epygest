/** Indicador de absenteísmo — classificação de rubricas e cálculos. */

export type AbsenteismoConfig = {
  horas_previstas_padrao: number;
  horas_dia_padrao: number;
  dias_uteis_padrao: number;
};

export type LancamentoHorasInput = {
  codigo_funcionario?: string | null;
  nome_funcionario?: string | null;
  setor_nome?: string | null;
  setor_codigo?: string | null;
  descricao_rubrica?: string | null;
  quantidade?: string | number | null;
  valor_original?: number | null;
};

export type FuncionarioAbsenteismoAgg = {
  codigo_funcionario: string;
  nome_funcionario: string;
  setor_nome: string;
  setor_codigo: string | null;
  horas_previstas: number;
  horas_trabalhadas: number;
  horas_ausencia: number;
  dias_faltas: number;
  fonte_previstas: string;
  fonte_trabalhadas: string;
  fonte_ausencias: string;
};

export type AbsenteismoResumo = {
  horas_previstas: number;
  horas_trabalhadas: number;
  horas_ausencia: number;
  absenteismo_pct: number | null;
  funcionarios: number;
};

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const normalizeAbsText = (v: string) =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

/** Rubricas que representam faltas, atrasos ou ausências (horas). */
export const RUBRICA_AUSENCIA =
  /falta|atraso|ausen|dsr.*desc|suspens|afast.*injust|inas|abon.*neg|desconto.*hora/i;

/** Rubricas de horas efetivamente trabalhadas / normais. */
export const RUBRICA_TRABALHO =
  /horas?\s*norm|hrs?\s*norm|hora\s*refer|ref\.?\s*horas?|salario\s*hora|trabalhad|h\.?\s*norm|horas?\s*m[eê]s/i;

/** Horas extras entram no trabalhado, mas não na base de absenteísmo. */
export const RUBRICA_EXTRA = /hora\s*extra|hrs?\s*extra|\bhe\b|adicional.*noturn/i;

export const parseQuantidadeHoras = (raw: unknown): number => {
  if (raw == null || raw === '') return 0;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  let s = String(raw).trim().replace(/\s/g, '');
  if (!s) return 0;
  if (s.includes(':')) {
    const [h, m] = s.split(':');
    const hh = Number(h);
    const mm = Number(m);
    if (Number.isFinite(hh) && Number.isFinite(mm)) return hh + mm / 60;
  }
  if (s.includes('.') && s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

export const formatHorasCell = (v: unknown): string => {
  if (v == null || v === '') return '';
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return String(v).trim();
};

export type RubricaHorasTipo = 'ausencia' | 'trabalho' | 'extra' | 'outro';

export const classifyRubricaHoras = (descricao: string): RubricaHorasTipo => {
  const norm = normalizeAbsText(descricao);
  if (RUBRICA_AUSENCIA.test(norm)) return 'ausencia';
  if (RUBRICA_TRABALHO.test(norm)) return 'trabalho';
  if (RUBRICA_EXTRA.test(norm)) return 'extra';
  return 'outro';
};

export const calcularAbsenteismoPct = (
  horasAusencia: number,
  horasPrevistas: number
): number | null => {
  if (!horasPrevistas || horasPrevistas <= 0) return null;
  return (horasAusencia / horasPrevistas) * 100;
};

export const defaultHorasPrevistas = (config: AbsenteismoConfig): number => {
  const fromDias = num(config.dias_uteis_padrao) * num(config.horas_dia_padrao);
  const padrao = num(config.horas_previstas_padrao);
  return padrao > 0 ? padrao : fromDias > 0 ? fromDias : 220;
};

export const aggregateAbsenteismoFromLancamentos = (
  lancamentos: LancamentoHorasInput[],
  config: AbsenteismoConfig,
  overrides?: Map<string, Partial<FuncionarioAbsenteismoAgg>>,
  faltasProvisao?: Map<string, number>
): Map<string, FuncionarioAbsenteismoAgg> => {
  const horasPadrao = defaultHorasPrevistas(config);
  const horasDia = num(config.horas_dia_padrao) || 8;
  const map = new Map<string, FuncionarioAbsenteismoAgg>();

  const ensure = (codigo: string, row: LancamentoHorasInput) => {
    let g = map.get(codigo);
    if (!g) {
      const ov = overrides?.get(codigo);
      g = {
        codigo_funcionario: codigo,
        nome_funcionario: String(row.nome_funcionario ?? ov?.nome_funcionario ?? '').trim(),
        setor_nome: String(row.setor_nome ?? ov?.setor_nome ?? 'Sem setor').trim() || 'Sem setor',
        setor_codigo: row.setor_codigo ? String(row.setor_codigo) : ov?.setor_codigo ?? null,
        horas_previstas: ov?.horas_previstas ?? horasPadrao,
        horas_trabalhadas: ov?.horas_trabalhadas ?? 0,
        horas_ausencia: ov?.horas_ausencia ?? 0,
        dias_faltas: ov?.dias_faltas ?? faltasProvisao?.get(codigo) ?? 0,
        fonte_previstas: ov?.fonte_previstas ?? 'Configuração padrão',
        fonte_trabalhadas: ov?.fonte_trabalhadas ?? 'Extrato mensal (rubricas)',
        fonte_ausencias: ov?.fonte_ausencias ?? 'Extrato mensal (rubricas)',
      };
      map.set(codigo, g);
    } else {
      if (!g.nome_funcionario && row.nome_funcionario) g.nome_funcionario = String(row.nome_funcionario).trim();
      if ((!g.setor_nome || g.setor_nome === 'Sem setor') && row.setor_nome) {
        g.setor_nome = String(row.setor_nome).trim();
      }
      if (!g.setor_codigo && row.setor_codigo) g.setor_codigo = String(row.setor_codigo);
    }
    return g;
  };

  for (const l of lancamentos) {
    const codigo = String(l.codigo_funcionario ?? '').trim();
    if (!codigo) continue;
    const g = ensure(codigo, l);
    const horas = parseQuantidadeHoras(l.quantidade);
    if (horas <= 0) continue;
    const tipo = classifyRubricaHoras(String(l.descricao_rubrica ?? ''));
    if (tipo === 'ausencia') g.horas_ausencia += horas;
    else if (tipo === 'trabalho' || tipo === 'extra') g.horas_trabalhadas += horas;
  }

  for (const [codigo, g] of map) {
    const diasFaltas = faltasProvisao?.get(codigo) ?? g.dias_faltas;
    if (diasFaltas > 0 && g.horas_ausencia <= 0) {
      g.dias_faltas = diasFaltas;
      g.horas_ausencia = diasFaltas * horasDia;
      g.fonte_ausencias = 'Provisão de férias (dias de falta)';
    } else if (diasFaltas > 0) {
      g.dias_faltas = diasFaltas;
    }
    if (g.horas_trabalhadas <= 0 && g.horas_previstas > 0 && g.horas_ausencia > 0) {
      g.horas_trabalhadas = Math.max(0, g.horas_previstas - g.horas_ausencia);
      g.fonte_trabalhadas = 'Calculado (previstas − ausências)';
    }
  }

  if (overrides) {
    for (const [codigo, ov] of overrides) {
      const g = map.get(codigo) ?? ensure(codigo, { codigo_funcionario: codigo });
      if (ov.horas_previstas != null) {
        g.horas_previstas = ov.horas_previstas;
        g.fonte_previstas = ov.fonte_previstas ?? 'Importação manual';
      }
      if (ov.horas_trabalhadas != null) {
        g.horas_trabalhadas = ov.horas_trabalhadas;
        g.fonte_trabalhadas = ov.fonte_trabalhadas ?? 'Importação manual';
      }
      if (ov.horas_ausencia != null) {
        g.horas_ausencia = ov.horas_ausencia;
        g.fonte_ausencias = ov.fonte_ausencias ?? 'Importação manual';
      }
      if (ov.dias_faltas != null) g.dias_faltas = ov.dias_faltas;
      if (ov.nome_funcionario) g.nome_funcionario = ov.nome_funcionario;
      if (ov.setor_nome) g.setor_nome = ov.setor_nome;
      if (ov.setor_codigo !== undefined) g.setor_codigo = ov.setor_codigo;
    }
  }

  return map;
};

export const summarizeAbsenteismo = (rows: FuncionarioAbsenteismoAgg[]): AbsenteismoResumo => {
  const horas_previstas = rows.reduce((s, r) => s + r.horas_previstas, 0);
  const horas_trabalhadas = rows.reduce((s, r) => s + r.horas_trabalhadas, 0);
  const horas_ausencia = rows.reduce((s, r) => s + r.horas_ausencia, 0);
  return {
    horas_previstas,
    horas_trabalhadas,
    horas_ausencia,
    absenteismo_pct: calcularAbsenteismoPct(horas_ausencia, horas_previstas),
    funcionarios: rows.length,
  };
};

/** Extrai horas e valor monetário de células numéricas de uma linha de rubrica do extrato. */
export const extractHorasValorFromCells = (
  cells: Array<{ c: number; v: unknown }>,
  codigoRaw: unknown
): { horas: string; valor: number } => {
  const toNum = (v: unknown) => {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    let s = String(v ?? '').trim();
    if (!s) return 0;
    s = s.replace(/\./g, '').replace(',', '.').replace(/[^0-9.\-]/g, '');
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  };

  const numeric: number[] = [];
  for (const cell of cells) {
    if (cell.v === codigoRaw) continue;
    const s = String(cell.v ?? '').trim();
    if (typeof cell.v === 'number' && Number.isFinite(cell.v)) {
      numeric.push(cell.v);
    } else if (/^\d+([.,]\d+)?$/.test(s)) {
      numeric.push(toNum(s));
    }
  }

  if (!numeric.length) return { horas: '', valor: 0 };
  const sorted = [...numeric].sort((a, b) => Math.abs(b) - Math.abs(a));
  const valor = sorted[0];
  const horasNum = sorted.find((n) => Math.abs(n) < Math.abs(valor) && Math.abs(n) <= 400);
  return {
    horas: horasNum != null ? formatHorasCell(horasNum) : '',
    valor,
  };
};
