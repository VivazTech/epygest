import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Upload,
  Store,
  TrendingUp,
  Receipt,
  Users,
  RefreshCw,
  FileSpreadsheet,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from 'recharts';
import { cn, formatCurrency } from '../lib/utils';
import { useToast } from '../context/ToastContext';
import { useCompany } from '../context/CompanyContext';

const MONTH_LABELS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const PIE_COLORS = ['#C2410C', '#F97316', '#FB923C', '#FDBA74', '#EA580C', '#9A3412', '#FED7AA', '#7C2D12'];
const AMBIENTE_LINE_COLORS = [
  '#EA580C', '#0284C7', '#16A34A', '#9333EA', '#DC2626', '#CA8A04',
  '#0891B2', '#DB2777', '#4F46E5', '#65A30D', '#C2410C', '#0F766E',
];

type DashboardPayload = {
  year: number;
  month: number;
  summary: {
    total_liquido: number;
    total_bruto: number;
    total_desconto: number;
    total_quantidade: number;
    ambientes_count: number;
    ticket_medio_geral: number;
    has_data: boolean;
  };
  by_ambiente: Array<{
    ambiente: string;
    quantidade: number;
    valor_liquido: number;
    ticket_medio: number;
    share: number;
  }>;
  serie_anual: Array<{
    month: number;
    name: string;
    total: number;
    quantidade: number;
  }>;
  comparativo_mensal?: {
    ambientes: string[];
    series: Array<{ ambiente: string; months: number[]; total: number }>;
    chart: Array<Record<string, string | number>>;
  };
};

export const VendasPdvsPage: React.FC = () => {
  const { showSuccess } = useToast();
  const { companyKey } = useCompany();
  const fileRef = useRef<HTMLInputElement>(null);
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/vendas-ambiente?year=${year}&month=${month}`);
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Falha ao carregar vendas');
      setData(json);
      // Se o mês selecionado está vazio mas o ano tem importações, vai para o último mês com dados
      const serie = Array.isArray(json?.serie_anual) ? json.serie_anual : [];
      const monthsWithData = serie.filter((s: any) => Number(s.total) > 0).map((s: any) => Number(s.month));
      if ((!json?.by_ambiente || json.by_ambiente.length === 0) && monthsWithData.length > 0 && !monthsWithData.includes(month)) {
        setMonth(Math.max(...monthsWithData));
      }
    } catch (err: any) {
      alert(err.message || 'Não foi possível carregar os dados de PDVs.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    if (companyKey !== 'aqua') return;
    loadDashboard();
  }, [companyKey, loadDashboard]);

  const handlePickFile = async (file: File) => {
    setUploading(true);
    setPreview(null);
    setPendingFile(file);
    try {
      const form = new FormData();
      form.append('vendas_file', file);
      form.append('month', String(month));
      form.append('year', String(year));
      const res = await fetch('/api/import/vendas-ambiente/preview', { method: 'POST', body: form });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Falha ao ler o relatório');
      setPreview(json);
      if (json.period?.month) setMonth(Number(json.period.month));
      if (json.period?.year) setYear(Number(json.period.year));
    } catch (err: any) {
      setPendingFile(null);
      alert(err.message || 'Não foi possível processar o arquivo.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleCommit = async () => {
    if (!pendingFile) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('vendas_file', pendingFile);
      form.append('month', String(preview?.period?.month || month));
      form.append('year', String(preview?.period?.year || year));
      const res = await fetch('/api/import/vendas-ambiente/commit', { method: 'POST', body: form });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Falha ao importar');
      showSuccess(
        `Importação concluída: ${json.summary?.ambientes_count ?? 0} ambientes · ${formatCurrency(Number(json.summary?.total_liquido || 0))}`
      );
      setPreview(null);
      setPendingFile(null);
      if (json.period?.month) setMonth(Number(json.period.month));
      if (json.period?.year) setYear(Number(json.period.year));
      await loadDashboard();
    } catch (err: any) {
      alert(err.message || 'Não foi possível gravar a importação.');
    } finally {
      setUploading(false);
    }
  };

  const summary = data?.summary;
  const chartAmbientes = useMemo(
    () =>
      (data?.by_ambiente ?? []).slice(0, 12).map((row) => ({
        name: row.ambiente.length > 18 ? `${row.ambiente.slice(0, 16)}…` : row.ambiente,
        fullName: row.ambiente,
        valor: Number(row.valor_liquido) || 0,
        quantidade: Number(row.quantidade) || 0,
      })),
    [data]
  );

  const pieData = useMemo(
    () =>
      (data?.by_ambiente ?? []).slice(0, 8).map((row) => ({
        name: row.ambiente,
        value: Number(row.valor_liquido) || 0,
      })),
    [data]
  );

  const serieAnual = useMemo(
    () =>
      (data?.serie_anual ?? []).map((row) => ({
        name: row.name.slice(0, 3),
        total: Number(row.total) || 0,
      })),
    [data]
  );

  const comparativo = data?.comparativo_mensal;
  const ambientesComparativo = comparativo?.ambientes ?? [];
  const chartComparativo = comparativo?.chart ?? [];
  // No gráfico, limita a 10 ambientes para legibilidade (ordenados por total no ano)
  const ambientesNoGrafico = ambientesComparativo.slice(0, 10);
  const seriesComparativo = comparativo?.series ?? [];

  if (companyKey !== 'aqua') {
    return (
      <div className="bg-white border border-slate-100 rounded-2xl p-8 text-center text-slate-500">
        A sessão <strong>Vendas / PDVs</strong> está disponível apenas na empresa Aquamania.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Vendas · PDVs</h2>
          <p className="text-sm text-slate-500 mt-1">
            Importe o relatório Desbravador <span className="font-medium text-slate-700">Vendas por Ambiente MesAno</span> (PDF ou Excel) e acompanhe o desempenho por PDV.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm"
          >
            {MONTH_LABELS.map((label, idx) => (
              <option key={label} value={idx + 1}>{label}</option>
            ))}
          </select>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm"
          >
            {[...new Set([year - 1, year, year + 1, new Date().getFullYear()])].sort((a, b) => a - b).map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => loadDashboard()}
            className="inline-flex items-center gap-2 px-3 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50"
          >
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
            Atualizar
          </button>
          <label
            className={cn(
              'inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white cursor-pointer transition-colors',
              uploading ? 'bg-orange-400' : 'bg-orange-600 hover:bg-orange-500'
            )}
          >
            <Upload className="w-4 h-4" />
            {uploading ? 'Processando…' : 'Enviar Vendas por Ambiente'}
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.xls,.xlsx,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handlePickFile(file);
              }}
            />
          </label>
        </div>
      </div>

      {preview && (() => {
        const parsedTotal = Number(preview.summary?.total_liquido || 0);
        const reportedTotal =
          preview.total_geral_reported != null ? Number(preview.total_geral_reported) : null;
        const diff = reportedTotal != null ? parsedTotal - reportedTotal : null;
        const confere = diff != null && Math.abs(diff) < 0.01;
        return (
          <div className="bg-orange-50 border border-orange-200 rounded-2xl p-5 space-y-4">
            <div className="flex items-start gap-3">
              <FileSpreadsheet className="w-5 h-5 text-orange-700 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-orange-950 truncate">Conferência · {preview.report_name}</p>
                <p className="text-sm text-orange-800 mt-1">
                  {preview.period
                    ? `${MONTH_LABELS[(preview.period.month || 1) - 1]}/${preview.period.year}`
                    : 'Período não detectado — confirme mês/ano acima'}
                  {' · '}
                  {preview.summary?.ambientes_count ?? 0} ambientes / PDVs
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => { setPreview(null); setPendingFile(null); }}
                  className="px-3 py-2 text-sm rounded-xl border border-orange-200 text-orange-800 hover:bg-orange-100"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={uploading}
                  onClick={handleCommit}
                  className="px-4 py-2 text-sm font-semibold rounded-xl bg-orange-600 text-white hover:bg-orange-500 disabled:opacity-60"
                >
                  {uploading ? 'Salvando…' : 'Salvar importação'}
                </button>
              </div>
            </div>

            {/* Conferência de totais: soma das linhas x Total Geral impresso no relatório */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-xl bg-white/70 border border-orange-100 px-3 py-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-orange-400">Soma importada</p>
                <p className="text-lg font-bold text-slate-900">{formatCurrency(parsedTotal)}</p>
              </div>
              <div className="rounded-xl bg-white/70 border border-orange-100 px-3 py-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-orange-400">Total geral (relatório)</p>
                <p className="text-lg font-bold text-slate-900">
                  {reportedTotal != null ? formatCurrency(reportedTotal) : '—'}
                </p>
              </div>
              <div
                className={cn(
                  'rounded-xl border px-3 py-2',
                  reportedTotal == null
                    ? 'bg-white/70 border-orange-100'
                    : confere
                      ? 'bg-emerald-50 border-emerald-200'
                      : 'bg-red-50 border-red-200'
                )}
              >
                <p className={cn(
                  'text-[10px] font-bold uppercase tracking-wider',
                  reportedTotal == null ? 'text-orange-400' : confere ? 'text-emerald-600' : 'text-red-500'
                )}>
                  Conferência
                </p>
                <p className={cn(
                  'text-sm font-bold',
                  reportedTotal == null ? 'text-slate-500' : confere ? 'text-emerald-700' : 'text-red-700'
                )}>
                  {reportedTotal == null
                    ? 'Total geral não localizado'
                    : confere
                      ? 'Confere ✓'
                      : `Diferença ${formatCurrency(diff!)}`}
                </p>
              </div>
            </div>

            {Array.isArray(preview.lines) && preview.lines.length > 0 && (
              <div className="overflow-x-auto max-h-72 rounded-xl border border-orange-100 bg-white/70">
                <table className="w-full text-left text-xs">
                  <thead className="bg-orange-100/60 text-orange-900 sticky top-0">
                    <tr>
                      <th className="px-3 py-2">Cód.</th>
                      <th className="px-3 py-2">Ambiente / PDV</th>
                      <th className="px-3 py-2 text-right">Qt. Pessoas</th>
                      <th className="px-3 py-2 text-right">Líquido</th>
                      <th className="px-3 py-2 text-right">Ticket méd.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.lines.map((line: any, idx: number) => (
                      <tr key={`${line.ambiente}-${idx}`} className="border-t border-orange-50">
                        <td className="px-3 py-1.5 text-slate-500 tabular-nums">{line.ambiente_codigo || '—'}</td>
                        <td className="px-3 py-1.5 text-slate-700">{line.ambiente}</td>
                        <td className="px-3 py-1.5 text-right text-slate-600 tabular-nums">{Number(line.quantidade || 0).toLocaleString('pt-BR')}</td>
                        <td className="px-3 py-1.5 text-right font-medium text-slate-800 tabular-nums">{formatCurrency(Number(line.valor_liquido || 0))}</td>
                        <td className="px-3 py-1.5 text-right text-slate-600 tabular-nums">{formatCurrency(Number(line.ticket_medio || 0))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })()}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: 'Faturamento líquido', value: formatCurrency(summary?.total_liquido || 0), icon: TrendingUp },
          { label: 'PDVs / Ambientes', value: String(summary?.ambientes_count || 0), icon: Store },
          { label: 'Quantidade (cupons)', value: (summary?.total_quantidade || 0).toLocaleString('pt-BR'), icon: Receipt },
          { label: 'Ticket médio', value: formatCurrency(summary?.ticket_medio_geral || 0), icon: Users },
        ].map((card) => (
          <div key={card.label} className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{card.label}</p>
              <card.icon className="w-4 h-4 text-orange-600" />
            </div>
            <p className="text-2xl font-bold text-slate-900">{card.value}</p>
          </div>
        ))}
      </div>

      {!summary?.has_data && !loading && (
        <div className="bg-slate-50 border border-dashed border-slate-200 rounded-2xl p-8 text-center text-slate-500 text-sm">
          Nenhum relatório importado para {MONTH_LABELS[month - 1]}/{year}.
          <br />
          Clique em <strong>Enviar Vendas por Ambiente</strong> e selecione o Excel do Desbravador.
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        <div className="xl:col-span-3 bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
          <h3 className="text-sm font-bold text-slate-800 mb-4">Vendas por ambiente</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartAmbientes} margin={{ top: 8, right: 8, left: 0, bottom: 48 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} interval={0} angle={-25} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
                <Tooltip
                  formatter={(value: any) => formatCurrency(Number(value) || 0)}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName || ''}
                />
                <Bar dataKey="valor" fill="#EA580C" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="xl:col-span-2 bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
          <h3 className="text-sm font-bold text-slate-800 mb-4">Participação no faturamento</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
                  {pieData.map((_, idx) => (
                    <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: any) => formatCurrency(Number(value) || 0)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm">
        <h3 className="text-sm font-bold text-slate-800 mb-4">Série mensal {year}</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={serieAnual}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`} />
              <Tooltip formatter={(value: any) => formatCurrency(Number(value) || 0)} />
              <Bar dataKey="total" fill="#C2410C" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-sm space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Comparativo por ambiente · mês a mês</h3>
              <p className="text-xs text-slate-500 mt-1">
                Evolução de cada PDV ao longo de {year} (ex.: Bilheteria em jan, fev, mar…).
                {ambientesComparativo.length > 10
                  ? ` Gráfico: top 10 por faturamento · tabela com todos os ${ambientesComparativo.length}.`
                  : null}
              </p>
            </div>
          </div>

          {ambientesComparativo.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              Ainda não há importações em {year} para montar o comparativo.
              <br />
              Importe o relatório de cada mês (jan, fev, mar…) — o gráfico e a tabela preenchem automaticamente.
            </div>
          ) : (
            <>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartComparativo} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#64748b' }}
                      tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`}
                    />
                    <Tooltip
                      formatter={(value: any, name: any) => [formatCurrency(Number(value) || 0), String(name)]}
                      labelFormatter={(label, payload) => {
                        const full = payload?.[0]?.payload?.name_full;
                        return full ? String(full) : String(label);
                      }}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                      iconType="circle"
                    />
                    {ambientesNoGrafico.map((ambiente, idx) => (
                      <Line
                        key={ambiente}
                        type="monotone"
                        dataKey={ambiente}
                        name={ambiente}
                        stroke={AMBIENTE_LINE_COLORS[idx % AMBIENTE_LINE_COLORS.length]}
                        strokeWidth={2.2}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-100">
                <table className="w-full text-left min-w-[900px]">
                  <thead>
                    <tr className="bg-slate-50/80">
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 sticky left-0 bg-slate-50/95">
                        Ambiente / PDV
                      </th>
                      {MONTH_LABELS.map((label) => (
                        <th
                          key={label}
                          className="px-3 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 text-right whitespace-nowrap"
                        >
                          {label.slice(0, 3)}
                        </th>
                      ))}
                      <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-orange-500 text-right">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {seriesComparativo.map((row) => (
                      <tr key={row.ambiente} className="hover:bg-slate-50/60">
                        <td className="px-4 py-2.5 text-sm font-medium text-slate-800 sticky left-0 bg-white">
                          {row.ambiente}
                        </td>
                        {row.months.map((valor, idx) => (
                          <td
                            key={`${row.ambiente}-${idx}`}
                            className={cn(
                              'px-3 py-2.5 text-xs text-right tabular-nums',
                              valor > 0 ? 'text-slate-700' : 'text-slate-300'
                            )}
                          >
                            {valor > 0 ? formatCurrency(valor) : '—'}
                          </td>
                        ))}
                        <td className="px-4 py-2.5 text-sm font-semibold text-orange-700 text-right tabular-nums">
                          {formatCurrency(row.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

      {(data?.by_ambiente?.length ?? 0) > 0 && (
        <div className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/80">
                <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Ambiente / PDV</th>
                <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 text-right">Qtd</th>
                <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 text-right">Líquido</th>
                <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 text-right">Ticket médio</th>
                <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 text-right">Share</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {data!.by_ambiente.map((row) => (
                <tr key={row.ambiente} className="hover:bg-slate-50/60">
                  <td className="px-5 py-3 text-sm font-medium text-slate-800">{row.ambiente}</td>
                  <td className="px-5 py-3 text-sm text-slate-600 text-right">{row.quantidade.toLocaleString('pt-BR')}</td>
                  <td className="px-5 py-3 text-sm font-semibold text-slate-900 text-right">{formatCurrency(row.valor_liquido)}</td>
                  <td className="px-5 py-3 text-sm text-slate-600 text-right">{formatCurrency(row.ticket_medio)}</td>
                  <td className="px-5 py-3 text-sm text-orange-700 text-right">{row.share.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
