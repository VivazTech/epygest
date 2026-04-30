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
  Archive,
  PlugZap,
  Rows4,
  PanelLeftClose,
  PanelLeftOpen
} from 'lucide-react';
import { cn } from '../lib/utils';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  user: any;
  onLogout: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
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
  { id: 'sintase', label: 'Síntase', icon: Rows4, roles: ['admin', 'finance', 'manager'] },
  { id: 'prev-real', label: 'Prev x Real', icon: BarChart3, roles: ['admin', 'finance', 'manager'] },
  { id: 'supabase-teste', label: 'Teste Supabase', icon: PlugZap, roles: ['admin', 'finance'] },
  { id: 'usuarios', label: 'Usuários', icon: Users, roles: ['admin'] },
  { id: 'configuracoes', label: 'Configurações', icon: Settings, roles: ['admin'] },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  user,
  onLogout,
  collapsed,
  onToggleCollapsed
}) => {
  const filteredMenu = menuItems.filter(item => item.roles.includes(user?.role));

  return (
    <div className={cn(
      "bg-[#004D40] text-white h-screen flex flex-col fixed left-0 top-0 z-50 transition-all duration-200",
      collapsed ? "w-20" : "w-64"
    )}>
      <div className="p-6 flex items-center gap-3 border-b border-white/10">
        <div className="w-10 h-10 bg-emerald-400 rounded-lg flex items-center justify-center font-bold text-xl text-[#004D40]">
          F
        </div>
        <div className={cn(collapsed && "hidden")}>
          <h1 className="font-bold text-lg leading-tight">EpyGest</h1>
          <p className="text-[10px] opacity-60 uppercase tracking-widest">Gestão Inteligente</p>
        </div>
      </div>

      <nav className="flex-1 py-6 px-3 space-y-1 overflow-y-auto no-scrollbar">
        {filteredMenu.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group",
              activeTab === item.id 
                ? "bg-emerald-500 text-white shadow-lg shadow-emerald-900/20" 
                : "text-white/80 hover:bg-white/5 hover:text-white"
            )}
          >
            <item.icon className={cn(
              "w-5 h-5 min-w-5 min-h-5 shrink-0 transition-transform duration-200",
              activeTab === item.id ? "scale-110" : "group-hover:scale-110"
            )} />
            <span className={cn("font-medium text-sm", collapsed && "hidden")}>{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="p-4 border-t border-white/10 space-y-4">
        <div className={cn("flex items-center gap-3 px-2", collapsed && "justify-center")}>
          <div className="w-10 h-10 rounded-full bg-emerald-800 flex items-center justify-center border border-emerald-400/30">
            <User className="w-5 h-5 text-emerald-300" />
          </div>
          <div className={cn("flex-1 min-w-0", collapsed && "hidden")}>
            <p className="text-sm font-semibold truncate">{user?.name}</p>
            <p className="text-[10px] text-white/75 uppercase font-bold tracking-tighter">
              {user?.role === 'admin' ? 'Administrador' : 
               user?.role === 'finance' ? 'Financeiro' : 
               user?.role === 'manager' ? 'Gestor' : 'Visualizador'}
            </p>
          </div>
        </div>

        <button
          onClick={onToggleCollapsed}
          className={cn(
            "w-full px-4 py-2 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/15 transition-colors flex items-center justify-center"
          )}
          title={collapsed ? 'Expandir menu' : 'Colapsar menu'}
          aria-label={collapsed ? 'Expandir menu' : 'Colapsar menu'}
        >
          {collapsed ? <PanelLeftOpen className="w-4 h-4 shrink-0" /> : <PanelLeftClose className="w-4 h-4 shrink-0" />}
        </button>
        
        <button 
          onClick={onLogout}
          className={cn(
            "w-full flex items-center px-4 py-3 rounded-xl text-red-300 hover:bg-red-500/10 hover:text-red-200 transition-colors",
            collapsed ? "justify-center" : "gap-3"
          )}
        >
          <LogOut className="w-5 h-5" />
          <span className={cn("font-medium text-sm", collapsed && "hidden")}>Sair do sistema</span>
        </button>
      </div>
    </div>
  );
};
