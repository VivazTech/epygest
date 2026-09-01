import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CalendarRange,
  Layers,
  Loader2,
  RefreshCcw,
  UserX,
} from 'lucide-react';
import { cn } from '../lib/utils';

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

type AbsenteismoRow = {
  codigo_funcionario: string;
  nome_funcionario: string;
  setor_nome: string;
  setor_codigo?: string | null;
  empresa_nome?: string | null;
  month: number;
  horas_previstas: number;
  horas_trabalhadas: number;
  horas_ausencia: number;
  dias_faltas: number;
  absenteismo_pct: number | null;
  fonte_previstas?: string;
  fonte_trabalhadas?: string;
  fonte_ausencias?: string;
};

type AbsenteismoResponse = {
  year: number;
  month_from: number;
  month_to: number;
  config: { horas_previstas_padrao: number; horas_dia_padrao: number; dias_uteis_padrao: number };
  filtros: { empresas: string[]; setores: Array<{ nome: string; codigo?: string | null }> };
  resumo: {
    horas_previstas: number;
    horas_trabalhadas: number;
    horas_ausencia: number;
    absenteismo_pct: number | null;
    funcionarios: number;
  };
  evolucao: Array<{ month: number; absenteismo_pct: number | null; horas_ausencia: number }>;
  rows: AbsenteismoRow[];
};

const fmtHoras = (v: number) =>
  new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v);

const fmtPct = (v: number | null) => (v == null ? '—' : `${v.toFixed(2)}%`);

export const AbsenteismoPage: React.FC = () => {
  const now = new Date();
  const [year, setYear] = useState(String(now.getFullYear()));
  const [monthFrom, setMonthFrom] = useState(String(now.getMonth() + 1));
  const [monthTo, setMonthTo] = useState(String(now.getMonth() + 1));
  const [empresa, setEmpresa] = useState('');
  const [setor, setSetor] = useState('');
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<AbsenteismoResponse | null>(null);
  const [configForm, setConfigForm] = useState({ horas_previstas_padrao: '220', horas_dia_padrao: '8', dias_uteis_padrao: '22' });
  const [savingConfig, setSavingConfig] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams({
        year,
        month_from: monthFrom,
        month_to: monthTo,
      });
      if (empresa.trim()) qs.set('empresa', empresa.trim());
      if (setor.trim()) qs.set('setor', setor.trim());
      const res = await fetch(`/api/folha/absenteismo?${qs}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Falha ao carregar absenteísmo.');
      setData(json);
      if (json.config) {
        setConfigForm({
          horas_previstas_padrao: String(json.config.horas_previstas_padrao ?? 220),
          horas_dia_padrao: String(json.config.horas_dia_padrao ?? 8),
          dias_uteis_padrao: String(json.config.dias_uteis_padrao ?? 22),
        });
      }
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
      const m = Number(monthFrom);
      const res = await fetch('/api/folha/absenteismo/processar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: Number(year), month: m }),
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
      const res = await fetch('/api/folha/absenteismo/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          horas_previstas_padrao: Number(configForm.horas_previstas_padrao),
          horas_dia_padrao: Number(configForm.horas_dia_padrao),
          dias_uteis_padrao: Number(configForm.dias_uteis_padrao),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Falha ao salvar configuração.');
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
    if (monthFrom === monthTo) return `Absenteísmo — ${String(m1).toUpperCase()}/${year}`;
    return `Absenteísmo — ${m1} a ${m2}/${year}`;
  }, [monthFrom, monthTo, year]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Absenteísmo</h2>
          <p className="text-sm text-slate-500">
            Horas previstas, trabalhadas e ausências — percentual por competência e setor.
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
            <option value="">Todos</option>
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
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl shadow-lg p-6 text-white">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/60">{titulo}</p>
            {setor && <p className="text-sm mt-1">Setor: <span className="font-bold">{setor}</span></p>}
            <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-white/60">Horas previstas</p>
                <p className="text-2xl font-extrabold tabular-nums">{fmtHoras(data.resumo.horas_previstas)} h</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-white/60">Horas trabalhadas</p>
                <p className="text-2xl font-extrabold tabular-nums">{fmtHoras(data.resumo.horas_trabalhadas)} h</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-white/60">Horas de ausência</p>
                <p className="text-2xl font-extrabold tabular-nums text-amber-300">{fmtHoras(data.resumo.horas_ausencia)} h</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-white/60">Absenteísmo</p>
                <p className={cn('text-2xl font-extrabold tabular-nums', (data.resumo.absenteismo_pct ?? 0) > 5 ? 'text-red-300' : 'text-emerald-300')}>
                  {fmtPct(data.resumo.absenteismo_pct)}
                </p>
              </div>
            </div>
            <p className="text-[10px] text-white/50 mt-3">
              Fórmula: ausências ÷ horas previstas × 100 · {data.resumo.funcionarios} funcionário(s) no período
            </p>
          </div>

          {data.evolucao.length > 1 && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <h3 className="text-sm font-bold text-slate-900 mb-3">Evolução mensal</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                {data.evolucao.map((e) => (
                  <div key={e.month} className="rounded-xl border border-slate-100 p-3 text-center">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">{MESES[e.month]?.slice(0, 3)}</p>
                    <p className={cn('text-lg font-extrabold tabular-nums mt-1', (e.absenteismo_pct ?? 0) > 5 ? 'text-red-600' : 'text-slate-900')}>
                      {fmtPct(e.absenteismo_pct)}
                    </p>
                    <p className="text-[10px] text-slate-400 tabular-nums">{fmtHoras(e.horas_ausencia)} h aus.</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <h3 className="text-sm font-bold text-slate-900 mb-3">Carga horária padrão (quando não importada)</h3>
            <div className="flex flex-wrap gap-3 items-end">
              {[
                { key: 'horas_previstas_padrao', label: 'Horas previstas/mês' },
                { key: 'horas_dia_padrao', label: 'Horas/dia' },
                { key: 'dias_uteis_padrao', label: 'Dias úteis' },
              ].map((f) => (
                <label key={f.key} className="text-sm">
                  <span className="text-xs text-slate-500">{f.label}</span>
                  <input
                    value={(configForm as any)[f.key]}
                    onChange={(e) => setConfigForm((p) => ({ ...p, [f.key]: e.target.value }))}
                    className="mt-1 block w-32 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                  />
                </label>
              ))}
              <button
                type="button"
                onClick={saveConfig}
                disabled={savingConfig}
                className="px-4 py-2 bg-[#004D40] text-white text-sm font-bold rounded-xl disabled:opacity-50"
              >
                {savingConfig ? 'Salvando...' : 'Salvar padrão'}
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
              <UserX className="w-4 h-4 text-slate-400" />
              <h3 className="text-sm font-bold text-slate-900">Detalhe por funcionário</h3>
            </div>
            {data.rows.length === 0 ? (
              <p className="px-4 py-10 text-sm text-slate-400 text-center">
                Nenhum dado no período. Importe o extrato mensal e/ou a provisão de férias, depois reprocessar.
              </p>
            ) : (
              <div className="overflow-auto max-h-[520px]">
                <table className="w-full text-left min-w-[1000px]">
                  <thead>
                    <tr className="bg-slate-50">
                      {['Mês', 'Cód.', 'Nome', 'Setor', 'Previstas', 'Trabalhadas', 'Ausências', 'Faltas (dias)', 'Absenteísmo'].map((h) => (
                        <th key={h} className={cn('px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest', !['Mês', 'Cód.', 'Nome', 'Setor'].includes(h) && 'text-right')}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {data.rows.map((r, idx) => (
                      <tr key={`${r.codigo_funcionario}-${r.month}-${idx}`} className="hover:bg-slate-50/70">
                        <td className="px-3 py-2 text-xs text-slate-500">{MESES[r.month]?.slice(0, 3)}</td>
                        <td className="px-3 py-2 text-xs tabular-nums text-slate-500">{r.codigo_funcionario}</td>
                        <td className="px-3 py-2 text-xs text-slate-800 whitespace-nowrap">{r.nome_funcionario}</td>
                        <td className="px-3 py-2 text-xs text-slate-600">{r.setor_nome}</td>
                        <td className="px-3 py-2 text-xs text-right tabular-nums">{fmtHoras(r.horas_previstas)}</td>
                        <td className="px-3 py-2 text-xs text-right tabular-nums">{fmtHoras(r.horas_trabalhadas)}</td>
                        <td className="px-3 py-2 text-xs text-right tabular-nums font-semibold text-amber-700">{fmtHoras(r.horas_ausencia)}</td>
                        <td className="px-3 py-2 text-xs text-right tabular-nums text-slate-500">{r.dias_faltas || '—'}</td>
                        <td className={cn('px-3 py-2 text-xs text-right tabular-nums font-bold', (r.absenteismo_pct ?? 0) > 5 ? 'text-red-600' : 'text-slate-900')}>
                          {fmtPct(r.absenteismo_pct)}
                        </td>
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
