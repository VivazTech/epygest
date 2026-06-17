import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCcw, Upload, Loader2, CheckCircle2, AlertTriangle, Users } from 'lucide-react';
import { formatCurrency } from '../lib/utils';

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

interface FolhaPagamentoPageProps {
  month: number;
}

export const FolhaPagamentoPage: React.FC<FolhaPagamentoPageProps> = ({ month }) => {
  const [year, setYear] = useState('2026');
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [data, setData] = useState<FolhaResponse | null>(null);
  const [error, setError] = useState('');
  const [userRole, setUserRole] = useState('viewer');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/folha?year=${encodeURIComponent(year)}&month=${month}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Erro ao carregar a folha.');
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
  }, [loadData]);

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
        setError(json.error || 'Falha ao importar o Extrato.');
        return;
      }
      await loadData();
    } finally {
      setImporting(false);
      if (event?.target) event.target.value = '';
    }
  };

  const canImport = userRole === 'admin' || userRole === 'finance' || userRole === 'controle';
  const employees = data?.employees ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">
            Folha de Pagamento — {MESES_FOLHA[month]}/{data?.year ?? year}
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
