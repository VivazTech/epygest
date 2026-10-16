import type { SupabaseClient } from '@supabase/supabase-js';
import {
  aggregateAbsenteismoFromLancamentos,
  calcularAbsenteismoPct,
  defaultHorasPrevistas,
  summarizeAbsenteismo,
  type AbsenteismoConfig,
  type FuncionarioAbsenteismoAgg,
} from './absenteismo.js';
import { applyTangerinoToAbsenteismo } from './tangerinoDb.js';

export const loadAbsenteismoConfig = async (supabase: SupabaseClient): Promise<AbsenteismoConfig> => {
  const { data } = await supabase.from('folha_absenteismo_config').select('*').eq('id', 1).maybeSingle();
  return {
    horas_previstas_padrao: Number((data as any)?.horas_previstas_padrao) || 220,
    horas_dia_padrao: Number((data as any)?.horas_dia_padrao) || 8,
    dias_uteis_padrao: Number((data as any)?.dias_uteis_padrao) || 22,
  };
};

export const syncAbsenteismoCompetencia = async (
  supabase: SupabaseClient,
  year: number,
  month: number,
  empresaNome?: string | null
): Promise<{ rows: number }> => {
  const config = await loadAbsenteismoConfig(supabase);

  const [{ data: lancamentos }, { data: existentes }, { data: provisao }] = await Promise.all([
    supabase
      .from('folha_lancamentos_importados')
      .select(
        'codigo_funcionario, nome_funcionario, setor_nome, setor_codigo, descricao_rubrica, quantidade, valor_original'
      )
      .eq('competencia_ano', year)
      .eq('competencia_mes', month),
    supabase.from('folha_absenteismo_mensal').select('*').eq('year', year).eq('month', month),
    supabase.from('folha_provisao_ferias').select('codigo_funcionario, faltas').eq('year', year).eq('month', month),
  ]);

  const overrides = new Map<string, Partial<FuncionarioAbsenteismoAgg>>();
  for (const row of existentes ?? []) {
    const codigo = String((row as any).codigo_funcionario ?? '').trim();
    if (!codigo) continue;
    const fontePrev = String((row as any).fonte_previstas ?? '');
    const fonteTrab = String((row as any).fonte_trabalhadas ?? '');
    const fonteAus = String((row as any).fonte_ausencias ?? '');
    if (fontePrev.includes('manual') || fontePrev.includes('Importação')) {
      overrides.set(codigo, {
        ...(overrides.get(codigo) ?? {}),
        horas_previstas: Number((row as any).horas_previstas) || 0,
        fonte_previstas: fontePrev,
      });
    }
    if (fonteTrab.includes('manual') || fonteTrab.includes('Importação')) {
      overrides.set(codigo, {
        ...(overrides.get(codigo) ?? {}),
        horas_trabalhadas: Number((row as any).horas_trabalhadas) || 0,
        fonte_trabalhadas: fonteTrab,
      });
    }
    if (fonteAus.includes('manual') || fonteAus.includes('Importação')) {
      overrides.set(codigo, {
        ...(overrides.get(codigo) ?? {}),
        horas_ausencia: Number((row as any).horas_ausencia) || 0,
        fonte_ausencias: fonteAus,
      });
    }
  }

  const faltasProvisao = new Map<string, number>();
  for (const p of provisao ?? []) {
    const codigo = String((p as any).codigo_funcionario ?? '').trim();
    const faltas = Number((p as any).faltas) || 0;
    if (codigo && faltas > 0) faltasProvisao.set(codigo, faltas);
  }

  let agg = aggregateAbsenteismoFromLancamentos(
    (lancamentos ?? []).map((l: any) => ({
      codigo_funcionario: l.codigo_funcionario,
      nome_funcionario: l.nome_funcionario,
      setor_nome: l.setor_nome,
      setor_codigo: l.setor_codigo,
      descricao_rubrica: l.descricao_rubrica,
      quantidade: l.quantidade,
      valor_original: l.valor_original,
    })),
    config,
    overrides,
    faltasProvisao
  );

  if (!agg.size) {
    const { data: funcs } = await supabase
      .from('folha_pagamento')
      .select('matricula, nome')
      .eq('year', year)
      .eq('month', month);
    const horasPadrao = defaultHorasPrevistas(config);
    for (const f of funcs ?? []) {
      const codigo = String((f as any).matricula ?? '').trim();
      if (!codigo) continue;
      agg.set(codigo, {
        codigo_funcionario: codigo,
        nome_funcionario: String((f as any).nome ?? '').trim(),
        setor_nome: 'Sem setor',
        setor_codigo: null,
        horas_previstas: overrides.get(codigo)?.horas_previstas ?? horasPadrao,
        horas_trabalhadas: overrides.get(codigo)?.horas_trabalhadas ?? 0,
        horas_ausencia: overrides.get(codigo)?.horas_ausencia ?? 0,
        dias_faltas: faltasProvisao.get(codigo) ?? 0,
        fonte_previstas: overrides.get(codigo)?.fonte_previstas ?? 'Configuração padrão',
        fonte_trabalhadas: overrides.get(codigo)?.fonte_trabalhadas ?? 'Sem lançamentos',
        fonte_ausencias: overrides.get(codigo)?.fonte_ausencias ?? 'Sem lançamentos',
      });
    }
  }

  await supabase.from('folha_absenteismo_mensal').delete().eq('year', year).eq('month', month);

  const rows = Array.from(agg.values()).map((g) => ({
    year,
    month,
    empresa_nome: empresaNome ?? null,
    codigo_funcionario: g.codigo_funcionario,
    nome_funcionario: g.nome_funcionario,
    setor_nome: g.setor_nome,
    setor_codigo: g.setor_codigo,
    horas_previstas: g.horas_previstas,
    horas_trabalhadas: g.horas_trabalhadas,
    horas_ausencia: g.horas_ausencia,
    dias_faltas: g.dias_faltas,
    absenteismo_pct: calcularAbsenteismoPct(g.horas_ausencia, g.horas_previstas),
    fonte_previstas: g.fonte_previstas,
    fonte_trabalhadas: g.fonte_trabalhadas,
    fonte_ausencias: g.fonte_ausencias,
    updated_at: new Date().toISOString(),
  }));

  if (rows.length) {
    const { error } = await supabase.from('folha_absenteismo_mensal').insert(rows);
    if (error) throw error;
  }

  try {
    await applyTangerinoToAbsenteismo(supabase, year, month);
  } catch (e) {
    console.error('merge tangerino → absenteísmo (execute sql/48_tangerino.sql):', e);
  }

  return { rows: rows.length };
};

export const mapAbsenteismoRow = (row: any): FuncionarioAbsenteismoAgg => ({
  codigo_funcionario: String(row.codigo_funcionario ?? ''),
  nome_funcionario: String(row.nome_funcionario ?? ''),
  setor_nome: String(row.setor_nome ?? 'Sem setor'),
  setor_codigo: row.setor_codigo ?? null,
  horas_previstas: Number(row.horas_previstas) || 0,
  horas_trabalhadas: Number(row.horas_trabalhadas) || 0,
  horas_ausencia: Number(row.horas_ausencia) || 0,
  dias_faltas: Number(row.dias_faltas) || 0,
  fonte_previstas: String(row.fonte_previstas ?? ''),
  fonte_trabalhadas: String(row.fonte_trabalhadas ?? ''),
  fonte_ausencias: String(row.fonte_ausencias ?? ''),
});

export { summarizeAbsenteismo, calcularAbsenteismoPct };
