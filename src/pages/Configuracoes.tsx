import React, { useEffect, useState } from 'react';
import { Settings2, Save, RotateCcw, Monitor, Bell, ShieldCheck } from 'lucide-react';

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
  const [settings, setSettings] = useState<SettingsState>(defaultSettings);
  const [savedAt, setSavedAt] = useState<string | null>(null);

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
      </div>
    </div>
  );
};
