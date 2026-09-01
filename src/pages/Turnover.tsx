import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CalendarRange,
  Layers,
  Loader2,
  RefreshCcw,
  UserMinus,
  UserPlus,
  Users,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { FORMULA_OPTIONS, type TurnoverFormula } from '../lib/turnover';

const MESES = [
  '',
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

type TurnoverResponse = {
  year: number;
  month_from: number;
  month_to: number;
  config: {
    formula: TurnoverFormula;
    formula_label?: string;
    observacao?: string;
    formulas_disponiveis: typeof FORMULA_OPTIONS;
  };
  filtros: { empresas: string[]; setores: Array<{ nome: string; codigo?: string | null }> };
  resumo: {
    admissoes: number;
    desligamentos: number;
    headcount_inicio: number;
    headcount_fim: number;
    turnover_pct: number | null;
  };
  evolucao: Array<{
    month: number;
    admissoes: number;
    desligamentos: number;
    headcount_inicio: number;
    headcount_fim: number;
    turnover_pct: number | null;
  }>;
  movimentos: Array<{
    codigo_funcionario: string;
    nome_funcionario: string;
    setor_nome: string;
    tipo: 'admissao' | 'desligamento';
    situacao?: string;
    month: number;
  }>;
  setores_resumo: Array<{
    setor_nome: string;
    admissoes: number;
    desligamentos: number;
    headcount_fim: number;
    turnover_pct: number | null;
  }>;
};

const fmtPct = (v: number | null) => (v == null ? '—' : `${v.toFixed(2)}%`);

export const TurnoverPage: React.FC = () => {
  const now = new Date();
  const [year, setYear] = useState(String(now.getFullYear()));
  const [monthFrom, setMonthFrom] = useState(String(now.getMonth() + 1));
  const [monthTo, setMonthTo] = useState(String(now.getMonth() + 1));
  const [empresa, setEmpresa] = useState('');
  const [setor, setSetor] = useState('');
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<TurnoverResponse | null>(null);
  const [formula, setFormula] = useState<TurnoverFormula>('desligamentos_headcount_medio');
  const [observacao, setObservacao] = useState('');
  const [savingConfig, setSavingConfig] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams({ year, month_from: monthFrom, month_to: monthTo });
      if (empresa.trim()) qs.set('empresa', empresa.trim());
      if (setor.trim()) qs.set('setor', setor.trim());
      const res = await fetch(`/api/folha/turnover?${qs}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Falha ao carregar turnover.');
      setData(json);
      if (json.config?.formula) setFormula(json.config.formula);
      if (json.config?.observacao != null) setObservacao(json.config.observacao);
    } catch (err: any) {
      setData(null);
      setError(err?.message || 'Erro ao carregar.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, monthFrom, monthTo, empresa, setor]);

  const processar = async () => {
    setProcessing(true);
    try {
      const res = await fetch('/api/folha/turnover/processar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: Number(year), month: Number(monthFrom) }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Falha ao processar.');
      await load();
    } catch (err: any) {
      alert(err?.message || 'Erro ao processar.');
    } finally {
      setProcessing(false);
    }
  };

  const saveConfig = async () => {
    setSavingConfig(true);
    try {
      const res = await fetch('/api/folha/turnover/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formula, observacao }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Falha ao salvar fórmula.');
      await load();
    } catch (err: any) {
      alert(err?.message || 'Erro ao salvar.');
    } finally {
      setSavingConfig(false);
    }
  };

  const titulo = useMemo(() => {
    const m1 = MESES[Number(monthFrom)] || monthFrom;
    const m2 = MESES[Number(monthTo)] || monthTo;
    if (monthFrom === monthTo) return `Turnover — ${String(m1).toUpperCase()}/${year}`;
    return `Turnover — ${m1} a ${m2}/${year}`;
  }, [monthFrom, monthTo, year]);

  const formulaDesc = FORMULA_OPTIONS.find((f) => f.id === formula)?.descricao;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Turnover</h2>
          <p className="text-sm text-slate-500">
            Rotatividade de pessoal com admissões e desligamentos por competência.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={processar}
            disabled={processing}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-sm font-bold rounded-xl hover:bg-slate-50 disabled:opacity-60"
          >
            {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
            Reprocessar mês inicial
          </button>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#004D40] text-white text-sm font-bold rounded-xl hover:bg-[#003d33] disabled:opacity-60"
          >
            <RefreshCcw className={cn('w-4 h-4', loading && 'animate-spin')} />
            Atualizar
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <strong>Pendente:</strong> confirmar com o RH a fórmula exata de turnover utilizada atualmente.
        Enquanto isso, o cálculo usa a fórmula configurável abaixo (padrão: desligamentos ÷ headcount médio).
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
        <label className="block text-sm xl:col-span-2">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
            <CalendarRange className="w-3 h-3" /> Período
          </span>
          <div className="mt-1 flex gap-2">
            <select value={monthFrom} onChange={(e) => setMonthFrom(e.target.value)} className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm">
              {MESES.slice(1).map((l, i) => (
                <option key={l} value={String(i + 1)}>{l}</option>
              ))}
            </select>
            <span className="self-center text-slate-400 text-xs">até</span>
            <select value={monthTo} onChange={(e) => setMonthTo(e.target.value)} className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm">
              {MESES.slice(1).map((l, i) => (
                <option key={l} value={String(i + 1)}>{l}</option>
              ))}
            </select>
            <input type="number" value={year} onChange={(e) => setYear(e.target.value)} className="w-24 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm" />
          </div>
        </label>
        <label className="block text-sm">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
            <Building2 className="w-3 h-3" /> Empresa
          </span>
          <select value={empresa} onChange={(e) => setEmpresa(e.target.value)} className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm">
            <option value="">Todas</option>
            {(data?.filtros.empresas ?? []).map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm md:col-span-2">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
            <Layers className="w-3 h-3" /> Setor
          </span>
          <select value={setor} onChange={(e) => setSetor(e.target.value)} className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm">
            <option value="">Consolidado geral</option>
            {(data?.filtros.setores ?? []).map((s) => (
              <option key={s.nome} value={s.nome}>{s.codigo ? `${s.codigo} · ` : ''}{s.nome}</option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {data && (
        <>
          <div className="bg-gradient-to-br from-indigo-900 to-slate-900 rounded-2xl shadow-lg p-6 text-white">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/60">{titulo}</p>
            {setor && <p className="text-sm mt-1">Setor: <span className="font-bold">{setor}</span></p>}
            <div className="mt-5 grid grid-cols-2 md:grid-cols-5 gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-white/60">Headcount início</p>
                <p className="text-2xl font-extrabold tabular-nums">{data.resumo.headcount_inicio}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-white/60">Headcount fim</p>
                <p className="text-2xl font-extrabold tabular-nums">{data.resumo.headcount_fim}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-emerald-300 flex items-center gap-1">
                  <UserPlus className="w-3 h-3" /> Admissões
                </p>
                <p className="text-2xl font-extrabold tabular-nums text-emerald-300">{data.resumo.admissoes}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-rose-300 flex items-center gap-1">
                  <UserMinus className="w-3 h-3" /> Desligamentos
                </p>
                <p className="text-2xl font-extrabold tabular-nums text-rose-300">{data.resumo.desligamentos}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-white/60">Turnover</p>
                <p className="text-2xl font-extrabold tabular-nums">{fmtPct(data.resumo.turnover_pct)}</p>
              </div>
            </div>
            {formulaDesc && (
              <p className="text-[10px] text-white/50 mt-3">Fórmula: {formulaDesc}</p>
            )}
          </div>

          {data.evolucao.length > 1 && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <h3 className="text-sm font-bold text-slate-900 mb-3">Evolução mensal</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                {data.evolucao.map((e) => (
                  <div key={e.month} className="rounded-xl border border-slate-100 p-3 text-center">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">{MESES[e.month]?.slice(0, 3)}</p>
                    <p className="text-lg font-extrabold tabular-nums mt-1">{fmtPct(e.turnover_pct)}</p>
                    <p className="text-[10px] text-emerald-600">+{e.admissoes}</p>
                    <p className="text-[10px] text-rose-600">−{e.desligamentos}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <h3 className="text-sm font-bold text-slate-900 mb-3">Fórmula de cálculo</h3>
            <div className="flex flex-wrap gap-3 items-end">
              <label className="text-sm flex-1 min-w-[240px]">
                <span className="text-xs text-slate-500">Método</span>
                <select
                  value={formula}
                  onChange={(e) => setFormula(e.target.value as TurnoverFormula)}
                  className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                >
                  {FORMULA_OPTIONS.map((f) => (
                    <option key={f.id} value={f.id}>{f.label}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm flex-[2] min-w-[280px]">
                <span className="text-xs text-slate-500">Observação (ex.: validação RH)</span>
                <input
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                />
              </label>
              <button
                type="button"
                onClick={saveConfig}
                disabled={savingConfig}
                className="px-4 py-2 bg-[#004D40] text-white text-sm font-bold rounded-xl disabled:opacity-50"
              >
                {savingConfig ? 'Salvando...' : 'Salvar fórmula'}
              </button>
            </div>
          </div>

          {!setor && data.setores_resumo.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
                <Users className="w-4 h-4 text-slate-400" />
                <h3 className="text-sm font-bold text-slate-900">Por setor (último mês do período)</h3>
              </div>
              <div className="overflow-auto">
                <table className="w-full text-left min-w-[700px]">
                  <thead>
                    <tr className="bg-slate-50">
                      {['Setor', 'Headcount', 'Admissões', 'Desligamentos', 'Turnover'].map((h) => (
                        <th key={h} className={cn('px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest', h !== 'Setor' && 'text-right')}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {data.setores_resumo.map((r) => (
                      <tr
                        key={r.setor_nome}
                        className="hover:bg-slate-50/70 cursor-pointer"
                        onClick={() => setSetor(r.setor_nome)}
                      >
                        <td className="px-3 py-2 text-xs text-slate-800">{r.setor_nome}</td>
                        <td className="px-3 py-2 text-xs text-right tabular-nums">{r.headcount_fim}</td>
                        <td className="px-3 py-2 text-xs text-right tabular-nums text-emerald-700">{r.admissoes}</td>
                        <td className="px-3 py-2 text-xs text-right tabular-nums text-rose-700">{r.desligamentos}</td>
                        <td className="px-3 py-2 text-xs text-right tabular-nums font-bold">{fmtPct(r.turnover_pct)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">Movimentações detectadas</h3>
            </div>
            {data.movimentos.length === 0 ? (
              <p className="px-4 py-10 text-sm text-slate-400 text-center">
                Nenhuma movimentação no período. Importe folhas consecutivas para comparar admissões e desligamentos.
              </p>
            ) : (
              <div className="overflow-auto max-h-[480px]">
                <table className="w-full text-left min-w-[800px]">
                  <thead>
                    <tr className="bg-slate-50">
                      {['Mês', 'Tipo', 'Cód.', 'Nome', 'Setor', 'Situação'].map((h) => (
                        <th key={h} className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {data.movimentos.map((m, idx) => (
                      <tr key={`${m.codigo_funcionario}-${m.month}-${idx}`} className="hover:bg-slate-50/70">
                        <td className="px-3 py-2 text-xs text-slate-500">{MESES[m.month]?.slice(0, 3)}</td>
                        <td className="px-3 py-2 text-xs">
                          <span className={cn(
                            'inline-block px-2 py-0.5 rounded-lg font-bold text-[10px] uppercase',
                            m.tipo === 'admissao' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                          )}>
                            {m.tipo === 'admissao' ? 'Admissão' : 'Desligamento'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs tabular-nums text-slate-500">{m.codigo_funcionario}</td>
                        <td className="px-3 py-2 text-xs text-slate-800 whitespace-nowrap">{m.nome_funcionario}</td>
                        <td className="px-3 py-2 text-xs text-slate-600">{m.setor_nome}</td>
                        <td className="px-3 py-2 text-xs text-slate-500">{m.situacao || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
