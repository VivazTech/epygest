/** Catálogo do Tutorial guiado: espelha o menu lateral, com texto de cada aba. */

export type TutorialRole = 'admin' | 'finance' | 'controle' | 'manager' | 'viewer' | 'diretoria';

export type TutorialGroupId =
  | 'em-construcao'
  | 'lancamentos'
  | 'compras'
  | 'setores'
  | 'gestao'
  | 'base-orcamento'
  | 'resultados'
  | 'receita'
  | 'folha'
  | 'admin'
  | 'ajuda';

export type TutorialItem = {
  id: string;
  tab: string;
  label: string;
  summary: string;
  tour: string;
  roles: TutorialRole[];
};

export type TutorialGroup = {
  id: TutorialGroupId;
  title: string;
  blurb: string;
  groupTour: string;
  items: TutorialItem[];
};

const ALL: TutorialRole[] = ['admin', 'finance', 'controle', 'manager', 'viewer', 'diretoria'];
const GESTAO: TutorialRole[] = ['admin', 'controle', 'manager'];
const DRE: TutorialRole[] = ['admin', 'controle', 'diretoria'];
const CONTROLE: TutorialRole[] = ['admin', 'controle'];
const LANC: TutorialRole[] = ['admin', 'finance', 'controle', 'manager'];
const PAINEL: TutorialRole[] = ['admin', 'controle', 'manager', 'diretoria'];

export const TUTORIAL_GROUPS: TutorialGroup[] = [
  {
    id: 'em-construcao',
    title: 'Em construção',
    blurb: 'Telas de visão geral ainda em evolução. Use para um panorama rápido, não para o fechamento do mês.',
    groupTour:
      'Este grupo reúne telas em desenvolvimento: dashboard, análise e planejamento. Servem de panorama; o operacional do dia a dia está nas outras seções.',
    items: [
      {
        id: 'dashboard',
        tab: 'dashboard',
        label: 'Dashboard Geral',
        summary: 'Painel inicial com indicadores consolidados da operação.',
        tour: 'Aqui a diretoria e o controle veem o recorte geral do hotel: ocupação, receitas e compromissos. É o ponto de partida ao entrar no sistema.',
        roles: ['admin', 'controle', 'manager', 'viewer', 'diretoria'],
      },
      {
        id: 'analise',
        tab: 'analise',
        label: 'Análise Financeira',
        summary: 'Leitura de categorias e tendências financeiras.',
        tour: 'A Análise Financeira organiza categorias para leitura gerencial. Ainda está em construção: use como apoio, não como fonte oficial de apuração.',
        roles: GESTAO,
      },
      {
        id: 'planejamento',
        tab: 'planejamento',
        label: 'Planejamento',
        summary: 'Visão de períodos e metas de planejamento.',
        tour: 'O Planejamento concentra períodos e metas. Também está em construção; o orçamento oficial vive na Base de Orçamento e no DRE.',
        roles: GESTAO,
      },
    ],
  },
  {
    id: 'lancamentos',
    title: 'Lançamentos',
    blurb: 'Entrada operacional do dia a dia: notas, requisições, comandas e contratos recorrentes.',
    groupTour:
      'Lançamentos é o cadastro do que acontece no hotel: notas, DANFE, requisições, comandas, lançamentos manuais e mensalidades. Tudo aqui alimenta o realizado dos setores.',
    items: [
      {
        id: 'comandas',
        tab: 'comandas',
        label: 'Comandas',
        summary: 'Registro de consumo interno por comanda, local e colaborador.',
        tour: 'Nas Comandas você registra consumo interno (itens, local PDV e consumidor). Use para rastrear o que saiu do estoque sem passar por nota fiscal.',
        roles: LANC,
      },
      {
        id: 'lancamentos-manuais',
        tab: 'lancamentos-manuais',
        label: 'Lançamentos Manuais',
        summary: 'Lançamentos avulsos vinculados a setor e CRD.',
        tour: 'Lançamentos Manuais servem para valores que não vieram de nota nem de requisição. Informe setor, CRD, valor, data e, se quiser, um arquivo de comprovante — eles entram no realizado do mês.',
        roles: LANC,
      },
      {
        id: 'requisicoes',
        tab: 'requisicoes',
        label: 'Requisições',
        summary: 'Pedidos internos de compra vinculados a CRD.',
        tour: 'Requisições são pedidos internos. Cada uma aponta para um CRD e um valor; enquanto estiver aberta, conta como compromisso do setor.',
        roles: LANC,
      },
      {
        id: 'notas',
        tab: 'notas',
        label: 'Notas de Serviço',
        summary: 'Notas de serviço: conferência, aprovação e pagamento.',
        tour: 'Notas de Serviço concentram NFS-e: valor, vencimento, setor e CRD. O fluxo vai de análise à aprovação até o relatório de pagamento.',
        roles: LANC,
      },
      {
        id: 'danfe',
        tab: 'danfe',
        label: 'DANFE',
        summary: 'Notas de produto (DANFE) no mesmo fluxo de conferência.',
        tour: 'DANFE é o mesmo fluxo das notas, mas para mercadorias. Confira valor, CRD e vencimento antes de enviar ao financeiro.',
        roles: LANC,
      },
      {
        id: 'mensalidades',
        tab: 'mensalidades',
        label: 'Mensalidades',
        summary: 'Contratos recorrentes (aluguéis, sistemas, serviços mensais).',
        tour: 'Mensalidades guarda contratos que se repetem todo mês. Cadastre fornecedor, valor e setor para não perder vencimentos fixos.',
        roles: ['admin', 'finance', 'controle', 'manager', 'diretoria'],
      },
    ],
  },
  {
    id: 'compras',
    title: 'Compras',
    blurb: 'Ordens de compra para material e serviço.',
    groupTour: 'Em Compras fica a Ordem de Compra: o documento que formaliza o pedido ao fornecedor depois da requisição.',
    items: [
      {
        id: 'compras-ordem',
        tab: 'compras-ordem',
        label: 'Ordem de Compra',
        summary: 'Emissão e acompanhamento de ordens de compra.',
        tour: 'A Ordem de Compra registra o que foi pedido ao fornecedor. Use depois da requisição aprovada, para deixar o pedido documentado.',
        roles: GESTAO,
      },
    ],
  },
  {
    id: 'setores',
    title: 'Setores',
    blurb: 'Painéis gerenciais por área: operacional, A&B, SPA, hospedagem e controladoria.',
    groupTour:
      'Cada painel setorial mostra previsto × realizado daquela área, com recortes próprios (energia, A&B, SPA, hospedagem, controladoria).',
    items: [
      {
        id: 'painel-operacional',
        tab: 'painel-operacional',
        label: 'Gerência Operacional',
        summary: 'Manutenção, gás e energia: previsto × realizado.',
        tour: 'Painel da Gerência Operacional: manutenção, gás e energia elétrica contra o orçamento, com consumo ligado à ocupação.',
        roles: PAINEL,
      },
      {
        id: 'painel-ab',
        tab: 'painel-ab',
        label: 'A&B',
        summary: 'Alimentos e bebidas: quebras, comissão e mini-DREs.',
        tour: 'O painel de A&B reúne quebras, comissão e mini-DREs de pizzaria, frigobar e café da manhã.',
        roles: PAINEL,
      },
      {
        id: 'painel-spa',
        tab: 'painel-spa',
        label: 'SPA',
        summary: 'Receita, mão de obra e resultado do SPA.',
        tour: 'No painel do SPA você acompanha receita, mão de obra, uso e consumo e o percentual de resultado sobre a receita.',
        roles: PAINEL,
      },
      {
        id: 'painel-hospedagem',
        tab: 'painel-hospedagem',
        label: 'Hospedagem',
        summary: 'Receita e custos de hospedagem, com lavanderia.',
        tour: 'Hospedagem compara orçado e realizado da receita e dos custos da área, incluindo indicadores de lavanderia.',
        roles: PAINEL,
      },
      {
        id: 'painel-nutricionista',
        tab: 'painel-nutricionista',
        label: 'Nutricionista',
        summary: 'Ações, prazos e custos da nutrição.',
        tour: 'O painel da Nutricionista lista ações com responsável, prazo, status e custo previsto/realizado.',
        roles: PAINEL,
      },
      {
        id: 'painel-controladoria',
        tab: 'painel-controladoria',
        label: 'Controladoria',
        summary: 'Uso e consumo semanal: previsto, realizado e estouro.',
        tour: 'Controladoria mostra o relatório semanal de uso e consumo: previsto, realizado, estouro e setor responsável.',
        roles: ['admin', 'controle', 'diretoria'],
      },
    ],
  },
  {
    id: 'gestao',
    title: 'Gestão e apuração',
    blurb: 'DRE, importações, cadastros, previsto × realizado e investimentos.',
    groupTour:
      'Aqui está o núcleo gerencial: importar relatórios, cadastrar CRDs, comparar previsto × realizado, ler o DRE e acompanhar investimentos.',
    items: [
      {
        id: 'dre',
        tab: 'dre',
        label: 'DRE Gerencial',
        summary: 'DRE do ano: previsto, realizado (RDS e Rel. CRD) e ajustes.',
        tour: 'O DRE Gerencial é a demonstração do ano. Previsto vem da planilha; realizado de Diárias/A&B pelo RDS e despesas pelo Rel. CRD (SALDO LANÇ). Clique na célula para ajustar com motivo.',
        roles: DRE,
      },
      {
        id: 'importacao',
        tab: 'importacao',
        label: 'Importação',
        summary: 'Envio de Rel. CRD, RDS, folha, consumo interno e outros arquivos.',
        tour: 'Em Importação você sobe os arquivos do Desbravador e da folha. Cada importação aparece no histórico; dá para desfazer digitando DESFAZER.',
        roles: CONTROLE,
      },
      {
        id: 'cadastros',
        tab: 'cadastros',
        label: 'Cadastros',
        summary: 'Setores, CRDs, cargos e colaboradores.',
        tour: 'Cadastros é a base mestre: setores, CRDs (contas), cargos, colaboradores, formas de pagamento e moedas. Sem isso, notas e orçamento não encontram destino.',
        roles: CONTROLE,
      },
      {
        id: 'prev-real',
        tab: 'prev-real',
        label: 'Prev x Real Diario',
        summary: 'Comparativo diário/mensal de previsto e realizado por CRD.',
        tour: 'Prev × Real mostra, por CRD e setor, o orçamento do mês contra o realizado (notas, requisições, Rel. CRD, folha e consumo interno).',
        roles: GESTAO,
      },
      {
        id: 'indicadores',
        tab: 'indicadores',
        label: 'Indicadores (Números)',
        summary: 'Indicadores operacionais e financeiros do hotel.',
        tour: 'Indicadores concentra números de ocupação, receitas e comparativos. A diretoria usa esta tela para acompanhar o mês sem entrar no detalhe do CRD.',
        roles: ['admin', 'controle', 'manager', 'diretoria'],
      },
      {
        id: 'investimentos',
        tab: 'investimentos',
        label: 'Investimentos',
        summary: 'Obras e investimentos fora da despesa operacional.',
        tour: 'Investimentos registra obras e aquisições. Esses valores entram no Resultado Líquido do DRE, separados da despesa operacional.',
        roles: ['admin', 'controle', 'manager', 'finance', 'diretoria'],
      },
    ],
  },
  {
    id: 'base-orcamento',
    title: 'Base de Orçamento',
    blurb: 'Planilhas-fonte do orçamento: Síntase, contas, setores e acompanhamento.',
    groupTour:
      'A Base de Orçamento replica as abas da planilha original. Síntase é o previsto por CRD; as outras abas apoiam contas novas, setores e folha.',
    items: [
      {
        id: 'sintase',
        tab: 'sintase',
        label: 'Síntase',
        summary: 'Orçamento mensal por CRD, com ocupação.',
        tour: 'Síntase é o orçamento oficial por CRD e mês. Os valores (com ocupação) alimentam o Previsto do Prev × Real e do DRE.',
        roles: ['admin', 'controle', 'manager'],
      },
      {
        id: 'planilha-14',
        tab: 'planilha-14',
        label: 'Consumo Interno',
        summary: 'Aba de apoio de consumo interno da planilha original.',
        tour: 'Esta aba é a réplica da planilha de Consumo Interno. O realizado atualizado vem da importação em Apuração de Resultados.',
        roles: CONTROLE,
      },
      {
        id: 'planilha-15',
        tab: 'planilha-15',
        label: 'Contas novas',
        summary: 'Contas ainda não mapeadas no orçamento.',
        tour: 'Contas novas lista CRDs que surgiram fora da Síntase. Use para não perder linhas novas na montagem do orçamento.',
        roles: CONTROLE,
      },
      {
        id: 'planilha-16',
        tab: 'planilha-16',
        label: 'Setores',
        summary: 'Aba de setores da planilha original.',
        tour: 'A aba Setores da planilha original. O cadastro vivo de setores está em Cadastros; esta tela é a referência da extração.',
        roles: CONTROLE,
      },
      {
        id: 'planilha-17',
        tab: 'planilha-17',
        label: 'Dados Folha e Extras',
        summary: 'Apoio de folha e extras da planilha.',
        tour: 'Dados Folha e Extras é a aba extraída da planilha. A apuração mensal da folha está em Apuração da Folha.',
        roles: CONTROLE,
      },
      {
        id: 'planilha-18',
        tab: 'planilha-18',
        label: 'Acomp. Orçamento',
        summary: 'Acompanhamento do orçamento na planilha original.',
        tour: 'Acomp. Orçamento é o espelho da aba de acompanhamento. O comparativo vivo está no Prev × Real e no DRE.',
        roles: CONTROLE,
      },
    ],
  },
  {
    id: 'resultados',
    title: 'Apuração de Resultados',
    blurb: 'Relatórios importados: CRD, requisições sintéticas e consumo interno.',
    groupTour:
      'Apuração de Resultados guarda o que foi importado: Relatório de CRD (SALDO LANÇ), requisição sintética e consumo interno, mês a mês.',
    items: [
      {
        id: 'planilha-2',
        tab: 'planilha-2',
        label: 'Prev x Real Mensal',
        summary: 'Planilha original de previsto × realizado mensal.',
        tour: 'Esta é a aba extraída da planilha Prev × Real 2026. O comparativo atualizado do sistema está em Prev × Real Diario.',
        roles: CONTROLE,
      },
      {
        id: 'planilha-3',
        tab: 'planilha-3',
        label: 'Ajustes',
        summary: 'Aba de ajustes orçamentários da planilha.',
        tour: 'Ajustes replica a aba de ajustes da planilha. Alterações pontuais no DRE também podem ser feitas célula a célula, com motivo.',
        roles: CONTROLE,
      },
      {
        id: 'planilha-4',
        tab: 'planilha-4',
        label: 'Orçamento 2026',
        summary: 'Aba de orçamento anual extraída.',
        tour: 'Orçamento 2026 é a extração da aba anual. O previsto operacional que o sistema usa está na Síntase.',
        roles: CONTROLE,
      },
      {
        id: 'rel-crd',
        tab: 'rel-crd',
        label: 'Relatorio de CRD',
        summary: 'Rel. CRD importado: lançamentos e saldo por conta.',
        tour: 'O Relatório de CRD mostra as contas importadas (SALDO LANÇ). Esse saldo preenche o Realizado do Prev × Real e das despesas do DRE.',
        roles: CONTROLE,
      },
      {
        id: 'rel-req',
        tab: 'rel-req',
        label: 'Requisição Sintética',
        summary: 'Requisições agregadas por setor e grupo de itens.',
        tour: 'Requisição Sintética é o relatório do Desbravador por grupo de itens. Classifique CMV, uso/consumo ou investimento após importar.',
        roles: CONTROLE,
      },
      {
        id: 'rel-consumo',
        tab: 'rel-consumo',
        label: 'Consumo interno',
        summary: 'Detalhe do consumo interno importado no mês.',
        tour: 'Consumo interno lista as linhas do relatório importado (cliente, produto, valor). O total vai para o realizado da conta de consumo.',
        roles: CONTROLE,
      },
    ],
  },
  {
    id: 'receita',
    title: 'Apuração de Receita',
    blurb: 'RDS do Desbravador: diárias, A&B, diversos e eventos.',
    groupTour:
      'Apuração de Receita é o RDS. O acumulado de hospedagem, A&B, estacionamento, SPA e eventos alimenta o Realizado das receitas no DRE.',
    items: [
      {
        id: 'planilha-12',
        tab: 'planilha-12',
        label: 'Relatório de RDS',
        summary: 'Planilha de apoio do RDS original.',
        tour: 'Relatório de RDS é a aba extraída da planilha. O snapshot mensal importado está em Relatório Diário de Situação.',
        roles: CONTROLE,
      },
      {
        id: 'planilha-13',
        tab: 'planilha-13',
        label: 'Apoio RDS',
        summary: 'Aba de apoio ao RDS na planilha original.',
        tour: 'Apoio RDS complementa a planilha original. Para o realizado do mês, use o RDS importado em Relatório Diário de Situação.',
        roles: CONTROLE,
      },
      {
        id: 'rel-rds',
        tab: 'rel-rds',
        label: 'Relatório Diário de Situação',
        summary: 'RDS importado: receitas do mês por seção.',
        tour: 'O RDS importado traz Hospedagem, A&B, Diversos e Eventos. Diária, café, restaurantes, estacionamento, SPA e aluguel de eventos sobem para o DRE.',
        roles: CONTROLE,
      },
    ],
  },
  {
    id: 'folha',
    title: 'Apuração da Folha',
    blurb: 'Folha mensal importada e apuração de encargos.',
    groupTour:
      'A folha entra pelo Extrato Mensal na Importação. Aqui você vê o mês, as rubricas e a apuração de encargos que vai para o realizado de RH.',
    items: [
      {
        id: 'folha-apuracao',
        tab: 'folha-apuracao',
        label: 'Apuração',
        summary: 'Cálculo de encargos, rubricas e resumo da competência.',
        tour: 'A Apuração da Folha calcula encargos sobre as rubricas importadas. Parâmetros de INSS, FGTS e PIS ficam aqui; o líquido alimenta o CRD de folha.',
        roles: CONTROLE,
      },
    ],
  },
  {
    id: 'admin',
    title: 'Administração',
    blurb: 'Acesso ao sistema e ajustes globais. Só o administrador vê este grupo.',
    groupTour: 'Administração é restrita: cadastro de usuários (perfil e setores) e configurações gerais, como locais de PDV.',
    items: [
      {
        id: 'usuarios',
        tab: 'usuarios',
        label: 'Usuários',
        summary: 'Criar e editar acessos, perfis e setores.',
        tour: 'Em Usuários o administrador cria acessos: nome, e-mail, senha, perfil (admin, controle, financeiro…) e setores permitidos.',
        roles: ['admin'],
      },
      {
        id: 'configuracoes',
        tab: 'configuracoes',
        label: 'Configurações',
        summary: 'Parâmetros do sistema, como locais de PDV.',
        tour: 'Configurações guarda parâmetros globais, por exemplo os locais de PDV usados nas comandas.',
        roles: ['admin'],
      },
    ],
  },
  {
    id: 'ajuda',
    title: 'Ajuda',
    blurb: 'Este tutorial: mapa do menu e visitas guiadas tela a tela.',
    groupTour: 'Você está na Ajuda. Use o mapa abaixo para ler cada aba e o botão verde para iniciar o tutorial guiado do menu.',
    items: [
      {
        id: 'tutorial',
        tab: 'tutorial',
        label: 'Tutorial guiado',
        summary: 'Mapa do sistema e tours passo a passo.',
        tour: 'Esta página lista todas as abas do menu. O botão Iniciar tutorial guiado percorre o menu lateral; cada seção tem o próprio tour.',
        roles: ALL,
      },
    ],
  },
];

export const filterGroupsForRole = (role: string | undefined): TutorialGroup[] => {
  const r = (role || '') as TutorialRole;
  return TUTORIAL_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => item.roles.includes(r)),
  })).filter((group) => group.items.length > 0);
};

export const findTutorialItem = (id: string): TutorialItem | undefined => {
  for (const group of TUTORIAL_GROUPS) {
    const found = group.items.find((item) => item.id === id);
    if (found) return found;
  }
  return undefined;
};
