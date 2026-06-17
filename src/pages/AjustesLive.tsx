import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCcw, DownloadCloud, Plus, AlertTriangle } from 'lucide-react';
import { formatCurrency } from '../lib/utils';

interface AjustesRow {
  account_name: string;
  values: number[];
  total: number;
}

interface MonthHeader {
  month: number;
  label: string;
  date: string;
}

interface AjustesResponse {
  year: number;
  months: MonthHeader[];
  rows: AjustesRow[];
  totals: { months: number[]; total: number };
}

export const AjustesLive: React.FC = () => {
  const [year, setYear] = useState('2026');
  const [loading, setLoading] = useState(false);
  const [savingCell, setSavingCell] = useState(false);
  const [importing, setImporting] = useState(false);
  const [data, setData] = useState<AjustesResponse | null>(null);
  const [userRole, setUserRole] = useState('viewer');
  const [editingCell, setEditingCell] = useState<{ account: string; monthIndex: number } | null>(null);
  const [editingValue, setEditingValue] = useState('');
  // Linhas adicionadas localmente (ainda sem valor salvo).
  const [extraRows, setExtraRows] = useState<string[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/ajustes?year=${encodeURIComponent(year)}`);
      const json = await res.json();
      if (!res.ok) {
        alert(json.error || 'Erro ao carregar os Ajustes');
        return;
      }
      setData(json);
      setExtraRows([]);
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('user');
      if (raw) setUserRole(String(JSON.parse(raw)?.role || 'viewer'));
    } catch {
      // ignora
    }
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const months = data?.months ?? [];

  // Junta as linhas do banco com as adicionadas localmente.
  const displayRows = useMemo(() => {
    const base: AjustesRow[] = data?.rows ? [...data.rows] : [];
    const existing = new Set(base.map((r) => r.account_name));
    for (const name of extraRows) {
      if (!existing.has(name)) base.push({ account_name: name, values: Array(12).fill(0), total: 0 });
    }
    return base;
  }, [data, extraRows]);

  // Contas que aparecem mais de uma vez (réplica da coluna A = MATCH/duplicado).
  const duplicateNames = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of displayRows) counts.set(r.account_name, (counts.get(r.account_name) || 0) + 1);
    return new Set(Array.from(counts.entries()).filter(([, n]) => n > 1).map(([k]) => k));
  }, [displayRows]);

  const startEdit = (account: string, monthIndex: number, value: number) => {
    setEditingCell({ account, monthIndex });
    setEditingValue(String(value ?? 0));
  };

  const saveEdit = async (account: string, monthIndex: number) => {
    if (savingCell) return;
    const parsed = Number(String(editingValue).replace(',', '.'));
    if (!Number.isFinite(parsed)) {
      alert('Digite um valor numérico válido (use - para ajustes negativos).');
      return;
    }
    setSavingCell(true);
    try {
      const res = await fetch('/api/ajustes/cell', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_name: account, month: monthIndex + 1, year: Number(year), value: parsed }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(json.error || 'Erro ao salvar ajuste.');
        return;
      }
      setEditingCell(null);
      await loadData();
    } finally {
      setSavingCell(false);
    }
  };

  const addAccount = () => {
    const name = window.prompt('Nome da conta de ajuste:');
    if (!name || !name.trim()) return;
    setExtraRows((prev) => Array.from(new Set([...prev, name.trim()])));
  };

  const importFromSheet = async () => {
    if (importing) return;
    if (!window.confirm(`Importar os ajustes da planilha (aba Ajustes) para ${year}? Isto sobrescreve os ajustes do ano.`)) return;
    setImporting(true);
    try {
      const res = await fetch('/api/ajustes/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: Number(year) }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(json.error || 'Erro ao importar.');
        return;
      }
      alert(`Importado.\nContas: ${json.accounts}\nValores gravados: ${json.rows_written}`);
      await loadData();
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Ajustes {data?.year ?? year}</h2>
          <p className="text-sm text-slate-500">
            Ajustes manuais por conta e mês (réplica viva da aba <span className="font-mono text-xs">Ajustes</span>).
            Cabeçalhos são as datas de fim de mês (EOMONTH). Valores podem ser negativos.
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
          <button
            onClick={addAccount}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-bold rounded-xl hover:bg-slate-50"
          >
            <Plus className="w-4 h-4" />
            Nova conta
          </button>
          {userRole === 'admin' && (
            <button
              onClick={importFromSheet}
              disabled={importing}
              title="Importa os ajustes da planilha para o banco"
              className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-[#004D40] text-[#004D40] text-sm font-bold rounded-xl hover:bg-emerald-50 disabled:opacity-60"
            >
              <DownloadCloud className={`w-4 h-4 ${importing ? 'animate-pulse' : ''}`} />
              {importing ? 'Importando...' : 'Importar da planilha'}
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-auto">
        <table className="w-full text-left border-collapse min-w-[1600px]">
          <thead>
            <tr className="bg-slate-100/70">
              <th className="sticky left-0 z-20 bg-slate-100/90 px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest min-w-[280px]">
                Contas
              </th>
              {months.map((m) => (
                <th key={m.month} className="px-3 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">
                  <div>{m.label}</div>
                  <div className="text-[9px] text-slate-400 font-medium normal-case">{m.date}</div>
                </th>
              ))}
              <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {displayRows.length === 0 && !loading && (
              <tr>
                <td colSpan={14} className="px-4 py-8 text-center text-sm text-slate-400">
                  Nenhum ajuste cadastrado. Use “Importar da planilha” ou “Nova conta”.
                </td>
              </tr>
            )}
            {displayRows.map((row, rowIndex) => (
              <tr key={row.account_name} className={rowIndex % 2 === 0 ? 'bg-white hover:bg-slate-50' : 'bg-slate-50 hover:bg-slate-100'}>
                <td className={`sticky left-0 z-10 px-4 py-2 text-sm text-slate-900 min-w-[280px] ${rowIndex % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                  <span className="inline-flex items-center gap-1.5">
                    {duplicateNames.has(row.account_name) && (
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                    )}
                    {row.account_name}
                  </span>
                </td>
                {Array.from({ length: 12 }, (_, index) => {
                  const value = row.values[index] || 0;
                  const isEditing = editingCell?.account === row.account_name && editingCell?.monthIndex === index;
                  return (
                    <td key={index} className="px-2 py-1.5 text-xs text-right">
                      {isEditing ? (
                        <input
                          autoFocus
                          type="number"
                          step="0.01"
                          value={editingValue}
                          onChange={(e) => setEditingValue(e.target.value)}
                          onBlur={() => saveEdit(row.account_name, index)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveEdit(row.account_name, index);
                            if (e.key === 'Escape') setEditingCell(null);
                          }}
                          className="w-24 px-2 py-1 text-right bg-white border border-emerald-300 rounded-md"
                        />
                      ) : (
                        <button
                          onClick={() => startEdit(row.account_name, index, value)}
                          className={`min-w-20 px-2 py-1 rounded hover:bg-emerald-50 transition-colors ${value < 0 ? 'text-red-600' : 'text-slate-900'}`}
                          title="Clique para editar"
                        >
                          {formatCurrency(value)}
                        </button>
                      )}
                    </td>
                  );
                })}
                <td className={`px-4 py-2 text-xs text-right font-bold ${row.total < 0 ? 'text-red-700' : 'text-slate-900'}`}>
                  {formatCurrency(row.total)}
                </td>
              </tr>
            ))}
            {data && (
              <tr className="bg-emerald-50/60 border-t border-emerald-200">
                <td className="sticky left-0 z-10 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-800 min-w-[280px]">
                  Total de ajustes
                </td>
                {data.totals.months.map((value, index) => (
                  <td key={index} className="px-3 py-3 text-xs text-right font-bold text-emerald-800">
                    {formatCurrency(value)}
                  </td>
                ))}
                <td className="px-4 py-3 text-xs text-right font-extrabold text-emerald-900">
                  {formatCurrency(data.totals.total)}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-start gap-2 text-[11px] text-slate-500 bg-blue-50/50 border border-blue-100 rounded-xl px-3 py-2">
        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <p>
          Cada linha é uma conta de ajuste; os meses (Real1…Real12) correspondem às datas de fim de mês. Valores
          negativos representam estornos/baixas (na planilha apareciam entre parênteses). O ícone âmbar marca contas
          repetidas — equivalente à coluna A da planilha original (<code className="font-mono">MATCH</code> de duplicadas).
        </p>
      </div>
    </div>
  );
};
