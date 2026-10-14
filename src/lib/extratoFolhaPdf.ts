/**
 * Parser do "Extrato Mensal da Folha por Centro de Custo" (PDF do Desbravador).
 * Mesma informação lógica do Extrato Mensal .xls, mas em PDF e agrupado por C.Custo.
 *
 * Recebe as linhas já extraídas por posição (tokens por linha, ordenados por x) —
 * o mesmo formato de extractPdfRowsByPosition do servidor — e devolve:
 *   - empresaNome
 *   - funcionários (matrícula, nome, cargo, situação, cpf, salário, proventos,
 *     descontos, líquido, bases e o C.Custo como "setor")
 *   - rubricas por funcionário (detalhe provento/desconto) para a apuração.
 */

export type ExtratoFolhaPdfRubrica = {
  matricula: string;
  nome: string;
  cpf: string;
  cargo: string;
  situacao: string;
  setor: string; // nome do C.Custo (ex.: "LANCHONETE")
  cc_codigo: string | null; // código do C.Custo no extrato (ex.: "3")
  codigo: string; // código da rubrica
  nome_rubrica: string;
  tipo: 'P' | 'D' | string;
  horas: string;
  valor: number;
};

export type ExtratoFolhaPdfFuncionario = {
  matricula: string | null;
  nome: string;
  situacao: string;
  cpf: string;
  cargo_cod: string | null;
  cargo: string;
  setor: string; // nome do C.Custo
  cc_codigo: string | null;
  salario: number;
  proventos: number;
  descontos: number;
  liquido: number;
  base_inss: number;
  base_fgts: number;
  base_irrf: number;
};

export type ExtratoFolhaPdfParsed = {
  empresaNome: string;
  funcionarios: ExtratoFolhaPdfFuncionario[];
  rubricas: ExtratoFolhaPdfRubrica[];
};

const toNum = (v: unknown): number => {
  let s = String(v ?? '').trim();
  if (!s) return 0;
  const neg = s.startsWith('-');
  s = s.replace(/\./g, '').replace(',', '.').replace(/[^0-9.]/g, '');
  if (!s) return 0;
  const n = Number(s);
  if (!Number.isFinite(n)) return 0;
  return neg ? -n : n;
};

// Acha o token seguinte a um rótulo (ex.: "Proventos:" -> "2.321,40").
const after = (tokens: string[], label: string): string | undefined => {
  const i = tokens.findIndex((t) => String(t).trim().toLowerCase().startsWith(label.toLowerCase()));
  return i >= 0 && tokens[i + 1] != null ? tokens[i + 1] : undefined;
};

const isCurrency = (t: string) => /^-?\d{1,3}(\.\d{3})*,\d{2}$|^-?\d+,\d{2}$/.test(String(t).trim());
const isHoras = (t: string) => /^\d{1,4}:\d{2}$/.test(String(t).trim()) || /^\d+,\d{2,3}$/.test(String(t).trim());

export function parseExtratoFolhaPdf(rows: string[][]): ExtratoFolhaPdfParsed {
  let empresaNome = '';
  // Cabeçalho: "199 - ACQUAMANIA-WATERMANIA PARQUES DE DIVERSA"
  for (const r of rows.slice(0, 6)) {
    for (const t of r) {
      const m = String(t).match(/^\d{1,4}\s*-\s*(.+)$/);
      if (m && /[A-Za-zÀ-ÿ]/.test(m[1]) && !/p[áa]gina/i.test(t)) {
        empresaNome = String(t).trim();
        break;
      }
    }
    if (empresaNome) break;
  }

  const funcionarios: ExtratoFolhaPdfFuncionario[] = [];
  const rubricas: ExtratoFolhaPdfRubrica[] = [];
  let ccNome = '';
  let ccCodigo: string | null = null;
  let cur: ExtratoFolhaPdfFuncionario | null = null;
  let emResumo = false; // ignora a seção "Resumo por Rubricas do Centro de Custo"

  const pushRubricasFromLine = (tokens: string[]) => {
    if (!cur) return;
    // Uma linha pode conter até 2 rubricas (lado provento à esquerda, desconto à direita),
    // cada uma: <codigo> <descrição...> <horas?> <valor> <P|D>. Varremos os marcadores P/D.
    for (let i = 0; i < tokens.length; i++) {
      const tipo = String(tokens[i]).trim();
      if (tipo !== 'P' && tipo !== 'D') continue;
      // valor imediatamente antes do marcador
      const valorTok = tokens[i - 1];
      if (!isCurrency(String(valorTok ?? ''))) continue;
      // código = primeiro token numérico "puro" do bloco desta rubrica
      let codeIdx = -1;
      for (let j = i - 2; j >= 0; j--) {
        const tj = String(tokens[j]).trim();
        if (tj === 'P' || tj === 'D') { codeIdx = j + 1; break; }
      }
      if (codeIdx < 0) codeIdx = 0;
      const codigo = String(tokens[codeIdx] ?? '').trim();
      const horasTok = isHoras(String(tokens[i - 2] ?? '')) ? String(tokens[i - 2]).trim() : '';
      const nameStart = codeIdx + 1;
      const nameEnd = horasTok ? i - 2 : i - 1;
      const nome_rubrica = tokens.slice(nameStart, nameEnd).join(' ').trim();
      if (!/^\d/.test(codigo)) continue;
      rubricas.push({
        matricula: String(cur.matricula ?? ''),
        nome: cur.nome,
        cpf: cur.cpf,
        cargo: cur.cargo,
        situacao: cur.situacao,
        setor: cur.setor,
        cc_codigo: cur.cc_codigo,
        codigo,
        nome_rubrica,
        tipo,
        horas: horasTok,
        valor: toNum(valorTok),
      });
    }
  };

  for (const tokens of rows) {
    if (!tokens.length) continue;
    const first = String(tokens[0]).trim();
    const joined = tokens.join(' ');

    // Cabeçalho de C.Custo (pode vir como um único token "C.Custo: 3 - LANCHONETE").
    const ccMatch = joined.match(/C\.?\s*Custo:\s*(\d+)\s*-\s*(.+?)(?:\s{2,}|$)/i);
    if (/^C\.?\s*Custo:/i.test(first) || ccMatch) {
      if (ccMatch) {
        ccCodigo = ccMatch[1].trim();
        ccNome = ccMatch[2].trim();
      }
      emResumo = false;
      continue;
    }

    if (/Resumo por Rubricas/i.test(joined)) {
      if (cur) { funcionarios.push(cur); cur = null; }
      emResumo = true;
      continue;
    }
    if (emResumo) continue;

    if (first.startsWith('Empr.:')) {
      if (cur) funcionarios.push(cur);
      cur = {
        matricula: after(tokens, 'Empr.:') ?? null,
        nome: tokens[2] ? String(tokens[2]).trim() : '',
        situacao: String(after(tokens, 'Situação:') ?? after(tokens, 'Situacao:') ?? '').trim(),
        cpf: String(after(tokens, 'CPF:') ?? '').trim(),
        cargo_cod: null,
        cargo: '',
        setor: ccNome,
        cc_codigo: ccCodigo,
        salario: 0,
        proventos: 0,
        descontos: 0,
        liquido: 0,
        base_inss: 0,
        base_fgts: 0,
        base_irrf: 0,
      };
      continue;
    }
    if (!cur) continue;

    if (first.startsWith('Cargo:')) {
      cur.cargo_cod = after(tokens, 'Cargo:') ?? null;
      cur.cargo = tokens[2] ? String(tokens[2]).trim() : '';
      cur.salario = toNum(after(tokens, 'Salário:') ?? after(tokens, 'Salario:'));
    } else if (first.startsWith('ND:')) {
      cur.proventos = toNum(after(tokens, 'Proventos:'));
      cur.descontos = toNum(after(tokens, 'Descontos:'));
      cur.liquido = toNum(after(tokens, 'Líquido:') ?? after(tokens, 'Liquido:'));
    } else if (first.startsWith('NF:')) {
      cur.base_inss = toNum(after(tokens, 'Base INSS:'));
      cur.base_fgts = toNum(after(tokens, 'Base FGTS:'));
      cur.base_irrf = toNum(after(tokens, 'Base IRRF:'));
    } else {
      // Linha de rubricas do funcionário (proventos/descontos).
      pushRubricasFromLine(tokens);
    }
  }
  if (cur) funcionarios.push(cur);

  return { empresaNome, funcionarios, rubricas };
}
