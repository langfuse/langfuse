/**
 * CollapsiblePanelContext - Manages collapse/expand state for panels
 *
 * Purpose:
 * - Track which panels are collapsed
 * - Provide collapse/expand actions
 * - Store last non-collapsed sizes for restoration
 *
 * Not responsible for:
 * - Panel size persistence (handled by autoSaveId)
 * - Min/max constraints (handled by useDynamicPanelConstraints)
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";

interface PanelSizeMemory {
  [panelId: string]: number;
}

interface CollapsiblePanelContextValue {
  collapsedPanels: Set<string>;
  isCollapsed: (panelId: string) => boolean;
  toggleCollapse: (panelId: string) => void;
  collapse: (panelId: string) => void;
  expand: (panelId: string) => void;

  // Size memory for "remember last width" feature
  lastSize: (panelId: string) => number | undefined;
  updateLastSize: (panelId: string, size: number) => void;
}

const CollapsiblePanelContext =
  createContext<CollapsiblePanelContextValue | null>(null);

export function useCollapsiblePanel(): CollapsiblePanelContextValue {
  const context = useContext(CollapsiblePanelContext);
  if (!context) {
    throw new Error(
      "useCollapsiblePanel must be used within CollapsiblePanelProvider",
    );
  }
  return context;
}

interface CollapsiblePanelProviderProps {
  children: ReactNode;
  // Optional: persist collapsed state to localStorage
  storageKey?: string;
}

export function CollapsiblePanelProvider({
  children,
}: CollapsiblePanelProviderProps) {
  const [collapsedPanelsArray, setCollapsedPanelsArray] = useState<string[]>(
    [],
  );
  const [sizeMemory, setSizeMemory] = useState<PanelSizeMemory>({});

  const collapsedPanels = useMemo(
    () => new Set(collapsedPanelsArray),
    [collapsedPanelsArray],
  );

  const isCollapsed = useCallback(
    (panelId: string) => collapsedPanels.has(panelId),
    [collapsedPanels],
  );

  const toggleCollapse = useCallback((panelId: string) => {
    setCollapsedPanelsArray((prev) =>
      prev.includes(panelId)
        ? prev.filter((id) => id !== panelId)
        : [...prev, panelId],
    );
  }, []);

  const collapse = useCallback((panelId: string) => {
    setCollapsedPanelsArray((prev) =>
      prev.includes(panelId) ? prev : [...prev, panelId],
    );
  }, []);

  const expand = useCallback((panelId: string) => {
    setCollapsedPanelsArray((prev) => prev.filter((id) => id !== panelId));
  }, []);

  const lastSize = useCallback(
    (panelId: string) => sizeMemory[panelId],
    [sizeMemory],
  );

  const updateLastSize = useCallback((panelId: string, size: number) => {
    setSizeMemory((prev) => ({ ...prev, [panelId]: size }));
  }, []);

  const value = useMemo<CollapsiblePanelContextValue>(
    () => ({
      collapsedPanels,
      isCollapsed,
      toggleCollapse,
      collapse,
      expand,
      lastSize,
      updateLastSize,
    }),
    [
      collapsedPanels,
      isCollapsed,
      toggleCollapse,
      collapse,
      expand,
      lastSize,
      updateLastSize,
    ],
  );

  return (
    <CollapsiblePanelContext.Provider value={value}>
      {children}
    </CollapsiblePanelContext.Provider>
  );
}
