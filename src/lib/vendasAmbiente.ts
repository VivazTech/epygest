/**
 * Parser do relatório Desbravador "Vendas por Ambiente MesAno" (.xls / .xlsx).
 * Layout flexível: detecta cabeçalho com Ambiente/PDV/Local + Valor/Total.
 */

export type VendaAmbienteLine = {
  ambiente: string;
  ambiente_codigo: string | null;
  quantidade: number;
  valor_bruto: number;
  valor_desconto: number;
  valor_liquido: number;
  ticket_medio: number;
};

export type VendasAmbienteParsed = {
  lines: VendaAmbienteLine[];
  period: { year: number; month: number } | null;
  /** Total geral impresso no rodapé do relatório (para conferência), quando houver. */
  total_geral_reported?: number | null;
  summary: {
    lines_count: number;
    ambientes_count: number;
    total_quantidade: number;
    total_bruto: number;
    total_desconto: number;
    total_liquido: number;
    ticket_medio_geral: number;
  };
};

const MONTH_NAME_TO_NUM: Record<string, number> = {
  janeiro: 1,
  fevereiro: 2,
  marco: 3,
  março: 3,
  abril: 4,
  maio: 5,
  junho: 6,
  julho: 7,
  agosto: 8,
  setembro: 9,
  outubro: 10,
  novembro: 11,
  dezembro: 12,
  jan: 1,
  fev: 2,
  mar: 3,
  abr: 4,
  mai: 5,
  jun: 6,
  jul: 7,
  ago: 8,
  set: 9,
  out: 10,
  nov: 11,
  dez: 12,
};

const normalize = (value: unknown) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const toNumber = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const raw = String(value ?? '').trim();
  if (!raw) return 0;
  const cleaned = raw.replace(/[R$\s]/gi, '');
  if (/^-?\d{1,3}(\.\d{3})*,\d+$/.test(cleaned) || /,\d{1,2}$/.test(cleaned)) {
    const n = Number(cleaned.replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  }
  const n = Number(cleaned.replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

const detectPeriodFromText = (text: string): { year: number; month: number } | null => {
  const n = normalize(text);
  // Ex.: "marco/2026", "03/2026", "mesano 032026", "vendas por ambiente 03-2026"
  const named = n.match(
    /\b(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\b\s*[\/\-_.]?\s*(\d{4})\b/
  );
  if (named) {
    const month = MONTH_NAME_TO_NUM[named[1]];
    const year = Number(named[2]);
    if (month && year >= 2000) return { year, month };
  }
  const slash = n.match(/\b(0?[1-9]|1[0-2])[\/\-_.](20\d{2})\b/);
  if (slash) return { year: Number(slash[2]), month: Number(slash[1]) };
  const compact = n.match(/\b(0[1-9]|1[0-2])(20\d{2})\b/);
  if (compact) return { year: Number(compact[2]), month: Number(compact[1]) };
  return null;
};

const isAmbienteHeader = (cell: string) => {
  const n = normalize(cell);
  return (
    n.includes('ambiente') ||
    n.includes('pdv') ||
    n === 'local' ||
    n.includes('ponto de venda') ||
    n.includes('ponto-de-venda') ||
    n === 'loja' ||
    n.includes('unidade')
  );
};

const isValorHeader = (cell: string) => {
  const n = normalize(cell);
  return (
    n.includes('valor liquido') ||
    n.includes('vl liquido') ||
    n.includes('liquido') ||
    n === 'valor' ||
    n.includes('total') ||
    n.includes('faturamento') ||
    n.includes('venda')
  );
};

const isQtdHeader = (cell: string) => {
  const n = normalize(cell);
  return (
    n.includes('qtd') ||
    n.includes('quant') ||
    n.includes('cupom') ||
    n.includes('ticket') ||
    n.includes('conta') ||
    n.includes('atend')
  );
};

const isDescontoHeader = (cell: string) => {
  const n = normalize(cell);
  return n.includes('desconto') || n.includes('desc');
};

const isBrutoHeader = (cell: string) => {
  const n = normalize(cell);
  return n.includes('bruto') || n.includes('valor bruto') || n.includes('vl bruto');
};

const isCodigoHeader = (cell: string) => {
  const n = normalize(cell);
  return n === 'codigo' || n === 'cod' || n.includes('cod ambiente') || n.includes('cod pdv');
};

const isSkipRowLabel = (label: string) => {
  const n = normalize(label);
  return (
    !n ||
    n === 'total' ||
    n.startsWith('total ') ||
    n.includes('geral') ||
    n.includes('soma') ||
    n.includes('subtotal')
  );
};

export function parseVendasAmbienteGrid(
  rows: any[][],
  fileName = ''
): VendasAmbienteParsed {
  let period = detectPeriodFromText(fileName);
  for (const row of rows.slice(0, 12)) {
    if (!Array.isArray(row)) continue;
    const joined = row.map((c) => String(c ?? '')).join(' ');
    const found = detectPeriodFromText(joined);
    if (found) {
      period = found;
      break;
    }
  }

  let headerIdx = -1;
  let colAmbiente = -1;
  let colCodigo = -1;
  let colQtd = -1;
  let colBruto = -1;
  let colDesconto = -1;
  let colLiquido = -1;

  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const row = rows[i];
    if (!Array.isArray(row)) continue;
    const cells = row.map((c) => String(c ?? '').trim());
    const amb = cells.findIndex(isAmbienteHeader);
    if (amb < 0) continue;
    headerIdx = i;
    colAmbiente = amb;
    colCodigo = cells.findIndex(isCodigoHeader);
    colQtd = cells.findIndex(isQtdHeader);
    colBruto = cells.findIndex(isBrutoHeader);
    colDesconto = cells.findIndex(isDescontoHeader);
    // Preferir coluna de líquido; senão valor/total genérico (exceto se for a de desconto)
    colLiquido = cells.findIndex((c, idx) => {
      if (idx === colDesconto || idx === colBruto) return false;
      return isValorHeader(c);
    });
    if (colLiquido < 0) {
      colLiquido = cells.findIndex((c, idx) => idx !== colAmbiente && isValorHeader(c));
    }
    break;
  }

  const lines: VendaAmbienteLine[] = [];

  if (headerIdx >= 0 && colAmbiente >= 0) {
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!Array.isArray(row)) continue;
      const ambiente = String(row[colAmbiente] ?? '').trim();
      if (!ambiente || isSkipRowLabel(ambiente)) continue;
      // Pula linha se parecer outro cabeçalho
      if (isAmbienteHeader(ambiente)) continue;

      const quantidade = colQtd >= 0 ? toNumber(row[colQtd]) : 0;
      const valor_bruto = colBruto >= 0 ? toNumber(row[colBruto]) : 0;
      const valor_desconto = colDesconto >= 0 ? toNumber(row[colDesconto]) : 0;
      let valor_liquido = colLiquido >= 0 ? toNumber(row[colLiquido]) : 0;
      if (!valor_liquido && valor_bruto) {
        valor_liquido = valor_bruto - valor_desconto;
      }
      if (!ambiente && !valor_liquido && !quantidade) continue;

      const ticket_medio = quantidade > 0 ? valor_liquido / quantidade : 0;
      lines.push({
        ambiente,
        ambiente_codigo: colCodigo >= 0 ? String(row[colCodigo] ?? '').trim() || null : null,
        quantidade,
        valor_bruto: valor_bruto || valor_liquido + valor_desconto,
        valor_desconto,
        valor_liquido,
        ticket_medio,
      });
    }
  }

  // Fallback: duas primeiras colunas texto+número
  if (!lines.length) {
    for (const row of rows) {
      if (!Array.isArray(row) || row.length < 2) continue;
      const ambiente = String(row[0] ?? '').trim();
      if (!ambiente || isSkipRowLabel(ambiente) || isAmbienteHeader(ambiente)) continue;
      const valor_liquido = toNumber(row[row.length - 1]);
      const quantidade = row.length > 2 ? toNumber(row[1]) : 0;
      if (!valor_liquido && !quantidade) continue;
      lines.push({
        ambiente,
        ambiente_codigo: null,
        quantidade,
        valor_bruto: valor_liquido,
        valor_desconto: 0,
        valor_liquido,
        ticket_medio: quantidade > 0 ? valor_liquido / quantidade : 0,
      });
    }
  }

  return buildParsed(lines, period, null);
}

// ---------------------------------------------------------------------------
// Parser do PDF Desbravador "Vendas por ambiente" (layout ACQUA MANIA / PDVs).
// O PDF é hierárquico (Ambiente › Grupo › Item), mas traz no rodapé a tabela
// "Totais por local de fechamento" com uma linha por ambiente:
//   Código | Ambiente | Moeda | Total Vendido | Qt. Pessoas | Ticket Med.
// e um "Total geral". Importamos essa tabela-resumo (autoritativa, uma linha
// por PDV) e usamos o Total geral para conferência.
//
// `rows` deve vir de extractPdfRowsByPosition (tokens por linha, ordenados por x).
// ---------------------------------------------------------------------------

const isNumericToken = (t: string): boolean => {
  const s = String(t ?? '').replace(/\s/g, '');
  return /\d/.test(s) && /^-?[\d.,]+$/.test(s);
};

const detectPeriodFromPdf = (rows: string[][]): { year: number; month: number } | null => {
  for (const row of rows) {
    const joined = row.join(' ');
    // "Período de 01/01/2026 00:00 até 01/02/2026 00:00" → mês/ano da data inicial
    const m = joined.match(/per[íi]odo\s+de\s+(\d{2})\/(\d{2})\/(\d{4})/i);
    if (m) {
      const month = Number(m[2]);
      const year = Number(m[3]);
      if (month >= 1 && month <= 12 && year >= 2000) return { year, month };
    }
  }
  return null;
};

export function parseVendasAmbientePdf(rows: string[][], fileName = ''): VendasAmbienteParsed {
  const period = detectPeriodFromPdf(rows) || detectPeriodFromText(fileName);

  // Localiza o cabeçalho da tabela-resumo: contém "Código" + "Ambiente" + "Ticket"/"Total Vendido".
  let start = -1;
  for (let i = 0; i < rows.length; i++) {
    const cells = rows[i].map(normalize);
    const hasCodigo = cells.some((c) => c === 'codigo');
    const hasAmbiente = cells.some((c) => c.includes('ambiente'));
    const hasValor = cells.some((c) => c.includes('ticket') || c.includes('total vendido'));
    if (hasCodigo && hasAmbiente && hasValor) {
      start = i;
      break;
    }
  }

  const lines: VendaAmbienteLine[] = [];
  let total_geral_reported: number | null = null;

  if (start >= 0) {
    for (let i = start + 1; i < rows.length; i++) {
      const toks = rows[i];
      if (!toks.length) continue;
      const firstNorm = normalize(toks[0]);
      if (firstNorm.startsWith('total geral') || firstNorm.startsWith('total ')) {
        const nums = toks.filter(isNumericToken).map(toNumber).filter((n) => n > 0);
        if (nums.length) total_geral_reported = Math.max(...nums);
        break;
      }
      // Linha de ambiente: primeiro token é o código numérico do PDV.
      if (!/^\d{1,6}$/.test(String(toks[0]).trim())) continue;
      const codigo = String(toks[0]).trim();
      const rest = toks.slice(1).filter((t) => normalize(t) !== 'r$');
      const nameParts: string[] = [];
      const numParts: string[] = [];
      for (const t of rest) {
        if (numParts.length === 0 && !isNumericToken(t)) nameParts.push(t);
        else numParts.push(t);
      }
      const ambiente = nameParts.join(' ').trim();
      if (!ambiente) continue;
      const valor_liquido = toNumber(numParts[0]);
      const quantidade = numParts.length > 1 ? toNumber(numParts[1]) : 0;
      const ticket_medio =
        numParts.length > 2 ? toNumber(numParts[2]) : quantidade > 0 ? valor_liquido / quantidade : 0;
      if (!valor_liquido && !quantidade) continue;
      lines.push({
        ambiente,
        ambiente_codigo: codigo,
        quantidade,
        valor_bruto: valor_liquido,
        valor_desconto: 0,
        valor_liquido,
        ticket_medio,
      });
    }
  }

  return buildParsed(lines, period, total_geral_reported);
}

function buildParsed(
  lines: VendaAmbienteLine[],
  period: { year: number; month: number } | null,
  total_geral_reported: number | null
): VendasAmbienteParsed {
  const total_quantidade = lines.reduce((s, l) => s + l.quantidade, 0);
  const total_bruto = lines.reduce((s, l) => s + l.valor_bruto, 0);
  const total_desconto = lines.reduce((s, l) => s + l.valor_desconto, 0);
  const total_liquido = lines.reduce((s, l) => s + l.valor_liquido, 0);

  return {
    lines,
    period,
    total_geral_reported,
    summary: {
      lines_count: lines.length,
      ambientes_count: new Set(lines.map((l) => l.ambiente)).size,
      total_quantidade,
      total_bruto,
      total_desconto,
      total_liquido,
      ticket_medio_geral: total_quantidade > 0 ? total_liquido / total_quantidade : 0,
    },
  };
}
