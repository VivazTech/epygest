import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './pages/Dashboard';
import { Invoices } from './pages/Invoices';

// Mock Pages for now to avoid empty imports
import { FinancialAnalysisPage as AnaliseFinanceira } from './pages/FinancialAnalysis';
import { DREPage as DRE } from './pages/DRE';
import { PlanningPage as Planejamento } from './pages/Planning';
import { ImportacaoPage as Importacao } from './pages/Importacao';
import { CadastrosPage as Cadastros } from './pages/Cadastros';
import { RequisicoesPage as Requisicoes } from './pages/Requisicoes';
import { SupabaseConnectionTestPage as SupabaseTeste } from './pages/SupabaseConnectionTest';
import { SintasePage as Sintase } from './pages/Sintase';
import { PrevRealPage as PrevReal } from './pages/PrevReal';
import { ConfiguracoesPage as Configuracoes } from './pages/Configuracoes';
import { UsuariosPage as Usuarios } from './pages/Usuarios';

export default function App() {
  const isSupabaseTestRoute = window.location.pathname === '/teste-supabase';
  const [user, setUser] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  useEffect(() => {
    try {
      const raw = localStorage.getItem('user');
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed?.id && parsed?.name && parsed?.role) setUser(parsed);
    } catch {
      // sessão inválida no storage, ignora
    }
  }, []);

  const handleLogout = () => {
    setUser(null);
    setLoginForm({ email: '', password: '' });
    setActiveTab('dashboard');
    localStorage.removeItem('user');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginForm.email.trim() || !loginForm.password.trim()) {
      setLoginError('Preencha e-mail e senha.');
      return;
    }

    setLoginError('');
    setLoginLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: loginForm.email.trim(),
          password: loginForm.password,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoginError(data.error || 'Não foi possível realizar login.');
        return;
      }
      setUser(data);
      localStorage.setItem('user', JSON.stringify(data));
      setLoginForm({ email: '', password: '' });
    } finally {
      setLoginLoading(false);
    }
  };

  const getWhatsappSupportLink = () => {
    const errorText = loginError?.trim() ? loginError.trim() : 'Mensagem de erro';
    const message =
      `Olá, preciso de ajuda para acessar o EpyGest.\n` +
      `Estou com o seguinte erro: "${errorText}"`;
    return `https://wa.me/5545991070844?text=${encodeURIComponent(message)}`;
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return <Dashboard />;
      case 'analise': return <AnaliseFinanceira />;
      case 'dre': return <DRE />;
      case 'planejamento': return <Planejamento />;
      case 'notas': return <Invoices />;
      case 'requisicoes': return <Requisicoes />;
      case 'importacao': return <Importacao />;
      case 'cadastros': return <Cadastros />;
      case 'sintase': return <Sintase />;
      case 'prev-real': return <PrevReal />;
      case 'supabase-teste': return <SupabaseTeste />;
      case 'usuarios': return <Usuarios />;
      case 'configuracoes': return <Configuracoes />;
      default: return <Dashboard />;
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] font-sans text-slate-900 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="bg-white border border-slate-100 rounded-2xl shadow-sm p-6 space-y-5">
            <div className="text-center">
              <h1 className="text-2xl font-bold text-slate-900">EpyGest</h1>
              <p className="text-sm text-slate-500 mt-1">Acesse sua conta para entrar no sistema.</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">E-mail</label>
                <input
                  type="email"
                  value={loginForm.email}
                  onChange={(e) => setLoginForm((p) => ({ ...p, email: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                  placeholder="seu@email.com"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Senha</label>
                <input
                  type="password"
                  value={loginForm.password}
                  onChange={(e) => setLoginForm((p) => ({ ...p, password: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                  placeholder="••••••••"
                />
              </div>

              {loginError && (
                <div className="text-xs font-medium text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                  {loginError}
                </div>
              )}

              <button
                type="submit"
                disabled={loginLoading}
                className="w-full px-4 py-2.5 rounded-xl bg-[#004D40] text-white text-sm font-bold hover:bg-[#003d33] disabled:opacity-60 transition-colors"
              >
                {loginLoading ? 'Entrando...' : 'Entrar'}
              </button>
            </form>
          </div>

          <div className="mt-4 flex items-center justify-center gap-3">
            <button
              type="button"
              className="px-4 py-2 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
              onClick={() => alert('Configuração de recuperação de senha será definida em breve.')}
            >
              Esqueci minha senha
            </button>
            <a
              href={getWhatsappSupportLink()}
              target="_blank"
              rel="noreferrer"
              className="px-4 py-2 text-sm font-semibold text-white bg-[#004D40] rounded-xl hover:bg-[#003d33] transition-colors"
            >
              Suporte
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (isSupabaseTestRoute) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] font-sans text-slate-900 p-8 max-w-7xl mx-auto">
        <SupabaseTeste />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] font-sans text-slate-900">
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        user={user} 
        onLogout={handleLogout} 
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed((prev) => !prev)}
      />
      
      <main className={sidebarCollapsed ? "pl-20 min-h-screen" : "pl-64 min-h-screen"}>
        <header className="h-20 bg-white/80 backdrop-blur-md border-b border-slate-100 flex items-center justify-between px-8 sticky top-0 z-40">
          <div className="flex items-center gap-2">
            <span className="text-slate-400 text-sm font-medium">EpyGest</span>
            <span className="text-slate-300">/</span>
            <span className="text-slate-900 text-sm font-bold capitalize">{activeTab.replace('-', ' ')}</span>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-xs font-bold text-slate-900">{user.name}</p>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">{user.role}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 font-bold">
              {user.name.charAt(0)}
            </div>
          </div>
        </header>

        <div className={activeTab === 'notas' || activeTab === 'cadastros' || activeTab === 'sintase' || activeTab === 'prev-real' || activeTab === 'dre' ? "p-8 w-full max-w-none" : "p-8 max-w-7xl mx-auto"}>
          {renderContent()}
        </div>
      </main>
    </div>
  );
}
