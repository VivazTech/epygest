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
} from 'lucide-react';
import { formatCurrency, formatApiError, formatDate } from '../lib/utils';
import { useSearch } from '../context/SearchContext';
import { matchesSearch } from '../lib/search';

// Fontes de importação a configurar (somente os cards por enquanto; a configuração vem depois).
const IMPORT_SOURCES = [
  {
    key: 'consumo_interno',
    title: 'Consumo interno',
    description: 'Relatório de consumo interno por setor e mês.',
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
};

type ImportHistoryRow = {
  id: number;
  source_type: string;
  file_name?: string | null;
  status: 'success' | 'error';
  year?: number | null;
  month?: number | null;
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
  salario: number;
  proventos: number;
  descontos: number;
  liquido: number;
  base_inss: number;
  base_fgts: number;
  base_irrf: number;
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

export const ImportacaoPage: React.FC = () => {
  const { query } = useSearch();
  const [historyRows, setHistoryRows] = useState<ImportHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [historyFilter, setHistoryFilter] = useState('');
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

  const commitConsumoInterno = async () => {
    if (consumoCommitting || !consumoFile) return;
    if (!consumoPeriod) {
      alert('Não foi possível detectar o mês do relatório.');
      return;
    }
    setConsumoCommitting(true);
    setConsumoCommitMsg('');
    const formData = new FormData();
    formData.append('consumo_file', consumoFile);
    formData.append('month', String(consumoPeriod.month));
    formData.append('year', String(consumoPeriod.year));
    try {
      const res = await fetch('/api/import/consumo-interno/commit', { method: 'POST', body: formData });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(formatApiError(data, 'Falha ao enviar para Prev x Real.'));
        return;
      }
      setConsumoCommitMsg(
        `Enviado: ${formatCurrency(data.total)} → ${data.destino.setor} › ${data.destino.conta} › Real de ${periodoLabel(data.period)}.`
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

  const commitExtratoToFolha = async () => {
    if (extratoCommitting || !extratoFile) return;
    const mes = Number(extratoMonth);
    const ano = Number(extratoYear);
    if (!mes || mes < 1 || mes > 12 || !ano) {
      alert('Selecione o mês (e ano) para enviar à Folha de Pagamento.');
      return;
    }
    setExtratoCommitting(true);
    setExtratoCommitMsg('');
    const formData = new FormData();
    formData.append('extrato_file', extratoFile);
    formData.append('month', String(mes));
    formData.append('year', String(ano));
    try {
      const res = await fetch('/api/folha/import', { method: 'POST', body: formData });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(formatApiError(data, 'Falha ao enviar para a Folha de Pagamento.'));
        return;
      }
      setExtratoCommitMsg(
        `Enviado: ${data.funcionarios} funcionário(s), ${data.rubricas ?? 0} rubrica(s)` +
          (data.rubricas_cadastradas ? `, ${data.rubricas_cadastradas} nova(s) no cadastro de apuração` : '') +
          ` → Folha de Pagamento › ${periodoLabel({ month: mes, year: ano })}.` +
          ` Vá em Folha › Apuração de Folha, selecione o mês e clique em Processar mês.` +
          (data.realizado
            ? ` Líquido ${formatCurrency(data.realizado.valor)} lançado no Real de RH › Folha de pagamento.`
            : '')
      );
      loadImportHistory();
    } finally {
      setExtratoCommitting(false);
    }
  };

  // Estado da pré-visualização do Rel. CRD (somente exibição por enquanto).
  const [relCrdLoading, setRelCrdLoading] = useState(false);
  const [relCrdFileName, setRelCrdFileName] = useState('');
  const [relCrdError, setRelCrdError] = useState('');
  const [relCrdAccounts, setRelCrdAccounts] = useState<RelCrdAccount[]>([]);
  const [relCrdSummary, setRelCrdSummary] = useState<RelCrdSummary | null>(null);

  // Estado da pré-visualização da Provisão de Férias (somente exibição — destino ainda não definido).
  const [provisaoFeriasLoading, setProvisaoFeriasLoading] = useState(false);
  const [provisaoFeriasFileName, setProvisaoFeriasFileName] = useState('');
  const [provisaoFeriasError, setProvisaoFeriasError] = useState('');
  const [provisaoFeriasTotals, setProvisaoFeriasTotals] = useState<ProvisaoFeriasTotals | null>(null);
  const [provisaoFeriasPeriod, setProvisaoFeriasPeriod] = useState<{ month?: number; year?: number } | null>(null);

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
        return;
      }
      setProvisaoFeriasTotals(data.totals || null);
      setProvisaoFeriasPeriod(data.period || null);
    } catch (err: any) {
      setProvisaoFeriasError(err?.message || 'Erro inesperado ao importar o arquivo.');
    } finally {
      setProvisaoFeriasLoading(false);
      event.target.value = '';
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

  const periodoHistorico = (row: ImportHistoryRow) => {
    if (!row.year) return '—';
    if (row.month && row.month >= 1 && row.month <= 12) return `${MESES[row.month]}/${row.year}`;
    return String(row.year);
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
  const filteredRelCrdAccounts = useMemo(
    () =>
      relCrdAccounts.filter((acc) =>
        matchesSearch(query, acc.codigo, acc.nome, acc.lancamentos, acc.lanc_liquido)
      ),
    [relCrdAccounts, query]
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
      setRelCrdAccounts(Array.isArray(data.accounts) ? data.accounts : []);
      setRelCrdSummary(data.summary || null);
    } catch (err: any) {
      setRelCrdError(err?.message || 'Erro inesperado ao importar o arquivo.');
    } finally {
      setRelCrdLoading(false);
      if (event?.target) event.target.value = '';
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
      setExtratoEmployees(Array.isArray(data.employees) ? data.employees : []);
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
                  {source.key === 'consumo_interno' || source.key === 'extrato_mensal' || source.key === 'rel_crd' || source.key === 'provisao_ferias' ? (
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
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/60 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-slate-600 space-y-0.5">
                <p>
                  Mês detectado: <span className="font-bold text-slate-900">{periodoLabel(consumoPeriod)}</span>
                  <span className="mx-2 text-slate-300">|</span>
                  Total a enviar: <span className="font-bold text-slate-900">{formatCurrency(consumoSummary.total_liquido)}</span>
                </p>
                <p className="text-[11px] text-slate-500">
                  Destino: Prev x Real › <b>{consumoDestino?.setor ?? 'Controle'}</b> › <b>{consumoDestino?.conta ?? 'CONSUMO INTERNO (SEM CRD)'}</b> › Real
                </p>
                {consumoCommitMsg && (
                  <p className="text-[11px] font-semibold text-emerald-700 inline-flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> {consumoCommitMsg}
                  </p>
                )}
              </div>
              <button
                onClick={commitConsumoInterno}
                disabled={consumoCommitting || !consumoPeriod}
                title={!consumoPeriod ? 'Mês não detectado no relatório' : 'Envia o total como realizado do mês'}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#004D40] text-white text-sm font-bold hover:bg-[#003d33] disabled:opacity-60 transition-colors"
              >
                {consumoCommitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRightCircle className="w-4 h-4" />}
                {consumoCommitting ? 'Enviando...' : 'Enviar para Prev x Real'}
              </button>
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

          {/* Envio para a Folha de Pagamento do mês (detectado ou selecionado — obrigatório) */}
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
                  Destino: <b>Folha de Pagamento</b> › {extratoMonth ? periodoLabel({ month: Number(extratoMonth), year: Number(extratoYear) }) : '—'} (substitui a folha do mês).
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
                {extratoCommitting ? 'Enviando...' : 'Enviar para Folha de Pagamento'}
              </button>
            </div>
          )}

          {extratoEmployees.length > 0 && (
            <div className="overflow-auto max-h-[520px]">
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
                  {filteredExtratoEmployees.map((emp, idx) => (
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
      )}

      {/* Pré-visualização do Rel. CRD (somente leitura por enquanto) */}
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

          {relCrdAccounts.length > 0 && (
            <div className="overflow-auto max-h-[520px]">
              <table className="w-full text-left border-collapse min-w-[1150px]">
                <thead className="sticky top-0">
                  <tr className="bg-slate-50 border-b border-slate-200">
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
                  {filteredRelCrdAccounts.map((acc, idx) => (
                    <tr key={idx} className={`hover:bg-slate-50/70 ${acc.nivel === 1 ? 'bg-slate-100 font-bold' : acc.nivel === 2 ? 'bg-slate-50/60' : ''}`}>
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
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Pré-visualização da Provisão de Férias — apenas o resultado final do relatório (sem detalhe por funcionário). */}
      {(provisaoFeriasFileName || provisaoFeriasError) && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap gap-3 items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#004D40]" />
              <p className="text-sm font-bold text-slate-800">
                Provisão Férias — resultado final
                {provisaoFeriasPeriod?.month && provisaoFeriasPeriod?.year
                  ? ` (${periodoLabel({ month: provisaoFeriasPeriod.month, year: provisaoFeriasPeriod.year })})`
                  : ''}
              </p>
            </div>
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
            <div className="p-4">
              <p className="text-xs text-slate-500 mb-3">
                Apenas o resultado final do relatório foi extraído. O destino de lançamento ainda não foi definido — os
                valores ficam disponíveis aqui para decisão posterior.
              </p>
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
        </div>
      )}

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
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {historyLoading && filteredHistoryRows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-400">
                    <Loader2 className="w-5 h-5 animate-spin inline-block mr-2" />
                    Carregando histórico...
                  </td>
                </tr>
              )}
              {!historyLoading && filteredHistoryRows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-400">
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
