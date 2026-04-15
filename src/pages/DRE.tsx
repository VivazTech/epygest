import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  ChevronRight, 
  ChevronDown,
  Download,
  Printer,
  Calendar
} from 'lucide-react';
import { cn, formatCurrency, formatPercent } from '../lib/utils';
import { ValueTrace } from '../components/ValueTrace';

interface DRERow {
  id: string;
  label: string;
  isHeader?: boolean;
  isTotal?: boolean;
  level: number;
  values: number[];
  children?: DRERow[];
}

const mockDREData: DRERow[] = [
  {
    id: '1',
    label: 'Receitas Operacionais',
    isHeader: true,
    level: 0,
    values: [250000, 280000, 265000],
    children: [
      { id: '1.1', label: 'Receita de Vendas de Produtos', level: 1, values: [180000, 210000, 195000] },
      { id: '1.2', label: 'Receita de Prestação de Serviços', level: 1, values: [70000, 70000, 70000] },
    ]
  },
  {
    id: '2',
    label: 'Deduções da Receita Bruta',
    isHeader: true,
    level: 0,
    values: [-25000, -28000, -26500],
    children: [
      { id: '2.1', label: 'Descontos Incondicionais', level: 1, values: [-5000, -6000, -5500] },
      { id: '2.2', label: 'ICMS', level: 1, values: [-12000, -14000, -13000] },
      { id: '2.3', label: 'PIS', level: 1, values: [-2000, -2200, -2100] },
      { id: '2.4', label: 'COFINS', level: 1, values: [-4000, -4500, -4200] },
      { id: '2.5', label: 'ISS', level: 1, values: [-1500, -1000, -1200] },
      { id: '2.6', label: 'Outras Deduções', level: 1, values: [-500, -300, -500] },
    ]
  },
  {
    id: '3',
    label: 'Lucro Bruto',
    isTotal: true,
    level: 0,
    values: [225000, 252000, 238500],
  },
  {
    id: '4',
    label: 'Despesas Operacionais',
    isHeader: true,
    level: 0,
    values: [-155000, -173000, -161000],
    children: [
      { id: '4.1', label: 'Despesas Administrativas', level: 1, values: [-80000, -95000, -85000] },
      { id: '4.2', label: 'Despesas de Vendas', level: 1, values: [-30000, -30000, -30000] },
      { id: '4.3', label: 'Marketing e Publicidade', level: 1, values: [-45000, -48000, -46000] },
    ]
  },
  {
    id: '5',
    label: 'EBITDA',
    isTotal: true,
    level: 0,
    values: [70000, 79000, 77500],
  },
  {
    id: '6',
    label: 'Lucro Operacional',
    isTotal: true,
    level: 0,
    values: [65000, 74000, 72500],
  },
  {
    id: '7',
    label: 'Resultado Líquido',
    isTotal: true,
    level: 0,
    values: [52000, 59200, 58000],
  },
];

export const DREPage: React.FC = () => {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ '1': true, '2': true, '4': true, '6': true });
  const months = ['Janeiro', 'Fevereiro', 'Março'];

  const toggleExpand = (id: string) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const renderRow = (row: DRERow) => {
    const isExpanded = expanded[row.id];
    const hasChildren = row.children && row.children.length > 0;

    return (
      <React.Fragment key={row.id}>
        <tr className={cn(
          "group transition-colors",
          row.isTotal ? "bg-slate-50 font-bold border-t-2 border-slate-200" : "hover:bg-slate-50/50",
          row.isHeader ? "font-semibold text-slate-700" : "text-slate-600"
        )}>
          <td className="px-6 py-4">
            <div className="flex items-center gap-2" style={{ paddingLeft: `${row.level * 24}px` }}>
              {hasChildren && (
                <button 
                  onClick={() => toggleExpand(row.id)}
                  className="p-1 hover:bg-slate-200 rounded transition-colors"
                >
                  {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
              )}
              {!hasChildren && row.level > 0 && <div className="w-6" />}
              <span className="text-sm">{row.label}</span>
            </div>
          </td>
          {row.values.map((val, idx) => (
            <td key={idx} className={cn(
              "px-6 py-4 text-right text-sm tabular-nums",
              val < 0 ? "text-red-600" : row.isTotal ? "text-slate-900" : "text-slate-600"
            )}>
              <ValueTrace
                displayValue={formatCurrency(val)}
                source={`Linha DRE: ${row.label}`}
                calculation={`Valor do mês ${months[idx]} na estrutura DRE`}
              />
            </td>
          ))}
          <td className="px-6 py-4 text-right text-sm font-medium text-slate-400">
            {row.isTotal ? '100%' : formatPercent(Math.abs(row.values[2] / 238500 * 100))}
          </td>
        </tr>
        {hasChildren && isExpanded && row.children?.map(child => renderRow(child))}
      </React.Fragment>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">DRE Gerencial</h2>
          <p className="text-slate-500 text-sm">Demonstrativo de Resultados do Exercício com visão analítica.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white border border-slate-200 px-4 py-2 rounded-xl shadow-sm">
            <Calendar className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-medium text-slate-600">2024</span>
          </div>
          <button className="p-2.5 bg-white border border-slate-200 rounded-xl shadow-sm hover:bg-slate-50 transition-colors">
            <Printer className="w-4 h-4 text-slate-500" />
          </button>
          <button className="flex items-center gap-2 bg-[#004D40] text-white px-4 py-2.5 rounded-xl shadow-lg shadow-emerald-900/10 hover:bg-[#003d33] transition-colors">
            <Download className="w-4 h-4" />
            <span className="text-sm font-bold">Exportar Excel</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Faturamento Bruto</p>
          <ValueTrace className="text-xl font-bold text-slate-900" displayValue={formatCurrency(795000)} source="Resumo DRE" calculation="Soma das receitas brutas do período selecionado" />
          <div className="flex items-center gap-1 text-emerald-600 text-[10px] font-bold mt-2">
            <TrendingUp className="w-3 h-3" /> +15.2% vs 2023
          </div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">EBITDA Acumulado</p>
          <ValueTrace className="text-xl font-bold text-slate-900" displayValue={formatCurrency(226500)} source="Resumo DRE" calculation="EBITDA acumulado no período selecionado" />
          <div className="flex items-center gap-1 text-emerald-600 text-[10px] font-bold mt-2">
            Margem: 28.5%
          </div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Lucro Operacional</p>
          <ValueTrace className="text-xl font-bold text-slate-900" displayValue={formatCurrency(211500)} source="Resumo DRE" calculation="Lucro operacional acumulado no período selecionado" />
          <div className="flex items-center gap-1 text-orange-600 text-[10px] font-bold mt-2">
            <TrendingDown className="w-3 h-3" /> -2.1% vs Meta
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest min-w-[300px]">Estrutura Hierárquica</th>
                {months.map(m => (
                  <th key={m} className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">{m}</th>
                ))}
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">AV (%)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {mockDREData.map(row => renderRow(row))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
