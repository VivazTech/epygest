/** Configuração dos painéis setoriais (Fase 4.1–4.6). */

export type PainelKey =
  | 'operacional'
  | 'ab'
  | 'spa'
  | 'hospedagem'
  | 'nutricionista'
  | 'controladoria';

export type PainelConfig = {
  key: PainelKey;
  tabId: string;
  label: string;
  shortLabel: string;
  description: string;
  /** Nome(s) em `sectors` para filtrar CRDs (match case-insensitive). */
  sectorNames: string[];
  /** Palavras no nome/código do CRD para blocos temáticos. */
  crdKeywords?: Record<string, string[]>;
  roles: string[];
};

export const PAINEIS_SETORIAIS: PainelConfig[] = [
  {
    key: 'operacional',
    tabId: 'painel-operacional',
    label: 'Gerência Operacional',
    shortLabel: 'Operacional',
    description:
      'Manutenção, gás e energia elétrica: previsto × realizado, consumo por ocupação/RUNITE e observações do gestor.',
    sectorNames: ['Operacional'],
    crdKeywords: {
      manutencao: ['MANUTEN'],
      gas: ['GAS', 'GÁS'],
      energia: ['ENERGIA'],
    },
    roles: ['admin', 'controle', 'manager'],
  },
  {
    key: 'ab',
    tabId: 'painel-ab',
    label: 'A&B',
    shortLabel: 'A&B',
    description:
      'Quebras (louças/utensílios), comissão, mini-DREs de Pizzaria, Frigobar e Café da manhã, sobras.',
    sectorNames: ['A&B'],
    crdKeywords: {
      pizzaria: ['PIZZARIA'],
      frigobar: ['FRIGOBAR'],
      cafe: ['CAFE', 'CAFÉ', 'CAFE DA MANHA'],
      comissao: ['COMISSAO', 'COMISSÃO'],
    },
    roles: ['admin', 'controle', 'manager'],
  },
  {
    key: 'spa',
    tabId: 'painel-spa',
    label: 'SPA',
    shortLabel: 'SPA',
    description: 'Receita, mão de obra, uso e consumo, outros custos e % de resultado sobre receita.',
    sectorNames: [],
    crdKeywords: {
      spa: ['SPA'],
      mao_obra: ['PESSOAL', 'FOLHA', 'MAO DE OBRA', 'MÃO DE OBRA'],
      uso_consumo: ['USO', 'CONSUMO'],
    },
    roles: ['admin', 'controle', 'manager'],
  },
  {
    key: 'hospedagem',
    tabId: 'painel-hospedagem',
    label: 'Hospedagem',
    shortLabel: 'Hospedagem',
    description: 'Orçado × realizado, receita e custos de hospedagem, indicadores de lavanderia.',
    sectorNames: ['Hospedagem'],
    crdKeywords: {
      lavanderia: ['LAVANDER'],
      receita: ['HOSPEDAGEM', 'DIARIA', 'DIÁRIA'],
    },
    roles: ['admin', 'controle', 'manager'],
  },
  {
    key: 'nutricionista',
    tabId: 'painel-nutricionista',
    label: 'Nutricionista',
    shortLabel: 'Nutricionista',
    description:
      'Ações e despesas: responsável, prazo, status, custo previsto/realizado e observações (conteúdo a expandir com a equipe).',
    sectorNames: [],
    roles: ['admin', 'controle', 'manager'],
  },
  {
    key: 'controladoria',
    tabId: 'painel-controladoria',
    label: 'Controladoria',
    shortLabel: 'Controladoria',
    description:
      'Relatório semanal de uso e consumo: previsto, realizado, estouro, setor responsável e observações.',
    sectorNames: ['Controle'],
    roles: ['admin', 'controle'],
  },
];

export const PAINEL_TAB_IDS = PAINEIS_SETORIAIS.map((p) => p.tabId);

export const isPainelSetorialTab = (tab: string) => tab.startsWith('painel-');

export const getPainelByTab = (tab: string) =>
  PAINEIS_SETORIAIS.find((p) => p.tabId === tab) ?? null;

export const getPainelByKey = (key: string) =>
  PAINEIS_SETORIAIS.find((p) => p.key === key) ?? null;
