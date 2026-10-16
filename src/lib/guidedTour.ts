import { driver, type Driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import type { TutorialGroup, TutorialItem } from './tutorialCatalog';

export type TourStep = {
  element?: string;
  tab?: string;
  title: string;
  description: string;
  side?: 'left' | 'right' | 'top' | 'bottom';
};

export type TourHelpers = {
  setActiveTab: (tab: string) => void;
  prepareSidebar: () => void;
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const waitFor = async (selector: string | undefined, timeout = 2200) => {
  if (!selector) return null;
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const el = document.querySelector(selector);
    if (el) return el;
    await wait(40);
  }
  return document.querySelector(selector);
};

let active: Driver | null = null;
let stopped = false;

export const stopGuidedTour = () => {
  stopped = true;
  active?.destroy();
  active = null;
};

export const runGuidedTour = async (steps: TourStep[], helpers: TourHelpers) => {
  stopGuidedTour();
  stopped = false;
  helpers.prepareSidebar();
  await wait(280);

  const show = async (index: number): Promise<void> => {
    if (stopped || index < 0 || index >= steps.length) {
      active?.destroy();
      active = null;
      return;
    }

    const step = steps[index];
    if (step.tab) {
      helpers.setActiveTab(step.tab);
      await wait(320);
    }
    const el = await waitFor(step.element);
    if (stopped) return;

    active?.destroy();
    const isLast = index === steps.length - 1;
    active = driver({
      overlayColor: 'rgba(0, 61, 51, 0.62)',
      stagePadding: 10,
      stageRadius: 14,
      popoverClass: 'vivaz-tour-popover',
      popoverOffset: 14,
      allowClose: true,
      animate: true,
      nextBtnText: isLast ? 'Concluir' : 'Próximo',
      prevBtnText: 'Voltar',
      doneBtnText: isLast ? 'Concluir' : 'Próximo',
      progressText: `${index + 1} de ${steps.length}`,
      showProgress: true,
      onNextClick: () => {
        void show(index + 1);
      },
      onPrevClick: () => {
        void show(index - 1);
      },
      onCloseClick: () => {
        stopGuidedTour();
      },
      steps: [
        {
          element: el ? (step.element as string) : undefined,
          popover: {
            title: step.title,
            description: step.description,
            side: step.side ?? 'right',
            align: 'start',
          },
        },
      ],
    });
    active.drive();
  };

  await show(0);
};

export const buildOverviewSteps = (groups: TutorialGroup[]): TourStep[] => {
  const steps: TourStep[] = [
    {
      tab: 'tutorial',
      element: '[data-tour="header-search"]',
      side: 'bottom',
      title: 'Busca',
      description:
        'A busca do topo filtra o que está na tela atual — notas, CRDs, linhas do DRE, histórico de importação e assim por diante.',
    },
    {
      element: '[data-tour="sidebar-nav"]',
      side: 'right',
      title: 'Menu lateral',
      description:
        'Tudo no Budget Vivaz parte daqui. Os grupos abrem listas (Lançamentos, Setores, Apurações). O tour agora percorre cada bloco visível para o seu perfil.',
    },
  ];

  for (const group of groups) {
    if (group.id === 'ajuda') continue;
    const groupEl =
      group.id === 'gestao'
        ? `[data-tour="nav-${group.items[0]?.id}"]`
        : `[data-tour="group-${group.id}"]`;
    steps.push({
      element: groupEl,
      side: 'right',
      title: group.title,
      description: group.groupTour,
    });
  }

  steps.push({
    tab: 'tutorial',
    element: '[data-tour="nav-tutorial"]',
    side: 'right',
    title: 'Tutorial guiado',
    description:
      'Volte a esta página quando quiser. Cada seção tem o próprio tour, e cada aba explica o que você faz nela.',
  });
  steps.push({
    tab: 'tutorial',
    element: '[data-tour="tutorial-map"]',
    side: 'top',
    title: 'Mapa do sistema',
    description:
      'Abaixo está o mapa organizado como o menu. Use Iniciar nesta seção para um tour só daquele grupo, ou o botão da aba para ir até a tela.',
  });

  return steps;
};

export const buildGroupSteps = (group: TutorialGroup): TourStep[] => {
  const steps: TourStep[] = [
    {
      tab: 'tutorial',
      element: `[data-tour="group-card-${group.id}"]`,
      side: 'top',
      title: group.title,
      description: group.groupTour,
    },
    {
      element:
        group.id === 'gestao'
          ? `[data-tour="nav-${group.items[0]?.id}"]`
          : group.id === 'ajuda'
            ? '[data-tour="nav-tutorial"]'
            : `[data-tour="group-${group.id}"]`,
      side: 'right',
      title: `Menu · ${group.title}`,
      description: `No menu lateral, ${group.title} fica neste bloco. Vamos abrir cada aba da seção.`,
    },
  ];

  for (const item of group.items) {
    steps.push({
      tab: item.tab,
      element: `[data-tour="nav-${item.id}"]`,
      side: 'right',
      title: item.label,
      description: item.tour,
    });
    steps.push({
      tab: item.tab,
      element: '[data-tour="page-content"]',
      side: 'top',
      title: `Tela · ${item.label}`,
      description: item.tour,
    });
  }

  return steps;
};

export const buildItemSteps = (item: TutorialItem, groupTitle: string): TourStep[] => [
  {
    tab: item.tab,
    element: `[data-tour="nav-${item.id}"]`,
    side: 'right',
    title: `${groupTitle} · ${item.label}`,
    description: item.tour,
  },
  {
    tab: item.tab,
    element: '[data-tour="page-content"]',
    side: 'top',
    title: `Tela · ${item.label}`,
    description: item.tour,
  },
];
