/**
 * Importação inicial do Orçamento Aquamania a partir das planilhas originais (.xlsx):
 *  - "Aquamania Dados para Orçamento 2026-27.xlsx" (Síntese, Prev x Real, Contas novas)
 *  - "Quadro de Empregados - Aquamania - Orçamento 2026_2027.xlsx" (BAIXA, ALTA, Recreação)
 * Lê as fórmulas para descobrir a regra de cada linha e guarda os valores calculados
 * pela planilha em `conferencia`, usados para provar que o sistema chega no mesmo número.
 */
import xlsx from 'xlsx';
import {
  AQUA_PARAMETROS_PADRAO,
  REGRAS_SINTESE,
  codigoDoRotulo,
  mesesDaTemporada,
  normalizarChave,
  ymKey,
  type AquaBloco,
  type AquaCenario,
  type AquaMes,
  type AquaParametros,
  type AquaPremissas,
  type AquaVaga,
} from './aquaOrcamento.js';

type Cell = { v?: unknown; f?: string };
type Sheet = Record<string, Cell> & { '!ref'?: string };

export type AquaImportLinha = {
  ref: string;
  parent_ref: string | null;
  ordem: number;
  tipo: 'bloco' | 'grupo' | 'subgrupo' | 'conta' | 'centro_custo';
  rotulo: string;
  codigo_conta: string | null;
  bloco: AquaBloco;
  grupo: string | null;
  subgrupo: string | null;
  sintese_pessoal: 'Pessoal' | 'Extras' | 'Benefícios' | null;
  regra_previsto: string;
  regra_realizado: string;
  chave_realizado: string | null;
};

export type AquaImportPayload = {
  temporada: { nome: string; ano_inicio: number; mes_inicio: number; acumulado_ate_ano: number | null; acumulado_ate_mes: number | null };
  meses: AquaMes[];
  calendario: Record<string, 'alta' | 'baixa' | 'fechado'>;
  premissas: Record<string, AquaPremissas>;
  parametros: Partial<AquaParametros>;
  linhas: AquaImportLinha[];
  valores: Array<{ ref: string; ym: string; previsto_manual: number | null; ajuste_previsto: number; ajuste_realizado: number }>;
  vagas: AquaVaga[];
  conferencia: {
    /** ref → ym → valores que a planilha mostra */
    prevReal: Record<string, Record<string, { previsto: number; realizado: number }>>;
    resultado: Record<string, { previsto: number; realizado: number }>;
    quadro: Array<{ cenario: AquaCenario; linha: number; cargo: string; total_planilha: number }>;
    quadroTotais: Partial<Record<AquaCenario, number>>;
  };
  avisos: string[];
};

const enc = (r: number, c: number) => xlsx.utils.encode_cell({ r, c });
const cell = (ws: Sheet, r: number, c: number): Cell => (ws[enc(r, c)] as Cell) ?? {};
const txt = (ws: Sheet, r: number, c: number) => String(cell(ws, r, c).v ?? '').trim();
const num = (ws: Sheet, r: number, c: number) => {
  const v = cell(ws, r, c).v;
  const x = typeof v === 'number' ? v : Number(String(v ?? '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(x) ? x : 0;
};
const fml = (ws: Sheet, r: number, c: number) => String(cell(ws, r, c).f ?? '');
const lastRow = (ws: Sheet) => (ws['!ref'] ? xlsx.utils.decode_range(ws['!ref']).e.r : 0);

/** Data serial do Excel → {ano, mes}. */
const serialToYm = (v: unknown): { ano: number; mes: number } | null => {
  if (typeof v !== 'number' || v < 20000) return null;
  const d = xlsx.SSF.parse_date_code(v);
  return d ? { ano: d.y, mes: d.m } : null;
};

/** Soma constantes somadas ao fim da fórmula: "SUMIFS(...)+1307.7+273" → 1580.7 */
export const ajusteDaFormula = (f: string): number => {
  const m = f.match(/\)\s*((?:[+-]\s*\d+(?:\.\d+)?\s*)+)$/);
  if (!m) return 0;
  const termos: string[] = m[1].match(/[+-]\s*\d+(?:\.\d+)?/g) ?? [];
  return termos.reduce((acc, t) => acc + Number(t.replace(/\s+/g, '')), 0);
};

const sumRange = (f: string): [number, number] | null => {
  const m = f.match(/^SUM\(\$?[A-Z]+\$?(\d+):\$?[A-Z]+\$?(\d+)\)$/i);
  return m ? [Number(m[1]) - 1, Number(m[2]) - 1] : null;
};

const GRUPOS_DESPESA = new Set(['OPERACIONAIS', 'VENDAS', 'PESSOAL']);
const TITULO_GRUPO: Record<string, string> = { OPERACIONAIS: 'Operacionais', VENDAS: 'Vendas', PESSOAL: 'Pessoal' };

const PREVISTO_POR_CODIGO: Record<string, string> = {
  '362': 'comissao_influencer',
  '154': 'comissao_cartao',
  '308': 'vale_alimentacao',
  '314': 'iss',
  '315': 'icms',
  '316': 'pis',
  '317': 'cofins',
  '319': 'csll',
  '320': 'irpj',
};
const PREVISTO_POR_ROTULO: Record<string, string> = {
  'REPASSE VIVAZ': 'repasse_vivaz',
  INGRESSOS: 'ingressos',
  'SERVICOS DIVERSOS': 'servicos',
  'RECEITA DE A&B - BAR': 'bar',
  'RECEITA DE A&B - LANCHONETE': 'lanchonete',
};

export function parseAquaOrcamentoXlsx(dadosBuf: Buffer | ArrayBuffer, quadroBuf?: Buffer | ArrayBuffer | null): AquaImportPayload {
  const avisos: string[] = [];
  const wb = xlsx.read(dadosBuf, { type: 'buffer', cellFormula: true });
  const pr = wb.Sheets['Prev x Real 2026-27'] ?? wb.Sheets[wb.SheetNames.find((n) => /prev\s*x\s*real/i.test(n)) ?? ''];
  const sin = wb.Sheets['Síntese'] ?? wb.Sheets[wb.SheetNames.find((n) => /s[ií]ntese/i.test(n)) ?? ''];
  const cn = wb.Sheets['Contas novas'];
  if (!pr || !sin) throw new Error('Planilha sem as abas "Prev x Real" e "Síntese".');
  const prS = pr as Sheet;
  const sinS = sin as Sheet;

  // ── Meses (linha 4 do Prev x Real: datas a cada 3 colunas a partir de E) ──
  const primeiro = serialToYm(cell(prS, 3, 4).v);
  if (!primeiro) throw new Error('Não encontrei a data do 1º mês em Prev x Real!E4.');
  const meses = mesesDaTemporada(primeiro.ano, primeiro.mes);
  const colPrev = (i: number) => 4 + i * 3;
  const nomeTemp = `${primeiro.ano}-${String(primeiro.ano + 1).slice(2)}`;

  // "Números acumulados até" (AQ4 na planilha)
  let acum: { ano: number; mes: number } | null = null;
  for (let c = 40; c < 50; c++) {
    if (/acumulados/i.test(txt(prS, 3, c))) acum = serialToYm(cell(prS, 3, c + 1).v);
  }

  // ── Localiza linhas-chave pela coluna D ──
  const ultima = lastRow(prS);
  const labelD = (r: number) => txt(prS, r, 3);
  const acha = (re: RegExp, from = 0) => {
    for (let r = from; r <= ultima; r++) if (re.test(labelD(r))) return r;
    return -1;
  };
  const rFat = acha(/^FATURAMENTO$/i);
  const rDesp = acha(/^DESPESAS TOTAIS$/i);
  const rObras = acha(/^Obras e Investimentos$/i, rDesp);
  const rImpFat = acha(/^IMPOSTOS S\/ FATURAMENTO$/i, rDesp);
  const rImpRes = acha(/^IMPOSTOS S\/ RESULTADO$/i, rDesp);
  const rCmv = acha(/^CONSUMO DE ALIMENTOS E BEBIDAS$/i, rDesp);
  if ([rFat, rDesp, rObras, rImpFat, rImpRes, rCmv].some((r) => r < 0)) {
    throw new Error('Estrutura do Prev x Real não reconhecida (FATURAMENTO / DESPESAS TOTAIS / impostos / CMV).');
  }

  // ── Contas novas: grupos de requisições ──
  const parametros: Partial<AquaParametros> = {};
  const grupoPorCrd = new Map<string, number[]>();
  if (cn) {
    const cnS = cn as Sheet;
    const usoConsumo: number[] = [];
    const cmv: number[] = [];
    for (let r = 17; r <= 60; r++) {
      const j = cell(cnS, r, 9).v;
      if (typeof j === 'number') usoConsumo.push(j);
      const m = cell(cnS, r, 12).v;
      if (typeof m === 'number') cmv.push(m);
      const fCod = cell(cnS, r, 5).v;
      const hNome = txt(cnS, r, 7);
      if (typeof fCod === 'number' && hNome) {
        const k = normalizarChave(hNome);
        grupoPorCrd.set(k, [...(grupoPorCrd.get(k) ?? []), fCod]);
      }
    }
    if (usoConsumo.length) parametros.req_grupos_uso_consumo = [...new Set(usoConsumo)];
    if (cmv.length) parametros.req_grupos_cmv = [...new Set(cmv)];
  }

  // Alíquotas da Síntese (coluna B ao lado de ISS/ICMS/PIS/COFINS) e % CMV
  for (let r = 140; r <= 175; r++) {
    const lbl = normalizarChave(txt(sinS, r, 2));
    const b = cell(sinS, r, 1).v;
    if (typeof b !== 'number') continue;
    if (lbl.startsWith('ISS')) parametros.aliq_iss = b;
    if (lbl.startsWith('ICMS')) parametros.aliq_icms = b;
    if (lbl.startsWith('PIS')) parametros.aliq_pis = b;
    if (lbl.startsWith('COFINS')) parametros.aliq_cofins = b;
  }
  const pctCmv = cell(prS, rCmv + 7, 5).v;
  if (typeof pctCmv === 'number' && pctCmv > 0 && pctCmv < 1) parametros.pct_cmv = pctCmv;

  // ── Premissas (Síntese, colunas D..O = 12 meses) ──
  const premissas: Record<string, AquaPremissas> = {};
  const sinRow = (re: RegExp) => {
    for (let r = 0; r <= lastRow(sinS); r++) if (re.test(txt(sinS, r, 2))) return r;
    return -1;
  };
  const rowsPrem: Array<[keyof AquaPremissas, number]> = [
    ['passantes', sinRow(/^N[úu]mero de passantes$/i)],
    ['passantes_ano_ant', sinRow(/^N[úu]mero de passantes \/ ano anterior/i)],
    ['hospedes', sinRow(/^N[úu]mero de h[óo]spedes/i)],
    ['servicos_passante', sinRow(/^Receita servi[çc]os diversos/i)],
    ['bar_pax', sinRow(/^RECEITA DE A&B - BAR \/ PAX/i)],
    ['lanchonete_pax', sinRow(/^RECEITA DE A&B - LANCHONETE \/ PAX/i)],
    ['ingresso_pax', sinRow(/^INGRESSOS P\/ PAX/i)],
    ['repasse_pax', sinRow(/^VALOR DO REPASSE \/ PAX/i)],
  ];
  const rVa = sinRow(/^VALE ALIMENTA/i);
  meses.forEach((m, i) => {
    const p: any = {};
    for (const [k, r] of rowsPrem) p[k] = r >= 0 ? num(sinS, r, 3 + i) : 0;
    p.qtd_vale_alimentacao = rVa >= 0 ? num(sinS, rVa + 1, 3 + i) : 0;
    premissas[m.key] = p as AquaPremissas;
  });
  for (const [k, r] of rowsPrem) if (r < 0) avisos.push(`Premissa "${k}" não encontrada na Síntese.`);

  // ── Linhas ──
  const linhas: AquaImportLinha[] = [];
  const valores: AquaImportPayload['valores'] = [];
  const conferencia: AquaImportPayload['conferencia'] = { prevReal: {}, resultado: {}, quadro: [], quadroTotais: {} };
  let ordem = 0;

  // Linha da Síntese pelo rótulo (para achar valores digitados por cima das fórmulas)
  const sinPorRotulo = new Map<string, number>();
  for (let r = 27; r <= Math.min(lastRow(sinS), 200); r++) {
    const k = normalizarChave(txt(sinS, r, 2));
    if (k && !sinPorRotulo.has(k)) sinPorRotulo.set(k, r);
  }

  const guardarValores = (ref: string, r: number, regraPrev: string, regraReal: string, rotulo: string) => {
    conferencia.prevReal[ref] = {};
    const rSin = REGRAS_SINTESE.has(regraPrev) ? sinPorRotulo.get(normalizarChave(rotulo)) : undefined;
    meses.forEach((m, i) => {
      const cP = colPrev(i);
      const previsto = num(prS, r, cP);
      const realizado = num(prS, r, cP + 1);
      conferencia.prevReal[ref][m.key] = { previsto, realizado };
      const fReal = fml(prS, r, cP + 1);
      let ajuste = 0;
      if (regraReal === 'manual') ajuste = realizado;
      else if (fReal) ajuste = ajusteDaFormula(fReal);
      let previstoManual: number | null = regraPrev === 'manual' || regraPrev === 'repasse_vivaz' ? previsto : null;
      let ajustePrev = 0;
      if (rSin !== undefined) {
        const fSin = fml(sinS, rSin, 3 + i);
        const vSin = cell(sinS, rSin, 3 + i).v;
        if (!fSin && typeof vSin === 'number') previstoManual = vSin; // valor digitado no lugar da fórmula
        else if (fSin) ajustePrev = ajusteDaFormula(fSin); // "=IF(...)-9000"
      }
      if (previstoManual || ajuste || ajustePrev) {
        valores.push({ ref, ym: m.key, previsto_manual: previstoManual, ajuste_previsto: ajustePrev, ajuste_realizado: ajuste });
      }
    });
  };

  const regraRealizado = (r: number, rotulo: string): { regra: string; chave: string | null } => {
    const f = fml(prS, r, colPrev(0) + 1);
    if (!f) return { regra: 'manual', chave: null };
    if (sumRange(f)) return { regra: 'soma_filhos', chave: null };
    if (/RELAT[ÓO]RIO CRD/i.test(f) && /Relat[óo]rio Requisi/i.test(f)) {
      const cod = codigoDoRotulo(txt(prS, r, 1));
      return { regra: 'cmv_liquido', chave: cod };
    }
    if (/RELAT[ÓO]RIO CRD/i.test(f)) return { regra: 'crd', chave: codigoDoRotulo(rotulo) };
    if (/VENDAS AMBIENTE/i.test(f)) return { regra: 'vendas', chave: rotulo };
    if (/Relat[óo]rio Requisi[çc][õo]es'!\$F/i.test(f)) return { regra: 'req_uso_consumo', chave: rotulo };
    if (/Relat[óo]rio Requisi[çc][õo]es'!\$D/i.test(f)) {
      const grupos = grupoPorCrd.get(normalizarChave(rotulo)) ?? [];
      if (!grupos.length) avisos.push(`Sem grupo de requisição mapeado para "${rotulo}".`);
      return { regra: 'req_grupo', chave: grupos.join('|') || null };
    }
    if (/Relat[óo]rio Requisi[çc][õo]es'!\$G/i.test(f)) {
      const lit = f.match(/"([^"]+)"\)/);
      return { regra: 'req_cmv', chave: lit ? lit[1] : txt(prS, r, 2) || rotulo };
    }
    if (/^F\d+$/i.test(f)) {
      return { regra: 'req_cmv', chave: (parametros.setores_consumo_interno ?? AQUA_PARAMETROS_PADRAO.setores_consumo_interno).join('|') };
    }
    if (/Dados Folha e Extras'!\$C/i.test(f) || /Dados Folha e Extras'!\$A:\$A.*\$C:\$C/i.test(f)) return { regra: 'folha', chave: null };
    return { regra: 'manual', chave: null };
  };

  const regraPrevisto = (r: number, rotulo: string, bloco: AquaBloco): string => {
    const f = fml(prS, r, colPrev(0));
    if (sumRange(f) || /^SUMIF\(/i.test(f)) return 'soma_filhos';
    const cod = codigoDoRotulo(rotulo);
    if (cod && PREVISTO_POR_CODIGO[cod]) return PREVISTO_POR_CODIGO[cod];
    const porRotulo = PREVISTO_POR_ROTULO[normalizarChave(rotulo)];
    if (porRotulo && bloco === 'FATURAMENTO') return porRotulo;
    if (bloco === 'CMV' && /^CMV$/i.test(rotulo)) return 'cmv';
    return 'manual';
  };

  const addLinha = (l: Omit<AquaImportLinha, 'ordem'>, r: number | null) => {
    linhas.push({ ...l, ordem: ordem++ });
    if (r !== null) guardarValores(l.ref, r, l.regra_previsto, l.regra_realizado, l.rotulo);
  };

  const addConta = (
    r: number,
    bloco: AquaBloco,
    parentRef: string,
    extra: Partial<AquaImportLinha> = {}
  ) => {
    const rotulo = labelD(r);
    const rr = regraRealizado(r, rotulo);
    const tagA = txt(prS, r, 0);
    addLinha(
      {
        ref: `r${r + 1}`,
        parent_ref: parentRef,
        tipo: 'conta',
        rotulo,
        codigo_conta: codigoDoRotulo(rotulo),
        bloco,
        grupo: null,
        subgrupo: null,
        sintese_pessoal: tagA === 'Pessoal' || tagA === 'Extras' || tagA === 'Benefícios' ? tagA : null,
        regra_previsto: regraPrevisto(r, rotulo, bloco),
        regra_realizado: rr.regra,
        chave_realizado: rr.chave,
        ...extra,
      },
      r
    );
    return `r${r + 1}`;
  };

  /** Adiciona os filhos indicados por SUM(Fa:Fb) / SUM(Ea:Eb) de uma linha. */
  const addFilhosPorRange = (r: number, bloco: AquaBloco, parentRef: string, tipoFilho: AquaImportLinha['tipo'], usados: Set<number>) => {
    const range = sumRange(fml(prS, r, colPrev(0) + 1)) ?? sumRange(fml(prS, r, colPrev(0)));
    if (!range) return;
    for (let c = range[0]; c <= range[1]; c++) {
      if (usados.has(c) || !labelD(c)) continue;
      usados.add(c);
      const ref = addConta(c, bloco, parentRef, { tipo: tipoFilho });
      addFilhosPorRange(c, bloco, ref, 'centro_custo', usados);
    }
  };

  const addBloco = (ref: string, r: number, rotulo: string, bloco: AquaBloco) =>
    addLinha(
      {
        ref,
        parent_ref: null,
        tipo: 'bloco',
        rotulo,
        codigo_conta: null,
        bloco,
        grupo: null,
        subgrupo: null,
        sintese_pessoal: null,
        regra_previsto: 'soma_filhos',
        regra_realizado: 'soma_filhos',
        chave_realizado: null,
      },
      r
    );

  // FATURAMENTO
  addBloco('FATURAMENTO', rFat, 'FATURAMENTO', 'FATURAMENTO');
  {
    const usados = new Set<number>();
    for (let r = rFat + 1; r < rDesp; r++) {
      if (usados.has(r) || !labelD(r)) continue;
      usados.add(r);
      const ref = addConta(r, 'FATURAMENTO', 'FATURAMENTO');
      addFilhosPorRange(r, 'FATURAMENTO', ref, 'conta', usados);
    }
  }

  // DESPESAS TOTAIS → grupo (coluna B da conta) → subgrupo (cabeçalho posicional) → conta → centro de custo
  addBloco('DESPESAS', rDesp, 'DESPESAS TOTAIS', 'DESPESAS');
  {
    const grupoRows: Record<string, number> = {};
    for (let r = rDesp + 1; r < rObras; r++) {
      const d = normalizarChave(labelD(r));
      if (GRUPOS_DESPESA.has(d) && /^SUMIF\(/i.test(fml(prS, r, colPrev(0)))) grupoRows[d] = r;
    }
    for (const g of ['OPERACIONAIS', 'VENDAS', 'PESSOAL']) {
      addLinha(
        {
          ref: `G_${g}`,
          parent_ref: 'DESPESAS',
          tipo: 'grupo',
          rotulo: g,
          codigo_conta: null,
          bloco: 'DESPESAS',
          grupo: TITULO_GRUPO[g],
          subgrupo: null,
          sintese_pessoal: null,
          regra_previsto: 'soma_filhos',
          regra_realizado: 'soma_filhos',
          chave_realizado: null,
        },
        grupoRows[g] ?? null
      );
    }
    const usados = new Set<number>();
    const subRefs = new Set<string>();
    let subAtual = '';
    let subRow = -1;
    for (let r = rDesp + 1; r < rObras; r++) {
      if (usados.has(r)) continue;
      const d = labelD(r);
      if (!d) continue;
      const dn = normalizarChave(d);
      const fE = fml(prS, r, colPrev(0));
      const b = normalizarChave(txt(prS, r, 1));
      if (GRUPOS_DESPESA.has(dn) && /^SUMIF\(/i.test(fE)) continue;
      if (!GRUPOS_DESPESA.has(b) && sumRange(fE)) {
        subAtual = d;
        subRow = r;
        continue;
      }
      if (!GRUPOS_DESPESA.has(b)) {
        avisos.push(`Linha ${r + 1} ("${d}") sem grupo Operacionais/Vendas/Pessoal — ignorada.`);
        continue;
      }
      const subRef = `S_${b}_${normalizarChave(subAtual || 'GERAL')}`;
      if (!subRefs.has(subRef)) {
        subRefs.add(subRef);
        // Subgrupo totalmente dentro de um grupo guarda os valores da planilha para conferência
        addLinha(
          {
            ref: subRef,
            parent_ref: `G_${b}`,
            tipo: 'subgrupo',
            rotulo: subAtual || 'Geral',
            codigo_conta: null,
            bloco: 'DESPESAS',
            grupo: TITULO_GRUPO[b],
            subgrupo: subAtual || null,
            sintese_pessoal: null,
            regra_previsto: 'soma_filhos',
            regra_realizado: 'soma_filhos',
            chave_realizado: null,
          },
          null
        );
        if (subRow >= 0) {
          conferencia.prevReal[subRef] = {};
          meses.forEach((m, i) => {
            conferencia.prevReal[subRef][m.key] = { previsto: num(prS, subRow, colPrev(i)), realizado: num(prS, subRow, colPrev(i) + 1) };
          });
        }
      }
      usados.add(r);
      const ref = addConta(r, 'DESPESAS', subRef, { grupo: TITULO_GRUPO[b], subgrupo: subAtual || null });
      addFilhosPorRange(r, 'DESPESAS', ref, 'centro_custo', usados);
    }
  }

  // OBRAS, IMPOSTOS, CMV
  const addBlocoSimples = (ref: string, rHead: string, r0: number, r1: number, rotulo: string, bloco: AquaBloco, rConf: number) => {
    addBloco(ref, rConf, rotulo, bloco);
    const usados = new Set<number>();
    for (let r = r0; r <= r1; r++) {
      if (usados.has(r) || !labelD(r)) continue;
      if (sumRange(fml(prS, r, colPrev(0))) && sumRange(fml(prS, r, colPrev(0)))![0] === r + 1 && normalizarChave(labelD(r)) === normalizarChave(rHead)) continue; // subtítulo repetido
      usados.add(r);
      const refC = addConta(r, bloco, ref);
      addFilhosPorRange(r, bloco, refC, 'centro_custo', usados);
    }
  };
  addBlocoSimples('OBRAS', 'Obras e Investimentos', rObras + 1, rImpFat - 1, 'OBRAS E INVESTIMENTOS', 'OBRAS', rObras);
  addBlocoSimples('IMP_FAT', 'Impostos s/ Faturamento', rImpFat + 1, rImpRes - 1, 'IMPOSTOS S/ FATURAMENTO', 'IMP_FAT', rImpFat);
  addBlocoSimples('IMP_RES', 'Impostos s/ Resultado', rImpRes + 1, rImpRes + 4, 'IMPOSTOS S/ RESULTADO', 'IMP_RES', rImpRes);
  {
    // CMV: só CMV + CONSUMO INTERNO (+ setores); linhas de % abaixo ficam fora
    const rCmvConta = acha(/^CMV$/i, rCmv);
    const rInterno = acha(/^CONSUMO INTERNO$/i, rCmv);
    addBloco('CMV', rCmv, 'CONSUMO DE ALIMENTOS E BEBIDAS', 'CMV');
    const usados = new Set<number>();
    for (const r of [rCmvConta, rInterno]) {
      if (r < 0) continue;
      usados.add(r);
      const ref = addConta(r, 'CMV', 'CMV');
      addFilhosPorRange(r, 'CMV', ref, 'centro_custo', usados);
    }
  }

  // Resultado da planilha (linha RESULTADO)
  const rRes = acha(/^RESULTADO$/i);
  meses.forEach((m, i) => {
    conferencia.resultado[m.key] = rRes >= 0 ? { previsto: num(prS, rRes, colPrev(i)), realizado: num(prS, rRes, colPrev(i) + 1) } : { previsto: 0, realizado: 0 };
  });

  // ── Quadro de Empregados ──
  const vagas: AquaVaga[] = [];
  const calendario: Record<string, 'alta' | 'baixa' | 'fechado'> = Object.fromEntries(meses.map((m) => [m.key, 'fechado' as const]));
  if (quadroBuf) {
    const wq = xlsx.read(quadroBuf, { type: 'buffer', cellFormula: true });
    const nomeAba = (re: RegExp) => wq.SheetNames.find((n) => re.test(n));
    const setoresBaixa: string[] = [];
    const parseQuadro = (aba: string | undefined, cenario: AquaCenario) => {
      if (!aba) return;
      const ws = wq.Sheets[aba] as Sheet;
      const recreacao = cenario === 'recreacao';
      // Recreação tem a coluna NOME em B e PREMIAÇÃO em R: deslocamento de 1 coluna
      const off = recreacao ? 1 : 0;
      const C = {
        cargo: 0,
        salario: 1 + off,
        adicional: 2 + off,
        quebra: 3 + off,
        encargos: 15 + off,
        premiacao: recreacao ? 17 : -1,
        assid: recreacao ? 18 : 16,
        boas: recreacao ? 19 : 17,
        total: recreacao ? 20 : 18,
      };
      let setor = '';
      let iSetor = -1;
      let ordemV = 0;
      for (let r = 1; r <= lastRow(ws); r++) {
        const a = cell(ws, r, 0).v;
        const fTotal = fml(ws, r, C.total);
        if (/^SUM\(/i.test(fTotal) && (typeof a === 'number' || !txt(ws, r, 0))) {
          iSetor++;
          const nome = txt(ws, r, recreacao ? 2 : 1);
          setor = cenario === 'baixa' ? nome : nome || setoresBaixa[iSetor] || `SETOR ${iSetor + 1}`;
          if (cenario === 'baixa') setoresBaixa.push(nome);
          continue;
        }
        if (!setor) continue;
        if (/^[SU]\d+\+[SU]\d+/i.test(fTotal)) break; // linha de total geral
        if (!fTotal) continue;
        const cargo = txt(ws, r, 0);
        const encF = fml(ws, r, C.encargos);
        const totalF = fTotal.replace(/\$/g, '');
        vagas.push({
          cenario,
          setor,
          cargo: cargo || '(sem cargo)',
          nome: recreacao ? txt(ws, r, 1) || null : null,
          ordem: ordemV++,
          salario: num(ws, r, C.salario),
          adicional_fixo: fml(ws, r, C.adicional) ? 0 : num(ws, r, C.adicional),
          recebe_quebra_caixa: !!fml(ws, r, C.quebra),
          premiacao: C.premiacao >= 0 ? num(ws, r, C.premiacao) : 0,
          quantidade: 1,
          // Total de encargos digitado como 0, ou linha sem fórmula de FGTS (ex.: serviço terceirizado)
          encargos_zerados: (!encF && num(ws, r, C.encargos) === 0) || !fml(ws, r, 5 + off),
          sem_beneficios: num(ws, r, C.assid) === 0 && num(ws, r, C.boas) === 0,
          beneficios_no_total: (totalF.match(/[A-Z]+\d+/g) ?? []).length > 2,
          // VT digitado (sem fórmula) substitui 220 − salário × 6%
          vale_transporte_fixo:
            !fml(ws, r, C.encargos - 1) && typeof cell(ws, r, C.encargos - 1).v === 'number' ? num(ws, r, C.encargos - 1) : null,
        });
        conferencia.quadro.push({ cenario, linha: r + 1, cargo, total_planilha: num(ws, r, C.total) });
      }
      // Total geral impresso pela planilha
      for (let r = 1; r <= lastRow(ws); r++) {
        if (/^[SU]\d+\+[SU]\d+/i.test(fml(ws, r, C.total))) {
          conferencia.quadroTotais[cenario] = num(ws, r, C.total);
          break;
        }
      }
    };
    parseQuadro(nomeAba(/BAIXA/i), 'baixa');
    parseQuadro(nomeAba(/ALTA/i), 'alta');
    parseQuadro(nomeAba(/Recrea/i), 'recreacao');

    // Calendário alta/baixa no rodapé da aba BAIXA
    const abaBaixa = nomeAba(/BAIXA/i);
    if (abaBaixa) {
      const ws = wq.Sheets[abaBaixa] as Sheet;
      const nomes = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
      for (let r = 1; r <= lastRow(ws); r++) {
        const mesNome = normalizarChave(txt(ws, r, 0)).toLowerCase();
        const idx = nomes.indexOf(mesNome);
        const cen = normalizarChave(txt(ws, r, 1)).toLowerCase();
        if (idx < 0 || (cen !== 'alta' && cen !== 'baixa')) continue;
        const m = meses.find((x) => x.mes === idx + 1);
        if (m) calendario[m.key] = cen;
      }
    }
  } else {
    avisos.push('Quadro de Empregados não enviado — vagas não importadas.');
  }

  return {
    temporada: {
      nome: nomeTemp,
      ano_inicio: primeiro.ano,
      mes_inicio: primeiro.mes,
      acumulado_ate_ano: acum?.ano ?? null,
      acumulado_ate_mes: acum?.mes ?? null,
    },
    meses,
    calendario,
    premissas,
    parametros,
    linhas,
    valores,
    vagas,
    conferencia,
    avisos,
  };
}

/** Converte o payload importado para a entrada de `montarPrevReal` usando ids sintéticos (conferência offline). */
export function payloadParaEntrada(p: AquaImportPayload) {
  const idDe = new Map<string, number>();
  p.linhas.forEach((l, i) => idDe.set(l.ref, i + 1));
  const linhas = p.linhas.map((l) => ({
    id: idDe.get(l.ref)!,
    parent_id: l.parent_ref ? idDe.get(l.parent_ref) ?? null : null,
    ordem: l.ordem,
    tipo: l.tipo,
    rotulo: l.rotulo,
    codigo_conta: l.codigo_conta,
    bloco: l.bloco,
    grupo: l.grupo,
    subgrupo: l.subgrupo,
    sintese_pessoal: l.sintese_pessoal,
    regra_previsto: l.regra_previsto,
    regra_realizado: l.regra_realizado,
    chave_realizado: l.chave_realizado,
    ativo: true,
  }));
  const valores: Record<number, Record<string, { previsto_manual: number | null; ajuste_previsto: number; ajuste_realizado: number }>> = {};
  for (const v of p.valores) {
    const id = idDe.get(v.ref)!;
    (valores[id] ??= {})[v.ym] = { previsto_manual: v.previsto_manual, ajuste_previsto: v.ajuste_previsto, ajuste_realizado: v.ajuste_realizado };
  }
  return { idDe, linhas, valores };
}

export { ymKey };
