import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Calculator, AlertTriangle, CheckCircle2, Loader2,
  Settings, ListChecks, BarChart3, FileSearch, Lock, Unlock, Plus, Save,
  Download, Edit2, X, Users, Building2, History, FileSpreadsheet,
} from 'lucide-react';
import { formatCurrency, formatApiError, fetchJson } from '../lib/utils';
import { MESES_LABEL, CATEGORIAS_RUBRICA } from '../lib/folhaApuracao';
import { downloadCsv } from '../lib/folhaExport';
import { useSearch } from '../context/SearchContext';
import { matchesSearch } from '../lib/search';

type TabId = 'mensal' | 'sintese' | 'rubricas' | 'encargos' | 'pendencias' | 'conferencia' | 'relatorios' | 'cadastros' | 'auditoria';

const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'mensal', label: 'Apuração Mensal', icon: Calculator },
  { id: 'sintese', label: 'Síntese Anual', icon: BarChart3 },
  { id: 'pendencias', label: 'Pendências', icon: AlertTriangle },
  { id: 'conferencia', label: 'Conferência', icon: FileSearch },
  { id: 'relatorios', label: 'Relatórios', icon: FileSpreadsheet },
  { id: 'rubricas', label: 'Rubricas', icon: ListChecks },
  { id: 'encargos', label: 'Encargos', icon: Settings },
  { id: 'cadastros', label: 'Setores/Cargos', icon: Building2 },
  { id: 'auditoria', label: 'Auditoria', icon: History },
];

const emptyRubricaForm = {
  codigo_rubrica: '',
  descricao: '',
  categoria: 'provento',
  entra_provento: true,
  entra_retorno: false,
  entra_comissao: false,
  entra_produtividade: false,
  entra_base_salario: true,
  entra_encargos: false,
  fator_provento: '1',
  fator_retorno: '-1',
  observacoes: '',
  ativo: true,
};

export const FolhaApuracaoPage: React.FC = () => {
  const { query } = useSearch();
  const [tab, setTab] = useState<TabId>('mensal');
  const [year, setYear] = useState('2026');
  const [month, setMonth] = useState(4);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const [apuracao, setApuracao] = useState<any>(null);
  const [importStatus, setImportStatus] = useState<any>(null);
  const [competencias, setCompetencias] = useState<any[]>([]);
  const [lancamentos, setLancamentos] = useState<any[]>([]);
  const [situacoes, setSituacoes] = useState<any[]>([]);
  const [sintese, setSintese] = useState<any>(null);
  const [pendencias, setPendencias] = useState<any[]>([]);
  const [conferencia, setConferencia] = useState<any>(null);
  const [rubricasParams, setRubricasParams] = useState<any[]>([]);
  const [encargos, setEncargos] = useState<any[]>([]);
  const [config, setConfig] = useState({ comissao_produtividade_separadas: true, incluir_retorno_total_custo: false });
  const [relatorioRubrica, setRelatorioRubrica] = useState<any[]>([]);
  const [relatorioSetor, setRelatorioSetor] = useState<any[]>([]);
  const [auditoria, setAuditoria] = useState<any[]>([]);
  const [setores, setSetores] = useState<any[]>([]);
  const [cargos, setCargos] = useState<any[]>([]);
  const [processResumo, setProcessResumo] = useState<any>(null);

  const [filtros, setFiltros] = useState({ rubrica: '', tipo: '', funcionario: '', cargo: '', setor: '' });
  const [rubricaForm, setRubricaForm] = useState({ ...emptyRubricaForm });
  const [editRubricaId, setEditRubricaId] = useState<number | null>(null);

  const [novoEncargo, setNovoEncargo] = useState({
    ano: '2026',
    percentual_fgts: '0.08',
    percentual_inss: '0.20',
    percentual_fgts_aprendiz: '0.02',
    percentual_provisao_13: '0.083333',
    percentual_provisao_ferias: '0.083333',
    percentual_um_terco_ferias: '0.333333',
  });

  const [novoSetor, setNovoSetor] = useState({ nome: '', codigo: '' });
  const [novoCargo, setNovoCargo] = useState({ nome: '', codigo: '', cbo: '' });

  const buildApuracaoUrl = useCallback(() => {
    const p = new URLSearchParams({ year, month: String(month) });
    if (filtros.rubrica) p.set('rubrica', filtros.rubrica);
    if (filtros.tipo) p.set('tipo', filtros.tipo);
    if (filtros.funcionario) p.set('funcionario', filtros.funcionario);
    if (filtros.cargo) p.set('cargo', filtros.cargo);
    if (filtros.setor) p.set('setor', filtros.setor);
    return `/api/folha/apuracao?${p}`;
  }, [year, month, filtros]);

  const loadApuracao = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { res, json } = await fetchJson<any>(buildApuracaoUrl());
      if (!res.ok) throw new Error(formatApiError(json, 'Erro ao carregar apuração.'));
      setApuracao(json.apuracao);
      setImportStatus(json.import_status ?? null);
      setLancamentos(json.lancamentos ?? []);
      setSituacoes(json.situacoes ?? []);
    } catch (e: any) {
      setApuracao(null);
      setImportStatus(null);
      setLancamentos([]);
      setSituacoes([]);
      setError(e?.message || 'Erro inesperado.');
    } finally {
      setLoading(false);
    }
  }, [buildApuracaoUrl]);

  const loadCompetencias = useCallback(async () => {
    try {
      const { res, json } = await fetchJson<any>(`/api/folha/apuracao/competencias?year=${year}`);
      if (!res.ok) return;
      setCompetencias(Array.isArray(json.meses) ? json.meses : []);
    } catch {
      /* silencioso — competências são auxiliares */
    }
  }, [year]);

  const loadSintese = useCallback(async () => {
    const res = await fetch(`/api/folha/apuracao/sintese?year=${year}`);
    if (res.ok) setSintese(await res.json());
  }, [year]);

  const loadPendencias = useCallback(async () => {
    const res = await fetch(`/api/folha/apuracao/pendencias?year=${year}&month=${month}`);
    const json = await res.json();
    if (res.ok) setPendencias(Array.isArray(json) ? json : []);
  }, [year, month]);

  const loadConferencia = useCallback(async () => {
    const res = await fetch(`/api/folha/apuracao/conferencia?year=${year}&month=${month}`);
    if (res.ok) setConferencia(await res.json());
  }, [year, month]);

  const loadRubricasParams = useCallback(async () => {
    const res = await fetch('/api/folha/apuracao/rubricas');
    const json = await res.json();
    if (res.ok) setRubricasParams(Array.isArray(json) ? json : []);
  }, []);

  const loadEncargos = useCallback(async () => {
    const [encRes, cfgRes] = await Promise.all([
      fetch(`/api/folha/apuracao/encargos?ano=${year}`),
      fetch('/api/folha/apuracao/config'),
    ]);
    const encJson = await encRes.json();
    const cfgJson = await cfgRes.json();
    if (encRes.ok) setEncargos(Array.isArray(encJson) ? encJson : []);
    if (cfgRes.ok) setConfig(cfgJson);
  }, [year]);

  const loadRelatorios = useCallback(async () => {
    const [rRes, sRes] = await Promise.all([
      fetch(`/api/folha/apuracao/relatorio/rubrica?year=${year}&month=${month}`),
      fetch(`/api/folha/apuracao/relatorio/setor?year=${year}&month=${month}`),
    ]);
    if (rRes.ok) setRelatorioRubrica(await rRes.json());
    if (sRes.ok) setRelatorioSetor(await sRes.json());
  }, [year, month]);

  const loadAuditoria = useCallback(async () => {
    const res = await fetch(`/api/folha/apuracao/auditoria?year=${year}&month=${month}`);
    if (res.ok) setAuditoria(await res.json());
  }, [year, month]);

  const loadCadastros = useCallback(async () => {
    const [sRes, cRes] = await Promise.all([
      fetch('/api/folha/apuracao/setores'),
      fetch('/api/folha/apuracao/cargos'),
    ]);
    if (sRes.ok) setSetores(await sRes.json());
    if (cRes.ok) setCargos(await cRes.json());
  }, []);

  useEffect(() => {
    loadCompetencias();
  }, [loadCompetencias]);

  useEffect(() => {
    if (tab === 'mensal') loadApuracao();
    if (tab === 'sintese') loadSintese();
    if (tab === 'pendencias') loadPendencias();
    if (tab === 'conferencia') loadConferencia();
    if (tab === 'rubricas') loadRubricasParams();
    if (tab === 'encargos') loadEncargos();
    if (tab === 'relatorios') loadRelatorios();
    if (tab === 'auditoria') loadAuditoria();
    if (tab === 'cadastros') loadCadastros();
  }, [tab, year, month, loadApuracao, loadSintese, loadPendencias, loadConferencia, loadRubricasParams, loadEncargos, loadRelatorios, loadAuditoria, loadCadastros]);

  const lancamentosFiltrados = useMemo(() => {
    if (!query.trim()) return lancamentos;
    return lancamentos.filter((l) =>
      matchesSearch(query, l.codigo_rubrica, l.descricao_rubrica, l.nome_funcionario, l.cargo_nome, l.setor_nome, l.tipo_original)
    );
  }, [lancamentos, query]);

  const processar = async (force = false) => {
    setLoading(true);
    setMsg('');
    setError('');
    setProcessResumo(null);
    try {
      const { res, json } = await fetchJson<any>('/api/folha/apuracao/processar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: Number(year), month, force }),
      });
      if (!res.ok) {
        if (res.status === 409 && !force) {
          if (window.confirm(`${json.error}\n\nDeseja calcular mesmo assim?`)) {
            setLoading(false);
            return processar(true);
          }
          return;
        }
        throw new Error(formatApiError(json, 'Erro ao processar.'));
      }
      setProcessResumo(json.resumo);
      setMsg(`Apuração concluída em ${new Date(json.resumo?.calculado_em || Date.now()).toLocaleString('pt-BR')}.`);
      await loadApuracao();
      loadCompetencias();
    } catch (e: any) {
      setError(e?.message || 'Erro ao processar.');
    } finally {
      setLoading(false);
    }
  };

  const prontoParaProcessar = Boolean(importStatus?.pronto_para_processar);
  const dadosImportados = Boolean(importStatus?.dados_importados);

  const mapearPendencia = async (p: any, preset: string) => {
    await fetch('/api/folha/apuracao/rubricas/mapear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo_rubrica: p.codigo_rubrica, descricao: p.descricao, tipo_original: p.tipo_original, preset }),
    });
    loadPendencias();
    loadRubricasParams();
  };

  const ignorarPendencia = async (p: any) => {
    if (!window.confirm(`Ignorar rubrica ${p.codigo_rubrica}? Ela não entrará na apuração.`)) return;
    await fetch('/api/folha/apuracao/rubricas/ignorar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo_rubrica: p.codigo_rubrica, descricao: p.descricao }),
    });
    loadPendencias();
  };

  const salvarRubrica = async () => {
    if (!rubricaForm.codigo_rubrica.trim() && !editRubricaId) {
      alert('Informe o código da rubrica.');
      return;
    }
    const payload = {
      ...rubricaForm,
      fator_provento: Number(rubricaForm.fator_provento),
      fator_retorno: Number(rubricaForm.fator_retorno),
    };
    const res = editRubricaId
      ? await fetch(`/api/folha/apuracao/rubricas/${editRubricaId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      : await fetch('/api/folha/apuracao/rubricas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!res.ok) {
      alert(formatApiError(await res.json(), 'Erro ao salvar.'));
      return;
    }
    setRubricaForm({ ...emptyRubricaForm });
    setEditRubricaId(null);
    loadRubricasParams();
    setMsg('Rubrica salva.');
  };

  const editarRubrica = (r: any) => {
    setEditRubricaId(r.id);
    setRubricaForm({
      codigo_rubrica: r.codigo_rubrica,
      descricao: r.descricao,
      categoria: r.categoria,
      entra_provento: r.entra_provento,
      entra_retorno: r.entra_retorno,
      entra_comissao: r.entra_comissao,
      entra_produtividade: r.entra_produtividade,
      entra_base_salario: r.entra_base_salario !== false,
      entra_encargos: Boolean(r.entra_encargos),
      fator_provento: String(r.fator_provento ?? 1),
      fator_retorno: String(r.fator_retorno ?? -1),
      observacoes: r.observacoes ?? '',
      ativo: r.ativo !== false,
    });
  };

  const salvarEncargo = async () => {
    const res = await fetch('/api/folha/apuracao/encargos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ano: Number(novoEncargo.ano),
        percentual_fgts: Number(novoEncargo.percentual_fgts),
        percentual_inss: Number(novoEncargo.percentual_inss),
        percentual_fgts_aprendiz: Number(novoEncargo.percentual_fgts_aprendiz),
        percentual_provisao_13: Number(novoEncargo.percentual_provisao_13),
        percentual_provisao_ferias: Number(novoEncargo.percentual_provisao_ferias),
        percentual_um_terco_ferias: Number(novoEncargo.percentual_um_terco_ferias),
      }),
    });
    if (!res.ok) alert(formatApiError(await res.json(), 'Erro ao salvar encargos.'));
    else { loadEncargos(); setMsg('Encargos salvos.'); }
  };

  const salvarConfig = async () => {
    await fetch('/api/folha/apuracao/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    setMsg('Configurações salvas.');
  };

  const toggleBloqueio = async () => {
    if (!apuracao) return;
    await fetch('/api/folha/apuracao/bloquear', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year: Number(year), month, bloqueado: !apuracao.bloqueado }),
    });
    loadApuracao();
  };

  const exportLancamentos = () => {
    downloadCsv(
      `apuracao-${year}-${String(month).padStart(2, '0')}.csv`,
      ['Código', 'Descrição', 'Tipo', 'Funcionário', 'Cargo', 'Setor', 'Original', 'Provento', 'Retorno', 'Comissão', 'Produtividade', 'Status'],
      lancamentosFiltrados.map((l) => [
        l.codigo_rubrica, l.descricao_rubrica, l.tipo_original ?? '',
        l.nome_funcionario ?? '', l.cargo_nome ?? '', l.setor_nome ?? '',
        l.valor_original, l.valor_provento, l.valor_retorno, l.valor_comissao, l.valor_produtividade, l.status_mapeamento,
      ])
    );
  };

  const exportSintese = () => {
    downloadCsv(
      `sintese-folha-${year}.csv`,
      ['Mês', 'Total Custo', 'Trabalhando', 'Comissões', 'Produtividade', 'Proventos', 'Retornos', 'Salário', 'Provisões', 'FGTS', 'INSS', 'Var.% Custo'],
      (sintese?.meses ?? []).map((r: any) => [
        MESES_LABEL[r.month], r.total_custo ?? 0, r.qtd_trabalhando ?? '',
        r.total_comissao ?? 0, r.total_produtividade ?? 0, r.total_proventos ?? 0,
        r.total_retorno ?? 0, r.total_salario ?? 0, r.provisoes ?? 0,
        r.fgts ?? 0, r.inss ?? 0, r.variacao_custo_pct != null ? r.variacao_custo_pct.toFixed(1) : '',
      ])
    );
  };

  const cards = apuracao ? [
    { label: 'Proventos', value: apuracao.total_proventos },
    { label: 'Retornos', value: apuracao.total_retorno },
    { label: 'Comissão', value: apuracao.total_comissao },
    { label: 'Produtividade', value: apuracao.total_produtividade },
    { label: 'Total Salário', value: apuracao.total_salario },
    { label: 'Provisão 13º', value: apuracao.provisao_13 },
    { label: 'Provisão Férias', value: apuracao.provisao_ferias },
    { label: '1/3 Férias', value: apuracao.provisao_um_terco_ferias },
    { label: 'FGTS', value: apuracao.fgts },
    { label: 'FGTS Prov. Férias', value: apuracao.fgts_provisao_ferias },
    { label: 'FGTS Prov. 13º', value: apuracao.fgts_provisao_13 },
    { label: 'INSS', value: apuracao.inss },
    { label: 'INSS 13º', value: apuracao.inss_13 },
    { label: 'INSS Prov. Férias', value: apuracao.inss_provisao_ferias },
    { label: 'Total Custo', value: apuracao.total_custo, highlight: true },
    { label: 'Trabalhando', value: apuracao.qtd_trabalhando, currency: false },
    { label: 'Funcionários', value: apuracao.qtd_funcionarios, currency: false },
  ] : [];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Apuração de Folha</h2>
          <p className="text-slate-500 text-sm">Classificação, cálculo, encargos, relatórios e síntese anual.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={year} onChange={(e) => setYear(e.target.value)} className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm">
            {['2024', '2025', '2026', '2027'].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          {['mensal', 'pendencias', 'conferencia', 'relatorios', 'auditoria'].includes(tab) && (
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm">
              {MESES_LABEL.slice(1).map((m, i) => {
                const comp = competencias.find((c) => c.month === i + 1);
                const badge = comp?.importado ? (comp.apurado ? ' ✓' : ' ●') : '';
                return (
                  <option key={m} value={i + 1}>
                    {String(i + 1).padStart(2, '0')} · {m}{badge}
                  </option>
                );
              })}
            </select>
          )}
          {tab === 'mensal' && (
            <>
              {(prontoParaProcessar || dadosImportados || apuracao) && (
                <button
                  onClick={() => processar(false)}
                  disabled={loading || (!prontoParaProcessar && !apuracao)}
                  title={!prontoParaProcessar && !apuracao ? 'Importe rubricas do extrato antes de processar' : undefined}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#004D40] text-white text-sm font-bold hover:bg-[#003d33] disabled:opacity-60 shadow-md"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />}
                  {apuracao ? 'Reprocessar mês' : 'Processar mês'}
                </button>
              )}
              {apuracao && (
                <button onClick={toggleBloqueio} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50">
                  {apuracao.bloqueado ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                  {apuracao.bloqueado ? 'Desbloquear' : 'Bloquear'}
                </button>
              )}
              <button onClick={exportLancamentos} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50">
                <Download className="w-4 h-4" /> CSV
              </button>
            </>
          )}
          {tab === 'sintese' && (
            <button onClick={exportSintese} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-700 hover:bg-slate-50">
              <Download className="w-4 h-4" /> Exportar CSV
            </button>
          )}
        </div>
      </div>

      {msg && <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-800 text-sm"><CheckCircle2 className="w-4 h-4" />{msg}</div>}
      {error && <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-red-800 text-sm"><AlertTriangle className="w-4 h-4" />{error}</div>}

      {processResumo && (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm grid grid-cols-2 md:grid-cols-4 gap-3">
          <div><span className="text-slate-500">Lançamentos</span><p className="font-bold">{processResumo.lancamentos_processados}</p></div>
          <div><span className="text-slate-500">Rubricas</span><p className="font-bold">{processResumo.rubricas_processadas}</p></div>
          <div><span className="text-slate-500">Não mapeadas</span><p className="font-bold">{processResumo.rubricas_nao_mapeadas}</p></div>
          <div><span className="text-slate-500">Total custo</span><p className="font-bold">{formatCurrency(processResumo.total_custo)}</p></div>
        </div>
      )}

      <div className="flex flex-wrap gap-1 border-b border-slate-100 pb-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)} className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-t-xl text-xs font-bold transition-colors ${tab === id ? 'bg-white border border-b-0 border-slate-200 text-[#004D40]' : 'text-slate-500 hover:bg-slate-50'}`}>
            <Icon className="w-3.5 h-3.5" />{label}
          </button>
        ))}
      </div>

      {tab === 'mensal' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 p-3 bg-white rounded-xl border border-slate-100">
            <input placeholder="Rubrica" value={filtros.rubrica} onChange={(e) => setFiltros((p) => ({ ...p, rubrica: e.target.value }))} className="w-24 px-2 py-1.5 text-sm border rounded-lg" />
            <select value={filtros.tipo} onChange={(e) => setFiltros((p) => ({ ...p, tipo: e.target.value }))} className="px-2 py-1.5 text-sm border rounded-lg">
              <option value="">Tipo</option><option value="P">P</option><option value="D">D</option>
            </select>
            <input placeholder="Funcionário" value={filtros.funcionario} onChange={(e) => setFiltros((p) => ({ ...p, funcionario: e.target.value }))} className="w-36 px-2 py-1.5 text-sm border rounded-lg" />
            <input placeholder="Cargo" value={filtros.cargo} onChange={(e) => setFiltros((p) => ({ ...p, cargo: e.target.value }))} className="w-32 px-2 py-1.5 text-sm border rounded-lg" />
            <input placeholder="Setor" value={filtros.setor} onChange={(e) => setFiltros((p) => ({ ...p, setor: e.target.value }))} className="w-32 px-2 py-1.5 text-sm border rounded-lg" />
            <button onClick={loadApuracao} className="px-3 py-1.5 text-sm font-bold bg-slate-100 rounded-lg hover:bg-slate-200">Filtrar</button>
          </div>

          {!apuracao && !loading && (
            <div className="space-y-3">
              {dadosImportados && prontoParaProcessar && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 text-sm text-emerald-900">
                  <p className="font-bold text-base mb-2">Extrato importado — pronto para apurar</p>
                  <p className="mb-3">
                    {importStatus?.funcionarios ?? 0} funcionário(s), {importStatus?.rubricas ?? 0} rubrica(s)
                    {importStatus?.lancamentos_detalhe ? `, ${importStatus.lancamentos_detalhe} lançamento(s) por funcionário` : ''}.
                    {importStatus?.proventos_calculados != null && (
                      <> Proventos (cadastro): <b>{formatCurrency(importStatus.proventos_calculados)}</b>.</>
                    )}
                    {importStatus?.rubricas_pendentes > 0 && (
                      <> {importStatus.rubricas_pendentes} rubrica(s) sem mapeamento — mapeie em <b>Pendências</b> para compor proventos.</>
                    )}
                  </p>
                  <button
                    onClick={() => processar(false)}
                    disabled={loading}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#004D40] text-white text-sm font-bold hover:bg-[#003d33] disabled:opacity-60"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />}
                    Processar mês
                  </button>
                </div>
              )}
              {dadosImportados && !prontoParaProcessar && (
                <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 text-sm text-amber-900">
                  Funcionários importados ({importStatus?.funcionarios ?? 0}), mas nenhuma rubrica foi reconhecida no extrato.
                  Reimporte o arquivo em <b>Importação › Extrato Mensal</b>.
                </div>
              )}
              {!dadosImportados && (
                <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 text-sm text-amber-900">
                  Nenhum dado importado para {MESES_LABEL[month]}/{year}.
                  Importe o extrato em <b>Importação › Extrato Mensal</b> e envie para a Folha de Pagamento — os mesmos dados alimentam a apuração.
                </div>
              )}
            </div>
          )}

          {apuracao && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {cards.map((c) => (
                <div key={c.label} className={`rounded-2xl border p-3 shadow-sm ${c.highlight ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-100'}`}>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">{c.label}</p>
                  <p className={`text-lg font-extrabold mt-1 ${c.highlight ? 'text-emerald-800' : 'text-slate-900'}`}>
                    {c.currency === false ? c.value : formatCurrency(c.value || 0)}
                  </p>
                </div>
              ))}
            </div>
          )}

          {situacoes.length > 0 && (
            <div className="bg-white rounded-xl border p-3">
              <p className="text-xs font-bold text-slate-500 uppercase mb-2 flex items-center gap-1"><Users className="w-3.5 h-3.5" /> Situações</p>
              <div className="flex flex-wrap gap-2">
                {situacoes.map((s) => (
                  <span key={s.situacao} className="px-2 py-1 bg-slate-100 rounded-lg text-xs">{s.situacao}: <b>{s.quantidade}</b></span>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white rounded-2xl border shadow-sm table-scroll-panel">
            <table className="w-full text-left border-collapse min-w-[1200px]">
              <thead>
                <tr className="bg-slate-50/70">
                  <th className="th-sticky-corner px-3 py-2 text-[10px] font-bold uppercase">Código</th>
                  <th className="th-sticky-top px-3 py-2 text-[10px] font-bold uppercase">Descrição</th>
                  <th className="th-sticky-top px-3 py-2 text-[10px] font-bold uppercase">Tipo</th>
                  <th className="th-sticky-top px-3 py-2 text-[10px] font-bold uppercase">Funcionário</th>
                  <th className="th-sticky-top px-3 py-2 text-[10px] font-bold uppercase">Cargo</th>
                  <th className="th-sticky-top px-3 py-2 text-[10px] font-bold uppercase text-right">Original</th>
                  <th className="th-sticky-top px-3 py-2 text-[10px] font-bold uppercase text-right">Provento</th>
                  <th className="th-sticky-top px-3 py-2 text-[10px] font-bold uppercase text-right">Retorno</th>
                  <th className="th-sticky-top px-3 py-2 text-[10px] font-bold uppercase text-right">Comissão</th>
                  <th className="th-sticky-top px-3 py-2 text-[10px] font-bold uppercase text-right">Produtiv.</th>
                  <th className="th-sticky-top px-3 py-2 text-[10px] font-bold uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lancamentosFiltrados.length === 0 && (
                  <tr><td colSpan={11} className="px-4 py-8 text-center text-sm text-slate-400">{loading ? 'Carregando...' : 'Sem lançamentos.'}</td></tr>
                )}
                {lancamentosFiltrados.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50/60 text-sm">
                    <td className="sticky left-0 z-10 bg-white px-3 py-2 text-xs font-mono">{l.codigo_rubrica}</td>
                    <td className="px-3 py-2">{l.descricao_rubrica}</td>
                    <td className="px-3 py-2 text-xs">{l.tipo_original}</td>
                    <td className="px-3 py-2 text-xs">{l.nome_funcionario || '—'}</td>
                    <td className="px-3 py-2 text-xs">{l.cargo_nome || '—'}</td>
                    <td className="px-3 py-2 text-xs text-right">{formatCurrency(l.valor_original)}</td>
                    <td className="px-3 py-2 text-xs text-right">{formatCurrency(l.valor_provento)}</td>
                    <td className="px-3 py-2 text-xs text-right">{formatCurrency(l.valor_retorno)}</td>
                    <td className="px-3 py-2 text-xs text-right">{formatCurrency(l.valor_comissao)}</td>
                    <td className="px-3 py-2 text-xs text-right">{formatCurrency(l.valor_produtividade)}</td>
                    <td className="px-3 py-2"><span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${l.status_mapeamento === 'pendente' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>{l.status_mapeamento}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'sintese' && (
        <div className="bg-white rounded-2xl border shadow-sm overflow-auto">
          <table className="w-full text-left border-collapse min-w-[1300px]">
            <thead>
              <tr className="bg-slate-50/70">
                {['Mês', 'Total Custo', 'Var.%', 'Trabalhando', 'Comissões', 'Produtividade', 'Proventos', 'Retornos', 'Salário', 'Provisões', 'FGTS', 'INSS', 'Status'].map((h) => (
                  <th key={h} className="px-3 py-2 text-[10px] font-bold uppercase text-right first:text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(sintese?.meses ?? []).map((row: any) => (
                <tr key={row.month} className="hover:bg-slate-50/60 text-sm">
                  <td className="px-3 py-2 font-medium">{MESES_LABEL[row.month]}</td>
                  <td className="px-3 py-2 text-right font-bold">{formatCurrency(row.total_custo || 0)}</td>
                  <td className={`px-3 py-2 text-right text-xs ${row.variacao_custo_pct != null && row.variacao_custo_pct < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                    {row.variacao_custo_pct != null ? `${row.variacao_custo_pct.toFixed(1)}%` : '—'}
                  </td>
                  <td className="px-3 py-2 text-right">{row.qtd_trabalhando ?? '—'}</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(row.total_comissao || 0)}</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(row.total_produtividade || 0)}</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(row.total_proventos || 0)}</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(row.total_retorno || 0)}</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(row.total_salario || 0)}</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(row.provisoes || 0)}</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(row.fgts || 0)}</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(row.inss || 0)}</td>
                  <td className="px-3 py-2 text-xs text-slate-500">{row.status || 'pendente'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'pendencias' && (
        <div className="bg-white rounded-2xl border shadow-sm overflow-auto">
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead>
              <tr className="bg-amber-50/70">
                {['Código', 'Descrição', 'Ocorrências', 'Valor total', '1ª comp.', 'Última comp.', 'Ações'].map((h) => (
                  <th key={h} className="px-4 py-3 text-[10px] font-bold uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pendencias.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-emerald-700"><CheckCircle2 className="w-5 h-5 inline mr-1" />Todas mapeadas ou ignoradas.</td></tr>
              )}
              {pendencias.map((p) => (
                <tr key={p.codigo_rubrica} className="hover:bg-slate-50/60">
                  <td className="px-4 py-3 text-xs font-mono">{p.codigo_rubrica}</td>
                  <td className="px-4 py-3 text-sm">{p.descricao}</td>
                  <td className="px-4 py-3 text-sm text-right">{p.ocorrencias}</td>
                  <td className="px-4 py-3 text-sm text-right">{formatCurrency(p.valor_total)}</td>
                  <td className="px-4 py-3 text-xs">{p.primeira_competencia ?? '—'}</td>
                  <td className="px-4 py-3 text-xs">{p.ultima_competencia ?? '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(['provento', 'desconto', 'comissao', 'produtividade'] as const).map((preset) => (
                        <button key={preset} onClick={() => mapearPendencia(p, preset)} className="px-2 py-1 text-[10px] font-bold rounded-lg bg-slate-100 hover:bg-emerald-50">{preset}</button>
                      ))}
                      <button onClick={() => ignorarPendencia(p)} className="px-2 py-1 text-[10px] font-bold rounded-lg bg-red-50 text-red-700 hover:bg-red-100">ignorar</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'conferencia' && conferencia && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'Arquivo', value: conferencia.importacao?.nome_arquivo ?? '—', currency: false },
              { label: 'Importado em', value: conferencia.importacao?.data_importacao ? new Date(conferencia.importacao.data_importacao).toLocaleString('pt-BR') : '—', currency: false },
              { label: 'Competência', value: `${String(month).padStart(2, '0')}/${year}`, currency: false },
              { label: 'Status', value: conferencia.status, currency: false },
              { label: 'Funcionários', value: conferencia.funcionarios, currency: false },
              { label: 'Rubricas (resumo)', value: conferencia.rubricas, currency: false },
              { label: 'Linhas detalhe', value: conferencia.linhas_detalhe_importadas ?? 0, currency: false },
              { label: 'Não mapeadas', value: conferencia.rubricas_nao_mapeadas, currency: false },
              { label: 'Proventos (import.)', value: conferencia.total_proventos_importados },
              { label: 'Descontos (import.)', value: conferencia.total_descontos_importados },
            ].map((c) => (
              <div key={c.label} className="bg-white rounded-2xl border p-4 shadow-sm">
                <p className="text-[10px] font-bold text-slate-400 uppercase">{c.label}</p>
                <p className="text-sm font-extrabold text-slate-900 mt-1 break-all">{c.currency === false ? String(c.value ?? '—') : formatCurrency(c.value || 0)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'relatorios' && (
        <div className="grid lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl border shadow-sm overflow-auto max-h-[400px]">
            <p className="px-4 py-3 text-sm font-bold border-b">Por rubrica</p>
            <table className="w-full text-sm">
              <thead><tr className="bg-slate-50"><th className="px-3 py-2 text-left">Código</th><th className="px-3 py-2 text-right">Total</th><th className="px-3 py-2 text-right">Ocorr.</th></tr></thead>
              <tbody>{relatorioRubrica.map((r) => <tr key={r.codigo_rubrica} className="border-t"><td className="px-3 py-2 font-mono text-xs">{r.codigo_rubrica}</td><td className="px-3 py-2 text-right">{formatCurrency(r.valor_total)}</td><td className="px-3 py-2 text-right">{r.ocorrencias}</td></tr>)}</tbody>
            </table>
          </div>
          <div className="bg-white rounded-2xl border shadow-sm overflow-auto max-h-[400px]">
            <p className="px-4 py-3 text-sm font-bold border-b">Por setor</p>
            <table className="w-full text-sm">
              <thead><tr className="bg-slate-50"><th className="px-3 py-2 text-left">Setor</th><th className="px-3 py-2 text-right">Salário</th></tr></thead>
              <tbody>{relatorioSetor.map((r) => <tr key={r.setor} className="border-t"><td className="px-3 py-2">{r.setor}</td><td className="px-3 py-2 text-right">{formatCurrency(r.total_salario)}</td></tr>)}</tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'rubricas' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border p-4 shadow-sm">
            <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
              {editRubricaId ? <Edit2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              {editRubricaId ? 'Editar rubrica' : 'Nova rubrica'}
              {editRubricaId && <button onClick={() => { setEditRubricaId(null); setRubricaForm({ ...emptyRubricaForm }); }} className="ml-auto text-slate-400"><X className="w-4 h-4" /></button>}
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <input placeholder="Código" disabled={!!editRubricaId} value={rubricaForm.codigo_rubrica} onChange={(e) => setRubricaForm((p) => ({ ...p, codigo_rubrica: e.target.value }))} className="px-3 py-2 border rounded-xl text-sm disabled:bg-slate-100" />
              <input placeholder="Descrição" value={rubricaForm.descricao} onChange={(e) => setRubricaForm((p) => ({ ...p, descricao: e.target.value }))} className="px-3 py-2 border rounded-xl text-sm" />
              <select value={rubricaForm.categoria} onChange={(e) => setRubricaForm((p) => ({ ...p, categoria: e.target.value }))} className="px-3 py-2 border rounded-xl text-sm">
                {CATEGORIAS_RUBRICA.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <input placeholder="Fator provento" value={rubricaForm.fator_provento} onChange={(e) => setRubricaForm((p) => ({ ...p, fator_provento: e.target.value }))} className="px-3 py-2 border rounded-xl text-sm" />
              <input placeholder="Fator retorno" value={rubricaForm.fator_retorno} onChange={(e) => setRubricaForm((p) => ({ ...p, fator_retorno: e.target.value }))} className="px-3 py-2 border rounded-xl text-sm" />
              <input placeholder="Observações" value={rubricaForm.observacoes} onChange={(e) => setRubricaForm((p) => ({ ...p, observacoes: e.target.value }))} className="col-span-2 px-3 py-2 border rounded-xl text-sm" />
            </div>
            <div className="flex flex-wrap gap-3 mt-2">
              {(['entra_provento', 'entra_retorno', 'entra_comissao', 'entra_produtividade', 'entra_base_salario', 'entra_encargos'] as const).map((flag) => (
                <label key={flag} className="flex items-center gap-1 text-xs"><input type="checkbox" checked={rubricaForm[flag]} onChange={(e) => setRubricaForm((p) => ({ ...p, [flag]: e.target.checked }))} />{flag.replace('entra_', '')}</label>
              ))}
            </div>
            <button onClick={salvarRubrica} className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#004D40] text-white text-sm font-bold"><Save className="w-4 h-4" /> Salvar</button>
          </div>
          <div className="bg-white rounded-2xl border shadow-sm overflow-auto max-h-[420px]">
            <table className="w-full text-sm">
              <thead><tr className="bg-slate-50 sticky top-0"><th className="px-3 py-2">Código</th><th className="px-3 py-2">Descrição</th><th className="px-3 py-2">Cat.</th><th className="px-3 py-2">Flags</th><th className="px-3 py-2"></th></tr></thead>
              <tbody>{rubricasParams.map((r) => (
                <tr key={r.id} className="border-t hover:bg-slate-50">
                  <td className="px-3 py-2 font-mono text-xs">{r.codigo_rubrica}</td>
                  <td className="px-3 py-2">{r.descricao}</td>
                  <td className="px-3 py-2 text-xs">{r.categoria}</td>
                  <td className="px-3 py-2 text-[10px]">{[r.entra_provento && 'P', r.entra_retorno && 'R', r.entra_comissao && 'C', r.entra_produtividade && 'Prod'].filter(Boolean).join(' · ')}</td>
                  <td className="px-3 py-2"><button onClick={() => editarRubrica(r)} className="text-xs font-bold text-[#004D40]">Editar</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'encargos' && (
        <div className="grid lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl border p-4 shadow-sm">
            <h3 className="text-sm font-bold mb-3">Parâmetros por ano</h3>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(novoEncargo).map(([key, val]) => (
                <div key={key}><label className="text-[10px] font-bold text-slate-400 uppercase">{key}</label>
                  <input value={val} onChange={(e) => setNovoEncargo((p) => ({ ...p, [key]: e.target.value }))} className="w-full mt-1 px-3 py-2 border rounded-xl text-sm" /></div>
              ))}
            </div>
            <button onClick={salvarEncargo} className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#004D40] text-white text-sm font-bold"><Save className="w-4 h-4" /> Salvar encargos</button>
            {encargos.map((e) => <p key={e.id} className="mt-2 text-sm text-slate-600"><b>{e.ano}</b> — FGTS {(Number(e.percentual_fgts) * 100).toFixed(2)}% · INSS {(Number(e.percentual_inss) * 100).toFixed(2)}%</p>)}
          </div>
          <div className="bg-white rounded-2xl border p-4 shadow-sm">
            <h3 className="text-sm font-bold mb-3">Configurações de cálculo</h3>
            <label className="flex items-center gap-2 text-sm mb-2"><input type="checkbox" checked={config.comissao_produtividade_separadas} onChange={(e) => setConfig((p) => ({ ...p, comissao_produtividade_separadas: e.target.checked }))} /> Comissão/produtividade somam ao salário separadamente</label>
            <label className="flex items-center gap-2 text-sm mb-3"><input type="checkbox" checked={config.incluir_retorno_total_custo} onChange={(e) => setConfig((p) => ({ ...p, incluir_retorno_total_custo: e.target.checked }))} /> Incluir retornos no total de custo</label>
            <button onClick={salvarConfig} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-bold hover:bg-slate-50"><Save className="w-4 h-4" /> Salvar config</button>
          </div>
        </div>
      )}

      {tab === 'cadastros' && (
        <div className="grid lg:grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl border p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between"><h3 className="text-sm font-bold">Setores</h3>
              <button onClick={async () => { await fetch('/api/folha/apuracao/setores/sync', { method: 'POST' }); loadCadastros(); setMsg('Setores sincronizados.'); }} className="text-xs font-bold text-[#004D40]">Sync Cadastros</button></div>
            <div className="flex gap-2"><input placeholder="Nome" value={novoSetor.nome} onChange={(e) => setNovoSetor({ ...novoSetor, nome: e.target.value })} className="flex-1 px-3 py-2 border rounded-xl text-sm" />
              <button onClick={async () => { await fetch('/api/folha/apuracao/setores', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(novoSetor) }); setNovoSetor({ nome: '', codigo: '' }); loadCadastros(); }} className="px-3 py-2 bg-[#004D40] text-white rounded-xl text-sm font-bold">+</button></div>
            <ul className="text-sm max-h-48 overflow-auto">{setores.map((s) => <li key={s.id} className="py-1 border-b">{s.nome}</li>)}</ul>
          </div>
          <div className="bg-white rounded-2xl border p-4 shadow-sm space-y-3">
            <h3 className="text-sm font-bold">Cargos</h3>
            <div className="flex gap-2"><input placeholder="Nome cargo" value={novoCargo.nome} onChange={(e) => setNovoCargo({ ...novoCargo, nome: e.target.value })} className="flex-1 px-3 py-2 border rounded-xl text-sm" />
              <button onClick={async () => { await fetch('/api/folha/apuracao/cargos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(novoCargo) }); setNovoCargo({ nome: '', codigo: '', cbo: '' }); loadCadastros(); }} className="px-3 py-2 bg-[#004D40] text-white rounded-xl text-sm font-bold">+</button></div>
            <ul className="text-sm max-h-48 overflow-auto">{cargos.map((c) => <li key={c.id} className="py-1 border-b">{c.nome}</li>)}</ul>
          </div>
        </div>
      )}

      {tab === 'auditoria' && (
        <div className="bg-white rounded-2xl border shadow-sm overflow-auto max-h-[500px]">
          <table className="w-full text-sm">
            <thead><tr className="bg-slate-50"><th className="px-3 py-2 text-left">Data</th><th className="px-3 py-2">Comp.</th><th className="px-3 py-2">Ação</th><th className="px-3 py-2 text-left">Detalhes</th></tr></thead>
            <tbody>{auditoria.map((a) => (
              <tr key={a.id} className="border-t">
                <td className="px-3 py-2 text-xs">{new Date(a.created_at).toLocaleString('pt-BR')}</td>
                <td className="px-3 py-2 text-xs text-center">{String(a.competencia_mes).padStart(2, '0')}/{a.competencia_ano}</td>
                <td className="px-3 py-2 text-xs font-bold">{a.acao}</td>
                <td className="px-3 py-2 text-xs text-slate-500 truncate max-w-xs">{JSON.stringify(a.detalhes)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
};
