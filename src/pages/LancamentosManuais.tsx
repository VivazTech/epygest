import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Archive, XCircle, Trash2, BadgeCheck, RotateCcw, Upload, FileCheck, Paperclip } from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import { ValueTrace } from '../components/ValueTrace';
import { valueTrace } from '../lib/valueTraceMeta';
import { useSearch } from '../context/SearchContext';
import { useToast } from '../context/ToastContext';
import { matchesSearch } from '../lib/search';
import { isSharedCrdCode } from '../lib/sharedCrds';
import { isDirectDocumentUrl } from '../lib/storagePath';
import { confirmCancel, confirmDelete } from '../lib/confirmAction';

export const LancamentosManuaisPage: React.FC = () => {
  const { query } = useSearch();
  const { showSuccess } = useToast();
  const [entries, setEntries] = useState<any[]>([]);
  const [sectors, setSectors] = useState<any[]>([]);
  const [crds, setCrds] = useState<any[]>([]);
  const [userRole, setUserRole] = useState<string>('viewer');
  const [allowedSectorIds, setAllowedSectorIds] = useState<string[]>([]);
  const [actingSector, setActingSector] = useState<'requester' | 'controle' | 'financeiro'>('requester');
  const [form, setForm] = useState({
    sector_id: '',
    crd_id: '',
    issue_date: '',
    date: '',
    amount: '',
    description: '',
    file_path: '',
    file_name: '',
  });
  const [uploadingFile, setUploadingFile] = useState(false);

  const loadData = async () => {
    try {
      const [entriesRes, sectorsRes, crdsRes] = await Promise.all([
        fetch('/api/manual-entries'),
        fetch('/api/sectors'),
        fetch('/api/crds'),
      ]);
      const entriesData = await entriesRes.json().catch(() => null);
      const sectorsData = await sectorsRes.json().catch(() => null);
      const crdsData = await crdsRes.json().catch(() => null);
      setEntries(Array.isArray(entriesData) ? entriesData : []);
      setSectors(Array.isArray(sectorsData) ? sectorsData : []);
      setCrds(Array.isArray(crdsData) ? crdsData : []);
    } catch {
      setEntries([]);
      setSectors([]);
      setCrds([]);
    }
  };

  useEffect(() => {
    const loadUserScope = async () => {
      try {
        const res = await fetch('/api/auth/me');
        if (!res.ok) return;
        const user = await res.json();
        const role = String(user?.role || 'viewer');
        setUserRole(role);
        if (role === 'finance') setActingSector('financeiro');
        else if (role === 'controle') setActingSector('controle');
        else setActingSector('requester');
        const ids = Array.from(
          new Set<string>(
            (Array.isArray(user?.sector_ids) ? user.sector_ids : [user?.sector_id])
              .map((id: unknown) => String(id ?? '').trim())
              .filter((id: string) => id !== '')
          )
        );
        setAllowedSectorIds(ids);
      } catch {
        // mantém escopo vazio
      }
    };

    loadUserScope();
    loadData();
  }, []);

  const hasGlobalSectorView =
    userRole === 'admin' || userRole === 'finance' || userRole === 'controle';
  const canSwitchActingProfile = userRole === 'admin';
  const canApproveControl = actingSector === 'controle' && (userRole === 'controle' || userRole === 'admin');
  const canPayFinance = actingSector === 'financeiro' && (userRole === 'finance' || userRole === 'admin');
  const canLaunch =
    userRole === 'manager' ||
    (userRole === 'admin' && actingSector === 'requester');
  const canCancelAsRequester =
    actingSector === 'requester' &&
    (userRole === 'manager' || userRole === 'admin');

  const visibleSectors = useMemo(() => {
    if (hasGlobalSectorView && allowedSectorIds.length === 0) return sectors;
    if (allowedSectorIds.length === 0) return [];
    return sectors.filter((s) => allowedSectorIds.includes(String(s.id)));
  }, [sectors, allowedSectorIds, hasGlobalSectorView]);

  const visibleCrds = useMemo(() => {
    const active = crds.filter((c) => c.active !== false);
    if (!form.sector_id) return [];
    return active.filter(
      (c) => String(c.sector_id) === form.sector_id || isSharedCrdCode(c.code)
    );
  }, [crds, form.sector_id]);

  const matchesUserSector = (sectorId?: number | string | null) => {
    if (hasGlobalSectorView && allowedSectorIds.length === 0) return true;
    if (allowedSectorIds.length === 0) return false;
    return allowedSectorIds.includes(String(sectorId ?? ''));
  };

  const scopedEntries = useMemo(
    () => entries.filter((e) => matchesUserSector(e.sector_id)),
    [entries, allowedSectorIds, hasGlobalSectorView]
  );

  const createEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.sector_id || !form.issue_date || !form.date || !form.amount) {
      alert('Preencha setor, data de emissão, data de lançamento e valor.');
      return;
    }

    const res = await fetch('/api/manual-entries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sector_id: parseInt(form.sector_id, 10),
        crd_id: form.crd_id ? parseInt(form.crd_id, 10) : null,
        issue_date: form.issue_date,
        date: form.date,
        amount: parseFloat(form.amount),
        description: form.description || null,
        file_path: form.file_path || null,
        file_name: form.file_name || null,
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      alert(data.error || 'Não foi possível registrar o lançamento.');
      return;
    }

    showSuccess('Lançamento manual criado. Aguardando aprovação do Controle.');
    setForm({ sector_id: '', crd_id: '', issue_date: '', date: '', amount: '', description: '', file_path: '', file_name: '' });
    loadData();
  };

  const handleFileUpload = async (file: File) => {
    setUploadingFile(true);
    try {
      const payload = new FormData();
      payload.append('file', file);
      const res = await fetch('/api/manual-entries/file', { method: 'POST', body: payload });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Não foi possível enviar o arquivo.');
      setForm((p) => ({
        ...p,
        file_path: data.file_path || '',
        file_name: data.file_name || file.name,
      }));
    } catch (error: any) {
      alert(error.message || 'Não foi possível enviar o arquivo.');
    } finally {
      setUploadingFile(false);
    }
  };

  const openEntryDocument = async (entry: any) => {
    const storedPath = String(entry?.file_path || '');
    if (storedPath && isDirectDocumentUrl(storedPath)) {
      window.open(storedPath, '_blank', 'noopener');
      return;
    }
    try {
      const res = await fetch(`/api/manual-entries/${entry.id}/document-url`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.url) throw new Error(data?.error || 'Arquivo indisponível');
      window.open(data.url, '_blank', 'noopener');
    } catch (error: any) {
      alert(error.message || 'Não foi possível abrir o documento.');
    }
  };

  const updateStatus = async (id: number, status: 'open' | 'approved' | 'posted' | 'cancelled') => {
    if (status === 'cancelled' && !confirmCancel('este lançamento manual')) return;
    const res = await fetch(`/api/manual-entries/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.error || 'Não foi possível atualizar o lançamento.');
      return;
    }
    const messages: Record<string, string> = {
      approved: 'Lançamento aprovado pelo Controle.',
      posted: 'Lançamento baixado pelo Financeiro.',
      cancelled: 'Lançamento cancelado.',
      open: 'Lançamento devolvido para análise.',
    };
    showSuccess(messages[status] || 'Status atualizado.');
    loadData();
  };

  const deleteEntry = async (entry: any) => {
    if (userRole !== 'admin') {
      alert('Apenas administradores podem excluir lançamentos manuais.');
      return;
    }
    const label = entry.description
      ? `"${entry.description}"`
      : `lançamento #${entry.id}`;
    if (!confirmDelete(label)) return;

    const res = await fetch(`/api/manual-entries/${entry.id}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.error || 'Não foi possível excluir o lançamento.');
      return;
    }
    showSuccess('Lançamento manual excluído com sucesso.');
    loadData();
  };

  const filteredEntries = useMemo(
    () =>
      scopedEntries.filter((entry) =>
        matchesSearch(
          query,
          entry.sector_name,
          entry.crd_code,
          entry.crd_name,
          entry.description,
          entry.file_name,
          entry.user_name,
          entry.issue_date,
          entry.date,
          entry.amount,
          entry.status
        )
      ),
    [scopedEntries, query]
  );

  const openTotal = useMemo(
    () =>
      scopedEntries
        .filter((e) => e.status === 'open' || e.status === 'approved')
        .reduce((sum, e) => sum + Number(e.amount || 0), 0),
    [scopedEntries]
  );

  const statusMeta = (status: string) => {
    if (status === 'approved') return { label: 'Aprovado Controle', classes: 'bg-blue-100 text-blue-700' };
    if (status === 'posted') return { label: 'Baixado', classes: 'bg-emerald-100 text-emerald-700' };
    if (status === 'cancelled') return { label: 'Cancelado', classes: 'bg-slate-200 text-slate-700' };
    return { label: 'Aguardando Controle', classes: 'bg-orange-100 text-orange-700' };
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Lançamentos Manuais</h2>
          <p className="text-slate-500 text-sm">
            Fluxo: Solicitante lança → Controle aprova → Financeiro baixa. Em aberto/aprovado compõem o orçamento do mês.
          </p>
        </div>
        {canSwitchActingProfile && (
          <select
            value={actingSector}
            onChange={(e) => setActingSector(e.target.value as 'requester' | 'controle' | 'financeiro')}
            className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 shadow-sm self-start"
            title="Perfil de atuação no fluxo"
          >
            <option value="requester">Atuar como Solicitante</option>
            <option value="controle">Atuar como Controle</option>
            <option value="financeiro">Atuar como Financeiro</option>
          </select>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-wrap items-center gap-4">
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Em aberto / aprovados (visíveis)</p>
          <p className="text-xl font-extrabold text-slate-900 mt-1">
            <ValueTrace
              displayValue={formatCurrency(openTotal)}
              meta={valueTrace.manualEntries.openTotal()}
            />
          </p>
        </div>
        <p className="text-xs text-slate-400 max-w-md">
          Compromisso orçamentário usa a data de lançamento. Após a baixa pelo Financeiro, o valor deixa de contar no pendente.
        </p>
      </div>

      {canLaunch && (
        <form
          onSubmit={createEntry}
          className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 grid grid-cols-1 md:grid-cols-6 gap-3"
        >
          <select
            required
            value={form.sector_id}
            onChange={(e) => setForm((p) => ({ ...p, sector_id: e.target.value, crd_id: '' }))}
            className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm"
          >
            <option value="">Setor</option>
            {visibleSectors.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>

          <select
            value={form.crd_id}
            onChange={(e) => setForm((p) => ({ ...p, crd_id: e.target.value }))}
            disabled={!form.sector_id}
            className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm disabled:opacity-50"
          >
            <option value="">CRD (opcional)</option>
            {visibleCrds.map((c) => (
              <option key={c.id} value={c.id}>{c.code} - {c.name}</option>
            ))}
          </select>

          {visibleSectors.length === 0 && (
            <p className="md:col-span-6 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
              Nenhum setor disponível para os vínculos do seu usuário.
            </p>
          )}

          <label className="flex flex-col gap-1 min-w-0">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Data de emissão</span>
            <input
              required
              type="date"
              value={form.issue_date}
              onChange={(e) => setForm((p) => ({ ...p, issue_date: e.target.value }))}
              className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm"
            />
          </label>

          <label className="flex flex-col gap-1 min-w-0">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Data de lançamento</span>
            <input
              required
              type="date"
              value={form.date}
              onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
              className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm"
            />
          </label>

          <input
            required
            type="number"
            step="0.01"
            min="0"
            placeholder="Valor"
            value={form.amount}
            onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
            className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm self-end"
          />

          <input
            placeholder="Descrição (opcional)"
            value={form.description}
            onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
            className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm self-end"
          />

          <label
            className={cn(
              'md:col-span-5 flex items-center justify-center gap-2 w-full px-4 py-3 border border-dashed rounded-xl text-sm cursor-pointer transition-colors self-end',
              uploadingFile
                ? 'bg-slate-50 border-slate-300 text-slate-600'
                : form.file_path
                  ? 'bg-sky-50 border-sky-300 text-sky-800 hover:bg-sky-100'
                  : 'bg-slate-50 border-slate-300 text-slate-600 hover:bg-slate-100'
            )}
            title={form.file_name || undefined}
          >
            {form.file_path && !uploadingFile ? (
              <FileCheck className="w-4 h-4 shrink-0 text-sky-600" />
            ) : (
              <Upload className="w-4 h-4 shrink-0" />
            )}
            <span className="truncate">
              {uploadingFile
                ? 'Enviando arquivo...'
                : form.file_name
                  ? form.file_name
                  : 'Anexar arquivo (PDF, imagem, Excel ou Word)'}
            </span>
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,.xls,.xlsx,.doc,.docx,application/pdf,image/*"
              className="hidden"
              disabled={uploadingFile}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileUpload(file);
                e.target.value = '';
              }}
            />
          </label>

          <button
            type="submit"
            disabled={uploadingFile}
            className="flex items-center justify-center gap-2 bg-[#004D40] text-white px-4 py-2.5 rounded-xl shadow-lg shadow-emerald-900/10 hover:bg-[#003d33] transition-colors self-end disabled:opacity-60 disabled:pointer-events-none"
          >
            <Plus className="w-4 h-4" />
            <span className="font-bold text-sm">Lançar</span>
          </button>
        </form>
      )}

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50/50">
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Setor / CRD</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Fornecedor</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Emissão</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Lançamento</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Vencimento</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Anexo</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Valor</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filteredEntries.length === 0 && (
              <tr>
                <td colSpan={9} className="px-6 py-10 text-center text-sm text-slate-400">
                  Nenhum lançamento manual encontrado.
                </td>
              </tr>
            )}
            {filteredEntries.map((entry) => {
              const meta = statusMeta(entry.status);
              return (
                <tr key={entry.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4 text-sm font-medium text-slate-700">
                    {entry.sector_name || 'Sem setor'}
                    {entry.crd_code ? (
                      <span className="block text-xs font-normal text-slate-500">
                        {entry.crd_code} - {entry.crd_name || 'CRD'}
                      </span>
                    ) : null}
                    {entry.user_name ? (
                      <span className="block text-[10px] font-normal text-slate-400 mt-0.5">por {entry.user_name}</span>
                    ) : null}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-600">{entry.description || '—'}</td>
                  <td className="px-6 py-4 text-sm text-slate-600">{entry.issue_date || '—'}</td>
                  <td className="px-6 py-4 text-sm text-slate-600">{entry.date}</td>
                  <td className="px-6 py-4 text-sm text-slate-400">—</td>
                  <td className="px-6 py-4">
                    {entry.file_path ? (
                      <button
                        type="button"
                        onClick={() => openEntryDocument(entry)}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 bg-blue-50 px-2 py-1 rounded-lg hover:bg-blue-100 transition-colors"
                        title={entry.file_name || 'Abrir anexo'}
                      >
                        <Paperclip className="w-3.5 h-3.5" />
                        <span className="max-w-[140px] truncate">{entry.file_name || 'Abrir'}</span>
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <ValueTrace
                      className="text-sm font-bold text-slate-900"
                      displayValue={formatCurrency(entry.amount)}
                      meta={valueTrace.manualEntries.amount(entry.id)}
                    />
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn('text-[10px] font-bold px-2 py-1 rounded-lg uppercase tracking-wider', meta.classes)}>
                      {meta.label}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex justify-end gap-2">
                      {canApproveControl && entry.status === 'open' && (
                        <>
                          <button
                            onClick={() => updateStatus(entry.id, 'approved')}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Aprovar no Controle"
                          >
                            <BadgeCheck className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => updateStatus(entry.id, 'cancelled')}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Reprovar / cancelar"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        </>
                      )}
                      {canApproveControl && entry.status === 'approved' && (
                        <button
                          onClick={() => updateStatus(entry.id, 'open')}
                          className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                          title="Desaprovar e devolver"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                      )}
                      {canPayFinance && entry.status === 'approved' && (
                        <button
                          onClick={() => updateStatus(entry.id, 'posted')}
                          className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                          title="Baixar / pagar (Financeiro)"
                        >
                          <Archive className="w-4 h-4" />
                        </button>
                      )}
                      {canCancelAsRequester && (entry.status === 'open' || entry.status === 'approved') && (
                        <button
                          onClick={() => updateStatus(entry.id, 'cancelled')}
                          className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                          title="Cancelar lançamento"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      )}
                      {userRole === 'admin' && (
                        <button
                          onClick={() => deleteEntry(entry)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Excluir lançamento definitivamente (apenas admin)"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
