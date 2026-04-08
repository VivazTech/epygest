import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './pages/Dashboard';
import { Invoices } from './pages/Invoices';

// Mock Pages for now to avoid empty imports
import { FinancialAnalysisPage as AnaliseFinanceira } from './pages/FinancialAnalysis';
import { DREPage as DRE } from './pages/DRE';
import { PlanningPage as Planejamento } from './pages/Planning';
const Importacao = () => <div className="p-8 text-slate-400">Módulo de Importação de Dados em desenvolvimento...</div>;
import { CadastrosPage as Cadastros } from './pages/Cadastros';
const Usuarios = () => <div className="p-8 text-slate-400">Módulo de Gestão de Usuários em desenvolvimento...</div>;
const Configuracoes = () => <div className="p-8 text-slate-400">Configurações do Sistema em desenvolvimento...</div>;

const TEST_USER = {
  id: 1,
  name: 'Usuário de Teste',
  email: 'teste@financorp.com',
  role: 'Administrador'
};

export default function App() {
  const [user, setUser] = useState<any>(TEST_USER);
  const [activeTab, setActiveTab] = useState('dashboard');

  // Login temporariamente desativado para permitir testes sem autenticação.
  useEffect(() => {
    localStorage.setItem('user', JSON.stringify(TEST_USER));
  }, []);

  const handleLogout = () => {
    setUser(TEST_USER);
    localStorage.setItem('user', JSON.stringify(TEST_USER));
  };

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
