import { createContext, useContext, useState, useEffect } from "react";

interface TabsState {
  tabs: string[];
  activeTab: number;
  onTabChange?: (i: number) => void;
}

interface TabsContextValue {
  tabsState: TabsState;
  setTabsState: (s: TabsState) => void;
}

const EMPTY: TabsState = { tabs: [], activeTab: 0 };

const TabsContext = createContext<TabsContextValue>({
  tabsState: EMPTY,
  setTabsState: () => {},
});

export function TabsProvider({ children }: { children: React.ReactNode }) {
  const [tabsState, setTabsState] = useState<TabsState>(EMPTY);
  return (
    <TabsContext.Provider value={{ tabsState, setTabsState }}>
      {children}
    </TabsContext.Provider>
  );
}

export function useTabsState() {
  return useContext(TabsContext).tabsState;
}

// Hook for pages to register their tabs. Clears on unmount.
export function useRegisterTabs(
  tabs: string[],
  activeTab: number,
  onTabChange: ((i: number) => void) | undefined,
) {
  const { setTabsState } = useContext(TabsContext);
  useEffect(() => {
    setTabsState({ tabs, activeTab, onTabChange });
    return () => setTabsState(EMPTY);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs.join(","), activeTab]);
}
