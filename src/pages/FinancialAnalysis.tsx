import React, { useState } from 'react';
import { 
  BarChart3, 
  TrendingUp, 
  TrendingDown, 
  Filter, 
  Download,
  ChevronDown,
  Search
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts';
import { cn, formatCurrency, formatPercent } from '../lib/utils';
import { ValueTrace } from '../components/ValueTrace';

const analysisData = [
  { category: 'Receitas', valor: 265000, av: 100, ah: 5.2 },
  { category: 'Custos Variáveis', valor: -115000, av: 43.4, ah: 2.1 },
  { category: 'Impostos', valor: -26500, av: 10, ah: 0.5 },
  { category: 'Lucro Bruto', valor: 123500, av: 46.6, ah: 8.4 },
  { category: 'Despesas Fixas', valor: -46000, av: 17.4, ah: -1.2 },
  { category: 'EBITDA', valor: 77500, av: 29.2, ah: 12.5 },
];

export const FinancialAnalysisPage: React.FC = () => {
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Análise Financeira</h2>
          <p className="text-slate-500 text-sm">Visão analítica de resultados operacionais e indicadores de performance.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 bg-white border border-slate-200 px-4 py-2.5 rounded-xl shadow-sm text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors">
            <Filter className="w-4 h-4" />
            <span>Filtros Avançados</span>
          </button>
          <button className="flex items-center gap-2 bg-[#004D40] text-white px-4 py-2.5 rounded-xl shadow-lg shadow-emerald-900/10 hover:bg-[#003d33] transition-colors">
            <Download className="w-4 h-4" />
            <span className="text-sm font-bold">Relatório PDF</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Margem de Contribuição</p>
              <p className="text-xl font-bold text-slate-900">56.6%</p>
            </div>
          </div>
          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
            <div className="bg-emerald-500 h-full w-[56.6%]"></div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600">
              <BarChart3 className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ponto de Equilíbrio</p>
              <ValueTrace className="text-xl font-bold text-slate-900" displayValue={formatCurrency(185000)} source="Análise financeira" calculation="Ponto de equilíbrio calculado para o período" />
            </div>
          </div>
          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
            <div className="bg-blue-500 h-full w-[72%]"></div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center text-orange-600">
              <TrendingDown className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Geração de Caixa</p>
              <ValueTrace className="text-xl font-bold text-slate-900" displayValue={formatCurrency(62000)} source="Análise financeira" calculation="Geração de caixa calculada no período" />
            </div>
          </div>
          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
            <div className="bg-orange-500 h-full w-[45%]"></div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-6">Análise de Margem por Categoria</h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analysisData} layout="vertical" margin={{ left: 40 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                <XAxis type="number" hide />
                <YAxis 
                  dataKey="category" 
                  type="category" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#64748b', fontSize: 12 }}
                />
                <Tooltip 
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="valor" radius={[0, 4, 4, 0]} barSize={24}>
                  {analysisData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.valor > 0 ? '#10b981' : '#f43f5e'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-50 flex items-center justify-between">
            <h3 className="font-bold text-slate-800">Resultado Operacional (AV/AH)</h3>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input 
                type="text" 
                placeholder="Buscar..."
                className="pl-9 pr-4 py-1.5 bg-slate-50 border-none rounded-lg text-xs focus:ring-2 focus:ring-emerald-500/20 transition-all"
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50">
                  <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Categoria</th>
                  <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Valor</th>
                  <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">AV (%)</th>
                  <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">AH (%)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {analysisData.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-3 text-sm font-medium text-slate-700">{item.category}</td>
                    <td className={cn(
                      "px-6 py-3 text-sm text-right tabular-nums font-bold",
                      item.valor < 0 ? "text-red-500" : "text-slate-900"
                    )}>
                      <ValueTrace
                        displayValue={formatCurrency(Math.abs(item.valor))}
                        source={`Categoria ${item.category}`}
                        calculation="Valor absoluto da linha de resultado operacional"
                      />
                    </td>
                    <td className="px-6 py-3 text-sm text-right text-slate-500">{item.av}%</td>
                    <td className={cn(
                      "px-6 py-3 text-sm text-right font-bold",
                      item.ah > 0 ? "text-emerald-600" : "text-red-500"
                    )}>
                      {item.ah > 0 ? '+' : ''}{item.ah}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
