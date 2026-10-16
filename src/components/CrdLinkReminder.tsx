import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Link2, Loader2, X } from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import { useCompany } from '../context/CompanyContext';
import { useToast } from '../context/ToastContext';

// Aviso proativo: lançamentos manuais do próprio usuário que ficaram SEM CRD.
// Sem CRD, o valor não sobe para a coluna Realizado do Prev x Real Diário.
// Mostra quais são e permite vincular um CRD na hora.

type SemCrdEntry = {
  id: number;
  description: string | null;
  amount: number;
  date: string;
  sector_id: number;
  sector_name: string | null;
  status: string;
};

type CrdOption = {
  id: number;
  code: string;
  name: string;
  sector_id: number;
  active?: boolean;
};

const SHARED_CODES = ['326'];

const fmtDate = (iso: string) => {
  const s = String(iso || '').slice(0, 10);
  const [y, m, d] = s.split('-');
  return y && m && d ? `${d}/${m}/${y}` : s;
};

export const CrdLinkReminder: React.FC = () => {
  const { companyKey } = useCompany();
  const { showSuccess } = useToast();
  const [entries, setEntries] = useState<SemCrdEntry[]>([]);
  const [crds, setCrds] = useState<CrdOption[]>([]);
  const [selection, setSelection] = useState<Record<number, string>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [semRes, crdRes] = await Promise.all([
        fetch('/api/manual-entries/sem-crd'),
        fetch('/api/crds'),
      ]);
      if (!semRes.ok) return; // silencioso: aviso é secundário
      const semJson = await semRes.json().catch(() => ({ entries: [] }));
      const list: SemCrdEntry[] = Array.isArray(semJson.entries) ? semJson.entries : [];
      const crdJson = crdRes.ok ? await crdRes.json().catch(() => []) : [];
      setCrds(
        (Array.isArray(crdJson) ? crdJson : []).map((c: any) => ({
          id: Number(c.id),
          code: String(c.code ?? ''),
          name: String(c.name ?? ''),
          sector_id: Number(c.sector_id),
          active: c.active !== false,
        }))
      );
      setEntries(list);
      setOpen(list.length > 0);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, companyKey]);

  const crdsBySector = useMemo(() => {
    const map = new Map<number, CrdOption[]>();
    for (const c of crds) {
      if (c.active === false) continue;
      if (!map.has(c.sector_id)) map.set(c.sector_id, []);
      map.get(c.sector_id)!.push(c);
    }
    return map;
  }, [crds]);

  const optionsFor = useCallback(
    (sectorId: number) => {
      const own = crdsBySector.get(sectorId) ?? [];
      const shared = crds.filter((c) => SHARED_CODES.includes(c.code) && c.sector_id !== sectorId);
      return [...own, ...shared];
    },
    [crdsBySector, crds]
  );

  const vincular = async (entry: SemCrdEntry) => {
    const crdId = Number(selection[entry.id]);
    if (!Number.isFinite(crdId) || crdId <= 0) {
      setError('Escolha um CRD para vincular.');
      return;
    }
    setSavingId(entry.id);
    setError('');
    try {
      const res = await fetch(`/api/manual-entries/${entry.id}/crd`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ crd_id: crdId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Falha ao vincular o CRD.');
      const remaining = entries.filter((e) => e.id !== entry.id);
      setEntries(remaining);
      showSuccess(`Lançamento vinculado ao CRD ${json.crd_code || ''} ${json.crd_name || ''}.`.trim());
      if (remaining.length === 0) setOpen(false);
    } catch (err: any) {
      setError(err?.message || 'Erro ao vincular o CRD.');
    } finally {
      setSavingId(null);
    }
  };

  if (!open || entries.length === 0) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-start gap-3 px-5 py-4 border-b border-slate-100 bg-amber-50">
          <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-amber-900">
              Você tem {entries.length} lançamento{entries.length > 1 ? 's' : ''} sem CRD
            </h3>
            <p className="text-xs text-amber-800 mt-0.5">
              Sem CRD, o valor não entra na coluna <strong>Realizado</strong> do Prev x Real Diário.
              Vincule um CRD para cada lançamento abaixo.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="p-1 rounded-lg text-amber-700 hover:bg-amber-100"
            title="Fechar (avisaremos de novo depois)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="px-5 py-2 text-xs text-red-700 bg-red-50 border-b border-red-100">{error}</div>
        )}

        <div className="max-h-[60vh] overflow-y-auto divide-y divide-slate-100">
          {entries.map((entry) => {
            const opts = optionsFor(entry.sector_id);
            return (
              <div key={entry.id} className="px-5 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800 truncate">
                    {entry.description || '(sem descrição)'}
                  </p>
                  <p className="text-xs text-slate-500">
                    {fmtDate(entry.date)} · {entry.sector_name || `Setor ${entry.sector_id}`} ·{' '}
                    <span className="font-semibold tabular-nums">{formatCurrency(entry.amount)}</span>
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <select
                    value={selection[entry.id] ?? ''}
                    onChange={(e) => setSelection((p) => ({ ...p, [entry.id]: e.target.value }))}
                    className="w-56 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                  >
                    <option value="">Escolher CRD…</option>
                    {opts.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} — {c.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={savingId === entry.id || !selection[entry.id]}
                    onClick={() => vincular(entry)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 bg-[#004D40] text-white text-xs font-bold rounded-xl hover:bg-[#003d33] disabled:opacity-40"
                  >
                    {savingId === entry.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
                    Vincular
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="px-5 py-3 border-t border-slate-100 flex justify-end">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 rounded-xl"
          >
            Agora não
          </button>
        </div>
      </div>
    </div>
  );
};
