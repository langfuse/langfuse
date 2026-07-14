import { Button } from "@/src/components/ui/button";
import React, { type Dispatch, type SetStateAction, useState } from "react";
import { Input } from "@/src/components/ui/input";
import { DataTableColumnVisibilityFilter } from "@/src/components/table/data-table-column-visibility-filter";
import { FilterToggleButton } from "@/src/components/table/FilterToggleButton";
import { PopoverFilterBuilder } from "@/src/features/filters/components/filter-builder";
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
import { Search, ChevronDown } from "lucide-react";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/src/components/ui/dropdown-menu";
import { MultiSelect as MultiSelectFilter } from "@/src/features/filters/components/multi-select";
import {
  DataTableRefreshButton,
  type RefreshInterval,
} from "@/src/components/table/data-table-refresh-button";
import {
  getSearchButtonLabel,
  getSearchMode,
  hasFullTextSearchType,
  searchModeToType,
} from "@/src/components/table/utils/searchUtils";

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
  /** Analytics table identity (LFE-10781) for the popover filter builder's
   * `filters:applied`/`filters:cleared` events. Tables with a `viewConfig`
   * already supply it via `viewConfig.tableName`; tables WITHOUT one (users,
   * dataset runs/items) must pass this so the event isn't labeled "unknown". */
  tableName?: string;
  filterWithAI?: boolean;
  className?: string;
  rowClassName?: string;
  viewModeToggle?: React.ReactNode;
  /** Rendered at the start of the toolbar's control row (left-aligned), before
   *  the filter toggle — e.g. the v4 events category-preset chips, so they
   *  share the row with the right-aligned Columns/Export controls. */
  leadingControls?: React.ReactNode;
}

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
  filterWithAI = false,
  viewModeToggle,
  leadingControls,
}: DataTableToolbarProps<TData, TValue>) {
  const [searchString, setSearchString] = useState(
    searchConfig?.currentQuery ?? "",
  );

  const capture = usePostHogClientCapture();
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
          <TableViewPresetsDrawer
            viewConfig={viewConfig}
            currentState={{
              orderBy: orderByState ?? null,
              filters: filterState ?? [],
              columnOrder,
              columnVisibility,
              searchQuery: currentSearchQuery ?? searchString,
            }}
            systemFilterPresets={viewConfig.systemFilterPresets}
          />
        )}
        {searchConfig && (
          <div className="flex max-w-120 shrink-0 items-stretch md:min-w-96">
            <div
              className={cn(
                "border-input bg-background flex h-8 flex-1 items-center border pl-2",
                showSearchTypeSelector
                  ? "rounded-l-md rounded-r-none border-r-0"
                  : "rounded-l-md rounded-r-md",
              )}
            >
              <Button
                variant="ghost"
                size="icon"
                className="mr-1"
                onClick={() => {
                  capture("table:search_submit");
                  submitSearch(searchString);
                }}
              >
                <Search className="h-4 w-4" />
              </Button>
              <Input
                autoFocus
                placeholder={
                  searchConfig.tableAllowsFullTextSearch
                    ? "Search..."
                    : `Search (${searchConfig.metadataSearchFields?.join(", ")})`
                }
                value={searchString}
                onChange={(event) => {
                  const newValue = event.currentTarget.value;
                  setSearchString(newValue);
                  // If user cleared the search, update URL immediately
                  if (newValue === "") {
                    submitSearch("");
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    capture("table:search_submit");
                    submitSearch(searchString);
                  }
                }}
                className="w-full border-none bg-transparent px-0 py-2 text-sm focus-visible:ring-0 focus-visible:outline-hidden"
              />
            </div>
            {showSearchTypeSelector && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="default"
                    className="flex w-30 items-center justify-between gap-1 rounded-l-none border-l-0"
                  >
                    <span
                      className="flex items-center gap-1 truncate"
                      title={searchButtonLabel}
                    >
                      {searchButtonLabel}
                      <DocPopup
                        description={getSearchDescription(
                          searchConfig.searchType,
                          searchConfig.metadataSearchFields,
                          searchConfig.hidePerformanceWarning,
                          searchConfig.tableAllowsFullTextSearch,
                        )}
                      />
                    </span>
                    <ChevronDown className="h-4 w-4 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
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
                      searchConfig.setSearchType?.(searchModeToType(value));
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
                          {/* Only show options that are explicitly available */}
                          {(searchConfig.availableSearchTypes === undefined ||
                            searchConfig.availableSearchTypes.content) && (
                            <DropdownMenuRadioItem value="metadata_fulltext">
                              Input/Output
                            </DropdownMenuRadioItem>
                          )}
                          {(searchConfig.availableSearchTypes === undefined ||
                            searchConfig.availableSearchTypes.input) && (
                            <DropdownMenuRadioItem value="metadata_fulltext_input">
                              Input
                            </DropdownMenuRadioItem>
                          )}
                          {(searchConfig.availableSearchTypes === undefined ||
                            searchConfig.availableSearchTypes.output) && (
                            <DropdownMenuRadioItem value="metadata_fulltext_output">
                              Output
                            </DropdownMenuRadioItem>
                          )}
                        </DropdownMenuRadioGroup>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )}
        {viewModeToggle}
        {timeRange && setTimeRange && (
          <TimeRangePicker
            timeRange={timeRange}
            onTimeRangeChange={setTimeRange}
            timeRangePresets={TABLE_AGGREGATION_OPTIONS}
            className="my-0 max-w-full overflow-x-auto"
          />
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
          <PopoverFilterBuilder
            columns={filterColumnDefinition}
            filterState={filterState}
            onChange={setFilterState}
            columnsWithCustomSelect={columnsWithCustomSelect}
            filterWithAI={filterWithAI}
            // Analytics (LFE-10781): the table's own identity, so popover
            // filters:applied/cleared events aren't mislabeled "unknown". Prefer
            // an explicit `tableName` (tables without a viewConfig — users,
            // dataset runs/items), else the view's table. The v4 events table
            // filters via the grammar bar (it omits filterColumnDefinition here,
            // so this popover is a v3/legacy surface); derive isV4 from the
            // ObservationsEvents view for consistency + future-proofing.
            tableName={tableName ?? viewConfig?.tableName ?? "unknown"}
            isV4={
              viewConfig?.tableName ===
              TableViewPresetTableName.ObservationsEvents
            }
          />
        )}

        <div className="flex flex-row flex-wrap gap-2 pr-0.5 @3xl:ml-auto">
          {!!columnVisibility && !!setColumnVisibility && (
            <DataTableColumnVisibilityFilter
              columns={columns}
              columnVisibility={columnVisibility}
              setColumnVisibility={setColumnVisibility}
              columnOrder={columnOrder}
              setColumnOrder={setColumnOrder}
            />
          )}
          {!!rowHeight && !!setRowHeight && (
            <DataTableRowHeightSwitch
              rowHeight={rowHeight}
              setRowHeight={setRowHeight}
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
