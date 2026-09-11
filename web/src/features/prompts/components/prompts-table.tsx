import { useEffect, useMemo } from "react";
import {
  normalizeOrderByForTable,
  TableViewPresetTableName,
} from "@langfuse/shared";
import { DataTable } from "@/src/components/table/data-table";
import {
  DataTableControlsProvider,
  DataTableControls,
} from "@/src/components/table/data-table-controls";
import { ResizableFilterLayout } from "@/src/components/table/resizable-filter-layout";
import { TextLink } from "@/src/components/design-system/TextLink/TextLink";
import { createFolderKeyTableColumn } from "@/src/components/design-system/table/columns/createFolderKeyTableColumn";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { useDetailPageLists } from "@/src/features/navigate-detail-pages/context";
import { DeletePrompt } from "@/src/features/prompts/components/delete-prompt";
import { DeleteFolder } from "@/src/features/prompts/components/delete-folder";
import { DuplicateFolder } from "@/src/features/prompts/components/duplicate-folder";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { api } from "@/src/utils/api";
import { type RouterOutput } from "@/src/utils/types";
import { TagPromptPopover } from "@/src/features/tag/components/TagPromptPopover";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import {
  promptFilterConfig,
  useQueryFilterState,
  useSidebarFilterState,
} from "@/src/features/filters";
import { useOrderByState } from "@/src/features/orderBy/hooks/useOrderByState";
import { joinTableCoreAndMetrics } from "@/src/components/table/utils/joinTableCoreAndMetrics";
import { Skeleton } from "@/src/components/ui/skeleton";
import { useFullTextSearch } from "@/src/components/table/use-cases/useFullTextSearch";
import { useFolderPagination } from "@/src/features/folders/hooks/useFolderPagination";
import { buildFullPath } from "@/src/features/folders/utils";
import { FolderBreadcrumb } from "@/src/features/folders/components/FolderBreadcrumb";
import { createDateTableColumn } from "@/src/components/design-system/table/columns/createDateTableColumn";
import { createNumberTableColumn } from "@/src/components/design-system/table/columns/createNumberTableColumn";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";

import {
  useColumnOrder,
  useColumnVisibility,
} from "@/src/features/column-visibility";
import { useTableViewManager } from "@/src/components/table/table-view-presets/hooks/useTableViewManager";
import { useTableViewFilterChange } from "@/src/components/table/table-view-presets/hooks/useTableViewFilterChange";
import { TableSearchBar } from "@/src/features/search-bar/components/TableSearchBar";
import { SearchScopeSelect } from "@/src/components/table/SearchScopeSelect";
import { toObservedOptions } from "@/src/features/search-bar/lib/observed-options";
import { PROMPTS_FIELD_REGISTRY } from "@/src/features/prompts/constants/promptsSearchRegistry";

type PromptTableRow = {
  id: string;
  name: string;
  fullPath: string; // used for navigation/API calls
  type: "folder" | "text" | "chat";
  version?: number;
  createdAt?: Date;
  labels?: string[];
  numberOfObservations?: number;
  tags?: string[];
};

function createRow(
  data: Partial<PromptTableRow> & {
    id: string;
    name: string;
    fullPath: string;
    type: "folder" | "text" | "chat";
  },
): PromptTableRow {
  return {
    version: undefined,
    createdAt: undefined,
    labels: [],
    tags: [],
    numberOfObservations: undefined,
    ...data,
  };
}

export function PromptTable() {
  const projectId = useProjectIdFromURL() ?? "";
  const { setDetailPageList } = useDetailPageLists();
  const promptMetricsTimeWindow = useMemo(() => {
    const today = new Date();

    const fromTimestamp = new Date(today);
    fromTimestamp.setDate(fromTimestamp.getDate() - 7);
    fromTimestamp.setHours(0, 0, 0, 0);

    const toTimestamp = today;

    return { fromTimestamp, toTimestamp };
  }, []);

  const [filterState] = useQueryFilterState([], "prompts", projectId);

  const [orderByState, setOrderByState] = useOrderByState({
    column: "createdAt",
    order: "DESC",
  });
  const orderBy = normalizeOrderByForTable({
    orderBy: orderByState,
    expectedTimeColumn: "createdAt",
  });

  const {
    paginationState,
    currentFolderPath,
    navigateToFolder,
    resetPaginationAndFolder,
    setPaginationAndFolderState,
  } = useFolderPagination();

  const { searchQuery, searchType, setSearchQuery, setSearchType } =
    useFullTextSearch();

  // Reset pagination when search query changes
  useEffect(() => {
    resetPaginationAndFolder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  const prompts = api.prompts.all.useQuery(
    {
      page: paginationState.pageIndex,
      limit: paginationState.pageSize,
      projectId,
      filter: filterState,
      orderBy,
      pathPrefix: currentFolderPath,
      searchQuery: searchQuery || undefined,
      searchType: searchType,
    },
    {
      enabled: Boolean(projectId),
      trpc: {
        context: {
          skipBatch: true,
        },
      },
    },
  );
  const promptMetrics = api.prompts.metrics.useQuery(
    {
      projectId,
      promptNames:
        prompts.data?.prompts.map((p) =>
          buildFullPath(currentFolderPath, p.name),
        ) ?? [],
      ...promptMetricsTimeWindow,
    },
    {
      enabled:
        Boolean(projectId) && prompts.data && prompts.data.totalCount > 0,
      trpc: {
        context: {
          skipBatch: true,
        },
      },
    },
  );
  type CoreOutput = RouterOutput["prompts"]["all"]["prompts"][number];
  type MetricsOutput = RouterOutput["prompts"]["metrics"][number];

  type CoreType = Omit<CoreOutput, "name"> & { id: string };
  type MetricType = Omit<MetricsOutput, "promptName"> & { id: string };

  const promptsRowData = joinTableCoreAndMetrics<CoreType, MetricType>(
    prompts.data?.prompts.map((p) => ({
      ...p,
      id: buildFullPath(currentFolderPath, p.name),
    })),
    promptMetrics.data?.map((pm) => ({
      ...pm,
      id: pm.promptName,
    })),
  );

  // Backend returns folder representatives with row_type metadata
  const processedRowData = useMemo(() => {
    if (!promptsRowData.rows) return { ...promptsRowData, rows: [] };

    const combinedRows: PromptTableRow[] = [];

    for (const prompt of promptsRowData.rows) {
      const isFolder = prompt.row_type === "folder";
      const fullPath = prompt.id; // id now contains the full path (used for metrics join)
      // Extract just the name portion (last segment) for display
      const itemName = fullPath.split("/").pop() ?? fullPath;
      const type =
        isFolder || prompt.type === "folder"
          ? "folder"
          : prompt.type === "chat"
            ? "chat"
            : "text";

      combinedRows.push(
        createRow({
          id: `${type}-${fullPath}`, // Unique ID for React keys
          name: itemName,
          fullPath,
          type,
          ...(isFolder
            ? {}
            : {
                version: prompt.version,
                createdAt: prompt.createdAt,
                labels: prompt.labels,
                tags: prompt.tags,
                numberOfObservations: Number(prompt.observationCount ?? 0),
              }),
        }),
      );
    }

    return {
      ...promptsRowData,
      rows: combinedRows,
    };
  }, [promptsRowData]);

  const promptFilterOptions = api.prompts.filterOptions.useQuery(
    {
      projectId,
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: Infinity,
    },
  );
  const filterOptionTags = promptFilterOptions.data?.tags ?? [];
  const allTags = filterOptionTags.map((t) => t.value);
  const totalCount = prompts.data?.totalCount ?? null;

  const newFilterOptions = useMemo(
    () => ({
      type: ["text", "chat"],
      labels:
        promptFilterOptions.data?.labels?.map((l) => {
          return {
            value: l.value,
            count:
              "count" in l && l.count !== undefined
                ? Number(l.count)
                : undefined,
          };
        }) ?? undefined,
      tags:
        promptFilterOptions.data?.tags?.map((t) => {
          return {
            value: t.value,
            count:
              "count" in t && t.count !== undefined
                ? Number(t.count)
                : undefined,
          };
        }) ?? undefined,
      version: [],
    }),
    [promptFilterOptions.data],
  );

  const { viewControllersRef, onExplicitFilterStateChange } =
    useTableViewFilterChange();
  const queryFilter = useSidebarFilterState(
    promptFilterConfig,
    newFilterOptions,
    {
      onExplicitFilterStateChange,
      loading: promptFilterOptions.isPending,
      stateLocation: "urlAndSessionStorage",
      sessionFilterContextId: projectId ?? null,
    },
  );

  useEffect(() => {
    if (prompts.isSuccess) {
      setDetailPageList(
        "prompts",
        prompts.data.prompts.map((t) => ({ id: t.name })),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompts.isSuccess, prompts.data]);

  const promptColumns: LangfuseColumnDef<PromptTableRow>[] = [
    createFolderKeyTableColumn<PromptTableRow>({
      accessorKey: "name",
      header: "Name",
      enableSorting: true,
      size: 250,
      getCell: (name, { row }) => {
        if (!name) return undefined;
        const rowData = row.original;

        if (rowData.type === "folder") {
          return {
            type: "folder",
            name,
            onClick: () => navigateToFolder(rowData.fullPath),
          };
        }

        return {
          type: "link",
          props: {
            path: `/project/${projectId}/prompts/${encodeURIComponent(rowData.fullPath)}`,
            value: name,
            title: rowData.fullPath,
          },
        };
      },
    }),
    createNumberTableColumn<PromptTableRow>({
      accessorKey: "version",
      header: "Versions",
      enableSorting: true,
      size: 70,
      formatter: (value) => String(value),
      getValue: (value, { row }) => {
        if (row.original.type === "folder") return undefined;
        return value ?? undefined;
      },
    }),
    createTextTableColumn<PromptTableRow>({
      accessorKey: "type",
      header: "Type",
      enableSorting: true,
      size: 60,
    }),
    createDateTableColumn({
      accessorKey: "createdAt",
      header: "Latest Version Created At",
      enableSorting: true,
      size: 200,
      getValue: (value, context) => {
        if (context.row.original.type === "folder") {
          return undefined;
        }

        return value ?? undefined;
      },
    }),
    {
      accessorKey: "numberOfObservations",
      header: "Number of Observations (7d)",
      id: "numberOfObservations",
      size: 170,
      cell: ({ getValue, row }) => {
        if (row.original.type === "folder") return null;

        const numberOfObservations = getValue<number | undefined>();
        const promptPath = row.original.fullPath;
        const filter = encodeURIComponent(
          `promptName;stringOptions;;any of;${promptPath}`,
        );
        if (!promptMetrics.isSuccess) {
          return <Skeleton className="h-3 w-1/2" />;
        }
        const displayValue = numberOfObservations?.toLocaleString() ?? "";
        return (
          <TextLink
            path={`/project/${projectId}/observations?filter=${numberOfObservations ? filter : ""}`}
            value={displayValue}
            title={displayValue}
          />
        );
      },
    },
    {
      accessorKey: "tags",
      header: "Tags",
      id: "tags",
      enableSorting: true,
      size: 120,
      cell: ({ getValue, row }) => {
        // height h-6 to ensure consistent row height for normal & folder rows
        if (row.original.type === "folder") return <div className="h-6" />;

        const tags = getValue<string[] | undefined>();
        const promptPath = row.original.fullPath;
        return (
          <TagPromptPopover
            tags={tags ?? []}
            availableTags={allTags}
            projectId={projectId}
            promptName={promptPath}
            promptsFilter={{
              page: 0,
              limit: 50,
              projectId,
              filter: filterState,
              orderBy,
            }}
          />
        );
      },
      enableHiding: true,
    },
    {
      accessorKey: "id",
      id: "actions",
      header: "Actions",
      size: 70,
      enableSorting: false,
      cell: ({ row }) => {
        const rowData = row.original;
        if (rowData.type === "folder") {
          return (
            <div className="flex gap-1">
              <DuplicateFolder folderPath={rowData.fullPath} />
              <DeleteFolder folderPath={rowData.fullPath} />
            </div>
          );
        }

        const promptPath = rowData.fullPath;
        return <DeletePrompt promptName={promptPath} />;
      },
    },
  ];

  const [columnVisibility, setColumnVisibility] =
    useColumnVisibility<PromptTableRow>(
      "promptsColumnVisibility",
      promptColumns,
    );
  const [columnOrder, setColumnOrder] = useColumnOrder<PromptTableRow>(
    "promptsColumnOrder",
    promptColumns,
  );
  const { isLoading: isViewLoading, ...viewControllers } = useTableViewManager({
    tableName: TableViewPresetTableName.Prompts,
    projectId,
    stateUpdaters: {
      setColumnVisibility,
      setColumnOrder,
      setOrderBy: setOrderByState,
      setFilters: (filters) =>
        queryFilter.setFilterState(filters, { origin: "saved_view" }),
      setSearchQuery,
      setExpandedFilters: queryFilter.onExpandedChange,
    },
    validationContext: {
      columns: promptColumns,
      filterColumnDefinition: promptFilterConfig.columnDefinitions,
      expandableFilterColumns: promptFilterConfig.facets.map(
        (facet) => facet.column,
      ),
    },
    currentFilterState: queryFilter.explicitFilterState,
    currentExpandedFilters: queryFilter.expanded,
  });
  viewControllersRef.current = viewControllers;
  const handleSearchQueryChange = (query: string | null) => {
    viewControllers.handleUserStateChange(searchQuery ?? "", query ?? "");
    setSearchQuery(query);
  };
  const handleSearchTypeChange = (next: typeof searchType) => {
    viewControllers.handleUserStateChange(searchType, next);
    setSearchType(next);
  };
  const handleColumnOrderChange: typeof setColumnOrder = (next) => {
    const value = typeof next === "function" ? next(columnOrder) : next;
    viewControllers.handleUserStateChange(columnOrder, value);
    setColumnOrder(value);
  };
  const handleColumnVisibilityChange: typeof setColumnVisibility = (next) => {
    const value = typeof next === "function" ? next(columnVisibility) : next;
    viewControllers.handleUserStateChange(columnVisibility, value);
    setColumnVisibility(value);
  };

  return (
    <DataTableControlsProvider
      tableName={promptFilterConfig.tableName}
      defaultSidebarCollapsed={promptFilterConfig.defaultSidebarCollapsed}
    >
      <div className="flex h-full w-full flex-col">
        {/* Toolbar spanning full width */}
        {currentFolderPath && (
          <FolderBreadcrumb
            currentFolderPath={currentFolderPath}
            navigateToFolder={navigateToFolder}
          />
        )}
        <TableSearchBar
          key={`${projectId}:${viewControllers.filterEditorResetKey}:${queryFilter.draftResetKey}`}
          projectId={projectId}
          tableName="prompts"
          registry={PROMPTS_FIELD_REGISTRY}
          filterState={queryFilter.searchBarFilterState}
          setFilterState={queryFilter.setFilterState}
          observed={toObservedOptions(
            newFilterOptions,
            promptFilterOptions.isPending,
          )}
          isV4={false}
          search={{
            query: searchQuery,
            type: searchType,
            setQuery: handleSearchQueryChange,
          }}
          searchScope={
            <SearchScopeSelect
              searchType={searchType}
              setSearchType={handleSearchTypeChange}
              metadataLabel="Names, Tags"
              fullTextLabel="Full Text"
              availableSearchTypes={{
                content: true,
                input: false,
                output: false,
              }}
            />
          }
        />
        <DataTableToolbar
          tableName="prompts"
          columns={promptColumns}
          filterState={queryFilter.filterState}
          columnsWithCustomSelect={["labels", "tags"]}
          isV4={false}
          currentSearchQuery={searchQuery ?? ""}
          orderByState={orderBy}
          columnOrder={columnOrder}
          setColumnOrder={handleColumnOrderChange}
          columnVisibility={columnVisibility}
          setColumnVisibility={handleColumnVisibilityChange}
          viewConfig={{
            tableName: TableViewPresetTableName.Prompts,
            projectId,
            controllers: viewControllers,
          }}
        />

        {/* Content area with sidebar and table */}
        <ResizableFilterLayout>
          <DataTableControls
            key={viewControllers.filterEditorResetKey}
            queryFilter={queryFilter}
          />

          <div className="flex flex-1 flex-col overflow-hidden">
            <DataTable
              tableName="prompts"
              columns={promptColumns}
              data={
                prompts.isLoading || isViewLoading
                  ? { isLoading: true, isError: false }
                  : prompts.isError
                    ? {
                        isLoading: false,
                        isError: true,
                        error: prompts.error.message,
                      }
                    : {
                        isLoading: false,
                        isError: false,
                        data: processedRowData.rows?.map((item) => ({
                          id: item.id,
                          name: item.name,
                          fullPath: item.fullPath,
                          version: item.version,
                          createdAt: item.createdAt,
                          type: item.type,
                          labels: item.labels,
                          numberOfObservations: item.numberOfObservations,
                          tags: item.tags,
                        })),
                      }
              }
              orderBy={orderBy}
              setOrderBy={(next) => {
                viewControllers.handleUserStateChange(orderByState, next);
                setOrderByState(next);
              }}
              columnOrder={columnOrder}
              onColumnOrderChange={handleColumnOrderChange}
              columnVisibility={columnVisibility}
              onColumnVisibilityChange={handleColumnVisibilityChange}
              pagination={{
                totalCount,
                onChange: setPaginationAndFolderState,
                state: paginationState,
              }}
              cellPadding="comfortable"
            />
          </div>
        </ResizableFilterLayout>
      </div>
    </DataTableControlsProvider>
  );
}
