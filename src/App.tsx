import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './pages/Dashboard';
import { Invoices } from './pages/Invoices';
import { 
  LogIn, 
  User as UserIcon, 
  Lock, 
  AlertCircle,
  Loader2
} from 'lucide-react';
import { cn } from './lib/utils';

// Mock Pages for now to avoid empty imports
import { FinancialAnalysisPage as AnaliseFinanceira } from './pages/FinancialAnalysis';
import { DREPage as DRE } from './pages/DRE';
import { PlanningPage as Planejamento } from './pages/Planning';
const Importacao = () => <div className="p-8 text-slate-400">Módulo de Importação de Dados em desenvolvimento...</div>;
import { CadastrosPage as Cadastros } from './pages/Cadastros';
const Usuarios = () => <div className="p-8 text-slate-400">Módulo de Gestão de Usuários em desenvolvimento...</div>;
const Configuracoes = () => <div className="p-8 text-slate-400">Configurações do Sistema em desenvolvimento...</div>;

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Check for saved session
  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (savedUser) setUser(JSON.parse(savedUser));
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (res.ok) {
        setUser(data);
        localStorage.setItem('user', JSON.stringify(data));
      } else {
        setError(data.error || 'Erro ao entrar');
      }
    } catch (err) {
      setError('Erro de conexão com o servidor');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('user');
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans">
        <div className="w-full max-w-md bg-white rounded-[32px] shadow-2xl shadow-slate-200 overflow-hidden border border-slate-100">
          <div className="p-8 pt-12 text-center">
            <div className="w-16 h-16 bg-[#004D40] rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-xl shadow-emerald-900/20">
              <span className="text-white font-bold text-3xl">F</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">Bem-vindo ao FinanCorp</h1>
            <p className="text-slate-500 text-sm">Acesse sua conta para gerenciar suas finanças.</p>
          </div>

          <form onSubmit={handleLogin} className="p-8 pt-0 space-y-5">
            {error && (
              <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-600 text-sm animate-in fade-in slide-in-from-top-2">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <p className="font-medium">{error}</p>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">E-mail Corporativo</label>
              <div className="relative">
                <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input 
                  type="email" 
                  required
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="exemplo@financorp.com"
                  className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">Senha</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input 
                  type="password" 
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-sm focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all"
                />
              </div>
            </div>

            <button 
              type="submit"
              disabled={loading}
              className="w-full bg-[#004D40] text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-[#003d33] active:scale-[0.98] transition-all shadow-lg shadow-emerald-900/10 disabled:opacity-70"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <LogIn className="w-5 h-5" />}
              Entrar no Sistema
            </button>

            <div className="pt-4 text-center">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                Dica: admin@financorp.com / admin123
              </p>
            </div>
          </form>
        </div>
      </div>
    );
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard': return <Dashboard />;
      case 'analise': return <AnaliseFinanceira />;
      case 'dre': return <DRE />;
      case 'planejamento': return <Planejamento />;
      case 'notas': return <Invoices />;
      case 'importacao': return <Importacao />;
      case 'cadastros': return <Cadastros />;
      case 'usuarios': return <Usuarios />;
      case 'configuracoes': return <Configuracoes />;
      default: return <Dashboard />;
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] font-sans text-slate-900">
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        user={user} 
        onLogout={handleLogout} 
      />
      
      <main className="pl-64 min-h-screen">
        <header className="h-20 bg-white/80 backdrop-blur-md border-b border-slate-100 flex items-center justify-between px-8 sticky top-0 z-40">
          <div className="flex items-center gap-2">
            <span className="text-slate-400 text-sm font-medium">FinanCorp</span>
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

        <div className="p-8 max-w-7xl mx-auto">
          {renderContent()}
        </div>
      </main>
    </div>
  );
}
