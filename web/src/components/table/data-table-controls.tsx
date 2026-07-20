import type React from "react";
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import { ScrollArea } from "@/src/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/src/components/ui/select";
import {
  getFacetSummary,
  getFacetSummaryValue,
  rankFacetOptions,
} from "@/src/features/filters/lib/facet-display";
import { useMediaQuery } from "react-responsive";
import useLocalStorage from "@/src/components/useLocalStorage";
import { cn } from "@/src/utils/tailwind";
import { compactNumberFormatter } from "@/src/utils/numbers";
import { Accordion } from "@/src/components/ui/accordion";
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
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { Badge } from "@/src/components/ui/badge";
import { Checkbox } from "@/src/components/ui/checkbox";
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
import { X as IconX, Search, WandSparkles, InfoIcon } from "lucide-react";
import DocPopup from "@/src/components/layouts/doc-popup";
import type {
  UIFilter,
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
import { type FilterState } from "@langfuse/shared";
import { useLangfuseCloudRegion } from "@/src/features/organizations/hooks";

interface ControlsContextType {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  tableName?: string;
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
    <ControlsContext.Provider value={{ open, setOpen, tableName }}>
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
    return { open: false, setOpen: () => {}, tableName: undefined };
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
}

// Module-stable initial value: a fresh {} per render would re-subscribe
// useLocalStorage's cross-tab listener on every render.
const EMPTY_RECENCY: Record<string, number> = {};

export function DataTableControls({
  queryFilter,
  filterWithAI,
  blockedColumnReason,
}: DataTableControlsProps) {
  const { isLangfuseCloud } = useLangfuseCloudRegion();
  const { setOpen, tableName } = useDataTableControls();
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
  const [revealedColumns, setRevealedColumns] = useState<string[]>([]);

  // Selected filters on top: a facet is PROMOTED when it carries an active
  // filter OR the user explicitly added it via "Add filter" — the explicit
  // add is a promotion in itself, so typing a first value (facet becomes
  // active) or clearing it again (inactive) never moves the facet around
  // while someone is working in it. Config order is preserved within each
  // group, the sort updates immediately, and both display modes share the
  // exact same order. When an interaction does move a facet (activation by
  // direct click), the follow-scroll effect below keeps it in view.
  const revealedSet = new Set(revealedColumns);
  const isPromoted = (filter: UIFilter) =>
    filter.isActive || revealedSet.has(filter.column);
  const orderedFilters = [...queryFilter.filters].sort(
    (a, b) => Number(isPromoted(b)) - Number(isPromoted(a)),
  );
  const displayedFilters = showOnlyActive
    ? orderedFilters.filter(isPromoted)
    : orderedFilters;

  // Facet-usage recency, feeding the "Add filter" dropdown's ordering so the
  // filters someone actually uses on this table surface first.
  const [recentColumns, setRecentColumns] = useLocalStorage<
    Record<string, number>
  >(`${storagePrefix}-recent-facets`, EMPTY_RECENCY);
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

  // Follow-scroll + recency: DOM scrolling is the external system here, so an
  // effect is the right integration boundary. When exactly one facet changed
  // activity (the user's own interaction — bulk changes like Clear all, AI
  // apply, or a restored view skip the scroll), the re-sort has already moved
  // it by the time this runs; scroll the list to its new position.
  const scrollRootRef = useRef<HTMLDivElement>(null);
  // Last focused element inside the list: re-sorting moves DOM nodes, and a
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
    [queryFilter, capture, tableName],
  );

  const promotedFacetCount = displayedFilters.filter(isPromoted).length;

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
          "bg-background flex h-full w-full flex-col overflow-hidden border-t",
          "group-data-[expanded=false]/controls:hidden",
        )}
      >
        <div className="bg-background flex h-10 shrink-0 items-center justify-between border-b px-3">
          <div className="flex items-center gap-1.5">
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
            <span className="text-sm font-bold">Filters</span>
            {activeFilterCount > 0 && (
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
                the trace tree/timeline header. */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() =>
                    queryFilter.onExpandedChange(
                      queryFilter.expanded.length === 0
                        ? displayedFilters.map((filter) => filter.column)
                        : [],
                    )
                  }
                  aria-label={
                    queryFilter.expanded.length === 0
                      ? "Expand all filters"
                      : "Collapse all filters"
                  }
                >
                  {queryFilter.expanded.length === 0 ? (
                    <UnfoldVertical className="h-3.5 w-3.5" />
                  ) : (
                    <FoldVertical className="h-3.5 w-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {queryFilter.expanded.length === 0
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
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
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
          {/* w-0 + min-w-full pins the content to the viewport width: the
              Radix viewport wraps children in an inline-styled
              `display: table; min-width: 100%` div that otherwise grows to
              CONTENT width — long value labels would stop truncating and
              hover-revealed affordances would widen the whole list. width: 0
              zeroes the content's intrinsic contribution (the table stays at
              min-width: 100%), then min-w-full stretches this wrapper back to
              the now-fixed table width. */}
          <div className="w-0 min-w-full pt-1 pb-10">
            <Accordion
              type="multiple"
              className="w-full"
              value={queryFilter.expanded}
              onValueChange={queryFilter.onExpandedChange}
            >
              {/* ONE keyed child array — not two .map() slices: React can
                  only match keys within the same array, so a facet crossing
                  the promoted/rest boundary would REMOUNT (wiping input
                  focus and draft state) instead of moving. */}
              {displayedFilters.flatMap((filter, index) => {
                const nodes = [];
                if (index === promotedFacetCount && promotedFacetCount > 0) {
                  // Clear spatial break between the active/added block and
                  // the inactive rest of the catalog.
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
                nodes.push(renderFacet(filter));
                return nodes;
              })}
            </Accordion>

            {/* Active-only mode: surface the rest of the catalog behind an
                explicit "Add filter" picker, most-recently-used first, so
                the filters someone actually works with are one click away. */}
            {showOnlyActive && (
              <div
                className={cn(
                  "px-3 pt-4",
                  displayedFilters.length === 0 &&
                    "flex flex-col items-center gap-1 pt-8 text-center",
                )}
              >
                {displayedFilters.length === 0 && (
                  <p className="text-muted-foreground pb-2 text-xs">
                    No active filters.
                  </p>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      disabled={addableFilters.length === 0}
                    >
                      <Plus className="mr-1.5 h-3.5 w-3.5" />
                      Add filter
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    className="max-h-72 w-56 overflow-y-auto"
                  >
                    {addableFilters.map((filter) => {
                      // A column the surface can't honour stays visible but is
                      // not addable — adding it would only land a facet that
                      // immediately reads blocked (chart view — #15187 /
                      // #15049). Same reason on hover.
                      const reason =
                        blockedColumnReason?.(filter.column) ?? null;
                      return (
                        <DropdownMenuItem
                          key={filter.column}
                          disabled={!!reason}
                          title={reason ?? undefined}
                          onClick={() => handleAddFilter(filter.column)}
                          className="cursor-pointer"
                        >
                          {filter.label}
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
          </div>
        </ScrollArea>
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
  availableValues: Record<string, string[]>;
  value: KeyValueFilterEntry[];
  onChange: (filters: KeyValueFilterEntry[]) => void;
  keyPlaceholder?: string;
}

interface NumericKeyValueFacetProps extends BaseFacetProps {
  keyOptions?: string[];
  value: NumericKeyValueFilterEntry[];
  onChange: (filters: NumericKeyValueFilterEntry[]) => void;
  keyPlaceholder?: string;
}

interface BooleanKeyValueFacetProps extends BaseFacetProps {
  keyOptions?: string[];
  value: BooleanKeyValueFilterEntry[];
  onChange: (filters: BooleanKeyValueFilterEntry[]) => void;
  keyPlaceholder?: string;
}

interface StringKeyValueFacetProps extends BaseFacetProps {
  keyOptions?: string[];
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
  // overlays on hover without reserving layout space.
  <AccordionPrimitive.Header className="bg-background sticky top-0 z-[1] flex px-2 py-0.5">
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

export function FilterAccordionItem({
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
      className="py-0.5"
      // Anchor for the follow-scroll after a re-sort moves this facet.
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
                  already a <button> and buttons cannot nest. Rendered as a
                  hover/focus-revealed OVERLAY (absolute, own background) so
                  it never shifts the header layout. */}
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
                // top-1 anchors the button to the label line — a 20px
                // button in the 28px single-line header reads centered, and
                // on two-line headers it stays top-right. bg-accent matches
                // the hovered header band (the button is only visible while
                // the band shows its hover color).
                className="bg-accent text-muted-foreground hover:text-foreground absolute top-0.5 right-1 flex h-5 w-5 cursor-pointer items-center justify-center rounded-sm opacity-0 transition-opacity group-hover/facet:opacity-100 focus-visible:opacity-100"
                aria-label={`Clear ${label} filter`}
              >
                <IconX className="h-3 w-3" />
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
        icon={renderIcon?.(option)}
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
            <TabsList className="grid h-6 w-full grid-cols-3 p-0.5">
              <TabsTrigger value="any of" className="h-5 px-1 text-xs">
                Any of
              </TabsTrigger>
              <TabsTrigger value="all of" className="h-5 px-1 text-xs">
                All of
              </TabsTrigger>
              {/* Without a persisted selection, switching to "none of" is a
                  deliberate no-op in the state model (an empty exclusion
                  would persist a vacuous filter — LFE-10717), which used to
                  read as a broken button. Disable it and say why; it
                  enables as soon as any selection exists, and NONE mode
                  engages by itself when a value is unchecked. */}
              <Tooltip delayDuration={80}>
                <TooltipTrigger asChild>
                  <span className="min-w-0">
                    <TabsTrigger
                      value="none of"
                      disabled={operator === undefined}
                      className="h-5 w-full px-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      None of
                    </TabsTrigger>
                  </span>
                </TooltipTrigger>
                {operator === undefined && (
                  <TooltipContent className="max-w-64 text-xs">
                    Nothing to exclude yet — uncheck a value to exclude it, or
                    select values first.
                  </TooltipContent>
                )}
              </Tooltip>
            </TabsList>
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

export function NumericFacet({
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

export function StringFacet({
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

export function KeyValueFacet({
  label,
  tooltip,
  help,
  summary,
  filterKey,
  expanded: _expanded,
  loading,
  keyOptions,
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
          availableValues={availableValues}
          activeFilters={value}
          onChange={onChange}
          keyPlaceholder={keyPlaceholder}
        />
      )}
    </FilterAccordionItem>
  );
}

export function NumericKeyValueFacet({
  label,
  tooltip,
  help,
  summary,
  filterKey,
  expanded: _expanded,
  loading,
  keyOptions,
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
          activeFilters={value}
          onChange={onChange}
          keyPlaceholder={keyPlaceholder}
        />
      )}
    </FilterAccordionItem>
  );
}

export function BooleanKeyValueFacet({
  label,
  tooltip,
  help,
  summary,
  filterKey,
  expanded: _expanded,
  loading,
  keyOptions,
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
          activeFilters={value}
          onChange={onChange}
          keyPlaceholder={keyPlaceholder}
        />
      )}
    </FilterAccordionItem>
  );
}

export function StringKeyValueFacet({
  label,
  tooltip,
  help,
  summary,
  filterKey,
  expanded: _expanded,
  loading,
  keyOptions,
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
        <TabsList className="grid h-6 w-full grid-cols-2 p-0.5">
          <TabsTrigger value="select" className="h-5 px-2 text-xs">
            Select
          </TabsTrigger>
          <TabsTrigger value="text" className="h-5 px-2 text-xs">
            Text
          </TabsTrigger>
        </TabsList>
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
  icon?: React.ReactNode;
  count: number;
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  onLabelClick?: () => void; // For "only this" behavior
  totalSelected?: number;
  disabled?: boolean;
}

export function FilterValueCheckbox({
  id,
  label,
  icon,
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
  const displayTitle = label === "" ? "(empty)" : label;

  return (
    <div
      className={cn(
        "relative flex items-center px-2",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      {/* Checkbox hover area */}
      <div className="group/checkbox hover:bg-accent flex items-center rounded-sm p-0.5 transition-colors">
        <Checkbox
          id={id}
          checked={checked}
          onCheckedChange={onCheckedChange}
          disabled={disabled}
          className="pointer-events-auto h-3.5 w-3.5 [&_svg]:h-3 [&_svg]:w-3"
        />
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
            "min-w-0 flex-1 truncate text-xs",
            label === "" && "text-muted-foreground italic",
          )}
          title={displayTitle}
        >
          {displayLabel}
        </span>

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

export function DataTableControlsSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <h3 className="text-foreground text-sm font-bold">{title}</h3>
      <div>{children}</div>
    </div>
  );
}
