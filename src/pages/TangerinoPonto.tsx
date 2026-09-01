import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRightCircle,
  Building2,
  CalendarRange,
  CheckCircle2,
  Clock,
  Layers,
  Link2,
  Loader2,
  RefreshCcw,
  Upload,
  UserX,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { TANGERINO_EMPRESAS, type TangerinoEmpresaKey } from '../lib/tangerino';

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

type TangerinoRow = {
  empresa_key: string;
  empresa_nome?: string;
  month: number;
  codigo_funcionario?: string | null;
  nome_colaborador: string;
  setor_nome?: string;
  horas_previstas: number;
  horas_trabalhadas: number;
  horas_ausencia: number;
  dias_faltas: number;
  vinculo_automatico?: boolean;
};

type TangerinoResponse = {
  year: number;
  month_from: number;
  month_to: number;
  empresas: typeof TANGERINO_EMPRESAS;
  filtros: { setores: Array<{ nome: string; codigo?: string | null }> };
  resumo: {
    horas_previstas: number;
    horas_trabalhadas: number;
    horas_ausencia: number;
    absenteismo_pct: number | null;
    funcionarios: number;
    vinculados: number;
    sem_vinculo: number;
  };
  evolucao: Array<{ month: number; absenteismo_pct: number | null; horas_ausencia: number }>;
  rows: TangerinoRow[];
  importacoes: Array<{ id: number; arquivo_nome?: string; empresa_key: string; created_at: string }>;
};

const fmtHoras = (v: number) =>
  new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v);

const fmtPct = (v: number | null) => (v == null ? '—' : `${v.toFixed(2)}%`);

export const TangerinoPontoPage: React.FC = () => {
  const now = new Date();
  const fileRef = useRef<HTMLInputElement>(null);
  const [year, setYear] = useState(String(now.getFullYear()));
  const [monthFrom, setMonthFrom] = useState(String(now.getMonth() + 1));
  const [monthTo, setMonthTo] = useState(String(now.getMonth() + 1));
  const [empresaKey, setEmpresaKey] = useState<TangerinoEmpresaKey | ''>('');
  const [setor, setSetor] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState<TangerinoResponse | null>(null);

  const [importEmpresa, setImportEmpresa] = useState<TangerinoEmpresaKey>('vivaz');
  const [importYear, setImportYear] = useState(String(now.getFullYear()));
  const [importMonth, setImportMonth] = useState(String(now.getMonth() + 1));
  const [importLoading, setImportLoading] = useState(false);
  const [importCommitting, setImportCommitting] = useState(false);
  const [importError, setImportError] = useState('');
  const [importFileName, setImportFileName] = useState('');
  const [previewRows, setPreviewRows] = useState<any[]>([]);
  const [previewResumo, setPreviewResumo] = useState<any>(null);
  const [importMsg, setImportMsg] = useState('');
  const [applyingAbs, setApplyingAbs] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams({ year, month_from: monthFrom, month_to: monthTo });
      if (empresaKey) qs.set('empresa_key', empresaKey);
      if (setor.trim()) qs.set('setor', setor.trim());
      const res = await fetch(`/api/folha/tangerino?${qs}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Falha ao carregar dados do Tangerino.');
      setData(json);
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
  }, [year, monthFrom, monthTo, empresaKey, setor]);

  const handleFile = async (file: File) => {
    setImportLoading(true);
    setImportError('');
    setImportMsg('');
    setPreviewRows([]);
    setPreviewResumo(null);
    setImportFileName(file.name);
    try {
      const fd = new FormData();
      fd.append('tangerino_file', file);
      fd.append('empresa_key', importEmpresa);
      const res = await fetch('/api/folha/tangerino/import/preview', { method: 'POST', body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Falha na pré-visualização.');
      setPreviewRows(json.rows ?? []);
      setPreviewResumo(json.resumo ?? null);
      if (json.parse_warnings?.length) {
        setImportError(`Avisos: ${json.parse_warnings.slice(0, 3).join(' · ')}`);
      }
    } catch (err: any) {
      setImportError(err?.message || 'Erro ao processar arquivo.');
      setPreviewRows([]);
    } finally {
      setImportLoading(false);
    }
  };

  const commitImport = async () => {
    if (!previewRows.length) return;
    setImportCommitting(true);
    setImportMsg('');
    try {
      const res = await fetch('/api/folha/tangerino/import/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year: Number(importYear),
          month: Number(importMonth),
          empresa_key: importEmpresa,
          arquivo_nome: importFileName,
          rows: previewRows,
          aplicar_absenteismo: true,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Falha ao gravar.');
      setImportMsg(
        `${json.linhas ?? previewRows.length} colaborador(es) importado(s). Absenteísmo atualizado: ${json.absenteismo?.rows ?? 0} registro(s).`
      );
      setPreviewRows([]);
      await load();
    } catch (err: any) {
      alert(err?.message || 'Erro ao gravar.');
    } finally {
      setImportCommitting(false);
    }
  };

  const aplicarAbsenteismo = async () => {
    setApplyingAbs(true);
    try {
      const res = await fetch('/api/folha/tangerino/aplicar-absenteismo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year: Number(year),
          month: Number(monthFrom),
          empresa_key: empresaKey || undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Falha ao aplicar.');
      alert(`${json.rows ?? 0} registro(s) enviado(s) ao Absenteísmo.`);
    } catch (err: any) {
      alert(err?.message || 'Erro.');
    } finally {
      setApplyingAbs(false);
    }
  };

  const titulo = useMemo(() => {
    const m1 = MESES[Number(monthFrom)] || monthFrom;
    const m2 = MESES[Number(monthTo)] || monthTo;
    const emp = empresaKey ? TANGERINO_EMPRESAS.find((e) => e.key === empresaKey)?.nome : 'Consolidado';
    if (monthFrom === monthTo) return `Ponto Tangerino — ${m1}/${year} · ${emp}`;
    return `Ponto Tangerino — ${m1} a ${m2}/${year} · ${emp}`;
  }, [monthFrom, monthTo, year, empresaKey]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Tangerino — Ponto</h2>
          <p className="text-sm text-slate-500">
            Indicadores de ponto: horas previstas, trabalhadas e ausências por colaborador.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={aplicarAbsenteismo}
            disabled={applyingAbs}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-sm font-bold rounded-xl hover:bg-slate-50 disabled:opacity-60"
          >
            {applyingAbs ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRightCircle className="w-4 h-4" />}
            Aplicar no Absenteísmo
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

      <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
        <strong>Importação PDF:</strong> o mapeamento do relatório em PDF do Tangerino será feito em uma etapa posterior.
        Por enquanto, exporte o relatório em <b>CSV</b> e importe abaixo. Colunas reconhecidas: nome, matrícula, setor,
        horas previstas, horas trabalhadas, faltas/ausências.
      </div>

      {/* Importação */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-4">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <Upload className="w-4 h-4 text-[#004D40]" />
          Importar relatório (CSV)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <label className="text-sm">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Empresa</span>
            <select
              value={importEmpresa}
              onChange={(e) => setImportEmpresa(e.target.value as TangerinoEmpresaKey)}
              className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
            >
              {TANGERINO_EMPRESAS.map((e) => (
                <option key={e.key} value={e.key}>{e.nome}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Mês</span>
            <select
              value={importMonth}
              onChange={(e) => setImportMonth(e.target.value)}
              className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
            >
              {MESES.slice(1).map((l, i) => (
                <option key={l} value={String(i + 1)}>{l}</option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ano</span>
            <input
              type="number"
              value={importYear}
              onChange={(e) => setImportYear(e.target.value)}
              className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
            />
          </label>
          <div className="flex items-end">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.txt,text/csv,application/vnd.ms-excel"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={importLoading}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-slate-900 text-white text-sm font-bold rounded-xl disabled:opacity-60"
            >
              {importLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {importLoading ? 'Processando...' : 'Selecionar CSV'}
            </button>
          </div>
        </div>

        {importFileName && (
          <p className="text-xs text-slate-500">Arquivo: <span className="font-semibold">{importFileName}</span></p>
        )}
        {importError && (
          <p className="text-xs text-amber-700 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" /> {importError}
          </p>
        )}
        {previewResumo && (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
            <p className="text-xs text-slate-600">
              Prévia: <b>{previewRows.length}</b> colaboradores · Previstas: {fmtHoras(previewResumo.horas_previstas)} h ·
              Trabalhadas: {fmtHoras(previewResumo.horas_trabalhadas)} h · Ausências: {fmtHoras(previewResumo.horas_ausencia)} h
            </p>
            <button
              type="button"
              onClick={commitImport}
              disabled={importCommitting || !previewRows.length}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#004D40] text-white text-sm font-bold rounded-xl disabled:opacity-60"
            >
              {importCommitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Gravar e aplicar no Absenteísmo
            </button>
          </div>
        )}
        {importMsg && (
          <p className="text-xs text-emerald-700 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> {importMsg}
          </p>
        )}
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
        <label className="block text-sm xl:col-span-2">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
            <CalendarRange className="w-3 h-3" /> Período
          </span>
          <div className="mt-1 flex gap-2">
            <select value={monthFrom} onChange={(e) => setMonthFrom(e.target.value)} className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm">
              {MESES.slice(1).map((l, i) => <option key={l} value={String(i + 1)}>{l}</option>)}
            </select>
            <span className="self-center text-slate-400 text-xs">até</span>
            <select value={monthTo} onChange={(e) => setMonthTo(e.target.value)} className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm">
              {MESES.slice(1).map((l, i) => <option key={l} value={String(i + 1)}>{l}</option>)}
            </select>
            <input type="number" value={year} onChange={(e) => setYear(e.target.value)} className="w-24 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm" />
          </div>
        </label>
        <label className="block text-sm">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
            <Building2 className="w-3 h-3" /> Empresa
          </span>
          <select value={empresaKey} onChange={(e) => setEmpresaKey(e.target.value as TangerinoEmpresaKey | '')} className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm">
            <option value="">Vivaz + Aqua</option>
            {TANGERINO_EMPRESAS.map((e) => (
              <option key={e.key} value={e.key}>{e.nome}</option>
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
          <div className="bg-gradient-to-br from-teal-900 to-slate-900 rounded-2xl shadow-lg p-6 text-white">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/60">{titulo}</p>
            <div className="mt-5 grid grid-cols-2 md:grid-cols-5 gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-white/60 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Previstas
                </p>
                <p className="text-2xl font-extrabold tabular-nums">{fmtHoras(data.resumo.horas_previstas)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-emerald-300">Trabalhadas</p>
                <p className="text-2xl font-extrabold tabular-nums text-emerald-300">{fmtHoras(data.resumo.horas_trabalhadas)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-rose-300 flex items-center gap-1">
                  <UserX className="w-3 h-3" /> Ausências
                </p>
                <p className="text-2xl font-extrabold tabular-nums text-rose-300">{fmtHoras(data.resumo.horas_ausencia)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-white/60">Absenteísmo</p>
                <p className="text-2xl font-extrabold tabular-nums">{fmtPct(data.resumo.absenteismo_pct)}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-white/60 flex items-center gap-1">
                  <Link2 className="w-3 h-3" /> Vínculos
                </p>
                <p className="text-lg font-extrabold tabular-nums">
                  {data.resumo.vinculados}/{data.resumo.funcionarios}
                </p>
                {data.resumo.sem_vinculo > 0 && (
                  <p className="text-[10px] text-amber-300">{data.resumo.sem_vinculo} sem matrícula</p>
                )}
              </div>
            </div>
          </div>

          {data.evolucao.length > 1 && (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
              <h3 className="text-sm font-bold text-slate-900 mb-3">Evolução mensal</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                {data.evolucao.map((e) => (
                  <div key={e.month} className="rounded-xl border border-slate-100 p-3 text-center">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">{MESES[e.month]?.slice(0, 3)}</p>
                    <p className="text-lg font-extrabold tabular-nums mt-1">{fmtPct(e.absenteismo_pct)}</p>
                    <p className="text-[10px] text-rose-600">{fmtHoras(e.horas_ausencia)} h aus.</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">Colaboradores</h3>
            </div>
            {data.rows.length === 0 ? (
              <p className="px-4 py-10 text-sm text-slate-400 text-center">
                Nenhum dado importado no período. Importe um CSV do Tangerino acima.
              </p>
            ) : (
              <div className="overflow-auto max-h-[520px]">
                <table className="w-full text-left min-w-[900px]">
                  <thead>
                    <tr className="bg-slate-50">
                      {['Empresa', 'Mês', 'Matrícula', 'Nome', 'Setor', 'Previstas', 'Trabalhadas', 'Ausências', 'Faltas (dias)'].map((h) => (
                        <th
                          key={h}
                          className={cn(
                            'px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest',
                            !['Empresa', 'Mês', 'Matrícula', 'Nome', 'Setor'].includes(h) && 'text-right'
                          )}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {data.rows.map((r, idx) => (
                      <tr key={`${r.nome_colaborador}-${r.month}-${idx}`} className="hover:bg-slate-50/70">
                        <td className="px-3 py-2 text-xs text-slate-600">{r.empresa_nome ?? r.empresa_key}</td>
                        <td className="px-3 py-2 text-xs text-slate-500">{MESES[r.month]?.slice(0, 3)}</td>
                        <td className="px-3 py-2 text-xs tabular-nums">
                          {r.codigo_funcionario ? (
                            <span className="text-slate-700">{r.codigo_funcionario}</span>
                          ) : (
                            <span className="text-amber-600" title="Sem vínculo com a folha">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-800 whitespace-nowrap">{r.nome_colaborador}</td>
                        <td className="px-3 py-2 text-xs text-slate-600">{r.setor_nome || '—'}</td>
                        <td className="px-3 py-2 text-xs text-right tabular-nums">{fmtHoras(r.horas_previstas)}</td>
                        <td className="px-3 py-2 text-xs text-right tabular-nums text-emerald-700">{fmtHoras(r.horas_trabalhadas)}</td>
                        <td className="px-3 py-2 text-xs text-right tabular-nums text-rose-700">{fmtHoras(r.horas_ausencia)}</td>
                        <td className="px-3 py-2 text-xs text-right tabular-nums">{r.dias_faltas || '—'}</td>
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
