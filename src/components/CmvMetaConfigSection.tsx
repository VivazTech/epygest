import React, { useEffect, useMemo, useState } from 'react';
import { History, Loader2, Percent, Plus, Save } from 'lucide-react';
import { cn } from '../lib/utils';
import { useToast } from '../context/ToastContext';
import {
  CmvMetaConfigRow,
  formatVigenciaMetaLabel,
  resolveCmvMetaForDate,
} from '../lib/cmvMeta';

const fmtPct = (fraction: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(fraction) ? fraction : 0);

const emptyMetaForm = () => ({
  nome: '',
  meta_pct: '29',
  vigencia_inicio: new Date().toISOString().slice(0, 10),
  vigencia_fim: '',
  observacoes: '',
  fechar_anterior: true,
});

const isVigente = (row: CmvMetaConfigRow, today: string) => {
  if (row.vigencia_inicio > today) return false;
  if (row.vigencia_fim && row.vigencia_fim < today) return false;
  return true;
};

type CmvMetaConfigSectionProps = {
  canEdit: boolean;
};

export const CmvMetaConfigSection: React.FC<CmvMetaConfigSectionProps> = ({ canEdit }) => {
  const { showSuccess } = useToast();
  const today = new Date().toISOString().slice(0, 10);
  const [rows, setRows] = useState<CmvMetaConfigRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState(emptyMetaForm);
  const [showForm, setShowForm] = useState(false);
  const [encerrandoId, setEncerrandoId] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/cmv/meta');
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Falha ao carregar meta.');
      setRows(Array.isArray(json.rows) ? json.rows : []);
    } catch (err: any) {
      setRows([]);
      setError(err?.message || 'Erro ao carregar meta de CMV.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const vigente = useMemo(() => resolveCmvMetaForDate(rows, today), [rows, today]);

  const submit = async () => {
    if (!canEdit) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/cmv/meta', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          vigencia_fim: form.vigencia_fim.trim() || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Falha ao salvar.');
      showSuccess('Nova meta de CMV registrada.');
      setForm(emptyMetaForm());
      setShowForm(false);
      await load();
    } catch (err: any) {
      setError(err?.message || 'Erro ao salvar meta.');
    } finally {
      setSaving(false);
    }
  };

  const encerrar = async (row: CmvMetaConfigRow) => {
    if (!canEdit) return;
    const fim = window.prompt(`Encerrar meta "${row.nome}" em qual data? (AAAA-MM-DD)`, today);
    if (!fim) return;
    setEncerrandoId(row.id);
    try {
      const res = await fetch(`/api/cmv/meta/${row.id}/encerrar`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vigencia_fim: fim }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Falha ao encerrar.');
      showSuccess('Vigência da meta encerrada.');
      await load();
    } catch (err: any) {
      setError(err?.message || 'Erro ao encerrar vigência.');
    } finally {
      setEncerrandoId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Percent className="w-5 h-5 text-[#004D40]" />
          <h3 className="text-lg font-bold text-slate-900">Meta de CMV</h3>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#004D40] text-white text-xs font-bold rounded-xl hover:bg-[#003d33]"
          >
            <Plus className="w-3.5 h-3.5" />
            Nova meta
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Vigente hoje</p>
        <p className="text-2xl font-extrabold text-[#004D40] tabular-nums mt-1">
          {fmtPct(vigente.meta_pct)}
        </p>
        {vigente.config && (
          <p className="text-xs text-slate-500 mt-1">
            {vigente.config.nome} · {formatVigenciaMetaLabel(vigente.config)}
          </p>
        )}
      </div>

      {showForm && canEdit && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="text-sm block">
              Nome
              <input
                value={form.nome}
                onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))}
                placeholder="Ex.: Meta 2027"
                className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
              />
            </label>
            <label className="text-sm block">
              Meta (%)
              <input
                value={form.meta_pct}
                onChange={(e) => setForm((p) => ({ ...p, meta_pct: e.target.value }))}
                placeholder="29"
                className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
              />
            </label>
            <label className="text-sm block">
              Vigência início
              <input
                type="date"
                value={form.vigencia_inicio}
                onChange={(e) => setForm((p) => ({ ...p, vigencia_inicio: e.target.value }))}
                className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
              />
            </label>
            <label className="text-sm block">
              Vigência fim (opcional)
              <input
                type="date"
                value={form.vigencia_fim}
                onChange={(e) => setForm((p) => ({ ...p, vigencia_fim: e.target.value }))}
                className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
              />
            </label>
          </div>
          <label className="text-sm block">
            Observações
            <textarea
              value={form.observacoes}
              onChange={(e) => setForm((p) => ({ ...p, observacoes: e.target.value }))}
              rows={2}
              className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={form.fechar_anterior}
              onChange={(e) => setForm((p) => ({ ...p, fechar_anterior: e.target.checked }))}
            />
            Encerrar meta anterior em aberto
          </label>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={submit}
              disabled={saving || !form.nome.trim()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#004D40] text-white text-sm font-bold rounded-xl disabled:opacity-40"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Salvar meta
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
          <History className="w-4 h-4 text-slate-500" />
          <span className="text-sm font-bold text-slate-800">Histórico de metas</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-[10px] font-extrabold text-slate-500 uppercase">
                <th className="px-4 py-2">Nome</th>
                <th className="px-4 py-2 text-right">Meta</th>
                <th className="px-4 py-2">Vigência</th>
                <th className="px-4 py-2">Criado por</th>
                {canEdit && <th className="px-4 py-2" />}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={canEdit ? 5 : 4} className="px-4 py-6 text-center text-slate-400">
                    <Loader2 className="w-5 h-5 animate-spin inline-block" />
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={canEdit ? 5 : 4} className="px-4 py-6 text-center text-slate-400">
                    Nenhuma meta cadastrada.
                  </td>
                </tr>
              )}
              {!loading &&
                rows.map((row) => (
                  <tr key={row.id} className={cn('border-t border-slate-100', isVigente(row, today) && 'bg-emerald-50/40')}>
                    <td className="px-4 py-2 font-medium">{row.nome}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-bold">{fmtPct(row.meta_pct)}</td>
                    <td className="px-4 py-2 text-slate-600 whitespace-nowrap">{formatVigenciaMetaLabel(row)}</td>
                    <td className="px-4 py-2 text-xs text-slate-500">{row.created_by_name || '—'}</td>
                    {canEdit && (
                      <td className="px-4 py-2">
                        {!row.vigencia_fim && (
                          <button
                            type="button"
                            onClick={() => encerrar(row)}
                            disabled={encerrandoId === row.id}
                            className="text-xs font-bold text-amber-700 hover:underline"
                          >
                            Encerrar
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
