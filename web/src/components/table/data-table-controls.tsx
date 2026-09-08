/* eslint-disable @repo/no-style-props, @repo/no-margin-on-root-elements */
import {
  type default as React,
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import { ScrollArea } from "@/src/components/ui/scroll-area";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import {
  facetNameRank,
  getFacetSummary,
  getFacetSummaryValue,
  rankFacetOptions,
  rankFacetsByName,
} from "@/src/features/filters/lib/facet-display";
import {
  advanceFacetOrder,
  orderFacets,
  promoteFacet,
  settleOnNextChange,
  EMPTY_FACET_ORDER,
} from "@/src/features/filters/lib/facet-order";
import { useMediaQuery } from "react-responsive";
import useLocalStorage from "@/src/components/useLocalStorage";
import { cn } from "@/src/utils/tailwind";
import { compactNumberFormatter } from "@/src/utils/numbers";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import {
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  FoldVertical,
  MoreVertical,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  UnfoldVertical,
  X,
  X as IconX,
  Search,
  WandSparkles,
  InfoIcon,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import {
  InputCommand,
  InputCommandGroup,
  InputCommandInput,
  InputCommandItem,
  InputCommandList,
} from "@/src/components/ui/input-command";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { Badge } from "@/src/components/ui/badge";
import { Checkbox } from "@/src/components/design-system/Checkbox/Checkbox";
import { Button } from "@/src/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { Slider } from "@/src/components/ui/slider";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Skeleton } from "@/src/components/ui/skeleton";
import DocPopup from "@/src/components/layouts/doc-popup";
import type {
  UIFilter,
  KeyScoreLevels,
  KeyValueFilterEntry,
  NumericKeyValueFilterEntry,
  BooleanKeyValueFilterEntry,
  StringKeyValueFilterEntry,
  TextFilterEntry,
} from "@/src/features/filters/hooks/useSidebarFilterState";
import { KeyValueFilterBuilder } from "@/src/components/table/key-value-filter-builder";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { DataTableAIFilters } from "@/src/components/table/data-table-ai-filters";
import { useLangfuseCloudRegion } from "@/src/features/organizations/hooks";
import { type FilterState } from "@langfuse/shared";

interface ControlsContextType {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  tableName?: string;
  /** Below `md` the panel renders inside a bottom Sheet (not the desktop rail),
   *  so its header shows a plain close instead of the collapse-to-rail chrome. */
  isMobile: boolean;
}

export const ControlsContext = createContext<ControlsContextType | null>(null);

export function DataTableControlsProvider({
  children,
  tableName,
  defaultSidebarCollapsed,
}: {
  children: React.ReactNode;
  tableName?: string;
  defaultSidebarCollapsed?: boolean;
}) {
  const isDesktop = useMediaQuery({ query: "(min-width: 768px)" });
  const storageKey = tableName
    ? `data-table-controls-${tableName}`
    : "data-table-controls";
  // The desktop preference persists across tabs and sessions (localStorage,
  // aligned with the peek-panel persistence direction — LFE-10601). Mobile
  // uses per-mount local state instead, so the filter panel never covers the
  // table by default and a narrow tab neither inherits nor overwrites the
  // desktop preference.
  const [desktopOpen, setDesktopOpen] = useLocalStorage(
    storageKey,
    !defaultSidebarCollapsed,
  );
  const [mobileOpen, setMobileOpen] = useState(false);
  const open = isDesktop ? desktopOpen : mobileOpen;
  const setOpen = isDesktop ? setDesktopOpen : setMobileOpen;

  return (
    <ControlsContext.Provider
      value={{ open, setOpen, tableName, isMobile: !isDesktop }}
    >
      <div
        // access the data-expanded state with tailwind via `group-data-[expanded=true]/controls`
        className="group/controls contents"
        data-expanded={open}
      >
        {children}
      </div>
    </ControlsContext.Provider>
  );
}

export function useDataTableControls() {
  const context = useContext(ControlsContext);

  if (!context) {
    // Return default values when not in a provider (e.g., tables without the new sidebar)
    return {
      open: false,
      setOpen: () => {},
      tableName: undefined,
      isMobile: false,
    };
  }

  return context as ControlsContextType;
}

export interface QueryFilter {
  filters: UIFilter[];
  expanded: string[];
  onExpandedChange: (value: string[]) => void;
  clearAll: () => void;
  isFiltered: boolean;
  setFilterState: (filters: FilterState) => void;
  /** v3-vs-v4 analytics dimension of the surface (see useSidebarFilterState). */
  isV4?: boolean;
}

interface DataTableControlsProps {
  queryFilter: QueryFilter;
  filterWithAI?: boolean;
  /**
   * Given a filter column, the reason a filter on it is blocked on the current
   * surface (active or not) — e.g. the chart view can't filter on it (#15187 /
   * #15049), and later an OR/bracket a surface can't honour — or null. When it
   * returns a reason, that facet renders blocked (dimmed + the reason on hover)
   * whether or not it holds a value; Clearing still works. Undefined leaves
   * every filter live.
   */
  blockedColumnReason?: (column: string) => string | null;
  /**
   * "panel" (default): a self-contained, full-height column with its own
   *   internal ScrollArea — the desktop filter sidebar.
   * "inline": the facet list flows at NATURAL height with no internal scroll,
   *   so it can live inside a host's single outer scroll (the mobile Filters
   *   sheet). Follow-scroll still works — scrollIntoView bubbles to that host.
   */
  layout?: "panel" | "inline";
}

// Module-stable initial value: a fresh {} per render would re-subscribe
// useLocalStorage's cross-tab listener on every render.
const EMPTY_RECENCY: Record<string, number> = {};

export function DataTableControls({
  queryFilter,
  filterWithAI,
  blockedColumnReason,
  layout = "panel",
}: DataTableControlsProps) {
  const { setOpen, tableName, isMobile } = useDataTableControls();
  const { isLangfuseCloud } = useLangfuseCloudRegion();
  const capture = usePostHogClientCapture();
  const [aiPopoverOpen, setAiPopoverOpen] = useState(false);
  const activeFilterCount = queryFilter.filters.filter(
    (filter) => filter.isActive,
  ).length;
  const storagePrefix = tableName
    ? `data-table-controls-${tableName}`
    : "data-table-controls";

  // "Show only active" (the header … menu): the list collapses to the
  // promoted facets. Explicit "Add filter" picks are tracked per mount.
  const [showOnlyActive, setShowOnlyActive] = useLocalStorage(
    `${storagePrefix}-active-only`,
    false,
  );
  // Local (not lifted to the provider): the render sites key DataTableControls
  // by selectedViewId, so this transient "which facets are revealed" state
  // resets on a saved-view switch by remount — the desired behavior.
  const [revealedColumns, setRevealedColumns] = useState<string[]>([]);

  // Selected filters on top: a facet is PROMOTED when it carries an active
  // filter OR the user explicitly added it via "Add filter". The order is
  // SETTLED, not live (LFE-14843): the promoted set that drives it is
  // recomputed at deliberate boundaries — mount, permalink hydration, a saved
  // view, Clear all, an AI or search-bar apply — and held still while someone
  // works the sidebar, so a facet activated by direct click never teleports
  // out from under the cursor. Membership stays live: `showOnlyActive` and the
  // active counts read isPromoted, only the ORDER is frozen.
  const revealedSet = new Set(revealedColumns);
  const isPromoted = (filter: UIFilter) =>
    filter.isActive || revealedSet.has(filter.column);
  const livePromotedColumns = queryFilter.filters
    .filter(isPromoted)
    .map((filter) => filter.column);
  // Bumped by any interaction inside the facet list (below); the pure reducer
  // attributes the next promotion change to it instead of re-settling.
  const facetInteractionRef = useRef(0);
  const facetOrderRef = useRef(EMPTY_FACET_ORDER);
  const facetOrder = advanceFacetOrder(
    facetOrderRef.current,
    livePromotedColumns,
    facetInteractionRef.current,
  );
  facetOrderRef.current = facetOrder;
  // No event = a programmatic in-list action (Add filter), which is always a
  // deliberate interaction.
  const noteFacetInteraction = () => {
    facetInteractionRef.current += 1;
  };
  // Boundaries the sidebar owns itself (Clear all, AI apply): the change they
  // cause must settle, so drop any attribution still outstanding.
  const noteSettleBoundary = useCallback(() => {
    facetOrderRef.current = settleOnNextChange(
      facetOrderRef.current,
      facetInteractionRef.current,
    );
  }, []);

  const orderedFilters = orderFacets(queryFilter.filters, facetOrder);
  const displayedFilters = showOnlyActive
    ? orderedFilters.filter(isPromoted)
    : orderedFilters;

  // Facet-NAME search over a long catalog. Two surfaces search the same names:
  // this list, and the active-only "Add filter" picker below.
  const [facetSearch, setFacetSearch] = useState("");
  // Only worth its chrome on a long list — a dozen is where the per-facet value
  // search appears too, and a 3-facet sidebar (eval logs, monitors) needs none.
  // Active-only mode has no catalog left in the list to search; its picker
  // carries the search instead.
  const showFacetSearch = !showOnlyActive && queryFilter.filters.length > 12;
  // Read through the visibility gate: a query left behind by a hidden input
  // must never narrow the list behind the user's back.
  const facetSearchQuery = showFacetSearch ? facetSearch.trim() : "";

  // Matching facet columns, or null when not searching. The name search
  // FILTERS, it does not reorder: the settled promoted block and render order
  // still own every position. A facet whose name misses the query goes whether
  // or not it is filtering — what is in force stays on show above the list
  // (the header's active count, plus the search bar's tokens where there is
  // one), so the sidebar need not repeat it mid-search. The match set is also
  // what tells "nothing matched" apart from an unsearched list.
  const facetSearchMatches = facetSearchQuery
    ? new Set(
        displayedFilters
          .filter((filter) => facetNameRank(filter, facetSearchQuery) !== null)
          .map((filter) => filter.column),
      )
    : null;

  // Facet-usage recency: every facet the user has filtered on, on this table,
  // in this browser (localStorage; written by the activity effect below).
  // Feeds the "Add filter" dropdown's ordering.
  const [recentColumns, setRecentColumns] = useLocalStorage<
    Record<string, number>
  >(`${storagePrefix}-recent-facets`, EMPTY_RECENCY);
  // Search hides non-matching rows; it never unmounts them. Every facet holds
  // uncommitted local state — a typed-but-not-added text filter, a metadata
  // condition mid-build, a "show more" expansion, a debounced numeric draft —
  // and unmounting throws all of it away with nothing said. Hiding is
  // presentation only and must never touch the filter state.
  const visibleFilters = facetSearchMatches
    ? displayedFilters.filter((filter) => facetSearchMatches.has(filter.column))
    : displayedFilters;
  const visibleColumns = new Set(visibleFilters.map((filter) => filter.column));
  const expandedVisibleCount = queryFilter.expanded.filter((column) =>
    visibleColumns.has(column),
  ).length;

  const addableFilters = showOnlyActive
    ? orderedFilters
        .filter(
          (filter) =>
            !filter.isActive && !revealedColumns.includes(filter.column),
        )
        .sort(
          (a, b) =>
            (recentColumns[b.column] ?? 0) - (recentColumns[a.column] ?? 0),
        )
    : [];
  const [addFilterOpen, setAddFilterOpen] = useState(false);
  const [addFilterSearch, setAddFilterSearch] = useState("");
  // An empty query keeps the recency order (the point of the picker); a query
  // ranks by match quality, matching the list's search semantics.
  const rankedAddableFilters = addFilterSearch.trim()
    ? rankFacetsByName(addableFilters, addFilterSearch.trim())
    : addableFilters;

  // Adoption of the name search, per surface: one event per search session
  // (the first keystroke), never per keystroke, and never the query text.
  const searchedSurfacesRef = useRef(new Set<string>());
  const noteFacetSearch = (
    surface: "facet_list" | "add_filter_picker",
    query: string,
  ) => {
    if (query.trim() === "") {
      searchedSurfacesRef.current.delete(surface);
      return;
    }
    if (searchedSurfacesRef.current.has(surface)) return;
    searchedSurfacesRef.current.add(surface);
    capture("filters:facet_search", {
      tableName,
      surface,
      isV4: queryFilter.isV4 ?? false,
    });
  };
  // Closing ends the picker's search session — a controlled Popover closed
  // programmatically never reaches onOpenChange, so both paths route here.
  const closeAddFilterPicker = () => {
    setAddFilterOpen(false);
    setAddFilterSearch("");
    noteFacetSearch("add_filter_picker", "");
  };

  // Follow-scroll + recency: DOM scrolling is the external system here, so an
  // effect is the right integration boundary. A single facet's activity change
  // that DID move it (a re-settle, e.g. one filter applied from the search bar
  // — the user's own sidebar edits no longer reorder anything) has moved it by
  // the time this runs; scroll the list to its new position. Bulk changes
  // (Clear all, AI apply, a restored view) skip the scroll.
  const scrollRootRef = useRef<HTMLDivElement>(null);
  // Last focused element inside the list: a re-settle moves DOM nodes, and a
  // reinserted node loses focus even when React merely reorders it — typing
  // the first character into a facet's input must not kick the caret out.
  const lastFocusedRef = useRef<HTMLElement | null>(null);
  const activeColumnsKey = queryFilter.filters
    .filter((filter) => filter.isActive)
    .map((filter) => filter.column)
    .join(",");
  const prevActiveColumnsRef = useRef(activeColumnsKey);
  useEffect(() => {
    const prevKey = prevActiveColumnsRef.current;
    if (prevKey === activeColumnsKey) return;
    prevActiveColumnsRef.current = activeColumnsKey;
    const prev = new Set(prevKey.split(",").filter(Boolean));
    const current = new Set(activeColumnsKey.split(",").filter(Boolean));
    const became = [...current].filter((column) => !prev.has(column));
    const ceased = [...prev].filter((column) => !current.has(column));

    if (became.length > 0) {
      const now = Date.now();
      setRecentColumns((existing) => ({
        ...existing,
        ...Object.fromEntries(became.map((column) => [column, now])),
      }));
    }

    // Restore focus dropped by the reorder's DOM move (inputs keep their own
    // selection state across blur, so focus() alone restores the caret).
    const lastFocused = lastFocusedRef.current;
    if (
      lastFocused &&
      lastFocused.isConnected &&
      (document.activeElement === document.body ||
        document.activeElement === null)
    ) {
      lastFocused.focus({ preventScroll: true });
    }

    const changed = [...became, ...ceased];
    if (changed.length !== 1) return;
    // A name search may be hiding the target; display:none has no box, so this
    // simply does nothing rather than scrolling to an invisible row.
    const facetElement = scrollRootRef.current?.querySelector(
      `[data-facet-column="${CSS.escape(changed[0])}"]`,
    );
    facetElement?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
  }, [activeColumnsKey, setRecentColumns]);

  const handleAddFilter = (column: string) => {
    setRevealedColumns((current) =>
      current.includes(column) ? current : [...current, column],
    );
    if (!queryFilter.expanded.includes(column)) {
      queryFilter.onExpandedChange([...queryFilter.expanded, column]);
    }
    // Deliberate promotion: the added facet joins the top block without
    // re-settling the facets around it.
    noteFacetInteraction();
    facetOrderRef.current = promoteFacet(facetOrderRef.current, column);
    // The added facet lands at its config-order slot within the promoted
    // group — bring it into view once the re-render has painted.
    requestAnimationFrame(() => {
      scrollRootRef.current
        ?.querySelector(`[data-facet-column="${CSS.escape(column)}"]`)
        ?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
    });
    capture("filters:facet_added", {
      tableName,
      column,
      isV4: queryFilter.isV4 ?? false,
    });
  };

  // Sidebar open/collapse adoption — the headline question for the whole
  // surface. `trigger` = which affordance; metadata only.
  const emitSidebarToggled = (open: boolean, trigger: string) => {
    capture("filters:sidebar_toggled", {
      tableName,
      open,
      trigger,
      isV4: queryFilter.isV4 ?? false,
    });
  };

  const handleFiltersGenerated = useCallback(
    (filters: FilterState) => {
      // Apply filters
      noteSettleBoundary();
      queryFilter.setFilterState(filters);
      // The v3 wand previously emitted nothing at its only intent seam
      // (metadata only: count of generated conditions, never their values).
      capture("filters:ai_generate_applied", {
        surface: "sidebar_wand",
        tableName,
        generatedCount: filters.length,
        isV4: queryFilter.isV4 ?? false,
      });

      // Extract unique column names from filters
      const columnsToExpand = [...new Set(filters.map((f) => f.column))];

      // Get current expanded state and merge with new columns
      const currentExpanded = queryFilter.expanded;
      const newExpanded = Array.from(
        new Set([...currentExpanded, ...columnsToExpand]),
      );
      queryFilter.onExpandedChange(newExpanded);

      // Close popover
      setAiPopoverOpen(false);
    },
    [queryFilter, capture, tableName, noteSettleBoundary],
  );

  // Separator position: the SETTLED promoted block, not the live one — a facet
  // activated mid-session keeps its place below the line until the next settle.
  // Active-only mode has no inactive catalog to divide from, so no separator:
  // counting every displayed facet leaves no facet for the divider to sit
  // before, as the out-of-range index did before.
  const promotedFacetCount = showOnlyActive
    ? visibleFilters.length
    : visibleFilters.filter((filter) => facetOrder.promoted.has(filter.column))
        .length;
  // Anchored to the first VISIBLE catalog facet rather than to an index: rows
  // hidden by a search stay in the list, so an index would count them.
  const firstCatalogColumn = visibleFilters.find(
    (filter) => !facetOrder.promoted.has(filter.column),
  )?.column;
  const showPromotedSeparator =
    promotedFacetCount > 0 && firstCatalogColumn !== undefined;

  const renderFacet = (filter: UIFilter) => {
    // A column the current surface can't honour blocks the facet whether or
    // not it holds a value: the chart view can't filter on it (#15187 /
    // #15049), and later an OR/bracket a surface can't apply. (An empty facet
    // used to stay usable; blocking it regardless is the point of LFE-11040 —
    // adding a value it can't honour would only mislead.) Overrides
    // isDisabled/disabledReason so the facet dims and explains on hover while
    // Clear still works.
    const blockedReason = blockedColumnReason?.(filter.column) ?? null;
    const facetDisabled = filter.isDisabled || blockedReason !== null;
    const facetDisabledReason = blockedReason ?? filter.disabledReason;
    if (filter.type === "categorical") {
      const summaryValue = getFacetSummaryValue(filter);
      return (
        <CategoricalFacet
          key={filter.column}
          filterKey={filter.column}
          label={filter.label}
          tooltip={filter.tooltip}
          help={filter.help}
          summary={getFacetSummary(filter)}
          summaryIcon={
            summaryValue !== null
              ? filter.renderIcon?.(summaryValue)
              : undefined
          }
          isV4={queryFilter.isV4 ?? false}
          expanded={filter.expanded}
          options={filter.options}
          counts={filter.counts}
          displayByValue={filter.displayByValue}
          loading={filter.loading}
          value={filter.value}
          onChange={filter.onChange}
          onOnlyChange={filter.onOnlyChange}
          renderIcon={filter.renderIcon}
          renderOptionSuffix={filter.renderOptionSuffix}
          getOptionTitle={filter.getOptionTitle}
          isActive={filter.isActive}
          onReset={filter.onReset}
          operator={filter.operator}
          onOperatorChange={filter.onOperatorChange}
          textFilters={filter.textFilters}
          onTextFilterAdd={filter.onTextFilterAdd}
          onTextFilterRemove={filter.onTextFilterRemove}
          isDisabled={facetDisabled}
          disabledReason={facetDisabledReason}
        />
      );
    }

    if (filter.type === "numeric") {
      return (
        <NumericFacet
          key={filter.column}
          filterKey={filter.column}
          label={filter.label}
          tooltip={filter.tooltip}
          help={filter.help}
          summary={getFacetSummary(filter)}
          expanded={filter.expanded}
          loading={filter.loading}
          min={filter.min}
          max={filter.max}
          value={filter.value}
          onChange={filter.onChange}
          unit={filter.unit}
          isActive={filter.isActive}
          onReset={filter.onReset}
          isDisabled={facetDisabled}
          disabledReason={facetDisabledReason}
        />
      );
    }

    if (filter.type === "string") {
      return (
        <StringFacet
          key={filter.column}
          filterKey={filter.column}
          label={filter.label}
          tooltip={filter.tooltip}
          help={filter.help}
          summary={getFacetSummary(filter)}
          expanded={filter.expanded}
          loading={filter.loading}
          value={filter.value}
          onChange={filter.onChange}
          isActive={filter.isActive}
          onReset={filter.onReset}
          isDisabled={facetDisabled}
          disabledReason={facetDisabledReason}
        />
      );
    }

    if (filter.type === "keyValue") {
      return (
        <KeyValueFacet
          key={filter.column}
          filterKey={filter.column}
          label={filter.label}
          tooltip={filter.tooltip}
          help={filter.help}
          summary={getFacetSummary(filter)}
          expanded={filter.expanded}
          loading={filter.loading}
          keyOptions={filter.keyOptions}
          keyLevels={filter.keyLevels}
          availableValues={filter.availableValues}
          value={filter.value}
          onChange={filter.onChange}
          isActive={filter.isActive}
          onReset={filter.onReset}
          keyPlaceholder="Name"
          isDisabled={facetDisabled}
          disabledReason={facetDisabledReason}
        />
      );
    }

    if (filter.type === "numericKeyValue") {
      return (
        <NumericKeyValueFacet
          key={filter.column}
          filterKey={filter.column}
          label={filter.label}
          tooltip={filter.tooltip}
          help={filter.help}
          summary={getFacetSummary(filter)}
          expanded={filter.expanded}
          loading={filter.loading}
          keyOptions={filter.keyOptions}
          keyLevels={filter.keyLevels}
          value={filter.value}
          onChange={filter.onChange}
          isActive={filter.isActive}
          onReset={filter.onReset}
          keyPlaceholder="Name"
          isDisabled={facetDisabled}
          disabledReason={facetDisabledReason}
        />
      );
    }

    if (filter.type === "booleanKeyValue") {
      return (
        <BooleanKeyValueFacet
          key={filter.column}
          filterKey={filter.column}
          label={filter.label}
          tooltip={filter.tooltip}
          help={filter.help}
          summary={getFacetSummary(filter)}
          expanded={filter.expanded}
          loading={filter.loading}
          keyOptions={filter.keyOptions}
          keyLevels={filter.keyLevels}
          value={filter.value}
          onChange={filter.onChange}
          isActive={filter.isActive}
          onReset={filter.onReset}
          keyPlaceholder="Name"
          isDisabled={facetDisabled}
          disabledReason={facetDisabledReason}
        />
      );
    }

    if (filter.type === "stringKeyValue") {
      return (
        <StringKeyValueFacet
          key={filter.column}
          filterKey={filter.column}
          label={filter.label}
          tooltip={filter.tooltip}
          help={filter.help}
          summary={getFacetSummary(filter)}
          expanded={filter.expanded}
          loading={filter.loading}
          keyOptions={filter.keyOptions}
          keyDetails={filter.keyDetails}
          valueOptions={filter.valueOptions}
          value={filter.value}
          onChange={filter.onChange}
          isActive={filter.isActive}
          onReset={filter.onReset}
          isDisabled={facetDisabled}
          disabledReason={facetDisabledReason}
        />
      );
    }

    return null;
  };

  // The facet list itself. Rendered inside a Radix ScrollArea (panel) or a
  // plain natural-height div (inline) below — extracted so neither wrapper
  // duplicates it.
  const facetList = (
    <div
      className={cn(
        // panel: w-0 + min-w-full pins content to the Radix viewport width
        // (its inline `display: table; min-width: 100%` wrapper otherwise grows
        // to CONTENT width, breaking label truncation). inline has no such
        // viewport, so a plain w-full block is correct.
        layout === "inline" ? "w-full" : "w-0 min-w-full",
        // The search row above supplies the list's top air when it is there.
        showFacetSearch ? "pb-10" : "pt-0.5 pb-10",
      )}
      // Any interaction in the list marks the filter change it causes as the
      // user's own edit, so the order holds still (LFE-14843). Capture phase,
      // and on this node rather than the scroll root: React events propagate
      // through portals by the React tree, so a facet's portalled dropdown
      // (metadata keys, score names) counts too.
      onPointerDownCapture={noteFacetInteraction}
      onKeyDownCapture={noteFacetInteraction}
    >
      <div className="w-full">
        <AccordionPrimitive.Root
          type="multiple"
          value={queryFilter.expanded}
          onValueChange={(next) => {
            const prev = queryFilter.expanded;
            queryFilter.onExpandedChange(next);
            // One header click changes exactly one column. Expand-all, add
            // filter, and AI apply call onExpandedChange directly and skip
            // this handler, so they do not double-count as facet toggles.
            const added = next.filter((column) => !prev.includes(column));
            const removed = prev.filter((column) => !next.includes(column));
            if (added.length + removed.length !== 1) return;
            capture("filters:facet_toggled", {
              tableName,
              column: added[0] ?? removed[0],
              expanded: added.length === 1,
              layout,
              isV4: queryFilter.isV4 ?? false,
            });
          }}
        >
          {/* ONE keyed child array — not two .map() slices: React can
                      only match keys within the same array, so a facet crossing
                      the promoted/rest boundary would REMOUNT (wiping input
                      focus and draft state) instead of moving.

                      Every facet renders; a search only sets `hidden`
                      on the rows it excludes. The wrapper is always present for
                      the same reason the array is single: swapping the element
                      around a facet would remount it and lose its draft state. */}
          {displayedFilters.flatMap((filter) => {
            const nodes = [];
            if (showPromotedSeparator && filter.column === firstCatalogColumn) {
              nodes.push(
                // The one line that means something: the boundary
                // between the active/added block and the catalog.
                <div
                  key="promoted-separator"
                  className="border-border mx-2 my-2 border-t"
                  aria-hidden
                />,
              );
            }
            nodes.push(
              <div
                key={filter.column}
                hidden={!visibleColumns.has(filter.column)}
              >
                {renderFacet(filter)}
              </div>,
            );
            return nodes;
          })}
        </AccordionPrimitive.Root>
      </div>

      {/* Nothing matched — including any facet currently filtering, which the
          query hides like the rest. */}
      {facetSearchQuery !== "" && visibleFilters.length === 0 && (
        <p className="text-muted-foreground px-3 pt-6 text-center text-xs break-words">
          {`No filters match "${facetSearchQuery}"`}
        </p>
      )}

      {/* Active-only mode: surface the rest of the catalog behind an
          explicit "Add filter" picker, most-recently-used first, so
          the filters someone actually works with are one click away. */}
      {showOnlyActive && (
        <div
          className={cn(
            "px-3 pt-4",
            visibleFilters.length === 0 &&
              "flex flex-col items-center gap-1 pt-8 text-center",
          )}
        >
          {visibleFilters.length === 0 && (
            <p className="text-muted-foreground pb-2 text-xs">
              No active filters.
            </p>
          )}
          {/* Popover + command list, not a DropdownMenu: the catalog runs to
              ~30 facets and needs a search box, which a Radix menu cannot
              host (it claims keystrokes for its own typeahead). */}
          <Popover
            open={addFilterOpen}
            onOpenChange={(open) =>
              open ? setAddFilterOpen(true) : closeAddFilterPicker()
            }
          >
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                disabled={addableFilters.length === 0}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add filter
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-56 p-0">
              <InputCommand shouldFilter={false}>
                <InputCommandInput
                  placeholder="Search filters"
                  variant="bottom"
                  value={addFilterSearch}
                  onValueChange={(query) => {
                    setAddFilterSearch(query);
                    noteFacetSearch("add_filter_picker", query);
                  }}
                />
                <InputCommandList className="max-h-72">
                  {rankedAddableFilters.length === 0 ? (
                    <p className="text-muted-foreground px-2 py-6 text-center text-xs">
                      No filters match &quot;{addFilterSearch.trim()}&quot;
                    </p>
                  ) : (
                    <InputCommandGroup>
                      {rankedAddableFilters.map((filter) => {
                        // A column the surface can't honour stays visible but
                        // is not addable — adding it would only land a facet
                        // that immediately reads blocked (chart view —
                        // #15187 / #15049). Same reason on hover.
                        const reason =
                          blockedColumnReason?.(filter.column) ?? null;
                        return (
                          <InputCommandItem
                            key={filter.column}
                            value={filter.column}
                            disabled={!!reason}
                            title={reason ?? undefined}
                            onSelect={() => {
                              handleAddFilter(filter.column);
                              closeAddFilterPicker();
                            }}
                            className="cursor-pointer"
                          >
                            {filter.label}
                          </InputCommandItem>
                        );
                      })}
                    </InputCommandGroup>
                  )}
                </InputCommandList>
              </InputCommand>
            </PopoverContent>
          </Popover>
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Collapsed rail: shown when the sidebar is collapsed on desktop, where
          the resizable panel keeps a thin strip (see ResizableFilterLayout).
          Mirrors the trace peek's collapsed-panel rail. */}
      <div className="bg-background hidden h-full w-full flex-col items-center border-t group-data-[expanded=false]/controls:flex">
        {/* Mirror the expanded header's metrics (h-10 row, border-b, 24px
            button) so the toggle icon doesn't shift when collapsing. */}
        <div className="flex h-10 w-full shrink-0 items-center justify-center border-b">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setOpen(true);
                  emitSidebarToggled(true, "rail");
                }}
                aria-label="Show filters"
                className="h-6 w-6"
              >
                <PanelLeftOpen className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Show filters</TooltipContent>
          </Tooltip>
        </div>
        {activeFilterCount > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              {/* The badge doubles as an expand affordance: the rail hides
                  everything else about the filters, so the count is where
                  people click to see them. */}
              <button
                type="button"
                onClick={() => {
                  setOpen(true);
                  emitSidebarToggled(true, "rail_badge");
                }}
                aria-label={`Show ${activeFilterCount} active ${
                  activeFilterCount === 1 ? "filter" : "filters"
                }`}
                className="mt-2 cursor-pointer"
              >
                <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                  {activeFilterCount}
                </Badge>
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-64 text-xs">
              <p className="font-bold">
                {activeFilterCount} active{" "}
                {activeFilterCount === 1 ? "filter" : "filters"}
              </p>
              {queryFilter.filters
                .filter((filter) => filter.isActive)
                .slice(0, 6)
                .map((filter) => {
                  const line = `${filter.label}: ${
                    getFacetSummary(filter) ?? "filtered"
                  }`;
                  return (
                    <p key={filter.column} className="truncate" title={line}>
                      {line}
                    </p>
                  );
                })}
              {activeFilterCount > 6 && <p>+{activeFilterCount - 6} more</p>}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
      <div
        className={cn(
          "bg-background flex w-full flex-col border-t",
          // panel: a bounded, self-scrolling column. inline: natural height so
          // the host's outer scroll owns scrolling (no clip, no forced height).
          layout === "panel" && "h-full overflow-hidden",
          "group-data-[expanded=false]/controls:hidden",
        )}
      >
        <div className="bg-background flex h-10 shrink-0 items-center justify-between border-b px-3">
          <div className="flex items-center gap-1.5">
            {/* Three contexts for the header's close affordance:
                - inline (events MobileFiltersSheet): the sheet owns its own X +
                  "Filters" title, so render neither here — a second X would
                  duplicate it and tapping it just dismisses the whole sheet.
                - mobile panel (other tables' ResizableFilterLayout bottom
                  sheet): this panel IS the sheet, so its header X is the close.
                  No tooltip (the sheet auto-focuses it on open and a Radix
                  tooltip would pop up unprompted); an X is self-evident.
                - desktop: collapse-to-rail via the Hide-filters button. */}
            {layout === "inline" ? null : isMobile ? (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setOpen(false);
                  emitSidebarToggled(false, "header");
                }}
                aria-label="Close filters"
                className="-ml-1 h-6 w-6"
              >
                <X className="h-4 w-4" />
              </Button>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setOpen(false);
                      emitSidebarToggled(false, "header");
                    }}
                    aria-label="Hide filters"
                    className="-ml-1 h-6 w-6"
                  >
                    <PanelLeftClose className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Hide filters</TooltipContent>
              </Tooltip>
            )}
            {layout !== "inline" && (
              <span className="text-sm font-bold">Filters</span>
            )}
            {/* Inline: the count already shows on the sheet's Filters trigger
                and footer, so a bare number here (title hidden) is just noise. */}
            {layout !== "inline" && activeFilterCount > 0 && (
              <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                {activeFilterCount}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            {filterWithAI && isLangfuseCloud && (
              <Popover open={aiPopoverOpen} onOpenChange={setAiPopoverOpen}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <PopoverTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <WandSparkles className="h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                  </TooltipTrigger>
                  <TooltipContent>Filter with AI</TooltipContent>
                </Tooltip>
                <PopoverContent align="center" className="w-[400px]">
                  <DataTableAIFilters
                    onFiltersGenerated={handleFiltersGenerated}
                  />
                </PopoverContent>
              </Popover>
            )}
            {/* Expand/collapse all facets — same affordance and icons as
                the trace tree/timeline header. Label and action both read the
                facets ON SCREEN, so a search narrowing the list cannot leave
                the button offering to collapse something nobody can see.
                Facets hidden by a query keep whatever expansion they had. */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => {
                    const expanded = expandedVisibleCount === 0;
                    queryFilter.onExpandedChange(
                      expanded
                        ? [
                            ...new Set([
                              ...queryFilter.expanded,
                              ...visibleFilters.map((filter) => filter.column),
                            ]),
                          ]
                        : queryFilter.expanded.filter(
                            (column) => !visibleColumns.has(column),
                          ),
                    );
                    capture("filters:expand_all_toggled", {
                      tableName,
                      expanded,
                      facetCount: visibleFilters.length,
                      layout,
                      isV4: queryFilter.isV4 ?? false,
                    });
                  }}
                  aria-label={
                    expandedVisibleCount === 0
                      ? "Expand all filters"
                      : "Collapse all filters"
                  }
                >
                  {expandedVisibleCount === 0 ? (
                    <UnfoldVertical className="h-3.5 w-3.5" />
                  ) : (
                    <FoldVertical className="h-3.5 w-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {expandedVisibleCount === 0
                  ? "Expand all filters"
                  : "Collapse all filters"}
              </TooltipContent>
            </Tooltip>
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      aria-label="Filter options"
                    >
                      <MoreVertical className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>Filter options</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  // Enabled also when only value-less added facets exist —
                  // Clear all is the affordance that demotes them.
                  disabled={
                    !queryFilter.isFiltered && revealedColumns.length === 0
                  }
                  onClick={() => {
                    // Explicit adds are part of "everything" too: without
                    // this, a value-less added facet stays pinned after
                    // Clear all and the active-only empty state can never
                    // render again this mount.
                    noteSettleBoundary();
                    setRevealedColumns([]);
                    queryFilter.clearAll();
                  }}
                  className="cursor-pointer"
                >
                  Clear all filters
                </DropdownMenuItem>
                {/* Plain item with a TRAILING check instead of
                    DropdownMenuCheckboxItem: its reserved leading indicator
                    slot (pl-8) reads as broken indentation next to the
                    non-checkbox items, and a trailing check keeps the label
                    aligned in both states. */}
                <DropdownMenuItem
                  role="menuitemcheckbox"
                  aria-checked={showOnlyActive}
                  className="cursor-pointer"
                  onClick={() => {
                    const enabled = !showOnlyActive;
                    setShowOnlyActive(enabled);
                    // The mode swaps which surface owns the name search, so a
                    // query left in the other one would read as a stale filter.
                    setFacetSearch("");
                    noteFacetSearch("facet_list", "");
                    capture("filters:active_only_toggled", {
                      tableName,
                      enabled,
                      isV4: queryFilter.isV4 ?? false,
                    });
                  }}
                >
                  Show only active
                  {showOnlyActive && <Check className="ml-auto h-3.5 w-3.5" />}
                </DropdownMenuItem>
                {/* "Collapse sidebar" is desktop-rail chrome — there's no rail
                    on mobile (either sheet), where the header X / sheet footer
                    already close it. Covers both the other-tables mobile sheet
                    and the events inline sheet (inline is always mobile). */}
                {!isMobile && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => {
                        setOpen(false);
                        emitSidebarToggled(false, "menu");
                      }}
                      className="cursor-pointer"
                    >
                      Collapse sidebar
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        {/* Facet-name search. Above the scroll area, so it stays put while the
            list scrolls — and OUTSIDE the facet list, whose keydown capture
            would otherwise read typing here as working the list and freeze the
            facet order mid-search. */}
        {showFacetSearch && (
          // px-2 and h-6 are the facet row's own inset and height — the search
          // field lines up with the labels it filters. No bottom border: the
          // list below is already a stack of bordered rows.
          //
          // The space below the field lives HERE rather than in the list,
          // because anything inside the list scrolls away: a facet header
          // pinning to the top of the scroll area would otherwise sit tight
          // against the field. pb-0.5 + the header's own 6px = the 8px above
          // the field, at rest and scrolled alike.
          <div className="bg-background shrink-0 px-2 pt-2 pb-0.5">
            <div className="relative">
              <Search className="text-muted-foreground absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2" />
              <Input
                placeholder="Search filters"
                aria-label="Search filters"
                value={facetSearch}
                onChange={(event) => {
                  setFacetSearch(event.target.value);
                  noteFacetSearch("facet_list", event.target.value);
                }}
                onKeyDown={(event) => {
                  // Escape clears the query; only once it is empty does it
                  // reach the collapse-on-Escape chrome around it. Inside the
                  // mobile Filters sheet the sheet still closes on the same
                  // keystroke — Radix dismisses from a document capture-phase
                  // listener, which no handler inside the tree can get ahead
                  // of — so the clear button always works where this cannot.
                  if (event.key === "Escape" && facetSearch !== "") {
                    event.preventDefault();
                    event.stopPropagation();
                    setFacetSearch("");
                    noteFacetSearch("facet_list", "");
                  }
                }}
                className="h-6 pr-6 pl-7 text-xs"
              />
              {facetSearch !== "" && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setFacetSearch("");
                    noteFacetSearch("facet_list", "");
                  }}
                  aria-label="Clear filter search"
                  className="absolute top-1/2 right-0.5 h-5 w-5 -translate-y-1/2"
                >
                  <IconX className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>
        )}
        {layout === "inline" ? (
          // inline: no internal scroll — the facet list flows at natural
          // height inside the host's outer scroll (the mobile Filters sheet).
          // scrollRootRef stays attached so the follow-scroll scrollIntoView
          // still resolves; it bubbles to the host scroller. contain:paint is
          // kept for the same stale-fragment reason as the panel.
          <div
            className="[contain:paint]"
            ref={scrollRootRef}
            onFocusCapture={(event) => {
              lastFocusedRef.current = event.target as HTMLElement;
            }}
          >
            {facetList}
          </div>
        ) : (
          <ScrollArea
            // contain:paint — during handle drags the browser (notably
            // Firefox) can leave stale fragments of the sticky headers
            // painted outside the shrinking panel; paint containment pins
            // every layer inside the scroll root.
            className="min-h-0 flex-1 [contain:paint]"
            ref={scrollRootRef}
            onFocusCapture={(event) => {
              lastFocusedRef.current = event.target as HTMLElement;
            }}
          >
            {facetList}
          </ScrollArea>
        )}
      </div>
    </>
  );
}

interface BaseFacetProps {
  label: string;
  tooltip?: string;
  help?: {
    description: React.ReactNode;
    href?: string;
  };
  /** One-line "what is selected?" header summary; see getFacetSummary. */
  summary?: string | null;
  filterKey: string;
  expanded?: boolean;
  loading?: boolean;
  isActive?: boolean;
  isDisabled?: boolean;
  disabledReason?: string;
  onReset?: () => void;
}

interface CategoricalFacetProps extends BaseFacetProps {
  /** Color-coded icon of the single value the summary names (renderIcon). */
  summaryIcon?: React.ReactNode;
  /** v3-vs-v4 analytics dimension of the surface (Rule 4). */
  isV4?: boolean;
  options: string[];
  counts: Map<string, number>;
  displayByValue?: Map<string, string>;
  value: string[];
  onChange: (values: string[]) => void;
  onOnlyChange?: (value: string) => void;
  renderIcon?: (value: string) => React.ReactNode;
  renderOptionSuffix?: (value: string) => React.ReactNode;
  getOptionTitle?: (value: string, displayLabel: string) => string;
  operator?: "any of" | "all of" | "none of";
  onOperatorChange?: (operator: "any of" | "all of" | "none of") => void;
  textFilters?: TextFilterEntry[];
  onTextFilterAdd?: (
    operator: "contains" | "does not contain",
    value: string,
  ) => void;
  onTextFilterRemove?: (
    operator: "contains" | "does not contain",
    value: string,
  ) => void;
}

interface NumericFacetProps extends BaseFacetProps {
  min: number;
  max: number;
  value: [number, number];
  onChange: (value: [number, number]) => void;
  unit?: string;
}

interface StringFacetProps extends BaseFacetProps {
  value: string;
  onChange: (value: string) => void;
}

interface KeyValueFacetProps extends BaseFacetProps {
  keyOptions?: string[];
  keyLevels?: KeyScoreLevels;
  availableValues: Record<string, string[]>;
  value: KeyValueFilterEntry[];
  onChange: (filters: KeyValueFilterEntry[]) => void;
  keyPlaceholder?: string;
}

interface NumericKeyValueFacetProps extends BaseFacetProps {
  keyOptions?: string[];
  keyLevels?: KeyScoreLevels;
  value: NumericKeyValueFilterEntry[];
  onChange: (filters: NumericKeyValueFilterEntry[]) => void;
  keyPlaceholder?: string;
}

interface BooleanKeyValueFacetProps extends BaseFacetProps {
  keyOptions?: string[];
  keyLevels?: KeyScoreLevels;
  value: BooleanKeyValueFilterEntry[];
  onChange: (filters: BooleanKeyValueFilterEntry[]) => void;
  keyPlaceholder?: string;
}

interface StringKeyValueFacetProps extends BaseFacetProps {
  keyOptions?: string[];
  keyDetails?: Record<string, string>;
  valueOptions?: Record<string, string[]>;
  value: StringKeyValueFilterEntry[];
  onChange: (filters: StringKeyValueFilterEntry[]) => void;
  keyPlaceholder?: string;
}

// Non-animated accordion components for filters
const FilterAccordionItemPrimitive = AccordionPrimitive.Item;

const FilterAccordionTrigger = ({
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger>) => (
  // top-0: the panel header row sits outside the scroll container
  // (ScrollArea wraps only the facet list), so triggers stick to its top.
  // The expand chevron leads the row (> closed, v open); the clear button
  // sits at the row's right edge and stays visible whenever a value is set.
  // pt-1.5/pb-0.5 rather than an even py: the 8px between two rows is split so
  // that 6px of it sits INSIDE this sticky box, which is what keeps a pinned
  // header the same distance from whatever is above it as it was at rest.
  <AccordionPrimitive.Header className="bg-background sticky top-0 z-[1] flex px-2 pt-1.5 pb-0.5">
    <AccordionPrimitive.Trigger
      className={cn(
        // min-w-0: without it the trigger's automatic min width equals the
        // nowrap chip's full text width, so long chips push the row past the
        // panel edge (clipped) instead of ellipsing.
        "group/facet relative flex min-w-0 flex-1 items-center gap-1.5 text-left font-bold hover:underline [&[data-state=open]>svg:first-child]:rotate-90",
        className,
      )}
      {...props}
    >
      <ChevronRight className="text-muted-foreground h-3.5 w-3.5 shrink-0 transition-transform" />
      {children}
    </AccordionPrimitive.Trigger>
  </AccordionPrimitive.Header>
);

const FilterAccordionContent = ({
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Content>) => (
  <AccordionPrimitive.Content className="overflow-hidden text-sm" {...props}>
    <div className={cn("pt-1 pb-2", className)}>{children}</div>
  </AccordionPrimitive.Content>
);

interface FilterAccordionItemProps {
  label: string;
  tooltip?: string;
  help?: {
    description: React.ReactNode;
    href?: string;
  };
  /** One-line "what is selected?" summary rendered in the header. */
  summary?: string | null;
  /** Color-coded icon of the single value the summary names. */
  summaryIcon?: React.ReactNode;
  filterKey: string;
  children: React.ReactNode;
  isActive?: boolean;
  isDisabled?: boolean;
  disabledReason?: string;
  onReset?: () => void;
}

function FilterAccordionItem({
  label,
  tooltip,
  help,
  summary,
  summaryIcon,
  filterKey,
  children,
  isActive,
  isDisabled,
  disabledReason,
  onReset,
}: FilterAccordionItemProps) {
  return (
    <FilterAccordionItemPrimitive
      value={filterKey}
      // No padding here: the row rhythm lives on the STICKY header instead, so
      // a header keeps the same gap above it pinned as it had at rest — padding
      // on this wrapper scrolls away with it and the gap would shift.
      data-facet-column={filterKey}
    >
      <FilterAccordionTrigger
        className={cn(
          "text-muted-foreground hover:text-foreground bg-muted hover:bg-accent min-h-6 rounded-md px-2 py-1 text-xs font-normal transition-colors hover:no-underline",
          isActive && "text-foreground font-bold",
          isDisabled &&
            "text-muted-foreground/60 hover:text-muted-foreground/60 cursor-not-allowed hover:bg-transparent",
        )}
      >
        {/* Two-line-max header: line 1 is the label, which NEVER wraps —
            it ellipses so the clear button keeps its place — and the chip
            drops to its own second line when it doesn't fit inline.
            flex-wrap breaks lines by content sizes, so the chip wraps
            before anything shrinks; only an item alone on its line
            shrink-truncates. The clear button and chevron sit outside the
            wrap container and never move. */}
        <div className="flex min-w-0 grow flex-wrap items-center gap-x-1.5 gap-y-0.5">
          {isDisabled && disabledReason ? (
            <Tooltip delayDuration={80}>
              <TooltipTrigger asChild>
                <span className="flex min-w-0 items-center gap-1">
                  <span className="min-w-0 truncate" title={label}>
                    {label}
                  </span>
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-80 text-xs">
                {disabledReason}
              </TooltipContent>
            </Tooltip>
          ) : help ? (
            <div className="flex min-w-0 items-center gap-1">
              <span className="min-w-0 truncate" title={label}>
                {label}
              </span>
              <DocPopup description={help.description} href={help.href} />
            </div>
          ) : tooltip ? (
            // The tooltip triggers on the ⓘ icon only — hovering the label
            // itself must not pop explanatory text.
            <span className="flex min-w-0 items-center gap-1">
              <span className="min-w-0 truncate" title={label}>
                {label}
              </span>
              <Tooltip delayDuration={80}>
                <TooltipTrigger asChild>
                  <InfoIcon className="text-muted-foreground h-3 w-3 shrink-0" />
                </TooltipTrigger>
                <TooltipContent className="max-w-80 text-xs">
                  {tooltip}
                </TooltipContent>
              </Tooltip>
            </span>
          ) : (
            <span className="flex min-w-0 items-center gap-1">
              <span className="min-w-0 truncate" title={label}>
                {label}
              </span>
            </span>
          )}
          {summary && (
            // Only useful while collapsed: the expanded facet shows the
            // selection itself, so the chip hides (data-state on the
            // trigger = the group/facet element).
            <span
              className={cn(
                // explicit h-4: the chip box must exactly equal the label line so the
                // header height cannot jitter between open (chip hidden) and
                // closed states.
                "h-4 max-w-full min-w-0 truncate text-[11px] leading-4",
                "group-data-[state=open]/facet:hidden",
                // bg-background pops the chip out of the tinted header band
                // in both themes. No border/vertical padding: the chip's box
                // must equal the label's line height so headers with and
                // without a value render at the same height.
                isActive
                  ? "bg-background text-foreground rounded px-1 font-bold"
                  : "text-muted-foreground/60 font-normal",
              )}
              title={summary}
            >
              {summaryIcon && (
                <span className="mr-1 inline-flex align-text-bottom">
                  {summaryIcon}
                </span>
              )}
              {summary}
            </span>
          )}
        </div>
        {isActive && onReset && (
          <Tooltip delayDuration={80}>
            <TooltipTrigger asChild>
              {/* div[role=button], not <Button>: the accordion trigger is
                  already a <button> and buttons cannot nest. Always visible
                  while the facet has a selection (no hover gating) — the clear
                  affordance used to reveal only on header hover, which hid the
                  one obvious way to drop a filter. shrink-0 keeps it in flow at
                  the row's right edge so the label/chip truncate before reaching
                  it; self-start pins it to the top line on two-line headers. */}
              <div
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  onReset();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.stopPropagation();
                    e.preventDefault();
                    onReset();
                  }
                }}
                className="text-muted-foreground hover:text-foreground flex shrink-0 cursor-pointer items-center gap-0.5 self-start rounded-sm px-1 py-0.5 text-[11px] leading-4 font-normal transition-colors hover:underline focus-visible:underline focus-visible:outline-none"
                aria-label={`Clear ${label} filter`}
              >
                <IconX className="h-3 w-3 shrink-0" />
                Clear
              </div>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">
              Clear {label.toLowerCase()} filter
            </TooltipContent>
          </Tooltip>
        )}
      </FilterAccordionTrigger>
      <FilterAccordionContent className="pb-2">
        <fieldset
          disabled={isDisabled}
          className={cn(
            "m-0 min-w-0 border-0 p-0",
            isDisabled && "pointer-events-none opacity-60",
          )}
        >
          {children}
        </fieldset>
      </FilterAccordionContent>
    </FilterAccordionItemPrimitive>
  );
}

export function CategoricalFacet({
  label,
  tooltip,
  help,
  summary,
  summaryIcon,
  isV4,
  filterKey,
  expanded: _expanded,
  loading,
  options,
  counts,
  displayByValue,
  value,
  onChange,
  onOnlyChange,
  renderIcon,
  renderOptionSuffix,
  getOptionTitle,
  isActive,
  isDisabled,
  disabledReason,
  onReset,
  operator,
  onOperatorChange,
  textFilters,
  onTextFilterAdd,
  onTextFilterRemove,
}: CategoricalFacetProps) {
  const capture = usePostHogClientCapture();
  const { tableName } = useContext(ControlsContext) ?? {};
  // Which input mode the facet is in (checkbox select vs contains/does-not-
  // contain text). Seeded from the applied filters so a deep link carrying
  // text filters opens in text mode instead of hiding them behind the tab.
  const hasTextFilters = (textFilters?.length ?? 0) > 0;
  const [filterMode, setFilterMode] = useState<"select" | "text">(() =>
    hasTextFilters ? "text" : "select",
  );
  // Adopt DURING render as well: on a hard reload the Pages Router delivers
  // `?filter=` a few renders after mount (LFE-10164 in the state hook), so
  // the mount seed alone would leave a text-filter deep link on the Select
  // tab. Only the 0→n transition switches — removing the last text filter
  // or picking a tab by hand is never overridden.
  const [prevHasTextFilters, setPrevHasTextFilters] = useState(hasTextFilters);
  if (hasTextFilters !== prevHasTextFilters) {
    setPrevHasTextFilters(hasTextFilters);
    if (hasTextFilters) setFilterMode("text");
  }

  // Switching modes is NON-destructive: the other mode's applied filters stay
  // until the user applies something in the new mode — the state hook already
  // enforces select/text mutual exclusivity at apply time (updateFilter drops
  // the column's text filters, addTextFilter drops its checkbox filters).
  // Clearing on the tab click itself deleted a shared link's filters one
  // exploratory click after opening it, with no undo. Captured here at the
  // user-intent seam (Tabs only fires on actual change); the render-time
  // text-mode adoption above deliberately bypasses this and emits nothing.
  const handleModeChange = (newMode: "select" | "text") => {
    setFilterMode(newMode);
    capture("filters:facet_mode_switched", {
      tableName,
      column: filterKey,
      mode: newMode,
      isV4: isV4 ?? false,
    });
  };

  return (
    <FilterAccordionItem
      label={label}
      tooltip={tooltip}
      help={help}
      summary={summary}
      summaryIcon={summaryIcon}
      filterKey={filterKey}
      isActive={isActive}
      isDisabled={isDisabled}
      disabledReason={disabledReason}
      onReset={onReset}
    >
      <div className="flex flex-col">
        {/* Tab switcher - only show when text filtering is supported */}
        {onTextFilterAdd && (
          <FilterModeTabs mode={filterMode} onModeChange={handleModeChange} />
        )}

        {/* SELECT MODE: checkboxes with optional counts */}
        {filterMode === "select" && (
          <CategoricalSelectContent
            filterKey={filterKey}
            loading={loading}
            options={options}
            counts={counts}
            displayByValue={displayByValue}
            value={value}
            onChange={onChange}
            onOnlyChange={onOnlyChange}
            renderIcon={renderIcon}
            renderOptionSuffix={renderOptionSuffix}
            getOptionTitle={getOptionTitle}
            operator={operator}
            onOperatorChange={onOperatorChange}
          />
        )}

        {/* TEXT MODE: Contains/Does Not Contain filters */}
        {filterMode === "text" && onTextFilterAdd && (
          <div className="px-2 py-1">
            <TextFilterSection
              allFilters={textFilters ?? []}
              onAdd={onTextFilterAdd}
              onRemove={onTextFilterRemove}
            />
          </div>
        )}
      </div>
    </FilterAccordionItem>
  );
}

// Values shown per facet before "Show more values" gates the rest.
const MAX_VISIBLE_OPTIONS = 12;
// Each "Show more values" click reveals this many additional values.
const SHOW_MORE_INCREMENT = 50;

// Select-mode body of a categorical facet. A separate stateful child so its
// transient list UI state (value search, "show more") lives inside the
// accordion content and unmounts — and therefore resets — when the facet is
// collapsed (Radix unmounts closed content), instead of a reset effect in
// the always-mounted facet wrapper.
function CategoricalSelectContent({
  filterKey,
  loading,
  options,
  counts,
  displayByValue,
  value,
  onChange,
  onOnlyChange,
  renderIcon,
  renderOptionSuffix,
  getOptionTitle,
  operator,
  onOperatorChange,
}: Pick<
  CategoricalFacetProps,
  | "filterKey"
  | "loading"
  | "options"
  | "counts"
  | "displayByValue"
  | "value"
  | "onChange"
  | "onOnlyChange"
  | "renderIcon"
  | "renderOptionSuffix"
  | "getOptionTitle"
  | "operator"
  | "onOperatorChange"
>) {
  // "Show more values" reveals the next PORTION (it does what it says — not
  // expand-everything: value lists can run to 1000+ user IDs); "Show fewer
  // values" collapses back to the cap. Resets by unmounting on collapse.
  const [visibleCount, setVisibleCount] = useState(MAX_VISIBLE_OPTIONS);
  const [searchQuery, setSearchQuery] = useState("");
  const { tableName = "data" } = useContext(ControlsContext) ?? {};
  const visibleOptionValues = Array.from(
    new Set([...options, ...value.filter((option) => option.length > 0)]),
  );
  const hasMoreOptions = visibleOptionValues.length > MAX_VISIBLE_OPTIONS;

  // Filter options by search query (raw value and display label), ranked the
  // way the search bar ranks its completions: prefix matches before
  // substring matches, instead of plain unordered substring filtering.
  const filteredOptions = searchQuery
    ? rankFacetOptions(visibleOptionValues, searchQuery, displayByValue)
    : visibleOptionValues;

  // Order the applied filter to the top of the list so it is immediately
  // visible — without scrolling or expanding "Show more" — even when its
  // value sits far down a long list (LFE-10494). The rows carrying the
  // applied filter are the CHECKED values for a positive selection, but the
  // UNCHECKED (excluded) values for a `none of` filter: under the
  // checked=kept display model the checked set is the complement of the
  // exclusions (LFE-10717), and pinning that complement would sink the
  // just-unchecked row below the cap.
  //
  // Two guards keep this honest:
  //   1. Only reorder long lists (more options than the cap) that carry a real,
  //      strict-subset selection. `value` mirrors the hook's
  //      `computeSelectedValues`, which reports EVERY option as "selected" when
  //      no filter is applied (and the kept complement for `none of`).
  //      Requiring a strict subset skips that all-selected default — otherwise
  //      the whole list would be treated as pinned — and leaves short lists
  //      untouched.
  //   2. The visible-count cap is applied to the COMBINED ordered list, so even
  //      a large pinned set (many selected values, or many exclusions) can
  //      never render the entire list; "Show more" still gates the overflow.
  const selectedSet = new Set(value);
  const pinnedSet =
    operator === "none of"
      ? new Set(
          visibleOptionValues.filter((option) => !selectedSet.has(option)),
        )
      : selectedSet;
  // While searching, rankFacetOptions owns the order (prefix matches first);
  // pinning checked rows above better matches would fight it.
  const pinApplied =
    !searchQuery &&
    hasMoreOptions &&
    value.length > 0 &&
    value.length < visibleOptionValues.length;
  const orderedOptions = pinApplied
    ? [
        ...filteredOptions.filter((option) => pinnedSet.has(option)),
        ...filteredOptions.filter((option) => !pinnedSet.has(option)),
      ]
    : filteredOptions;

  const visibleOptions = orderedOptions.slice(0, visibleCount);
  const canShowMore = orderedOptions.length > visibleCount;
  const canShowFewer = visibleCount > MAX_VISIBLE_OPTIONS;

  // Split the visible slice so a separator can mark where the pinned rows
  // end. When not pinning, everything renders in natural order (no divider).
  const visiblePinnedOptions = pinApplied
    ? visibleOptions.filter((option) => pinnedSet.has(option))
    : [];
  const visibleRemainingOptions = pinApplied
    ? visibleOptions.filter((option) => !pinnedSet.has(option))
    : visibleOptions;

  const renderOption = (option: string) => {
    const displayLabel = displayByValue?.get(option) ?? option;
    return (
      <FilterValueCheckbox
        key={option}
        id={`${filterKey}-${option}`}
        label={displayLabel}
        title={getOptionTitle?.(option, displayLabel)}
        icon={renderIcon?.(option)}
        suffix={renderOptionSuffix?.(option)}
        count={counts.get(option) || 0}
        checked={value.includes(option)}
        onCheckedChange={(checked) => {
          const newValues = checked
            ? [...value, option]
            : value.filter((v: string) => v !== option);
          onChange(newValues);
        }}
        onLabelClick={onOnlyChange ? () => onOnlyChange(option) : undefined}
        totalSelected={value.length}
      />
    );
  };

  return (
    <div className="px-2">
      {/* Any of / All of / None of operator toggle for arrayOptions filters

          This toggle appears for multi-valued array columns (arrayOptions)
          like tags. It switches between the supported array matching modes:
          - Any of: match items with ANY selected value (OR logic)
          - All of: match items with ALL selected values (AND logic)
          - None of: exclude items carrying any UNCHECKED value (the filter
            stores the exclusions; checkboxes show the kept complement,
            LFE-10717)

          Toggling between modes carries the stored value list over, so
          any-of "match a or b" becomes none-of "exclude a and b" — the
          checked set visually flips to its complement.

          None-of mode usually engages by itself: unchecking a value from
          the all-checked default persists `none of [value]`. The toggle
          remains for converting an existing selection or persisting an
          operator preference before any values are selected. Other
          filter types (stringOptions, boolean, numeric) don't get this
          toggle because these array-specific modes are not semantically
          meaningful there.

          Currently enabled for:
          - Traces: tags
          - Sessions: userIds, tags
          - Prompts: labels, tags
          - Monitors: tags
      */}
      {onOperatorChange && (
        <div className="mb-2 px-2">
          <Tabs
            value={operator ?? "any of"}
            onValueChange={(newOperator) =>
              onOperatorChange(newOperator as "any of" | "all of" | "none of")
            }
          >
            <Tabs.List layout="full" size="sm">
              <Tabs.Trigger value="any of" size="sm" label="Any of" />
              <Tabs.Trigger value="all of" size="sm" label="All of" />
              {/* Without a persisted selection, switching to "none of" is a
                  deliberate no-op in the state model (an empty exclusion
                  would persist a vacuous filter — LFE-10717), which used to
                  read as a broken button. Disable it and say why; it
                  enables as soon as any selection exists, and NONE mode
                  engages by itself when a value is unchecked. */}
              <Tooltip delayDuration={80}>
                <TooltipTrigger asChild>
                  <span className="w-full min-w-0">
                    <Tabs.Trigger
                      value="none of"
                      disabled={operator === undefined}
                      size="sm"
                      label="None of"
                    />
                  </span>
                </TooltipTrigger>
                {operator === undefined && (
                  <TooltipContent className="max-w-64 text-xs">
                    Nothing to exclude yet — uncheck a value to exclude it, or
                    select values first.
                  </TooltipContent>
                )}
              </Tooltip>
            </Tabs.List>
          </Tabs>
        </div>
      )}

      {/* Loading / Empty / Options */}
      {loading ? (
        <>
          {[1, 2].map((i) => (
            <div key={i} className="relative flex items-center px-2">
              <div className="group/checkbox flex items-center rounded-sm p-0.5">
                <Skeleton className="h-3.5 w-3.5 rounded-sm" />
              </div>
              <div className="group/label flex min-w-0 flex-1 items-center rounded-sm px-1 py-0.5">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="ml-auto h-3 w-8" />
              </div>
            </div>
          ))}
        </>
      ) : visibleOptionValues.length === 0 ? (
        // px-2 on top of the outer px-2 = the same 16px inset as the mode
        // tabs and inputs, so empty states don't stick to the panel edge.
        <div className="text-muted-foreground px-2 py-1 text-xs">
          {filterKey === "sessionId" ? (
            <span>
              Sessions group {tableName} together, which is useful for tracing
              multi-step workflows.{" "}
              <a
                href="https://langfuse.com/docs/observability/features/sessions"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground underline"
              >
                See docs
              </a>{" "}
              to learn how to add sessions to your {tableName}.
            </span>
          ) : filterKey === "name" ? (
            <span>No {tableName} names found in the given time range.</span>
          ) : filterKey === "tags" ? (
            <span>
              Tags let you filter {tableName} according to custom categories
              (e.g. feature flags).{" "}
              <a
                href="https://langfuse.com/docs/observability/features/tags"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground underline"
              >
                See docs
              </a>{" "}
              to learn how to add tags to your {tableName}.
            </span>
          ) : (
            "No options found"
          )}
        </div>
      ) : (
        <>
          {/* Search box for many options */}
          {hasMoreOptions && (
            <div className="mb-2 px-2">
              <div className="relative">
                <Search className="text-muted-foreground absolute top-1/2 left-2 h-3.5 w-3.5 -translate-y-1/2" />
                <Input
                  placeholder="Filter values"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 pl-7 text-xs"
                />
              </div>
            </div>
          )}

          {/* Checkbox list */}
          {filteredOptions.length === 0 ? (
            <div className="text-muted-foreground py-1 text-center text-sm">
              No matches found
            </div>
          ) : (
            <>
              {/* Applied-filter rows (selected, or excluded under
                        `none of`), pinned to the top (long lists only) */}
              {visiblePinnedOptions.map(renderOption)}

              {/* Separator between the pinned rows and the rest */}
              {visiblePinnedOptions.length > 0 &&
                visibleRemainingOptions.length > 0 && (
                  <div
                    className="border-border/60 mx-3 my-1 border-t"
                    aria-hidden
                  />
                )}

              {/* Remaining options, capped */}
              {visibleRemainingOptions.map(renderOption)}
              {(canShowMore || canShowFewer) && (
                <div className="flex flex-col px-2">
                  {canShowFewer && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setVisibleCount(MAX_VISIBLE_OPTIONS)}
                      className="mt-1 h-auto w-full justify-start py-1 pl-7 text-xs"
                    >
                      <ChevronUp className="mr-1 h-3 w-3" />
                      Show fewer values
                    </Button>
                  )}
                  {canShowMore && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setVisibleCount(
                          (current) => current + SHOW_MORE_INCREMENT,
                        )
                      }
                      className="mt-0.5 h-auto w-full justify-start py-1 pl-7 text-xs"
                    >
                      <ChevronDown className="mr-1 h-3 w-3" />
                      Show more values
                    </Button>
                  )}
                </div>
              )}
            </>
          )}
          {filterKey === "environment" &&
          visibleOptionValues.length === 1 &&
          visibleOptionValues[0]?.toLowerCase() === "default" ? (
            <div className="text-muted-foreground mt-2 px-2 text-xs">
              <a
                href="https://langfuse.com/docs/observability/features/environments"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-foreground underline"
              >
                See docs
              </a>{" "}
              on how to add environments to your {tableName}.
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function NumericFacet({
  label,
  tooltip,
  help,
  summary,
  filterKey,
  expanded: _expanded,
  loading,
  min,
  max,
  value,
  onChange,
  unit,
  isActive,
  isDisabled,
  disabledReason,
  onReset,
}: NumericFacetProps) {
  const [localValue, setLocalValue] = useState<[number, number]>(value);
  // Adopt external value changes (reset, URL navigation) during render — the
  // "adjust state when a prop changes" pattern — rather than via a mirror
  // effect. `lastValue` tracks the last adopted prop so pending local edits
  // (which lead the prop while the debounce runs) survive unrelated renders.
  const [lastValue, setLastValue] = useState<[number, number]>(value);
  if (lastValue[0] !== value[0] || lastValue[1] !== value[1]) {
    setLastValue(value);
    setLocalValue(value);
  }
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const updateWithDebounce = (newValue: [number, number]) => {
    setLocalValue(newValue);

    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set new timeout
    timeoutRef.current = setTimeout(() => {
      onChange(newValue);
    }, 120);
  };

  const handleSliderChange = (values: number[]) => {
    if (values.length === 2) {
      const newValue: [number, number] = [values[0], values[1]];
      updateWithDebounce(newValue);
    }
  };

  const handleMinInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    // If input is cleared, reset to default min
    if (inputValue === "") {
      const newValue: [number, number] = [min, localValue[1]];
      updateWithDebounce(newValue);
      return;
    }
    const newMin = parseFloat(inputValue);
    if (isNaN(newMin)) return;
    const newValue: [number, number] = [newMin, localValue[1]];
    updateWithDebounce(newValue);
  };

  const handleMaxInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    // If input is cleared, reset to default max
    if (inputValue === "") {
      const newValue: [number, number] = [localValue[0], max];
      updateWithDebounce(newValue);
      return;
    }
    const newMax = parseFloat(inputValue);
    if (isNaN(newMax)) return;
    const newValue: [number, number] = [localValue[0], newMax];
    updateWithDebounce(newValue);
  };

  return (
    <FilterAccordionItem
      label={label}
      tooltip={tooltip}
      help={help}
      summary={summary}
      filterKey={filterKey}
      isActive={isActive}
      isDisabled={isDisabled}
      disabledReason={disabledReason}
      onReset={onReset}
    >
      <div className="px-4 py-2">
        {loading ? (
          <div className="text-muted-foreground text-sm">Loading...</div>
        ) : (
          <div className="grid gap-4">
            <div className="flex items-center gap-4">
              <div className="grid w-full gap-1.5">
                <Label
                  htmlFor={`min-${filterKey}`}
                  className="text-muted-foreground text-xs"
                >
                  Min.
                </Label>
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    id={`min-${filterKey}`}
                    value={isActive ? localValue[0] : ""}
                    placeholder={String(min)}
                    min={min}
                    step="any"
                    onChange={handleMinInputChange}
                    className="h-8"
                  />
                  {unit && (
                    <span className="text-muted-foreground text-xs">
                      {unit}
                    </span>
                  )}
                </div>
              </div>
              <div className="grid w-full gap-1.5">
                <Label
                  htmlFor={`max-${filterKey}`}
                  className="text-muted-foreground text-xs"
                >
                  Max.
                </Label>
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    id={`max-${filterKey}`}
                    value={isActive ? localValue[1] : ""}
                    placeholder={String(max)}
                    min={min}
                    step="any"
                    onChange={handleMaxInputChange}
                    className="h-8"
                  />
                  {unit && (
                    <span className="text-muted-foreground text-xs">
                      {unit}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <Slider
              min={min}
              max={max}
              step={max - min <= 1000 ? 0.01 : 1}
              value={localValue}
              onValueChange={handleSliderChange}
            />
          </div>
        )}
      </div>
    </FilterAccordionItem>
  );
}

function StringFacet({
  label,
  tooltip,
  help,
  summary,
  filterKey,
  expanded: _expanded,
  loading,
  value,
  onChange,
  isActive,
  isDisabled,
  disabledReason,
  onReset,
}: StringFacetProps) {
  const [localValue, setLocalValue] = useState<string>(value);
  // Same render-time adoption as NumericFacet above (no mirror effect).
  const [lastValue, setLastValue] = useState<string>(value);
  if (lastValue !== value) {
    setLastValue(value);
    setLocalValue(value);
  }
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const updateWithDebounce = (newValue: string) => {
    setLocalValue(newValue);

    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set new timeout
    timeoutRef.current = setTimeout(() => {
      onChange(newValue);
    }, 500);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateWithDebounce(e.target.value);
  };

  return (
    <FilterAccordionItem
      label={label}
      tooltip={tooltip}
      help={help}
      summary={summary}
      filterKey={filterKey}
      isActive={isActive}
      isDisabled={isDisabled}
      disabledReason={disabledReason}
      onReset={onReset}
    >
      <div className="px-4">
        {loading ? (
          <div className="text-muted-foreground text-sm">Loading...</div>
        ) : (
          <Input
            type="text"
            id={`string-${filterKey}`}
            value={localValue}
            placeholder="Search"
            onChange={handleInputChange}
            className="h-8"
          />
        )}
      </div>
    </FilterAccordionItem>
  );
}

function KeyValueFacet({
  label,
  tooltip,
  help,
  summary,
  filterKey,
  expanded: _expanded,
  loading,
  keyOptions,
  keyLevels,
  availableValues,
  value,
  onChange,
  isActive,
  isDisabled,
  disabledReason,
  onReset,
  keyPlaceholder,
}: KeyValueFacetProps) {
  return (
    <FilterAccordionItem
      label={label}
      tooltip={tooltip}
      help={help}
      summary={summary}
      filterKey={filterKey}
      isActive={isActive}
      isDisabled={isDisabled}
      disabledReason={disabledReason}
      onReset={onReset}
    >
      {loading ? (
        <div className="text-muted-foreground px-4 py-2 text-sm">
          Loading...
        </div>
      ) : (
        <KeyValueFilterBuilder
          mode="categorical"
          keyOptions={keyOptions}
          keyLevels={keyLevels}
          availableValues={availableValues}
          activeFilters={value}
          onChange={onChange}
          keyPlaceholder={keyPlaceholder}
        />
      )}
    </FilterAccordionItem>
  );
}

function NumericKeyValueFacet({
  label,
  tooltip,
  help,
  summary,
  filterKey,
  expanded: _expanded,
  loading,
  keyOptions,
  keyLevels,
  value,
  onChange,
  isActive,
  isDisabled,
  disabledReason,
  onReset,
  keyPlaceholder,
}: NumericKeyValueFacetProps) {
  return (
    <FilterAccordionItem
      label={label}
      tooltip={tooltip}
      help={help}
      summary={summary}
      filterKey={filterKey}
      isActive={isActive}
      isDisabled={isDisabled}
      disabledReason={disabledReason}
      onReset={onReset}
    >
      {loading ? (
        <div className="text-muted-foreground px-4 py-2 text-sm">
          Loading...
        </div>
      ) : (
        <KeyValueFilterBuilder
          mode="numeric"
          keyOptions={keyOptions}
          keyLevels={keyLevels}
          activeFilters={value}
          onChange={onChange}
          keyPlaceholder={keyPlaceholder}
        />
      )}
    </FilterAccordionItem>
  );
}

function BooleanKeyValueFacet({
  label,
  tooltip,
  help,
  summary,
  filterKey,
  expanded: _expanded,
  loading,
  keyOptions,
  keyLevels,
  value,
  onChange,
  isActive,
  isDisabled,
  disabledReason,
  onReset,
  keyPlaceholder,
}: BooleanKeyValueFacetProps) {
  return (
    <FilterAccordionItem
      label={label}
      tooltip={tooltip}
      help={help}
      summary={summary}
      filterKey={filterKey}
      isActive={isActive}
      isDisabled={isDisabled}
      disabledReason={disabledReason}
      onReset={onReset}
    >
      {loading ? (
        <div className="text-muted-foreground px-4 py-2 text-sm">
          Loading...
        </div>
      ) : (
        <KeyValueFilterBuilder
          mode="boolean"
          keyOptions={keyOptions}
          keyLevels={keyLevels}
          activeFilters={value}
          onChange={onChange}
          keyPlaceholder={keyPlaceholder}
        />
      )}
    </FilterAccordionItem>
  );
}

function StringKeyValueFacet({
  label,
  tooltip,
  help,
  summary,
  filterKey,
  expanded: _expanded,
  loading,
  keyOptions,
  keyDetails,
  valueOptions,
  value,
  onChange,
  isActive,
  isDisabled,
  disabledReason,
  onReset,
  keyPlaceholder,
}: StringKeyValueFacetProps) {
  return (
    <FilterAccordionItem
      label={label}
      tooltip={tooltip}
      help={help}
      summary={summary}
      filterKey={filterKey}
      isActive={isActive}
      isDisabled={isDisabled}
      disabledReason={disabledReason}
      onReset={onReset}
    >
      {loading ? (
        <div className="text-muted-foreground px-4 py-2 text-sm">
          Loading...
        </div>
      ) : (
        <KeyValueFilterBuilder
          mode="string"
          keyOptions={keyOptions}
          keyDetails={keyDetails}
          valueOptions={valueOptions}
          activeFilters={value}
          onChange={onChange}
          keyPlaceholder={keyPlaceholder}
        />
      )}
    </FilterAccordionItem>
  );
}

// Filter mode tabs for switching between Select (checkboxes) and Text (contains) modes
interface FilterModeTabsProps {
  mode: "select" | "text";
  onModeChange: (mode: "select" | "text") => void;
}

function FilterModeTabs({ mode, onModeChange }: FilterModeTabsProps) {
  return (
    // mt-1 evens the rhythm: content opens with pt-1, so the tabs sit 8px
    // from the header band and 8px (mb-2) from the list below.
    <div className="mt-1 mb-2 px-4">
      <Tabs
        value={mode}
        onValueChange={(newMode) => onModeChange(newMode as "select" | "text")}
      >
        <Tabs.List layout="full" size="sm">
          <Tabs.Trigger value="select" size="sm" label="Select" />
          <Tabs.Trigger value="text" size="sm" label="Text" />
        </Tabs.List>
      </Tabs>
    </div>
  );
}

// Text filter section for categorical filters
// Single input with DOES/DOES NOT toggle, allows adding multiple filters
function TextFilterSection({
  allFilters,
  onAdd,
  onRemove,
}: {
  allFilters: TextFilterEntry[];
  onAdd?: (op: "contains" | "does not contain", val: string) => void;
  onRemove?: (op: "contains" | "does not contain", val: string) => void;
}) {
  const [inputValue, setInputValue] = useState("");
  const [selectedOperator, setSelectedOperator] = useState<
    "contains" | "does not contain"
  >("contains");

  const handleAdd = () => {
    // people have filtered for a single " ", e.g. does not contain " " on sessionID to get all traces with a session id
    if (inputValue.length > 0 && onAdd) {
      onAdd(selectedOperator, inputValue);
      setInputValue("");
    }
  };

  return (
    <div className="space-y-2">
      {/* Operator picker */}
      <div className="px-2">
        <Select
          value={selectedOperator}
          onValueChange={(operator) =>
            setSelectedOperator(operator as "contains" | "does not contain")
          }
        >
          <SelectTrigger className="h-7 w-full text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="contains" className="text-xs">
              contains
            </SelectItem>
            <SelectItem value="does not contain" className="text-xs">
              does not contain
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Input + Add button */}
      <div className="flex items-center gap-2 px-2">
        <Input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
          placeholder="Enter value..."
          className="h-7 flex-1 text-xs"
        />
        <Button
          size="sm"
          variant="ghost"
          onClick={handleAdd}
          disabled={inputValue.length === 0}
          className="h-7 shrink-0 px-2 text-xs"
        >
          Add
        </Button>
      </div>

      {/* Active filters list */}
      {allFilters.length > 0 && (
        <div className="space-y-1 px-2">
          {allFilters.map((f, idx) => (
            <div
              key={idx}
              className="group/textfilter border-border/40 bg-muted/30 flex items-center gap-2 rounded border px-2 py-1 text-xs"
            >
              <span className="text-muted-foreground shrink-0 text-[11px] font-bold">
                {f.operator === "contains" ? "contains" : "does not contain"}
              </span>
              <span
                className="min-w-0 flex-1 truncate font-bold"
                title={f.value}
              >
                {f.value}
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onRemove?.(f.operator, f.value)}
                className="text-muted-foreground hover:text-foreground h-4 w-4 shrink-0 p-0 opacity-0 transition-opacity group-hover/textfilter:opacity-100"
              >
                ×
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface FilterValueCheckboxProps {
  id: string;
  label: string;
  title?: string;
  icon?: React.ReactNode;
  suffix?: React.ReactNode;
  count: number;
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  onLabelClick?: () => void; // For "only this" behavior
  totalSelected?: number;
  disabled?: boolean;
}

function FilterValueCheckbox({
  id,
  label,
  title,
  icon,
  suffix,
  count,
  checked = false,
  onCheckedChange,
  onLabelClick,
  totalSelected,
  disabled = false,
}: FilterValueCheckboxProps) {
  // Show "All" when clicking would reverse selection (only one item selected)
  const labelText = checked && totalSelected === 1 ? "All" : "Only";

  // Display placeholder for empty strings to ensure clickable area
  const displayLabel = label === "" ? "(empty)" : label;
  const displayTitle = title ?? (label === "" ? "(empty)" : label);

  return (
    <div
      className={cn(
        "relative flex items-center px-2",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      {/* Checkbox hover area */}
      <div className="group/checkbox hover:bg-accent flex items-center rounded-sm p-0.5 transition-colors">
        <span className="pointer-events-auto">
          <Checkbox
            id={id}
            checked={checked}
            onCheckedChange={onCheckedChange}
            disabled={disabled}
            size="sm"
          />
        </span>
      </div>

      {/* Label hover area */}
      <div
        className={cn(
          "group/label hover:bg-accent flex min-w-0 flex-1 cursor-pointer items-center rounded-sm px-1 py-0.5 transition-colors",
          disabled && "pointer-events-none",
        )}
        onClick={onLabelClick}
      >
        {icon ? <span className="mr-2">{icon}</span> : null}
        <span
          className={cn(
            "min-w-0 truncate text-xs",
            !suffix && "flex-1",
            label === "" && "text-muted-foreground italic",
          )}
          title={displayTitle}
        >
          {displayLabel}
        </span>
        {suffix ? <span className="shrink-0 pl-1">{suffix}</span> : null}

        {/* "Only" or "All" indicator when hovering label. shrink-0 +
            whitespace-nowrap: appearing may only re-truncate the label —
            never widen the row. */}
        {onLabelClick && !disabled && (
          <span className="text-muted-foreground hidden shrink-0 pl-1 text-xs whitespace-nowrap group-hover/label:block">
            {labelText}
          </span>
        )}

        {count > 0 ? (
          <span className="text-muted-foreground ml-auto w-7 shrink-0 pl-1 text-right text-xs">
            {compactNumberFormatter(count, 0)}
          </span>
        ) : null}
      </div>
    </div>
  );
}
