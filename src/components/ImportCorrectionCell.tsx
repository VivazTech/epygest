import React, { useEffect, useState } from 'react';
import { History, Pencil } from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import {
  IMPORT_CORRECTION_SOURCES,
  type CorrectableValueMeta,
  type ImportCorrectionSourceTable,
} from '../lib/importCorrections';

type ImportCorrectionCellProps = {
  sourceTable: ImportCorrectionSourceTable;
  rowId: number;
  fieldName: string;
  meta: CorrectableValueMeta;
  rowLabel?: string;
  year: number;
  month: number;
  canEdit?: boolean;
  onSaved?: () => void;
  className?: string;
};

const formatValue = (value: number, currency?: boolean, decimals = 2) => {
  if (currency) return formatCurrency(value);
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(value);
};

export const ImportCorrectionCell: React.FC<ImportCorrectionCellProps> = ({
  sourceTable,
  rowId,
  fieldName,
  meta,
  rowLabel,
  year,
  month,
  canEdit = false,
  onSaved,
  className,
}) => {
  const fieldCfg = IMPORT_CORRECTION_SOURCES[sourceTable]?.fields[fieldName];
  const [open, setOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [valor, setValor] = useState(String(meta.value));
  const [motivo, setMotivo] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    if (open) {
      setValor(String(meta.value));
      setMotivo('');
      setError('');
    }
  }, [open, meta.value]);

  const loadHistory = async () => {
    setLoadingHistory(true);
    try {
      const qs = new URLSearchParams({
        source_table: sourceTable,
        row_id: String(rowId),
        field_name: fieldName,
      });
      const res = await fetch(`/api/import/correcoes/historico?${qs}`);
      const json = await res.json().catch(() => ({}));
      if (res.ok) setHistory(Array.isArray(json.rows) ? json.rows : []);
    } finally {
      setLoadingHistory(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/import/correcoes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_table: sourceTable,
          row_id: rowId,
          field_name: fieldName,
          year,
          month,
          row_label: rowLabel,
          valor_corrigido: valor,
          motivo,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Falha ao salvar correção.');
      setOpen(false);
      onSaved?.();
    } catch (err: any) {
      setError(err?.message || 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  const display = formatValue(meta.value, fieldCfg?.currency, fieldCfg?.decimals ?? 2);

  return (
    <>
      <div className={cn('inline-flex items-center justify-end gap-1 group', className)}>
        <span
          className={cn(
            'tabular-nums',
            meta.is_corrected && 'text-amber-800 font-semibold underline decoration-amber-300 decoration-dotted'
          )}
          title={
            meta.is_corrected
              ? `Original: ${formatValue(meta.valor_original, fieldCfg?.currency, fieldCfg?.decimals)}\n${meta.motivo || ''}`
              : undefined
          }
        >
          {display}
        </span>
        {canEdit && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="opacity-0 group-hover:opacity-100 p-1 rounded-lg text-slate-400 hover:text-[#004D40] hover:bg-slate-100 transition-opacity"
            title="Corrigir valor importado"
          >
            <Pencil className="w-3 h-3" />
          </button>
        )}
        {meta.is_corrected && (
          <button
            type="button"
            onClick={() => {
              setHistoryOpen(true);
              loadHistory();
            }}
            className="p-1 rounded-lg text-amber-600 hover:bg-amber-50"
            title="Ver histórico de correções"
          >
            <History className="w-3 h-3" />
          </button>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Correção manual</h3>
            <p className="text-xs text-slate-500">
              {IMPORT_CORRECTION_SOURCES[sourceTable].label} · {fieldCfg?.label || fieldName}
              {rowLabel ? ` · ${rowLabel}` : ''}
            </p>
            <label className="block text-sm">
              <span className="text-slate-600">Valor original (importado)</span>
              <input
                readOnly
                value={formatValue(meta.valor_original, fieldCfg?.currency, fieldCfg?.decimals)}
                className="mt-1 w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Valor corrigido</span>
              <input
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                className="mt-1 w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600">Motivo (obrigatório)</span>
              <textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={3}
                className="mt-1 w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm"
                placeholder="Descreva o motivo da correção excepcional"
              />
            </label>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 text-sm font-bold text-slate-600">
                Cancelar
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving || !motivo.trim()}
                className="px-4 py-2 bg-[#004D40] text-white text-sm font-bold rounded-xl disabled:opacity-40"
              >
                {saving ? 'Salvando...' : 'Registrar correção'}
              </button>
            </div>
          </div>
        </div>
      )}

      {historyOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-5 space-y-3 max-h-[80vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-slate-900">Histórico de correções</h3>
            {loadingHistory && <p className="text-sm text-slate-400">Carregando...</p>}
            {!loadingHistory && history.length === 0 && (
              <p className="text-sm text-slate-400">Nenhum registro.</p>
            )}
            {!loadingHistory &&
              history.map((h) => (
                <div key={h.id} className="border border-slate-100 rounded-xl p-3 text-sm">
                  <p className="font-bold text-slate-800">
                    {formatValue(Number(h.valor_anterior ?? h.valor_original), fieldCfg?.currency, fieldCfg?.decimals)}
                    {' → '}
                    {formatValue(Number(h.valor_corrigido), fieldCfg?.currency, fieldCfg?.decimals)}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Original importado:{' '}
                    {formatValue(Number(h.valor_original), fieldCfg?.currency, fieldCfg?.decimals)}
                  </p>
                  <p className="text-xs text-slate-600 mt-1">{h.motivo}</p>
                  <p className="text-[10px] text-slate-400 mt-1">
                    {h.user_name || h.user_email || '—'} ·{' '}
                    {h.created_at ? new Date(h.created_at).toLocaleString('pt-BR') : '—'}
                  </p>
                </div>
              ))}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                className="px-4 py-2 text-sm font-bold text-slate-600"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
