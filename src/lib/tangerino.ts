/** Integração Tangerino — tipos, normalização e resumo de indicadores de ponto. */

import { calcularAbsenteismoPct, parseQuantidadeHoras } from './absenteismo.js';

export type TangerinoEmpresaKey = 'vivaz' | 'aqua';

export const TANGERINO_EMPRESAS: Array<{ key: TangerinoEmpresaKey; nome: string }> = [
  { key: 'vivaz', nome: 'Vivaz Cataratas' },
  { key: 'aqua', nome: 'Aqua' },
];

export type TangerinoPontoRow = {
  empresa_key: TangerinoEmpresaKey;
  tangerino_id?: string | null;
  codigo_funcionario?: string | null;
  nome_colaborador: string;
  setor_nome?: string | null;
  setor_codigo?: string | null;
  horas_previstas: number;
  horas_trabalhadas: number;
  horas_ausencia: number;
  dias_faltas: number;
};

export type TangerinoResumo = {
  horas_previstas: number;
  horas_trabalhadas: number;
  horas_ausencia: number;
  absenteismo_pct: number | null;
  funcionarios: number;
  vinculados: number;
  sem_vinculo: number;
};

export const normalizeTangerinoText = (v: string) =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

export const resolveEmpresaKey = (raw: string): TangerinoEmpresaKey | null => {
  const n = normalizeTangerinoText(raw);
  if (!n) return null;
  if (/^aqua|aquamania/.test(n)) return 'aqua';
  if (/vivaz|hotel/.test(n)) return 'vivaz';
  if (n === 'aqua') return 'aqua';
  if (n === 'vivaz') return 'vivaz';
  return null;
};

export const empresaNomeFromKey = (key: string): string =>
  TANGERINO_EMPRESAS.find((e) => e.key === key)?.nome ?? key;

export const buildColaboradorChave = (row: {
  tangerino_id?: string | null;
  codigo_funcionario?: string | null;
  nome_colaborador: string;
}): string => {
  const id = String(row.tangerino_id ?? '').trim();
  if (id) return `id:${id}`;
  const cod = String(row.codigo_funcionario ?? '').trim();
  if (cod) return `cod:${cod}`;
  return `nome:${normalizeTangerinoText(row.nome_colaborador)}`;
};

const HEADER_ALIASES: Record<string, string[]> = {
  empresa: ['empresa', 'empresa_key', 'unidade', 'grupo'],
  tangerino_id: ['tangerino_id', 'id_tangerino', 'id colaborador', 'id'],
  codigo_funcionario: ['codigo', 'codigo_funcionario', 'matricula', 'chapa', 'cracha'],
  nome_colaborador: ['nome', 'colaborador', 'funcionario', 'nome_colaborador'],
  setor_nome: ['setor', 'setor_nome', 'departamento', 'ccusto', 'centro de custo'],
  setor_codigo: ['setor_codigo', 'codigo_setor', 'cod_setor'],
  horas_previstas: ['horas_previstas', 'previstas', 'carga prevista', 'horas previstas', 'jornada'],
  horas_trabalhadas: ['horas_trabalhadas', 'trabalhadas', 'horas trabalhadas', 'realizadas'],
  horas_ausencia: ['horas_ausencia', 'ausencias', 'ausencia', 'faltas_horas', 'horas faltas'],
  dias_faltas: ['dias_faltas', 'faltas', 'dias faltas', 'dias de falta'],
};

const matchHeader = (header: string, field: keyof typeof HEADER_ALIASES): boolean => {
  const n = normalizeTangerinoText(header).replace(/[_\s]+/g, ' ');
  return HEADER_ALIASES[field].some((a) => n === normalizeTangerinoText(a).replace(/[_\s]+/g, ' ') || n.includes(normalizeTangerinoText(a)));
};

const detectDelimiter = (line: string): string => {
  const counts = [
    { d: ';', c: (line.match(/;/g) || []).length },
    { d: ',', c: (line.match(/,/g) || []).length },
    { d: '\t', c: (line.match(/\t/g) || []).length },
  ];
  counts.sort((a, b) => b.c - a.c);
  return counts[0]?.c > 0 ? counts[0].d : ';';
};

const splitCsvLine = (line: string, delimiter: string): string[] => {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && ch === delimiter) {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
};

export type ParseTangerinoCsvResult = {
  rows: TangerinoPontoRow[];
  errors: string[];
  headers: string[];
};

export const parseTangerinoCsv = (
  content: string,
  defaultEmpresaKey: TangerinoEmpresaKey
): ParseTangerinoCsvResult => {
  const lines = content
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const errors: string[] = [];
  if (!lines.length) return { rows: [], errors: ['Arquivo vazio.'], headers: [] };

  const delimiter = detectDelimiter(lines[0]);
  const headers = splitCsvLine(lines[0], delimiter);
  const fieldIndex = new Map<keyof typeof HEADER_ALIASES, number>();

  headers.forEach((h, idx) => {
    for (const field of Object.keys(HEADER_ALIASES) as Array<keyof typeof HEADER_ALIASES>) {
      if (matchHeader(h, field)) fieldIndex.set(field, idx);
    }
  });

  if (!fieldIndex.has('nome_colaborador')) {
    return {
      rows: [],
      errors: ['Coluna de nome do colaborador não encontrada. Use cabeçalho "nome" ou "colaborador".'],
      headers,
    };
  }

  const rows: TangerinoPontoRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i], delimiter);
    if (!cells.some((c) => c.trim())) continue;

    const get = (field: keyof typeof HEADER_ALIASES) => {
      const idx = fieldIndex.get(field);
      return idx != null ? String(cells[idx] ?? '').trim() : '';
    };

    const nome = get('nome_colaborador');
    if (!nome) {
      errors.push(`Linha ${i + 1}: nome do colaborador vazio.`);
      continue;
    }

    const empresaRaw = get('empresa');
    const empresa_key = (empresaRaw ? resolveEmpresaKey(empresaRaw) : null) ?? defaultEmpresaKey;

    const horas_previstas = parseQuantidadeHoras(get('horas_previstas'));
    const horas_trabalhadas = parseQuantidadeHoras(get('horas_trabalhadas'));
    let horas_ausencia = parseQuantidadeHoras(get('horas_ausencia'));
    const dias_faltas = parseQuantidadeHoras(get('dias_faltas'));

    if (horas_ausencia <= 0 && dias_faltas > 0) {
      horas_ausencia = dias_faltas * 8;
    }
    if (horas_trabalhadas <= 0 && horas_previstas > 0 && horas_ausencia > 0) {
      // será recalculado no commit se necessário
    }

    rows.push({
      empresa_key,
      tangerino_id: get('tangerino_id') || null,
      codigo_funcionario: get('codigo_funcionario') || null,
      nome_colaborador: nome,
      setor_nome: get('setor_nome') || null,
      setor_codigo: get('setor_codigo') || null,
      horas_previstas,
      horas_trabalhadas,
      horas_ausencia,
      dias_faltas,
    });
  }

  return { rows, errors, headers };
};

export const summarizeTangerino = (
  rows: Array<{
    horas_previstas: number;
    horas_trabalhadas: number;
    horas_ausencia: number;
    codigo_funcionario?: string | null;
  }>
): TangerinoResumo => {
  const horas_previstas = rows.reduce((s, r) => s + (Number(r.horas_previstas) || 0), 0);
  const horas_trabalhadas = rows.reduce((s, r) => s + (Number(r.horas_trabalhadas) || 0), 0);
  const horas_ausencia = rows.reduce((s, r) => s + (Number(r.horas_ausencia) || 0), 0);
  const vinculados = rows.filter((r) => String(r.codigo_funcionario ?? '').trim()).length;
  return {
    horas_previstas,
    horas_trabalhadas,
    horas_ausencia,
    absenteismo_pct: calcularAbsenteismoPct(horas_ausencia, horas_previstas),
    funcionarios: rows.length,
    vinculados,
    sem_vinculo: rows.length - vinculados,
  };
};

export const normalizeNomeMatch = (nome: string) =>
  normalizeTangerinoText(nome).replace(/\s+/g, ' ');
