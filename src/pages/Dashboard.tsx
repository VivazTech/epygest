import React, { useEffect, useState } from 'react';
import { IndicatorCard } from '../components/IndicatorCard';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  LineChart, Line, AreaChart, Area, Cell, PieChart, Pie
} from 'recharts';
import { Calendar, Filter, ChevronDown, Download, ArrowUpRight } from 'lucide-react';
import { formatCurrency } from '../lib/utils';
import { ValueTrace } from '../components/ValueTrace';

const chartData = [
  { name: 'Jan', receita: 180000, despesa: 140000 },
  { name: 'Fev', receita: 210000, despesa: 155000 },
  { name: 'Mar', receita: 195000, despesa: 145000 },
  { name: 'Abr', receita: 240000, despesa: 170000 },
  { name: 'Mai', receita: 220000, despesa: 160000 },
  { name: 'Jun', receita: 280000, despesa: 190000 },
];

const pieData = [
  { name: 'Serviços', value: 45, color: '#10b981' },
  { name: 'Produtos', value: 35, color: '#3b82f6' },
  { name: 'Outros', value: 20, color: '#f59e0b' },
];

export const Dashboard: React.FC = () => {
  const [indicators, setIndicators] = useState<any>(null);

  useEffect(() => {
    fetch('/api/dashboard/indicators')
      .then(res => res.json())
      .then(data => setIndicators(data));
  }, []);

  if (!indicators) return <div className="p-8 text-slate-400">Carregando indicadores...</div>;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Resumo Executivo</h2>
          <p className="text-slate-500 text-sm">Acompanhe o desempenho financeiro em tempo real.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white border border-slate-200 px-4 py-2 rounded-xl shadow-sm cursor-pointer hover:bg-slate-50 transition-colors">
            <Calendar className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-medium text-slate-600">Março, 2024</span>
            <ChevronDown className="w-4 h-4 text-slate-400" />
          </div>
          <button className="p-2.5 bg-white border border-slate-200 rounded-xl shadow-sm hover:bg-slate-50 transition-colors">
            <Filter className="w-4 h-4 text-slate-500" />
          </button>
          <button className="flex items-center gap-2 bg-[#004D40] text-white px-4 py-2.5 rounded-xl shadow-lg shadow-emerald-900/10 hover:bg-[#003d33] transition-colors">
            <Download className="w-4 h-4" />
            <span className="text-sm font-bold">Exportar</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <IndicatorCard 
          title="Receita Mensal" 
          value={indicators.receitaMensal} 
          type="currency" 
          variation={8.2} 
          description="vs mês anterior"
          color="blue"
          traceSource="Tabela financial_records (type = revenue no mês)"
          traceCalculation="Soma de amount filtrado por mês/ano"
        />
        <IndicatorCard 
          title="Faturamento Acumulado" 
          value={indicators.faturamentoAcumulado} 
          type="currency" 
          variation={12.5} 
          description="vs ano anterior"
          color="green"
          traceSource="Tabela financial_records (type = revenue)"
          traceCalculation="Soma acumulada de receitas e ajuste de faturamento"
        />
        <IndicatorCard 
          title="Lucro Líquido" 
          value={indicators.lucro} 
          type="currency" 
          variation={-2.4} 
          description="vs meta projetada"
          color="orange"
          traceSource="Receita acumulada e despesas acumuladas"
          traceCalculation="(Receita - Despesas) * 0.8"
        />
        <IndicatorCard 
          title="Ticket Médio" 
          value={indicators.ticketMedio} 
          type="currency" 
          variation={5.1} 
          description="crescimento orgânico"
          traceSource="Indicador calculado na API"
          traceCalculation="Valor médio por venda definido no backend"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <h3 className="font-bold text-slate-800">Fluxo de Caixa (Realizado)</h3>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                <span className="text-xs font-medium text-slate-500">Receitas</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-slate-200"></div>
                <span className="text-xs font-medium text-slate-500">Despesas</span>
              </div>
            </div>
          </div>
          
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#94a3b8', fontSize: 12 }} 
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fill: '#94a3b8', fontSize: 12 }}
                />
                <Tooltip 
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="receita" fill="#10b981" radius={[4, 4, 0, 0]} barSize={32} />
                <Bar dataKey="despesa" fill="#e2e8f0" radius={[4, 4, 0, 0]} barSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <h3 className="font-bold text-slate-800 mb-8">Composição de Receita</h3>
          <div className="h-[240px] w-full relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={8}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-2xl font-bold text-slate-800">100%</span>
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">Total</span>
            </div>
          </div>
          
          <div className="mt-6 space-y-3">
            {pieData.map((item) => (
              <div key={item.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }}></div>
                  <span className="text-sm text-slate-600 font-medium">{item.name}</span>
                </div>
                <span className="text-sm font-bold text-slate-800">{item.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-100">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Ponto de Equilíbrio</p>
          <ValueTrace
            className="text-xl font-bold text-slate-800"
            displayValue={formatCurrency(indicators.pontoEquilibrio)}
            source="Indicador pontoEquilibrio da API"
            calculation="Valor calculado e retornado em /api/dashboard/indicators"
          />
          <div className="w-full bg-slate-100 h-1.5 rounded-full mt-3 overflow-hidden">
            <div className="bg-emerald-500 h-full w-[75%]"></div>
          </div>
          <p className="text-[10px] text-slate-500 mt-2 font-medium">75% atingido este mês</p>
        </div>
        
        <div className="bg-white p-5 rounded-2xl border border-slate-100">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">NCG</p>
          <ValueTrace
            className="text-xl font-bold text-slate-800"
            displayValue={formatCurrency(indicators.ncg)}
            source="Indicador ncg da API"
            calculation="Valor calculado e retornado em /api/dashboard/indicators"
          />
          <p className="text-[10px] text-orange-600 mt-3 font-bold flex items-center gap-1">
            <ArrowUpRight className="w-3 h-3" /> +12% vs ideal
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-100">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Caixa Mínimo</p>
          <ValueTrace
            className="text-xl font-bold text-slate-800"
            displayValue={formatCurrency(indicators.caixaMinimo)}
            source="Indicador caixaMinimo da API"
            calculation="Valor calculado e retornado em /api/dashboard/indicators"
          />
          <p className="text-[10px] text-emerald-600 mt-3 font-bold flex items-center gap-1">
            Status: Seguro
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-100">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Investimentos</p>
          <ValueTrace
            className="text-xl font-bold text-slate-800"
            displayValue={`${indicators.investimentos}%`}
            source="Indicador investimentos da API"
            calculation="Percentual de investimentos sobre faturamento bruto"
          />
          <p className="text-[10px] text-slate-500 mt-3 font-medium">Do faturamento bruto</p>
        </div>
      </div>
    </div>
  );
};
