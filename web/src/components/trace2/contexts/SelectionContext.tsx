/**
 * SelectionContext - Manages UI navigation and interaction state.
 *
 * Purpose:
 * - Tracks selected node ID (synced to URL query param)
 * - Manages collapsed/expanded state for tree nodes
 * - Handles search query with debounced input
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
  const [collapsedNodesArray, setCollapsedNodesArray] = useState<string[]>([]);
  const [searchInputValue, setSearchInputValue] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

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
    ],
  );

  return (
    <SelectionContext.Provider value={value}>
      {children}
    </SelectionContext.Provider>
  );
}
