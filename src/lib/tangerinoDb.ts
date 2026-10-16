import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildColaboradorChave,
  empresaNomeFromKey,
  normalizeNomeMatch,
  summarizeTangerino,
  type TangerinoEmpresaKey,
  type TangerinoPontoRow,
} from './tangerino.js';
import { calcularAbsenteismoPct } from './absenteismo.js';

export type VinculoColaborador = {
  id?: number;
  empresa_key: string;
  tangerino_id?: string | null;
  nome_tangerino: string;
  codigo_funcionario?: string | null;
  setor_nome?: string | null;
  setor_codigo?: string | null;
  ativo?: boolean;
};

const loadVinculos = async (supabase: SupabaseClient, empresaKey?: string) => {
  let q = supabase.from('tangerino_colaborador_vinculo').select('*').eq('ativo', true);
  if (empresaKey) q = q.eq('empresa_key', empresaKey);
  const { data } = await q;
  return data ?? [];
};

const loadFolhaFuncionarios = async (supabase: SupabaseClient) => {
  const { data } = await supabase
    .from('folha_funcionarios')
    .select('codigo_funcionario, nome, setor_nome, setor_codigo')
    .eq('ativo', true);
  return data ?? [];
};

const loadSetorFromLancamentos = async (
  supabase: SupabaseClient,
  year: number,
  month: number,
  codigo: string
) => {
  const { data } = await supabase
    .from('folha_lancamentos_importados')
    .select('setor_nome, setor_codigo')
    .eq('competencia_ano', year)
    .eq('competencia_mes', month)
    .eq('codigo_funcionario', codigo)
    .limit(1)
    .maybeSingle();
  return data as { setor_nome?: string; setor_codigo?: string } | null;
};

export const resolveColaboradorVinculo = async (
  supabase: SupabaseClient,
  row: TangerinoPontoRow,
  year: number,
  month: number,
  vinculos: any[],
  folhaByCodigo: Map<string, any>,
  folhaByNome: Map<string, any>
): Promise<{
  codigo_funcionario: string | null;
  setor_nome: string | null;
  setor_codigo: string | null;
  vinculo_automatico: boolean;
}> => {
  let codigo = String(row.codigo_funcionario ?? '').trim() || null;
  let setor_nome = String(row.setor_nome ?? '').trim() || null;
  let setor_codigo = String(row.setor_codigo ?? '').trim() || null;
  let vinculo_automatico = false;

  const vinculo =
    vinculos.find(
      (v) =>
        v.empresa_key === row.empresa_key &&
        row.tangerino_id &&
        String(v.tangerino_id ?? '') === String(row.tangerino_id)
    ) ??
    vinculos.find(
      (v) =>
        v.empresa_key === row.empresa_key &&
        normalizeNomeMatch(v.nome_tangerino) === normalizeNomeMatch(row.nome_colaborador)
    );

  if (vinculo) {
    if (!codigo && vinculo.codigo_funcionario) codigo = String(vinculo.codigo_funcionario).trim();
    if (!setor_nome && vinculo.setor_nome) setor_nome = String(vinculo.setor_nome).trim();
    if (!setor_codigo && vinculo.setor_codigo) setor_codigo = String(vinculo.setor_codigo).trim();
    vinculo_automatico = true;
  }

  if (!codigo) {
    const byNome = folhaByNome.get(normalizeNomeMatch(row.nome_colaborador));
    if (byNome) {
      codigo = String(byNome.codigo_funcionario).trim();
      vinculo_automatico = true;
    }
  }

  if (codigo && folhaByCodigo.has(codigo)) {
    const f = folhaByCodigo.get(codigo);
    if (!setor_nome && f?.setor_nome) setor_nome = String(f.setor_nome).trim();
    vinculo_automatico = true;
  }

  if (codigo && !setor_nome) {
    const lanc = await loadSetorFromLancamentos(supabase, year, month, codigo);
    if (lanc?.setor_nome) {
      setor_nome = String(lanc.setor_nome).trim();
      setor_codigo = lanc.setor_codigo ? String(lanc.setor_codigo) : setor_codigo;
    }
  }

  return {
    codigo_funcionario: codigo,
    setor_nome: setor_nome || 'Sem setor',
    setor_codigo: setor_codigo || null,
    vinculo_automatico,
  };
};

export const commitTangerinoImport = async (
  supabase: SupabaseClient,
  year: number,
  month: number,
  empresaKey: TangerinoEmpresaKey,
  rows: TangerinoPontoRow[],
  meta?: { arquivo_nome?: string; origem?: string; usuario?: string }
): Promise<{ importacao_id: number; linhas: number; resumo: ReturnType<typeof summarizeTangerino> }> => {
  const vinculos = await loadVinculos(supabase, empresaKey);
  const folhaFuncs = await loadFolhaFuncionarios(supabase);
  const folhaByCodigo = new Map(folhaFuncs.map((f: any) => [String(f.codigo_funcionario).trim(), f]));
  const folhaByNome = new Map(
    folhaFuncs.map((f: any) => [normalizeNomeMatch(String(f.nome ?? '')), f])
  );

  const { data: importacao, error: impErr } = await supabase
    .from('tangerino_importacoes')
    .insert({
      year,
      month,
      empresa_key: empresaKey,
      arquivo_nome: meta?.arquivo_nome ?? null,
      origem: meta?.origem ?? 'csv',
      linhas: rows.length,
      usuario: meta?.usuario ?? null,
    })
    .select('id')
    .single();

  if (impErr || !importacao) throw impErr ?? new Error('Falha ao registrar importação.');

  const importacaoId = Number((importacao as any).id);
  const payload = [];

  for (const row of rows) {
    const resolved = await resolveColaboradorVinculo(
      supabase,
      row,
      year,
      month,
      vinculos,
      folhaByCodigo,
      folhaByNome
    );

    let horas_trabalhadas = row.horas_trabalhadas;
    if (horas_trabalhadas <= 0 && row.horas_previstas > 0 && row.horas_ausencia > 0) {
      horas_trabalhadas = Math.max(0, row.horas_previstas - row.horas_ausencia);
    }

    payload.push({
      year,
      month,
      empresa_key: row.empresa_key || empresaKey,
      colaborador_chave: buildColaboradorChave({
        tangerino_id: row.tangerino_id,
        codigo_funcionario: resolved.codigo_funcionario ?? row.codigo_funcionario,
        nome_colaborador: row.nome_colaborador,
      }),
      tangerino_id: row.tangerino_id ?? null,
      codigo_funcionario: resolved.codigo_funcionario,
      nome_colaborador: row.nome_colaborador,
      setor_nome: resolved.setor_nome,
      setor_codigo: resolved.setor_codigo,
      horas_previstas: row.horas_previstas,
      horas_trabalhadas,
      horas_ausencia: row.horas_ausencia,
      dias_faltas: row.dias_faltas,
      importacao_id: importacaoId,
      vinculo_automatico: resolved.vinculo_automatico,
      updated_at: new Date().toISOString(),
    });
  }

  await supabase
    .from('tangerino_ponto_mensal')
    .delete()
    .eq('year', year)
    .eq('month', month)
    .eq('empresa_key', empresaKey);

  if (payload.length) {
    const { error } = await supabase.from('tangerino_ponto_mensal').insert(payload);
    if (error) throw error;
  }

  return {
    importacao_id: importacaoId,
    linhas: payload.length,
    resumo: summarizeTangerino(payload),
  };
};

export const applyTangerinoToAbsenteismo = async (
  supabase: SupabaseClient,
  year: number,
  month: number,
  empresaKey?: TangerinoEmpresaKey | null
): Promise<{ rows: number }> => {
  let q = supabase.from('tangerino_ponto_mensal').select('*').eq('year', year).eq('month', month);
  if (empresaKey) q = q.eq('empresa_key', empresaKey);
  const { data: tangerinoRows, error } = await q;
  if (error) throw error;
  if (!tangerinoRows?.length) return { rows: 0 };

  const byCodigo = new Map<string, any>();
  for (const row of tangerinoRows) {
    const codigo = String((row as any).codigo_funcionario ?? '').trim();
    if (!codigo) continue;
    const empresaNome = empresaNomeFromKey(String((row as any).empresa_key ?? ''));
    const existing = byCodigo.get(codigo);
    if (!existing || Number((row as any).horas_previstas) > Number(existing.horas_previstas)) {
      byCodigo.set(codigo, { ...row, empresa_nome: empresaNome });
    }
  }

  const upserts = Array.from(byCodigo.values()).map((r: any) => ({
    year,
    month,
    empresa_nome: r.empresa_nome,
    codigo_funcionario: r.codigo_funcionario,
    nome_funcionario: r.nome_colaborador,
    setor_nome: r.setor_nome,
    setor_codigo: r.setor_codigo,
    horas_previstas: Number(r.horas_previstas) || 0,
    horas_trabalhadas: Number(r.horas_trabalhadas) || 0,
    horas_ausencia: Number(r.horas_ausencia) || 0,
    dias_faltas: Number(r.dias_faltas) || 0,
    absenteismo_pct: calcularAbsenteismoPct(Number(r.horas_ausencia) || 0, Number(r.horas_previstas) || 0),
    fonte_previstas: `Tangerino (${empresaNomeFromKey(r.empresa_key)})`,
    fonte_trabalhadas: `Tangerino (${empresaNomeFromKey(r.empresa_key)})`,
    fonte_ausencias: `Tangerino (${empresaNomeFromKey(r.empresa_key)})`,
    updated_at: new Date().toISOString(),
  }));

  if (!upserts.length) return { rows: 0 };

  const { error: upsertErr } = await supabase
    .from('folha_absenteismo_mensal')
    .upsert(upserts, { onConflict: 'year,month,codigo_funcionario' });

  if (upsertErr) throw upsertErr;
  return { rows: upserts.length };
};

export const upsertVinculo = async (supabase: SupabaseClient, v: VinculoColaborador) => {
  const row = {
    empresa_key: v.empresa_key,
    tangerino_id: v.tangerino_id ?? null,
    nome_tangerino: v.nome_tangerino,
    codigo_funcionario: v.codigo_funcionario ?? null,
    setor_nome: v.setor_nome ?? null,
    setor_codigo: v.setor_codigo ?? null,
    ativo: v.ativo !== false,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from('tangerino_colaborador_vinculo')
    .upsert(row, { onConflict: 'empresa_key,nome_tangerino' })
    .select()
    .single();
  if (error) throw error;
  return data;
};

export { summarizeTangerino, empresaNomeFromKey };
