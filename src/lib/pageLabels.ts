/** Rótulos amigáveis das abas para sugestões e breadcrumbs. */

import { BASE_ORCAMENTO_ITENS, isBaseOrcamentoTab } from './planilhas';
import { getPainelByTab, isPainelSetorialTab } from './paineisSetoriais';

const MESES = [
  '',
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

const STATIC_LABELS: Record<string, string> = {
  dashboard: 'Dashboard Geral',
  analise: 'Análise Financeira',
  dre: 'DRE Gerencial',
  planejamento: 'Planejamento',
  importacao: 'Importação',
  cadastros: 'Cadastros',
  'prev-real': 'Prev x Real Diario',
  indicadores: 'Indicadores (Números)',
  investimentos: 'Investimentos',
  usuarios: 'Usuários',
  configuracoes: 'Configurações',
  sugestoes: 'Sugestões',
  comandas: 'Comandas',
  'lancamentos-manuais': 'Lançamentos Manuais',
  requisicoes: 'Requisições',
  notas: 'Notas de Serviço',
  danfe: 'DANFE',
  mensalidades: 'Mensalidades',
  aprovacoes: 'Aprovações',
  'compras-ordem': 'Compras / Ordem de Compra',
  'folha-apuracao': 'Apuração da Folha',
  tutorial: 'Tutorial guiado',
  'rel-crd': 'Apuração de Resultados / Relatorio de CRD / Resumo',
  'rel-req': 'Apuração de Resultados / Requisição Sintética / Resumo',
  'rel-consumo': 'Apuração de Resultados / Consumo interno / Resumo',
  'rel-rds': 'Apuração de Receita / Relatório Diário de Situação / Resumo',
};

export const getPageLabel = (activeTab: string): string => {
  if (!activeTab) return 'Desconhecida';
  if (STATIC_LABELS[activeTab]) return STATIC_LABELS[activeTab];

  if (activeTab.startsWith('folha-')) {
    const mes = Number(activeTab.slice('folha-'.length));
    return `Apuração da Folha / ${MESES[mes] || activeTab}`;
  }
  if (activeTab.startsWith('rel-crd-')) {
    const mes = Number(activeTab.slice('rel-crd-'.length));
    return `Apuração de Resultados / Relatorio de CRD / ${MESES[mes] || activeTab}`;
  }
  if (activeTab.startsWith('rel-req-')) {
    const mes = Number(activeTab.slice('rel-req-'.length));
    return `Apuração de Resultados / Requisição Sintética / ${MESES[mes] || activeTab}`;
  }
  if (activeTab.startsWith('rel-consumo-')) {
    const mes = Number(activeTab.slice('rel-consumo-'.length));
    return `Apuração de Resultados / Consumo interno / ${MESES[mes] || activeTab}`;
  }
  if (activeTab.startsWith('rel-rds-')) {
    const mes = Number(activeTab.slice('rel-rds-'.length));
    return `Apuração de Receita / Relatório Diário de Situação / ${MESES[mes] || activeTab}`;
  }
  if (activeTab.startsWith('planilha-')) {
    return `Planilha ${activeTab.slice('planilha-'.length)}`;
  }
  if (isBaseOrcamentoTab(activeTab)) {
    const item = BASE_ORCAMENTO_ITENS.find((p) => p.tabId === activeTab);
    return `Base de Orçamento / ${item?.nome ?? activeTab}`;
  }
  if (isPainelSetorialTab(activeTab)) {
    return `Setores / ${getPainelByTab(activeTab)?.label ?? activeTab}`;
  }
  return activeTab.replace(/-/g, ' ');
};
