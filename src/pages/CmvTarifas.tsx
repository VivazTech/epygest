import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarRange,
  History,
  Loader2,
  Plus,
  RefreshCcw,
  Save,
  Settings2,
  ShieldAlert,
} from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import { useToast } from '../context/ToastContext';
import {
  CMV_TARIFA_MOTIVO_LABELS,
  CMV_TARIFA_MOTIVO_PRIORIDADE,
  CmvTarifaConfigRow,
  CmvTarifaMotivo,
  formatVigenciaLabel,
  resolveCmvTarifasForDate,
} from '../lib/cmvTarifas';
import { CmvMetaConfigSection } from '../components/CmvMetaConfigSection';

const MOTIVOS = Object.keys(CMV_TARIFA_MOTIVO_LABELS) as CmvTarifaMotivo[];

const emptyForm = () => ({
  nome: '',
  motivo: 'padrao' as CmvTarifaMotivo,
  prioridade: String(CMV_TARIFA_MOTIVO_PRIORIDADE.padrao),
  vigencia_inicio: new Date().toISOString().slice(0, 10),
  vigencia_fim: '',
  cafe_manha_adulto: '70',
  cafe_manha_crianca: '35',
  pensao_adulto: '130',
  pensao_crianca: '65',
  observacoes: '',
  fechar_padrao_anterior: true,
});

const isVigenteHoje = (row: CmvTarifaConfigRow, today: string) => {
  if (row.vigencia_inicio > today) return false;
  if (row.vigencia_fim && row.vigencia_fim < today) return false;
  return true;
};

const getCachedRole = (): string => {
  try {
    return String(JSON.parse(localStorage.getItem('user') || '{}')?.role || '');
  } catch {
    return '';
  }
};

export const CmvTarifasPage: React.FC = () => {
  const { showSuccess } = useToast();
  const today = new Date().toISOString().slice(0, 10);
  const role = getCachedRole();
  const canEdit = role === 'admin' || role === 'finance' || role === 'controle';

  const [rows, setRows] = useState<CmvTarifaConfigRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [encerrandoId, setEncerrandoId] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/cmv/tarifas');
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Falha ao carregar tarifas.');
      setRows(Array.isArray(json.rows) ? json.rows : []);
    } catch (err: any) {
      setRows([]);
      setError(err?.message || 'Erro ao carregar tarifas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const vigenteHoje = useMemo(
    () => resolveCmvTarifasForDate(rows, today),
    [rows, today]
  );

  const onMotivoChange = (motivo: CmvTarifaMotivo) => {
    setForm((prev) => ({
      ...prev,
      motivo,
      prioridade: String(CMV_TARIFA_MOTIVO_PRIORIDADE[motivo] ?? 0),
    }));
  };

  const submit = async () => {
    if (!canEdit) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/cmv/tarifas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          vigencia_fim: form.vigencia_fim.trim() || null,
          prioridade: Number(form.prioridade) || 0,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Falha ao salvar.');
      showSuccess('Nova vigência de tarifas registrada.');
      setForm(emptyForm());
      setShowForm(false);
      await load();
    } catch (err: any) {
      setError(err?.message || 'Erro ao salvar tarifas.');
    } finally {
      setSaving(false);
    }
  };

  const encerrar = async (row: CmvTarifaConfigRow) => {
    if (!canEdit) return;
    const fim = window.prompt(
      `Encerrar vigência "${row.nome}" em qual data? (AAAA-MM-DD)`,
      today
    );
    if (!fim) return;
    setEncerrandoId(row.id);
    setError('');
    try {
      const res = await fetch(`/api/cmv/tarifas/${row.id}/encerrar`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vigencia_fim: fim }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Falha ao encerrar.');
      showSuccess('Vigência encerrada.');
      await load();
    } catch (err: any) {
      setError(err?.message || 'Erro ao encerrar vigência.');
    } finally {
      setEncerrandoId(null);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Settings2 className="w-6 h-6 text-[#004D40]" />
            Configurações do CMV
          </h2>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl">
            Meta de CMV, tarifas internas (café e pensão) e histórico de vigências. Alterações restritas
            a admin, finance e controle.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-bold rounded-xl hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCcw className={cn('w-4 h-4', loading && 'animate-spin')} />
            Atualizar
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={() => setShowForm((v) => !v)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#004D40] text-white text-sm font-bold rounded-xl hover:bg-[#003d33]"
            >
              <Plus className="w-4 h-4" />
              Nova vigência
            </button>
          )}
        </div>
      </div>

      {!canEdit && (
        <div className="flex items-center gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          Apenas usuários com perfil admin, finance ou controle podem alterar as tarifas.
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      <CmvMetaConfigSection canEdit={canEdit} />

      <div className="border-t border-slate-200 pt-6 space-y-4">
        <h3 className="text-lg font-bold text-slate-900">Tarifas internas</h3>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 bg-[#004D40]/5 flex items-center gap-2">
          <CalendarRange className="w-4 h-4 text-[#004D40]" />
          <h3 className="text-base font-extrabold text-[#004D40]">
            Vigente em {today.split('-').reverse().join('/')}
          </h3>
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <p className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest mb-2">
              Café da manhã
            </p>
            <div className="space-y-1 text-sm">
              <p>
                Adulto:{' '}
                <strong className="tabular-nums">{formatCurrency(vigenteHoje.rates.cafe_manha_adulto)}</strong>
              </p>
              <p>
                Criança:{' '}
                <strong className="tabular-nums">{formatCurrency(vigenteHoje.rates.cafe_manha_crianca)}</strong>
              </p>
            </div>
          </div>
          <div>
            <p className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest mb-2">
              Pensão / almoço / jantar
            </p>
            <div className="space-y-1 text-sm">
              <p>
                Adulto:{' '}
                <strong className="tabular-nums">{formatCurrency(vigenteHoje.rates.pensao_adulto)}</strong>
              </p>
              <p>
                Criança / outras categorias:{' '}
                <strong className="tabular-nums">{formatCurrency(vigenteHoje.rates.pensao_crianca)}</strong>
              </p>
            </div>
          </div>
        </div>
        {vigenteHoje.config && (
          <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 text-xs text-slate-600">
            Fonte: <strong>{vigenteHoje.config.nome}</strong> (
            {CMV_TARIFA_MOTIVO_LABELS[vigenteHoje.config.motivo as CmvTarifaMotivo] ||
              vigenteHoje.config.motivo}
            ) · {formatVigenciaLabel(vigenteHoje.config)}
          </div>
        )}
      </div>

      {showForm && canEdit && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
          <h3 className="text-base font-bold text-slate-900">Nova vigência</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <label className="block text-sm">
              <span className="text-slate-600 font-medium">Nome / descrição</span>
              <input
                value={form.nome}
                onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))}
                placeholder="Ex.: Tarifa padrão 2027"
                className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600 font-medium">Motivo</span>
              <select
                value={form.motivo}
                onChange={(e) => onMotivoChange(e.target.value as CmvTarifaMotivo)}
                className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
              >
                {MOTIVOS.map((m) => (
                  <option key={m} value={m}>
                    {CMV_TARIFA_MOTIVO_LABELS[m]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-slate-600 font-medium">Prioridade</span>
              <input
                type="number"
                min={0}
                max={99}
                value={form.prioridade}
                onChange={(e) => setForm((p) => ({ ...p, prioridade: e.target.value }))}
                className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600 font-medium">Vigência início</span>
              <input
                type="date"
                value={form.vigencia_inicio}
                onChange={(e) => setForm((p) => ({ ...p, vigencia_inicio: e.target.value }))}
                className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
              />
            </label>
            <label className="block text-sm">
              <span className="text-slate-600 font-medium">Vigência fim (opcional)</span>
              <input
                type="date"
                value={form.vigencia_fim}
                onChange={(e) => setForm((p) => ({ ...p, vigencia_fim: e.target.value }))}
                className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <fieldset className="border border-slate-100 rounded-xl p-4">
              <legend className="text-xs font-bold text-slate-500 uppercase px-1">Café da manhã</legend>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm">
                  Adulto (R$)
                  <input
                    value={form.cafe_manha_adulto}
                    onChange={(e) => setForm((p) => ({ ...p, cafe_manha_adulto: e.target.value }))}
                    className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                  />
                </label>
                <label className="text-sm">
                  Criança (R$)
                  <input
                    value={form.cafe_manha_crianca}
                    onChange={(e) => setForm((p) => ({ ...p, cafe_manha_crianca: e.target.value }))}
                    className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                  />
                </label>
              </div>
            </fieldset>
            <fieldset className="border border-slate-100 rounded-xl p-4">
              <legend className="text-xs font-bold text-slate-500 uppercase px-1">Pensão</legend>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm">
                  Adulto (R$)
                  <input
                    value={form.pensao_adulto}
                    onChange={(e) => setForm((p) => ({ ...p, pensao_adulto: e.target.value }))}
                    className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                  />
                </label>
                <label className="text-sm">
                  Criança / outras (R$)
                  <input
                    value={form.pensao_crianca}
                    onChange={(e) => setForm((p) => ({ ...p, pensao_crianca: e.target.value }))}
                    className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                  />
                </label>
              </div>
            </fieldset>
          </div>

          <label className="block text-sm">
            <span className="text-slate-600 font-medium">Observações</span>
            <textarea
              value={form.observacoes}
              onChange={(e) => setForm((p) => ({ ...p, observacoes: e.target.value }))}
              rows={2}
              className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
            />
          </label>

          {form.motivo === 'padrao' && (
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={form.fechar_padrao_anterior}
                onChange={(e) => setForm((p) => ({ ...p, fechar_padrao_anterior: e.target.checked }))}
              />
              Encerrar automaticamente a tarifa padrão anterior em aberto
            </label>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 rounded-xl"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={saving || !form.nome.trim()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#004D40] text-white text-sm font-bold rounded-xl hover:bg-[#003d33] disabled:opacity-40"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Salvar vigência
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          <History className="w-4 h-4 text-slate-500" />
          <h3 className="text-base font-bold text-slate-900">Histórico de configurações</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">Motivo</th>
                <th className="px-4 py-3">Vigência</th>
                <th className="px-4 py-3 text-right">Café adulto</th>
                <th className="px-4 py-3 text-right">Café criança</th>
                <th className="px-4 py-3 text-right">Pensão adulto</th>
                <th className="px-4 py-3 text-right">Pensão criança</th>
                <th className="px-4 py-3">Criado por</th>
                {canEdit && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={canEdit ? 9 : 8} className="px-4 py-8 text-center text-slate-400">
                    <Loader2 className="w-5 h-5 animate-spin inline-block" />
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={canEdit ? 9 : 8} className="px-4 py-8 text-center text-slate-400">
                    Nenhuma configuração cadastrada.
                  </td>
                </tr>
              )}
              {!loading &&
                rows.map((row) => {
                  const ativo = isVigenteHoje(row, today);
                  return (
                    <tr
                      key={row.id}
                      className={cn(
                        'border-t border-slate-100',
                        ativo && 'bg-emerald-50/50'
                      )}
                    >
                      <td className="px-4 py-3 font-medium text-slate-800">
                        {row.nome}
                        {ativo && (
                          <span className="ml-2 text-[10px] font-bold uppercase text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                            vigente
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {CMV_TARIFA_MOTIVO_LABELS[row.motivo as CmvTarifaMotivo] || row.motivo}
                      </td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                        {formatVigenciaLabel(row)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatCurrency(row.cafe_manha_adulto)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatCurrency(row.cafe_manha_crianca)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatCurrency(row.pensao_adulto)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatCurrency(row.pensao_crianca)}
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-xs">
                        {row.created_by_name || '—'}
                        {row.created_at && (
                          <div className="text-[10px] opacity-70">
                            {new Date(row.created_at).toLocaleString('pt-BR')}
                          </div>
                        )}
                      </td>
                      {canEdit && (
                        <td className="px-4 py-3">
                          {!row.vigencia_fim && (
                            <button
                              type="button"
                              onClick={() => encerrar(row)}
                              disabled={encerrandoId === row.id}
                              className="text-xs font-bold text-amber-700 hover:underline disabled:opacity-50"
                            >
                              {encerrandoId === row.id ? '...' : 'Encerrar'}
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
