import React, { useState, useEffect } from 'react';
import { Eye, EyeOff } from 'lucide-react';
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
import { LancamentosManuaisPage as LancamentosManuais } from './pages/LancamentosManuais';
import { ComandasPage as Comandas } from './pages/Comandas';
import { SupabaseConnectionTestPage as SupabaseTeste } from './pages/SupabaseConnectionTest';
import { SintasePage as Sintase } from './pages/Sintase';
import { PrevRealPage as PrevReal } from './pages/PrevReal';
import { ConfiguracoesPage as Configuracoes } from './pages/Configuracoes';
import { UsuariosPage as Usuarios } from './pages/Usuarios';
import { PlanilhasPage } from './pages/Planilhas';
import { PLANILHAS, APURACAO_RECEITA_ITENS, BASE_ORCAMENTO_ITENS, isApuracaoReceitaPlanilha, isBaseOrcamentoTab } from './lib/planilhas';
import { FolhaPagamentoPage, MESES_FOLHA } from './pages/FolhaPagamento';
import { FolhaApuracaoPage } from './pages/FolhaApuracao';
import { RelatorioCrdPage, RelatorioCrdMesPage, MESES_REL_CRD } from './pages/RelatorioCrd';
import { ComprasPage } from './pages/Compras';
import { SearchProvider, useSearch } from './context/SearchContext';
import { ToastProvider } from './context/ToastContext';
import { SearchBar } from './components/SearchBar';
import { getSearchPlaceholder } from './lib/search';

const PLANILHAS_ROLES = ['admin', 'finance', 'controle'] as const;

export default function App() {
  const isSupabaseTestRoute = window.location.pathname === '/teste-supabase';
  const [user, setUser] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [planilhaCell, setPlanilhaCell] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [bootstrapping, setBootstrapping] = useState(true);

  // Restaura a sessão a partir do cookie httpOnly validado pelo servidor (/api/auth/me),
  // não confiando no localStorage como fonte de verdade da autenticação.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/auth/me');
        if (!res.ok) throw new Error('no session');
        const data = await res.json();
        if (!cancelled && data?.id && data?.role) {
          setUser(data);
          localStorage.setItem('user', JSON.stringify(data)); // cache só para a UI
          if (data.role === 'finance') setActiveTab('notas');
        }
      } catch {
        if (!cancelled) {
          setUser(null);
          localStorage.removeItem('user');
        }
      } finally {
        if (!cancelled) setBootstrapping(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const canAccessPlanilhas = PLANILHAS_ROLES.includes(user?.role);

  useEffect(() => {
    if (user && activeTab.startsWith('planilha-') && !canAccessPlanilhas) {
      setActiveTab('dashboard');
    }
  }, [user, activeTab, canAccessPlanilhas]);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // mesmo se falhar a chamada, limpamos o estado local
    }
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
      if (data.role === 'finance') setActiveTab('notas');
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

  const handleSetActiveTab = (tab: string) => {
    setPlanilhaCell(null);
    setActiveTab(tab);
  };

  const renderContent = () => {
    if (activeTab.startsWith('planilha-')) {
      if (!canAccessPlanilhas) return <Dashboard />;
      const indice = Number(activeTab.slice('planilha-'.length));
      return (
        <PlanilhasPage
          indice={indice}
          targetCell={planilhaCell}
          onNavigate={(ind, cell) => {
            setPlanilhaCell(cell ?? null);
            setActiveTab(`planilha-${ind}`);
          }}
        />
      );
    }

    if (activeTab === 'folha-apuracao') {
      return <FolhaApuracaoPage />;
    }

    if (activeTab === 'rel-crd') {
      if (!canAccessPlanilhas) return <Dashboard />;
      return <RelatorioCrdPage onSelectMonth={(m) => setActiveTab(`rel-crd-${m}`)} />;
    }

    if (activeTab.startsWith('rel-crd-')) {
      if (!canAccessPlanilhas) return <Dashboard />;
      const mes = Number(activeTab.slice('rel-crd-'.length));
      if (mes >= 1 && mes <= 12) {
        return <RelatorioCrdMesPage key={mes} month={mes} />;
      }
    }

    if (activeTab.startsWith('folha-')) {
      const mes = Number(activeTab.slice('folha-'.length));
      if (mes >= 1 && mes <= 12) {
        return <FolhaPagamentoPage key={mes} month={mes} />;
      }
    }

    switch (activeTab) {
      case 'dashboard': return <Dashboard />;
      case 'analise': return <AnaliseFinanceira />;
      case 'dre': return <DRE />;
      case 'planejamento': return <Planejamento />;
      case 'notas': return <Invoices />;
      case 'danfe': return <Invoices />;
      case 'requisicoes': return <Requisicoes />;
      case 'lancamentos-manuais': return <LancamentosManuais />;
      case 'comandas': return <Comandas />;
      case 'importacao': return <Importacao />;
      case 'cadastros': return <Cadastros />;
      case 'sintase': return <Sintase />;
      case 'prev-real': return <PrevReal mode="diario" />;
      case 'supabase-teste': return <SupabaseTeste />;
      case 'usuarios': return <Usuarios />;
      case 'configuracoes': return <Configuracoes />;
      case 'compras-ordem': return <ComprasPage />;
      default: return <Dashboard />;
    }
  };

  if (bootstrapping) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] font-sans text-slate-900 flex items-center justify-center p-6">
        <p className="text-sm font-medium text-slate-400">Carregando...</p>
      </div>
    );
  }

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
                <div className="relative mt-1">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={loginForm.password}
                    onChange={(e) => setLoginForm((p) => ({ ...p, password: e.target.value }))}
                    className="w-full px-3 py-2 pr-10 bg-slate-50 border border-slate-200 rounded-xl text-sm"
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600 rounded-lg transition-colors"
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
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
    <SearchProvider>
      <AppShell
        activeTab={activeTab}
        setActiveTab={handleSetActiveTab}
        user={user}
        onLogout={handleLogout}
        sidebarCollapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed((prev) => !prev)}
        renderContent={renderContent}
      />
    </SearchProvider>
  );
}

function AppShell({
  activeTab,
  setActiveTab,
  user,
  onLogout,
  sidebarCollapsed,
  onToggleCollapsed,
  renderContent,
}: {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  user: any;
  onLogout: () => void;
  sidebarCollapsed: boolean;
  onToggleCollapsed: () => void;
  renderContent: () => React.ReactNode;
}) {
  const { query, setQuery } = useSearch();

  React.useEffect(() => {
    setQuery('');
  }, [activeTab, setQuery]);

  return (
    <ToastProvider>
      <div className="min-h-screen bg-[#F8FAFC] font-sans text-slate-900">
          <Sidebar
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            user={user}
            onLogout={onLogout}
            collapsed={sidebarCollapsed}
            onToggleCollapsed={onToggleCollapsed}
          />

          <main className={sidebarCollapsed ? 'pl-20 min-h-screen' : 'pl-64 min-h-screen'}>
        <header className="h-20 bg-white/80 backdrop-blur-md border-b border-slate-100 flex items-center gap-4 px-8 sticky top-0 z-40">
          <div className="flex items-center gap-2 min-w-0 shrink-0">
            <span className="text-slate-400 text-sm font-medium">EpyGest</span>
            <span className="text-slate-300">/</span>
            <span className="text-slate-900 text-sm font-bold capitalize truncate">
              {isBaseOrcamentoTab(activeTab)
                ? `Base de Orçamento / ${BASE_ORCAMENTO_ITENS.find((p) => p.tabId === activeTab)?.nome ?? ''}`
                : activeTab === 'rel-crd'
                ? 'Apuração de Resultados / Relatorio de CRD / Resumo'
                : activeTab.startsWith('rel-crd-')
                ? `Apuração de Resultados / Relatorio de CRD / ${MESES_REL_CRD[Number(activeTab.slice('rel-crd-'.length))] ?? ''}`
                : activeTab.startsWith('planilha-') && isApuracaoReceitaPlanilha(Number(activeTab.slice('planilha-'.length)))
                ? `Apuração de Receita / ${APURACAO_RECEITA_ITENS.find((p) => `planilha-${p.indice}` === activeTab)?.nome ?? ''}`
                : activeTab === 'planilha-2'
                ? 'Apuração de Resultados / Prev x Real Mensal'
                : activeTab.startsWith('planilha-')
                ? `Apuração de Resultados / ${PLANILHAS.find((p) => `planilha-${p.indice}` === activeTab)?.nome ?? ''}`
                : activeTab === 'folha-apuracao'
                ? 'Apuração da Folha / Apuração'
                : activeTab.startsWith('folha-')
                ? `Apuração da Folha / ${MESES_FOLHA[Number(activeTab.slice('folha-'.length))] ?? ''}`
                : ['comandas', 'lancamentos-manuais', 'requisicoes', 'notas', 'danfe'].includes(activeTab)
                ? `Lançamentos / ${
                    activeTab === 'comandas' ? 'Comandas'
                    : activeTab === 'lancamentos-manuais' ? 'Lançamentos Manuais'
                    : activeTab === 'requisicoes' ? 'Requisições'
                    : activeTab === 'danfe' ? 'DANFE'
                    : 'Notas de Serviço'
                  }`
                : activeTab === 'prev-real'
                ? 'Prev x Real Diario'
                : activeTab.replace('-', ' ')}
            </span>
          </div>

          <SearchBar
            value={query}
            onChange={setQuery}
            placeholder={getSearchPlaceholder(activeTab)}
            className="flex-1 max-w-xl mx-auto hidden md:block"
          />

          <div className="flex items-center gap-4 shrink-0">
            <div className="text-right hidden sm:block">
              <p className="text-xs font-bold text-slate-900">{user.name}</p>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">{user.role}</p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 font-bold">
              {user.name.charAt(0)}
            </div>
          </div>
        </header>

        <div className="px-8 pt-4 md:hidden">
          <SearchBar
            value={query}
            onChange={setQuery}
            placeholder={getSearchPlaceholder(activeTab)}
          />
        </div>

        <div className={activeTab === 'notas' || activeTab === 'danfe' || activeTab === 'comandas' || activeTab === 'lancamentos-manuais' || activeTab === 'requisicoes' || activeTab === 'cadastros' || activeTab === 'sintase' || activeTab === 'prev-real' || activeTab === 'dre' || activeTab === 'rel-crd' || activeTab.startsWith('rel-crd-') || activeTab.startsWith('planilha-') || activeTab.startsWith('folha-') || activeTab === 'compras-ordem' ? 'p-8 pt-4 md:pt-8 w-full max-w-none' : 'p-8 pt-4 md:pt-8 max-w-7xl mx-auto'}>
          {renderContent()}
        </div>
      </main>
        </div>
      </ToastProvider>
  );
}
