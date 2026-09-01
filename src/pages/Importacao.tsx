import React, { useEffect, useMemo, useState } from 'react';
import {
  Upload,
  FileSpreadsheet,
  FileText,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Boxes,
  FileBarChart,
  ClipboardList,
  Layers,
  Settings2,
  ArrowRightCircle,
  History,
  RefreshCcw,
  Undo2,
  X,
} from 'lucide-react';
import { formatCurrency, formatApiError, formatDate } from '../lib/utils';
import { useSearch } from '../context/SearchContext';
import { matchesSearch } from '../lib/search';
import {
  defaultRelCrdDestinosForScope,
  formatPeriodLabel,
  IMPORT_SCOPE_LABELS,
  suggestWeekIndexInMonth,
  type ImportScope,
} from '../lib/importPeriod';
import { ImportPeriodPicker } from '../components/ImportPeriodPicker';
import {
  REQ_DEFAULT_DESTINO_MAP,
  REQ_DEFAULT_CMV_SUBTIPO_MAP,
  REQ_DESTINO_LABELS,
  REQ_DESTINO_BADGES,
  REQ_DESTINOS,
  type ReqDestino,
  type ReqCmvSubtipo,
  emptyReqDestinoTotals,
  emptyReqCmvSubtipoTotals,
  isReqDestinoCmv,
  resolveReqCmvSubtipo,
  normalizeReqCmvSubtipo,
} from '../lib/requisicoesDestino';
import { ReqDestinoPicker } from '../components/ReqDestinoPicker';
import { ReqCmvSubtipoPicker } from '../components/ReqCmvSubtipoPicker';

// Fontes de importação a configurar (somente os cards por enquanto; a configuração vem depois).
const IMPORT_SOURCES = [
  {
    key: 'consumo_interno',
    title: 'Consumo interno',
    description: 'Relatório de consumo interno — acompanhamento semanal ou fechamento mensal.',
    icon: Boxes,
  },
  {
    key: 'extrato_mensal',
    title: 'Extrato Mensal',
    description: 'Extrato financeiro mensal consolidado.',
    icon: FileBarChart,
  },
  {
    key: 'rel_crd',
    title: 'Rel. CRD',
    description: 'Relatório de CRDs (realizado por conta).',
    icon: FileText,
  },
  {
    key: 'provisao_ferias',
    title: 'Provisão Férias',
    description: 'Resultado final da provisão de férias do mês (PDF).',
    icon: FileText,
  },
  {
    key: 'provisao_13',
    title: 'Provisões 13º',
    description: 'Resultado final da provisão de 13º salário do mês (PDF).',
    icon: FileText,
  },
  {
    key: 'rds',
    title: 'Relatório Diário de Situação',
    description: 'RDS — situação diária de diárias e receitas.',
    icon: ClipboardList,
  },
  {
    key: 'requisicoes_sintetica',
    title: 'Requisições Sintética por Grupo de Itens',
    description: 'Requisições agregadas por grupo de itens.',
    icon: Layers,
  },
];

const IMPORT_HISTORY_LABELS: Record<string, string> = {
  consumo_interno: 'Consumo interno',
  extrato_mensal: 'Extrato mensal / Folha',
  crds: 'CRDs',
  orcamento: 'Orçamento',
  ajustes: 'Ajustes',
  rel_crd: 'Rel. CRD',
  requisicoes_sintetica: 'Requisições Sintética',
  rds: 'Relatório Diário de Situação',
};

type ImportHistoryRow = {
  id: number;
  source_type: string;
  file_name?: string | null;
  status: 'success' | 'error';
  year?: number | null;
  month?: number | null;
  import_scope?: ImportScope | string | null;
  period_key?: string | null;
  week_index?: number | null;
  records_count?: number | null;
  total_amount?: number | null;
  user_name?: string | null;
  user_email?: string | null;
  error_message?: string | null;
  created_at: string;
};

type ParsedLine = {
  descricao: string;
  valor: number;
};

type ExcelColumn = {
  index: number;
  name: string;
};

type ConsumoLine = {
  cliente_id: number | string | null;
  cliente_nome: string;
  produto_codigo: number | string;
  produto: string;
  unidade: string;
  nf: number | string | null;
  data: string;
  data_iso: string;
  quantidade: number;
  vl_unitario: number;
  vl_total: number;
  vl_desconto: number;
  taxa_servico: number;
  vl_liquido: number;
  forma_pgto: string;
};

type ConsumoSummary = {
  lines_count: number;
  clientes_count: number;
  total_quantidade: number;
  total_liquido: number;
};

type Periodo = { month: number; year: number } | null;

const MESES = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const periodoLabel = (p: Periodo) => (p && p.month >= 1 && p.month <= 12 ? `${MESES[p.month]}/${p.year}` : '—');

type ExtratoEmployee = {
  matricula: number | string | null;
  nome: string;
  situacao: string;
  cpf: string;
  cargo_cod: number | string | null;
  cargo: string;
  cargo_id?: string;
  salario: number;
  proventos: number;
  descontos: number;
  liquido: number;
  base_inss: number;
  base_fgts: number;
  base_irrf: number;
};

type CadastroCargo = {
  id: number;
  name: string;
  sector_id: number;
  sector_name: string | null;
  active: boolean;
};

type ExtratoSummary = {
  funcionarios: number;
  total_proventos: number;
  total_descontos: number;
  total_liquido: number;
};

type RelCrdAccount = {
  nivel: number;
  codigo: string;
  nome: string;
  lancamentos: number;
  cancelamentos: number;
  saldo_lanc: number;
  baixas: number;
  estorno: number;
  baixas_liquido: number;
  lanc_liquido: number;
};

type RelCrdSummary = {
  contas: number;
  grupos: number;
  total_lancamentos: number;
  total_baixas: number;
  total_lanc_liquido: number;
};

type RelCrdDestinoFlags = { D: boolean; M: boolean };

const REL_CRD_DESTINO_LS_KEY = 'relCrd:destino_map:v2';

const loadRelCrdDestinoMap = (): Record<string, RelCrdDestinoFlags> => {
  try {
    const raw = localStorage.getItem(REL_CRD_DESTINO_LS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Record<string, RelCrdDestinoFlags> = {};
    for (const [codigo, value] of Object.entries(parsed as Record<string, any>)) {
      out[String(codigo)] = {
        D: Boolean(value?.D),
        M: Boolean(value?.M),
      };
    }
    return out;
  } catch {
    return {};
  }
};

const saveRelCrdDestinoMap = (map: Record<string, RelCrdDestinoFlags>) => {
  try {
    localStorage.setItem(REL_CRD_DESTINO_LS_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
};

/** Monta destinos do arquivo atual: reaproveita a última seleção por código; contas novas usam o padrão do escopo. */
const buildRelCrdDestinosForAccounts = (
  accounts: RelCrdAccount[],
  scope: ImportScope,
  saved: Record<string, RelCrdDestinoFlags> = loadRelCrdDestinoMap()
): Record<string, RelCrdDestinoFlags> => {
  const scopeDefault = defaultRelCrdDestinosForScope(scope);
  const destinos: Record<string, RelCrdDestinoFlags> = {};
  for (const acc of accounts) {
    const codigo = String(acc.codigo);
    const prev = saved[codigo];
    destinos[codigo] = prev
      ? { D: Boolean(prev.D), M: Boolean(prev.M) }
      : { ...scopeDefault };
  }
  return destinos;
};

type ProvisaoFeriasTotals = {
  salario: number;
  media_vantagens: number;
  terco_ferias: number;
  valor_devido: number;
  valor_mes: number;
  inss: number;
  fgts: number;
  pis: number;
};

type ProvisaoFeriasRow = {
  codigo: string;
  nome: string;
  vencto_ferias: string;
  fer_ven: number;
  fer_pro: number;
  faltas: number;
  salario: number;
  media_vantagens: number;
  terco_ferias: number;
  valor_devido: number;
  valor_mes: number;
  inss: number;
  fgts: number;
  pis: number;
};

type RdsItem = { label: string; values: number[] };
type RdsSection = { key: string; title: string; columns: string[]; items: RdsItem[]; total: number[] | null };
type RdsWeekRow = { dia: string; data: string; quantidade: number; percentual: number };

type RequisicaoGrupo = { codigo: number; nome: string; valor: number };
type RequisicaoSetor = { codigo: number; nome: string; grupos: RequisicaoGrupo[]; total: number | null };

const REQ_DESTINO_LS_KEY = 'requisicoes:destino_map';
const REQ_CMV_SUBTIPO_LS_KEY = 'requisicoes:cmv_subtipo_map';

const loadReqDestinoMap = (): Record<number, ReqDestino> => {
  try {
    const raw = localStorage.getItem(REQ_DESTINO_LS_KEY);
    if (raw) return { ...REQ_DEFAULT_DESTINO_MAP, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...REQ_DEFAULT_DESTINO_MAP };
};

const loadReqCmvSubtipoMap = (): Record<number, ReqCmvSubtipo> => {
  try {
    const raw = localStorage.getItem(REQ_CMV_SUBTIPO_LS_KEY);
    if (raw) return { ...REQ_DEFAULT_CMV_SUBTIPO_MAP, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...REQ_DEFAULT_CMV_SUBTIPO_MAP };
};

const saveReqDestinoMap = (map: Record<number, ReqDestino>) => {
  try { localStorage.setItem(REQ_DESTINO_LS_KEY, JSON.stringify(map)); } catch { /* ignore */ }
};

const saveReqCmvSubtipoMap = (map: Record<number, ReqCmvSubtipo>) => {
  try { localStorage.setItem(REQ_CMV_SUBTIPO_LS_KEY, JSON.stringify(map)); } catch { /* ignore */ }
};

type Provisao13Totals = {
  salario_13: number;
  media_vantagens: number;
  adiantamento_13: number;
  valor_devido: number;
  valor_mes: number;
  inss: number;
  fgts: number;
  pis: number;
};

type Provisao13Row = {
  codigo: string;
  nome: string;
  data_admissao: string;
  avos: string;
  salario_13: number;
  media_vantagens: number;
  adiantamento_13: number;
  valor_devido: number;
  valor_mes: number;
  inss: number;
  fgts: number;
  pis: number;
};

export const ImportacaoPage: React.FC = () => {
  const { query } = useSearch();
  const [historyRows, setHistoryRows] = useState<ImportHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [historyFilter, setHistoryFilter] = useState('');
  const [undoTarget, setUndoTarget] = useState<ImportHistoryRow | null>(null);
  const [undoConfirmText, setUndoConfirmText] = useState('');
  const [undoLoading, setUndoLoading] = useState(false);
  const [undoError, setUndoError] = useState('');
  const [month, setMonth] = useState(String(new Date().getMonth() + 1));
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [loadingImport, setLoadingImport] = useState(false);
  const [importFileName, setImportFileName] = useState('');
  const [importSource, setImportSource] = useState<'pdf' | 'excel' | null>(null);
  const [parsedLines, setParsedLines] = useState<ParsedLine[]>([]);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [excelColumns, setExcelColumns] = useState<ExcelColumn[]>([]);
  const [descriptionColumnIndex, setDescriptionColumnIndex] = useState<string>('');
  const [valueColumnIndex, setValueColumnIndex] = useState<string>('');
  const [summaryTotal, setSummaryTotal] = useState(0);
  const [summaryCount, setSummaryCount] = useState(0);
  const [error, setError] = useState('');

  // Estado da pré-visualização do Consumo Interno.
  const [consumoLoading, setConsumoLoading] = useState(false);
  const [consumoFileName, setConsumoFileName] = useState('');
  const [consumoError, setConsumoError] = useState('');
  const [consumoLines, setConsumoLines] = useState<ConsumoLine[]>([]);
  const [consumoSummary, setConsumoSummary] = useState<ConsumoSummary | null>(null);
  const [consumoFile, setConsumoFile] = useState<File | null>(null);
  const [consumoPeriod, setConsumoPeriod] = useState<Periodo>(null);
  const [consumoDestino, setConsumoDestino] = useState<{ setor: string; conta: string } | null>(null);
  const [consumoCommitting, setConsumoCommitting] = useState(false);
  const [consumoCommitMsg, setConsumoCommitMsg] = useState('');
  const [consumoImportScope, setConsumoImportScope] = useState<ImportScope>('acompanhamento');
  const [consumoWeekIndex, setConsumoWeekIndex] = useState(String(suggestWeekIndexInMonth()));
  const [consumoImportMonth, setConsumoImportMonth] = useState(String(new Date().getMonth() + 1));
  const [consumoImportYear, setConsumoImportYear] = useState(String(new Date().getFullYear()));

  const commitConsumoInterno = async () => {
    if (consumoCommitting || !consumoFile) return;
    const month = Number(consumoImportMonth) || consumoPeriod?.month;
    const year = Number(consumoImportYear) || consumoPeriod?.year;
    if (!month || !year) {
      alert('Informe a competência (mês e ano) do relatório.');
      return;
    }
    if (consumoImportScope === 'acompanhamento') {
      const week = Number(consumoWeekIndex);
      if (!Number.isFinite(week) || week < 1 || week > 5) {
        alert('Informe a semana (1 a 5) para importação de acompanhamento.');
        return;
      }
    }
    setConsumoCommitting(true);
    setConsumoCommitMsg('');
    const formData = new FormData();
    formData.append('consumo_file', consumoFile);
    formData.append('month', String(month));
    formData.append('year', String(year));
    formData.append('import_scope', consumoImportScope);
    if (consumoImportScope === 'acompanhamento') {
      formData.append('week_index', consumoWeekIndex);
    }
    try {
      const res = await fetch('/api/import/consumo-interno/commit', { method: 'POST', body: formData });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(formatApiError(data, 'Falha ao enviar o Consumo Interno.'));
        return;
      }
      const scopeLabel = IMPORT_SCOPE_LABELS[consumoImportScope];
      setConsumoCommitMsg(
        `${scopeLabel}: ${formatCurrency(data.total)} → ` +
          (consumoImportScope === 'acompanhamento'
            ? 'Prev x Real Diário'
            : 'Prev x Real Mensal') +
          ` › ${data.destino.setor} › ${data.destino.conta}` +
          (consumoImportScope === 'fechamento' ? ' · Apuração › Consumo interno' : '')
      );
      loadImportHistory();
    } finally {
      setConsumoCommitting(false);
    }
  };

  // Estado da pré-visualização do Extrato Mensal.
  const [extratoLoading, setExtratoLoading] = useState(false);
  const [extratoFileName, setExtratoFileName] = useState('');
  const [extratoError, setExtratoError] = useState('');
  const [extratoEmployees, setExtratoEmployees] = useState<ExtratoEmployee[]>([]);
  const [extratoSummary, setExtratoSummary] = useState<ExtratoSummary | null>(null);
  const [extratoFile, setExtratoFile] = useState<File | null>(null);
  const [extratoPeriod, setExtratoPeriod] = useState<Periodo>(null);
  const [extratoMonth, setExtratoMonth] = useState<string>(''); // mês selecionado (obrigatório)
  const [extratoYear, setExtratoYear] = useState<string>(String(new Date().getFullYear()));
  const [extratoCommitting, setExtratoCommitting] = useState(false);
  const [extratoCommitMsg, setExtratoCommitMsg] = useState('');
  const [cadastroCargos, setCadastroCargos] = useState<CadastroCargo[]>([]);

  useEffect(() => {
    fetch('/api/cargos?active=1')
      .then((res) => res.json())
      .then((data) => setCadastroCargos(Array.isArray(data) ? data : []))
      .catch(() => setCadastroCargos([]));
  }, []);

  const commitExtratoToFolha = async () => {
    if (extratoCommitting || !extratoFile) return;
    const mes = Number(extratoMonth);
    const ano = Number(extratoYear);
    if (!mes || mes < 1 || mes > 12 || !ano) {
      alert('Selecione o mês (e ano) para enviar à Apuração da Folha.');
      return;
    }
    setExtratoCommitting(true);
    setExtratoCommitMsg('');
    const formData = new FormData();
    formData.append('extrato_file', extratoFile);
    formData.append('month', String(mes));
    formData.append('year', String(ano));
    const cargoMap = extratoEmployees
      .filter((e) => e.cargo_id)
      .map((e) => ({
        matricula: String(e.matricula ?? '').trim() || 'SEM-MATRICULA',
        cargo_id: Number(e.cargo_id),
      }));
    if (cargoMap.length) {
      formData.append('cargo_map', JSON.stringify(cargoMap));
    }
    try {
      const res = await fetch('/api/folha/import', { method: 'POST', body: formData });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(formatApiError(data, 'Falha ao enviar para a Apuração da Folha.'));
        return;
      }
      setExtratoCommitMsg(
        `Enviado: ${data.funcionarios} funcionário(s), ${data.rubricas ?? 0} rubrica(s)` +
          (data.rubricas_cadastradas ? `, ${data.rubricas_cadastradas} nova(s) no cadastro de apuração` : '') +
          ` → Apuração da Folha › ${periodoLabel({ month: mes, year: ano })}.` +
          ` Vá em Apuração da Folha › Apuração, selecione o mês e clique em Processar mês.` +
          (data.realizado
            ? ` Líquido ${formatCurrency(data.realizado.valor)} lançado no Real de RH › Folha de pagamento.`
            : '')
      );
      loadImportHistory();
    } finally {
      setExtratoCommitting(false);
    }
  };

  // Estado da pré-visualização do Rel. CRD.
  const [relCrdLoading, setRelCrdLoading] = useState(false);
  const [relCrdFileName, setRelCrdFileName] = useState('');
  const [relCrdError, setRelCrdError] = useState('');
  const [relCrdAccounts, setRelCrdAccounts] = useState<RelCrdAccount[]>([]);
  const [relCrdSummary, setRelCrdSummary] = useState<RelCrdSummary | null>(null);
  /** Destino por código: D = Prev x Real Diario, M = Prev x Real Mensal (persiste a última seleção). */
  const [relCrdDestinos, setRelCrdDestinos] = useState<Record<string, RelCrdDestinoFlags>>({});
  const now = new Date();
  const [relCrdImportMonth, setRelCrdImportMonth] = useState(String(now.getMonth() + 1));
  const [relCrdImportYear, setRelCrdImportYear] = useState(String(now.getFullYear()));
  const [relCrdImportScope, setRelCrdImportScope] = useState<ImportScope>('fechamento');
  const [relCrdWeekIndex, setRelCrdWeekIndex] = useState(String(suggestWeekIndexInMonth()));
  const [relCrdCommitting, setRelCrdCommitting] = useState(false);
  const [relCrdCommitResult, setRelCrdCommitResult] = useState<{ imported: number; not_found: string[] } | null>(null);

  // Estado da pré-visualização da Provisão de Férias (somente exibição — destino ainda não definido).
  const [provisaoFeriasLoading, setProvisaoFeriasLoading] = useState(false);
  const [provisaoFeriasFileName, setProvisaoFeriasFileName] = useState('');
  const [provisaoFeriasError, setProvisaoFeriasError] = useState('');
  const [provisaoFeriasTotals, setProvisaoFeriasTotals] = useState<ProvisaoFeriasTotals | null>(null);
  const [provisaoFeriasPeriod, setProvisaoFeriasPeriod] = useState<{ month?: number; year?: number } | null>(null);
  const [provisaoFeriasRows, setProvisaoFeriasRows] = useState<ProvisaoFeriasRow[]>([]);
  const [provisaoFeriasCommitting, setProvisaoFeriasCommitting] = useState(false);
  const [provisaoFeriasCommitMsg, setProvisaoFeriasCommitMsg] = useState('');

  const commitProvisaoFerias = async () => {
    if (!provisaoFeriasRows.length) return;
    const year = provisaoFeriasPeriod?.year ?? new Date().getFullYear();
    const month = provisaoFeriasPeriod?.month;
    if (!month) {
      alert('Não foi possível detectar o mês no PDF. Informe a competência manualmente na tela de Absenteísmo.');
      return;
    }
    setProvisaoFeriasCommitting(true);
    setProvisaoFeriasCommitMsg('');
    try {
      const res = await fetch('/api/import/provisao-ferias/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, month, rows: provisaoFeriasRows }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Falha ao gravar provisão de férias.');
      setProvisaoFeriasCommitMsg(
        `${data.rows ?? provisaoFeriasRows.length} funcionário(s) gravado(s) — faltas no Absenteísmo e FGTS férias no painel RH.`
      );
    } catch (err: any) {
      alert(err?.message || 'Erro ao gravar.');
    } finally {
      setProvisaoFeriasCommitting(false);
    }
  };

  const uploadProvisaoFerias = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setProvisaoFeriasLoading(true);
    setProvisaoFeriasError('');
    setProvisaoFeriasFileName(file.name);
    try {
      const formData = new FormData();
      formData.append('provisao_ferias_pdf', file);
      const res = await fetch('/api/import/provisao-ferias/preview', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setProvisaoFeriasError(formatApiError(data, 'Falha ao processar a Provisão de Férias.'));
        setProvisaoFeriasTotals(null);
        setProvisaoFeriasPeriod(null);
        setProvisaoFeriasRows([]);
        return;
      }
      setProvisaoFeriasTotals(data.totals || null);
      setProvisaoFeriasRows(Array.isArray(data.rows) ? data.rows : []);
      setProvisaoFeriasPeriod(data.period || null);
    } catch (err: any) {
      setProvisaoFeriasError(err?.message || 'Erro inesperado ao importar o arquivo.');
    } finally {
      setProvisaoFeriasLoading(false);
      event.target.value = '';
    }
  };

  // Estado da pré-visualização da Provisão de 13º (somente exibição — destino ainda não definido).
  const [provisao13Loading, setProvisao13Loading] = useState(false);
  const [provisao13FileName, setProvisao13FileName] = useState('');
  const [provisao13Error, setProvisao13Error] = useState('');
  const [provisao13Totals, setProvisao13Totals] = useState<Provisao13Totals | null>(null);
  const [provisao13Period, setProvisao13Period] = useState<{ month?: number; year?: number } | null>(null);
  const [provisao13Rows, setProvisao13Rows] = useState<Provisao13Row[]>([]);
  const [provisao13Committing, setProvisao13Committing] = useState(false);
  const [provisao13CommitMsg, setProvisao13CommitMsg] = useState('');

  const commitProvisao13 = async () => {
    if (!provisao13Rows.length) return;
    const year = provisao13Period?.year ?? new Date().getFullYear();
    const month = provisao13Period?.month;
    if (!month) {
      alert('Não foi possível detectar o mês no PDF. Verifique o arquivo importado.');
      return;
    }
    setProvisao13Committing(true);
    setProvisao13CommitMsg('');
    try {
      const res = await fetch('/api/import/provisao-13/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, month, rows: provisao13Rows }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Falha ao gravar provisão de 13º.');
      setProvisao13CommitMsg(
        `${data.rows ?? provisao13Rows.length} funcionário(s) gravado(s) — FGTS 13º: ${formatCurrency(data.fgts_13 ?? 0)} no painel RH.`
      );
    } catch (err: any) {
      alert(err?.message || 'Erro ao gravar.');
    } finally {
      setProvisao13Committing(false);
    }
  };

  const uploadProvisao13 = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setProvisao13Loading(true);
    setProvisao13Error('');
    setProvisao13FileName(file.name);
    try {
      const formData = new FormData();
      formData.append('provisao_13_pdf', file);
      const res = await fetch('/api/import/provisao-13/preview', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setProvisao13Error(formatApiError(data, 'Falha ao processar a Provisão de 13º.'));
        setProvisao13Totals(null);
        setProvisao13Period(null);
        setProvisao13Rows([]);
        return;
      }
      setProvisao13Totals(data.totals || null);
      setProvisao13Period(data.period || null);
      setProvisao13Rows(Array.isArray(data.rows) ? data.rows : []);
    } catch (err: any) {
      setProvisao13Error(err?.message || 'Erro inesperado ao importar o arquivo.');
    } finally {
      setProvisao13Loading(false);
      event.target.value = '';
    }
  };

  // Estado da pré-visualização do RDS.
  const [rdsLoading, setRdsLoading] = useState(false);
  const [rdsFileName, setRdsFileName] = useState('');
  const [rdsError, setRdsError] = useState('');
  const [rdsDate, setRdsDate] = useState('');
  const [rdsSections, setRdsSections] = useState<RdsSection[]>([]);
  const [rdsPrevisaoSemana, setRdsPrevisaoSemana] = useState<RdsWeekRow[]>([]);
  const [rdsFile, setRdsFile] = useState<File | null>(null);
  const [rdsMonth, setRdsMonth] = useState('');
  const [rdsYear, setRdsYear] = useState(String(new Date().getFullYear()));
  const [rdsCommitting, setRdsCommitting] = useState(false);
  const [rdsCommitMsg, setRdsCommitMsg] = useState('');

  const uploadRds = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setRdsLoading(true);
    setRdsError('');
    setRdsFileName(file.name);
    setRdsFile(file);
    setRdsCommitMsg('');
    try {
      const formData = new FormData();
      formData.append('rds_file', file);
      const res = await fetch('/api/import/rds/preview', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setRdsError(formatApiError(data, 'Falha ao processar o RDS.'));
        setRdsDate('');
        setRdsSections([]);
        setRdsPrevisaoSemana([]);
        return;
      }
      setRdsDate(data.date || '');
      setRdsSections(Array.isArray(data.sections) ? data.sections : []);
      setRdsPrevisaoSemana(Array.isArray(data.previsao_semana) ? data.previsao_semana : []);
      if (data.period?.month) setRdsMonth(String(data.period.month));
      if (data.period?.year) setRdsYear(String(data.period.year));
    } catch (err: any) {
      setRdsError(err?.message || 'Erro inesperado ao importar o arquivo.');
    } finally {
      setRdsLoading(false);
      event.target.value = '';
    }
  };

  const commitRds = async () => {
    if (rdsCommitting || !rdsFile) return;
    const mes = Number(rdsMonth);
    const ano = Number(rdsYear);
    if (!mes || mes < 1 || mes > 12 || !ano) {
      alert('Selecione o mês e o ano para enviar à Apuração de Receita.');
      return;
    }
    setRdsCommitting(true);
    setRdsCommitMsg('');
    const formData = new FormData();
    formData.append('rds_file', rdsFile);
    formData.append('month', String(mes));
    formData.append('year', String(ano));
    try {
      const res = await fetch('/api/import/rds/commit', { method: 'POST', body: formData });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(formatApiError(data, 'Falha ao enviar o RDS.'));
        return;
      }
      setRdsCommitMsg(
        `Enviado: ${data.items_count ?? 0} item(ns) em ${data.sections_count ?? 0} seção(ões)` +
          ` → Apuração de Receita › Relatório Diário de Situação › ${periodoLabel({ month: mes, year: ano })}.` +
          ` As planilhas Relatório de RDS e Apoio RDS permanecem disponíveis.`
      );
      loadImportHistory();
    } finally {
      setRdsCommitting(false);
    }
  };

  // Estado da pré-visualização das Requisições Sintética.
  const [requisicoesLoading, setRequisicoesLoading] = useState(false);
  const [requisicoesFileName, setRequisicoesFileName] = useState('');
  const [requisicoesError, setRequisicoesError] = useState('');
  const [requisicoesPeriodo, setRequisicoesPeriodo] = useState<{ de: string | null; ate: string | null } | null>(null);
  const [requisicoesSetores, setRequisicoesSetores] = useState<RequisicaoSetor[]>([]);
  const [requisicoesTotalGeral, setRequisicoesTotalGeral] = useState<number | null>(null);
  const [requisicoesDestinos, setRequisicoesDestinos] = useState<Record<number, ReqDestino>>(() => loadReqDestinoMap());
  const [requisicoesCmvSubtipos, setRequisicoesCmvSubtipos] = useState<Record<number, ReqCmvSubtipo>>(() => loadReqCmvSubtipoMap());
  const [reqImportMonth, setReqImportMonth] = useState(String(new Date().getMonth() + 1));
  const [reqImportYear, setReqImportYear] = useState(String(new Date().getFullYear()));
  const [reqImportScope, setReqImportScope] = useState<ImportScope>('acompanhamento');
  const [reqWeekIndex, setReqWeekIndex] = useState(String(suggestWeekIndexInMonth()));
  const [reqCommitting, setReqCommitting] = useState(false);
  const [reqCommitResult, setReqCommitResult] = useState<{ imported: number } | null>(null);

  const uploadRequisicoesSintetica = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setRequisicoesLoading(true);
    setRequisicoesError('');
    setRequisicoesFileName(file.name);
    try {
      const formData = new FormData();
      formData.append('requisicoes_file', file);
      const res = await fetch('/api/import/requisicoes-sintetica/preview', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setRequisicoesError(formatApiError(data, 'Falha ao processar as Requisições Sintética.'));
        setRequisicoesPeriodo(null);
        setRequisicoesSetores([]);
        setRequisicoesTotalGeral(null);
        return;
      }
      setRequisicoesPeriodo(data.periodo || null);
      setRequisicoesSetores(Array.isArray(data.setores) ? data.setores : []);
      setRequisicoesTotalGeral(typeof data.total_geral === 'number' ? data.total_geral : null);
      // Recarrega o mapa salvo para refletir edições anteriores
      setRequisicoesDestinos(loadReqDestinoMap());
      setReqCommitResult(null);
      // Sugere a competência a partir do período do relatório.
      const de = String(data.periodo?.de ?? '');
      const m = de.match(/^(\d{4})-(\d{2})/);
      if (m) {
        setReqImportYear(m[1]);
        setReqImportMonth(String(Number(m[2])));
      }
    } catch (err: any) {
      setRequisicoesError(err?.message || 'Erro inesperado ao importar o arquivo.');
    } finally {
      setRequisicoesLoading(false);
      event.target.value = '';
    }
  };

  const setReqDestino = (codigo: number, destino: ReqDestino) => {
    setRequisicoesDestinos((prev) => {
      const next = { ...prev, [codigo]: destino };
      saveReqDestinoMap(next);
      return next;
    });
    if (!isReqDestinoCmv(destino)) {
      setRequisicoesCmvSubtipos((prev) => {
        if (!(codigo in prev)) return prev;
        const next = { ...prev };
        delete next[codigo];
        saveReqCmvSubtipoMap(next);
        return next;
      });
    } else {
      setRequisicoesCmvSubtipos((prev) => {
        if (prev[codigo]) return prev;
        const sub = resolveReqCmvSubtipo(codigo, destino) ?? 'alimentos';
        const next = { ...prev, [codigo]: sub };
        saveReqCmvSubtipoMap(next);
        return next;
      });
    }
  };

  const setReqCmvSubtipo = (codigo: number, subtipo: ReqCmvSubtipo) => {
    setRequisicoesCmvSubtipos((prev) => {
      const next = { ...prev, [codigo]: subtipo };
      saveReqCmvSubtipoMap(next);
      return next;
    });
  };

  // Envia as requisições do preview para a competência escolhida (Apuração de Resultados › Requisição Sintética).
  const commitRequisicoes = async () => {
    if (reqCommitting || !requisicoesSetores.length) return;
    if (reqImportScope === 'acompanhamento') {
      const week = Number(reqWeekIndex);
      if (!Number.isFinite(week) || week < 1 || week > 5) {
        alert('Informe a semana (1 a 5) para importação de acompanhamento.');
        return;
      }
    }
    setReqCommitting(true);
    setReqCommitResult(null);
    try {
      const res = await fetch('/api/import/requisicoes-sintetica/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month: Number(reqImportMonth),
          year: Number(reqImportYear),
          import_scope: reqImportScope,
          week_index: reqImportScope === 'acompanhamento' ? Number(reqWeekIndex) : undefined,
          file_name: requisicoesFileName || undefined,
          setores: requisicoesSetores.map((st) => ({
            codigo: st.codigo,
            nome: st.nome,
            grupos: st.grupos.map((g) => ({
              codigo: g.codigo,
              nome: g.nome,
              valor: g.valor,
              destino: requisicoesDestinos[g.codigo] ?? '',
              cmv_subtipo: requisicoesCmvSubtipos[g.codigo] ?? '',
            })),
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data?.error || 'Falha ao importar as Requisições Sintética.');
        return;
      }
      setReqCommitResult({ imported: data.imported ?? 0 });
      const mesLabel = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'][Number(reqImportMonth)] || reqImportMonth;
      const scopeLabel = IMPORT_SCOPE_LABELS[reqImportScope];
      alert(
        `${data.imported ?? 0} grupo(s) importado(s) — ${scopeLabel} · ${mesLabel}/${reqImportYear}.` +
          (reqImportScope === 'acompanhamento' ? `\n→ Semana ${reqWeekIndex}` : '') +
          (reqImportScope === 'fechamento'
            ? `\n→ Apuração de Resultados › Requisição Sintética › ${mesLabel}.`
            : '\n→ Acompanhamento semanal (não altera o fechamento do mês).')
      );
    } catch (err: any) {
      alert(err?.message || 'Erro inesperado ao importar.');
    } finally {
      setReqCommitting(false);
    }
  };

  const loadImportHistory = async () => {
    setHistoryLoading(true);
    setHistoryError('');
    try {
      const params = new URLSearchParams();
      params.set('limit', '100');
      if (historyFilter) params.set('source_type', historyFilter);
      const res = await fetch(`/api/import/history?${params.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setHistoryRows([]);
        setHistoryError(formatApiError(data, 'Não foi possível carregar o histórico.'));
        return;
      }
      setHistoryRows(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setHistoryRows([]);
      setHistoryError(err?.message || 'Erro ao carregar histórico.');
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    loadImportHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyFilter]);

  const filteredHistoryRows = useMemo(
    () =>
      historyRows.filter((row) =>
        matchesSearch(
          query,
          IMPORT_HISTORY_LABELS[row.source_type] || row.source_type,
          row.file_name,
          row.user_name,
          row.user_email,
          row.error_message,
          row.status
        )
      ),
    [historyRows, query]
  );

  const periodoHistorico = (row: ImportHistoryRow) =>
    formatPeriodLabel(row.year, row.month, row.import_scope, row.week_index, row.period_key);

  const relCrdScopeDefault = useMemo(
    () => defaultRelCrdDestinosForScope(relCrdImportScope),
    [relCrdImportScope]
  );

  useEffect(() => {
    if (!relCrdAccounts.length) return;
    setRelCrdDestinos(buildRelCrdDestinosForAccounts(relCrdAccounts, relCrdImportScope));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relCrdImportScope]);

  const canUndoImport = (row: ImportHistoryRow) => {
    if (row.status === 'error') return true;
    if (row.source_type === 'crds') return false;
    const monthOk = Boolean(row.month && row.month >= 1 && row.month <= 12);
    const yearOk = Boolean(row.year && row.year >= 2000);
    if (['consumo_interno', 'extrato_mensal', 'rel_crd', 'rds', 'requisicoes_sintetica'].includes(row.source_type)) {
      return yearOk && monthOk;
    }
    if (row.source_type === 'orcamento' || row.source_type === 'ajustes') return yearOk;
    return false;
  };

  const openUndoModal = (row: ImportHistoryRow) => {
    setUndoTarget(row);
    setUndoConfirmText('');
    setUndoError('');
  };

  const closeUndoModal = () => {
    if (undoLoading) return;
    setUndoTarget(null);
    setUndoConfirmText('');
    setUndoError('');
  };

  const confirmUndoImport = async () => {
    if (!undoTarget || undoLoading) return;
    if (undoConfirmText.trim() !== 'DESFAZER') {
      setUndoError('Digite DESFAZER (em maiúsculas) para confirmar.');
      return;
    }
    setUndoLoading(true);
    setUndoError('');
    try {
      const res = await fetch(`/api/import/history/${undoTarget.id}/undo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'DESFAZER' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setUndoError(formatApiError(data, 'Não foi possível desfazer a importação.'));
        return;
      }
      setUndoTarget(null);
      setUndoConfirmText('');
      await loadImportHistory();
    } catch (err: any) {
      setUndoError(err?.message || 'Erro ao desfazer a importação.');
    } finally {
      setUndoLoading(false);
    }
  };

  const filteredImportSources = useMemo(
    () => IMPORT_SOURCES.filter((source) => matchesSearch(query, source.title, source.description, source.key)),
    [query]
  );
  const filteredParsedLines = useMemo(
    () => parsedLines.filter((line) => matchesSearch(query, line.descricao, line.valor)),
    [parsedLines, query]
  );
  const filteredConsumoLines = useMemo(
    () =>
      consumoLines.filter((line) =>
        matchesSearch(
          query,
          line.cliente_nome,
          line.produto,
          line.unidade,
          line.nf,
          line.data,
          line.forma_pgto,
          line.vl_liquido
        )
      ),
    [consumoLines, query]
  );
  const filteredExtratoEmployees = useMemo(
    () =>
      extratoEmployees.filter((emp) =>
        matchesSearch(query, emp.matricula, emp.nome, emp.cargo, emp.situacao, emp.cpf, emp.liquido)
      ),
    [extratoEmployees, query]
  );

  const updateExtratoCargo = (matricula: string | number | null, cargoId: string) => {
    const key = String(matricula ?? '').trim();
    setExtratoEmployees((prev) =>
      prev.map((emp) =>
        String(emp.matricula ?? '').trim() === key ? { ...emp, cargo_id: cargoId } : emp
      )
    );
  };

  const filteredRelCrdAccounts = useMemo(
    () =>
      relCrdAccounts.filter((acc) =>
        matchesSearch(query, acc.codigo, acc.nome, acc.lancamentos, acc.lanc_liquido)
      ),
    [relCrdAccounts, query]
  );
  const filteredProvisao13Rows = useMemo(
    () =>
      provisao13Rows.filter((r) => matchesSearch(query, r.codigo, r.nome, r.valor_devido, r.salario_13)),
    [provisao13Rows, query]
  );
  const filteredProvisaoFeriasRows = useMemo(
    () =>
      provisaoFeriasRows.filter((r) => matchesSearch(query, r.codigo, r.nome, r.valor_devido, r.salario)),
    [provisaoFeriasRows, query]
  );

  const uploadRelCrd = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setRelCrdLoading(true);
    setRelCrdError('');
    setRelCrdFileName(file.name);
    const formData = new FormData();
    formData.append('relcrd_file', file);
    try {
      const res = await fetch('/api/import/rel-crd/preview', { method: 'POST', body: formData });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRelCrdError(formatApiError(data, 'Falha ao processar o Rel. CRD.'));
        setRelCrdAccounts([]);
        setRelCrdSummary(null);
        return;
      }
      const accounts = Array.isArray(data.accounts) ? data.accounts : [];
      setRelCrdAccounts(accounts);
      setRelCrdSummary(data.summary || null);
      setRelCrdDestinos(buildRelCrdDestinosForAccounts(accounts, relCrdImportScope));
      setRelCrdCommitResult(null);
    } catch (err: any) {
      setRelCrdError(err?.message || 'Erro inesperado ao importar o arquivo.');
    } finally {
      setRelCrdLoading(false);
      if (event?.target) event.target.value = '';
    }
  };

  const toggleRelCrdDestino = (codigo: string, key: 'D' | 'M') => {
    setRelCrdDestinos((prev) => {
      const current = prev[codigo] ?? { ...relCrdScopeDefault };
      const next = { ...prev, [codigo]: { ...current, [key]: !current[key] } };
      // Mescla com o mapa salvo para não perder códigos de importações anteriores.
      saveRelCrdDestinoMap({ ...loadRelCrdDestinoMap(), ...next });
      return next;
    });
  };

  /** Marca/desmarca D ou M em todas as contas visíveis (ou liga ambos). */
  const setRelCrdDestinoAll = (patch: Partial<RelCrdDestinoFlags>) => {
    const targets = filteredRelCrdAccounts.length ? filteredRelCrdAccounts : relCrdAccounts;
    if (!targets.length) return;
    setRelCrdDestinos((prev) => {
      const next = { ...prev };
      for (const acc of targets) {
        const codigo = String(acc.codigo);
        const current = next[codigo] ?? { ...relCrdScopeDefault };
        next[codigo] = {
          D: patch.D !== undefined ? Boolean(patch.D) : current.D,
          M: patch.M !== undefined ? Boolean(patch.M) : current.M,
        };
      }
      saveRelCrdDestinoMap({ ...loadRelCrdDestinoMap(), ...next });
      return next;
    });
  };

  const relCrdAllD = useMemo(() => {
    const list = filteredRelCrdAccounts;
    return list.length > 0 && list.every((a) => (relCrdDestinos[a.codigo] ?? relCrdScopeDefault).D);
  }, [filteredRelCrdAccounts, relCrdDestinos, relCrdScopeDefault]);

  const relCrdAllM = useMemo(() => {
    const list = filteredRelCrdAccounts;
    return list.length > 0 && list.every((a) => (relCrdDestinos[a.codigo] ?? relCrdScopeDefault).M);
  }, [filteredRelCrdAccounts, relCrdDestinos, relCrdScopeDefault]);

  const commitRelCrd = async () => {
    if (relCrdImportScope === 'acompanhamento') {
      const week = Number(relCrdWeekIndex);
      if (!Number.isFinite(week) || week < 1 || week > 5) {
        alert('Informe a semana (1 a 5) para importação de acompanhamento.');
        return;
      }
    }
    const targetRows = relCrdAccounts
      .map((a) => {
        const dest = relCrdDestinos[a.codigo] ?? { D: false, M: false };
        const destinos: Array<'D' | 'M'> = [];
        if (dest.D) destinos.push('D');
        if (dest.M) destinos.push('M');
        return { ...a, destinos };
      })
      .filter((a) => a.destinos.length > 0);
    if (!targetRows.length) {
      alert(
        relCrdImportScope === 'acompanhamento'
          ? 'Selecione ao menos D (Diário) em alguma linha para importar o acompanhamento.'
          : 'Selecione ao menos M (Mensal) em alguma linha para importar o fechamento.'
      );
      return;
    }
    // Garante que a seleção atual vira o padrão da próxima importação.
    saveRelCrdDestinoMap({ ...loadRelCrdDestinoMap(), ...relCrdDestinos });
    setRelCrdCommitting(true);
    setRelCrdCommitResult(null);
    try {
      const res = await fetch('/api/import/rel-crd/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: targetRows.map((a) => ({
            codigo: a.codigo,
            nome: a.nome,
            nivel: a.nivel,
            saldo_lanc: a.saldo_lanc,
            lancamentos: a.lancamentos,
            cancelamentos: a.cancelamentos,
            baixas: a.baixas,
            estorno: a.estorno,
            baixas_liquido: a.baixas_liquido,
            lanc_liquido: a.lanc_liquido,
            destinos: a.destinos,
          })),
          month: Number(relCrdImportMonth),
          year: Number(relCrdImportYear),
          import_scope: relCrdImportScope,
          week_index: relCrdImportScope === 'acompanhamento' ? Number(relCrdWeekIndex) : undefined,
          file_name: relCrdFileName || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data?.error || 'Falha ao importar os dados do Rel. CRD.');
        return;
      }
      setRelCrdCommitResult({ imported: data.imported, not_found: data.not_found ?? [] });
      const mesLabel = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'][Number(relCrdImportMonth)] || relCrdImportMonth;
      const scopeLabel = IMPORT_SCOPE_LABELS[relCrdImportScope];
      alert(
        `${data.imported} conta(s) importada(s) — ${scopeLabel} · ${mesLabel}/${relCrdImportYear}.` +
          (relCrdImportScope === 'acompanhamento' ? `\n→ Semana ${relCrdWeekIndex}` : '') +
          `\n→ Prev x Real Diário: ${data.to_diario ?? 0} · Prev x Real Mensal: ${data.to_mensal ?? 0}` +
          (relCrdImportScope === 'fechamento' ? `\n→ Relatório de CRD › ${mesLabel}.` : '')
      );
    } catch (err: any) {
      alert(err?.message || 'Erro inesperado ao importar.');
    } finally {
      setRelCrdCommitting(false);
    }
  };

  const uploadExtratoMensal = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setExtratoLoading(true);
    setExtratoError('');
    setExtratoFileName(file.name);
    setExtratoFile(file);
    setExtratoCommitMsg('');
    const formData = new FormData();
    formData.append('extrato_file', file);
    try {
      const res = await fetch('/api/import/extrato-mensal/preview', { method: 'POST', body: formData });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setExtratoError(formatApiError(data, 'Falha ao processar o Extrato Mensal.'));
        setExtratoEmployees([]);
        setExtratoSummary(null);
        setExtratoPeriod(null);
        return;
      }
      const employees = (Array.isArray(data.employees) ? data.employees : []).map((emp: ExtratoEmployee) => {
        const cargoFromFile = String(emp.cargo ?? '').trim().toLowerCase();
        const matched = cargoFromFile
          ? cadastroCargos.find((c) => c.name.trim().toLowerCase() === cargoFromFile)
          : undefined;
        return {
          ...emp,
          cargo_id: matched ? String(matched.id) : '',
        };
      });
      setExtratoEmployees(employees);
      setExtratoSummary(data.summary || null);
      const period = data.period || null;
      setExtratoPeriod(period);
      // Pré-preenche o mês/ano com o detectado (o usuário pode ajustar; é obrigatório ter um).
      setExtratoMonth(period?.month ? String(period.month) : '');
      if (period?.year) setExtratoYear(String(period.year));
    } catch (err: any) {
      setExtratoError(err?.message || 'Erro inesperado ao importar o arquivo.');
    } finally {
      setExtratoLoading(false);
      if (event?.target) event.target.value = '';
    }
  };

  const uploadConsumoInterno = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setConsumoLoading(true);
    setConsumoError('');
    setConsumoFileName(file.name);
    setConsumoFile(file);
    setConsumoCommitMsg('');
    const formData = new FormData();
    formData.append('consumo_file', file);
    try {
      const res = await fetch('/api/import/consumo-interno/preview', { method: 'POST', body: formData });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setConsumoError(formatApiError(data, 'Falha ao processar o relatório de Consumo Interno.'));
        setConsumoLines([]);
        setConsumoSummary(null);
        setConsumoPeriod(null);
        setConsumoDestino(null);
        return;
      }
      setConsumoLines(Array.isArray(data.lines) ? data.lines : []);
      setConsumoSummary(data.summary || null);
      setConsumoPeriod(data.period || null);
      if (data.period?.month) setConsumoImportMonth(String(data.period.month));
      if (data.period?.year) setConsumoImportYear(String(data.period.year));
      setConsumoDestino(data.destino || null);
    } catch (err: any) {
      setConsumoError(err?.message || 'Erro inesperado ao importar o arquivo.');
    } finally {
      setConsumoLoading(false);
      if (event?.target) event.target.value = '';
    }
  };

  const importDesbravadorFile = async (
    event: React.ChangeEvent<HTMLInputElement>,
    manualMapping?: { description_column_index: string; value_column_index: string }
  ) => {
    const file = event.target.files?.[0] || uploadedFile;
    if (!file) return;

    const isExcel = /\.(xlsx|xls)$/i.test(file.name) || [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ].includes(file.type);
    const endpoint = isExcel ? '/api/import/desbravador/preview-excel' : '/api/import/desbravador/preview';
    const fileFieldName = isExcel ? 'report_excel' : 'report_pdf';

    setLoadingImport(true);
    setError('');
    setImportFileName(file.name);
    setImportSource(isExcel ? 'excel' : 'pdf');
    setUploadedFile(file);

    const formData = new FormData();
    formData.append(fileFieldName, file);
    formData.append('month', month);
    formData.append('year', year);
    if (isExcel && manualMapping) {
      formData.append('description_column_index', manualMapping.description_column_index);
      formData.append('value_column_index', manualMapping.value_column_index);
    }

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(formatApiError(data, 'Falha ao processar relatório do Desbravador.'));
        return;
      }

      setParsedLines(Array.isArray(data.lines) ? data.lines : []);
      setSummaryTotal(Number(data?.summary?.total || 0));
      setSummaryCount(Number(data?.summary?.lines_count || 0));
      const columns = data?.mapping?.columns;
      if (Array.isArray(columns)) {
        setExcelColumns(columns);
      } else {
        setExcelColumns([]);
      }
      const mappedDescriptionIdx = data?.mapping?.description_column_index;
      const mappedValueIdx = data?.mapping?.value_column_index;
      if (mappedDescriptionIdx !== undefined && mappedDescriptionIdx !== null && Number(mappedDescriptionIdx) >= 0) {
        setDescriptionColumnIndex(String(mappedDescriptionIdx));
      } else if (!manualMapping) {
        setDescriptionColumnIndex('');
      }
      if (mappedValueIdx !== undefined && mappedValueIdx !== null && Number(mappedValueIdx) >= 0) {
        setValueColumnIndex(String(mappedValueIdx));
      } else if (!manualMapping) {
        setValueColumnIndex('');
      }
    } catch (err: any) {
      setError(err?.message || 'Erro inesperado ao importar arquivo.');
    } finally {
      setLoadingImport(false);
      if (event?.target) event.target.value = '';
    }
  };

  const applyManualExcelMapping = async () => {
    if (!uploadedFile) {
      setError('Selecione um arquivo Excel primeiro.');
      return;
    }
    if (descriptionColumnIndex === '' || valueColumnIndex === '') {
      setError('Selecione as colunas de descrição e valor para mapear.');
      return;
    }
    await importDesbravadorFile(
      { target: { files: null, value: '' } } as React.ChangeEvent<HTMLInputElement>,
      {
        description_column_index: descriptionColumnIndex,
        value_column_index: valueColumnIndex,
      }
    );
  };

  const isExcelImport = importSource === 'excel';

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Importação</h2>
        <p className="text-sm text-slate-500">
          Previsto vem da Síntase (planilhas importadas manualmente) e realizado vem dos relatórios em PDF do sistema Desbravador.
        </p>
      </div>

      {/* Fontes de importação (cards) — configuração será definida depois */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-slate-800">Relatórios para importar</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredImportSources.map((source) => {
            const Icon = source.icon;
            return (
              <div
                key={source.key}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="w-11 h-11 rounded-xl bg-[#004D40]/5 text-[#004D40] flex items-center justify-center">
                    <Icon className="w-5 h-5" />
                  </div>
                  {source.key === 'consumo_interno' || source.key === 'extrato_mensal' || source.key === 'rel_crd' || source.key === 'provisao_ferias' || source.key === 'provisao_13' || source.key === 'rds' || source.key === 'requisicoes_sintetica' ? (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-2 py-0.5">
                      Extração ativa
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 bg-amber-50 border border-amber-100 rounded-full px-2 py-0.5">
                      A configurar
                    </span>
                  )}
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-bold text-slate-900 leading-snug">{source.title}</h4>
                  <p className="text-xs text-slate-500 mt-1">{source.description}</p>
                </div>
                {source.key === 'consumo_interno' ? (
                  <label className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-[#004D40] bg-white text-sm font-bold text-[#004D40] cursor-pointer hover:bg-emerald-50 transition-colors">
                    {consumoLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    {consumoLoading ? 'Processando...' : 'Enviar arquivo (.xls)'}
                    <input
                      type="file"
                      accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                      onChange={uploadConsumoInterno}
                      disabled={consumoLoading}
                      className="hidden"
                    />
                  </label>
                ) : source.key === 'extrato_mensal' ? (
                  <label className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-[#004D40] bg-white text-sm font-bold text-[#004D40] cursor-pointer hover:bg-emerald-50 transition-colors">
                    {extratoLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    {extratoLoading ? 'Processando...' : 'Enviar arquivo (.xls)'}
                    <input
                      type="file"
                      accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                      onChange={uploadExtratoMensal}
                      disabled={extratoLoading}
                      className="hidden"
                    />
                  </label>
                ) : source.key === 'rel_crd' ? (
                  <label className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-[#004D40] bg-white text-sm font-bold text-[#004D40] cursor-pointer hover:bg-emerald-50 transition-colors">
                    {relCrdLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    {relCrdLoading ? 'Processando...' : 'Enviar arquivo (.xls)'}
                    <input
                      type="file"
                      accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                      onChange={uploadRelCrd}
                      disabled={relCrdLoading}
                      className="hidden"
                    />
                  </label>
                ) : source.key === 'provisao_ferias' ? (
                  <label className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-[#004D40] bg-white text-sm font-bold text-[#004D40] cursor-pointer hover:bg-emerald-50 transition-colors">
                    {provisaoFeriasLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    {provisaoFeriasLoading ? 'Processando...' : 'Enviar arquivo (PDF)'}
                    <input
                      type="file"
                      accept=".pdf,application/pdf"
                      onChange={uploadProvisaoFerias}
                      disabled={provisaoFeriasLoading}
                      className="hidden"
                    />
                  </label>
                ) : source.key === 'provisao_13' ? (
                  <label className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-[#004D40] bg-white text-sm font-bold text-[#004D40] cursor-pointer hover:bg-emerald-50 transition-colors">
                    {provisao13Loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    {provisao13Loading ? 'Processando...' : 'Enviar arquivo (PDF)'}
                    <input
                      type="file"
                      accept=".pdf,application/pdf"
                      onChange={uploadProvisao13}
                      disabled={provisao13Loading}
                      className="hidden"
                    />
                  </label>
                ) : source.key === 'rds' ? (
                  <label className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-[#004D40] bg-white text-sm font-bold text-[#004D40] cursor-pointer hover:bg-emerald-50 transition-colors">
                    {rdsLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    {rdsLoading ? 'Processando...' : 'Enviar arquivo (.xls)'}
                    <input
                      type="file"
                      accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                      onChange={uploadRds}
                      disabled={rdsLoading}
                      className="hidden"
                    />
                  </label>
                ) : source.key === 'requisicoes_sintetica' ? (
                  <label className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-[#004D40] bg-white text-sm font-bold text-[#004D40] cursor-pointer hover:bg-emerald-50 transition-colors">
                    {requisicoesLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    {requisicoesLoading ? 'Processando...' : 'Enviar arquivo (.xls)'}
                    <input
                      type="file"
                      accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                      onChange={uploadRequisicoesSintetica}
                      disabled={requisicoesLoading}
                      className="hidden"
                    />
                  </label>
                ) : (
                  <button
                    type="button"
                    disabled
                    title="Configuração da importação será definida em breve"
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm font-bold text-slate-400 cursor-not-allowed"
                  >
                    <Settings2 className="w-4 h-4" />
                    Configurar importação
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Pré-visualização do Consumo Interno (somente leitura por enquanto) */}
      {(consumoFileName || consumoError) && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap gap-3 items-center justify-between">
            <div className="flex items-center gap-2">
              <Boxes className="w-4 h-4 text-[#004D40]" />
              <p className="text-sm font-bold text-slate-800">Consumo Interno — dados extraídos</p>
            </div>
            {consumoSummary && (
              <div className="text-xs text-slate-600 flex flex-wrap gap-x-4 gap-y-1">
                <span>Clientes: <span className="font-bold">{consumoSummary.clientes_count}</span></span>
                <span>Itens: <span className="font-bold">{consumoSummary.lines_count}</span></span>
                <span>Qtd total: <span className="font-bold">{consumoSummary.total_quantidade}</span></span>
                <span>Total líquido: <span className="font-bold">{formatCurrency(consumoSummary.total_liquido)}</span></span>
              </div>
            )}
          </div>

          {consumoFileName && !consumoError && (
            <div className="px-4 py-2 text-xs text-emerald-700 bg-emerald-50/60 border-b border-emerald-100 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Arquivo processado: {consumoFileName}
            </div>
          )}
          {consumoError && (
            <div className="px-4 py-2 text-xs text-red-700 bg-red-50 border-b border-red-100 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              {consumoError}
            </div>
          )}

          {/* Envio do total para a Prev x Real (Controle › CONSUMO INTERNO (SEM CRD) › Real) */}
          {consumoSummary && !consumoError && (
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/60 space-y-3">
              <ImportPeriodPicker
                scope={consumoImportScope}
                onScopeChange={setConsumoImportScope}
                weekIndex={consumoWeekIndex}
                onWeekIndexChange={setConsumoWeekIndex}
                month={consumoImportMonth}
                onMonthChange={setConsumoImportMonth}
                year={consumoImportYear}
                onYearChange={setConsumoImportYear}
                hint={
                  consumoImportScope === 'acompanhamento'
                    ? 'Alimenta Prev × Real Diário (última semana no acompanhamento)'
                    : 'Consolidado de fechamento → Prev × Real Mensal e Apuração'
                }
              />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-slate-600 space-y-0.5">
                  <p>
                    {consumoPeriod ? (
                      <>Período no arquivo: <span className="font-bold text-slate-900">{periodoLabel(consumoPeriod)}</span></>
                    ) : null}
                    <span className={consumoPeriod ? 'mx-2 text-slate-300' : ''}>|</span>
                    Total: <span className="font-bold text-slate-900">{formatCurrency(consumoSummary.total_liquido)}</span>
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Destino: <b>{consumoDestino?.setor ?? 'Controle'}</b> › <b>{consumoDestino?.conta ?? 'CONSUMO INTERNO (SEM CRD)'}</b>
                  </p>
                  {consumoCommitMsg && (
                    <p className="text-[11px] font-semibold text-emerald-700 inline-flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> {consumoCommitMsg}
                    </p>
                  )}
                </div>
                <button
                  onClick={commitConsumoInterno}
                  disabled={consumoCommitting}
                  title="Importa o período selecionado (substitui a mesma semana ou fechamento)"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#004D40] text-white text-sm font-bold hover:bg-[#003d33] disabled:opacity-60 transition-colors"
                >
                  {consumoCommitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRightCircle className="w-4 h-4" />}
                  {consumoCommitting ? 'Importando...' : 'Importar'}
                </button>
              </div>
            </div>
          )}

          {consumoLines.length > 0 && (
            <div className="overflow-auto max-h-[520px]">
              <table className="w-full text-left border-collapse min-w-[1100px]">
                <thead className="sticky top-0">
                  <tr className="bg-slate-50 border-b border-slate-200">
                    {['Cliente', 'Produto', 'Un.', 'NF', 'Data', 'Qtd', 'Vl. unit.', 'Vl. total', 'Desc.', 'Taxa serv.', 'Vl. líquido', 'Forma pgto.'].map((h) => (
                      <th
                        key={h}
                        className={`px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest ${
                          ['Qtd', 'Vl. unit.', 'Vl. total', 'Desc.', 'Taxa serv.', 'Vl. líquido'].includes(h) ? 'text-right' : ''
                        }`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredConsumoLines.map((line, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/70">
                      <td className="px-3 py-2 text-xs text-slate-700 whitespace-nowrap">
                        <span className="text-slate-400">{line.cliente_id}</span> {line.cliente_nome}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-800">
                        <span className="text-slate-400">{line.produto_codigo}</span> {line.produto}
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-600">{line.unidade}</td>
                      <td className="px-3 py-2 text-xs text-slate-600">{line.nf}</td>
                      <td className="px-3 py-2 text-xs text-slate-600 whitespace-nowrap">{line.data}</td>
                      <td className="px-3 py-2 text-xs text-right tabular-nums text-slate-700">{line.quantidade}</td>
                      <td className="px-3 py-2 text-xs text-right tabular-nums text-slate-700">{formatCurrency(line.vl_unitario)}</td>
                      <td className="px-3 py-2 text-xs text-right tabular-nums text-slate-700">{formatCurrency(line.vl_total)}</td>
                      <td className="px-3 py-2 text-xs text-right tabular-nums text-slate-500">{formatCurrency(line.vl_desconto)}</td>
                      <td className="px-3 py-2 text-xs text-right tabular-nums text-slate-500">{formatCurrency(line.taxa_servico)}</td>
                      <td className="px-3 py-2 text-xs text-right tabular-nums font-semibold text-slate-900">{formatCurrency(line.vl_liquido)}</td>
                      <td className="px-3 py-2 text-xs text-slate-600 whitespace-nowrap">{line.forma_pgto}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Pré-visualização do Extrato Mensal (somente leitura por enquanto) */}
      {(extratoFileName || extratoError) && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap gap-3 items-center justify-between">
            <div className="flex items-center gap-2">
              <FileBarChart className="w-4 h-4 text-[#004D40]" />
              <p className="text-sm font-bold text-slate-800">Extrato Mensal — folha por funcionário</p>
            </div>
            {extratoSummary && (
              <div className="text-xs text-slate-600 flex flex-wrap gap-x-4 gap-y-1">
                <span>Funcionários: <span className="font-bold">{extratoSummary.funcionarios}</span></span>
                <span>Proventos: <span className="font-bold">{formatCurrency(extratoSummary.total_proventos)}</span></span>
                <span>Descontos: <span className="font-bold">{formatCurrency(extratoSummary.total_descontos)}</span></span>
                <span>Líquido: <span className="font-bold">{formatCurrency(extratoSummary.total_liquido)}</span></span>
              </div>
            )}
          </div>

          {extratoFileName && !extratoError && (
            <div className="px-4 py-2 text-xs text-emerald-700 bg-emerald-50/60 border-b border-emerald-100 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Arquivo processado: {extratoFileName}
            </div>
          )}
          {extratoError && (
            <div className="px-4 py-2 text-xs text-red-700 bg-red-50 border-b border-red-100 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              {extratoError}
            </div>
          )}

          {/* Envio para a Apuração da Folha do mês (detectado ou selecionado — obrigatório) */}
          {extratoSummary && !extratoError && (
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/60 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-slate-600 space-y-1">
                <p>
                  {extratoPeriod ? (
                    <>Mês detectado: <span className="font-bold text-slate-900">{periodoLabel(extratoPeriod)}</span></>
                  ) : (
                    <span className="text-amber-700 font-semibold inline-flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" /> Mês não detectado — selecione manualmente.
                    </span>
                  )}
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-500">Enviar para o mês:</span>
                  <select
                    value={extratoMonth}
                    onChange={(e) => setExtratoMonth(e.target.value)}
                    className={`px-2 py-1.5 bg-white border rounded-lg text-xs ${extratoMonth ? 'border-slate-200' : 'border-amber-400'}`}
                  >
                    <option value="">Selecione o mês…</option>
                    {MESES.slice(1).map((m, i) => (
                      <option key={i + 1} value={String(i + 1)}>{String(i + 1).padStart(2, '0')} · {m}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={2000}
                    max={2100}
                    value={extratoYear}
                    onChange={(e) => setExtratoYear(e.target.value)}
                    className="w-20 px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                  />
                </div>
                <p className="text-[11px] text-slate-500">
                  Destino: <b>Apuração da Folha</b> › {extratoMonth ? periodoLabel({ month: Number(extratoMonth), year: Number(extratoYear) }) : '—'} (substitui a folha do mês).
                </p>
                {extratoCommitMsg && (
                  <p className="text-[11px] font-semibold text-emerald-700 inline-flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> {extratoCommitMsg}
                  </p>
                )}
              </div>
              <button
                onClick={commitExtratoToFolha}
                disabled={extratoCommitting || !extratoMonth}
                title={!extratoMonth ? 'Selecione o mês para enviar' : 'Envia a folha para o mês'}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#004D40] text-white text-sm font-bold hover:bg-[#003d33] disabled:opacity-60 transition-colors"
              >
                {extratoCommitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRightCircle className="w-4 h-4" />}
                {extratoCommitting ? 'Enviando...' : 'Enviar para Apuração da Folha'}
              </button>
            </div>
          )}

          {extratoEmployees.length > 0 && (
            <div className="overflow-auto max-h-[520px]">
              <table className="w-full text-left border-collapse min-w-[1200px]">
                <thead className="sticky top-0">
                  <tr className="bg-slate-50 border-b border-slate-200">
                    {['Matríc.', 'Funcionário', 'Cargo (cadastro)', 'Cargo (arquivo)', 'Situação', 'Salário', 'Proventos', 'Descontos', 'Líquido', 'Base INSS', 'Base FGTS', 'Base IRRF'].map((h) => (
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
                  {filteredExtratoEmployees.map((emp, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/70">
                      <td className="px-3 py-2 text-xs text-slate-500 tabular-nums">{emp.matricula}</td>
                      <td className="px-3 py-2 text-xs text-slate-800 whitespace-nowrap">{emp.nome}</td>
                      <td className="px-3 py-2 text-xs min-w-[220px]">
                        <select
                          value={emp.cargo_id || ''}
                          onChange={(e) => updateExtratoCargo(emp.matricula, e.target.value)}
                          className="w-full min-w-[200px] px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                          title={
                            cadastroCargos.length === 0
                              ? 'Cadastre cargos em Cadastros › Setores / Centros de Custo'
                              : 'Selecione o cargo cadastrado'
                          }
                        >
                          <option value="">
                            {cadastroCargos.length === 0 ? 'Cadastre cargos em Cadastros' : 'Selecionar cargo…'}
                          </option>
                          {cadastroCargos.map((c) => (
                            <option key={c.id} value={String(c.id)}>
                              {c.sector_name ? `${c.sector_name} › ${c.name}` : c.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-500 whitespace-nowrap" title="Cargo lido do extrato">
                        {emp.cargo || '—'}
                      </td>
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
      )}

      {/* Pré-visualização do Rel. CRD — com seleção e importação por conta */}
      {(relCrdFileName || relCrdError) && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap gap-3 items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#004D40]" />
              <p className="text-sm font-bold text-slate-800">Rel. CRD — movimentação por conta financeira</p>
            </div>
            {relCrdSummary && (
              <div className="text-xs text-slate-600 flex flex-wrap gap-x-4 gap-y-1">
                <span>Contas: <span className="font-bold">{relCrdSummary.contas}</span></span>
                <span>Grupos: <span className="font-bold">{relCrdSummary.grupos}</span></span>
                <span>Lançamentos: <span className="font-bold">{formatCurrency(relCrdSummary.total_lancamentos)}</span></span>
                <span>Baixas: <span className="font-bold">{formatCurrency(relCrdSummary.total_baixas)}</span></span>
                <span>Lanç. líquido: <span className="font-bold">{formatCurrency(relCrdSummary.total_lanc_liquido)}</span></span>
              </div>
            )}
          </div>

          {relCrdFileName && !relCrdError && (
            <div className="px-4 py-2 text-xs text-emerald-700 bg-emerald-50/60 border-b border-emerald-100 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Arquivo processado: {relCrdFileName}
            </div>
          )}
          {relCrdError && (
            <div className="px-4 py-2 text-xs text-red-700 bg-red-50 border-b border-red-100 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              {relCrdError}
            </div>
          )}

          {relCrdCommitResult && (
            <div className="px-4 py-2 text-xs bg-emerald-50 border-b border-emerald-100 flex flex-wrap gap-x-4 items-center">
              <span className="text-emerald-700 font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" />
                {relCrdCommitResult.imported} conta(s) importada(s) com sucesso.
              </span>
              {relCrdCommitResult.not_found.length > 0 && (
                <span className="text-amber-700">
                  Não encontrados: {relCrdCommitResult.not_found.join(', ')}
                </span>
              )}
            </div>
          )}

          {relCrdAccounts.length > 0 && (
            <>
              {/* Barra de ações: seletor de mês/ano + importar */}
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50 flex flex-wrap gap-3 items-center justify-between">
                <ImportPeriodPicker
                  scope={relCrdImportScope}
                  onScopeChange={setRelCrdImportScope}
                  weekIndex={relCrdWeekIndex}
                  onWeekIndexChange={setRelCrdWeekIndex}
                  month={relCrdImportMonth}
                  onMonthChange={setRelCrdImportMonth}
                  year={relCrdImportYear}
                  onYearChange={setRelCrdImportYear}
                  yearBase={now.getFullYear()}
                  hint={`Destino padrão: ${relCrdImportScope === 'acompanhamento' ? 'D (Diário)' : 'M (Mensal)'}`}
                />
                <button
                  onClick={() => commitRelCrd()}
                  disabled={relCrdCommitting}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#004D40] text-white hover:bg-[#003d33] disabled:opacity-50 transition-colors flex items-center gap-1"
                >
                  {relCrdCommitting ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                  Importar tudo
                </button>
              </div>

              <div className="overflow-auto max-h-[520px]">
                <table className="w-full text-left border-collapse min-w-[1200px]">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span>Destino</span>
                          <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden text-[10px] font-bold normal-case tracking-normal">
                            <button
                              type="button"
                              title={relCrdAllD ? 'Desmarcar D em todas' : 'Selecionar D em todas'}
                              onClick={() => setRelCrdDestinoAll({ D: !relCrdAllD })}
                              className={`px-2.5 py-1 transition-colors ${
                                relCrdAllD
                                  ? 'bg-blue-400 text-blue-900'
                                  : 'bg-white text-slate-400 hover:bg-slate-50'
                              }`}
                            >
                              D
                            </button>
                            <button
                              type="button"
                              title={relCrdAllM ? 'Desmarcar M em todas' : 'Selecionar M em todas'}
                              onClick={() => setRelCrdDestinoAll({ M: !relCrdAllM })}
                              className={`px-2.5 py-1 transition-colors border-l border-slate-200 ${
                                relCrdAllM
                                  ? 'bg-amber-400 text-amber-900'
                                  : 'bg-white text-slate-400 hover:bg-slate-50'
                              }`}
                            >
                              M
                            </button>
                          </div>
                          <button
                            type="button"
                            title="Ligar D e M em todas as linhas"
                            onClick={() => setRelCrdDestinoAll({ D: true, M: true })}
                            className="text-[9px] font-bold uppercase tracking-wider text-[#004D40] hover:underline"
                          >
                            Selecionar todos
                          </button>
                        </div>
                      </th>
                      {['Cód.', 'Conta', 'Lançamentos', 'Cancelam.', 'Saldo lanç.', 'Baixas', 'Estorno', 'Baixas líq.', 'Lanç. líquido'].map((h) => (
                        <th
                          key={h}
                          className={`px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest ${
                            !['Cód.', 'Conta'].includes(h) ? 'text-right' : ''
                          }`}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRelCrdAccounts.map((acc, idx) => {
                      const dest = relCrdDestinos[acc.codigo] ?? relCrdScopeDefault;
                      return (
                        <tr
                          key={idx}
                          className={`${acc.nivel === 1 ? 'bg-slate-100 font-bold' : acc.nivel === 2 ? 'bg-slate-50/60' : ''} hover:bg-slate-50/40`}
                        >
                          <td className="px-3 py-2 text-center">
                            <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden text-[10px] font-bold">
                              <button
                                type="button"
                                title="Prev x Real Diario"
                                onClick={() => toggleRelCrdDestino(acc.codigo, 'D')}
                                className={`px-2.5 py-1 transition-colors ${
                                  dest.D
                                    ? 'bg-blue-400 text-blue-900'
                                    : 'bg-white text-slate-400 hover:bg-slate-50'
                                }`}
                              >
                                D
                              </button>
                              <button
                                type="button"
                                title="Prev x Real Mensal"
                                onClick={() => toggleRelCrdDestino(acc.codigo, 'M')}
                                className={`px-2.5 py-1 transition-colors border-l border-slate-200 ${
                                  dest.M
                                    ? 'bg-amber-400 text-amber-900'
                                    : 'bg-white text-slate-400 hover:bg-slate-50'
                                }`}
                              >
                                M
                              </button>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-xs text-slate-500 tabular-nums">{acc.codigo}</td>
                          <td
                            className={`px-3 py-2 text-xs whitespace-nowrap ${acc.nivel === 1 ? 'text-slate-900 font-bold' : acc.nivel === 2 ? 'text-slate-800 font-semibold' : 'text-slate-700'}`}
                            style={{ paddingLeft: `${0.75 + (acc.nivel - 1) * 1.25}rem` }}
                          >
                            {acc.nome}
                          </td>
                          <td className="px-3 py-2 text-xs text-right tabular-nums text-slate-700">{formatCurrency(acc.lancamentos)}</td>
                          <td className="px-3 py-2 text-xs text-right tabular-nums text-slate-500">{formatCurrency(acc.cancelamentos)}</td>
                          <td className="px-3 py-2 text-xs text-right tabular-nums text-slate-700">{formatCurrency(acc.saldo_lanc)}</td>
                          <td className="px-3 py-2 text-xs text-right tabular-nums text-slate-700">{formatCurrency(acc.baixas)}</td>
                          <td className="px-3 py-2 text-xs text-right tabular-nums text-slate-500">{formatCurrency(acc.estorno)}</td>
                          <td className="px-3 py-2 text-xs text-right tabular-nums text-slate-700">{formatCurrency(acc.baixas_liquido)}</td>
                          <td className={`px-3 py-2 text-xs text-right tabular-nums font-semibold ${acc.lanc_liquido < 0 ? 'text-red-600' : 'text-slate-900'}`}>{formatCurrency(acc.lanc_liquido)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Pré-visualização da Provisão de Férias — todas as linhas por funcionário + totais. */}
      {(provisaoFeriasFileName || provisaoFeriasError) && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap gap-3 items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#004D40]" />
              <p className="text-sm font-bold text-slate-800">
                Provisão Férias — detalhe por funcionário
                {provisaoFeriasPeriod?.month && provisaoFeriasPeriod?.year
                  ? ` (${periodoLabel({ month: provisaoFeriasPeriod.month, year: provisaoFeriasPeriod.year })})`
                  : ''}
              </p>
            </div>
            {provisaoFeriasRows.length > 0 && (
              <span className="text-xs text-slate-600">
                Funcionários: <span className="font-bold">{provisaoFeriasRows.length}</span>
              </span>
            )}
          </div>

          {provisaoFeriasFileName && !provisaoFeriasError && (
            <div className="px-4 py-2 text-xs text-emerald-700 bg-emerald-50/60 border-b border-emerald-100 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Arquivo processado: {provisaoFeriasFileName}
            </div>
          )}
          {provisaoFeriasError && (
            <div className="px-4 py-2 text-xs text-red-700 bg-red-50 border-b border-red-100 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              {provisaoFeriasError}
            </div>
          )}

          {provisaoFeriasTotals && (
            <div className="p-4 border-b border-slate-100">
              <p className="text-xs text-slate-500 mb-3">
                Relatório completo extraído. As <b>faltas</b> podem ser enviadas ao módulo de Absenteísmo.
              </p>
              <div className="flex flex-wrap items-center gap-3 mb-3">
                <button
                  type="button"
                  onClick={commitProvisaoFerias}
                  disabled={provisaoFeriasCommitting || !provisaoFeriasRows.length}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-[#004D40] text-white text-xs font-bold rounded-xl disabled:opacity-50"
                >
                  {provisaoFeriasCommitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRightCircle className="w-4 h-4" />}
                  {provisaoFeriasCommitting ? 'Gravando...' : 'Enviar faltas para Absenteísmo'}
                </button>
                {provisaoFeriasCommitMsg && (
                  <span className="text-xs text-emerald-700 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> {provisaoFeriasCommitMsg}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  ['Salário', provisaoFeriasTotals.salario],
                  ['Média e vantagens', provisaoFeriasTotals.media_vantagens],
                  ['1/3 férias', provisaoFeriasTotals.terco_ferias],
                  ['Valor devido', provisaoFeriasTotals.valor_devido],
                  ['Valor mês', provisaoFeriasTotals.valor_mes],
                  ['INSS', provisaoFeriasTotals.inss],
                  ['FGTS', provisaoFeriasTotals.fgts],
                  ['PIS', provisaoFeriasTotals.pis],
                ].map(([label, value]) => (
                  <div key={label as string} className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{label}</p>
                    <p className="text-sm font-bold text-slate-900 mt-1 tabular-nums">{formatCurrency(value as number)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {provisaoFeriasRows.length > 0 && (
            <div className="overflow-auto max-h-[520px]">
              <table className="w-full text-left border-collapse min-w-[1450px]">
                <thead className="sticky top-0">
                  <tr className="bg-slate-50 border-b border-slate-200">
                    {[
                      'Cód.',
                      'Nome',
                      'Vencto. férias',
                      'Fér ven',
                      'Fér pro',
                      'Faltas',
                      'Salário',
                      'Média e vantagens',
                      '1/3 férias',
                      'Valor devido',
                      'Valor mês',
                      'INSS',
                      'FGTS',
                      'PIS',
                    ].map((h) => (
                      <th
                        key={h}
                        className={`px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest ${
                          !['Cód.', 'Nome', 'Vencto. férias'].includes(h) ? 'text-right' : ''
                        }`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredProvisaoFeriasRows.map((r, idx) => (
                    <tr key={`${r.codigo}-${idx}`} className="hover:bg-slate-50/70">
                      <td className="px-3 py-2 text-xs text-slate-500 tabular-nums">{r.codigo}</td>
                      <td className="px-3 py-2 text-xs whitespace-nowrap text-slate-800">{r.nome}</td>
                      <td className="px-3 py-2 text-xs text-slate-600 tabular-nums">{r.vencto_ferias}</td>
                      <td className="px-3 py-2 text-xs text-right tabular-nums text-slate-600">{r.fer_ven}</td>
                      <td className="px-3 py-2 text-xs text-right tabular-nums text-slate-600">{r.fer_pro}</td>
                      <td className="px-3 py-2 text-xs text-right tabular-nums text-slate-600">{r.faltas}</td>
                      <td className="px-3 py-2 text-xs text-right tabular-nums text-slate-700">{formatCurrency(r.salario)}</td>
                      <td className="px-3 py-2 text-xs text-right tabular-nums text-slate-700">{formatCurrency(r.media_vantagens)}</td>
                      <td className="px-3 py-2 text-xs text-right tabular-nums text-slate-700">{formatCurrency(r.terco_ferias)}</td>
                      <td className="px-3 py-2 text-xs text-right tabular-nums font-semibold text-slate-900">{formatCurrency(r.valor_devido)}</td>
                      <td className="px-3 py-2 text-xs text-right tabular-nums text-slate-700">{formatCurrency(r.valor_mes)}</td>
                      <td className="px-3 py-2 text-xs text-right tabular-nums text-slate-500">{formatCurrency(r.inss)}</td>
                      <td className="px-3 py-2 text-xs text-right tabular-nums text-slate-500">{formatCurrency(r.fgts)}</td>
                      <td className="px-3 py-2 text-xs text-right tabular-nums text-slate-500">{formatCurrency(r.pis)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Pré-visualização da Provisão de 13º — todas as linhas por funcionário + totais. */}
      {(provisao13FileName || provisao13Error) && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap gap-3 items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#004D40]" />
              <p className="text-sm font-bold text-slate-800">
                Provisões 13º — detalhe por funcionário
                {provisao13Period?.month && provisao13Period?.year
                  ? ` (${periodoLabel({ month: provisao13Period.month, year: provisao13Period.year })})`
                  : ''}
              </p>
            </div>
            {provisao13Rows.length > 0 && (
              <span className="text-xs text-slate-600">
                Funcionários: <span className="font-bold">{provisao13Rows.length}</span>
              </span>
            )}
          </div>

          {provisao13FileName && !provisao13Error && (
            <div className="px-4 py-2 text-xs text-emerald-700 bg-emerald-50/60 border-b border-emerald-100 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Arquivo processado: {provisao13FileName}
            </div>
          )}
          {provisao13Error && (
            <div className="px-4 py-2 text-xs text-red-700 bg-red-50 border-b border-red-100 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              {provisao13Error}
            </div>
          )}

          {provisao13Totals && (
            <div className="p-4 border-b border-slate-100">
              <p className="text-xs text-slate-500 mb-3">
                Relatório completo extraído. Os valores de FGTS 13º alimentam o painel <b>Orç. × Real. Folha</b>.
              </p>
              <div className="flex flex-wrap items-center gap-3 mb-3">
                <button
                  type="button"
                  onClick={commitProvisao13}
                  disabled={provisao13Committing || !provisao13Rows.length}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-[#004D40] text-white text-xs font-bold rounded-xl disabled:opacity-50"
                >
                  {provisao13Committing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRightCircle className="w-4 h-4" />}
                  {provisao13Committing ? 'Gravando...' : 'Gravar provisão 13º (FGTS no painel)'}
                </button>
                {provisao13CommitMsg && (
                  <span className="text-xs text-emerald-700 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> {provisao13CommitMsg}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  ['Salário 13º', provisao13Totals.salario_13],
                  ['Média e vantagens', provisao13Totals.media_vantagens],
                  ['Adiantamento 13º', provisao13Totals.adiantamento_13],
                  ['Valor devido', provisao13Totals.valor_devido],
                  ['Valor mês', provisao13Totals.valor_mes],
                  ['INSS', provisao13Totals.inss],
                  ['FGTS', provisao13Totals.fgts],
                  ['PIS', provisao13Totals.pis],
                ].map(([label, value]) => (
                  <div key={label as string} className="rounded-xl border border-slate-100 bg-slate-50/60 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">{label}</p>
                    <p className="text-sm font-bold text-slate-900 mt-1 tabular-nums">{formatCurrency(value as number)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {provisao13Rows.length > 0 && (
            <div className="overflow-auto max-h-[520px]">
              <table className="w-full text-left border-collapse min-w-[1300px]">
                <thead className="sticky top-0">
                  <tr className="bg-slate-50 border-b border-slate-200">
                    {[
                      'Cód.',
                      'Nome',
                      'Data admissão',
                      'Avos',
                      'Salário 13º',
                      'Média e vantagens',
                      'Adiantamento 13º',
                      'Valor devido',
                      'Valor mês',
                      'INSS',
                      'FGTS',
                      'PIS',
                    ].map((h) => (
                      <th
                        key={h}
                        className={`px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest ${
                          !['Cód.', 'Nome', 'Data admissão', 'Avos'].includes(h) ? 'text-right' : ''
                        }`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredProvisao13Rows.map((r, idx) => (
                    <tr key={`${r.codigo}-${idx}`} className="hover:bg-slate-50/70">
                      <td className="px-3 py-2 text-xs text-slate-500 tabular-nums">{r.codigo}</td>
                      <td className="px-3 py-2 text-xs whitespace-nowrap text-slate-800">{r.nome}</td>
                      <td className="px-3 py-2 text-xs text-slate-600 tabular-nums">{r.data_admissao}</td>
                      <td className="px-3 py-2 text-xs text-slate-600 tabular-nums">{r.avos}</td>
                      <td className="px-3 py-2 text-xs text-right tabular-nums text-slate-700">{formatCurrency(r.salario_13)}</td>
                      <td className="px-3 py-2 text-xs text-right tabular-nums text-slate-700">{formatCurrency(r.media_vantagens)}</td>
                      <td className="px-3 py-2 text-xs text-right tabular-nums text-slate-700">{formatCurrency(r.adiantamento_13)}</td>
                      <td className="px-3 py-2 text-xs text-right tabular-nums font-semibold text-slate-900">{formatCurrency(r.valor_devido)}</td>
                      <td className="px-3 py-2 text-xs text-right tabular-nums text-slate-700">{formatCurrency(r.valor_mes)}</td>
                      <td className="px-3 py-2 text-xs text-right tabular-nums text-slate-500">{formatCurrency(r.inss)}</td>
                      <td className="px-3 py-2 text-xs text-right tabular-nums text-slate-500">{formatCurrency(r.fgts)}</td>
                      <td className="px-3 py-2 text-xs text-right tabular-nums text-slate-500">{formatCurrency(r.pis)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Pré-visualização do RDS — todas as seções e itens do relatório. */}
      {(rdsFileName || rdsError) && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap gap-3 items-center justify-between">
            <div className="flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-[#004D40]" />
              <p className="text-sm font-bold text-slate-800">
                Relatório Diário de Situação — detalhe completo
                {rdsDate ? ` (${rdsDate})` : ''}
              </p>
            </div>
          </div>

          {rdsFileName && !rdsError && (
            <div className="px-4 py-2 text-xs text-emerald-700 bg-emerald-50/60 border-b border-emerald-100 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              Arquivo processado: {rdsFileName}
            </div>
          )}
          {rdsError && (
            <div className="px-4 py-2 text-xs text-red-700 bg-red-50 border-b border-red-100 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              {rdsError}
            </div>
          )}

          {rdsSections.length > 0 && !rdsError && (
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/60 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-slate-600 space-y-1">
                <p>
                  {rdsDate ? (
                    <>Data do relatório: <span className="font-bold text-slate-900">{rdsDate}</span></>
                  ) : (
                    <span className="text-amber-700 font-semibold inline-flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" /> Data não detectada — selecione o mês manualmente.
                    </span>
                  )}
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-500">Enviar para o mês:</span>
                  <select
                    value={rdsMonth}
                    onChange={(e) => setRdsMonth(e.target.value)}
                    className={`px-2 py-1.5 bg-white border rounded-lg text-xs ${rdsMonth ? 'border-slate-200' : 'border-amber-400'}`}
                  >
                    <option value="">Selecione o mês…</option>
                    {MESES.slice(1).map((m, i) => (
                      <option key={i + 1} value={String(i + 1)}>{String(i + 1).padStart(2, '0')} · {m}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={2000}
                    max={2100}
                    value={rdsYear}
                    onChange={(e) => setRdsYear(e.target.value)}
                    className="w-20 px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                  />
                </div>
                <p className="text-[11px] text-slate-500">
                  Destino: Apuração de Receita › <b>Relatório Diário de Situação</b>
                  {' · '}
                  Planilhas <b>Relatório de RDS</b> e <b>Apoio RDS</b> permanecem nesta seção.
                </p>
                {rdsCommitMsg && (
                  <p className="text-[11px] font-semibold text-emerald-700 inline-flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> {rdsCommitMsg}
                  </p>
                )}
              </div>
              <button
                onClick={commitRds}
                disabled={rdsCommitting || !rdsMonth}
                title={!rdsMonth ? 'Selecione o mês para enviar' : 'Envia o RDS para Apuração de Receita'}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#004D40] text-white text-sm font-bold hover:bg-[#003d33] disabled:opacity-60 transition-colors"
              >
                {rdsCommitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRightCircle className="w-4 h-4" />}
                {rdsCommitting ? 'Enviando...' : 'Enviar para Apuração de Receita'}
              </button>
            </div>
          )}

          {rdsSections.length > 0 && (
            <div className="p-4 space-y-6">
              <p className="text-xs text-slate-500">
                Pré-visualização do relatório. Ao enviar, o snapshot do mês substitui o conteúdo anterior
                em Apuração de Receita › Relatório Diário de Situação.
              </p>
              {rdsSections.map((section) => (
                <div key={section.key} className="space-y-2">
                  <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">{section.title}</p>
                  <div className="overflow-auto max-h-[360px] rounded-xl border border-slate-100">
                    <table className="w-full text-left border-collapse min-w-[600px]">
                      <thead className="sticky top-0">
                        <tr className="bg-slate-50 border-b border-slate-200">
                          {section.columns.map((h, hi) => (
                            <th
                              key={h}
                              className={`px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest ${hi > 0 ? 'text-right' : ''}`}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {section.items.map((item, idx) => (
                          <tr key={`${item.label}-${idx}`} className="hover:bg-slate-50/70">
                            <td className="px-3 py-2 text-xs whitespace-nowrap text-slate-800">{item.label}</td>
                            {item.values.map((v, vi) => (
                              <td key={vi} className="px-3 py-2 text-xs text-right tabular-nums text-slate-700">
                                {section.columns[vi + 1]?.includes('%') ? `${v.toFixed(2)}%` : formatCurrency(v)}
                              </td>
                            ))}
                          </tr>
                        ))}
                        {section.total && (
                          <tr className="bg-slate-50 font-bold">
                            <td className="px-3 py-2 text-xs text-slate-900">Total</td>
                            {section.total.map((v, vi) => (
                              <td key={vi} className="px-3 py-2 text-xs text-right tabular-nums text-slate-900">
                                {section.columns[vi + 1]?.includes('%') ? `${v.toFixed(2)}%` : formatCurrency(v)}
                              </td>
                            ))}
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}

              {rdsPrevisaoSemana.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">Previsão de ocupação da semana</p>
                  <div className="overflow-auto rounded-xl border border-slate-100">
                    <table className="w-full text-left border-collapse min-w-[500px]">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          {['Dia', 'Data', 'Quantidade', 'Percentual'].map((h, hi) => (
                            <th
                              key={h}
                              className={`px-3 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest ${hi > 0 ? 'text-right' : ''}`}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {rdsPrevisaoSemana.map((w, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/70">
                            <td className="px-3 py-2 text-xs text-slate-800">{w.dia}</td>
                            <td className="px-3 py-2 text-xs text-right tabular-nums text-slate-600">{w.data}</td>
                            <td className="px-3 py-2 text-xs text-right tabular-nums text-slate-700">{w.quantidade}</td>
                            <td className="px-3 py-2 text-xs text-right tabular-nums text-slate-700">{w.percentual.toFixed(2)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Pré-visualização das Requisições Sintética — todos os setores e grupos de itens. */}
      {(requisicoesFileName || requisicoesError) && (() => {
        // Calcula totais por categoria para o painel de resumo
        const totaisPorCategoria = emptyReqDestinoTotals();
        const totaisCmvSubtipo = emptyReqCmvSubtipoTotals();
        for (const st of requisicoesSetores) {
          for (const g of st.grupos) {
            const dest = requisicoesDestinos[g.codigo] ?? '';
            totaisPorCategoria[dest] = (totaisPorCategoria[dest] ?? 0) + g.valor;
            if (isReqDestinoCmv(dest)) {
              const sub = requisicoesCmvSubtipos[g.codigo] || resolveReqCmvSubtipo(g.codigo, dest) || '';
              totaisCmvSubtipo[sub in totaisCmvSubtipo ? sub : ''] =
                (totaisCmvSubtipo[sub in totaisCmvSubtipo ? sub : ''] ?? 0) + g.valor;
            }
          }
        }

        return (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap gap-3 items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#004D40]" />
                <p className="text-sm font-bold text-slate-800">
                  Requisições Sintética por Grupo de Itens — detalhe completo
                  {requisicoesPeriodo?.de && requisicoesPeriodo?.ate
                    ? ` (${formatDate(requisicoesPeriodo.de)} a ${formatDate(requisicoesPeriodo.ate)})`
                    : ''}
                </p>
              </div>
              {requisicoesSetores.length > 0 && (
                <div className="text-xs text-slate-600 flex flex-wrap gap-x-4 gap-y-1">
                  <span>Setores: <span className="font-bold">{requisicoesSetores.length}</span></span>
                  <span>Grupos: <span className="font-bold">{requisicoesSetores.reduce((s, st) => s + st.grupos.length, 0)}</span></span>
                  {requisicoesTotalGeral !== null && (
                    <span>Total geral: <span className="font-bold">{formatCurrency(requisicoesTotalGeral)}</span></span>
                  )}
                </div>
              )}
            </div>

            {requisicoesFileName && !requisicoesError && (
              <div className="px-4 py-2 text-xs text-emerald-700 bg-emerald-50/60 border-b border-emerald-100 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" />
                Arquivo processado: {requisicoesFileName}
              </div>
            )}
            {requisicoesError && (
              <div className="px-4 py-2 text-xs text-red-700 bg-red-50 border-b border-red-100 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                {requisicoesError}
              </div>
            )}

            {reqCommitResult && (
              <div className="px-4 py-2 text-xs bg-emerald-50 border-b border-emerald-100 flex items-center gap-1 text-emerald-700 font-semibold">
                <CheckCircle2 className="w-4 h-4" />
                {reqCommitResult.imported} grupo(s) enviado(s) para Apuração de Resultados › Requisição Sintética.
              </div>
            )}

            {requisicoesSetores.length > 0 && (
              <>
                {/* Barra de ações: seletor de mês/ano + enviar para a Apuração */}
                <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50 flex flex-wrap gap-3 items-center justify-between">
                  <ImportPeriodPicker
                    scope={reqImportScope}
                    onScopeChange={setReqImportScope}
                    weekIndex={reqWeekIndex}
                    onWeekIndexChange={setReqWeekIndex}
                    month={reqImportMonth}
                    onMonthChange={setReqImportMonth}
                    year={reqImportYear}
                    onYearChange={setReqImportYear}
                    hint={
                      reqImportScope === 'acompanhamento'
                        ? 'Acompanhamento semanal — não altera o fechamento'
                        : 'Consolidado mensal para Apuração de Resultados'
                    }
                  />
                  <button
                    onClick={() => commitRequisicoes()}
                    disabled={reqCommitting}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#004D40] text-white hover:bg-[#003d33] disabled:opacity-50 transition-colors flex items-center gap-1"
                  >
                    {reqCommitting ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                    Importar tudo
                  </button>
                </div>

                {/* Painel de totais por categoria */}
                <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/40 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                  {([...REQ_DESTINOS, ''] as ReqDestino[]).map((cat) => (
                    <div key={cat || 'sem'} className={`rounded-xl border px-3 py-2.5 ${cat ? REQ_DESTINO_BADGES[cat] : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                      <p className="text-[10px] font-bold uppercase tracking-widest opacity-70">
                        {cat ? REQ_DESTINO_LABELS[cat] : 'Não classificado'}
                      </p>
                      <p className="text-sm font-bold mt-0.5 tabular-nums">{formatCurrency(totaisPorCategoria[cat] ?? 0)}</p>
                    </div>
                  ))}
                </div>

                <div className="px-4 py-3 border-b border-slate-100 bg-amber-50/40 grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-orange-700/80">CMV · Alimentos</p>
                    <p className="text-sm font-bold mt-0.5 tabular-nums text-orange-900">{formatCurrency(totaisCmvSubtipo.alimentos ?? 0)}</p>
                  </div>
                  <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-sky-700/80">CMV · Bebidas</p>
                    <p className="text-sm font-bold mt-0.5 tabular-nums text-sky-900">{formatCurrency(totaisCmvSubtipo.bebidas ?? 0)}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">CMV sem subtipo</p>
                    <p className="text-sm font-bold mt-0.5 tabular-nums text-slate-700">{formatCurrency(totaisCmvSubtipo[''] ?? 0)}</p>
                  </div>
                </div>

                <div className="p-4 space-y-3 max-h-[640px] overflow-auto">
                  {requisicoesSetores
                    .filter((st) => matchesSearch(query, st.nome, String(st.codigo), st.total ?? 0) || st.grupos.some((g) => matchesSearch(query, g.nome, String(g.codigo), g.valor)))
                    .map((setor) => (
                      <details key={`${setor.codigo}-${setor.nome}`} className="rounded-xl border border-slate-100 overflow-hidden">
                        <summary className="px-3 py-2 bg-slate-50 text-xs font-bold text-slate-800 cursor-pointer flex items-center justify-between">
                          <span>{setor.codigo} — {setor.nome}</span>
                          <span className="text-slate-600 tabular-nums">{formatCurrency(setor.total ?? 0)}</span>
                        </summary>
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-white border-b border-slate-100">
                              <th className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cód.</th>
                              <th className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Grupo de itens</th>
                              <th className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Valor</th>
                              <th className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Destino</th>
                              <th className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">CMV</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                            {setor.grupos
                              .filter((g) => !query || matchesSearch(query, g.nome, String(g.codigo), g.valor))
                              .map((g, gi) => {
                                const dest = requisicoesDestinos[g.codigo] ?? '';
                                const cmvSub = normalizeReqCmvSubtipo(requisicoesCmvSubtipos[g.codigo] ?? resolveReqCmvSubtipo(g.codigo, dest) ?? '');
                                return (
                                  <tr key={gi} className={`${dest ? 'bg-opacity-20' : ''} hover:bg-slate-50/70`}>
                                    <td className="px-3 py-1.5 text-xs text-slate-500 tabular-nums">{g.codigo}</td>
                                    <td className="px-3 py-1.5 text-xs text-slate-700">{g.nome}</td>
                                    <td className="px-3 py-1.5 text-xs text-right tabular-nums text-slate-700">{formatCurrency(g.valor)}</td>
                                    <td className="px-3 py-1.5 text-center">
                                      <ReqDestinoPicker
                                        value={dest}
                                        onChange={(next) => setReqDestino(g.codigo, next)}
                                      />
                                    </td>
                                    <td className="px-3 py-1.5 text-center">
                                      {isReqDestinoCmv(dest) ? (
                                        <ReqCmvSubtipoPicker
                                          value={cmvSub}
                                          onChange={(sub) => setReqCmvSubtipo(g.codigo, sub)}
                                        />
                                      ) : (
                                        <span className="text-[10px] text-slate-300">—</span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                          </tbody>
                        </table>
                      </details>
                    ))}
                </div>
              </>
            )}
          </div>
        );
      })()}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-slate-500" />
            <h3 className="text-sm font-bold text-slate-800">Previsto (Síntase)</h3>
          </div>
          <p className="text-sm text-slate-600">
            Continue importando manualmente suas planilhas da Síntase para compor o previsto mensal.
          </p>
          <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-600">
            Fonte: importação manual de planilhas (mantida como processo atual).
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-slate-500" />
            <h3 className="text-sm font-bold text-slate-800">Realizado (Desbravador - PDF ou Excel)</h3>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              min={1}
              max={12}
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
              placeholder="Mês"
            />
            <input
              type="number"
              min={2000}
              max={2100}
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
              placeholder="Ano"
            />
          </div>

          <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700 cursor-pointer hover:bg-slate-50 transition-colors">
            {loadingImport ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {loadingImport ? 'Processando arquivo...' : 'Enviar relatório (PDF/Excel)'}
            <input
              type="file"
              accept="application/pdf,.xlsx,.xls,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={importDesbravadorFile}
              disabled={loadingImport}
              className="hidden"
            />
          </label>

          {importFileName && !error && (
            <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
              <CheckCircle2 className="w-4 h-4" />
              Arquivo processado ({importSource === 'excel' ? 'Excel' : 'PDF'}): {importFileName}
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
              <AlertTriangle className="w-4 h-4" />
              {error}
            </div>
          )}

          {isExcelImport && excelColumns.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Mapeamento manual assistido</p>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={descriptionColumnIndex}
                  onChange={(e) => setDescriptionColumnIndex(e.target.value)}
                  className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs"
                >
                  <option value="">Coluna de descrição</option>
                  {excelColumns.map((column) => (
                    <option key={`desc-${column.index}`} value={String(column.index)}>
                      {column.name}
                    </option>
                  ))}
                </select>
                <select
                  value={valueColumnIndex}
                  onChange={(e) => setValueColumnIndex(e.target.value)}
                  className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs"
                >
                  <option value="">Coluna de valor</option>
                  {excelColumns.map((column) => (
                    <option key={`value-${column.index}`} value={String(column.index)}>
                      {column.name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={applyManualExcelMapping}
                disabled={loadingImport}
                className="w-full px-3 py-2 rounded-xl text-xs font-bold text-white bg-[#004D40] hover:bg-[#003d33] disabled:opacity-60 transition-colors"
              >
                {loadingImport ? 'Reprocessando...' : 'Aplicar mapeamento manual'}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap gap-3 items-center justify-between">
          <p className="text-sm font-bold text-slate-800">Prévia do realizado importado</p>
          <div className="text-xs text-slate-600">
            Itens: <span className="font-bold">{summaryCount}</span> • Total: <span className="font-bold">{formatCurrency(summaryTotal)}</span>
          </div>
        </div>

        <div className="overflow-auto max-h-[420px]">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Linha do relatório</th>
                <th className="px-4 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Valor (realizado)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredParsedLines.length === 0 && (
                <tr>
                  <td colSpan={2} className="px-4 py-8 text-center text-sm text-slate-400">
                    Faça upload de um PDF ou Excel do Desbravador para visualizar os lançamentos mapeados.
                  </td>
                </tr>
              )}
              {filteredParsedLines.map((line, idx) => (
                <tr key={`${line.descricao}-${idx}`} className="hover:bg-slate-50/70">
                  <td className="px-4 py-2 text-sm text-slate-700">{line.descricao}</td>
                  <td className={`px-4 py-2 text-sm text-right font-semibold tabular-nums ${line.valor < 0 ? 'text-red-600' : 'text-slate-800'}`}>
                    {formatCurrency(line.valor)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-slate-500" />
            <p className="text-sm font-bold text-slate-800">Histórico de importações</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={historyFilter}
              onChange={(e) => setHistoryFilter(e.target.value)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700"
            >
              <option value="">Todos os tipos</option>
              {Object.entries(IMPORT_HISTORY_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={loadImportHistory}
              disabled={historyLoading}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60 transition-colors"
            >
              <RefreshCcw className={`w-3.5 h-3.5 ${historyLoading ? 'animate-spin' : ''}`} />
              Atualizar
            </button>
          </div>
        </div>

        {historyError && (
          <div className="mx-4 mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
            {historyError}
          </div>
        )}

        <div className="overflow-auto max-h-[360px]">
          <table className="w-full text-left border-collapse min-w-[920px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Data</th>
                <th className="px-4 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Tipo</th>
                <th className="px-4 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Arquivo</th>
                <th className="px-4 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Período</th>
                <th className="px-4 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Registros</th>
                <th className="px-4 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Total</th>
                <th className="px-4 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Usuário</th>
                <th className="px-4 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Status</th>
                <th className="px-4 py-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {historyLoading && filteredHistoryRows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-sm text-slate-400">
                    <Loader2 className="w-5 h-5 animate-spin inline-block mr-2" />
                    Carregando histórico...
                  </td>
                </tr>
              )}
              {!historyLoading && filteredHistoryRows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-sm text-slate-400">
                    Nenhuma importação registrada ainda.
                  </td>
                </tr>
              )}
              {filteredHistoryRows.map((row) => (
                <tr key={row.id} className="hover:bg-slate-50/70">
                  <td className="px-4 py-2 text-xs text-slate-600 whitespace-nowrap">
                    {formatDate(row.created_at)}
                  </td>
                  <td className="px-4 py-2 text-sm font-medium text-slate-800">
                    {IMPORT_HISTORY_LABELS[row.source_type] || row.source_type}
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-600 max-w-[220px] truncate" title={row.file_name || ''}>
                    {row.file_name || '—'}
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-600">{periodoHistorico(row)}</td>
                  <td className="px-4 py-2 text-sm text-right text-slate-700 tabular-nums">
                    {row.records_count ?? '—'}
                  </td>
                  <td className="px-4 py-2 text-sm text-right font-semibold text-slate-800 tabular-nums">
                    {row.total_amount != null ? formatCurrency(Number(row.total_amount)) : '—'}
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-600">
                    <span className="font-medium text-slate-700">{row.user_name || '—'}</span>
                    {row.user_email ? <span className="block text-slate-400">{row.user_email}</span> : null}
                  </td>
                  <td className="px-4 py-2">
                    {row.status === 'success' ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-2 py-0.5">
                        <CheckCircle2 className="w-3 h-3" />
                        Sucesso
                      </span>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-red-700 bg-red-50 border border-red-100 rounded-full px-2 py-0.5"
                        title={row.error_message || 'Erro na importação'}
                      >
                        <AlertTriangle className="w-3 h-3" />
                        Erro
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {canUndoImport(row) ? (
                      <button
                        type="button"
                        onClick={() => openUndoModal(row)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-red-200 bg-red-50 text-[11px] font-bold text-red-700 hover:bg-red-100 transition-colors"
                        title="Desfazer esta importação e apagar os dados"
                      >
                        <Undo2 className="w-3.5 h-3.5" />
                        Desfazer
                      </button>
                    ) : (
                      <span
                        className="text-[11px] text-slate-400"
                        title={
                          row.source_type === 'crds'
                            ? 'Importação de CRDs não pode ser desfeita automaticamente'
                            : 'Sem competência suficiente para desfazer'
                        }
                      >
                        —
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {undoTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-[2px]">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="undo-import-title"
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-xl"
          >
            <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100">
              <div>
                <p id="undo-import-title" className="text-sm font-bold text-slate-900">
                  Desfazer importação
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Esta ação apaga os dados daquela importação e não pode ser revertida.
                </p>
              </div>
              <button
                type="button"
                onClick={closeUndoModal}
                disabled={undoLoading}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
                aria-label="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-3">
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
                <p className="font-bold flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {IMPORT_HISTORY_LABELS[undoTarget.source_type] || undoTarget.source_type}
                </p>
                <p className="mt-1 text-amber-800">
                  Período: <span className="font-semibold">{periodoHistorico(undoTarget)}</span>
                  {undoTarget.file_name ? (
                    <>
                      {' '}
                      · Arquivo: <span className="font-semibold">{undoTarget.file_name}</span>
                    </>
                  ) : null}
                </p>
                {undoTarget.status === 'error' ? (
                  <p className="mt-1 text-amber-700">
                    Este registro é só um erro no histórico — nenhum dado de sucesso será apagado.
                  </p>
                ) : (
                  <p className="mt-1 text-amber-700">
                    Serão apagados apenas os dados desta importação (período/escopo acima) — outras semanas ou o fechamento do mês não são afetados.
                  </p>
                )}
              </div>

              <label className="block">
                <span className="text-xs font-semibold text-slate-700">
                  Digite <span className="font-mono text-red-700">DESFAZER</span> para confirmar
                </span>
                <input
                  type="text"
                  value={undoConfirmText}
                  onChange={(e) => setUndoConfirmText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void confirmUndoImport();
                    }
                  }}
                  disabled={undoLoading}
                  autoFocus
                  placeholder="DESFAZER"
                  className="mt-1.5 w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-sm font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-300 disabled:opacity-60"
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>

              {undoError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {undoError}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100 bg-slate-50/80 rounded-b-2xl">
              <button
                type="button"
                onClick={closeUndoModal}
                disabled={undoLoading}
                className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void confirmUndoImport()}
                disabled={undoLoading || undoConfirmText.trim() !== 'DESFAZER'}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-red-600 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {undoLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Undo2 className="w-3.5 h-3.5" />}
                Confirmar desfazer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
