import React, { useState } from 'react';
import { 
  Target, 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  Zap,
  Info,
  ChevronRight,
  Filter
} from 'lucide-react';
import { 
  ComposedChart, 
  Line, 
  Area, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer 
} from 'recharts';
import { cn, formatCurrency, formatPercent } from '../lib/utils';

const planningData = [
  { name: 'Jan', realizado: 180000, planejado: 175000 },
  { name: 'Fev', realizado: 210000, planejado: 190000 },
  { name: 'Mar', realizado: 195000, planejado: 205000 },
  { name: 'Abr', realizado: 240000, planejado: 220000 },
  { name: 'Mai', realizado: 220000, planejado: 230000 },
  { name: 'Jun', realizado: 280000, planejado: 250000 },
];

export const PlanningPage: React.FC = () => {
  const [scenario, setScenario] = useState('Regular');

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Planejamento e Cenários</h2>
          <p className="text-slate-500 text-sm">Compare o realizado com o planejado e analise projeções.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <select 
            value={scenario}
            onChange={e => setScenario(e.target.value)}
            className="bg-white border border-slate-200 px-4 py-2.5 rounded-xl shadow-sm text-sm font-bold text-slate-700 focus:ring-2 focus:ring-emerald-500/20 outline-none"
          >
            <option value="Otimista">Cenário Otimista</option>
            <option value="Regular">Cenário Regular</option>
            <option value="Pessimista">Cenário Pessimista</option>
          </select>
          <button className="flex items-center gap-2 bg-[#004D40] text-white px-4 py-2.5 rounded-xl shadow-lg shadow-emerald-900/10 hover:bg-[#003d33] transition-colors">
            <Zap className="w-4 h-4" />
            <span className="text-sm font-bold">Simular Cenário</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex justify-between items-start mb-3">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Momento Atual</h4>
            <Info className="w-3 h-3 text-slate-300" />
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
            <p className="text-xl font-bold text-slate-900">Expansão</p>
          </div>
          <p className="text-[10px] text-slate-500 mt-2 font-medium">Classificação baseada em KPIs</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex justify-between items-start mb-3">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Aderência à Meta</h4>
            <Target className="w-3 h-3 text-slate-300" />
          </div>
          <p className="text-xl font-bold text-slate-900">94.2%</p>
          <div className="flex items-center gap-1 text-orange-600 text-[10px] font-bold mt-2">
            <TrendingDown className="w-3 h-3" /> -5.8% vs Planejado
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex justify-between items-start mb-3">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cenário Atual</h4>
            <TrendingUp className="w-3 h-3 text-slate-300" />
          </div>
          <p className="text-xl font-bold text-emerald-600">Otimista</p>
          <p className="text-[10px] text-slate-500 mt-2 font-medium">Performance acima da média</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex justify-between items-start mb-3">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Gap de Receita</h4>
            <AlertTriangle className="w-3 h-3 text-slate-300" />
          </div>
          <p className="text-xl font-bold text-slate-900">{formatCurrency(15000)}</p>
          <p className="text-[10px] text-slate-500 mt-2 font-medium">Faltam para atingir meta Mar/24</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <h3 className="font-bold text-slate-800">Planejado x Realizado (Mensal)</h3>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                <span className="text-xs font-medium text-slate-500">Realizado</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-slate-200"></div>
                <span className="text-xs font-medium text-slate-500">Planejado</span>
              </div>
            </div>
          </div>
          
          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={planningData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                />
                <Legend verticalAlign="top" align="right" height={36} iconType="circle" />
                <Area type="monotone" dataKey="planejado" fill="#f1f5f9" stroke="#cbd5e1" />
                <Bar dataKey="realizado" fill="#10b981" radius={[4, 4, 0, 0]} barSize={40} />
                <Line type="monotone" dataKey="realizado" stroke="#059669" strokeWidth={3} dot={{ r: 4, fill: '#059669' }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
            <h3 className="font-bold text-slate-800 mb-4">Análise de Desvio</h3>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-xs font-bold mb-1.5">
                  <span className="text-slate-500 uppercase tracking-tighter">Receita</span>
                  <span className="text-emerald-600">+5.2%</span>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <div className="bg-emerald-500 h-full w-[85%]"></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs font-bold mb-1.5">
                  <span className="text-slate-500 uppercase tracking-tighter">Custos Fixos</span>
                  <span className="text-red-600">+2.1%</span>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <div className="bg-red-500 h-full w-[65%]"></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs font-bold mb-1.5">
                  <span className="text-slate-500 uppercase tracking-tighter">Marketing</span>
                  <span className="text-emerald-600">-12.4%</span>
                </div>
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <div className="bg-emerald-500 h-full w-[45%]"></div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-[#004D40] p-6 rounded-2xl shadow-lg shadow-emerald-900/20 text-white">
            <h3 className="font-bold mb-2">Insight de Gestão</h3>
            <p className="text-xs text-emerald-100/80 leading-relaxed mb-4">
              O cenário atual indica que a redução nas despesas de marketing não afetou a receita orgânica, sugerindo maior eficiência nos canais atuais.
            </p>
            <button className="flex items-center gap-2 text-xs font-bold text-emerald-300 hover:text-white transition-colors">
              Ver relatório detalhado <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
