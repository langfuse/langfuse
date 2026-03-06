import { Button } from "@/src/components/ui/button";
import React, { type Dispatch, type SetStateAction, useState } from "react";
import { Input } from "@/src/components/ui/input";
import { DataTableColumnVisibilityFilter } from "@/src/components/table/data-table-column-visibility-filter";
import { PopoverFilterBuilder } from "@/src/features/filters/components/filter-builder";
import {
  type FilterState,
  type ColumnDefinition,
  type OrderByState,
  type TableViewPresetDomain,
  type TableViewPresetTableName,
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
import {
  Search,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { Badge } from "@/src/components/ui/badge";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { TimeRangePicker } from "@/src/components/date-picker";
import {
  type TimeRange,
  TABLE_AGGREGATION_OPTIONS,
} from "@/src/utils/date-range-utils";
import { DataTableSelectAllBanner } from "@/src/components/table/data-table-multi-select-actions/data-table-select-all-banner";
import { cn } from "@/src/utils/tailwind";
import DocPopup from "@/src/components/layouts/doc-popup";
import { TableViewPresetsDrawer } from "@/src/components/table/table-view-presets/components/data-table-view-presets-drawer";
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
import { useDataTableControls } from "@/src/components/table/data-table-controls";
import { MultiSelect as MultiSelectFilter } from "@/src/features/filters/components/multi-select";
import {
  DataTableRefreshButton,
  type RefreshInterval,
} from "@/src/components/table/data-table-refresh-button";
import {
  getSearchButtonLabel,
  getSearchMode,
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
  applyViewState: (viewData: TableViewPresetDomain) => void;
  selectedViewId: string | null;
  handleSetViewId: (viewId: string | null) => void;
}

interface TableViewConfig {
  tableName: TableViewPresetTableName;
  projectId: string;
  controllers: TableViewControllers;
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
  filterWithAI?: boolean;
  className?: string;
  viewModeToggle?: React.ReactNode;
}

// Helper function to get the description for DocPopup
function getSearchDescription(
  searchType: TracingSearchType[] | undefined,
  metadataFields: string[] | undefined,
  hidePerformanceWarning: boolean | undefined,
): React.ReactNode {
  const fields = metadataFields?.join(", ") ?? "";
  const performanceWarning = !hidePerformanceWarning
    ? " For improved performance, please filter the table down."
    : "";

  if (!searchType || searchType.includes("id")) {
    if (searchType?.includes("content")) {
      return (
        <p className="text-xs font-normal text-primary">
          Searches in Input/Output and {fields}.{performanceWarning}
        </p>
      );
    }
    if (searchType?.includes("input")) {
      return (
        <p className="text-xs font-normal text-primary">
          Searches in Input and {fields}.{performanceWarning}
        </p>
      );
    }
    if (searchType?.includes("output")) {
      return (
        <p className="text-xs font-normal text-primary">
          Searches in Output and {fields}.{performanceWarning}
        </p>
      );
    }
  }
  return (
    <p className="text-xs font-normal text-primary">Searches in {fields}.</p>
  );
}

export function DataTableToolbar<TData, TValue>({
  columns,
  filterColumnDefinition,
  searchConfig,
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
  orderByState,
  viewConfig,
  filterWithAI = false,
  viewModeToggle,
}: DataTableToolbarProps<TData, TValue>) {
  const [searchString, setSearchString] = useState(
    searchConfig?.currentQuery ?? "",
  );

  const capture = usePostHogClientCapture();
  const { open: controlsPanelOpen, setOpen: setControlsPanelOpen } =
    useDataTableControls();

  // Only show the toggle button when we're using the new sidebar
  const hasNewSidebar = !filterColumnDefinition && filterState !== undefined;
  return (
    <div className={cn("grid h-fit w-full gap-0 px-2", className)}>
      <div className="my-2 flex flex-wrap items-center gap-2 @container">
        {hasNewSidebar && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setControlsPanelOpen(!controlsPanelOpen)}
            className="flex h-8 items-center gap-2 text-sm"
          >
            {controlsPanelOpen ? (
              <PanelLeftClose className="h-4 w-4" />
            ) : (
              <PanelLeftOpen className="h-4 w-4" />
            )}
            <span>{controlsPanelOpen ? "Hide" : "Show"} filters</span>
            {filterState && filterState.length > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                {filterState.length}
              </Badge>
            )}
          </Button>
        )}
        {searchConfig && (
          <div className="flex max-w-[30rem] flex-shrink-0 items-stretch md:min-w-[24rem]">
            <div
              className={cn(
                "flex h-8 flex-1 items-center border border-input bg-background pl-2",
                searchConfig.setSearchType
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
                  searchConfig.updateQuery(searchString);
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
                    searchConfig.updateQuery("");
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    capture("table:search_submit");
                    searchConfig.updateQuery(searchString);
                  }
                }}
                className="w-full border-none bg-transparent px-0 py-2 text-sm focus-visible:outline-none focus-visible:ring-0"
              />
            </div>
            {searchConfig.setSearchType && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="default"
                    className="w-30 flex items-center justify-between gap-1 rounded-l-none border-l-0"
                  >
                    <span className="flex items-center gap-1 truncate">
                      {getSearchButtonLabel(
                        searchConfig.searchType,
                        searchConfig.customDropdownLabels?.metadata,
                      )}
                      <DocPopup
                        description={getSearchDescription(
                          searchConfig.searchType,
                          searchConfig.metadataSearchFields,
                          searchConfig.hidePerformanceWarning,
                        )}
                      />
                    </span>
                    <ChevronDown className="h-4 w-4 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuRadioGroup
                    value={getSearchMode(searchConfig.searchType)}
                    onValueChange={(value) => {
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
                          {getSearchMode(searchConfig.searchType).startsWith(
                            "metadata_fulltext",
                          ) && (
                            <span className="h-2 w-2 shrink-0 rounded-full bg-current" />
                          )}
                          {searchConfig.customDropdownLabels?.fullText ??
                            "Full Text"}
                        </span>
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        <DropdownMenuRadioGroup
                          value={getSearchMode(searchConfig.searchType)}
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
          />
        )}

        <div className="flex flex-row flex-wrap gap-2 pr-0.5 @6xl:ml-auto">
          {!!columnVisibility && !!columnOrder && !!viewConfig && (
            <TableViewPresetsDrawer
              viewConfig={viewConfig}
              currentState={{
                orderBy: orderByState ?? null,
                filters: filterState ?? [],
                columnOrder,
                columnVisibility,
                searchQuery: searchString,
              }}
            />
          )}
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
      {multiSelect &&
        multiSelect.pageIndex === 0 &&
        multiSelect.selectedRowIds.length === multiSelect.pageSize && (
          <DataTableSelectAllBanner {...multiSelect} />
        )}
    </div>
  );
}
