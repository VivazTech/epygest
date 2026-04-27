import React, { useEffect, useMemo, useState } from 'react';
import { Search, RefreshCcw } from 'lucide-react';
import { formatCurrency } from '../lib/utils';

type SintaseApiResponse = {
  year: number;
  rows: Array<{
    id: number;
    crd: string;
    grupo: string;
    detalhado: string;
    months: number[];
    total: number;
  }>;
  totals: {
    months: number[];
    total: number;
  };
};

const monthHeaders = ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8', 'M9', 'M10', 'M11', 'M12'];

export const SintasePage: React.FC = () => {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(String(currentYear));
  const [crdFilter, setCrdFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SintaseApiResponse | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('year', year);
      if (crdFilter.trim()) params.set('crd', crdFilter.trim());
      const res = await fetch(`/api/sintase?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) {
        alert(json.error || 'Erro ao carregar Síntase');
        setLoading(false);
        return;
      }
      setData(json);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalRows = useMemo(() => data?.rows?.length || 0, [data]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-bold text-slate-900">Síntase de CRDs</h2>
        <p className="text-sm text-slate-500">
          Lista de CRDs por grupo com orçamento anual (M1 a M12), total por linha e total mensal na última linha.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={crdFilter}
            onChange={(e) => setCrdFilter(e.target.value)}
            placeholder="Filtro por CRD, grupo ou detalhado"
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
          />
        </div>
        <input
          type="number"
          min={2000}
          max={2100}
          value={year}
          onChange={(e) => setYear(e.target.value)}
          className="w-28 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
        />
        <button
          onClick={loadData}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 bg-[#004D40] text-white text-sm font-bold rounded-xl hover:bg-[#003d33] disabled:opacity-60"
        >
          <RefreshCcw className="w-4 h-4" />
          {loading ? 'Atualizando...' : 'Atualizar'}
        </button>
        <span className="text-xs text-slate-500">Total de linhas: {totalRows}</span>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-auto">
        <table className="w-full text-left border-collapse min-w-[1600px]">
          <thead>
            <tr className="bg-slate-50/70">
              <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">CRD</th>
              <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Grupo</th>
              <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Detalhado</th>
              {monthHeaders.map((month) => (
                <th key={month} className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">
                  {month}
                </th>
              ))}
              <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(data?.rows || []).map((row) => (
              <tr key={row.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="px-4 py-3 text-xs font-bold text-slate-700">{row.crd}</td>
                <td className="px-4 py-3 text-xs text-slate-600">{row.grupo}</td>
                <td className="px-4 py-3 text-sm text-slate-700">{row.detalhado}</td>
                {row.months.map((value, index) => (
                  <td key={`${row.id}-${index}`} className="px-4 py-3 text-xs text-right text-slate-700">
                    {formatCurrency(value || 0)}
                  </td>
                ))}
                <td className="px-4 py-3 text-xs text-right font-bold text-slate-900">{formatCurrency(row.total || 0)}</td>
              </tr>
            ))}
            <tr className="bg-emerald-50/50 border-t border-emerald-100">
              <td className="px-4 py-3 text-xs font-bold text-emerald-800" colSpan={3}>
                Total por mês ({data?.year || currentYear})
              </td>
              {(data?.totals?.months || Array.from({ length: 12 }, () => 0)).map((value, index) => (
                <td key={`total-${index}`} className="px-4 py-3 text-xs text-right font-bold text-emerald-800">
                  {formatCurrency(value || 0)}
                </td>
              ))}
              <td className="px-4 py-3 text-xs text-right font-extrabold text-emerald-900">
                {formatCurrency(data?.totals?.total || 0)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};
