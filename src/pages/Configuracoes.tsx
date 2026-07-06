import React, { useEffect, useMemo, useState } from 'react';
import { Settings2, Save, RotateCcw, Monitor, Bell, ShieldCheck, MapPin, Plus, Trash2 } from 'lucide-react';
import { useSearch } from '../context/SearchContext';
import { matchesSearch } from '../lib/search';

type SettingsState = {
  companyName: string;
  defaultYear: number;
  currency: 'BRL' | 'USD' | 'EUR';
  language: 'pt-BR' | 'en-US';
  compactTables: boolean;
  autoExpandFilteredCrd: boolean;
  emailNotifications: boolean;
  requireApprovalForPayments: boolean;
};

type PdvLocal = {
  id: number;
  name: string;
  active: boolean;
  sort_order: number;
};

const STORAGE_KEY = 'epygest:system-settings';

const defaultSettings: SettingsState = {
  companyName: 'Hotel Vivaz Cataratas',
  defaultYear: new Date().getFullYear(),
  currency: 'BRL',
  language: 'pt-BR',
  compactTables: false,
  autoExpandFilteredCrd: true,
  emailNotifications: true,
  requireApprovalForPayments: true,
};

export const ConfiguracoesPage: React.FC = () => {
  const { query } = useSearch();
  const [settings, setSettings] = useState<SettingsState>(defaultSettings);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [pdvLocais, setPdvLocais] = useState<PdvLocal[]>([]);
  const [newPdvLocal, setNewPdvLocal] = useState('');
  const [pdvLoading, setPdvLoading] = useState(false);
  const [pdvError, setPdvError] = useState<string | null>(null);
  const showSection = useMemo(
    () => (title: string, ...labels: string[]) => matchesSearch(query, title, ...labels),
    [query]
  );

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      setSettings({
        ...defaultSettings,
        ...parsed,
      });
    } catch {
      // ignora erro de parse e mantém padrão
    }
  }, []);

  const loadPdvLocais = async () => {
    setPdvLoading(true);
    setPdvError(null);
    try {
      const res = await fetch('/api/pdv-locais?all=1');
      const data = await res.json().catch(() => null);
      if (!res.ok || !Array.isArray(data)) {
        setPdvError((data as any)?.error || 'Não foi possível carregar os locais PDV.');
        setPdvLocais([]);
        return;
      }
      setPdvLocais(data);
    } catch {
      setPdvError('Não foi possível carregar os locais PDV.');
      setPdvLocais([]);
    } finally {
      setPdvLoading(false);
    }
  };

  useEffect(() => {
    loadPdvLocais();
  }, []);

  const addPdvLocal = async () => {
    const name = newPdvLocal.trim();
    if (!name) return;
    setPdvError(null);
    const res = await fetch('/api/pdv-locais', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setPdvError(data.error || 'Não foi possível adicionar o local.');
      return;
    }
    setNewPdvLocal('');
    loadPdvLocais();
  };

  const removePdvLocal = async (id: number) => {
    if (!window.confirm('Remover este local PDV?')) return;
    setPdvError(null);
    const res = await fetch(`/api/pdv-locais/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setPdvError(data.error || 'Não foi possível remover o local.');
      return;
    }
    loadPdvLocais();
  };

  const togglePdvLocal = async (local: PdvLocal) => {
    setPdvError(null);
    const res = await fetch(`/api/pdv-locais/${local.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !local.active }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setPdvError(data.error || 'Não foi possível atualizar o local.');
      return;
    }
    loadPdvLocais();
  };

  const saveSettings = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    setSavedAt(new Date().toLocaleString('pt-BR'));
  };

  const resetSettings = () => {
    setSettings(defaultSettings);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultSettings));
    setSavedAt(new Date().toLocaleString('pt-BR'));
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Configurações do Sistema</h2>
          <p className="text-slate-500 text-sm">Defina preferências gerais do ambiente financeiro.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={resetSettings}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-bold hover:bg-slate-50 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Restaurar padrão
          </button>
          <button
            onClick={saveSettings}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#004D40] text-white text-sm font-bold hover:bg-[#003d33] transition-colors"
          >
            <Save className="w-4 h-4" />
            Salvar
          </button>
        </div>
      </div>

      {savedAt && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-800">
          Configurações salvas com sucesso em {savedAt}.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {showSection('Preferências gerais', 'Nome da empresa', 'Ano padrão', 'Moeda', settings.companyName) && (
        <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Settings2 className="w-4 h-4 text-slate-500" />
            <h3 className="text-sm font-bold text-slate-800">Preferências gerais</h3>
          </div>

          <div className="space-y-3">
            <label className="block">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Nome da empresa</span>
              <input
                value={settings.companyName}
                onChange={(e) => setSettings((prev) => ({ ...prev, companyName: e.target.value }))}
                className="mt-1 w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-sm"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Ano padrão</span>
                <input
                  type="number"
                  min={2000}
                  max={2100}
                  value={settings.defaultYear}
                  onChange={(e) =>
                    setSettings((prev) => ({ ...prev, defaultYear: Number(e.target.value) || new Date().getFullYear() }))
                  }
                  className="mt-1 w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-sm"
                />
              </label>

              <label className="block">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Moeda</span>
                <select
                  value={settings.currency}
                  onChange={(e) =>
                    setSettings((prev) => ({ ...prev, currency: e.target.value as SettingsState['currency'] }))
                  }
                  className="mt-1 w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-sm"
                >
                  <option value="BRL">BRL (R$)</option>
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                </select>
              </label>
            </div>
          </div>
        </section>
        )}

        {showSection('Interface e experiência', 'Tabelas compactas', 'Abrir CRD filtrado', 'Idioma') && (
        <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Monitor className="w-4 h-4 text-slate-500" />
            <h3 className="text-sm font-bold text-slate-800">Interface e experiência</h3>
          </div>

          <div className="space-y-3">
            <label className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 border border-slate-200">
              <span className="text-sm text-slate-700">Tabelas compactas</span>
              <input
                type="checkbox"
                checked={settings.compactTables}
                onChange={(e) => setSettings((prev) => ({ ...prev, compactTables: e.target.checked }))}
              />
            </label>

            <label className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 border border-slate-200">
              <span className="text-sm text-slate-700">Abrir CRD filtrado automaticamente na Síntase</span>
              <input
                type="checkbox"
                checked={settings.autoExpandFilteredCrd}
                onChange={(e) => setSettings((prev) => ({ ...prev, autoExpandFilteredCrd: e.target.checked }))}
              />
            </label>

            <label className="block">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Idioma</span>
              <select
                value={settings.language}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, language: e.target.value as SettingsState['language'] }))
                }
                className="mt-1 w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-sm"
              >
                <option value="pt-BR">Português (Brasil)</option>
                <option value="en-US">English (US)</option>
              </select>
            </label>
          </div>
        </section>
        )}

        {showSection('Notificações', 'Receber alertas por e-mail') && (
        <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-slate-500" />
            <h3 className="text-sm font-bold text-slate-800">Notificações</h3>
          </div>
          <label className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 border border-slate-200">
            <span className="text-sm text-slate-700">Receber alertas por e-mail</span>
            <input
              type="checkbox"
              checked={settings.emailNotifications}
              onChange={(e) => setSettings((prev) => ({ ...prev, emailNotifications: e.target.checked }))}
            />
          </label>
        </section>
        )}

        {showSection('Controle financeiro', 'Exigir aprovação para pagamentos') && (
        <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-slate-500" />
            <h3 className="text-sm font-bold text-slate-800">Controle financeiro</h3>
          </div>
          <label className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 border border-slate-200">
            <span className="text-sm text-slate-700">Exigir aprovação para pagamentos</span>
            <input
              type="checkbox"
              checked={settings.requireApprovalForPayments}
              onChange={(e) => setSettings((prev) => ({ ...prev, requireApprovalForPayments: e.target.checked }))}
            />
          </label>
        </section>
        )}

        {showSection('Locais PDV', 'Local do consumo', 'Comandas', ...pdvLocais.map((l) => l.name)) && (
        <section className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-4 lg:col-span-2">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-slate-500" />
            <h3 className="text-sm font-bold text-slate-800">Locais PDV</h3>
          </div>
          <p className="text-xs text-slate-500">
            Cadastre os pontos de venda disponíveis no lançamento de comandas (ex.: Restaurante, Bar da Piscina).
          </p>

          {pdvError && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {pdvError}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={newPdvLocal}
              onChange={(e) => setNewPdvLocal(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addPdvLocal())}
              placeholder="Nome do local PDV"
              className="flex-1 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-sm"
            />
            <button
              type="button"
              onClick={addPdvLocal}
              disabled={!newPdvLocal.trim() || pdvLoading}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-[#004D40] text-white text-sm font-bold hover:bg-[#003d33] transition-colors disabled:opacity-60"
            >
              <Plus className="w-4 h-4" />
              Adicionar
            </button>
          </div>

          <div className="rounded-xl border border-slate-100 overflow-hidden">
            {pdvLoading ? (
              <p className="px-4 py-6 text-sm text-slate-400 text-center">Carregando locais...</p>
            ) : pdvLocais.length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-400 text-center">Nenhum local PDV cadastrado.</p>
            ) : (
              <ul className="divide-y divide-slate-50">
                {pdvLocais.map((local) => (
                  <li key={local.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div>
                      <p className={`text-sm font-medium ${local.active ? 'text-slate-800' : 'text-slate-400 line-through'}`}>
                        {local.name}
                      </p>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wide">
                        {local.active ? 'Ativo' : 'Inativo'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => togglePdvLocal(local)}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 text-slate-600 hover:bg-slate-50"
                      >
                        {local.active ? 'Desativar' : 'Ativar'}
                      </button>
                      <button
                        type="button"
                        onClick={() => removePdvLocal(local.id)}
                        className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Remover local"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
        )}
      </div>
    </div>
  );
};
