/**
 * Confere os cálculos do módulo Orçamento Aquamania contra as planilhas originais.
 * Uso: npx tsx scripts/conferir-aqua-orcamento.ts [dados.xlsx] [quadro.xlsx]
 * Padrão: ../importacao/Aquamania Dados para Orçamento 2026-27.xlsx e o Quadro de Empregados.
 */
import fs from 'node:fs';
import path from 'node:path';
import xlsx from 'xlsx';
import { parseAquaOrcamentoXlsx, payloadParaEntrada } from '../src/lib/aquaImportXlsx.js';
import {
  calcularCustoVaga,
  codigoDoRotulo,
  normalizarChave,
  ymKey,
  type AquaFontesRealizado,
  montarPrevReal,
  mesesAcumulados,
  normalizarParametros,
  resumirQuadro,
  FONTES_VAZIAS,
} from '../src/lib/aquaOrcamento.js';

const base = path.resolve(process.cwd(), '..', 'importacao');
const dadosPath = process.argv[2] ?? path.join(base, 'Aquamania Dados para Orçamento 2026-27.xlsx');
const quadroPath = process.argv[3] ?? path.join(base, 'Quadro de Empregados - Aquamania - Orçamento 2026_2027.xlsx');

const p = parseAquaOrcamentoXlsx(fs.readFileSync(dadosPath), fs.existsSync(quadroPath) ? fs.readFileSync(quadroPath) : null);
const params = normalizarParametros(p.parametros);
const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const TOL = 0.01;
let falhas = 0;
let ok = 0;

console.log(`Temporada ${p.temporada.nome} — ${p.linhas.length} linhas, ${p.vagas.length} vagas`);
for (const a of p.avisos) console.log('  aviso:', a);

// ── Quadro: cada vaga ──
for (const [i, v] of p.vagas.entries()) {
  const c = calcularCustoVaga(v, params, 'planilha');
  const esperado = p.conferencia.quadro[i];
  if (Math.abs(c.total_planilha - esperado.total_planilha) > TOL) {
    falhas++;
    console.log(`  ✗ Quadro ${v.cenario} linha ${esperado.linha} ${v.cargo}: sistema ${fmt(c.total_planilha)} × planilha ${fmt(esperado.total_planilha)}`);
  } else ok++;
}
for (const cen of ['baixa', 'alta', 'recreacao'] as const) {
  const vs = p.vagas.filter((v) => v.cenario === cen);
  if (!vs.length) continue;
  const r = resumirQuadro(vs, params, 'planilha');
  const rc = resumirQuadro(vs, params, 'corrigido');
  console.log(
    `  Quadro ${cen}: planilha imprime ${fmt(p.conferencia.quadroTotais[cen] ?? 0)} | soma correta das vagas ${fmt(r.total_planilha)} | custo c/ benefícios ${fmt(r.total_com_beneficios)} | corrigido (VT ≥ 0) ${fmt(rc.total_com_beneficios)}`
  );
}

// ── Prev x Real: previsto de todas as linhas + RESULTADO ──
const { idDe, linhas, valores } = payloadParaEntrada(p);
const saida = montarPrevReal({
  meses: p.meses,
  acumulado: mesesAcumulados(p.meses, p.temporada.acumulado_ate_ano, p.temporada.acumulado_ate_mes),
  linhas,
  valores,
  premissas: p.premissas,
  parametros: params,
  fontes: FONTES_VAZIAS,
});
const porId = new Map(saida.linhas.map((l) => [String(l.id), l]));
for (const [ref, meses] of Object.entries(p.conferencia.prevReal)) {
  const id = idDe.get(ref);
  const linha = id ? porId.get(String(id)) : undefined;
  if (!linha) continue;
  for (const m of p.meses) {
    const esperado = meses[m.key]?.previsto ?? 0;
    const obtido = linha.meses[m.key]?.previsto ?? 0;
    if (Math.abs(esperado - obtido) > TOL) {
      falhas++;
      console.log(`  ✗ Previsto ${linha.rotulo} ${m.label}: sistema ${fmt(obtido)} × planilha ${fmt(esperado)} [${linha.regra_previsto}]`);
    } else ok++;
  }
}
const res = porId.get('RESULTADO')!;
let totPrev = 0;
for (const m of p.meses) {
  const esperado = p.conferencia.resultado[m.key].previsto;
  const obtido = res.meses[m.key].previsto;
  totPrev += obtido;
  if (Math.abs(esperado - obtido) > TOL) {
    falhas++;
    console.log(`  ✗ RESULTADO previsto ${m.label}: sistema ${fmt(obtido)} × planilha ${fmt(esperado)}`);
  } else ok++;
}
console.log(`  RESULTADO previsto da temporada: ${fmt(totPrev)}`);

// ── Realizado: simula as fontes do sistema com as abas de relatório da própria planilha ──
// (RELATÓRIO CRD → rel_crd_rows, VENDAS AMBIENTE → vendas_ambiente_rows, Relatório Requisições → requisicoes_rows)
const wb = xlsx.read(fs.readFileSync(dadosPath), { type: 'buffer' });
const fontes: AquaFontesRealizado = { crd: {}, vendas: {}, reqUsoConsumo: {}, reqCmv: {}, reqGrupo: {}, folha: {} };
const add = (dest: Record<string, Record<string, number>>, chave: string, ano: unknown, mes: unknown, v: unknown) => {
  const a = Number(ano);
  const m = Number(mes);
  const x = Number(v);
  if (!chave || !a || !m || !Number.isFinite(x) || !x) return;
  const k = normalizarChave(chave);
  (dest[k] ??= {})[ymKey(a, m)] = (dest[k][ymKey(a, m)] ?? 0) + x;
};
const linhasAba = (nome: string) => xlsx.utils.sheet_to_json<unknown[]>(wb.Sheets[nome], { header: 1, raw: true }) as unknown[][];
for (const r of linhasAba('RELATÓRIO CRD ').slice(2)) {
  const cod = codigoDoRotulo(String(r[5] ?? ''));
  if (cod) add(fontes.crd, cod, r[0], r[1], r[6]);
}
for (const r of linhasAba('VENDAS AMBIENTE').slice(2)) add(fontes.vendas, String(r[3] ?? ''), r[1], r[2], r[4]);
for (const r of linhasAba('Relatório Requisições').slice(1)) {
  add(fontes.reqUsoConsumo, String(r[2] ?? ''), r[0], r[1], r[5]);
  add(fontes.reqCmv, String(r[2] ?? ''), r[0], r[1], r[6]);
  add(fontes.reqGrupo, String(r[8] ?? ''), r[0], r[1], r[3]);
}
const saidaReal = montarPrevReal({
  meses: p.meses,
  acumulado: mesesAcumulados(p.meses, p.temporada.acumulado_ate_ano, p.temporada.acumulado_ate_mes),
  linhas,
  valores,
  premissas: p.premissas,
  parametros: params,
  fontes,
});
const porIdReal = new Map(saidaReal.linhas.map((l) => [String(l.id), l]));
let okReal = 0;
let falhasReal = 0;
for (const [ref, meses] of Object.entries(p.conferencia.prevReal)) {
  const id = idDe.get(ref);
  const linha = id ? porIdReal.get(String(id)) : undefined;
  if (!linha) continue;
  for (const m of p.meses) {
    const esperado = meses[m.key]?.realizado ?? 0;
    const obtido = linha.meses[m.key]?.realizado ?? 0;
    if (Math.abs(esperado - obtido) > TOL) {
      falhasReal++;
      console.log(`  ✗ Realizado ${linha.rotulo} ${m.label}: sistema ${fmt(obtido)} × planilha ${fmt(esperado)} [${linha.regra_realizado} ${linha.chave_realizado ?? ''}]`);
    } else okReal++;
  }
}
const resReal = porIdReal.get('RESULTADO')!;
for (const m of p.meses) {
  const esperado = p.conferencia.resultado[m.key].realizado;
  const obtido = resReal.meses[m.key].realizado;
  if (Math.abs(esperado - obtido) > TOL) {
    falhasReal++;
    console.log(`  ✗ RESULTADO realizado ${m.label}: sistema ${fmt(obtido)} × planilha ${fmt(esperado)}`);
  } else okReal++;
}
console.log(`  Realizado: ${okReal} OK, ${falhasReal} divergências`);
falhas += falhasReal;
ok += okReal;

console.log(`\n${ok} conferências OK, ${falhas} divergências.`);
process.exit(falhas ? 1 : 0);
