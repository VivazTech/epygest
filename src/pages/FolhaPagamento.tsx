import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCcw, Upload, Loader2, CheckCircle2, AlertTriangle, Users, ArrowRightCircle, Plus, Minus, ChevronDown, ChevronRight, Calculator } from 'lucide-react';
import { formatCurrency, formatApiError } from '../lib/utils';
import { useSearch } from '../context/SearchContext';
import { matchesSearch } from '../lib/search';

export const MESES_FOLHA = [
  '', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

interface FolhaEmployee {
  matricula: string;
  nome: string;
  cargo: string;
  situacao: string;
  cpf: string;
  salario: number;
  proventos: number;
  descontos: number;
  liquido: number;
  base_inss: number;
  base_fgts: number;
  base_irrf: number;
}

interface FolhaResponse {
  year: number;
  month: number;
  employees: FolhaEmployee[];
  summary: {
    funcionarios: number;
    total_proventos: number;
    total_descontos: number;
    total_liquido: number;
  };
}

interface Rubrica {
  codigo: string;
  nome: string;
  horas: string;
  valor: number;
  tipo: string; // P | D
  operacao: 'soma' | 'subtracao';
}

interface CustoLinha {
  key: string;
  label: string;
  valor: number;
  tipo: 'rubrica' | 'rubrica_sub' | 'subtotal' | 'manual' | 'total';
  codigos?: { codigo: string; nome: string; valor: number }[];
}

interface CustoResponse {
  year: number;
  month: number;
  manual: { fgts: number; fgts_prov_ferias: number; fgts_prov_13: number };
  total_custo: number;
  linhas: CustoLinha[];
}

interface FolhaPagamentoPageProps {
  month: number;
}

export const FolhaPagamentoPage: React.FC<FolhaPagamentoPageProps> = ({ month }) => {
  const { query } = useSearch();
  const [year, setYear] = useState('2026');
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [data, setData] = useState<FolhaResponse | null>(null);
  const [error, setError] = useState('');
  const [userRole, setUserRole] = useState('viewer');
  const [rubricas, setRubricas] = useState<Rubrica[]>([]);
  const [rubricasTotal, setRubricasTotal] = useState(0);
  const [sendingRubricas, setSendingRubricas] = useState(false);
  const [rubricasMsg, setRubricasMsg] = useState('');
  const [custo, setCusto] = useState<CustoResponse | null>(null);
  const [custoDetalhe, setCustoDetalhe] = useState<string | null>(null);
  const [fgtsEdit, setFgtsEdit] = useState<{ fgts: string; fgts_prov_ferias: string; fgts_prov_13: string }>({
    fgts: '', fgts_prov_ferias: '', fgts_prov_13: '',
  });
  const [savingFgts, setSavingFgts] = useState(false);

  const loadRubricas = useCallback(async () => {
    try {
      const res = await fetch(`/api/folha/rubricas?year=${encodeURIComponent(year)}&month=${month}`);
      const json = await res.json();
      if (res.ok) {
        setRubricas(Array.isArray(json.rubricas) ? json.rubricas : []);
        setRubricasTotal(Number(json.total) || 0);
      }
    } catch {
      // silencioso
    }
  }, [year, month]);

  const loadCusto = useCallback(async () => {
    try {
      const res = await fetch(`/api/folha/custo?year=${encodeURIComponent(year)}&month=${month}`);
      const json = await res.json();
      if (res.ok) {
        setCusto(json);
        setFgtsEdit({
          fgts: String(json.manual?.fgts ?? 0),
          fgts_prov_ferias: String(json.manual?.fgts_prov_ferias ?? 0),
          fgts_prov_13: String(json.manual?.fgts_prov_13 ?? 0),
        });
      }
    } catch {
      // silencioso
    }
  }, [year, month]);

  const saveFgts = async (campo: 'fgts' | 'fgts_prov_ferias' | 'fgts_prov_13') => {
    if (savingFgts) return;
    const valor = Number(String(fgtsEdit[campo]).replace(',', '.'));
    if (!Number.isFinite(valor)) {
      alert('Digite um valor numérico válido.');
      return;
    }
    setSavingFgts(true);
    try {
      await fetch('/api/folha/custo/manual', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: Number(year), month, [campo]: valor }),
      });
      await loadCusto();
    } finally {
      setSavingFgts(false);
    }
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/folha?year=${encodeURIComponent(year)}&month=${month}`);
      const json = await res.json();
      if (!res.ok) {
        setError(formatApiError(json, 'Erro ao carregar a folha.'));
        setData(null);
        return;
      }
      setData(json);
    } catch (err: any) {
      setError(err?.message || 'Erro inesperado.');
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('user');
      if (raw) setUserRole(String(JSON.parse(raw)?.role || 'viewer'));
    } catch {
      // ignora
    }
  }, []);

  useEffect(() => {
    loadData();
    loadRubricas();
    loadCusto();
  }, [loadData, loadRubricas, loadCusto]);

  const toggleOperacao = async (rb: Rubrica) => {
    const nova: 'soma' | 'subtracao' = rb.operacao === 'subtracao' ? 'soma' : 'subtracao';
    setRubricas((prev) =>
      prev.map((r) => (r.codigo === rb.codigo && r.tipo === rb.tipo ? { ...r, operacao: nova } : r))
    );
    setRubricasMsg('');
    try {
      await fetch('/api/folha/rubricas/operacao', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: Number(year), month, codigo: rb.codigo, tipo: rb.tipo, operacao: nova }),
      });
    } finally {
      await loadRubricas();
      await loadCusto();
    }
  };

  const enviarRubricas = async () => {
    if (sendingRubricas) return;
    if (
      !window.confirm(
        `Enviar o total das rubricas (${formatCurrency(rubricasTotal)}) para o PREVISTO e o REALIZADO de RH › Folha de pagamento em ${MESES_FOLHA[month]}/${year}?`
      )
    )
      return;
    setSendingRubricas(true);
    setRubricasMsg('');
    try {
      const res = await fetch('/api/folha/rubricas/enviar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: Number(year), month }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(formatApiError(json, 'Falha ao enviar para previsto/realizado.'));
        return;
      }
      setRubricasMsg(
        `Enviado ${formatCurrency(json.total)} → Previsto e Realizado de RH › Folha de pagamento (${MESES_FOLHA[month]}/${year}).`
      );
    } finally {
      setSendingRubricas(false);
    }
  };

  const importExtrato = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (
      !window.confirm(
        `Importar o Extrato Mensal para ${MESES_FOLHA[month]}/${year}? Isto substitui a folha atual desse mês.`
      )
    ) {
      event.target.value = '';
      return;
    }
    setImporting(true);
    setError('');
    const formData = new FormData();
    formData.append('extrato_file', file);
    formData.append('month', String(month));
    formData.append('year', String(year));
    try {
      const res = await fetch('/api/folha/import', { method: 'POST', body: formData });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(formatApiError(json, 'Falha ao importar o Extrato.'));
        return;
      }
      await loadData();
      await loadRubricas();
      await loadCusto();
    } finally {
      setImporting(false);
      if (event?.target) event.target.value = '';
    }
  };

  const canImport = userRole === 'admin' || userRole === 'finance' || userRole === 'controle';
  const employees = useMemo(
    () =>
      (data?.employees ?? []).filter((emp) =>
        matchesSearch(query, emp.matricula, emp.nome, emp.cargo, emp.situacao, emp.cpf)
      ),
    [data, query]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">
            Apuração da Folha — {MESES_FOLHA[month]}/{data?.year ?? year}
          </h2>
          <p className="text-sm text-slate-500">
            Folha do mês por funcionário (proventos, descontos, líquido e bases), importada do Extrato Mensal.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="number"
            min={2000}
            max={2100}
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="w-24 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
          />
          <button
            onClick={loadData}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#004D40] text-white text-sm font-bold rounded-xl hover:bg-[#003d33] disabled:opacity-60"
          >
            <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Atualizando...' : 'Atualizar'}
          </button>
          {canImport && (
            <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[#004D40] bg-white text-sm font-bold text-[#004D40] cursor-pointer hover:bg-emerald-50 transition-colors">
              {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {importing ? 'Importando...' : `Importar Extrato de ${MESES_FOLHA[month]}`}
              <input
                type="file"
                accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={importExtrato}
                disabled={importing}
                className="hidden"
              />
            </label>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
          <AlertTriangle className="w-4 h-4" />
          {error}
        </div>
      )}

      {/* Resumo por Rubrica (proventos/débitos do mês) — no topo, lado a lado */}
      {rubricas.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-slate-800">Resumo por Rubrica — {MESES_FOLHA[month]}/{year}</p>
              <p className="text-[11px] text-slate-500">
                Defina se cada rubrica <b>soma</b> (recebido) ou <b>subtrai</b> (retorna à empresa) no total da folha.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Total da folha (rubricas)</p>
                <p className={`text-lg font-extrabold ${rubricasTotal < 0 ? 'text-red-600' : 'text-slate-900'}`}>
                  {formatCurrency(rubricasTotal)}
                </p>
              </div>
              {canImport && (
                <button
                  onClick={enviarRubricas}
                  disabled={sendingRubricas}
                  title="Envia o total para Previsto e Realizado de RH › Folha de pagamento"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#004D40] text-white text-sm font-bold hover:bg-[#003d33] disabled:opacity-60 transition-colors"
                >
                  {sendingRubricas ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRightCircle className="w-4 h-4" />}
                  {sendingRubricas ? 'Enviando...' : 'Enviar para Previsto e Realizado'}
                </button>
              )}
            </div>
          </div>

          {rubricasMsg && (
            <div className="px-4 py-2 text-[11px] text-emerald-700 bg-emerald-50/60 border-b border-emerald-100 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> {rubricasMsg}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-px bg-slate-100">
            {(['P', 'D'] as const).map((tp) => {
              const lista = rubricas.filter((r) => r.tipo === tp);
              return (
                <div key={tp} className="bg-white">
                  <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    {tp === 'P' ? 'Proventos (P) — o que o funcionário recebeu' : 'Débitos (D) — o que retorna à empresa'}
                  </div>
                  <div className="divide-y divide-slate-50 max-h-[360px] overflow-auto">
                    {lista.map((rb) => (
                      <div key={`${rb.tipo}-${rb.codigo}`} className="flex items-center gap-2 px-4 py-2">
                        <span className="text-[10px] text-slate-400 tabular-nums w-10 shrink-0">{rb.codigo}</span>
                        <span className="text-xs text-slate-800 flex-1 truncate" title={rb.nome}>{rb.nome}</span>
                        <span className="text-[10px] text-slate-400 tabular-nums w-16 text-right shrink-0">{rb.horas}</span>
                        <span className="text-xs tabular-nums w-24 text-right shrink-0 font-semibold text-slate-900">{formatCurrency(rb.valor)}</span>
                        {canImport ? (
                          <button
                            onClick={() => toggleOperacao(rb)}
                            title="Clique para alternar soma/subtração"
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold shrink-0 transition-colors ${
                              rb.operacao === 'subtracao'
                                ? 'bg-red-50 text-red-600 hover:bg-red-100'
                                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                            }`}
                          >
                            {rb.operacao === 'subtracao' ? <Minus className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                            {rb.operacao === 'subtracao' ? 'Subtrai' : 'Soma'}
                          </button>
                        ) : (
                          <span className={`text-[10px] font-bold shrink-0 ${rb.operacao === 'subtracao' ? 'text-red-600' : 'text-emerald-700'}`}>
                            {rb.operacao === 'subtracao' ? '−' : '+'}
                          </span>
                        )}
                      </div>
                    ))}
                    {lista.length === 0 && (
                      <div className="px-4 py-3 text-xs text-slate-400">Nenhuma rubrica deste tipo.</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Custo da Folha — 15 linhas agregadas */}
      {custo && custo.linhas.some((l) => l.tipo !== 'manual' && l.valor !== 0) && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
            <Calculator className="w-4 h-4 text-[#004D40]" />
            <div>
              <p className="text-sm font-bold text-slate-800">Custo da Folha — {MESES_FOLHA[month]}/{year}</p>
              <p className="text-[11px] text-slate-500">
                Linhas somadas das rubricas (clique para ver os códigos). FGTS e provisões de FGTS são manuais.
                RETORNOS subtrai; TOTAL CUSTO = salário + provisões + encargos − retornos.
              </p>
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            {custo.linhas.map((l) => {
              const isTotal = l.tipo === 'total';
              const isSub = l.tipo === 'subtotal';
              const isManual = l.tipo === 'manual';
              const isRet = l.tipo === 'rubrica_sub';
              const hasDetail = Array.isArray(l.codigos) && l.codigos.length > 0;
              const expanded = custoDetalhe === l.key;
              return (
                <div key={l.key} className={isTotal ? 'bg-[#004D40]/5' : isSub ? 'bg-slate-50' : ''}>
                  <div className="flex items-center justify-between gap-3 px-4 py-2">
                    <button
                      onClick={() => hasDetail && setCustoDetalhe(expanded ? null : l.key)}
                      className={`flex items-center gap-1.5 text-left ${hasDetail ? 'hover:text-[#004D40]' : 'cursor-default'}`}
                    >
                      {hasDetail ? (
                        expanded ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                      ) : (
                        <span className="w-3.5" />
                      )}
                      <span
                        className={
                          isTotal
                            ? 'text-sm font-extrabold text-[#004D40] uppercase'
                            : isSub
                            ? 'text-sm font-bold text-slate-900'
                            : 'text-sm text-slate-700'
                        }
                      >
                        {l.label}
                      </span>
                      {hasDetail && <span className="text-[10px] text-slate-400">({l.codigos!.length})</span>}
                    </button>

                    {isManual ? (
                      canImport ? (
                        <input
                          type="number"
                          step="0.01"
                          value={fgtsEdit[l.key as 'fgts' | 'fgts_prov_ferias' | 'fgts_prov_13']}
                          onChange={(e) =>
                            setFgtsEdit((p) => ({ ...p, [l.key]: e.target.value }))
                          }
                          onBlur={() => saveFgts(l.key as 'fgts' | 'fgts_prov_ferias' | 'fgts_prov_13')}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                          }}
                          className="w-32 px-2 py-1 text-right text-sm bg-amber-50 border border-amber-200 rounded-lg tabular-nums"
                          title="Valor manual (FGTS)"
                        />
                      ) : (
                        <span className="text-sm tabular-nums text-slate-700">{formatCurrency(l.valor)}</span>
                      )
                    ) : (
                      <span
                        className={
                          isTotal
                            ? 'text-base font-extrabold text-[#004D40] tabular-nums'
                            : isSub
                            ? 'text-sm font-bold text-slate-900 tabular-nums'
                            : isRet
                            ? 'text-sm font-semibold text-red-600 tabular-nums'
                            : 'text-sm text-slate-800 tabular-nums'
                        }
                      >
                        {isRet && l.valor !== 0 ? '− ' : ''}
                        {formatCurrency(l.valor)}
                      </span>
                    )}
                  </div>

                  {expanded && hasDetail && (
                    <div className="px-9 pb-3 -mt-1">
                      <div className="rounded-lg border border-slate-100 bg-slate-50/60 divide-y divide-slate-100 max-h-56 overflow-auto">
                        {l.codigos!.map((c) => (
                          <div key={c.codigo} className="flex items-center justify-between gap-2 px-3 py-1 text-[11px]">
                            <span className="text-slate-400 tabular-nums w-12 shrink-0">{c.codigo}</span>
                            <span className="text-slate-700 flex-1 truncate" title={c.nome}>{c.nome}</span>
                            <span className="text-slate-600 tabular-nums">{formatCurrency(c.valor)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Resumo */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white border border-slate-200 rounded-2xl p-4">
            <p className="text-[11px] uppercase tracking-wider font-bold text-slate-400">Funcionários</p>
            <p className="text-xl font-extrabold text-slate-900">{data.summary.funcionarios}</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-4">
            <p className="text-[11px] uppercase tracking-wider font-bold text-slate-400">Proventos</p>
            <p className="text-xl font-extrabold text-emerald-700">{formatCurrency(data.summary.total_proventos)}</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-4">
            <p className="text-[11px] uppercase tracking-wider font-bold text-slate-400">Descontos</p>
            <p className="text-xl font-extrabold text-red-600">{formatCurrency(data.summary.total_descontos)}</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-4">
            <p className="text-[11px] uppercase tracking-wider font-bold text-slate-400">Líquido</p>
            <p className="text-xl font-extrabold text-slate-900">{formatCurrency(data.summary.total_liquido)}</p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {employees.length === 0 ? (
          <div className="py-16 flex flex-col items-center justify-center gap-2 text-slate-400">
            <Users className="w-10 h-10" />
            <p className="text-sm font-medium">Nenhuma folha importada para {MESES_FOLHA[month]}/{year}.</p>
            {canImport && <p className="text-xs">Use “Importar Extrato de {MESES_FOLHA[month]}” para carregar.</p>}
          </div>
        ) : (
          <div className="overflow-auto max-h-[600px]">
            <table className="w-full text-left border-collapse min-w-[1100px]">
              <thead className="sticky top-0">
                <tr className="bg-slate-50 border-b border-slate-200">
                  {['Matríc.', 'Funcionário', 'Cargo', 'Situação', 'Salário', 'Proventos', 'Descontos', 'Líquido', 'Base INSS', 'Base FGTS', 'Base IRRF'].map((h) => (
                    <th
                      key={h}
                      className={`px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest ${
                        ['Salário', 'Proventos', 'Descontos', 'Líquido', 'Base INSS', 'Base FGTS', 'Base IRRF'].includes(h) ? 'text-right' : ''
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {employees.map((emp, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/70">
                    <td className="px-3 py-2 text-xs text-slate-500 tabular-nums">{emp.matricula}</td>
                    <td className="px-3 py-2 text-xs text-slate-800 whitespace-nowrap">{emp.nome}</td>
                    <td className="px-3 py-2 text-xs text-slate-600 whitespace-nowrap">{emp.cargo}</td>
                    <td className="px-3 py-2 text-xs text-slate-600">{emp.situacao}</td>
                    <td className="px-3 py-2 text-xs text-right tabular-nums text-slate-700">{formatCurrency(emp.salario)}</td>
                    <td className="px-3 py-2 text-xs text-right tabular-nums text-emerald-700">{formatCurrency(emp.proventos)}</td>
                    <td className="px-3 py-2 text-xs text-right tabular-nums text-red-600">{formatCurrency(emp.descontos)}</td>
                    <td className="px-3 py-2 text-xs text-right tabular-nums font-semibold text-slate-900">{formatCurrency(emp.liquido)}</td>
                    <td className="px-3 py-2 text-xs text-right tabular-nums text-slate-500">{formatCurrency(emp.base_inss)}</td>
                    <td className="px-3 py-2 text-xs text-right tabular-nums text-slate-500">{formatCurrency(emp.base_fgts)}</td>
                    <td className="px-3 py-2 text-xs text-right tabular-nums text-slate-500">{formatCurrency(emp.base_irrf)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
