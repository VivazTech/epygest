import React from 'react';
import { 
  LayoutDashboard, 
  BarChart3, 
  FileText, 
  Target, 
  FileSpreadsheet, 
  Settings, 
  Users, 
  User, 
  LogOut,
  Receipt,
  PlusCircle,
  Database,
  Archive
} from 'lucide-react';
import { cn } from '../lib/utils';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  user: any;
  onLogout: () => void;
}

const menuItems = [
  { id: 'dashboard', label: 'Dashboard Geral', icon: LayoutDashboard, roles: ['admin', 'finance', 'manager', 'viewer'] },
  { id: 'analise', label: 'Análise Financeira', icon: BarChart3, roles: ['admin', 'finance', 'manager'] },
  { id: 'dre', label: 'DRE Gerencial', icon: FileSpreadsheet, roles: ['admin', 'finance'] },
  { id: 'planejamento', label: 'Planejamento', icon: Target, roles: ['admin', 'finance', 'manager'] },
  { id: 'notas', label: 'Controle de Notas', icon: Receipt, roles: ['admin', 'finance', 'manager'] },
  { id: 'requisicoes', label: 'Requisições', icon: Archive, roles: ['admin', 'finance', 'manager'] },
  { id: 'importacao', label: 'Importação', icon: PlusCircle, roles: ['admin', 'finance'] },
  { id: 'cadastros', label: 'Cadastros', icon: Database, roles: ['admin', 'finance'] },
  { id: 'usuarios', label: 'Usuários', icon: Users, roles: ['admin'] },
  { id: 'configuracoes', label: 'Configurações', icon: Settings, roles: ['admin'] },
];

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, user, onLogout }) => {
  const filteredMenu = menuItems.filter(item => item.roles.includes(user?.role));

  return (
    <div className="w-64 bg-[#004D40] text-white h-screen flex flex-col fixed left-0 top-0 z-50">
      <div className="p-6 flex items-center gap-3 border-b border-white/10">
        <div className="w-10 h-10 bg-emerald-400 rounded-lg flex items-center justify-center font-bold text-xl text-[#004D40]">
          F
        </div>
        <div>
          <h1 className="font-bold text-lg leading-tight">EpyGest</h1>
          <p className="text-[10px] opacity-60 uppercase tracking-widest">Gestão Inteligente</p>
        </div>
      </div>

      <nav className="flex-1 py-6 px-3 space-y-1 overflow-y-auto custom-scrollbar">
        {filteredMenu.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group",
              activeTab === item.id 
                ? "bg-emerald-500 text-white shadow-lg shadow-emerald-900/20" 
                : "text-emerald-100/70 hover:bg-white/5 hover:text-white"
            )}
          >
            <item.icon className={cn(
              "w-5 h-5 transition-transform duration-200",
              activeTab === item.id ? "scale-110" : "group-hover:scale-110"
            )} />
            <span className="font-medium text-sm">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="p-4 border-t border-white/10 space-y-4">
        <div className="flex items-center gap-3 px-2">
          <div className="w-10 h-10 rounded-full bg-emerald-800 flex items-center justify-center border border-emerald-400/30">
            <User className="w-5 h-5 text-emerald-300" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{user?.name}</p>
            <p className="text-[10px] text-emerald-300/70 uppercase font-bold tracking-tighter">
              {user?.role === 'admin' ? 'Administrador' : 
               user?.role === 'finance' ? 'Financeiro' : 
               user?.role === 'manager' ? 'Gestor' : 'Visualizador'}
            </p>
          </div>
        </div>
        
        <button 
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-300 hover:bg-red-500/10 hover:text-red-200 transition-colors"
        >
          <LogOut className="w-5 h-5" />
          <span className="font-medium text-sm">Sair do sistema</span>
        </button>
      </div>
    </div>
  );
};
