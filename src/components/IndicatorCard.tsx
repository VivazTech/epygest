import React from 'react';
import { ArrowUpRight, ArrowDownRight, Info } from 'lucide-react';
import { cn, formatCurrency, formatPercent } from '../lib/utils';

interface IndicatorCardProps {
  title: string;
  value: number;
  type: 'currency' | 'percent';
  variation: number;
  description: string;
  color?: 'green' | 'orange' | 'blue' | 'neutral';
}

export const IndicatorCard: React.FC<IndicatorCardProps> = ({ 
  title, value, type, variation, description, color = 'neutral' 
}) => {
  const isPositive = variation >= 0;
  
  const colorClasses = {
    green: 'border-emerald-100 bg-emerald-50/30',
    orange: 'border-orange-100 bg-orange-50/30',
    blue: 'border-blue-100 bg-blue-50/30',
    neutral: 'border-slate-100 bg-white'
  };

  return (
    <div className={cn(
      "p-5 rounded-2xl border transition-all duration-300 hover:shadow-lg hover:shadow-slate-200/50 group",
      colorClasses[color]
    )}>
      <div className="flex justify-between items-start mb-3">
        <h3 className="text-slate-500 text-xs font-bold uppercase tracking-wider">{title}</h3>
        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
          <Info className="w-4 h-4 text-slate-300 cursor-help" />
        </div>
      </div>
      
      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-2xl font-bold text-slate-900">
          {type === 'currency' ? formatCurrency(value) : formatPercent(value)}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <div className={cn(
          "flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold",
          isPositive ? "bg-emerald-100 text-emerald-700" : "bg-orange-100 text-orange-700"
        )}>
          {isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
          {Math.abs(variation)}%
        </div>
        <span className="text-[10px] text-slate-400 font-medium">{description}</span>
      </div>
    </div>
  );
};
