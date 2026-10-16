import React, { createContext, useContext, useMemo } from 'react';
import '../guided-tour.css';
import {
  buildGroupSteps,
  buildItemSteps,
  buildOverviewSteps,
  runGuidedTour,
  stopGuidedTour,
} from '../lib/guidedTour';
import {
  filterGroupsForRole,
  findTutorialItem,
  TUTORIAL_GROUPS,
  type TutorialGroup,
} from '../lib/tutorialCatalog';

type TutorialContextValue = {
  groups: TutorialGroup[];
  startOverview: () => void;
  startGroup: (groupId: string) => void;
  startItem: (itemId: string) => void;
  stop: () => void;
};

const TutorialContext = createContext<TutorialContextValue | null>(null);

type TutorialProviderProps = {
  userRole?: string;
  setActiveTab: (tab: string) => void;
  prepareSidebar: () => void;
  children: React.ReactNode;
};

export const TutorialProvider: React.FC<TutorialProviderProps> = ({
  userRole,
  setActiveTab,
  prepareSidebar,
  children,
}) => {
  const groups = useMemo(() => filterGroupsForRole(userRole), [userRole]);
  const helpers = useMemo(
    () => ({ setActiveTab, prepareSidebar }),
    [setActiveTab, prepareSidebar]
  );

  const value = useMemo<TutorialContextValue>(
    () => ({
      groups,
      startOverview: () => {
        void runGuidedTour(buildOverviewSteps(groups), helpers);
      },
      startGroup: (groupId: string) => {
        const group = groups.find((g) => g.id === groupId);
        if (!group) return;
        void runGuidedTour(buildGroupSteps(group), helpers);
      },
      startItem: (itemId: string) => {
        const item = findTutorialItem(itemId);
        const group = TUTORIAL_GROUPS.find((g) => g.items.some((i) => i.id === itemId));
        if (!item || !group) return;
        if (!item.roles.includes(userRole as never)) return;
        void runGuidedTour(buildItemSteps(item, group.title), helpers);
      },
      stop: stopGuidedTour,
    }),
    [groups, helpers, userRole]
  );

  return <TutorialContext.Provider value={value}>{children}</TutorialContext.Provider>;
};

export const useTutorial = () => {
  const ctx = useContext(TutorialContext);
  if (!ctx) {
    throw new Error('useTutorial deve ser usado dentro de TutorialProvider');
  }
  return ctx;
};
