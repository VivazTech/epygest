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
  PanelLeftOpen,
  ChevronDown,
  Table2,
  ClipboardList,
  Wallet,
  CalendarDays,
  Calculator,
  Layers,
  ShoppingCart,
  FileCheck,
  TrendingUp,
  Boxes,
  Building2,
  CalendarClock,
  Landmark,
  BookOpen,
  Lightbulb,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { PLANILHAS_RESULTADOS, APURACAO_RECEITA_ITENS, BASE_ORCAMENTO_ITENS, isBaseOrcamentoTab, isRelCrdTab, isRelReqTab, isConsumoInternoTab, isRdsTab, isApuracaoReceitaTab as checkApuracaoReceitaTab, isApuracaoResultadosTab as checkApuracaoResultadosTab } from '../lib/planilhas';
import { PAINEIS_SETORIAIS, isPainelSetorialTab } from '../lib/paineisSetoriais';
import { hasPermission, type RolePermissionRow } from '../lib/permissionCatalog';
import logoIcon from '../../logoicon2.svg';

const FOLHA_MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const REL_CRD_MESES = FOLHA_MESES;
interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  user: any;
  onLogout: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

const lancamentosMenuItems = [
  { id: 'comandas', label: 'Comandas', icon: ClipboardList, roles: ['admin', 'finance', 'controle', 'manager'] },
  { id: 'lancamentos-manuais', label: 'Lançamentos Manuais', icon: Wallet, roles: ['admin', 'finance', 'controle', 'manager'] },
  { id: 'requisicoes', label: 'Requisições', icon: Archive, roles: ['admin', 'finance', 'controle', 'manager'] },
  { id: 'notas', label: 'Notas de Serviço', icon: Receipt, roles: ['admin', 'finance', 'controle', 'manager'] },
  { id: 'danfe', label: 'DANFE', icon: FileText, roles: ['admin', 'finance', 'controle', 'manager'] },
  { id: 'mensalidades', label: 'Mensalidades', icon: CalendarClock, roles: ['admin', 'finance', 'controle', 'manager', 'diretoria'] },
];

const menuItems = [
  { id: 'dashboard', label: 'Dashboard Geral', icon: LayoutDashboard, roles: ['admin', 'controle', 'manager', 'viewer', 'diretoria'] },
  { id: 'analise', label: 'Análise Financeira', icon: BarChart3, roles: ['admin', 'controle', 'manager'] },
  { id: 'dre', label: 'DRE Gerencial', icon: FileSpreadsheet, roles: ['admin', 'controle', 'diretoria'] },
  { id: 'planejamento', label: 'Planejamento', icon: Target, roles: ['admin', 'controle', 'manager'] },
  { id: 'importacao', label: 'Importação', icon: PlusCircle, roles: ['admin', 'controle'] },
  { id: 'cadastros', label: 'Cadastros', icon: Database, roles: ['admin', 'controle'] },
  { id: 'prev-real', label: 'Prev x Real Diario', icon: BarChart3, roles: ['admin', 'controle', 'manager'] },
  { id: 'indicadores', label: 'Indicadores (Números)', icon: TrendingUp, roles: ['admin', 'controle', 'manager', 'diretoria'] },
  { id: 'investimentos', label: 'Investimentos', icon: Landmark, roles: ['admin', 'controle', 'manager', 'finance', 'diretoria'] },
  { id: 'usuarios', label: 'Usuários', icon: Users, roles: ['admin'] },
  { id: 'sugestoes', label: 'Sugestões', icon: Lightbulb, roles: ['admin'] },
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
  const permissions = (user?.permissions || null) as RolePermissionRow[] | null;
  const role = String(user?.role || '');
  const canView = (resourceKey: string, fallbackRoles?: string[]) => {
    if (role === 'admin') return true;
    if (permissions?.length) return hasPermission(permissions, resourceKey, 'view', role);
    if (fallbackRoles?.length) return fallbackRoles.includes(role);
    return false;
  };

  const constructionGroupIds = ['dashboard', 'analise', 'planejamento'];
  const lancamentosGroupIds = lancamentosMenuItems.map((item) => item.id);
  const adminGroupIds = ['usuarios', 'sugestoes', 'configuracoes'];
  const filteredMenu = menuItems.filter((item) => canView(item.id, item.roles));
  const lancamentosMenu = lancamentosMenuItems.filter((item) => canView(item.id, item.roles));
  const constructionMenu = filteredMenu.filter((item) => constructionGroupIds.includes(item.id));
  const primaryMenu = filteredMenu.filter(
    (item) => !constructionGroupIds.includes(item.id) && !adminGroupIds.includes(item.id)
  );
  const adminMenu = filteredMenu.filter((item) => adminGroupIds.includes(item.id));
  const showPlanilhas = canView('apuracao-resultados', ['admin', 'controle']);
  const showBaseOrcamento = canView('base-orcamento', ['admin', 'controle', 'manager']);
  const showLancamentos = lancamentosMenu.length > 0;
  const showFolha = canView('folha', ['admin', 'controle']);
  const showCompras = canView('compras-ordem', ['admin', 'controle', 'manager']);
  const comprasIds = ['compras-ordem'];
  const [comprasExpanded, setComprasExpanded] = React.useState(comprasIds.includes(activeTab));
  const painelMenu = PAINEIS_SETORIAIS.filter((p) => canView(p.tabId, p.roles));
  const showPaineis = painelMenu.length > 0;
  const painelTabIds = painelMenu.map((p) => p.tabId);
  const [paineisExpanded, setPaineisExpanded] = React.useState(isPainelSetorialTab(activeTab));
  const showApuracaoReceita = canView('apuracao-receita', ['admin', 'controle']);
  const showTutorial = canView('tutorial', [
    'admin',
    'finance',
    'controle',
    'manager',
    'viewer',
    'diretoria',
  ]);
  const [constructionExpanded, setConstructionExpanded] = React.useState(
    constructionMenu.some((item) => item.id === activeTab)
  );
  const [lancamentosExpanded, setLancamentosExpanded] = React.useState(
    lancamentosGroupIds.includes(activeTab)
  );
  const isApuracaoResultadosTab = checkApuracaoResultadosTab(activeTab);
  const isApuracaoReceitaTab = checkApuracaoReceitaTab(activeTab);
  const isBaseOrcamentoActive = isBaseOrcamentoTab(activeTab);
  const isRelCrdActive = isRelCrdTab(activeTab);
  const isRelReqActive = isRelReqTab(activeTab);
  const isConsumoActive = isConsumoInternoTab(activeTab);
  const isRdsActive = isRdsTab(activeTab);
  const [planilhasExpanded, setPlanilhasExpanded] = React.useState(isApuracaoResultadosTab);
  const [receitaExpanded, setReceitaExpanded] = React.useState(isApuracaoReceitaTab);
  const [baseOrcamentoExpanded, setBaseOrcamentoExpanded] = React.useState(isBaseOrcamentoActive);
  const [relCrdExpanded, setRelCrdExpanded] = React.useState(isRelCrdActive);
  const [relReqExpanded, setRelReqExpanded] = React.useState(isRelReqActive);
  const [consumoExpanded, setConsumoExpanded] = React.useState(isConsumoActive);
  const [rdsExpanded, setRdsExpanded] = React.useState(isRdsActive);
  const [folhaExpanded, setFolhaExpanded] = React.useState(
    activeTab.startsWith('folha-') || activeTab === 'folha-apuracao'
  );

  React.useEffect(() => {
    if (comprasIds.includes(activeTab)) setComprasExpanded(true);
    if (isPainelSetorialTab(activeTab)) setPaineisExpanded(true);
    if (constructionMenu.some((item) => item.id === activeTab)) {
      setConstructionExpanded(true);
    }
    if (lancamentosGroupIds.includes(activeTab)) {
      setLancamentosExpanded(true);
    }
    if (isApuracaoResultadosTab) {
      setPlanilhasExpanded(true);
    }
    if (isApuracaoReceitaTab) {
      setReceitaExpanded(true);
    }
    if (isBaseOrcamentoActive) {
      setBaseOrcamentoExpanded(true);
    }
    if (isRelCrdActive) {
      setRelCrdExpanded(true);
    }
    if (isRelReqActive) {
      setRelReqExpanded(true);
    }
    if (isConsumoActive) {
      setConsumoExpanded(true);
    }
    if (isRdsActive) {
      setRdsExpanded(true);
      setReceitaExpanded(true);
    }
    if (activeTab.startsWith('folha-') || activeTab === 'folha-apuracao') {
      setFolhaExpanded(true);
    }
  }, [activeTab, constructionMenu, lancamentosGroupIds, isApuracaoResultadosTab, isApuracaoReceitaTab, isBaseOrcamentoActive, isRelCrdActive, isRelReqActive, isConsumoActive, isRdsActive]);

  React.useEffect(() => {
    const expandAll = () => {
      setConstructionExpanded(true);
      setLancamentosExpanded(true);
      setComprasExpanded(true);
      setPaineisExpanded(true);
      setBaseOrcamentoExpanded(true);
      setPlanilhasExpanded(true);
      setReceitaExpanded(true);
      setRelCrdExpanded(true);
      setRelReqExpanded(true);
      setConsumoExpanded(true);
      setRdsExpanded(true);
      setFolhaExpanded(true);
    };
    window.addEventListener('vivaz-tutorial-expand', expandAll);
    return () => window.removeEventListener('vivaz-tutorial-expand', expandAll);
  }, []);

  return (
    <div className={cn(
      "bg-[#004D40] text-white h-screen flex flex-col fixed left-0 top-0 z-50 transition-all duration-200",
      collapsed ? "w-20" : "w-64"
    )}>
      <div className="p-6 flex items-center gap-3 border-b border-white/10">
        <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center">
          <img src={logoIcon} alt="Vivaz Cataratas" className="h-6 w-auto" />
        </div>
        <div className={cn(collapsed && "hidden")}>
          <h1 className="font-bold text-lg leading-tight">Budget Vivaz</h1>
          <p className="text-[10px] opacity-60 uppercase tracking-widest">Vivaz Cataratas</p>
        </div>
      </div>

      <nav data-tour="sidebar-nav" className="flex-1 py-6 px-3 space-y-1 overflow-y-auto no-scrollbar">
        {constructionMenu.length > 0 && (
          <div className="space-y-1">
            <button
              onClick={() => setConstructionExpanded((prev) => !prev)}
              data-tour="group-em-construcao"
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group text-white/80 hover:bg-white/5 hover:text-white"
              )}
            >
              <PlugZap className="w-5 h-5 min-w-5 min-h-5 shrink-0 transition-transform duration-200 group-hover:scale-110" />
              <span className={cn("font-medium text-sm flex-1 text-left", collapsed && "hidden")}>
                Em construção
              </span>
              <ChevronDown
                className={cn(
                  "w-4 h-4 transition-transform duration-200",
                  constructionExpanded && "rotate-180",
                  collapsed && "hidden"
                )}
              />
            </button>

            {!collapsed && constructionExpanded && constructionMenu.map((item) => (
              <button
                key={item.id}
                data-tour={`nav-${item.id}`}
                onClick={() => setActiveTab(item.id)}
                className={cn(
                  "w-full flex items-center gap-3 pl-11 pr-4 py-2.5 rounded-xl transition-all duration-200 group",
                  activeTab === item.id 
                    ? "bg-emerald-500 text-white shadow-lg shadow-emerald-900/20" 
                    : "text-white/80 hover:bg-white/5 hover:text-white"
                )}
              >
                <item.icon className={cn(
                  "w-4 h-4 min-w-4 min-h-4 shrink-0 transition-transform duration-200",
                  activeTab === item.id ? "scale-110" : "group-hover:scale-110"
                )} />
                <span className="font-medium text-sm">{item.label}</span>
              </button>
            ))}
          </div>
        )}

        {showLancamentos && (
          <div className="space-y-1">
            <button
              onClick={() => setLancamentosExpanded((prev) => !prev)}
              data-tour="group-lancamentos"
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group",
                lancamentosGroupIds.includes(activeTab)
                  ? "text-white bg-white/10"
                  : "text-white/80 hover:bg-white/5 hover:text-white"
              )}
            >
              <Layers className="w-5 h-5 min-w-5 min-h-5 shrink-0 transition-transform duration-200 group-hover:scale-110" />
              <span className={cn("font-medium text-sm flex-1 text-left", collapsed && "hidden")}>
                Lançamentos
              </span>
              <ChevronDown
                className={cn(
                  "w-4 h-4 transition-transform duration-200",
                  lancamentosExpanded && "rotate-180",
                  collapsed && "hidden"
                )}
              />
            </button>

            {!collapsed && lancamentosExpanded && lancamentosMenu.map((item) => (
              <button
                key={item.id}
                data-tour={`nav-${item.id}`}
                onClick={() => setActiveTab(item.id)}
                className={cn(
                  "w-full flex items-center gap-3 pl-11 pr-4 py-2 rounded-xl transition-all duration-200 group",
                  activeTab === item.id
                    ? "bg-emerald-500 text-white shadow-lg shadow-emerald-900/20"
                    : "text-white/70 hover:bg-white/5 hover:text-white"
                )}
                title={item.label}
              >
                <item.icon className={cn(
                  "w-4 h-4 min-w-4 min-h-4 shrink-0 transition-transform duration-200",
                  activeTab === item.id ? "scale-110" : "group-hover:scale-110"
                )} />
                <span className="font-medium text-xs truncate text-left">{item.label}</span>
              </button>
            ))}
          </div>
        )}

        {showCompras && (
          <div className="space-y-1">
            <button
              onClick={() => setComprasExpanded((prev) => !prev)}
              data-tour="group-compras"
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group",
                comprasIds.includes(activeTab)
                  ? "text-white bg-white/10"
                  : "text-white/80 hover:bg-white/5 hover:text-white"
              )}
            >
              <ShoppingCart className="w-5 h-5 min-w-5 min-h-5 shrink-0 transition-transform duration-200 group-hover:scale-110" />
              <span className={cn("font-medium text-sm flex-1 text-left", collapsed && "hidden")}>
                Compras
              </span>
              <ChevronDown
                className={cn(
                  "w-4 h-4 transition-transform duration-200",
                  comprasExpanded && "rotate-180",
                  collapsed && "hidden"
                )}
              />
            </button>
            {!collapsed && comprasExpanded && (
              <button
                onClick={() => setActiveTab('compras-ordem')}
                data-tour="nav-compras-ordem"
                className={cn(
                  "w-full flex items-center gap-3 pl-11 pr-4 py-2 rounded-xl transition-all duration-200 group",
                  activeTab === 'compras-ordem'
                    ? "bg-emerald-500 text-white shadow-lg shadow-emerald-900/20"
                    : "text-white/70 hover:bg-white/5 hover:text-white"
                )}
              >
                <FileCheck className="w-4 h-4 min-w-4 min-h-4 shrink-0" />
                <span className="font-medium text-xs truncate text-left">Ordem de Compra</span>
              </button>
            )}
          </div>
        )}

        {showPaineis && (
          <div className="space-y-1">
            <button
              onClick={() => setPaineisExpanded((prev) => !prev)}
              data-tour="group-setores"
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group",
                painelTabIds.includes(activeTab)
                  ? "text-white bg-white/10"
                  : "text-white/80 hover:bg-white/5 hover:text-white"
              )}
            >
              <Building2 className="w-5 h-5 min-w-5 min-h-5 shrink-0 transition-transform duration-200 group-hover:scale-110" />
              <span className={cn("font-medium text-sm flex-1 text-left", collapsed && "hidden")}>
                Setores
              </span>
              <ChevronDown
                className={cn(
                  "w-4 h-4 transition-transform duration-200",
                  paineisExpanded && "rotate-180",
                  collapsed && "hidden"
                )}
              />
            </button>
            {!collapsed && paineisExpanded && painelMenu.map((item) => (
              <button
                key={item.tabId}
                data-tour={`nav-${item.tabId}`}
                onClick={() => setActiveTab(item.tabId)}
                className={cn(
                  "w-full flex items-center gap-3 pl-11 pr-4 py-2 rounded-xl transition-all duration-200 group",
                  activeTab === item.tabId
                    ? "bg-emerald-500 text-white shadow-lg shadow-emerald-900/20"
                    : "text-white/70 hover:bg-white/5 hover:text-white"
                )}
                title={item.label}
              >
                <Layers className={cn(
                  "w-4 h-4 min-w-4 min-h-4 shrink-0 transition-transform duration-200",
                  activeTab === item.tabId ? "scale-110" : "group-hover:scale-110"
                )} />
                <span className="font-medium text-xs truncate text-left">{item.shortLabel}</span>
              </button>
            ))}
          </div>
        )}

        {primaryMenu.map((item) => (
          <button
            key={item.id}
            data-tour={`nav-${item.id}`}
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

        {showBaseOrcamento && (
          <div className="space-y-1">
            <button
              onClick={() => setBaseOrcamentoExpanded((prev) => !prev)}
              data-tour="group-base-orcamento"
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group",
                isBaseOrcamentoActive
                  ? "text-white bg-white/10"
                  : "text-white/80 hover:bg-white/5 hover:text-white"
              )}
            >
              <Rows4 className="w-5 h-5 min-w-5 min-h-5 shrink-0 transition-transform duration-200 group-hover:scale-110" />
              <span className={cn("font-medium text-sm flex-1 text-left", collapsed && "hidden")}>
                Base de Orçamento
              </span>
              <ChevronDown
                className={cn(
                  "w-4 h-4 transition-transform duration-200",
                  baseOrcamentoExpanded && "rotate-180",
                  collapsed && "hidden"
                )}
              />
            </button>

            {!collapsed && baseOrcamentoExpanded && BASE_ORCAMENTO_ITENS.filter((item) =>
              item.tabId === 'sintase' || showPlanilhas
            ).map((item) => (
              <button
                key={item.tabId}
                data-tour={`nav-${item.tabId}`}
                onClick={() => setActiveTab(item.tabId)}
                className={cn(
                  "w-full flex items-center gap-3 pl-11 pr-4 py-2 rounded-xl transition-all duration-200 group",
                  activeTab === item.tabId
                    ? "bg-emerald-500 text-white shadow-lg shadow-emerald-900/20"
                    : "text-white/70 hover:bg-white/5 hover:text-white"
                )}
                title={item.nome}
              >
                <Table2 className={cn(
                  "w-4 h-4 min-w-4 min-h-4 shrink-0 transition-transform duration-200",
                  activeTab === item.tabId ? "scale-110" : "group-hover:scale-110"
                )} />
                <span className="font-medium text-xs truncate text-left">{item.nome}</span>
              </button>
            ))}
          </div>
        )}

        {showPlanilhas && (
          <div className="space-y-1">
            <button
              onClick={() => setPlanilhasExpanded((prev) => !prev)}
              data-tour="group-resultados"
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group",
                isApuracaoResultadosTab
                  ? "text-white bg-white/10"
                  : "text-white/80 hover:bg-white/5 hover:text-white"
              )}
            >
              <FileSpreadsheet className="w-5 h-5 min-w-5 min-h-5 shrink-0 transition-transform duration-200 group-hover:scale-110" />
              <span className={cn("font-medium text-sm flex-1 text-left", collapsed && "hidden")}>
                Apuração de Resultados
              </span>
              <ChevronDown
                className={cn(
                  "w-4 h-4 transition-transform duration-200",
                  planilhasExpanded && "rotate-180",
                  collapsed && "hidden"
                )}
              />
            </button>

            {!collapsed && planilhasExpanded && (
              <>
                {PLANILHAS_RESULTADOS.map((planilha) => {
                  const tabId = `planilha-${planilha.indice}`;
                  return (
                    <button
                      key={tabId}
                      data-tour={`nav-${tabId}`}
                      onClick={() => setActiveTab(tabId)}
                      className={cn(
                        "w-full flex items-center gap-3 pl-11 pr-4 py-2 rounded-xl transition-all duration-200 group",
                        activeTab === tabId
                          ? "bg-emerald-500 text-white shadow-lg shadow-emerald-900/20"
                          : "text-white/70 hover:bg-white/5 hover:text-white"
                      )}
                      title={planilha.nome}
                    >
                      <Table2 className={cn(
                        "w-4 h-4 min-w-4 min-h-4 shrink-0 transition-transform duration-200",
                        activeTab === tabId ? "scale-110" : "group-hover:scale-110"
                      )} />
                      <span className="font-medium text-xs truncate text-left">{planilha.nome}</span>
                    </button>
                  );
                })}

                <button
                  onClick={() => setRelCrdExpanded((prev) => !prev)}
                  className={cn(
                    "w-full flex items-center gap-3 pl-11 pr-4 py-2 rounded-xl transition-all duration-200 group",
                    isRelCrdActive
                      ? "text-white bg-white/10"
                      : "text-white/70 hover:bg-white/5 hover:text-white"
                  )}
                >
                  <FileCheck className={cn(
                    "w-4 h-4 min-w-4 min-h-4 shrink-0 transition-transform duration-200",
                    isRelCrdActive ? "scale-110" : "group-hover:scale-110"
                  )} />
                  <span className="font-medium text-xs truncate text-left flex-1">Relatorio de CRD</span>
                  <ChevronDown
                    className={cn(
                      "w-3.5 h-3.5 transition-transform duration-200",
                      relCrdExpanded && "rotate-180"
                    )}
                  />
                </button>

                {relCrdExpanded && (
                  <>
                    <button
                      onClick={() => setActiveTab('rel-crd')}
                      data-tour="nav-rel-crd"
                      className={cn(
                        "w-full flex items-center gap-3 pl-14 pr-4 py-2 rounded-xl transition-all duration-200 group",
                        activeTab === 'rel-crd'
                          ? "bg-emerald-500 text-white shadow-lg shadow-emerald-900/20"
                          : "text-white/70 hover:bg-white/5 hover:text-white"
                      )}
                    >
                      <Calculator className={cn(
                        "w-3.5 h-3.5 min-w-3.5 min-h-3.5 shrink-0",
                        activeTab === 'rel-crd' ? "scale-110" : "group-hover:scale-110"
                      )} />
                      <span className="font-medium text-xs truncate text-left">Resumo</span>
                    </button>
                    {REL_CRD_MESES.map((mes, idx) => {
                      const tabId = `rel-crd-${idx + 1}`;
                      return (
                        <button
                          key={tabId}
                          onClick={() => setActiveTab(tabId)}
                          className={cn(
                            "w-full flex items-center gap-3 pl-14 pr-4 py-1.5 rounded-xl transition-all duration-200 group",
                            activeTab === tabId
                              ? "bg-emerald-500 text-white shadow-lg shadow-emerald-900/20"
                              : "text-white/60 hover:bg-white/5 hover:text-white"
                          )}
                        >
                          <CalendarDays className={cn(
                            "w-3.5 h-3.5 min-w-3.5 min-h-3.5 shrink-0",
                            activeTab === tabId ? "scale-110" : "group-hover:scale-110"
                          )} />
                          <span className="font-medium text-[11px] truncate text-left">
                            {String(idx + 1).padStart(2, '0')} · {mes}
                          </span>
                        </button>
                      );
                    })}
                  </>
                )}

                <button
                  onClick={() => setRelReqExpanded((prev) => !prev)}
                  className={cn(
                    "w-full flex items-center gap-3 pl-11 pr-4 py-2 rounded-xl transition-all duration-200 group",
                    isRelReqActive
                      ? "text-white bg-white/10"
                      : "text-white/70 hover:bg-white/5 hover:text-white"
                  )}
                >
                  <Layers className={cn(
                    "w-4 h-4 min-w-4 min-h-4 shrink-0 transition-transform duration-200",
                    isRelReqActive ? "scale-110" : "group-hover:scale-110"
                  )} />
                  <span className="font-medium text-xs truncate text-left flex-1">Requisição Sintética</span>
                  <ChevronDown
                    className={cn(
                      "w-3.5 h-3.5 transition-transform duration-200",
                      relReqExpanded && "rotate-180"
                    )}
                  />
                </button>

                {relReqExpanded && (
                  <>
                    <button
                      onClick={() => setActiveTab('rel-req')}
                      data-tour="nav-rel-req"
                      className={cn(
                        "w-full flex items-center gap-3 pl-14 pr-4 py-2 rounded-xl transition-all duration-200 group",
                        activeTab === 'rel-req'
                          ? "bg-emerald-500 text-white shadow-lg shadow-emerald-900/20"
                          : "text-white/70 hover:bg-white/5 hover:text-white"
                      )}
                    >
                      <Calculator className={cn(
                        "w-3.5 h-3.5 min-w-3.5 min-h-3.5 shrink-0",
                        activeTab === 'rel-req' ? "scale-110" : "group-hover:scale-110"
                      )} />
                      <span className="font-medium text-xs truncate text-left">Resumo</span>
                    </button>
                    {REL_CRD_MESES.map((mes, idx) => {
                      const tabId = `rel-req-${idx + 1}`;
                      return (
                        <button
                          key={tabId}
                          onClick={() => setActiveTab(tabId)}
                          className={cn(
                            "w-full flex items-center gap-3 pl-14 pr-4 py-1.5 rounded-xl transition-all duration-200 group",
                            activeTab === tabId
                              ? "bg-emerald-500 text-white shadow-lg shadow-emerald-900/20"
                              : "text-white/60 hover:bg-white/5 hover:text-white"
                          )}
                        >
                          <CalendarDays className={cn(
                            "w-3.5 h-3.5 min-w-3.5 min-h-3.5 shrink-0",
                            activeTab === tabId ? "scale-110" : "group-hover:scale-110"
                          )} />
                          <span className="font-medium text-[11px] truncate text-left">
                            {String(idx + 1).padStart(2, '0')} · {mes}
                          </span>
                        </button>
                      );
                    })}
                  </>
                )}

                <button
                  onClick={() => setConsumoExpanded((prev) => !prev)}
                  className={cn(
                    "w-full flex items-center gap-3 pl-11 pr-4 py-2 rounded-xl transition-all duration-200 group",
                    isConsumoActive
                      ? "text-white bg-white/10"
                      : "text-white/70 hover:bg-white/5 hover:text-white"
                  )}
                >
                  <Boxes className={cn(
                    "w-4 h-4 min-w-4 min-h-4 shrink-0 transition-transform duration-200",
                    isConsumoActive ? "scale-110" : "group-hover:scale-110"
                  )} />
                  <span className="font-medium text-xs truncate text-left flex-1">Consumo interno</span>
                  <ChevronDown
                    className={cn(
                      "w-3.5 h-3.5 transition-transform duration-200",
                      consumoExpanded && "rotate-180"
                    )}
                  />
                </button>

                {consumoExpanded && (
                  <>
                    <button
                      onClick={() => setActiveTab('rel-consumo')}
                      data-tour="nav-rel-consumo"
                      className={cn(
                        "w-full flex items-center gap-3 pl-14 pr-4 py-2 rounded-xl transition-all duration-200 group",
                        activeTab === 'rel-consumo'
                          ? "bg-emerald-500 text-white shadow-lg shadow-emerald-900/20"
                          : "text-white/70 hover:bg-white/5 hover:text-white"
                      )}
                    >
                      <Calculator className={cn(
                        "w-3.5 h-3.5 min-w-3.5 min-h-3.5 shrink-0",
                        activeTab === 'rel-consumo' ? "scale-110" : "group-hover:scale-110"
                      )} />
                      <span className="font-medium text-xs truncate text-left">Resumo</span>
                    </button>
                    {REL_CRD_MESES.map((mes, idx) => {
                      const tabId = `rel-consumo-${idx + 1}`;
                      return (
                        <button
                          key={tabId}
                          onClick={() => setActiveTab(tabId)}
                          className={cn(
                            "w-full flex items-center gap-3 pl-14 pr-4 py-1.5 rounded-xl transition-all duration-200 group",
                            activeTab === tabId
                              ? "bg-emerald-500 text-white shadow-lg shadow-emerald-900/20"
                              : "text-white/60 hover:bg-white/5 hover:text-white"
                          )}
                        >
                          <CalendarDays className={cn(
                            "w-3.5 h-3.5 min-w-3.5 min-h-3.5 shrink-0",
                            activeTab === tabId ? "scale-110" : "group-hover:scale-110"
                          )} />
                          <span className="font-medium text-[11px] truncate text-left">
                            {String(idx + 1).padStart(2, '0')} · {mes}
                          </span>
                        </button>
                      );
                    })}
                  </>
                )}
              </>
            )}
          </div>
        )}

        {showApuracaoReceita && (
          <div className="space-y-1">
            <button
              onClick={() => setReceitaExpanded((prev) => !prev)}
              data-tour="group-receita"
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group",
                isApuracaoReceitaTab
                  ? "text-white bg-white/10"
                  : "text-white/80 hover:bg-white/5 hover:text-white"
              )}
            >
              <TrendingUp className="w-5 h-5 min-w-5 min-h-5 shrink-0 transition-transform duration-200 group-hover:scale-110" />
              <span className={cn("font-medium text-sm flex-1 text-left", collapsed && "hidden")}>
                Apuração de Receita
              </span>
              <ChevronDown
                className={cn(
                  "w-4 h-4 transition-transform duration-200",
                  receitaExpanded && "rotate-180",
                  collapsed && "hidden"
                )}
              />
            </button>

            {!collapsed && receitaExpanded && (
              <>
                {APURACAO_RECEITA_ITENS.map((item) => {
                  const tabId = `planilha-${item.indice}`;
                  return (
                    <button
                      key={tabId}
                      data-tour={`nav-${tabId}`}
                      onClick={() => setActiveTab(tabId)}
                      className={cn(
                        "w-full flex items-center gap-3 pl-11 pr-4 py-2 rounded-xl transition-all duration-200 group",
                        activeTab === tabId
                          ? "bg-emerald-500 text-white shadow-lg shadow-emerald-900/20"
                          : "text-white/70 hover:bg-white/5 hover:text-white"
                      )}
                      title={item.nome}
                    >
                      <Table2 className={cn(
                        "w-4 h-4 min-w-4 min-h-4 shrink-0 transition-transform duration-200",
                        activeTab === tabId ? "scale-110" : "group-hover:scale-110"
                      )} />
                      <span className="font-medium text-xs truncate text-left">{item.nome}</span>
                    </button>
                  );
                })}

                <button
                  onClick={() => setRdsExpanded((prev) => !prev)}
                  className={cn(
                    "w-full flex items-center gap-3 pl-11 pr-4 py-2 rounded-xl transition-all duration-200 group",
                    isRdsActive
                      ? "text-white bg-white/10"
                      : "text-white/70 hover:bg-white/5 hover:text-white"
                  )}
                >
                  <ClipboardList className={cn(
                    "w-4 h-4 min-w-4 min-h-4 shrink-0 transition-transform duration-200",
                    isRdsActive ? "scale-110" : "group-hover:scale-110"
                  )} />
                  <span className="font-medium text-xs truncate text-left flex-1">Relatório Diário de Situação</span>
                  <ChevronDown
                    className={cn(
                      "w-3.5 h-3.5 transition-transform duration-200",
                      rdsExpanded && "rotate-180"
                    )}
                  />
                </button>

                {rdsExpanded && (
                  <>
                    <button
                      onClick={() => setActiveTab('rel-rds')}
                      data-tour="nav-rel-rds"
                      className={cn(
                        "w-full flex items-center gap-3 pl-14 pr-4 py-2 rounded-xl transition-all duration-200 group",
                        activeTab === 'rel-rds'
                          ? "bg-emerald-500 text-white shadow-lg shadow-emerald-900/20"
                          : "text-white/70 hover:bg-white/5 hover:text-white"
                      )}
                    >
                      <Calculator className={cn(
                        "w-3.5 h-3.5 min-w-3.5 min-h-3.5 shrink-0",
                        activeTab === 'rel-rds' ? "scale-110" : "group-hover:scale-110"
                      )} />
                      <span className="font-medium text-xs truncate text-left">Resumo</span>
                    </button>
                    {REL_CRD_MESES.map((mes, idx) => {
                      const tabId = `rel-rds-${idx + 1}`;
                      return (
                        <button
                          key={tabId}
                          onClick={() => setActiveTab(tabId)}
                          className={cn(
                            "w-full flex items-center gap-3 pl-14 pr-4 py-1.5 rounded-xl transition-all duration-200 group",
                            activeTab === tabId
                              ? "bg-emerald-500 text-white shadow-lg shadow-emerald-900/20"
                              : "text-white/60 hover:bg-white/5 hover:text-white"
                          )}
                        >
                          <CalendarDays className={cn(
                            "w-3.5 h-3.5 min-w-3.5 min-h-3.5 shrink-0",
                            activeTab === tabId ? "scale-110" : "group-hover:scale-110"
                          )} />
                          <span className="font-medium text-[11px] truncate text-left">
                            {String(idx + 1).padStart(2, '0')} · {mes}
                          </span>
                        </button>
                      );
                    })}
                  </>
                )}
              </>
            )}
          </div>
        )}

        {showFolha && (
          <div className="space-y-1">
            <button
              onClick={() => setFolhaExpanded((prev) => !prev)}
              data-tour="group-folha"
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group",
                activeTab.startsWith('folha-') || activeTab === 'folha-apuracao'
                  ? "text-white bg-white/10"
                  : "text-white/80 hover:bg-white/5 hover:text-white"
              )}
            >
              <Wallet className="w-5 h-5 min-w-5 min-h-5 shrink-0 transition-transform duration-200 group-hover:scale-110" />
              <span className={cn("font-medium text-sm flex-1 text-left", collapsed && "hidden")}>
                Apuração da Folha
              </span>
              <ChevronDown
                className={cn(
                  "w-4 h-4 transition-transform duration-200",
                  folhaExpanded && "rotate-180",
                  collapsed && "hidden"
                )}
              />
            </button>

            {!collapsed && folhaExpanded && (
              <button
                onClick={() => setActiveTab('folha-apuracao')}
                data-tour="nav-folha-apuracao"
                className={cn(
                  "w-full flex items-center gap-3 pl-11 pr-4 py-2 rounded-xl transition-all duration-200 group",
                  activeTab === 'folha-apuracao'
                    ? "bg-emerald-500 text-white shadow-lg shadow-emerald-900/20"
                    : "text-white/70 hover:bg-white/5 hover:text-white"
                )}
              >
                <Calculator className={cn(
                  "w-4 h-4 min-w-4 min-h-4 shrink-0",
                  activeTab === 'folha-apuracao' ? "scale-110" : "group-hover:scale-110"
                )} />
                <span className="font-medium text-xs truncate text-left">Apuração</span>
              </button>
            )}

            {!collapsed && folhaExpanded && FOLHA_MESES.map((mes, idx) => {
              const tabId = `folha-${idx + 1}`;
              return (
                <button
                  key={tabId}
                  onClick={() => setActiveTab(tabId)}
                  className={cn(
                    "w-full flex items-center gap-3 pl-11 pr-4 py-2 rounded-xl transition-all duration-200 group",
                    activeTab === tabId
                      ? "bg-emerald-500 text-white shadow-lg shadow-emerald-900/20"
                      : "text-white/70 hover:bg-white/5 hover:text-white"
                  )}
                  title={mes}
                >
                  <CalendarDays className={cn(
                    "w-4 h-4 min-w-4 min-h-4 shrink-0 transition-transform duration-200",
                    activeTab === tabId ? "scale-110" : "group-hover:scale-110"
                  )} />
                  <span className="font-medium text-xs truncate text-left">
                    {String(idx + 1).padStart(2, '0')} · {mes}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {adminMenu.map((item) => (
          <button
            key={item.id}
            data-tour={`nav-${item.id}`}
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

        {showTutorial && (
        <button
          type="button"
          data-tour="nav-tutorial"
          onClick={() => setActiveTab('tutorial')}
          className={cn(
            "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group",
            activeTab === 'tutorial'
              ? "bg-emerald-500 text-white shadow-lg shadow-emerald-900/20"
              : "text-white/80 hover:bg-white/5 hover:text-white"
          )}
        >
          <BookOpen className={cn(
            "w-5 h-5 min-w-5 min-h-5 shrink-0 transition-transform duration-200",
            activeTab === 'tutorial' ? "scale-110" : "group-hover:scale-110"
          )} />
          <span className={cn("font-medium text-sm", collapsed && "hidden")}>Tutorial guiado</span>
        </button>
        )}
      </nav>

      <div className="p-4 border-t border-white/10 space-y-4">
        <div className={cn("flex items-center gap-3 px-2", collapsed && "justify-center")}>
          <div className="w-10 h-10 rounded-full bg-emerald-800 flex items-center justify-center border border-emerald-400/30">
            <User className="w-5 h-5 text-emerald-300" />
          </div>
          <div className={cn("flex-1 min-w-0", collapsed && "hidden")}>
            <p className="text-sm font-semibold truncate">{user?.name}</p>
            <p className="text-[10px] text-white/75 uppercase font-bold tracking-tighter truncate">
              {user?.role === 'admin' ? 'Administrador' :
               user?.role === 'finance' ? 'Financeiro' :
               user?.role === 'controle' ? 'Controle' :
               user?.role === 'manager' ? 'Gestor' :
               user?.role === 'viewer' ? 'Visualizador' :
               user?.role === 'diretoria' ? 'Diretoria' :
               String(user?.role || '')}
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
