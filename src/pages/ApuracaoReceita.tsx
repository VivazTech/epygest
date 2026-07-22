import React, { useEffect, useMemo, useState } from 'react';
import { Calculator, Loader2, RefreshCcw, TrendingUp } from 'lucide-react';
import { formatCurrency } from '../lib/utils';
import { ValueTrace } from '../components/ValueTrace';
import { valueTrace } from '../lib/valueTraceMeta';

const MONTH_LABELS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

type MonthRow = {
  month: number;
  label: string;
  receita: number;
  despesa: number;
  resultado: number;
};

export const ApuracaoReceitaPage: React.FC = () => {
  const now = new Date();
  const [year, setYear] = useState(String(now.getFullYear()));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [rows, setRows] = useState<MonthRow[]>([]);

  const yearOptions = useMemo(() => {
    const current = now.getFullYear();
    return Array.from({ length: 6 }, (_, i) => String(current - 2 + i));
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/apuracao/receita?year=${encodeURIComponent(year)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Não foi possível carregar a apuração de receita.');
      }
      setRows(Array.isArray(data.months) ? data.months : []);
    } catch (err: any) {
      setRows([]);
      setError(err?.message || 'Erro ao carregar apuração de receita.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, row) => ({
          receita: acc.receita + row.receita,
          despesa: acc.despesa + row.despesa,
          resultado: acc.resultado + row.resultado,
        }),
        { receita: 0, despesa: 0, resultado: 0 }
      ),
    [rows]
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Apuração de Receita</h2>
          <p className="text-slate-500 text-sm">
            Consolida receitas e despesas por mês a partir dos registros financeiros do ano selecionado.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 shadow-sm"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
            Atualizar
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Receita anual</p>
          <p className="text-xl font-extrabold text-slate-900 mt-1">
            <ValueTrace
              displayValue={formatCurrency(totals.receita)}
              meta={valueTrace.dashboard.indicator('receitaAcumulada', `Receita ${year}`)}
            />
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Despesa anual</p>
          <p className="text-xl font-extrabold text-slate-900 mt-1">{formatCurrency(totals.despesa)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
            <TrendingUp className="w-3 h-3" /> Resultado
          </p>
          <p className={cnResult(totals.resultado)}>
            {formatCurrency(totals.resultado)}
          </p>
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
          {error}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[640px]">
          <thead>
            <tr className="bg-slate-50/50">
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Mês</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Receita</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Despesa</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Resultado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading && rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-10 text-center text-sm text-slate-400">
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Carregando apuração...
                  </span>
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-10 text-center text-sm text-slate-400">
                  Nenhum lançamento financeiro encontrado para {year}.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.month} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-6 py-3 text-sm font-medium text-slate-800">
                  <span className="inline-flex items-center gap-2">
                    <Calculator className="w-3.5 h-3.5 text-slate-400" />
                    {String(row.month).padStart(2, '0')} · {row.label || MONTH_LABELS[row.month - 1]}
                  </span>
                </td>
                <td className="px-6 py-3 text-sm text-right tabular-nums text-emerald-700 font-semibold">
                  {formatCurrency(row.receita)}
                </td>
                <td className="px-6 py-3 text-sm text-right tabular-nums text-slate-600">
                  {formatCurrency(row.despesa)}
                </td>
                <td className={`px-6 py-3 text-sm text-right tabular-nums font-bold ${row.resultado < 0 ? 'text-red-600' : 'text-slate-900'}`}>
                  {formatCurrency(row.resultado)}
                </td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="bg-slate-50 border-t border-slate-200">
                <td className="px-6 py-3 text-sm font-bold text-slate-900">Total {year}</td>
                <td className="px-6 py-3 text-sm text-right tabular-nums font-bold text-emerald-700">
                  {formatCurrency(totals.receita)}
                </td>
                <td className="px-6 py-3 text-sm text-right tabular-nums font-bold text-slate-700">
                  {formatCurrency(totals.despesa)}
                </td>
                <td className={`px-6 py-3 text-sm text-right tabular-nums font-bold ${totals.resultado < 0 ? 'text-red-600' : 'text-slate-900'}`}>
                  {formatCurrency(totals.resultado)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
};

function cnResult(value: number) {
  return `text-xl font-extrabold mt-1 ${value < 0 ? 'text-red-600' : 'text-slate-900'}`;
}
