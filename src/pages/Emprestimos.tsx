import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  ChevronDown,
  ChevronRight,
  Landmark,
  Loader2,
  Pencil,
  Plus,
  RefreshCcw,
  Trash2,
  UserMinus,
  Users,
  Wallet,
  X,
  CalendarRange,
  History,
  Info,
  FileWarning,
  CheckCircle2,
} from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import { confirmDelete } from '../lib/confirmAction';
import { SearchableSelect } from '../components/SearchableSelect';
import { useSearch } from '../context/SearchContext';
import {
  EMPRESTIMO_DIVERGENCIA_MOTIVOS,
  EMPRESTIMO_RESPONSABILIDADE_OPTIONS,
  EMPRESTIMO_STATUS_OPTIONS,
  REGRAS_RESCISAO_PENDENTES,
  type EmprestimoColaboradorGrupo,
  type EmprestimoConciliacaoLinha,
  type EmprestimoConciliacaoResponse,
  type EmprestimoDivergencia,
  type EmprestimoDivergenciaMotivo,
  type EmprestimoHistoricoResponse,
  type EmprestimoResponsabilidade,
  type EmprestimoRow,
  type EmprestimoStatus,
  type EmprestimosListResponse,
} from '../lib/folhaEmprestimos';
import { EMPRESTIMOS_ACESSO_NEGADO_MSG } from '../lib/emprestimosAccess';

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

type ColaboradorOption = {
  id: number;
  nome: string;
  codigo_funcionario: string | null;
  setor: string | null;
  empresa: string | null;
};

const EMPTY_FORM = {
  colaborador_id: '',
  codigo_funcionario: '',
  nome_colaborador: '',
  setor_nome: '',
  empresa_nome: '',
  instituicao_financeira: '',
  valor_contratado: '',
  valor_recebido: '',
  valor_parcela: '',
  quantidade_parcelas: '1',
  parcelas_pagas: '0',
  data_inicio: '',
  previsao_termino: '',
  status: 'ativo' as EmprestimoStatus,
  rubrica_codigo: '',
  rubrica_nome: '',
  observacao: '',
};

const statusBadgeClass = (status: EmprestimoStatus) => {
  switch (status) {
    case 'ativo':
      return 'bg-emerald-100 text-emerald-800';
    case 'quitado':
      return 'bg-slate-100 text-slate-600';
    case 'suspenso':
      return 'bg-amber-100 text-amber-800';
    case 'cancelado':
      return 'bg-red-100 text-red-700';
    default:
      return 'bg-slate-100 text-slate-600';
  }
};

const statusLabel = (status: EmprestimoStatus) =>
  EMPRESTIMO_STATUS_OPTIONS.find((s) => s.id === status)?.label ?? status;

const motivoDivergenciaLabel = (m: EmprestimoDivergenciaMotivo | null) =>
  m ? EMPRESTIMO_DIVERGENCIA_MOTIVOS.find((x) => x.id === m)?.label ?? m : '—';

const responsabilidadeLabel = (r: EmprestimoResponsabilidade) =>
  EMPRESTIMO_RESPONSABILIDADE_OPTIONS.find((s) => s.id === r)?.label ?? r;

const responsabilidadeBadgeClass = (r: EmprestimoResponsabilidade) => {
  switch (r) {
    case 'empresa':
      return 'bg-emerald-100 text-emerald-800';
    case 'colaborador':
      return 'bg-amber-100 text-amber-800';
    case 'instituicao':
      return 'bg-indigo-100 text-indigo-800';
    case 'encerrado':
      return 'bg-slate-100 text-slate-600';
    default:
      return 'bg-slate-100 text-slate-600';
  }
};

type AlertaDesligamento = {
  emprestimo_id: number;
  codigo_funcionario: string;
  nome_colaborador: string;
  instituicao_financeira: string;
  valor_parcela: number;
  situacao_folha: string;
  competencia_folha: { year: number; month: number };
  sugestao: string;
};

const fmtDate = (d: string | null) => {
  if (!d) return '—';
  const [y, m, day] = d.slice(0, 10).split('-');
  if (!y || !m || !day) return d;
  return `${day}/${m}/${y}`;
};

export const EmprestimosPage: React.FC = () => {
  const { query } = useSearch();
  const now = new Date();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<EmprestimosListResponse | null>(null);
  const [colaboradores, setColaboradores] = useState<ColaboradorOption[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [empresaFilter, setEmpresaFilter] = useState('');
  const [setorFilter, setSetorFilter] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EmprestimoRow | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [syncYear, setSyncYear] = useState(String(now.getFullYear()));
  const [syncMonth, setSyncMonth] = useState(String(now.getMonth() + 1));
  const [syncMsg, setSyncMsg] = useState('');
  const [conciliacaoLoading, setConciliacaoLoading] = useState(false);
  const [conciliacao, setConciliacao] = useState<EmprestimoConciliacaoResponse | null>(null);
  const [divExpanded, setDivExpanded] = useState(true);
  const [divModal, setDivModal] = useState<EmprestimoDivergencia | null>(null);
  const [divForm, setDivForm] = useState({ motivo: 'outro' as EmprestimoDivergenciaMotivo, justificativa: '' });
  const [divSaving, setDivSaving] = useState(false);
  const [alertasDesligamento, setAlertasDesligamento] = useState<AlertaDesligamento[]>([]);
  const [alertasLoading, setAlertasLoading] = useState(false);
  const [desligamentoOpen, setDesligamentoOpen] = useState<EmprestimoRow | null>(null);
  const [desligamentoForm, setDesligamentoForm] = useState({
    data_desligamento: '',
    responsabilidade: 'colaborador' as EmprestimoResponsabilidade,
    motivo_encerramento: '',
    aplicar_todos_colaborador: true,
  });
  const [desligamentoSaving, setDesligamentoSaving] = useState(false);
  const [concExpanded, setConcExpanded] = useState<Record<string, boolean>>({});
  const [histDesdeInicio, setHistDesdeInicio] = useState(true);
  const [histYearFrom, setHistYearFrom] = useState(String(now.getFullYear()));
  const [histMonthFrom, setHistMonthFrom] = useState('1');
  const [histYearTo, setHistYearTo] = useState(String(now.getFullYear()));
  const [histMonthTo, setHistMonthTo] = useState(String(now.getMonth() + 1));
  const [historicoLoading, setHistoricoLoading] = useState(false);
  const [historico, setHistorico] = useState<EmprestimoHistoricoResponse | null>(null);
  const [histExpanded, setHistExpanded] = useState(true);
  const [histMensalOpen, setHistMensalOpen] = useState(false);

  const loadColaboradores = async () => {
    const res = await fetch('/api/colaboradores?active=1');
    const json = await res.json().catch(() => []);
    const list = Array.isArray(json) ? json : [];
    setColaboradores(
      list.map((c: any) => ({
        id: Number(c.id),
        nome: String(c.nome_oficial ?? c.nome ?? ''),
        codigo_funcionario: c.codigo_funcionario ? String(c.codigo_funcionario) : null,
        setor: c.sector_name ?? c.ccusto_descricao ?? null,
        empresa: c.empresa_nome ?? null,
      }))
    );
  };

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams();
      if (statusFilter) qs.set('status', statusFilter);
      if (empresaFilter.trim()) qs.set('empresa', empresaFilter.trim());
      if (setorFilter.trim()) qs.set('setor', setorFilter.trim());
      if (query.trim()) qs.set('q', query.trim());
      const res = await fetch(`/api/folha/emprestimos?${qs}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 403) throw new Error(json.error || EMPRESTIMOS_ACESSO_NEGADO_MSG);
        throw new Error(json.error || 'Falha ao carregar empréstimos.');
      }
      setData(json);
    } catch (err: any) {
      setData(null);
      setError(err?.message || 'Erro ao carregar.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadColaboradores();
  }, []);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, empresaFilter, setorFilter, query]);

  const loadAlertas = async () => {
    setAlertasLoading(true);
    try {
      const res = await fetch('/api/folha/emprestimos/alertas-desligamento');
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Falha ao carregar alertas.');
      setAlertasDesligamento(Array.isArray(json.alertas) ? json.alertas : []);
    } catch (err) {
      console.error(err);
      setAlertasDesligamento([]);
    } finally {
      setAlertasLoading(false);
    }
  };

  useEffect(() => {
    loadAlertas();
  }, []);

  const openDivergencia = (div: EmprestimoDivergencia) => {
    setDivModal(div);
    setDivForm({
      motivo: div.motivo ?? div.motivo_sugerido ?? 'outro',
      justificativa: div.justificativa ?? '',
    });
  };

  const salvarJustificativa = async () => {
    if (!divModal || !conciliacao) return;
    if (!divForm.justificativa.trim()) {
      alert('Informe a justificativa.');
      return;
    }
    setDivSaving(true);
    try {
      const res = await fetch('/api/folha/emprestimos/divergencias/justificativa', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year: conciliacao.year,
          month: conciliacao.month,
          conciliacao_key: divModal.conciliacao_key,
          emprestimo_id: divModal.emprestimo_id,
          codigo_funcionario: divModal.codigo_funcionario,
          nome_colaborador: divModal.nome_colaborador,
          instituicao_financeira: divModal.instituicao_financeira,
          valor_esperado: divModal.valor_esperado,
          valor_descontado: divModal.valor_descontado,
          valor_repassado: divModal.valor_repassado,
          diferenca: divModal.diferenca,
          motivo: divForm.motivo,
          justificativa: divForm.justificativa.trim(),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Falha ao salvar justificativa.');
      setDivModal(null);
      await loadConciliacao();
    } catch (err: any) {
      alert(err?.message || 'Erro ao salvar.');
    } finally {
      setDivSaving(false);
    }
  };

  const loadConciliacao = async () => {
    setConciliacaoLoading(true);
    try {
      const qs = new URLSearchParams({ year: syncYear, month: syncMonth });
      const res = await fetch(`/api/folha/emprestimos/conciliacao?${qs}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Falha ao carregar conciliação.');
      setConciliacao(json);
    } catch (err: any) {
      setConciliacao(null);
      console.error(err);
    } finally {
      setConciliacaoLoading(false);
    }
  };

  useEffect(() => {
    loadConciliacao();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncYear, syncMonth]);

  const loadHistorico = async () => {
    setHistoricoLoading(true);
    try {
      const qs = new URLSearchParams();
      if (histDesdeInicio) qs.set('desde_inicio', '1');
      else {
        qs.set('year_from', histYearFrom);
        qs.set('month_from', histMonthFrom);
      }
      qs.set('year_to', histYearTo);
      qs.set('month_to', histMonthTo);
      const res = await fetch(`/api/folha/emprestimos/historico?${qs}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Falha ao carregar histórico.');
      setHistorico(json);
      if (json.periodo?.desde_inicio && json.periodo) {
        setHistYearFrom(String(json.periodo.year_from));
        setHistMonthFrom(String(json.periodo.month_from));
        setHistYearTo(String(json.periodo.year_to));
        setHistMonthTo(String(json.periodo.month_to));
      }
    } catch (err: any) {
      setHistorico(null);
      console.error(err);
    } finally {
      setHistoricoLoading(false);
    }
  };

  useEffect(() => {
    loadHistorico();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [histDesdeInicio, histYearFrom, histMonthFrom, histYearTo, histMonthTo]);

  const colaboradorOptions = useMemo(
    () =>
      colaboradores.map((c) => ({
        value: String(c.id),
        label: c.codigo_funcionario ? `${c.codigo_funcionario} — ${c.nome}` : c.nome,
        keywords: `${c.codigo_funcionario ?? ''} ${c.nome} ${c.setor ?? ''}`,
      })),
    [colaboradores]
  );

  const openCreate = (grupo?: EmprestimoColaboradorGrupo) => {
    setEditing(null);
    setForm({
      ...EMPTY_FORM,
      colaborador_id: grupo?.colaborador_id != null ? String(grupo.colaborador_id) : '',
      codigo_funcionario: grupo?.codigo_funcionario ?? '',
      nome_colaborador: grupo?.nome_colaborador ?? '',
      setor_nome: grupo?.setor_nome ?? '',
      empresa_nome: grupo?.empresa_nome ?? '',
    });
    setFormOpen(true);
  };

  const openEdit = (row: EmprestimoRow) => {
    setEditing(row);
    setForm({
      colaborador_id: row.colaborador_id != null ? String(row.colaborador_id) : '',
      codigo_funcionario: row.codigo_funcionario ?? '',
      nome_colaborador: row.nome_colaborador,
      setor_nome: row.setor_nome ?? '',
      empresa_nome: row.empresa_nome ?? '',
      instituicao_financeira: row.instituicao_financeira,
      valor_contratado: row.valor_contratado != null ? String(row.valor_contratado) : '',
      valor_recebido: row.valor_recebido != null ? String(row.valor_recebido) : '',
      valor_parcela: String(row.valor_parcela || ''),
      quantidade_parcelas: String(row.quantidade_parcelas),
      parcelas_pagas: String(row.parcelas_pagas),
      data_inicio: row.data_inicio ?? '',
      previsao_termino: row.previsao_termino ?? '',
      status: row.status,
      rubrica_codigo: row.rubrica_codigo ?? '',
      rubrica_nome: row.rubrica_nome ?? '',
      observacao: row.observacao ?? '',
    });
    setFormOpen(true);
  };

  const onColaboradorChange = (id: string) => {
    const col = colaboradores.find((c) => String(c.id) === id);
    setForm((p) => ({
      ...p,
      colaborador_id: id,
      codigo_funcionario: col?.codigo_funcionario ?? p.codigo_funcionario,
      nome_colaborador: col?.nome ?? p.nome_colaborador,
      setor_nome: col?.setor ?? p.setor_nome,
      empresa_nome: col?.empresa ?? p.empresa_nome,
    }));
  };

  const salvar = async () => {
    if (!form.instituicao_financeira.trim()) {
      alert('Informe a instituição financeira.');
      return;
    }
    setSaving(true);
    try {
      const body = {
        ...form,
        colaborador_id: form.colaborador_id ? Number(form.colaborador_id) : null,
        valor_contratado: form.valor_contratado !== '' ? Number(form.valor_contratado) : null,
        valor_recebido: form.valor_recebido !== '' ? Number(form.valor_recebido) : null,
        valor_parcela: Number(form.valor_parcela) || 0,
        quantidade_parcelas: Number(form.quantidade_parcelas) || 1,
        parcelas_pagas: Number(form.parcelas_pagas) || 0,
        data_inicio: form.data_inicio || null,
        previsao_termino: form.previsao_termino || null,
      };
      const res = await fetch(editing ? `/api/folha/emprestimos/${editing.id}` : '/api/folha/emprestimos', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Falha ao salvar.');
      setFormOpen(false);
      setEditing(null);
      await load();
    } catch (err: any) {
      alert(err?.message || 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  const excluir = async (row: EmprestimoRow) => {
    if (!(await confirmDelete(`Excluir empréstimo de ${row.instituicao_financeira}?`))) return;
    const res = await fetch(`/api/folha/emprestimos/${row.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      alert(json.error || 'Falha ao excluir.');
      return;
    }
    await load();
  };

  const openDesligamento = (row: EmprestimoRow) => {
    setDesligamentoOpen(row);
    setDesligamentoForm({
      data_desligamento: row.data_desligamento ?? new Date().toISOString().slice(0, 10),
      responsabilidade: row.data_desligamento ? row.responsabilidade : 'colaborador',
      motivo_encerramento: row.motivo_encerramento ?? '',
      aplicar_todos_colaborador: true,
    });
  };

  const salvarDesligamento = async () => {
    if (!desligamentoOpen) return;
    if (!desligamentoForm.data_desligamento) {
      alert('Informe a data de desligamento.');
      return;
    }
    setDesligamentoSaving(true);
    try {
      const res = await fetch(`/api/folha/emprestimos/${desligamentoOpen.id}/desligamento`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...desligamentoForm,
          projeta_parcelas: false,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Falha ao registrar desligamento.');
      setDesligamentoOpen(null);
      await load();
      await loadAlertas();
    } catch (err: any) {
      alert(err?.message || 'Erro ao registrar desligamento.');
    } finally {
      setDesligamentoSaving(false);
    }
  };

  const sincronizarFolha = async () => {
    setSyncing(true);
    setSyncMsg('');
    try {
      const res = await fetch('/api/folha/emprestimos/sync-folha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: Number(syncYear), month: Number(syncMonth) }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Falha na sincronização.');
      setSyncMsg(
        `${json.criados ?? 0} criado(s), ${json.atualizados ?? 0} atualizado(s) — folha normal ${formatCurrency(json.desconto_liquido_folha ?? json.desconto_liquido ?? 0)}${(json.descontos_rescisao ?? 0) > 0 ? ` · rescisão ${formatCurrency(json.descontos_rescisao)} (não sincronizada como parcela)` : ''} (${MESES[Number(syncMonth)]}/${syncYear}).`
      );
      await load();
      await loadConciliacao();
    } catch (err: any) {
      alert(err?.message || 'Erro na sincronização.');
    } finally {
      setSyncing(false);
    }
  };

  const toggleGrupo = (key: string) => setExpanded((p) => ({ ...p, [key]: !p[key] }));

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[#004D40]">
            <Landmark className="w-6 h-6" />
            <h1 className="text-2xl font-extrabold text-slate-900">RH — Empréstimos consignados</h1>
          </div>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl">
            Cadastro de empréstimos por colaborador (múltiplos por pessoa). Separado do FGTS e dos encargos da folha.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <RefreshCcw className={cn('w-4 h-4', loading && 'animate-spin')} />
            Atualizar
          </button>
          <button
            type="button"
            onClick={() => openCreate()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#004D40] text-white text-sm font-bold rounded-xl hover:bg-[#003d33]"
          >
            <Plus className="w-4 h-4" />
            Novo empréstimo
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-900 flex items-start gap-2">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold">Rescisões e empréstimos</p>
          <p className="text-xs mt-1 text-amber-800">{REGRAS_RESCISAO_PENDENTES}</p>
        </div>
      </div>

      {(alertasLoading || alertasDesligamento.length > 0) && (
        <div className="rounded-2xl border border-orange-200 bg-orange-50/60 overflow-hidden">
          <div className="px-4 py-3 border-b border-orange-100 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <UserMinus className="w-4 h-4 text-orange-800" />
              <h2 className="text-sm font-bold text-slate-900">
                Colaboradores desligados com empréstimo ativo
              </h2>
            </div>
            <button
              type="button"
              onClick={loadAlertas}
              disabled={alertasLoading}
              className="text-xs font-bold text-orange-800 hover:underline"
            >
              Atualizar
            </button>
          </div>
          {alertasLoading ? (
            <div className="py-6 flex justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-orange-400" />
            </div>
          ) : (
            <div className="divide-y divide-orange-100">
              {alertasDesligamento.map((a) => (
                <div
                  key={a.emprestimo_id}
                  className="px-4 py-3 flex flex-wrap items-center justify-between gap-3"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{a.nome_colaborador}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {a.instituicao_financeira} · {formatCurrency(a.valor_parcela)}/mês · situação:{' '}
                      <span className="font-medium">{a.situacao_folha}</span>
                      {a.competencia_folha?.month ? ` (${MESES[a.competencia_folha.month]}/${a.competencia_folha.year})` : ''}
                    </p>
                    <p className="text-[10px] text-orange-700 mt-1">{a.sugestao}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const row = data?.grupos
                        .flatMap((g) => g.emprestimos)
                        .find((e) => e.id === a.emprestimo_id);
                      if (row) openDesligamento(row);
                    }}
                    className="px-3 py-1.5 text-xs font-bold rounded-lg bg-orange-800 text-white hover:bg-orange-900"
                  >
                    Registrar desligamento
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Colaboradores', value: data?.resumo.colaboradores ?? 0, icon: Users, currency: false },
          { label: 'Empréstimos', value: data?.resumo.total_emprestimos ?? 0, icon: Landmark, currency: false },
          { label: 'Ativos', value: data?.resumo.ativos ?? 0, icon: Wallet, currency: false },
          {
            label: 'Parcela mensal (ativos)',
            value: data?.resumo.parcela_mensal_total ?? 0,
            icon: Wallet,
            currency: true,
          },
        ].map((card) => (
          <div key={card.label} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
            <div className="flex items-center gap-2 text-slate-400">
              <card.icon className="w-4 h-4" />
              <p className="text-[10px] font-bold uppercase tracking-widest">{card.label}</p>
            </div>
            <p className="text-xl font-extrabold text-slate-900 mt-2 tabular-nums">
              {card.currency ? formatCurrency(Number(card.value)) : Number(card.value).toLocaleString('pt-BR')}
            </p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
        <div className="flex flex-wrap gap-3 items-end">
          <label className="text-xs block min-w-[140px]">
            <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">Status</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
            >
              <option value="">Todos</option>
              {EMPRESTIMO_STATUS_OPTIONS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs block min-w-[160px]">
            <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">Empresa</span>
            <select
              value={empresaFilter}
              onChange={(e) => setEmpresaFilter(e.target.value)}
              className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
            >
              <option value="">Todas</option>
              {(data?.filtros.empresas ?? []).map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs block min-w-[160px]">
            <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">Setor</span>
            <select
              value={setorFilter}
              onChange={(e) => setSetorFilter(e.target.value)}
              className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
            >
              <option value="">Todos</option>
              {(data?.filtros.setores ?? []).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-end gap-3 pt-2 border-t border-slate-100">
          <p className="text-xs font-bold text-slate-600 w-full">Sincronizar rubricas de empréstimo da folha importada</p>
          <label className="text-xs">
            <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">Ano</span>
            <input
              type="number"
              value={syncYear}
              onChange={(e) => setSyncYear(e.target.value)}
              className="mt-1 w-24 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm tabular-nums"
            />
          </label>
          <label className="text-xs">
            <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">Mês</span>
            <select
              value={syncMonth}
              onChange={(e) => setSyncMonth(e.target.value)}
              className="mt-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
            >
              {MESES.slice(1).map((m, i) => (
                <option key={m} value={String(i + 1)}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={sincronizarFolha}
            disabled={syncing}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 text-white text-xs font-bold rounded-xl disabled:opacity-60"
          >
            {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
            Sincronizar da folha
          </button>
          {syncMsg && <span className="text-xs text-emerald-700">{syncMsg}</span>}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-indigo-100 shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => setHistExpanded((p) => !p)}
          className="w-full px-4 py-3 border-b border-indigo-50 bg-indigo-50/40 flex items-center justify-between gap-2 text-left hover:bg-indigo-50/70"
        >
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-indigo-800" />
            <div>
              <h2 className="text-sm font-bold text-slate-900">Análise histórica</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Totais acumulados no período — evita interpretar um único mês isolado
              </p>
            </div>
          </div>
          {histExpanded ? (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-slate-400" />
          )}
        </button>

        {histExpanded && (
          <div className="p-4 space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 pb-2">
                <input
                  type="checkbox"
                  checked={histDesdeInicio}
                  onChange={(e) => setHistDesdeInicio(e.target.checked)}
                  className="rounded border-slate-300"
                />
                Desde o início dos empréstimos
              </label>
              {!histDesdeInicio && (
                <>
                  <label className="text-xs">
                    <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">De</span>
                    <div className="flex gap-1 mt-1">
                      <select
                        value={histMonthFrom}
                        onChange={(e) => setHistMonthFrom(e.target.value)}
                        className="px-2 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                      >
                        {MESES.slice(1).map((m, i) => (
                          <option key={m} value={String(i + 1)}>
                            {m}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        value={histYearFrom}
                        onChange={(e) => setHistYearFrom(e.target.value)}
                        className="w-20 px-2 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm tabular-nums"
                      />
                    </div>
                  </label>
                </>
              )}
              <label className="text-xs">
                <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">Até</span>
                <div className="flex gap-1 mt-1">
                  <select
                    value={histMonthTo}
                    onChange={(e) => setHistMonthTo(e.target.value)}
                    className="px-2 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                  >
                    {MESES.slice(1).map((m, i) => (
                      <option key={m} value={String(i + 1)}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    value={histYearTo}
                    onChange={(e) => setHistYearTo(e.target.value)}
                    className="w-20 px-2 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm tabular-nums"
                  />
                </div>
              </label>
              <button
                type="button"
                onClick={loadHistorico}
                disabled={historicoLoading}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                <RefreshCcw className={cn('w-3.5 h-3.5', historicoLoading && 'animate-spin')} />
                Atualizar
              </button>
            </div>

            {historicoLoading ? (
              <div className="py-10 flex justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
              </div>
            ) : !historico?.periodo ? (
              <p className="text-sm text-slate-400 text-center py-8">
                Nenhum lançamento de empréstimo importado na folha para calcular o histórico.
              </p>
            ) : (
              <>
                <p className="text-xs text-slate-500 flex items-center gap-1.5">
                  <CalendarRange className="w-3.5 h-3.5" />
                  {historico.periodo.label} · {historico.periodo.competencias} competência(s) com movimento
                </p>

                <div className="rounded-2xl border-2 border-indigo-200 bg-gradient-to-br from-indigo-50/80 to-white p-5">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-700 mb-4">
                    Total histórico do período
                  </p>
                  <div className="space-y-3 max-w-md">
                    {[
                      {
                        label: 'Pago / repassado',
                        hint: 'Soma dos descontos brutos repassados às instituições',
                        value: historico.resumo.pago_repassado,
                      },
                      {
                        label: 'Descontado (folha normal)',
                        hint: 'Desconto líquido da folha mensal (exclui rescisão)',
                        value: historico.resumo.descontado_folha_normal ?? historico.resumo.descontado,
                        bold: true,
                      },
                      ...(historico.resumo.descontado_rescisao > 0.009
                        ? [
                            {
                              label: 'Descontado (rescisão)',
                              hint: 'Identificado na folha, não tratado como parcela mensal',
                              value: historico.resumo.descontado_rescisao,
                            },
                          ]
                        : []),
                      {
                        label: 'Descontado (total)',
                        hint: 'Folha normal + rescisão',
                        value: historico.resumo.descontado,
                      },
                    ].map((row) => (
                      <div key={row.label} className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-sm text-slate-700">{row.label}</p>
                          <p className="text-[10px] text-slate-400">{row.hint}</p>
                        </div>
                        <p
                          className={cn(
                            'text-lg tabular-nums',
                            row.bold ? 'font-extrabold text-slate-900' : 'font-semibold text-slate-800'
                          )}
                        >
                          {formatCurrency(row.value)}
                        </p>
                      </div>
                    ))}
                    <div className="border-t border-indigo-200 pt-3 flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-bold text-indigo-900">Diferença acumulada</p>
                        <p className="text-[10px] text-slate-500">
                          Estornos e compensações no período (pago − descontado)
                        </p>
                      </div>
                      <p
                        className={cn(
                          'text-xl font-extrabold tabular-nums',
                          historico.resumo.diferenca_acumulada > 0.009
                            ? 'text-amber-700'
                            : 'text-emerald-700'
                        )}
                      >
                        {formatCurrency(historico.resumo.diferenca_acumulada)}
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <button
                    type="button"
                    onClick={() => setHistMensalOpen((p) => !p)}
                    className="text-xs font-bold text-slate-600 hover:text-slate-900 flex items-center gap-1"
                  >
                    {histMensalOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    Evolução mensal ({historico.evolucao_mensal.length})
                  </button>
                  {histMensalOpen && historico.evolucao_mensal.length > 0 && (
                    <div className="mt-2 overflow-auto max-h-56 rounded-xl border border-slate-100">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 sticky top-0">
                          <tr>
                            {['Competência', 'Descontos', 'Estornos', 'Líquido', 'Dif. mês'].map((h) => (
                              <th
                                key={h}
                                className={cn(
                                  'px-3 py-2 font-bold text-slate-400 uppercase tracking-wider text-[10px]',
                                  h !== 'Competência' && 'text-right'
                                )}
                              >
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {historico.evolucao_mensal.map((m) => (
                            <tr key={`${m.year}-${m.month}`} className="hover:bg-slate-50/50">
                              <td className="px-3 py-2 font-medium text-slate-800">
                                {MESES[m.month]}/{m.year}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(m.descontos)}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-amber-700">
                                {m.estornos > 0 ? `−${formatCurrency(m.estornos)}` : formatCurrency(0)}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums font-semibold">
                                {formatCurrency(m.desconto_liquido)}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                                {formatCurrency(m.diferenca_mes)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {historico.por_colaborador.length > 0 && (
                  <div className="overflow-auto max-h-[360px] rounded-xl border border-slate-100">
                    <table className="w-full text-xs text-left min-w-[720px]">
                      <thead className="bg-slate-50 sticky top-0">
                        <tr>
                          {['Colaborador', 'Instituição', 'Pago/repassado', 'Descontado', 'Diferença'].map((h) => (
                            <th
                              key={h}
                              className={cn(
                                'px-3 py-2 font-bold text-slate-400 uppercase tracking-wider text-[10px]',
                                !['Colaborador', 'Instituição'].includes(h) && 'text-right'
                              )}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {historico.por_colaborador.map((l) => (
                          <tr key={l.key} className="hover:bg-slate-50/50">
                            <td className="px-3 py-2">
                              <p className="font-semibold text-slate-800">{l.nome_funcionario}</p>
                              <p className="text-[10px] text-slate-400 tabular-nums">{l.codigo_funcionario}</p>
                            </td>
                            <td className="px-3 py-2 text-slate-700">{l.instituicao_financeira}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(l.pago_repassado)}</td>
                            <td className="px-3 py-2 text-right tabular-nums font-semibold">
                              {formatCurrency(l.descontado)}
                            </td>
                            <td
                              className={cn(
                                'px-3 py-2 text-right tabular-nums font-bold',
                                l.diferenca_acumulada > 0.009 ? 'text-amber-700' : 'text-slate-500'
                              )}
                            >
                              {formatCurrency(l.diferenca_acumulada)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-teal-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-teal-50 bg-teal-50/40 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Conciliação do mês — {MESES[Number(syncMonth)]}/{syncYear}</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Detalhe da competência selecionada. Use a análise histórica acima para o acumulado.
            </p>
          </div>
          <button
            type="button"
            onClick={loadConciliacao}
            disabled={conciliacaoLoading}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-teal-800 hover:underline"
          >
            <RefreshCcw className={cn('w-3.5 h-3.5', conciliacaoLoading && 'animate-spin')} />
            Recalcular
          </button>
        </div>

        {conciliacao && (
          <div className="px-4 py-3 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 border-b border-slate-100 bg-slate-50/40">
            {[
              { label: 'Descontos folha', value: conciliacao.resumo.descontos_folha_normal ?? conciliacao.resumo.descontos, className: 'text-slate-900' },
              { label: 'Descontos rescisão', value: conciliacao.resumo.descontos_rescisao ?? 0, className: 'text-violet-700' },
              { label: 'Estornos', value: conciliacao.resumo.estornos, className: 'text-amber-700' },
              { label: 'Líquido folha', value: conciliacao.resumo.desconto_liquido_folha ?? conciliacao.resumo.desconto_liquido, className: 'text-teal-800 font-extrabold' },
              { label: 'Líquido total', value: conciliacao.resumo.desconto_liquido, className: 'text-slate-700' },
              { label: 'Linhas', value: conciliacao.resumo.linhas, currency: false },
              {
                label: 'Divergências',
                value: conciliacao.resumo.divergencias,
                currency: false,
                className: 'text-red-600 font-extrabold',
                onClick: () => setDivExpanded(true),
              },
              {
                label: 'Pendentes',
                value: conciliacao.resumo.divergencias_pendentes ?? conciliacao.resumo.divergencias,
                currency: false,
                className: 'text-orange-700 font-bold',
              },
            ].map((card) => (
              <div
                key={card.label}
                className={cn(
                  'rounded-xl border border-slate-100 bg-white p-3',
                  card.onClick && Number(card.value) > 0 && 'cursor-pointer hover:border-red-200 hover:shadow-sm'
                )}
                onClick={card.onClick && Number(card.value) > 0 ? card.onClick : undefined}
                onKeyDown={
                  card.onClick && Number(card.value) > 0
                    ? (e) => e.key === 'Enter' && card.onClick?.()
                    : undefined
                }
                role={card.onClick && Number(card.value) > 0 ? 'button' : undefined}
                tabIndex={card.onClick && Number(card.value) > 0 ? 0 : undefined}
              >
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{card.label}</p>
                <p className={cn('text-lg tabular-nums mt-1', card.className ?? 'text-slate-900')}>
                  {card.currency === false
                    ? Number(card.value).toLocaleString('pt-BR')
                    : formatCurrency(Number(card.value))}
                </p>
              </div>
            ))}
          </div>
        )}

        {conciliacao && (conciliacao.divergencias_lista?.length ?? 0) > 0 && (
          <div className="border-b border-red-100">
            <button
              type="button"
              onClick={() => setDivExpanded((p) => !p)}
              className="w-full px-4 py-3 bg-red-50/50 flex items-center justify-between gap-2 text-left hover:bg-red-50"
            >
              <div className="flex items-center gap-2">
                <FileWarning className="w-4 h-4 text-red-700" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Divergências — {conciliacao.resumo.divergencias} encontrada(s)
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {conciliacao.resumo.divergencias_justificadas ?? 0} justificada(s) ·{' '}
                    {conciliacao.resumo.divergencias_pendentes ?? 0} pendente(s)
                  </p>
                </div>
              </div>
              {divExpanded ? (
                <ChevronDown className="w-4 h-4 text-slate-400" />
              ) : (
                <ChevronRight className="w-4 h-4 text-slate-400" />
              )}
            </button>

            {divExpanded && (
              <div className="px-4 pb-4 space-y-2 max-h-[320px] overflow-auto">
                {conciliacao.divergencias_lista.map((div) => (
                  <button
                    key={div.conciliacao_key}
                    type="button"
                    onClick={() => openDivergencia(div)}
                    className={cn(
                      'w-full text-left rounded-xl border p-3 flex flex-wrap items-center justify-between gap-3 hover:shadow-sm transition-shadow',
                      div.justificado
                        ? 'border-emerald-200 bg-emerald-50/40'
                        : 'border-red-200 bg-white hover:border-red-300'
                    )}
                  >
                    <div className="min-w-[200px]">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-slate-900">{div.nome_colaborador}</p>
                        {div.justificado && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Mat. {div.codigo_funcionario} · {div.instituicao_financeira}
                      </p>
                      {div.motivo && (
                        <p className="text-[10px] font-semibold text-slate-600 mt-1">
                          {motivoDivergenciaLabel(div.motivo)}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-4 text-xs">
                      <div className="text-right">
                        <p className="text-[10px] uppercase text-slate-400 font-bold">Esperado</p>
                        <p className="tabular-nums font-semibold">
                          {div.valor_esperado != null ? formatCurrency(div.valor_esperado) : '—'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] uppercase text-slate-400 font-bold">Descontado</p>
                        <p className="tabular-nums font-semibold">{formatCurrency(div.valor_descontado)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] uppercase text-slate-400 font-bold">Repassado</p>
                        <p className="tabular-nums font-semibold">{formatCurrency(div.valor_repassado)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] uppercase text-slate-400 font-bold">Diferença</p>
                        <p className="tabular-nums font-extrabold text-red-600">{formatCurrency(div.diferenca)}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {conciliacaoLoading ? (
          <div className="px-4 py-10 flex justify-center">
            <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
          </div>
        ) : !conciliacao?.linhas.length ? (
          <p className="px-4 py-10 text-sm text-slate-400 text-center">
            Nenhum lançamento de empréstimo/estorno na folha importada desta competência.
          </p>
        ) : (
          <div className="overflow-auto max-h-[480px]">
            <table className="w-full text-left min-w-[1000px] text-xs">
              <thead className="sticky top-0 bg-slate-50">
                <tr>
                  {[
                    'Colaborador',
                    'Instituição',
                    'Folha',
                    'Rescisão',
                    'Estornos',
                    'Líq. folha',
                    'Cadastro',
                    'Diferença',
                    '',
                  ].map((h) => (
                    <th
                      key={h}
                      className={cn(
                        'px-3 py-2 font-bold text-slate-400 uppercase tracking-wider text-[10px]',
                        !['Colaborador', 'Instituição', ''].includes(h) && 'text-right'
                      )}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {conciliacao.linhas.map((linha) => {
                  const hasDiv = conciliacao.divergencias_lista?.some(
                    (d) => d.conciliacao_key === linha.key
                  );
                  const detOpen = concExpanded[linha.key];
                  return (
                    <React.Fragment key={linha.key}>
                      <tr className={cn(hasDiv && 'bg-amber-50/40')}>
                        <td className="px-3 py-2.5">
                          <p className="font-semibold text-slate-800">{linha.nome_funcionario}</p>
                          <p className="text-[10px] text-slate-400 tabular-nums">{linha.codigo_funcionario}</p>
                        </td>
                        <td className="px-3 py-2.5 text-slate-700">{linha.instituicao_financeira}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {formatCurrency(linha.descontos_folha_normal)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-violet-700">
                          {linha.descontos_rescisao > 0 ? formatCurrency(linha.descontos_rescisao) : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-amber-700">
                          {linha.estornos > 0 ? `−${formatCurrency(linha.estornos)}` : formatCurrency(0)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-bold text-teal-800">
                          {formatCurrency(linha.desconto_liquido_folha)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">
                          {linha.valor_cadastro != null ? formatCurrency(linha.valor_cadastro) : '—'}
                        </td>
                        <td
                          className={cn(
                            'px-3 py-2.5 text-right tabular-nums font-semibold',
                            hasDiv ? 'text-red-600' : 'text-slate-500'
                          )}
                        >
                          {linha.diferenca != null ? formatCurrency(linha.diferenca) : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {hasDiv && (
                              <button
                                type="button"
                                onClick={() => {
                                  const div = conciliacao?.divergencias_lista?.find((d) => d.conciliacao_key === linha.key);
                                  if (div) openDivergencia(div);
                                }}
                                className="text-[10px] font-bold text-red-700 hover:underline px-1"
                              >
                                Divergência
                              </button>
                            )}
                            {linha.lancamentos.length > 1 && (
                              <button
                                type="button"
                                onClick={() => setConcExpanded((p) => ({ ...p, [linha.key]: !p[linha.key] }))}
                                className="text-[10px] font-bold text-slate-500 hover:text-slate-800"
                              >
                                {detOpen ? 'Ocultar' : `${linha.lancamentos.length} lanç.`}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {detOpen && (
                        <tr className="bg-slate-50/60">
                          <td colSpan={9} className="px-6 py-2">
                            <div className="space-y-1">
                              {linha.lancamentos.map((l, i) => (
                                <div key={i} className="flex justify-between text-[10px] text-slate-600">
                                  <span>
                                    <span
                                      className={cn(
                                        'font-bold uppercase mr-2',
                                        l.tipo === 'estorno' ? 'text-amber-700' : 'text-slate-500'
                                      )}
                                    >
                                      {l.tipo}
                                    </span>
                                    <span
                                      className={cn(
                                        'font-bold uppercase mr-2',
                                        l.origem === 'rescisao' ? 'text-violet-700' : 'text-teal-700'
                                      )}
                                    >
                                      {l.origem === 'rescisao' ? 'rescisão' : 'folha'}
                                    </span>
                                    {l.codigo_rubrica && `${l.codigo_rubrica} — `}
                                    {l.descricao_rubrica}
                                  </span>
                                  <span className="tabular-nums font-semibold">{formatCurrency(l.valor)}</span>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900">Colaboradores com empréstimos</h2>
          {loading && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
        </div>

        {!loading && (data?.grupos.length ?? 0) === 0 ? (
          <p className="px-4 py-12 text-sm text-slate-400 text-center">
            Nenhum empréstimo cadastrado. Use &quot;Novo empréstimo&quot; ou sincronize a partir da folha importada.
          </p>
        ) : (
          <div className="divide-y divide-slate-50">
            {(data?.grupos ?? []).map((grupo) => {
              const isOpen = expanded[grupo.key] ?? true;
              return (
                <div key={grupo.key}>
                  <button
                    type="button"
                    onClick={() => toggleGrupo(grupo.key)}
                    className="w-full flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-slate-50/80 text-left"
                  >
                    {isOpen ? (
                      <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                    )}
                    <div className="flex-1 min-w-[200px]">
                      <p className="text-sm font-bold text-slate-900">{grupo.nome_colaborador}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {grupo.codigo_funcionario && (
                          <span className="tabular-nums mr-2">Mat. {grupo.codigo_funcionario}</span>
                        )}
                        {grupo.setor_nome && <span>{grupo.setor_nome}</span>}
                        {grupo.empresa_nome && (
                          <span className="inline-flex items-center gap-1 ml-2">
                            <Building2 className="w-3 h-3" />
                            {grupo.empresa_nome}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-500">{grupo.qtd_emprestimos} empréstimo(s)</p>
                      <p className="text-sm font-bold tabular-nums text-slate-900">
                        {formatCurrency(grupo.parcela_mensal_total)}/mês
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openCreate(grupo);
                      }}
                      className="text-xs font-bold text-[#004D40] hover:underline px-2"
                    >
                      + Empréstimo
                    </button>
                  </button>

                  {isOpen && (
                    <div className="px-4 pb-4 overflow-auto">
                      <table className="w-full text-left min-w-[1100px] text-xs">
                        <thead>
                          <tr className="bg-slate-50/80">
                            {[
                              'Instituição',
                              'Contratado',
                              'Recebido',
                              'Parcela',
                              'Parcelas',
                              'Pagas',
                              'Restantes',
                              'Responsab.',
                              'Desligamento',
                              'Início',
                              'Término prev.',
                              'Status',
                              '',
                            ].map((h) => (
                              <th
                                key={h}
                                className={cn(
                                  'px-2 py-2 font-bold text-slate-400 uppercase tracking-wider text-[10px]',
                                  h && h !== 'Instituição' && h !== 'Status' && h !== '' && 'text-right',
                                  h === 'Status' && 'text-center'
                                )}
                              >
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {grupo.emprestimos.map((e) => (
                            <tr key={e.id} className="hover:bg-slate-50/50">
                              <td className="px-2 py-2.5">
                                <p className="font-semibold text-slate-800">{e.instituicao_financeira}</p>
                                {e.rubrica_nome && (
                                  <p className="text-[10px] text-slate-400 truncate max-w-[200px]" title={e.rubrica_nome}>
                                    {e.rubrica_codigo ? `${e.rubrica_codigo} — ` : ''}
                                    {e.rubrica_nome}
                                  </p>
                                )}
                              </td>
                              <td className="px-2 py-2.5 text-right tabular-nums text-slate-700">
                                {e.valor_contratado != null ? formatCurrency(e.valor_contratado) : '—'}
                              </td>
                              <td className="px-2 py-2.5 text-right tabular-nums text-slate-700">
                                {e.valor_recebido != null ? formatCurrency(e.valor_recebido) : '—'}
                              </td>
                              <td className="px-2 py-2.5 text-right tabular-nums font-bold text-slate-900">
                                {formatCurrency(e.valor_parcela)}
                              </td>
                              <td className="px-2 py-2.5 text-right tabular-nums">{e.quantidade_parcelas}</td>
                              <td className="px-2 py-2.5 text-right tabular-nums">{e.parcelas_pagas}</td>
                              <td className="px-2 py-2.5 text-right tabular-nums font-semibold">
                                {e.projeta_parcelas
                                  ? e.parcelas_restantes_exibicao ?? e.parcelas_restantes
                                  : '—'}
                              </td>
                              <td className="px-2 py-2.5 text-center">
                                <span
                                  className={cn(
                                    'inline-flex px-2 py-0.5 rounded-lg text-[10px] font-bold',
                                    responsabilidadeBadgeClass(e.responsabilidade)
                                  )}
                                >
                                  {responsabilidadeLabel(e.responsabilidade)}
                                </span>
                              </td>
                              <td className="px-2 py-2.5 text-right tabular-nums text-slate-600 text-[10px]">
                                {fmtDate(e.data_desligamento)}
                              </td>
                              <td className="px-2 py-2.5 text-right tabular-nums text-slate-600">
                                {fmtDate(e.data_inicio)}
                              </td>
                              <td className="px-2 py-2.5 text-right tabular-nums text-slate-600">
                                {e.projeta_parcelas ? fmtDate(e.previsao_termino) : 'Não projeta'}
                              </td>
                              <td className="px-2 py-2.5 text-center">
                                <span
                                  className={cn(
                                    'inline-flex px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase',
                                    statusBadgeClass(e.status)
                                  )}
                                >
                                  {statusLabel(e.status)}
                                </span>
                              </td>
                              <td className="px-2 py-2.5">
                                <div className="flex items-center justify-end gap-1">
                                  {!e.data_desligamento && e.status === 'ativo' && (
                                    <button
                                      type="button"
                                      onClick={() => openDesligamento(e)}
                                      className="p-1.5 rounded-lg hover:bg-orange-50 text-orange-700"
                                      title="Registrar desligamento"
                                    >
                                      <UserMinus className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => openEdit(e)}
                                    className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
                                    title="Editar"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => excluir(e)}
                                    className="p-1.5 rounded-lg hover:bg-red-50 text-red-500"
                                    title="Excluir"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-auto">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white">
              <h3 className="text-lg font-bold text-slate-900">
                {editing ? 'Editar empréstimo' : 'Novo empréstimo consignado'}
              </h3>
              <button type="button" onClick={() => setFormOpen(false)} className="p-2 rounded-lg hover:bg-slate-100">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Colaborador</label>
                <SearchableSelect
                  value={form.colaborador_id}
                  onChange={onColaboradorChange}
                  options={colaboradorOptions}
                  placeholder="Buscar colaborador..."
                  className="mt-1"
                />
              </div>
              <label className="text-xs block">
                <span className="font-bold text-slate-500 uppercase tracking-wider">Matrícula</span>
                <input
                  value={form.codigo_funcionario}
                  onChange={(e) => setForm((p) => ({ ...p, codigo_funcionario: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                />
              </label>
              <label className="text-xs block">
                <span className="font-bold text-slate-500 uppercase tracking-wider">Nome</span>
                <input
                  value={form.nome_colaborador}
                  onChange={(e) => setForm((p) => ({ ...p, nome_colaborador: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                />
              </label>
              <label className="text-xs block md:col-span-2">
                <span className="font-bold text-slate-500 uppercase tracking-wider">Instituição financeira *</span>
                <input
                  value={form.instituicao_financeira}
                  onChange={(e) => setForm((p) => ({ ...p, instituicao_financeira: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                  placeholder="Ex.: Banco do Brasil, Caixa..."
                />
              </label>
              <label className="text-xs block">
                <span className="font-bold text-slate-500 uppercase tracking-wider">Valor contratado / liberado</span>
                <input
                  type="number"
                  step="0.01"
                  value={form.valor_contratado}
                  onChange={(e) => setForm((p) => ({ ...p, valor_contratado: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm tabular-nums"
                />
              </label>
              <label className="text-xs block">
                <span className="font-bold text-slate-500 uppercase tracking-wider">Valor efetivamente recebido</span>
                <input
                  type="number"
                  step="0.01"
                  value={form.valor_recebido}
                  onChange={(e) => setForm((p) => ({ ...p, valor_recebido: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm tabular-nums"
                  placeholder="Opcional"
                />
              </label>
              <label className="text-xs block">
                <span className="font-bold text-slate-500 uppercase tracking-wider">Valor da parcela *</span>
                <input
                  type="number"
                  step="0.01"
                  value={form.valor_parcela}
                  onChange={(e) => setForm((p) => ({ ...p, valor_parcela: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm tabular-nums"
                />
              </label>
              <label className="text-xs block">
                <span className="font-bold text-slate-500 uppercase tracking-wider">Qtd. parcelas</span>
                <input
                  type="number"
                  min={1}
                  value={form.quantidade_parcelas}
                  onChange={(e) => setForm((p) => ({ ...p, quantidade_parcelas: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm tabular-nums"
                />
              </label>
              <label className="text-xs block">
                <span className="font-bold text-slate-500 uppercase tracking-wider">Parcelas pagas</span>
                <input
                  type="number"
                  min={0}
                  value={form.parcelas_pagas}
                  onChange={(e) => setForm((p) => ({ ...p, parcelas_pagas: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm tabular-nums"
                />
              </label>
              <label className="text-xs block">
                <span className="font-bold text-slate-500 uppercase tracking-wider">Status</span>
                <select
                  value={form.status}
                  onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as EmprestimoStatus }))}
                  className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                >
                  {EMPRESTIMO_STATUS_OPTIONS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs block">
                <span className="font-bold text-slate-500 uppercase tracking-wider">Data de início</span>
                <input
                  type="date"
                  value={form.data_inicio}
                  onChange={(e) => setForm((p) => ({ ...p, data_inicio: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                />
              </label>
              <label className="text-xs block">
                <span className="font-bold text-slate-500 uppercase tracking-wider">Previsão de término</span>
                <input
                  type="date"
                  value={form.previsao_termino}
                  onChange={(e) => setForm((p) => ({ ...p, previsao_termino: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                />
              </label>
              <label className="text-xs block md:col-span-2">
                <span className="font-bold text-slate-500 uppercase tracking-wider">Observação</span>
                <textarea
                  value={form.observacao}
                  onChange={(e) => setForm((p) => ({ ...p, observacao: e.target.value }))}
                  rows={2}
                  className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                />
              </label>
            </div>

            <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-2 sticky bottom-0 bg-white">
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="px-4 py-2 text-sm font-semibold text-slate-600 rounded-xl hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={salvar}
                disabled={saving}
                className="px-5 py-2 bg-[#004D40] text-white text-sm font-bold rounded-xl disabled:opacity-60"
              >
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {desligamentoOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Registrar desligamento</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {desligamentoOpen.nome_colaborador} — {desligamentoOpen.instituicao_financeira}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDesligamentoOpen(null)}
                className="p-2 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
                {REGRAS_RESCISAO_PENDENTES}
              </p>
              <label className="text-xs block">
                <span className="font-bold text-slate-500 uppercase tracking-wider">Data de desligamento *</span>
                <input
                  type="date"
                  value={desligamentoForm.data_desligamento}
                  onChange={(e) =>
                    setDesligamentoForm((p) => ({ ...p, data_desligamento: e.target.value }))
                  }
                  className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                />
              </label>
              <label className="text-xs block">
                <span className="font-bold text-slate-500 uppercase tracking-wider">
                  Responsabilidade do contrato *
                </span>
                <select
                  value={desligamentoForm.responsabilidade}
                  onChange={(e) =>
                    setDesligamentoForm((p) => ({
                      ...p,
                      responsabilidade: e.target.value as EmprestimoResponsabilidade,
                    }))
                  }
                  className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                >
                  {EMPRESTIMO_RESPONSABILIDADE_OPTIONS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs block">
                <span className="font-bold text-slate-500 uppercase tracking-wider">Motivo / observação</span>
                <textarea
                  value={desligamentoForm.motivo_encerramento}
                  onChange={(e) =>
                    setDesligamentoForm((p) => ({ ...p, motivo_encerramento: e.target.value }))
                  }
                  rows={2}
                  className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                  placeholder="Ex.: desconto na rescisão, acordo com instituição..."
                />
              </label>
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={desligamentoForm.aplicar_todos_colaborador}
                  onChange={(e) =>
                    setDesligamentoForm((p) => ({
                      ...p,
                      aplicar_todos_colaborador: e.target.checked,
                    }))
                  }
                  className="rounded border-slate-300"
                />
                Aplicar a todos os empréstimos ativos deste colaborador
              </label>
              <p className="text-[10px] text-slate-500">
                A projeção de parcelas futuras será interrompida. Descontos de rescisão continuam visíveis na
                conciliação, mas não atualizam a parcela mensal do cadastro.
              </p>
            </div>

            <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDesligamentoOpen(null)}
                className="px-4 py-2 text-sm font-semibold text-slate-600 rounded-xl hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={salvarDesligamento}
                disabled={desligamentoSaving}
                className="px-5 py-2 bg-orange-800 text-white text-sm font-bold rounded-xl disabled:opacity-60"
              >
                {desligamentoSaving ? 'Salvando...' : 'Confirmar desligamento'}
              </button>
            </div>
          </div>
        </div>
      )}

      {divModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-auto">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Divergência de empréstimo</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {MESES[Number(conciliacao?.month)]}/{conciliacao?.year}
                </p>
              </div>
              <button type="button" onClick={() => setDivModal(null)} className="p-2 rounded-lg hover:bg-slate-100">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 space-y-3">
                <div>
                  <p className="text-[10px] font-bold uppercase text-slate-400">Colaborador</p>
                  <p className="text-sm font-bold text-slate-900">{divModal.nome_colaborador}</p>
                  <p className="text-xs text-slate-500 tabular-nums">Mat. {divModal.codigo_funcionario}</p>
                  <p className="text-xs text-slate-600 mt-1">{divModal.instituicao_financeira}</p>
                </div>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-lg bg-white border border-slate-100 p-2">
                    <p className="text-[10px] font-bold uppercase text-slate-400">Esperado</p>
                    <p className="text-sm font-extrabold tabular-nums mt-1">
                      {divModal.valor_esperado != null ? formatCurrency(divModal.valor_esperado) : '—'}
                    </p>
                  </div>
                  <div className="rounded-lg bg-white border border-slate-100 p-2">
                    <p className="text-[10px] font-bold uppercase text-slate-400">Descontado</p>
                    <p className="text-sm font-extrabold tabular-nums mt-1 text-teal-800">
                      {formatCurrency(divModal.valor_descontado)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-white border border-slate-100 p-2">
                    <p className="text-[10px] font-bold uppercase text-slate-400">Repassado</p>
                    <p className="text-sm font-extrabold tabular-nums mt-1">
                      {formatCurrency(divModal.valor_repassado)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                  <p className="text-sm font-semibold text-slate-700">Diferença</p>
                  <p className="text-lg font-extrabold tabular-nums text-red-600">
                    {formatCurrency(divModal.diferenca)}
                  </p>
                </div>
                {(divModal.descontos_rescisao > 0 || divModal.estornos > 0) && (
                  <p className="text-[10px] text-slate-500">
                    {divModal.descontos_rescisao > 0 && `Rescisão na folha: ${formatCurrency(divModal.descontos_rescisao)}. `}
                    {divModal.estornos > 0 && `Estornos: ${formatCurrency(divModal.estornos)}.`}
                  </p>
                )}
                {divModal.motivo_sugerido && !divModal.motivo && (
                  <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                    Motivo sugerido: <strong>{motivoDivergenciaLabel(divModal.motivo_sugerido)}</strong>
                  </p>
                )}
              </div>

              <label className="text-xs block">
                <span className="font-bold text-slate-500 uppercase tracking-wider">Motivo *</span>
                <select
                  value={divForm.motivo}
                  onChange={(e) =>
                    setDivForm((p) => ({ ...p, motivo: e.target.value as EmprestimoDivergenciaMotivo }))
                  }
                  className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                >
                  {EMPRESTIMO_DIVERGENCIA_MOTIVOS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-xs block">
                <span className="font-bold text-slate-500 uppercase tracking-wider">Justificativa *</span>
                <textarea
                  value={divForm.justificativa}
                  onChange={(e) => setDivForm((p) => ({ ...p, justificativa: e.target.value }))}
                  rows={4}
                  className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                  placeholder="Descreva o que ocorreu e como foi tratado..."
                />
              </label>
            </div>

            <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-2 sticky bottom-0 bg-white">
              <button
                type="button"
                onClick={() => setDivModal(null)}
                className="px-4 py-2 text-sm font-semibold text-slate-600 rounded-xl hover:bg-slate-100"
              >
                Fechar
              </button>
              <button
                type="button"
                onClick={salvarJustificativa}
                disabled={divSaving}
                className="px-5 py-2 bg-red-700 text-white text-sm font-bold rounded-xl disabled:opacity-60"
              >
                {divSaving ? 'Salvando...' : 'Registrar justificativa'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
