import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Image as ImageIcon,
  Lightbulb,
  Loader2,
  Plus,
  Search,
  User,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useSearch } from '../context/SearchContext';
import { matchesSearch } from '../lib/search';
import { openSuggestionModal, SUGGESTION_SAVED_EVENT } from '../components/SuggestionFab';

type SuggestionStatus = 'todo' | 'in_progress' | 'waiting_info' | 'done';
type SuggestionKind = 'suggestion' | 'module_request';

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
  done?: boolean;
  done_at?: string | null;
  image_path?: string | null;
  image_name?: string | null;
  image_attachments?: Array<{ path: string; name: string }> | null;
  kind?: SuggestionKind;
  title?: string | null;
  company_scope?: 'vivaz' | 'aqua' | 'both' | null;
  file_label?: string | null;
  file_path?: string | null;
  file_name?: string | null;
  file_attachments?: Array<{ path: string; name: string }> | null;
  how_it_should_work?: string | null;
  answers?: Record<string, string> | null;
  status?: SuggestionStatus;
};

const collectAttachments = (
  list: Array<{ path: string; name: string }> | null | undefined,
  fallbackPath?: string | null,
  fallbackName?: string | null
) => {
  if (Array.isArray(list) && list.length) {
    return list.filter((item) => item?.path);
  }
  if (fallbackPath) return [{ path: fallbackPath, name: fallbackName || 'arquivo' }];
  return [];
};

const STATUS_META: Record<SuggestionStatus, { label: string; classes: string }> = {
  todo: { label: 'A fazer', classes: 'bg-slate-100 text-slate-700 border-slate-200' },
  in_progress: { label: 'Em desenvolvimento', classes: 'bg-blue-50 text-blue-800 border-blue-200' },
  waiting_info: { label: 'Aguardando informação', classes: 'bg-amber-50 text-amber-800 border-amber-200' },
  done: { label: 'Feito', classes: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
};

const COMPANY_LABEL: Record<string, string> = {
  vivaz: 'Vivaz',
  aqua: 'Aqua',
  both: 'Vivaz e Aqua',
};

const ANSWER_LABELS: Record<string, string> = {
  menu_location: 'Menu / área',
  who_can_use: 'Quem pode usar',
  similar_screen: 'Tela parecida',
  expected_flow: 'Fluxo esperado',
  frequency: 'Frequência',
  success_example: 'Como validar',
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

const StatusBadge: React.FC<{ status: SuggestionStatus }> = ({ status }) => {
  const meta = STATUS_META[status] || STATUS_META.todo;
  return (
    <span className={cn('inline-flex px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border', meta.classes)}>
      {meta.label}
    </span>
  );
};

export const SugestoesPage: React.FC = () => {
  const { query: globalQuery } = useSearch();
  const [rows, setRows] = useState<SuggestionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [localQuery, setLocalQuery] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | SuggestionStatus>('all');
  const [kindFilter, setKindFilter] = useState<'all' | SuggestionKind>('all');
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showDone, setShowDone] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/suggestions');
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || 'Não foi possível carregar.');
      }
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    try {
      const raw = localStorage.getItem('user');
      const user = raw ? JSON.parse(raw) : null;
      setIsAdmin(String(user?.role || '') === 'admin');
    } catch {
      setIsAdmin(false);
    }
  }, []);

  useEffect(() => {
    const onSaved = () => {
      void load();
    };
    window.addEventListener(SUGGESTION_SAVED_EVENT, onSaved);
    return () => window.removeEventListener(SUGGESTION_SAVED_EVENT, onSaved);
  }, []);

  const searchQuery = localQuery.trim() || globalQuery;
  const filtered = useMemo(() => {
    return rows.filter((row) => {
      const status = (row.status || (row.done ? 'done' : 'todo')) as SuggestionStatus;
      if (statusFilter !== 'all' && status !== statusFilter) return false;
      const kind = (row.kind || 'suggestion') as SuggestionKind;
      if (kindFilter !== 'all' && kind !== kindFilter) return false;
      return matchesSearch(
        searchQuery,
        row.user_name,
        row.user_email,
        row.user_role,
        row.message,
        row.title,
        row.page_label,
        row.page_tab,
        row.file_label,
        row.file_name,
        row.how_it_should_work,
        COMPANY_LABEL[row.company_scope || '']
      );
    });
  }, [rows, searchQuery, statusFilter, kindFilter]);

  const openRows = useMemo(
    () => filtered.filter((row) => (row.status || (row.done ? 'done' : 'todo')) !== 'done'),
    [filtered]
  );
  const doneRows = useMemo(
    () => filtered.filter((row) => (row.status || (row.done ? 'done' : 'todo')) === 'done'),
    [filtered]
  );

  const updateStatus = async (id: number, status: SuggestionStatus) => {
    if (!isAdmin) return;
    setUpdatingId(id);
    try {
      const res = await fetch(`/api/suggestions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Não foi possível atualizar.');
      setRows((prev) =>
        prev.map((row) =>
          row.id === id
            ? {
                ...row,
                status: (data.status || status) as SuggestionStatus,
                done: Boolean(data.done ?? status === 'done'),
                done_at: data.done_at ?? null,
              }
            : row
        )
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Não foi possível atualizar.');
    } finally {
      setUpdatingId(null);
    }
  };

  const openAttachment = async (row: SuggestionRow, kind: 'image' | 'file', path?: string) => {
    try {
      const params = new URLSearchParams({ kind });
      if (path) params.set('path', path);
      const res = await fetch(`/api/suggestions/${row.id}/image-url?${params.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.url) throw new Error(data?.error || 'Anexo indisponível');
      window.open(data.url, '_blank', 'noopener');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Não foi possível abrir o anexo.');
    }
  };

  const renderRow = (row: SuggestionRow) => {
    const expanded = expandedId === row.id;
    const status = (row.status || (row.done ? 'done' : 'todo')) as SuggestionStatus;
    const kind = (row.kind || 'suggestion') as SuggestionKind;
    const isModule = kind === 'module_request';
    const body = row.how_it_should_work || row.message || '';
    const preview = body.length > 160 && !expanded ? `${body.slice(0, 160).trim()}…` : body;
    const busy = updatingId === row.id;
    const answers = row.answers && typeof row.answers === 'object' ? row.answers : {};
    const imageItems = collectAttachments(row.image_attachments, row.image_path, row.image_name);
    const fileItems = collectAttachments(row.file_attachments, row.file_path, row.file_name);

    return (
      <tr key={row.id} className="border-b border-slate-50 hover:bg-slate-50/60 align-top">
        <td className="px-5 py-4">
          <div className="flex items-start gap-2.5 min-w-[150px]">
            <div className="w-8 h-8 rounded-xl bg-[#004D40]/10 text-[#004D40] flex items-center justify-center shrink-0">
              <User className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-slate-900 truncate">{row.user_name || 'Usuário'}</p>
              <p className="text-xs text-slate-500 truncate">{row.user_email || '—'}</p>
            </div>
          </div>
        </td>
        <td className="px-5 py-4">
          <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
            <span
              className={cn(
                'text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md',
                isModule ? 'bg-violet-50 text-violet-800' : 'bg-amber-50 text-amber-800'
              )}
            >
              {isModule ? 'Novo módulo' : 'Sugestão'}
            </span>
            {row.company_scope && (
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
                {COMPANY_LABEL[row.company_scope] || row.company_scope}
              </span>
            )}
          </div>
          {row.title && <p className="font-bold text-slate-900 mb-1">{row.title}</p>}
          <p className="text-slate-700 whitespace-pre-wrap leading-relaxed text-sm">{preview}</p>
          {body.length > 160 && (
            <button
              type="button"
              onClick={() => setExpandedId((c) => (c === row.id ? null : row.id))}
              className="mt-1.5 text-xs font-bold text-[#004D40] hover:underline"
            >
              {expanded ? 'Ver menos' : 'Ver mais'}
            </button>
          )}
          {expanded && (
            <div className="mt-3 space-y-2 text-xs text-slate-600">
              {row.file_label && (
                <p>
                  <span className="font-bold text-slate-500">Arquivo a mapear:</span> {row.file_label}
                </p>
              )}
              {Object.entries(answers)
                .filter(([, v]) => String(v || '').trim())
                .map(([key, value]) => (
                  <p key={key}>
                    <span className="font-bold text-slate-500">{ANSWER_LABELS[key] || key}:</span>{' '}
                    {String(value)}
                  </p>
                ))}
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            {imageItems.map((item, idx) => (
              <button
                key={`img-${item.path}`}
                type="button"
                onClick={() => openAttachment(row, 'image', item.path)}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-700 bg-blue-50 px-2 py-1 rounded-lg hover:bg-blue-100"
              >
                <ImageIcon className="w-3.5 h-3.5" />
                {item.name || `Print ${idx + 1}`}
              </button>
            ))}
            {fileItems.map((item, idx) => (
              <button
                key={`file-${item.path}`}
                type="button"
                onClick={() => openAttachment(row, 'file', item.path)}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 bg-slate-100 px-2 py-1 rounded-lg hover:bg-slate-200"
              >
                <FileText className="w-3.5 h-3.5" />
                {item.name || `Arquivo ${idx + 1}`}
              </button>
            ))}
          </div>
        </td>
        <td className="px-5 py-4">
          <p className="font-medium text-slate-800">{row.page_label || '—'}</p>
          <p className="text-[11px] text-slate-400 mt-1">{formatWhen(row.created_at)}</p>
          {row.done_at && status === 'done' && (
            <p className="text-[10px] text-emerald-700 mt-1 font-medium">Feito em {formatWhen(row.done_at)}</p>
          )}
        </td>
        <td className="px-5 py-4">
          <StatusBadge status={status} />
          {isAdmin ? (
            <select
              value={status}
              disabled={busy}
              onChange={(e) => updateStatus(row.id, e.target.value as SuggestionStatus)}
              className="mt-2 w-full max-w-[180px] px-2 py-1.5 text-xs bg-white border border-slate-200 rounded-lg font-semibold text-slate-700"
            >
              <option value="todo">A fazer</option>
              <option value="in_progress">Em desenvolvimento</option>
              <option value="waiting_info">Aguardando informação</option>
              <option value="done">Feito</option>
            </select>
          ) : null}
          {busy && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400 mt-1" />}
        </td>
      </tr>
    );
  };

  const table = (list: SuggestionRow[], emptyLabel: string) => {
    if (list.length === 0) {
      return (
        <div className="px-5 py-10 text-center">
          <p className="text-sm text-slate-400">{emptyLabel}</p>
        </div>
      );
    }
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50/80 text-[10px] uppercase tracking-wider text-slate-400 border-b border-slate-100">
              <th className="text-left font-bold px-5 py-3">Usuário</th>
              <th className="text-left font-bold px-5 py-3 min-w-[280px]">Pedido</th>
              <th className="text-left font-bold px-5 py-3">Página / Data</th>
              <th className="text-left font-bold px-5 py-3">Status</th>
            </tr>
          </thead>
          <tbody>{list.map(renderRow)}</tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Sugestões e Novos módulos</h2>
          <p className="text-sm text-slate-500 mt-1">
            {isAdmin
              ? 'Pedidos enviados pelos usuários. Atualize o status para eles acompanharem.'
              : 'Acompanhe seus pedidos de sugestão e de novos módulos.'}
          </p>
        </div>
        <div className="flex flex-col items-stretch sm:items-end gap-2">
          <button
            type="button"
            onClick={() => openSuggestionModal('module_request')}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#004D40] text-white text-sm font-bold hover:bg-[#003d33] transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Solicitar novo módulo
          </button>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
            {openRows.length} em andamento
            {doneRows.length > 0 ? ` · ${doneRows.length} feito${doneRows.length === 1 ? '' : 's'}` : ''}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={localQuery}
            onChange={(e) => setLocalQuery(e.target.value)}
            placeholder="Buscar por usuário, título, mensagem..."
            className="w-full pl-9 pr-3 py-2.5 text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value as 'all' | SuggestionKind)}
            className="px-3 py-2 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl"
          >
            <option value="all">Todos os tipos</option>
            <option value="suggestion">Só sugestões</option>
            <option value="module_request">Só novos módulos</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | SuggestionStatus)}
            className="px-3 py-2 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-xl"
          >
            <option value="all">Todos os status</option>
            <option value="todo">A fazer</option>
            <option value="in_progress">Em desenvolvimento</option>
            <option value="waiting_info">Aguardando informação</option>
            <option value="done">Feito</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-20 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm font-medium">Carregando...</span>
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
      ) : (
        <>
          {openRows.length === 0 ? (
            <div className="bg-white border border-slate-100 rounded-2xl px-5 py-16 text-center">
              <Lightbulb className="w-8 h-8 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-semibold text-slate-700">Nenhum pedido em aberto</p>
              <p className="text-xs text-slate-400 mt-1">
                Use o botão de lâmpada no canto da tela para enviar uma sugestão ou solicitar um módulo.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              {table(openRows, 'Nenhum pedido em aberto.')}
            </div>
          )}

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <button
              type="button"
              onClick={() => setShowDone((v) => !v)}
              className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-slate-50/80 transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                {showDone ? (
                  <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                )}
                <span className="text-sm font-bold text-slate-800">Concluídos</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  {doneRows.length}
                </span>
              </div>
              <span className="text-xs font-bold text-[#004D40]">{showDone ? 'Ocultar' : 'Ver'}</span>
            </button>
            {showDone && (
              <div className="border-t border-slate-100">{table(doneRows, 'Nenhum pedido concluído.')}</div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
