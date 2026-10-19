/* eslint-disable @repo/component-file-structure */
/**
 * SelectionContext - Manages UI navigation and interaction state.
 *
 * Purpose:
 * - Tracks selected node ID (synced to URL query param)
 * - Owns panel visibility and the mobile tab alongside selection
 * - Manages collapsed/expanded state for tree nodes
 * - Handles search query with debounced input
 * - Tracks selected detail tab - synced to URL query param `traceTab`
 * - Tracks view preference (formatted/json) - synced to URL query param AND localStorage
 *
 * View Preference Behavior:
 * - Uses localStorage as global default (via ViewPreferencesContext)
 * - URL param overrides default when present (for shareable URLs)
 * - Changes update BOTH URL and localStorage for consistency
 *
 * Not responsible for:
 * - Trace data or tree structure - see TraceDataContext
 * - Display preferences (other than view pref) - see ViewPreferencesContext
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import { StringParam, useQueryParam } from "use-query-params";
import { useDebounce } from "@/src/hooks/useDebounce";
import { useViewPreferences } from "./ViewPreferencesContext";
import { type MobileTraceTab } from "../components/TraceLayoutMobile";
import {
  isPrettyLikeJsonView,
  type JsonViewPreference,
} from "@/src/components/ui/jsonViewPreference";

import { DETAIL_TABS, type DetailTab } from "../constants/detailTabs";
export type { DetailTab } from "../constants/detailTabs";
const DEFAULT_TAB: DetailTab = "preview";

// Valid view preference values
export type ViewPref = "formatted" | "json";
const VALID_PREFS: ViewPref[] = ["formatted", "json"];

interface SelectionContextValue {
  defaultObservationId: string | null;
  selectedNodeId: string | null;
  setSelectedNodeId: (id: string | null) => void;
  selectNode: (id: string | null) => void;
  openDetails: () => void;
  mobileTab: MobileTraceTab;
  setMobileTab: (tab: MobileTraceTab) => void;
  /** Null until the layout restores its saved sizes. */
  navigationPanelCollapsed: boolean | null;
  detailPanelCollapsed: boolean | null;
  setNavigationPanelCollapsed: (collapsed: boolean) => void;
  setDetailPanelCollapsed: (collapsed: boolean) => void;
  pendingPanelExpand: "navigation" | "detail" | null;
  setPendingPanelExpand: (panel: "navigation" | "detail" | null) => void;
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
  defaultObservationId: string | null;
  isMobile: boolean;
  expandDetailOnMount: boolean;
}

export function SelectionProvider({
  children,
  defaultObservationId,
  isMobile,
  expandDetailOnMount,
}: SelectionProviderProps) {
  const [currentObservationId, setCurrentObservationId] = useQueryParam(
    "observation",
    StringParam,
  );
  const previousObservationId = useRef(currentObservationId ?? null);
  const pendingObservationId = useRef<string | null | undefined>(undefined);
  const [tabParam, setTabParam] = useQueryParam("traceTab", StringParam);
  const [prefParam, setPrefParam] = useQueryParam("pref", StringParam);
  const [mobileTabParam, setMobileTabParam] = useQueryParam(
    "mobileTab",
    StringParam,
  );
  // Opening intent is captured before the implicit root is applied. Later
  // default-root changes choose content without changing the user's layout.
  const [initialMobileTab] = useState<"tree" | "info">(
    currentObservationId ? "info" : "tree",
  );
  const mobileTab =
    mobileTabParam === "tree" ||
    mobileTabParam === "timeline" ||
    mobileTabParam === "graph" ||
    mobileTabParam === "info"
      ? mobileTabParam
      : initialMobileTab;
  const [navigationPanelCollapsed, setNavigationPanelCollapsed] = useState<
    boolean | null
  >(null);
  const [detailPanelCollapsed, setDetailPanelCollapsed] = useState<
    boolean | null
  >(null);
  const [pendingPanelExpand, setPendingPanelExpand] = useState<
    "navigation" | "detail" | null
  >(
    !isMobile && (currentObservationId || expandDetailOnMount)
      ? "detail"
      : null,
  );
  const setMobileTab = useCallback(
    (tab: SelectionContextValue["mobileTab"]) => {
      // Write last when selecting on mobile: batching keeps selection + tab in
      // one pushed history entry. Never infer a tab switch from selection changes,
      // which would overwrite the tab restored by Back/Forward (LFE-11067).
      setMobileTabParam(tab, "pushIn");
    },
    [setMobileTabParam],
  );
  const openDetails = useCallback(() => {
    if (isMobile) {
      setMobileTab("info");
      return;
    }
    if (detailPanelCollapsed !== false) setPendingPanelExpand("detail");
  }, [isMobile, setMobileTab, detailPanelCollapsed]);
  const selectNode = useCallback(
    (id: string | null) => {
      pendingObservationId.current = id;
      setCurrentObservationId(id);
      openDetails();
    },
    [setCurrentObservationId, openDetails],
  );
  const setSelectedNodeId = useCallback(
    (id: string | null) => {
      // Synthetic graph nodes intentionally change selection without opening details.
      pendingObservationId.current = id;
      setCurrentObservationId(id);
    },
    [setCurrentObservationId],
  );

  // History navigation bypasses selectNode. Watch only the explicit URL
  // selection so loading an implicit root never changes panel visibility.
  useEffect(() => {
    const observationId = currentObservationId ?? null;
    const changed = previousObservationId.current !== observationId;
    previousObservationId.current = observationId;

    if (!changed) return;

    // Query writes are batched; unrelated renders can happen before they land.
    // Consume the action's echo only once the URL selection actually changes.
    const pendingId = pendingObservationId.current;
    pendingObservationId.current = undefined;
    if (pendingId === observationId || isMobile) return;
    if (observationId === null) return;

    openDetails();
  }, [currentObservationId, isMobile, openDetails]);

  // Get localStorage default for view preference
  const { jsonViewPreference, setJsonViewPreference } = useViewPreferences();

  const [collapsedNodesArray, setCollapsedNodesArray] = useState<string[]>([]);
  const [searchInputValue, setSearchInputValue] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // Validate and provide defaults for tab
  const selectedTab: DetailTab = DETAIL_TABS.includes(tabParam as DetailTab)
    ? (tabParam as DetailTab)
    : DEFAULT_TAB;

  // Map localStorage JsonViewPreference to ViewPref format
  const localStorageViewPref: ViewPref = isPrettyLikeJsonView(
    jsonViewPreference,
  )
    ? "formatted"
    : "json";

  // View preference: URL param overrides localStorage default
  const viewPref: ViewPref = VALID_PREFS.includes(prefParam as ViewPref)
    ? (prefParam as ViewPref)
    : localStorageViewPref;

  const setSelectedTab = useCallback(
    (tab: DetailTab) => {
      setTabParam(tab === DEFAULT_TAB ? null : tab);
    },
    [setTabParam],
  );

  const setViewPref = useCallback(
    (pref: ViewPref) => {
      // Map ViewPref back to JsonViewPreference format
      const jsonPref: JsonViewPreference = pref === "json" ? "json" : "pretty";

      // Update localStorage
      setJsonViewPreference(jsonPref);

      // Update URL param (clear if it matches the new localStorage default)
      const newLocalStorageViewPref: ViewPref =
        jsonPref === "json" ? "json" : "formatted";
      setPrefParam(pref === newLocalStorageViewPref ? null : pref);
    },
    [setJsonViewPreference, setPrefParam],
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

  const value = useMemo<SelectionContextValue>(
    () => ({
      defaultObservationId,
      selectedNodeId: currentObservationId ?? defaultObservationId,
      setSelectedNodeId,
      selectNode,
      openDetails,
      mobileTab,
      setMobileTab,
      navigationPanelCollapsed,
      detailPanelCollapsed,
      setNavigationPanelCollapsed,
      setDetailPanelCollapsed,
      pendingPanelExpand,
      setPendingPanelExpand,
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
      defaultObservationId,
      setSelectedNodeId,
      selectNode,
      openDetails,
      mobileTab,
      setMobileTab,
      navigationPanelCollapsed,
      detailPanelCollapsed,
      pendingPanelExpand,
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
