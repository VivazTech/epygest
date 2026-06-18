export const normalizeSearch = (value: unknown) =>
  String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');

export const matchesSearch = (query: string, ...values: unknown[]) => {
  const q = normalizeSearch(query).trim();
  if (!q) return true;
  return values.some((value) => normalizeSearch(value).includes(q));
};

export function filterTreeByLabel<T extends { label: string; children?: T[] }>(
  rows: T[],
  query: string
): T[] {
  const q = normalizeSearch(query).trim();
  if (!q) return rows;

  return rows.flatMap((row) => {
    const filteredChildren = row.children ? filterTreeByLabel(row.children, query) : undefined;
    if (normalizeSearch(row.label).includes(q) || (filteredChildren && filteredChildren.length > 0)) {
      return [{ ...row, children: filteredChildren }];
    }
    return [];
  });
}

export function getSearchPlaceholder(activeTab: string): string {
  if (activeTab.startsWith('planilha-')) return 'Buscar na planilha...';
  if (activeTab === 'folha-apuracao') return 'Buscar rubrica, código ou descrição...';
  if (activeTab.startsWith('folha-')) return 'Buscar funcionário, cargo ou matrícula...';

  const map: Record<string, string> = {
    dashboard: 'Buscar indicadores e categorias...',
    analise: 'Buscar categorias da análise...',
    dre: 'Buscar conta ou linha do DRE...',
    planejamento: 'Buscar períodos do planejamento...',
    notas: 'Buscar nota, fornecedor, setor ou CRD...',
    requisicoes: 'Buscar requisição, CRD ou descrição...',
    importacao: 'Buscar importação ou dados da prévia...',
    cadastros: 'Buscar cadastro, código ou setor...',
    sintase: 'Buscar CRD, grupo ou detalhado...',
    'prev-real': 'Buscar CRD, grupo ou detalhado...',
    usuarios: 'Buscar nome, e-mail ou setor...',
    configuracoes: 'Buscar configuração...',
  };

  return map[activeTab] ?? 'Buscar...';
}
