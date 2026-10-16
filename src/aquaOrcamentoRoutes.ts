/**
 * API do módulo Orçamento Aquamania (/api/aqua/*).
 * Tabelas: sql/82_aqua_orcamento.sql (escopo por empresa automático via empresaScopedSupabase).
 */
import type { Express, Request, Response } from "express";
import multer from "multer";
import { supabase } from "./lib/supabase.js";
import { requireRole } from "./lib/auth.js";
import { logImportHistory } from "./lib/importHistory.js";
import { fetchCorrectionsForCompetencia, getCorrectionFromMap } from "./lib/importCorrectionsDb.js";
import { applyFieldCorrection } from "./lib/importCorrections.js";
import {
  AQUA_PARAMETROS_PADRAO,
  FONTES_VAZIAS,
  mesesAcumulados,
  mesesDaTemporada,
  montarPrevReal,
  normalizarChave,
  normalizarParametros,
  resumirQuadro,
  ymKey,
  type AquaFontesRealizado,
  type AquaLinha,
  type AquaParametros,
  type AquaPremissas,
  type AquaValorCelula,
  type AquaVaga,
} from "./lib/aquaOrcamento.js";
import { parseAquaOrcamentoXlsx, type AquaImportPayload } from "./lib/aquaImportXlsx.js";

const LEITURA = ["admin", "controle", "finance", "diretoria"];
const ESCRITA = ["admin", "controle"];

const SQL_HINT = "Execute sql/82_aqua_orcamento.sql no Supabase.";

const PREMISSA_CAMPOS = [
  "passantes",
  "passantes_ano_ant",
  "hospedes",
  "ingresso_pax",
  "servicos_passante",
  "bar_pax",
  "lanchonete_pax",
  "repasse_pax",
  "qtd_vale_alimentacao",
] as const;

const LINHA_CAMPOS = [
  "parent_id",
  "ordem",
  "tipo",
  "rotulo",
  "codigo_conta",
  "bloco",
  "grupo",
  "subgrupo",
  "sintese_pessoal",
  "regra_previsto",
  "regra_realizado",
  "chave_realizado",
  "ativo",
] as const;

const VAGA_CAMPOS = [
  "cenario",
  "setor",
  "cargo",
  "nome",
  "ordem",
  "salario",
  "adicional_fixo",
  "recebe_quebra_caixa",
  "premiacao",
  "quantidade",
  "encargos_zerados",
  "sem_beneficios",
  "beneficios_no_total",
  "vale_transporte_fixo",
] as const;

const pick = <T extends readonly string[]>(src: Record<string, unknown>, campos: T) => {
  const out: Record<string, unknown> = {};
  for (const c of campos) if (c in src) out[c] = src[c];
  return out;
};

const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const falha = (res: Response, ctx: string, error: unknown, status = 500) => {
  console.error(`aqua ${ctx}:`, error);
  const msg = (error as { message?: string })?.message ?? String(error);
  const semTabela = /relation .*aqua_|does not exist|schema cache/i.test(msg);
  return res.status(status).json({ error: semTabela ? `Tabelas do Orçamento Aquamania indisponíveis. ${SQL_HINT}` : msg });
};

/** Busca todas as linhas (o PostgREST corta em 1000 por página). */
async function fetchAll<T>(build: () => any, pageSize = 1000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build().range(from, from + pageSize - 1);
    if (error) throw error;
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < pageSize) break;
  }
  return out;
}

type TemporadaRow = {
  id: number;
  nome: string;
  ano_inicio: number;
  mes_inicio: number;
  acumulado_ate_ano: number | null;
  acumulado_ate_mes: number | null;
  status: string;
};

async function carregarTemporada(id: number) {
  const { data, error } = await supabase.from("aqua_temporadas").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as TemporadaRow | null;
}

/** Realizado vindo dos módulos de importação do sistema, só para os 12 meses da temporada. */
async function carregarFontes(t: TemporadaRow, params: AquaParametros): Promise<{ fontes: AquaFontesRealizado; status: Record<string, string> }> {
  const meses = mesesDaTemporada(t.ano_inicio, t.mes_inicio);
  const anos = [...new Set(meses.map((m) => m.ano))];
  const noPeriodo = new Set(meses.map((m) => m.key));
  const fontes: AquaFontesRealizado = { crd: {}, vendas: {}, reqUsoConsumo: {}, reqCmv: {}, reqGrupo: {}, folha: {} };
  const status: Record<string, string> = {};
  const add = (dest: Record<string, Record<string, number>>, chave: string, ym: string, v: number) => {
    if (!chave || !Number.isFinite(v) || !v) return;
    const k = normalizarChave(chave);
    (dest[k] ??= {})[ym] = (dest[k][ym] ?? 0) + v;
  };

  // Rel. CRD — SALDO LANÇ das contas de último nível (mesma regra do DRE)
  try {
    const rows = await fetchAll<any>(() =>
      supabase.from("rel_crd_rows").select("id, year, month, nivel, codigo, saldo_lanc").in("year", anos).order("id")
    );
    const doPeriodo = rows.filter((r) => noPeriodo.has(ymKey(r.year, r.month)));
    const maxNivel = new Map<string, number>();
    for (const r of doPeriodo) {
      const ym = ymKey(r.year, r.month);
      maxNivel.set(ym, Math.max(maxNivel.get(ym) ?? 1, Number(r.nivel) || 1));
    }
    const competencias = [...new Set(doPeriodo.map((r) => ymKey(r.year, r.month)))];
    const correcoes = await Promise.all(
      competencias.map((ym) => fetchCorrectionsForCompetencia(supabase, "rel_crd_rows", Number(ym.slice(0, 4)), Number(ym.slice(5))))
    );
    const mapa = new Map(competencias.map((ym, i) => [ym, correcoes[i]]));
    for (const r of doPeriodo) {
      const ym = ymKey(r.year, r.month);
      if ((Number(r.nivel) || 1) < (maxNivel.get(ym) ?? 1)) continue;
      const corr = getCorrectionFromMap(mapa.get(ym)!, "rel_crd_rows", Number(r.id), "saldo_lanc");
      add(fontes.crd, String(r.codigo ?? "").trim(), ym, applyFieldCorrection(Number(r.saldo_lanc) || 0, corr).value);
    }
    status.crd = `${doPeriodo.length} linhas do Rel. CRD (${competencias.length} meses)`;
  } catch (e) {
    console.error("aqua fontes rel_crd_rows:", e);
    status.crd = "Rel. CRD indisponível";
  }

  // Vendas por Ambiente — valor líquido por ambiente/grupo
  try {
    const rows = await fetchAll<any>(() =>
      supabase.from("vendas_ambiente_rows").select("id, year, month, ambiente, valor_liquido").in("year", anos).order("id")
    );
    let n = 0;
    for (const r of rows) {
      const ym = ymKey(r.year, r.month);
      if (!noPeriodo.has(ym)) continue;
      n++;
      add(fontes.vendas, String(r.ambiente ?? ""), ym, Number(r.valor_liquido) || 0);
    }
    status.vendas = `${n} linhas de Vendas por Ambiente`;
  } catch (e) {
    console.error("aqua fontes vendas_ambiente_rows:", e);
    status.vendas = "Vendas por Ambiente indisponível";
  }

  // Requisições Sintética — Uso e Consumo / CMV por setor e por grupo de itens
  try {
    const rows = await fetchAll<any>(() =>
      supabase
        .from("requisicoes_rows")
        .select("id, year, month, setor_nome, grupo_codigo, valor, destino")
        .in("year", anos)
        .order("id")
    );
    const doPeriodo = rows.filter((r) => noPeriodo.has(ymKey(r.year, r.month)));
    const competencias = [...new Set(doPeriodo.map((r) => ymKey(r.year, r.month)))];
    const correcoes = await Promise.all(
      competencias.map((ym) => fetchCorrectionsForCompetencia(supabase, "requisicoes_rows", Number(ym.slice(0, 4)), Number(ym.slice(5))))
    );
    const mapa = new Map(competencias.map((ym, i) => [ym, correcoes[i]]));
    const usoSet = new Set(params.req_grupos_uso_consumo.map(Number));
    const cmvSet = new Set(params.req_grupos_cmv.map(Number));
    for (const r of doPeriodo) {
      const ym = ymKey(r.year, r.month);
      const corr = getCorrectionFromMap(mapa.get(ym)!, "requisicoes_rows", Number(r.id), "valor");
      const valor = applyFieldCorrection(Number(r.valor) || 0, corr).value;
      const grupo = Number(r.grupo_codigo);
      const destino = String(r.destino ?? "");
      // Mesma regra da planilha: classifica pelo grupo de itens (Contas novas); o destino marcado
      // na tela de Requisições só decide os grupos que não estão em nenhuma das listas
      const listado = usoSet.has(grupo) || cmvSet.has(grupo);
      const ehUso = listado ? usoSet.has(grupo) : destino === "uso_consumo";
      const ehCmv = listado ? cmvSet.has(grupo) : destino === "cmv";
      if (ehUso) add(fontes.reqUsoConsumo, String(r.setor_nome ?? ""), ym, valor);
      if (ehCmv) add(fontes.reqCmv, String(r.setor_nome ?? ""), ym, valor);
      add(fontes.reqGrupo, String(grupo), ym, valor);
    }
    status.requisicoes = `${doPeriodo.length} linhas de Requisições (${competencias.length} meses)`;
  } catch (e) {
    console.error("aqua fontes requisicoes_rows:", e);
    status.requisicoes = "Requisições indisponível";
  }

  // Folha — custo total da apuração mensal
  try {
    const { data, error } = await supabase
      .from("folha_apuracoes_mensais")
      .select("competencia_ano, competencia_mes, total_custo")
      .in("competencia_ano", anos);
    if (error) throw error;
    let n = 0;
    for (const r of data ?? []) {
      const ym = ymKey(Number((r as any).competencia_ano), Number((r as any).competencia_mes));
      if (!noPeriodo.has(ym)) continue;
      n++;
      fontes.folha[ym] = (fontes.folha[ym] ?? 0) + (Number((r as any).total_custo) || 0);
    }
    status.folha = `${n} meses de folha apurada`;
  } catch (e) {
    console.error("aqua fontes folha:", e);
    status.folha = "Folha indisponível";
  }

  return { fontes, status };
}

async function carregarDados(t: TemporadaRow) {
  const [linhas, valores, premissas, parametros, vagas, calendario] = await Promise.all([
    fetchAll<any>(() => supabase.from("aqua_orc_linhas").select("*").eq("temporada_id", t.id).order("ordem").order("id")),
    fetchAll<any>(() =>
      supabase
        .from("aqua_orc_valores")
        .select("id, linha_id, ano, mes, previsto_manual, ajuste_previsto, ajuste_realizado, obs, aqua_orc_linhas!inner(temporada_id)")
        .eq("aqua_orc_linhas.temporada_id", t.id)
        .order("id")
    ),
    fetchAll<any>(() => supabase.from("aqua_premissas").select("*").eq("temporada_id", t.id).order("id")),
    supabase.from("aqua_parametros").select("valores").eq("temporada_id", t.id).maybeSingle(),
    fetchAll<any>(() => supabase.from("aqua_quadro_vagas").select("*").eq("temporada_id", t.id).order("ordem").order("id")),
    fetchAll<any>(() => supabase.from("aqua_temporada_meses").select("ano, mes, cenario_quadro").eq("temporada_id", t.id)),
  ]);
  if ((parametros as any).error) throw (parametros as any).error;
  return {
    linhas: linhas as AquaLinha[],
    valores: valores.map((v) => ({
      linha_id: Number(v.linha_id),
      ano: Number(v.ano),
      mes: Number(v.mes),
      previsto_manual: numOrNull(v.previsto_manual),
      ajuste_previsto: Number(v.ajuste_previsto) || 0,
      ajuste_realizado: Number(v.ajuste_realizado) || 0,
      obs: v.obs ?? null,
    })),
    premissas: premissas as Array<AquaPremissas & { ano: number; mes: number }>,
    parametros: normalizarParametros((parametros as any).data?.valores ?? {}),
    vagas: vagas as AquaVaga[],
    calendario: Object.fromEntries(calendario.map((c: any) => [ymKey(c.ano, c.mes), c.cenario_quadro])) as Record<string, string>,
  };
}

function entradaPrevReal(t: TemporadaRow, d: Awaited<ReturnType<typeof carregarDados>>, fontes: AquaFontesRealizado) {
  const meses = mesesDaTemporada(t.ano_inicio, t.mes_inicio);
  const valores: Record<number, Record<string, AquaValorCelula>> = {};
  for (const v of d.valores) (valores[v.linha_id] ??= {})[ymKey(v.ano, v.mes)] = v;
  const premissas: Record<string, AquaPremissas> = {};
  for (const p of d.premissas) premissas[ymKey(p.ano, p.mes)] = p;
  const folhaQuadro: Record<string, number> = {};
  for (const m of meses) {
    const cen = d.calendario[m.key];
    if (cen !== "alta" && cen !== "baixa") continue;
    folhaQuadro[m.key] = resumirQuadro(d.vagas.filter((v) => v.cenario === cen), d.parametros).total_planilha;
  }
  return {
    meses,
    acumulado: mesesAcumulados(meses, t.acumulado_ate_ano, t.acumulado_ate_mes),
    linhas: d.linhas.map((l) => ({ ...l, id: Number(l.id), parent_id: l.parent_id ? Number(l.parent_id) : null })),
    valores,
    premissas,
    parametros: d.parametros,
    fontes,
    folhaQuadro,
  };
}

/** Grava o payload importado como uma temporada nova. */
async function gravarImportacao(p: AquaImportPayload, substituir: boolean) {
  const { data: existente, error: errEx } = await supabase.from("aqua_temporadas").select("id").eq("nome", p.temporada.nome).maybeSingle();
  if (errEx) throw errEx;
  if (existente) {
    if (!substituir) {
      const err: any = new Error(`Já existe a temporada ${p.temporada.nome}. Marque "substituir" para reimportar.`);
      err.status = 409;
      throw err;
    }
    const { error } = await supabase.from("aqua_temporadas").delete().eq("id", (existente as any).id);
    if (error) throw error;
  }

  const { data: temp, error: errT } = await supabase
    .from("aqua_temporadas")
    .insert({ ...p.temporada, status: "aberta" })
    .select("*")
    .single();
  if (errT) throw errT;
  const tid = Number((temp as any).id);

  const ins = async (tabela: string, rows: Record<string, unknown>[]) => {
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supabase.from(tabela).insert(rows.slice(i, i + 500));
      if (error) throw error;
    }
  };

  await ins(
    "aqua_temporada_meses",
    p.meses.map((m) => ({ temporada_id: tid, ano: m.ano, mes: m.mes, cenario_quadro: p.calendario[m.key] ?? "fechado" }))
  );
  await ins(
    "aqua_premissas",
    p.meses.map((m) => ({ temporada_id: tid, ano: m.ano, mes: m.mes, ...p.premissas[m.key] }))
  );
  await ins("aqua_parametros", [{ temporada_id: tid, valores: { ...AQUA_PARAMETROS_PADRAO, ...p.parametros } }]);

  // Linhas por nível (pais antes dos filhos); "ordem" é única na importação e serve de chave de volta
  const idPorRef = new Map<string, number>();
  const nivel = new Map<string, number>();
  for (const l of p.linhas) nivel.set(l.ref, l.parent_ref ? (nivel.get(l.parent_ref) ?? 0) + 1 : 0);
  const maxNivel = Math.max(0, ...nivel.values());
  for (let lv = 0; lv <= maxNivel; lv++) {
    const doNivel = p.linhas.filter((l) => nivel.get(l.ref) === lv);
    for (let i = 0; i < doNivel.length; i += 500) {
      const lote = doNivel.slice(i, i + 500);
      const { data, error } = await supabase
        .from("aqua_orc_linhas")
        .insert(
          lote.map((l) => ({
            temporada_id: tid,
            parent_id: l.parent_ref ? idPorRef.get(l.parent_ref) ?? null : null,
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
          }))
        )
        .select("id, ordem");
      if (error) throw error;
      const refPorOrdem = new Map(lote.map((l) => [l.ordem, l.ref]));
      for (const r of data ?? []) idPorRef.set(refPorOrdem.get(Number((r as any).ordem))!, Number((r as any).id));
    }
  }

  await ins(
    "aqua_orc_valores",
    p.valores
      .filter((v) => idPorRef.has(v.ref))
      .map((v) => ({
        linha_id: idPorRef.get(v.ref),
        ano: Number(v.ym.slice(0, 4)),
        mes: Number(v.ym.slice(5)),
        previsto_manual: v.previsto_manual,
        ajuste_previsto: v.ajuste_previsto,
        ajuste_realizado: v.ajuste_realizado,
      }))
  );
  await ins(
    "aqua_quadro_vagas",
    p.vagas.map((v) => ({ temporada_id: tid, ...pick(v as unknown as Record<string, unknown>, VAGA_CAMPOS) }))
  );
  return temp as TemporadaRow;
}

export function registerAquaOrcamentoRoutes(app: Express) {
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 30 * 1024 * 1024 } });
  const idParam = (req: Request) => Number(req.params.id);

  app.get("/api/aqua/temporadas", requireRole(...LEITURA), async (_req, res) => {
    const { data, error } = await supabase.from("aqua_temporadas").select("*").order("ano_inicio", { ascending: false });
    if (error) return falha(res, "temporadas", error);
    res.json({ temporadas: data ?? [] });
  });

  app.post("/api/aqua/temporadas", requireRole(...ESCRITA), async (req, res) => {
    const b = req.body ?? {};
    const ano = Number(b.ano_inicio);
    const mes = Number(b.mes_inicio) || 9;
    if (!ano || mes < 1 || mes > 12) return res.status(400).json({ error: "Informe ano e mês inicial." });
    const nome = String(b.nome || `${ano}-${String(ano + 1).slice(2)}`).trim();
    const { data, error } = await supabase
      .from("aqua_temporadas")
      .insert({ nome, ano_inicio: ano, mes_inicio: mes, status: "aberta" })
      .select("*")
      .single();
    if (error) return falha(res, "criar temporada", error);
    const t = data as TemporadaRow;
    const meses = mesesDaTemporada(ano, mes);
    const r1 = await supabase.from("aqua_temporada_meses").insert(meses.map((m) => ({ temporada_id: t.id, ano: m.ano, mes: m.mes })));
    const r2 = await supabase.from("aqua_premissas").insert(meses.map((m) => ({ temporada_id: t.id, ano: m.ano, mes: m.mes })));
    const r3 = await supabase.from("aqua_parametros").insert({ temporada_id: t.id, valores: AQUA_PARAMETROS_PADRAO });
    const err = r1.error || r2.error || r3.error;
    if (err) return falha(res, "criar temporada (meses)", err);
    res.status(201).json({ temporada: t });
  });

  app.patch("/api/aqua/temporadas/:id", requireRole(...ESCRITA), async (req, res) => {
    const b = req.body ?? {};
    const upd: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof b.nome === "string" && b.nome.trim()) upd.nome = b.nome.trim();
    if (typeof b.status === "string") upd.status = b.status;
    if ("acumulado_ate_ano" in b) upd.acumulado_ate_ano = numOrNull(b.acumulado_ate_ano);
    if ("acumulado_ate_mes" in b) upd.acumulado_ate_mes = numOrNull(b.acumulado_ate_mes);
    const { data, error } = await supabase.from("aqua_temporadas").update(upd).eq("id", idParam(req)).select("*").single();
    if (error) return falha(res, "atualizar temporada", error);
    res.json({ temporada: data });
  });

  app.delete("/api/aqua/temporadas/:id", requireRole("admin"), async (req, res) => {
    const { error } = await supabase.from("aqua_temporadas").delete().eq("id", idParam(req));
    if (error) return falha(res, "excluir temporada", error);
    res.json({ ok: true });
  });

  app.put("/api/aqua/temporadas/:id/calendario", requireRole(...ESCRITA), async (req, res) => {
    const t = await carregarTemporada(idParam(req)).catch((e) => (falha(res, "calendario", e), null));
    if (!t) return res.headersSent ? undefined : res.status(404).json({ error: "Temporada não encontrada." });
    const cal = (req.body?.calendario ?? {}) as Record<string, string>;
    const rows = mesesDaTemporada(t.ano_inicio, t.mes_inicio)
      .filter((m) => ["alta", "baixa", "fechado"].includes(cal[m.key]))
      .map((m) => ({ temporada_id: t.id, ano: m.ano, mes: m.mes, cenario_quadro: cal[m.key] }));
    const { error } = await supabase.from("aqua_temporada_meses").upsert(rows, { onConflict: "temporada_id,ano,mes" });
    if (error) return falha(res, "calendario", error);
    res.json({ ok: true });
  });

  // Tudo que a tela precisa: estrutura, valores, premissas, parâmetros, quadro e fontes do realizado
  app.get("/api/aqua/temporadas/:id/dados", requireRole(...LEITURA), async (req, res) => {
    try {
      const t = await carregarTemporada(idParam(req));
      if (!t) return res.status(404).json({ error: "Temporada não encontrada." });
      const d = await carregarDados(t);
      const { fontes, status } = await carregarFontes(t, d.parametros);
      res.json({ temporada: t, meses: mesesDaTemporada(t.ano_inicio, t.mes_inicio), ...d, fontes, fontes_status: status });
    } catch (e) {
      falha(res, "dados", e);
    }
  });

  app.get("/api/aqua/temporadas/:id/prev-real", requireRole(...LEITURA), async (req, res) => {
    try {
      const t = await carregarTemporada(idParam(req));
      if (!t) return res.status(404).json({ error: "Temporada não encontrada." });
      const d = await carregarDados(t);
      const { fontes, status } = await carregarFontes(t, d.parametros);
      const saida = montarPrevReal(entradaPrevReal(t, d, fontes));
      res.json({ temporada: t, ...saida, fontes_status: status });
    } catch (e) {
      falha(res, "prev-real", e);
    }
  });

  app.put("/api/aqua/temporadas/:id/premissas", requireRole(...ESCRITA), async (req, res) => {
    const { ano, mes, campo, valor } = req.body ?? {};
    if (!PREMISSA_CAMPOS.includes(campo)) return res.status(400).json({ error: "Campo inválido." });
    const { error } = await supabase
      .from("aqua_premissas")
      .upsert(
        { temporada_id: idParam(req), ano: Number(ano), mes: Number(mes), [campo]: Number(valor) || 0, updated_at: new Date().toISOString() },
        { onConflict: "temporada_id,ano,mes" }
      );
    if (error) return falha(res, "premissas", error);
    res.json({ ok: true });
  });

  app.put("/api/aqua/temporadas/:id/parametros", requireRole(...ESCRITA), async (req, res) => {
    const valores = normalizarParametros(req.body?.valores ?? {});
    const { error } = await supabase
      .from("aqua_parametros")
      .upsert({ temporada_id: idParam(req), valores, updated_at: new Date().toISOString() }, { onConflict: "temporada_id" });
    if (error) return falha(res, "parametros", error);
    res.json({ parametros: valores });
  });

  app.patch("/api/aqua/valores", requireRole(...ESCRITA), async (req, res) => {
    const { linha_id, ano, mes, campo, valor } = req.body ?? {};
    if (!["previsto_manual", "ajuste_previsto", "ajuste_realizado", "obs"].includes(campo)) {
      return res.status(400).json({ error: "Campo inválido." });
    }
    const v = campo === "obs" ? (valor ? String(valor) : null) : campo === "previsto_manual" ? numOrNull(valor) : Number(valor) || 0;
    const { error } = await supabase
      .from("aqua_orc_valores")
      .upsert(
        { linha_id: Number(linha_id), ano: Number(ano), mes: Number(mes), [campo]: v, updated_at: new Date().toISOString() },
        { onConflict: "linha_id,ano,mes" }
      );
    if (error) return falha(res, "valores", error);
    res.json({ ok: true });
  });

  app.post("/api/aqua/temporadas/:id/linhas", requireRole(...ESCRITA), async (req, res) => {
    const body = pick(req.body ?? {}, LINHA_CAMPOS);
    if (!body.rotulo || !body.bloco) return res.status(400).json({ error: "Informe rótulo e bloco." });
    const { data, error } = await supabase
      .from("aqua_orc_linhas")
      .insert({ ...body, temporada_id: idParam(req) })
      .select("*")
      .single();
    if (error) return falha(res, "criar linha", error);
    res.status(201).json({ linha: data });
  });

  app.patch("/api/aqua/linhas/:id", requireRole(...ESCRITA), async (req, res) => {
    const body = pick(req.body ?? {}, LINHA_CAMPOS);
    const { data, error } = await supabase.from("aqua_orc_linhas").update(body).eq("id", idParam(req)).select("*").single();
    if (error) return falha(res, "atualizar linha", error);
    res.json({ linha: data });
  });

  app.delete("/api/aqua/linhas/:id", requireRole(...ESCRITA), async (req, res) => {
    const { error } = await supabase.from("aqua_orc_linhas").delete().eq("id", idParam(req));
    if (error) return falha(res, "excluir linha", error);
    res.json({ ok: true });
  });

  app.post("/api/aqua/temporadas/:id/vagas", requireRole(...ESCRITA), async (req, res) => {
    const body = pick(req.body ?? {}, VAGA_CAMPOS);
    if (!body.cenario || !body.setor) return res.status(400).json({ error: "Informe cenário e setor." });
    const { data, error } = await supabase
      .from("aqua_quadro_vagas")
      .insert({ ...body, temporada_id: idParam(req) })
      .select("*")
      .single();
    if (error) return falha(res, "criar vaga", error);
    res.status(201).json({ vaga: data });
  });

  app.patch("/api/aqua/vagas/:id", requireRole(...ESCRITA), async (req, res) => {
    const body = pick(req.body ?? {}, VAGA_CAMPOS);
    const { data, error } = await supabase.from("aqua_quadro_vagas").update(body).eq("id", idParam(req)).select("*").single();
    if (error) return falha(res, "atualizar vaga", error);
    res.json({ vaga: data });
  });

  app.delete("/api/aqua/vagas/:id", requireRole(...ESCRITA), async (req, res) => {
    const { error } = await supabase.from("aqua_quadro_vagas").delete().eq("id", idParam(req));
    if (error) return falha(res, "excluir vaga", error);
    res.json({ ok: true });
  });

  app.post("/api/aqua/temporadas/:id/quadro/duplicar", requireRole(...ESCRITA), async (req, res) => {
    const de = String(req.body?.de ?? "");
    const para = String(req.body?.para ?? "");
    if (!["baixa", "alta", "recreacao"].includes(de) || !["baixa", "alta", "recreacao"].includes(para) || de === para) {
      return res.status(400).json({ error: "Cenários inválidos." });
    }
    const tid = idParam(req);
    const { data, error } = await supabase.from("aqua_quadro_vagas").select("*").eq("temporada_id", tid).eq("cenario", de);
    if (error) return falha(res, "duplicar quadro", error);
    const del = await supabase.from("aqua_quadro_vagas").delete().eq("temporada_id", tid).eq("cenario", para);
    if (del.error) return falha(res, "duplicar quadro", del.error);
    const rows = (data ?? []).map((v: any) => ({ ...pick(v, VAGA_CAMPOS), cenario: para, temporada_id: tid }));
    if (rows.length) {
      const ins = await supabase.from("aqua_quadro_vagas").insert(rows);
      if (ins.error) return falha(res, "duplicar quadro", ins.error);
    }
    res.json({ ok: true, copiadas: rows.length });
  });

  // Importação inicial a partir dos .xlsx originais (preview não grava nada)
  const camposUpload = upload.fields([
    { name: "dados", maxCount: 1 },
    { name: "quadro", maxCount: 1 },
  ]);
  const lerPayload = (req: Request) => {
    const files = (req.files ?? {}) as Record<string, Express.Multer.File[]>;
    const dados = files.dados?.[0];
    if (!dados) throw Object.assign(new Error('Envie a planilha "Aquamania Dados para Orçamento" (.xlsx).'), { status: 400 });
    return { payload: parseAquaOrcamentoXlsx(dados.buffer, files.quadro?.[0]?.buffer ?? null), nome: dados.originalname };
  };

  app.post("/api/aqua/import/preview", requireRole(...ESCRITA), camposUpload, async (req, res) => {
    try {
      const { payload } = lerPayload(req);
      // Recalcula o previsto com as fórmulas do sistema e compara com o que a planilha mostra
      const idDe = new Map(payload.linhas.map((l, i) => [l.ref, i + 1]));
      const valores: Record<number, Record<string, AquaValorCelula>> = {};
      for (const v of payload.valores) (valores[idDe.get(v.ref)!] ??= {})[v.ym] = v;
      const saida = montarPrevReal({
        meses: payload.meses,
        acumulado: mesesAcumulados(payload.meses, payload.temporada.acumulado_ate_ano, payload.temporada.acumulado_ate_mes),
        linhas: payload.linhas.map((l) => ({
          ...l,
          id: idDe.get(l.ref)!,
          parent_id: l.parent_ref ? idDe.get(l.parent_ref) ?? null : null,
          ativo: true,
        })),
        valores,
        premissas: payload.premissas,
        parametros: normalizarParametros(payload.parametros),
        fontes: FONTES_VAZIAS,
      });
      const res0 = saida.linhas.find((l) => l.id === "RESULTADO")!;
      let divergencias = 0;
      for (const [ref, porMes] of Object.entries(payload.conferencia.prevReal)) {
        const l = saida.linhas.find((x) => x.id === idDe.get(ref));
        if (!l) continue;
        for (const m of payload.meses) if (Math.abs((porMes[m.key]?.previsto ?? 0) - l.meses[m.key].previsto) > 0.01) divergencias++;
      }
      res.json({
        temporada: payload.temporada,
        linhas: payload.linhas.length,
        valores: payload.valores.length,
        vagas: payload.vagas.length,
        avisos: payload.avisos,
        conferencia: {
          divergencias_previsto: divergencias,
          resultado_previsto_sistema: payload.meses.reduce((acc, m) => acc + res0.meses[m.key].previsto, 0),
          resultado_previsto_planilha: payload.meses.reduce((acc, m) => acc + payload.conferencia.resultado[m.key].previsto, 0),
          quadro_totais_planilha: payload.conferencia.quadroTotais,
        },
      });
    } catch (e: any) {
      falha(res, "import preview", e, e?.status ?? 400);
    }
  });

  app.post("/api/aqua/import/commit", requireRole(...ESCRITA), camposUpload, async (req, res) => {
    let nome = "";
    try {
      const lido = lerPayload(req);
      nome = lido.nome;
      const substituir = String((req.body ?? {}).substituir ?? "") === "true";
      const temporada = await gravarImportacao(lido.payload, substituir);
      await logImportHistory({
        source_type: "aqua_orcamento",
        file_name: nome,
        status: "success",
        year: lido.payload.temporada.ano_inicio,
        month: lido.payload.temporada.mes_inicio,
        records_count: lido.payload.linhas.length + lido.payload.vagas.length,
        user: req.user ?? null,
        summary: { temporada: temporada.nome, linhas: lido.payload.linhas.length, vagas: lido.payload.vagas.length },
      });
      res.status(201).json({ temporada });
    } catch (e: any) {
      await logImportHistory({
        source_type: "aqua_orcamento",
        file_name: nome || null,
        status: "error",
        user: req.user ?? null,
        error_message: e?.message ?? String(e),
      }).catch(() => null);
      falha(res, "import commit", e, e?.status ?? 500);
    }
  });
}
