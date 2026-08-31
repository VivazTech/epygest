/** Catálogo de telas/ações configuráveis na aba Permissões. */

export type PermissionAction = 'view' | 'create' | 'edit' | 'delete';

export type PermissionResource = {
  key: string;
  label: string;
  group: string;
  /** Quais ações fazem sentido para este recurso (sempre inclui view). */
  actions: PermissionAction[];
  description?: string;
};

export type RolePermissionRow = {
  resource_key: string;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
};

export const PERMISSION_RESOURCES: PermissionResource[] = [
  { key: 'dashboard', label: 'Dashboard Geral', group: 'Menu principal', actions: ['view'] },
  { key: 'analise', label: 'Análise Financeira', group: 'Menu principal', actions: ['view'] },
  { key: 'dre', label: 'DRE Gerencial', group: 'Menu principal', actions: ['view', 'edit'] },
  { key: 'planejamento', label: 'Planejamento', group: 'Menu principal', actions: ['view', 'edit'] },
  { key: 'importacao', label: 'Importação', group: 'Menu principal', actions: ['view', 'create'] },
  { key: 'cadastros', label: 'Cadastros', group: 'Menu principal', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'prev-real', label: 'Prev x Real Diario', group: 'Menu principal', actions: ['view'] },
  { key: 'indicadores', label: 'Indicadores (Números)', group: 'Menu principal', actions: ['view'] },
  { key: 'investimentos', label: 'Investimentos', group: 'Menu principal', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'usuarios', label: 'Usuários / Permissões', group: 'Menu principal', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'sugestoes', label: 'Sugestões', group: 'Menu principal', actions: ['view'] },
  { key: 'configuracoes', label: 'Configurações', group: 'Menu principal', actions: ['view', 'edit'] },

  { key: 'comandas', label: 'Comandas', group: 'Lançamentos', actions: ['view', 'create', 'edit'] },
  { key: 'lancamentos-manuais', label: 'Lançamentos Manuais', group: 'Lançamentos', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'requisicoes', label: 'Requisições', group: 'Lançamentos', actions: ['view', 'create', 'edit'] },
  { key: 'notas', label: 'Notas de Serviço', group: 'Lançamentos', actions: ['view', 'create', 'edit'] },
  { key: 'danfe', label: 'DANFE', group: 'Lançamentos', actions: ['view', 'create', 'edit'] },
  { key: 'mensalidades', label: 'Mensalidades', group: 'Lançamentos', actions: ['view', 'create', 'edit'] },
  { key: 'aprovacoes', label: 'Aprovações', group: 'Lançamentos', actions: ['view', 'edit'] },

  { key: 'compras-ordem', label: 'Ordem de Compra', group: 'Compras', actions: ['view', 'create', 'edit'] },

  { key: 'painel-operacional', label: 'Painel Operacional', group: 'Painéis setoriais', actions: ['view', 'edit'] },
  { key: 'painel-ab', label: 'Painel A&B', group: 'Painéis setoriais', actions: ['view', 'edit'] },
  { key: 'painel-spa', label: 'Painel SPA', group: 'Painéis setoriais', actions: ['view', 'edit'] },
  { key: 'painel-hospedagem', label: 'Painel Hospedagem', group: 'Painéis setoriais', actions: ['view', 'edit'] },
  { key: 'painel-nutricionista', label: 'Painel Nutricionista', group: 'Painéis setoriais', actions: ['view', 'edit'] },
  { key: 'painel-controladoria', label: 'Painel Controladoria', group: 'Painéis setoriais', actions: ['view', 'edit'] },

  {
    key: 'apuracao-resultados',
    label: 'Apuração de Resultados',
    group: 'Módulos',
    actions: ['view'],
    description: 'Inclui Rel. CRD, Rel. Requisições, Consumo Interno, CMV e planilhas do módulo.',
  },
  {
    key: 'apuracao-receita',
    label: 'Apuração de Receita',
    group: 'Módulos',
    actions: ['view'],
    description: 'Inclui Relatório de RDS e Apoio RDS.',
  },
  {
    key: 'base-orcamento',
    label: 'Base de Orçamento',
    group: 'Módulos',
    actions: ['view'],
  },
  {
    key: 'folha',
    label: 'Apuração da Folha',
    group: 'Módulos',
    actions: ['view', 'edit'],
  },
  { key: 'tutorial', label: 'Tutorial', group: 'Ajuda', actions: ['view'] },
  {
    key: 'uml',
    label: 'UML do Sistema',
    group: 'Administração',
    actions: ['view'],
    description: 'Documentação técnica (arquitetura, dados, fluxos e API). Somente admin.',
  },
];

export const PERMISSION_RESOURCE_KEYS = PERMISSION_RESOURCES.map((r) => r.key);

/** Matriz padrão (estado atual do Sidebar) usada no seed e como fallback. */
export const DEFAULT_ROLE_PERMISSIONS: Record<string, Partial<Record<string, PermissionAction[]>>> = {
  admin: Object.fromEntries(PERMISSION_RESOURCES.map((r) => [r.key, r.actions])),
  finance: {
    investimentos: ['view'],
    aprovacoes: ['view', 'edit'],
    comandas: ['view', 'create', 'edit'],
    'lancamentos-manuais': ['view', 'create', 'edit'],
    requisicoes: ['view', 'create', 'edit'],
    notas: ['view', 'create', 'edit'],
    danfe: ['view', 'create', 'edit'],
    mensalidades: ['view', 'create', 'edit'],
    tutorial: ['view'],
  },
  controle: Object.fromEntries(
    PERMISSION_RESOURCES.filter(
      (r) => r.key !== 'usuarios' && r.key !== 'configuracoes' && r.key !== 'uml'
    ).map((r) => [r.key, r.actions])
  ),
  manager: {
    dashboard: ['view'],
    analise: ['view'],
    planejamento: ['view'],
    'prev-real': ['view'],
    indicadores: ['view'],
    investimentos: ['view'],
    comandas: ['view', 'create', 'edit'],
    'lancamentos-manuais': ['view', 'create', 'edit'],
    requisicoes: ['view', 'create', 'edit'],
    notas: ['view', 'create', 'edit'],
    danfe: ['view', 'create', 'edit'],
    mensalidades: ['view', 'create', 'edit'],
    'compras-ordem': ['view', 'create', 'edit'],
    'painel-operacional': ['view', 'edit'],
    'painel-ab': ['view', 'edit'],
    'painel-spa': ['view', 'edit'],
    'painel-hospedagem': ['view', 'edit'],
    'painel-nutricionista': ['view', 'edit'],
    'painel-controladoria': ['view', 'edit'],
    'base-orcamento': ['view'],
    tutorial: ['view'],
  },
  viewer: {
    dashboard: ['view'],
    tutorial: ['view'],
  },
  diretoria: {
    dashboard: ['view'],
    dre: ['view'],
    indicadores: ['view'],
    investimentos: ['view'],
    mensalidades: ['view'],
    'painel-operacional': ['view'],
    'painel-ab': ['view'],
    'painel-spa': ['view'],
    'painel-hospedagem': ['view'],
    'painel-nutricionista': ['view'],
    'painel-controladoria': ['view'],
    tutorial: ['view'],
  },
};

export const SYSTEM_ROLES: Array<{ slug: string; label: string; description: string; sort_order: number }> = [
  { slug: 'admin', label: 'Administrador', description: 'Acesso total ao sistema.', sort_order: 10 },
  { slug: 'finance', label: 'Financeiro', description: 'Lançamentos, notas e rotinas financeiras.', sort_order: 20 },
  { slug: 'controle', label: 'Controle', description: 'Controle gerencial e cadastros.', sort_order: 30 },
  { slug: 'manager', label: 'Gestor', description: 'Visão gerencial e painéis setoriais.', sort_order: 40 },
  { slug: 'viewer', label: 'Visualizador', description: 'Acesso somente leitura ao dashboard.', sort_order: 50 },
  { slug: 'diretoria', label: 'Diretoria', description: 'Indicadores e visão consolidada.', sort_order: 60 },
];

export const actionsToFlags = (actions: PermissionAction[] = []) => ({
  can_view: actions.includes('view'),
  can_create: actions.includes('create'),
  can_edit: actions.includes('edit'),
  can_delete: actions.includes('delete'),
});

export const flagsToActions = (row: {
  can_view?: boolean;
  can_create?: boolean;
  can_edit?: boolean;
  can_delete?: boolean;
}): PermissionAction[] => {
  const actions: PermissionAction[] = [];
  if (row.can_view) actions.push('view');
  if (row.can_create) actions.push('create');
  if (row.can_edit) actions.push('edit');
  if (row.can_delete) actions.push('delete');
  return actions;
};

export const buildDefaultPermissionRows = (roleSlug: string): RolePermissionRow[] => {
  const map = DEFAULT_ROLE_PERMISSIONS[roleSlug] || {};
  return PERMISSION_RESOURCES.map((resource) => {
    const actions = map[resource.key] || [];
    return {
      resource_key: resource.key,
      ...actionsToFlags(actions),
    };
  });
};

export const slugifyRole = (label: string): string => {
  const base = label
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return base || `nivel-${Date.now().toString(36)}`;
};

/** Mapeia abas filhas (planilha-x, folha-3, etc.) para a chave de permissão do módulo. */
export const resolvePermissionResourceKey = (tabId: string): string => {
  if (!tabId) return tabId;
  if (PERMISSION_RESOURCE_KEYS.includes(tabId)) return tabId;
  if (tabId.startsWith('folha-')) return 'folha';
  if (
    tabId.startsWith('rel-crd') ||
    tabId.startsWith('rel-req') ||
    tabId.startsWith('rel-consumo') ||
    tabId === 'cmv' ||
    tabId.startsWith('cmv-')
  ) {
    return 'apuracao-resultados';
  }
  if (tabId.startsWith('rel-rds')) return 'apuracao-receita';
  if (tabId.startsWith('planilha-')) {
    // planilha 12/13 = receita; demais resultados (exceto base orçamento, tratada à parte)
    const n = Number(String(tabId).replace('planilha-', ''));
    if (n === 12 || n === 13) return 'apuracao-receita';
    if ([14, 15, 16, 17, 18].includes(n) || tabId === 'sintase') return 'base-orcamento';
    return 'apuracao-resultados';
  }
  if (tabId === 'sintase') return 'base-orcamento';
  return tabId;
};

export const hasPermission = (
  permissions: RolePermissionRow[] | undefined | null,
  resourceKey: string,
  action: PermissionAction = 'view',
  role?: string
): boolean => {
  if (role === 'admin') return true;
  if (!permissions?.length) return false;
  const key = resolvePermissionResourceKey(resourceKey);
  const row = permissions.find((p) => p.resource_key === key);
  if (!row) return false;
  if (action === 'view') return Boolean(row.can_view);
  if (action === 'create') return Boolean(row.can_create);
  if (action === 'edit') return Boolean(row.can_edit);
  if (action === 'delete') return Boolean(row.can_delete);
  return false;
};
