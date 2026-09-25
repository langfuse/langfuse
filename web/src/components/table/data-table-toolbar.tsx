/* eslint-disable @repo/no-style-props */
import React, {
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useState,
} from "react";
import { SearchInput } from "@/src/components/design-system/SearchInput/SearchInput";
import {
  DataTableColumnVisibilityFilter,
  type ColumnGroupTogglePayload,
} from "@/src/components/table/data-table-column-visibility-filter";
import { FilterToggleButton } from "@/src/components/table/FilterToggleButton";
import {
  InlineFilterBuilder,
  PopoverFilterBuilder,
} from "@/src/features/filters/components/filter-builder";
import {
  type FilterState,
  type ColumnDefinition,
  type OrderByState,
  type TableViewPresetState,
  TableViewPresetTableName,
  type TracingSearchType,
} from "@langfuse/shared";
import {
  type RowSelectionState,
  type ColumnOrderState,
  type VisibilityState,
} from "@tanstack/react-table";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import {
  DataTableRowHeightSwitch,
  type RowHeight,
} from "@/src/components/table/data-table-row-height-switch";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { TimeRangePicker } from "@/src/components/date-picker";
import {
  type TimeRange,
  TABLE_AGGREGATION_OPTIONS,
} from "@/src/utils/date-range-utils";
import { DataTableSelectAllBanner } from "@/src/components/table/data-table-multi-select-actions/data-table-select-all-banner";
import { cn } from "@/src/utils/tailwind";
import DocPopup from "@/src/components/layouts/doc-popup";
import {
  TableViewPresetsDrawer,
  type SystemFilterPreset,
} from "@/src/components/table/table-view-presets/components/data-table-view-presets-drawer";
import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/src/components/ui/dropdown-menu";
import { MultiSelect as MultiSelectFilter } from "@/src/features/filters/components/multi-select";
import { DataTableRefreshButton } from "@/src/components/table/data-table-refresh-button";
import { type RefreshInterval } from "@/src/components/table/utils/refresh-intervals";
import {
  getSearchButtonLabel,
  getSearchMode,
  hasFullTextSearchType,
  searchModeToType,
} from "@/src/components/table/utils/searchUtils";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/src/components/ui/sheet";
import { Button } from "@/src/components/ui/button";
import { Filter, X } from "lucide-react";
import { useMediaQuery } from "react-responsive";
import {
  SearchBarDraftCacheContext,
  useSearchBarDraftCache,
} from "@/src/features/search-bar/hooks/useEventsSearchBar";

export interface MultiSelect {
  selectAll: boolean;
  setSelectAll: Dispatch<SetStateAction<boolean>>;
  selectedRowIds: string[];
  setRowSelection: Dispatch<SetStateAction<RowSelectionState>>;
  pageSize: number;
  pageIndex: number;
  totalCount: number | null;
  // Tables that only compute totalCount lazily (e.g. v4 events, where counting
  // is expensive and runs once select-all is active) pass this keyset-pagination
  // signal instead, so the select-all banner can show while the count is unknown.
  hasNextPage?: boolean;
  // When the displayed row count does not equal the number of affected entities
  // (e.g. datasets where a folder row expands to many datasets on delete), the
  // select-all banner drops the precise number and says "matching" instead.
  approximateCount?: boolean;
}

interface SearchConfig {
  metadataSearchFields?: string[];
  updateQuery: (event: string) => void;
  currentQuery?: string;
  tableAllowsFullTextSearch?: boolean;
  setSearchType?: (newSearchType: TracingSearchType[]) => void;
  searchType?: TracingSearchType[];
  customDropdownLabels?: {
    metadata: string;
    fullText: string;
  };
  hidePerformanceWarning?: boolean;
  availableSearchTypes?: {
    content: boolean;
    input: boolean;
    output: boolean;
  };
}

interface TableViewControllers {
  applyViewState: (viewData: TableViewPresetState) => void;
  selectedViewId: string | null;
  appliedViewId: string | null;
  handleSetViewId: (viewId: string | null) => void;
}

interface TableViewConfig {
  tableName: TableViewPresetTableName;
  projectId: string;
  controllers: TableViewControllers;
  systemFilterPresets?: SystemFilterPreset[];
}

interface RefreshConfig {
  onRefresh: () => void;
  isRefreshing: boolean;
  interval: RefreshInterval;
  setInterval: (interval: RefreshInterval) => void;
}

interface DataTableToolbarProps<TData, TValue> {
  columns: LangfuseColumnDef<TData, TValue>[];
  filterColumnDefinition?: ColumnDefinition[];
  searchConfig?: SearchConfig;
  /** Authoritative search query to persist into saved views. Use when the
   * toolbar's own search field is hidden (e.g. search-bar mode) so the live
   * query — not the toolbar's stale local mirror — is captured. */
  currentSearchQuery?: string;
  actionButtons?: React.ReactNode;
  filterState?: FilterState;
  setFilterState?:
    | Dispatch<SetStateAction<FilterState>>
    | ((newState: FilterState) => void);
  columnVisibility?: VisibilityState;
  setColumnVisibility?: Dispatch<SetStateAction<VisibilityState>>;
  columnOrder?: ColumnOrderState;
  setColumnOrder?: Dispatch<SetStateAction<ColumnOrderState>>;
  rowHeight?: RowHeight;
  setRowHeight?: Dispatch<SetStateAction<RowHeight>>;
  columnsWithCustomSelect?: string[];
  timeRange?: TimeRange;
  setTimeRange?: (timeRange: TimeRange) => void;
  refreshConfig?: RefreshConfig;
  multiSelect?: MultiSelect;
  environmentFilter?: {
    values: string[];
    onValueChange: (values: string[]) => void;
    options: { value: string }[];
  };
  orderByState?: OrderByState;
  viewConfig?: TableViewConfig;
  /** Analytics table identity, for `filters:applied`/`filters:cleared`,
   * `table:search_submit`, `table:row_height_switch_select` and
   * `table:column_visibility_changed`.
   * Tables with a `viewConfig` supply it via `viewConfig.tableName`; every table
   * WITHOUT one must pass this — the `ToolbarTableIdentity` union below makes
   * that a type error rather than an "unknown" bucket in PostHog. */
  tableName?: string;
  /** Whether this table reads the v4 (fast-mode) data path, at the moment of the
   * action. The headline segmentation dimension: filtering, columns and search
   * behave very differently across v3 and v4. Forward it from the owning table —
   * the fallback is the v4 events view, not a safe default. */
  isV4?: boolean;
  filterWithAI?: boolean;
  /** Search composer rendered inside the mobile legacy-filter sheet. New
   * sidebar tables compose this through SearchableTableFilterLayout instead. */
  mobileSearch?: ReactNode;
  className?: string;
  rowClassName?: string;
  viewModeToggle?: React.ReactNode;
  /** Rendered at the start of the toolbar's control row (left-aligned), before
   *  the filter toggle — e.g. the v4 events category-preset chips, so they
   *  share the row with the right-aligned Columns/Export controls. */
  leadingControls?: React.ReactNode;
  /** Surface-specific controls immediately before Columns and row height. */
  toolbarSettings?: React.ReactNode;
  /** Saved views and time range are rendered by the owning searchable layout
   * inside its mobile Filters sheet. Their desktop toolbar placement remains. */
  hideMobileFilterControls?: boolean;
  additionalColumnSettings?: {
    content: React.ReactNode;
    isDefault: boolean;
    onRestoreDefaults: () => void;
  };
  /** Notified when a whole column group is shown or hidden at once, for surfaces
   *  that report their own event for it (the experiments score families). */
  onColumnGroupToggle?: (payload: ColumnGroupTogglePayload) => void;
}

type TableViewControlProps = {
  viewConfig: TableViewConfig;
  orderByState?: OrderByState;
  filterState?: FilterState;
  columnOrder: ColumnOrderState;
  columnVisibility: VisibilityState;
  searchQuery?: string;
};

function TableViewControl({
  viewConfig,
  orderByState,
  filterState,
  columnOrder,
  columnVisibility,
  searchQuery,
}: TableViewControlProps) {
  return (
    <TableViewPresetsDrawer
      viewConfig={viewConfig}
      currentState={{
        orderBy: orderByState ?? null,
        filters: filterState ?? [],
        columnOrder,
        columnVisibility,
        searchQuery: searchQuery ?? "",
      }}
      systemFilterPresets={viewConfig.systemFilterPresets}
    />
  );
}

function TableTimeRangeControl({
  timeRange,
  setTimeRange,
  compact = false,
}: {
  timeRange: TimeRange;
  setTimeRange: (timeRange: TimeRange) => void;
  compact?: boolean;
}) {
  return (
    <TimeRangePicker
      timeRange={timeRange}
      onTimeRangeChange={setTimeRange}
      timeRangePresets={TABLE_AGGREGATION_OPTIONS}
      className="my-0 max-w-full overflow-x-auto"
      compact={compact}
    />
  );
}

/** Saved views and time-range controls for searchable tables' mobile sheet. */
export function DataTableMobileFilterControls({
  viewConfig,
  orderByState,
  filterState,
  columnOrder,
  columnVisibility,
  searchQuery,
  timeRange,
  setTimeRange,
}: Partial<TableViewControlProps> & {
  timeRange?: TimeRange;
  setTimeRange?: (timeRange: TimeRange) => void;
}) {
  return (
    <>
      {viewConfig && columnOrder && columnVisibility && (
        <TableViewControl
          viewConfig={viewConfig}
          orderByState={orderByState}
          filterState={filterState}
          columnOrder={columnOrder}
          columnVisibility={columnVisibility}
          searchQuery={searchQuery}
        />
      )}
      {timeRange && setTimeRange && (
        <TableTimeRangeControl
          timeRange={timeRange}
          setTimeRange={setTimeRange}
          compact
        />
      )}
    </>
  );
}

/**
 * Every toolbar must be able to name its own table, because four analytics
 * events fire from inside it. One of the two sources has to be present:
 * a `viewConfig` (whose `tableName` is the saved-view table) or an explicit
 * `tableName`. Enforced in the type so no surface can silently report
 * `tableName: "unknown"` — the failure mode the first version of these events
 * shipped and had to fix.
 */
type ToolbarTableIdentity =
  | { tableName: string }
  | { viewConfig: TableViewConfig };

// Helper function to get the description for DocPopup
function getSearchDescription(
  searchType: TracingSearchType[] | undefined,
  metadataFields: string[] | undefined,
  hidePerformanceWarning: boolean | undefined,
  tableAllowsFullTextSearch: boolean | undefined,
): React.ReactNode {
  const fields = metadataFields?.join(", ") ?? "";
  const performanceWarning = !hidePerformanceWarning
    ? " For improved performance, please filter the table down."
    : "";

  if (tableAllowsFullTextSearch && searchType?.includes("content")) {
    return (
      <p className="text-primary text-xs font-normal">
        Searches in Input/Output and {fields}.{performanceWarning}
      </p>
    );
  }
  if (tableAllowsFullTextSearch && searchType?.includes("input")) {
    return (
      <p className="text-primary text-xs font-normal">
        Searches in Input and {fields}.{performanceWarning}
      </p>
    );
  }
  if (tableAllowsFullTextSearch && searchType?.includes("output")) {
    return (
      <p className="text-primary text-xs font-normal">
        Searches in Output and {fields}.{performanceWarning}
      </p>
    );
  }
  return (
    <p className="text-primary text-xs font-normal">Searches in {fields}.</p>
  );
}

export function DataTableToolbar<TData, TValue>({
  columns,
  filterColumnDefinition,
  searchConfig,
  currentSearchQuery,
  actionButtons,
  filterState,
  setFilterState,
  columnVisibility,
  setColumnVisibility,
  columnOrder,
  setColumnOrder,
  rowHeight,
  setRowHeight,
  columnsWithCustomSelect,
  timeRange,
  setTimeRange,
  refreshConfig,
  multiSelect,
  environmentFilter,
  className,
  rowClassName,
  orderByState,
  viewConfig,
  tableName,
  isV4,
  filterWithAI = false,
  mobileSearch,
  viewModeToggle,
  leadingControls,
  toolbarSettings,
  hideMobileFilterControls = false,
  additionalColumnSettings,
  onColumnGroupToggle,
}: DataTableToolbarProps<TData, TValue> & ToolbarTableIdentity) {
  const [searchString, setSearchString] = useState(
    searchConfig?.currentQuery ?? "",
  );
  const [legacyMobileFiltersOpen, setLegacyMobileFiltersOpen] = useState(false);
  const legacyMobileSearchDraftCache = useSearchBarDraftCache(
    React.isValidElement(mobileSearch) ? mobileSearch.key : null,
  );
  const isDesktop = useMediaQuery({ query: "(min-width: 768px)" });

  const capture = usePostHogClientCapture();
  // One definition of the two analytics dimensions for everything the toolbar
  // emits: an explicit `tableName` wins over the view's, and `isV4`
  // falls back to the one surface that is v4 without saying so — the v4 events
  // table, which filters through the grammar bar rather than this toolbar.
  // The "unknown" fallback is unreachable — `ToolbarTableIdentity` requires one
  // of the two sources.
  const analyticsTableName = tableName ?? viewConfig?.tableName ?? "unknown";
  const analyticsIsV4 =
    isV4 ??
    viewConfig?.tableName === TableViewPresetTableName.ObservationsEvents;
  const emitLegacyMobileFiltersToggled = (
    open: boolean,
    trigger: "toolbar" | "header" | "mobile_sheet_dismiss",
  ) => {
    capture("filters:sidebar_toggled", {
      tableName: analyticsTableName,
      isV4: analyticsIsV4,
      open,
      trigger,
    });
  };
  const showSearchTypeSelector = Boolean(
    searchConfig?.setSearchType && searchConfig.tableAllowsFullTextSearch,
  );
  const allVisibleRowsSelected = Boolean(
    multiSelect &&
    multiSelect.pageIndex === 0 &&
    multiSelect.selectedRowIds.length > 0 &&
    (multiSelect.totalCount !== null
      ? multiSelect.totalCount > multiSelect.pageSize &&
        multiSelect.selectedRowIds.length ===
          Math.min(multiSelect.pageSize, multiSelect.totalCount)
      : multiSelect.hasNextPage === true &&
        multiSelect.selectedRowIds.length === multiSelect.pageSize),
  );

  const submitSearch = (query: string) => {
    if (
      searchConfig?.setSearchType &&
      !searchConfig.tableAllowsFullTextSearch &&
      hasFullTextSearchType(searchConfig.searchType)
    ) {
      searchConfig.setSearchType(["id"]);
    }
    searchConfig?.updateQuery(query);
  };

  const searchButtonLabel = searchConfig?.tableAllowsFullTextSearch
    ? getSearchButtonLabel(
        searchConfig.searchType,
        searchConfig.customDropdownLabels?.metadata,
      )
    : undefined;

  // Only show the toggle button when we're using the new sidebar
  const hasNewSidebar = !filterColumnDefinition && filterState !== undefined;
  return (
    <div className={cn("grid h-fit w-full gap-0 px-2", className)}>
      <div
        className={cn(
          "@container my-2 flex flex-wrap items-center gap-2",
          rowClassName,
        )}
      >
        {leadingControls}
        {/* Desktop uses the sidebar's own header toggle + collapsed rail; this
            toolbar toggle only remains for the mobile stacked layout. */}
        {hasNewSidebar && (
          <FilterToggleButton filterState={filterState} className="md:hidden" />
        )}
        {!!columnVisibility && !!columnOrder && !!viewConfig && (
          <div className={cn(hideMobileFilterControls && "hidden md:contents")}>
            <TableViewControl
              viewConfig={viewConfig}
              orderByState={orderByState}
              filterState={filterState}
              columnOrder={columnOrder}
              columnVisibility={columnVisibility}
              searchQuery={currentSearchQuery ?? searchString}
            />
          </div>
        )}
        {searchConfig && (
          <div className="flex max-w-120 shrink-0 items-stretch md:min-w-96">
            <SearchInput
              autoFocus
              placeholder={
                searchConfig.tableAllowsFullTextSearch
                  ? "Search..."
                  : `Search (${searchConfig.metadataSearchFields?.join(", ")})`
              }
              value={searchString}
              onChange={(newValue) => {
                setSearchString(newValue);
                // If user cleared the search, update URL immediately
                if (newValue === "") {
                  submitSearch("");
                }
              }}
              onSubmit={(value) => {
                capture("table:search_submit", {
                  tableName: analyticsTableName,
                  isV4: analyticsIsV4,
                });
                submitSearch(value);
              }}
              dropdown={
                showSearchTypeSelector
                  ? {
                      label: searchButtonLabel,
                      labelAccessory: (
                        <DocPopup
                          description={getSearchDescription(
                            searchConfig.searchType,
                            searchConfig.metadataSearchFields,
                            searchConfig.hidePerformanceWarning,
                            searchConfig.tableAllowsFullTextSearch,
                          )}
                        />
                      ),
                      content: (
                        <DropdownMenuRadioGroup
                          value={getSearchMode(
                            searchConfig.searchType,
                            searchConfig.tableAllowsFullTextSearch,
                          )}
                          onValueChange={(value) => {
                            if (
                              !searchConfig.tableAllowsFullTextSearch &&
                              value.startsWith("metadata_fulltext")
                            )
                              return;
                            searchConfig.setSearchType?.(
                              searchModeToType(value),
                            );
                          }}
                        >
                          <DropdownMenuRadioItem value="metadata">
                            {searchConfig.customDropdownLabels?.metadata ??
                              "IDs / Names"}
                          </DropdownMenuRadioItem>
                          <DropdownMenuSub>
                            <DropdownMenuSubTrigger
                              disabled={!searchConfig.tableAllowsFullTextSearch}
                            >
                              <span className="flex items-center gap-2">
                                {getSearchMode(
                                  searchConfig.searchType,
                                  searchConfig.tableAllowsFullTextSearch,
                                ).startsWith("metadata_fulltext") && (
                                  <span className="h-2 w-2 shrink-0 rounded-full bg-current" />
                                )}
                                {searchConfig.customDropdownLabels?.fullText ??
                                  "Full Text"}
                              </span>
                            </DropdownMenuSubTrigger>
                            <DropdownMenuSubContent>
                              <DropdownMenuRadioGroup
                                value={getSearchMode(
                                  searchConfig.searchType,
                                  searchConfig.tableAllowsFullTextSearch,
                                )}
                                onValueChange={(value) => {
                                  searchConfig.setSearchType?.(
                                    searchModeToType(value),
                                  );
                                }}
                              >
                                {(searchConfig.availableSearchTypes ===
                                  undefined ||
                                  searchConfig.availableSearchTypes
                                    .content) && (
                                  <DropdownMenuRadioItem value="metadata_fulltext">
                                    Input/Output
                                  </DropdownMenuRadioItem>
                                )}
                                {(searchConfig.availableSearchTypes ===
                                  undefined ||
                                  searchConfig.availableSearchTypes.input) && (
                                  <DropdownMenuRadioItem value="metadata_fulltext_input">
                                    Input
                                  </DropdownMenuRadioItem>
                                )}
                                {(searchConfig.availableSearchTypes ===
                                  undefined ||
                                  searchConfig.availableSearchTypes.output) && (
                                  <DropdownMenuRadioItem value="metadata_fulltext_output">
                                    Output
                                  </DropdownMenuRadioItem>
                                )}
                              </DropdownMenuRadioGroup>
                            </DropdownMenuSubContent>
                          </DropdownMenuSub>
                        </DropdownMenuRadioGroup>
                      ),
                    }
                  : undefined
              }
            />
          </div>
        )}
        {viewModeToggle}
        {timeRange && setTimeRange && (
          <div className={cn(hideMobileFilterControls && "hidden md:contents")}>
            <TableTimeRangeControl
              timeRange={timeRange}
              setTimeRange={setTimeRange}
            />
          </div>
        )}
        {refreshConfig && (
          <DataTableRefreshButton
            onRefresh={refreshConfig.onRefresh}
            isRefreshing={refreshConfig.isRefreshing}
            interval={refreshConfig.interval}
            setInterval={refreshConfig.setInterval}
          />
        )}
        {environmentFilter && (
          <MultiSelectFilter
            title="Environment"
            label="Env"
            values={environmentFilter.values}
            onValueChange={environmentFilter.onValueChange}
            options={environmentFilter.options}
            className="my-0 w-auto overflow-hidden"
          />
        )}
        {!!filterColumnDefinition && !!filterState && !!setFilterState && (
          <>
            {mobileSearch && !isDesktop && (
              <SearchBarDraftCacheContext.Provider
                value={legacyMobileSearchDraftCache}
              >
                <Sheet
                  open={legacyMobileFiltersOpen}
                  onOpenChange={(open) => {
                    setLegacyMobileFiltersOpen(open);
                    emitLegacyMobileFiltersToggled(
                      open,
                      open ? "toolbar" : "mobile_sheet_dismiss",
                    );
                  }}
                >
                  <SheetTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex h-8 items-center gap-2 text-sm md:hidden"
                    >
                      <Filter className="h-4 w-4" />
                      <span>Filters</span>
                      {filterState.length > 0 && (
                        <span className="bg-input ml-1 rounded-sm px-1.5 text-xs shadow-xs">
                          {filterState.length}
                        </span>
                      )}
                    </Button>
                  </SheetTrigger>
                  <SheetContent
                    side="bottom"
                    aria-describedby={undefined}
                    className="flex h-[85svh] flex-col gap-0 p-0 [&>button]:hidden"
                  >
                    <SheetTitle className="sr-only">Filters</SheetTitle>
                    <div className="flex shrink-0 items-center gap-2 border-b px-4 py-3">
                      <span className="text-foreground text-lg font-bold">
                        Filters
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Close filters"
                        className="ml-auto h-8 w-8 shrink-0"
                        onClick={() => {
                          setLegacyMobileFiltersOpen(false);
                          emitLegacyMobileFiltersToggled(false, "header");
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="shrink-0 border-b px-2 py-2">
                      {mobileSearch}
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto p-4">
                      <InlineFilterBuilder
                        columns={filterColumnDefinition}
                        filterState={filterState}
                        onChange={setFilterState}
                        columnsWithCustomSelect={columnsWithCustomSelect}
                        compact
                      />
                    </div>
                  </SheetContent>
                </Sheet>
              </SearchBarDraftCacheContext.Provider>
            )}
            {(!mobileSearch || isDesktop) && (
              <PopoverFilterBuilder
                columns={filterColumnDefinition}
                filterState={filterState}
                onChange={setFilterState}
                columnsWithCustomSelect={columnsWithCustomSelect}
                filterWithAI={filterWithAI}
                // Analytics (LFE-10781): the table's own identity, so popover
                // filters:applied/cleared events aren't mislabeled "unknown". Shares
                // the toolbar's single definition of both dimensions.
                tableName={analyticsTableName}
                isV4={analyticsIsV4}
              />
            )}
          </>
        )}

        <div className="flex flex-row flex-wrap gap-2 pr-0.5 @3xl:ml-auto">
          {toolbarSettings}
          {!!columnVisibility && !!setColumnVisibility && (
            <DataTableColumnVisibilityFilter
              columns={columns}
              columnVisibility={columnVisibility}
              setColumnVisibility={setColumnVisibility}
              columnOrder={columnOrder}
              setColumnOrder={setColumnOrder}
              tableName={analyticsTableName}
              isV4={analyticsIsV4}
              onColumnGroupToggle={onColumnGroupToggle}
              additionalColumnSettings={additionalColumnSettings}
            />
          )}
          {!!rowHeight && !!setRowHeight && (
            <DataTableRowHeightSwitch
              rowHeight={rowHeight}
              setRowHeight={setRowHeight}
              tableName={analyticsTableName}
              isV4={analyticsIsV4}
            />
          )}
          {actionButtons}
        </div>
      </div>
      {multiSelect && allVisibleRowsSelected && (
        <DataTableSelectAllBanner {...multiSelect} />
      )}
    </div>
  );
}
