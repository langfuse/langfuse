/**
 * SelectionContext - Manages UI navigation and interaction state.
 *
 * Purpose:
 * - Tracks selected node ID (synced to URL query param)
 * - Manages collapsed/expanded state for tree nodes
 * - Handles search query with debounced input
 * - Tracks selected tab (preview/log/scores) - synced to URL query param
 * - Tracks view preference (formatted/json) - synced to URL query param
 *
 * Not responsible for:
 * - Trace data or tree structure - see TraceDataContext
 * - Display preferences - see ViewPreferencesContext
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import { StringParam, useQueryParam } from "use-query-params";
import { useDebounce } from "@/src/hooks/useDebounce";

// Valid tab values for detail view
export type DetailTab = "preview" | "log" | "scores";
const VALID_TABS: DetailTab[] = ["preview", "log", "scores"];
const DEFAULT_TAB: DetailTab = "preview";

// Valid view preference values
export type ViewPref = "formatted" | "json";
const VALID_PREFS: ViewPref[] = ["formatted", "json"];
const DEFAULT_PREF: ViewPref = "formatted";

interface SelectionContextValue {
  selectedNodeId: string | null;
  setSelectedNodeId: (id: string | null) => void;
  collapsedNodes: Set<string>;
  toggleCollapsed: (id: string) => void;
  expandAll: () => void;
  collapseAll: (nodeIds: string[]) => void;
  searchQuery: string;
  searchInputValue: string;
  setSearchInputValue: (value: string) => void;
  setSearchQueryImmediate: (value: string) => void;
  // Tab and view preference (URL-synced)
  selectedTab: DetailTab;
  setSelectedTab: (tab: DetailTab) => void;
  viewPref: ViewPref;
  setViewPref: (pref: ViewPref) => void;
}

const SelectionContext = createContext<SelectionContextValue | null>(null);

export function useSelection(): SelectionContextValue {
  const context = useContext(SelectionContext);
  if (!context) {
    throw new Error("useSelection must be used within a SelectionProvider");
  }
  return context;
}

interface SelectionProviderProps {
  children: ReactNode;
}

export function SelectionProvider({ children }: SelectionProviderProps) {
  const [currentObservationId, setCurrentObservationId] = useQueryParam(
    "observation",
    StringParam,
  );
  const [tabParam, setTabParam] = useQueryParam("tab", StringParam);
  const [prefParam, setPrefParam] = useQueryParam("pref", StringParam);

  const [collapsedNodesArray, setCollapsedNodesArray] = useState<string[]>([]);
  const [searchInputValue, setSearchInputValue] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // Validate and provide defaults for tab and pref
  const selectedTab: DetailTab = VALID_TABS.includes(tabParam as DetailTab)
    ? (tabParam as DetailTab)
    : DEFAULT_TAB;

  const viewPref: ViewPref = VALID_PREFS.includes(prefParam as ViewPref)
    ? (prefParam as ViewPref)
    : DEFAULT_PREF;

  const setSelectedTab = useCallback(
    (tab: DetailTab) => {
      setTabParam(tab === DEFAULT_TAB ? null : tab);
    },
    [setTabParam],
  );

  const setViewPref = useCallback(
    (pref: ViewPref) => {
      setPrefParam(pref === DEFAULT_PREF ? null : pref);
    },
    [setPrefParam],
  );

  // Debounce search query updates by 500ms for smooth typing
  const debouncedSetSearchQuery = useDebounce(setSearchQuery, 500, false);

  const handleSearchInputChange = useCallback(
    (value: string) => {
      setSearchInputValue(value);
      debouncedSetSearchQuery(value);
    },
    [debouncedSetSearchQuery],
  );

  const setSearchQueryImmediate = useCallback((value: string) => {
    setSearchInputValue(value);
    setSearchQuery(value);
  }, []);

  const collapsedNodes = useMemo(
    () => new Set(collapsedNodesArray),
    [collapsedNodesArray],
  );

  const toggleCollapsed = useCallback((id: string) => {
    setCollapsedNodesArray((prev) =>
      prev.includes(id)
        ? prev.filter((nodeId) => nodeId !== id)
        : [...prev, id],
    );
  }, []);

  const expandAll = useCallback(() => {
    setCollapsedNodesArray([]);
  }, []);

  const collapseAll = useCallback((nodeIds: string[]) => {
    setCollapsedNodesArray(nodeIds);
  }, []);

  const setSelectedNodeId = useCallback(
    (id: string | null) => {
      setCurrentObservationId(id);
    },
    [setCurrentObservationId],
  );

  const value = useMemo<SelectionContextValue>(
    () => ({
      selectedNodeId: currentObservationId ?? null,
      setSelectedNodeId,
      collapsedNodes,
      toggleCollapsed,
      expandAll,
      collapseAll,
      searchQuery,
      searchInputValue,
      setSearchInputValue: handleSearchInputChange,
      setSearchQueryImmediate,
      selectedTab,
      setSelectedTab,
      viewPref,
      setViewPref,
    }),
    [
      currentObservationId,
      setSelectedNodeId,
      collapsedNodes,
      toggleCollapsed,
      expandAll,
      collapseAll,
      searchQuery,
      searchInputValue,
      handleSearchInputChange,
      setSearchQueryImmediate,
      selectedTab,
      setSelectedTab,
      viewPref,
      setViewPref,
    ],
  );

  return (
    <SelectionContext.Provider value={value}>
      {children}
    </SelectionContext.Provider>
  );
}
