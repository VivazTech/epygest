import React, { useEffect, useMemo, useState } from 'react';
import { Lightbulb, Loader2, Search, User } from 'lucide-react';
import { cn } from '../lib/utils';
import { useSearch } from '../context/SearchContext';
import { matchesSearch } from '../lib/search';

type SuggestionRow = {
  id: number;
  user_id: number | null;
  user_name: string | null;
  user_email: string | null;
  user_role: string | null;
  message: string;
  page_tab: string | null;
  page_label: string | null;
  created_at: string;
};

const formatWhen = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return (
    d.toLocaleDateString('pt-BR') +
    ' ' +
    d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  );
};

export const SugestoesPage: React.FC = () => {
  const { query: globalQuery } = useSearch();
  const [rows, setRows] = useState<SuggestionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [localQuery, setLocalQuery] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/suggestions');
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || 'Não foi possível carregar as sugestões.');
      }
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar sugestões.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const searchQuery = localQuery.trim() || globalQuery;
  const filtered = useMemo(() => {
    return rows.filter((row) =>
      matchesSearch(
        searchQuery,
        row.user_name,
        row.user_email,
        row.user_role,
        row.message,
        row.page_label,
        row.page_tab
      )
    );
  }, [rows, searchQuery]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Sugestões</h2>
          <p className="text-sm text-slate-500 mt-1">
            Mensagens enviadas pelos usuários pelo botão de sugestão.
          </p>
        </div>
        <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
          {filtered.length} {filtered.length === 1 ? 'sugestão' : 'sugestões'}
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={localQuery}
            onChange={(e) => setLocalQuery(e.target.value)}
            placeholder="Buscar por usuário, mensagem ou página..."
            className="w-full pl-9 pr-3 py-2.5 text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-20 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm font-medium">Carregando sugestões...</span>
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-100 rounded-2xl px-5 py-8 text-center space-y-3">
          <p className="text-sm text-red-700 font-medium">{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-red-200 text-red-700 text-sm font-bold hover:bg-red-50"
          >
            Tentar novamente
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-slate-100 rounded-2xl px-5 py-16 text-center">
          <Lightbulb className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-700">Nenhuma sugestão encontrada</p>
          <p className="text-xs text-slate-400 mt-1">Quando alguém enviar, aparece aqui.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50/80 text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
                  <th className="text-left font-bold px-5 py-3">Usuário</th>
                  <th className="text-left font-bold px-5 py-3 min-w-[240px]">Mensagem</th>
                  <th className="text-left font-bold px-5 py-3">Página</th>
                  <th className="text-left font-bold px-5 py-3 whitespace-nowrap">Data e hora</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const expanded = expandedId === row.id;
                  const preview =
                    row.message.length > 140 && !expanded
                      ? `${row.message.slice(0, 140).trim()}…`
                      : row.message;
                  return (
                    <tr key={row.id} className="border-b border-slate-50 hover:bg-slate-50/60 align-top">
                      <td className="px-5 py-4">
                        <div className="flex items-start gap-2.5 min-w-[160px]">
                          <div className="w-8 h-8 rounded-xl bg-[#004D40]/10 text-[#004D40] flex items-center justify-center shrink-0">
                            <User className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-slate-900 truncate">
                              {row.user_name || 'Usuário removido'}
                            </p>
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
                        <p className="text-slate-700 whitespace-pre-wrap leading-relaxed">{preview}</p>
                        {row.message.length > 140 && (
                          <button
                            type="button"
                            onClick={() => setExpandedId(expanded ? null : row.id)}
                            className="mt-1.5 text-xs font-bold text-[#004D40] hover:underline"
                          >
                            {expanded ? 'Ver menos' : 'Ver mais'}
                          </button>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-medium text-slate-800">{row.page_label || '—'}</p>
                        {row.page_tab && (
                          <p className="text-[11px] text-slate-400 mt-0.5 font-mono">{row.page_tab}</p>
                        )}
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        <span
                          className={cn(
                            'inline-flex px-2.5 py-1 rounded-lg text-xs font-semibold tabular-nums',
                            'bg-slate-50 text-slate-600 border border-slate-100'
                          )}
                        >
                          {formatWhen(row.created_at)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
