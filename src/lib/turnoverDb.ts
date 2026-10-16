import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildTurnoverResumo,
  detectarMovimentosMes,
  type FolhaEmployeeSnapshot,
  type TurnoverConfig,
  type TurnoverFormula,
} from './turnover.js';

const prevCompetencia = (year: number, month: number) => {
  if (month <= 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
};

export const loadTurnoverConfig = async (supabase: SupabaseClient): Promise<TurnoverConfig> => {
  const { data } = await supabase.from('folha_turnover_config').select('*').eq('id', 1).maybeSingle();
  return {
    formula: (data as any)?.formula || 'desligamentos_headcount_medio',
    formula_label: (data as any)?.formula_label ?? null,
    observacao: (data as any)?.observacao ?? null,
  };
};

const loadFolhaSnapshot = async (
  supabase: SupabaseClient,
  year: number,
  month: number
): Promise<FolhaEmployeeSnapshot[]> => {
  const { data: rows } = await supabase
    .from('folha_pagamento')
    .select('matricula, nome, situacao')
    .eq('year', year)
    .eq('month', month);

  const mats = (rows ?? []).map((r: any) => String(r.matricula ?? '').trim()).filter(Boolean);
  const setorByMat = new Map<string, { nome: string; codigo: string | null }>();

  if (mats.length) {
    const [{ data: funcs }, { data: lanc }] = await Promise.all([
      supabase.from('folha_funcionarios').select('codigo_funcionario, setor_nome, setor_codigo').in('codigo_funcionario', mats),
      supabase
        .from('folha_lancamentos_importados')
        .select('codigo_funcionario, setor_nome, setor_codigo')
        .eq('competencia_ano', year)
        .eq('competencia_mes', month),
    ]);
    for (const l of lanc ?? []) {
      const mat = String((l as any).codigo_funcionario ?? '').trim();
      const setor = String((l as any).setor_nome ?? '').trim();
      if (mat && setor) {
        setorByMat.set(mat, {
          nome: setor,
          codigo: (l as any).setor_codigo ? String((l as any).setor_codigo) : null,
        });
      }
    }
    for (const f of funcs ?? []) {
      const mat = String((f as any).codigo_funcionario ?? '').trim();
      const setor = String((f as any).setor_nome ?? '').trim();
      if (mat && setor && !setorByMat.has(mat)) {
        setorByMat.set(mat, {
          nome: setor,
          codigo: (f as any).setor_codigo ? String((f as any).setor_codigo) : null,
        });
      }
    }
  }

  return (rows ?? []).map((r: any) => {
    const mat = String(r.matricula ?? '').trim();
    const setor = setorByMat.get(mat);
    return {
      matricula: mat,
      nome: String(r.nome ?? '').trim(),
      situacao: String(r.situacao ?? '').trim(),
      setor_nome: setor?.nome ?? 'Sem setor',
      setor_codigo: setor?.codigo ?? null,
    };
  });
};

export const syncTurnoverCompetencia = async (
  supabase: SupabaseClient,
  year: number,
  month: number,
  empresaNome?: string | null
): Promise<{ resumos: number; movimentos: number }> => {
  const config = await loadTurnoverConfig(supabase);
  const formula = config.formula as TurnoverFormula;
  const prev = prevCompetencia(year, month);

  const [atual, anterior] = await Promise.all([
    loadFolhaSnapshot(supabase, year, month),
    loadFolhaSnapshot(supabase, prev.year, prev.month),
  ]);

  if (!atual.length && !anterior.length) {
    return { resumos: 0, movimentos: 0 };
  }

  const movimentos = detectarMovimentosMes(atual, anterior);
  const setores = new Set<string>();
  for (const e of [...atual, ...anterior]) {
    if (e.setor_nome) setores.add(e.setor_nome);
  }

  const resumos = [
    buildTurnoverResumo(year, month, '', atual, anterior, movimentos, formula),
    ...Array.from(setores).map((setor) => {
      const codigo =
        atual.find((e) => e.setor_nome === setor)?.setor_codigo ??
        anterior.find((e) => e.setor_nome === setor)?.setor_codigo ??
        null;
      return buildTurnoverResumo(year, month, setor, atual, anterior, movimentos, formula, codigo);
    }),
  ];

  await supabase.from('folha_turnover_movimentos').delete().eq('year', year).eq('month', month);
  await supabase.from('folha_turnover_mensal').delete().eq('year', year).eq('month', month);

  if (movimentos.length) {
    await supabase.from('folha_turnover_movimentos').insert(
      movimentos.map((m) => ({
        year,
        month,
        empresa_nome: empresaNome ?? null,
        codigo_funcionario: m.codigo_funcionario,
        nome_funcionario: m.nome_funcionario,
        setor_nome: m.setor_nome,
        setor_codigo: m.setor_codigo,
        tipo: m.tipo,
        situacao: m.situacao ?? null,
      }))
    );
  }

  if (resumos.length) {
    await supabase.from('folha_turnover_mensal').insert(
      resumos.map((r) => ({
        year: r.year,
        month: r.month,
        empresa_nome: empresaNome ?? null,
        setor_nome: r.setor_nome,
        setor_codigo: r.setor_codigo,
        headcount_inicio: r.headcount_inicio,
        headcount_fim: r.headcount_fim,
        admissoes: r.admissoes,
        desligamentos: r.desligamentos,
        turnover_pct: r.turnover_pct,
        formula,
        updated_at: new Date().toISOString(),
      }))
    );
  }

  return { resumos: resumos.length, movimentos: movimentos.length };
};
