import React, { useEffect, useMemo, useState } from 'react';
import { Search, User } from 'lucide-react';
import { matchesSearch } from '../lib/search';

type NameSuggestion = {
  id: number;
  user_name: string | null;
  user_email: string | null;
  user_role: string | null;
  suggestion: string;
  created_at: string;
};

const formatWhen = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return (
    date.toLocaleDateString('pt-BR') +
    ' ' +
    date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  );
};

export const NomesSistemaPage: React.FC = () => {
  const [rows, setRows] = useState<NameSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/system-name-suggestions');
        const data = await res.json().catch(() => []);
        if (cancelled) return;
        if (!res.ok) {
          setError(data?.error || 'Não foi possível carregar as sugestões.');
          setRows([]);
          return;
        }
        setRows(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setError('Não foi possível carregar as sugestões.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = useMemo(
    () =>
      rows.filter((row) =>
        matchesSearch(query, row.suggestion, row.user_name, row.user_email, row.user_role)
      ),
    [rows, query]
  );

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Nomes sugeridos</h1>
        <p className="text-sm text-slate-500 mt-1">
          Sugestões enviadas para substituir o nome Budget Controle. Cada pessoa envia uma vez.
        </p>
      </div>

      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nome, pessoa ou e-mail"
          className="w-full pl-9 pr-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm"
        />
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        {loading ? (
          <p className="px-5 py-10 text-center text-sm text-slate-400">Carregando sugestões...</p>
        ) : error ? (
          <p className="px-5 py-10 text-center text-sm text-red-600">{error}</p>
        ) : visible.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-400">Nenhuma sugestão enviada.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50/80 text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
                  <th className="text-left font-bold px-5 py-3">Usuário</th>
                  <th className="text-left font-bold px-5 py-3">Sugestão</th>
                  <th className="text-left font-bold px-5 py-3 whitespace-nowrap">Data e hora</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={row.id} className="border-b border-slate-50 hover:bg-slate-50/60 align-top">
                    <td className="px-5 py-4">
                      <div className="flex items-start gap-2.5 min-w-[180px]">
                        <div className="w-8 h-8 rounded-xl bg-[#004D40]/10 text-[#004D40] flex items-center justify-center shrink-0">
                          <User className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-slate-900 truncate">{row.user_name || 'Usuário'}</p>
                          <p className="text-xs text-slate-500 truncate">{row.user_email || '—'}</p>
                          {row.user_role && (
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-1">
                              {row.user_role}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-slate-800">{row.suggestion}</p>
                    </td>
                    <td className="px-5 py-4 whitespace-nowrap text-slate-600">{formatWhen(row.created_at)}</td>
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
