import { useEffect, useMemo } from "react";
import { DataTable } from "@/src/components/table/data-table";
import {
  DataTableControlsProvider,
  DataTableControls,
} from "@/src/components/table/data-table-controls";
import { ResizableFilterLayout } from "@/src/components/table/resizable-filter-layout";
import TableLink from "@/src/components/table/table-link";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { useDetailPageLists } from "@/src/features/navigate-detail-pages/context";
import { DeletePrompt } from "@/src/features/prompts/components/delete-prompt";
import { DeleteFolder } from "@/src/features/prompts/components/delete-folder";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { api } from "@/src/utils/api";
import { type RouterOutput } from "@/src/utils/types";
import { TagPromptPopover } from "@/src/features/tag/components/TagPromptPopover";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import { useQueryFilterState } from "@/src/features/filters/hooks/useFilterState";
import { useSidebarFilterState } from "@/src/features/filters/hooks/useSidebarFilterState";
import { promptFilterConfig } from "@/src/features/filters/config/prompts-config";
import { useOrderByState } from "@/src/features/orderBy/hooks/useOrderByState";
import { createColumnHelper } from "@tanstack/react-table";
import { joinTableCoreAndMetrics } from "@/src/components/table/utils/joinTableCoreAndMetrics";
import { Skeleton } from "@/src/components/ui/skeleton";
import { useDebounce } from "@/src/hooks/useDebounce";
import { LocalIsoDate } from "@/src/components/LocalIsoDate";
import { useFullTextSearch } from "@/src/components/table/use-cases/useFullTextSearch";
import { useFolderPagination } from "@/src/features/folders/hooks/useFolderPagination";
import { buildFullPath } from "@/src/features/folders/utils";
import { FolderBreadcrumb } from "@/src/features/folders/components/FolderBreadcrumb";
import { FolderBreadcrumbLink } from "@/src/features/folders/components/FolderBreadcrumbLink";

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
  const projectId = useProjectIdFromURL();
  const { setDetailPageList } = useDetailPageLists();

  const [filterState] = useQueryFilterState([], "prompts", projectId);

  const [orderByState, setOrderByState] = useOrderByState({
    column: "createdAt",
    order: "DESC",
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
      projectId: projectId as string, // Typecast as query is enabled only when projectId is present
      filter: filterState,
      orderBy: orderByState,
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
      projectId: projectId as string,
      promptNames:
        prompts.data?.prompts.map((p) =>
          buildFullPath(currentFolderPath, p.name),
        ) ?? [],
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
      const isFolder = (prompt as { row_type?: string }).row_type === "folder";
      const fullPath = prompt.id; // id now contains the full path (used for metrics join)
      // Extract just the name portion (last segment) for display
      const itemName = fullPath.split("/").pop() ?? fullPath;
      const type = isFolder ? "folder" : (prompt.type as "text" | "chat");

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
      projectId: projectId as string,
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
          // API type says { value: string }[], but for some items, there is an optional count
          const item = l as { value: string; count?: number };
          return {
            value: item.value,
            count: item.count !== undefined ? Number(item.count) : undefined,
          };
        }) ?? undefined,
      tags:
        promptFilterOptions.data?.tags?.map((t) => {
          // API type says { value: string }[], but for some items, there is an optional count
          const item = t as { value: string; count?: number };
          return {
            value: item.value,
            count: item.count !== undefined ? Number(item.count) : undefined,
          };
        }) ?? undefined,
      version: [],
    }),
    [promptFilterOptions.data],
  );

  const queryFilter = useSidebarFilterState(
    promptFilterConfig,
    newFilterOptions,
    projectId,
    promptFilterOptions.isPending,
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

  const columnHelper = createColumnHelper<PromptTableRow>();
  const promptColumns = [
    columnHelper.accessor("name", {
      header: "Name",
      id: "name",
      enableSorting: true,
      size: 250,
      cell: (row) => {
        const name = row.getValue();
        const rowData = row.row.original;

        if (rowData.type === "folder") {
          return (
            <FolderBreadcrumbLink
              name={name}
              onClick={() => navigateToFolder(rowData.fullPath)}
            />
          );
        }

        return name ? (
          <TableLink
            path={`/project/${projectId}/prompts/${encodeURIComponent(rowData.fullPath)}`}
            value={name}
            title={rowData.fullPath} // Show full prompt path on hover
          />
        ) : undefined;
      },
    }),
    columnHelper.accessor("version", {
      header: "Versions",
      id: "version",
      enableSorting: true,
      size: 70,
      cell: (row) => {
        if (row.row.original.type === "folder") return null;
        return row.getValue();
      },
    }),
    columnHelper.accessor("type", {
      header: "Type",
      id: "type",
      enableSorting: true,
      size: 60,
      cell: (row) => {
        return row.getValue();
      },
    }),
    columnHelper.accessor("createdAt", {
      header: "Latest Version Created At",
      id: "createdAt",
      enableSorting: true,
      size: 200,
      cell: (row) => {
        if (row.row.original.type === "folder") return null;
        const createdAt = row.getValue();
        return createdAt ? <LocalIsoDate date={createdAt} /> : null;
      },
    }),
    columnHelper.accessor("numberOfObservations", {
      header: "Number of Observations",
      size: 170,
      cell: (row) => {
        if (row.row.original.type === "folder") return null;

        const numberOfObservations = row.getValue();
        const promptPath = row.row.original.fullPath;
        const filter = encodeURIComponent(
          `promptName;stringOptions;;any of;${promptPath}`,
        );
        if (!promptMetrics.isSuccess) {
          return <Skeleton className="h-3 w-1/2" />;
        }
        return (
          <TableLink
            path={`/project/${projectId}/observations?filter=${numberOfObservations ? filter : ""}`}
            value={numberOfObservations?.toLocaleString() ?? ""}
          />
        );
      },
    }),
    columnHelper.accessor("tags", {
      header: "Tags",
      id: "tags",
      enableSorting: true,
      size: 120,
      cell: (row) => {
        // height h-6 to ensure consistent row height for normal & folder rows
        if (row.row.original.type === "folder") return <div className="h-6" />;

        const tags = row.getValue();
        const promptPath = row.row.original.fullPath;
        return (
          <TagPromptPopover
            tags={tags ?? []}
            availableTags={allTags}
            projectId={projectId as string}
            promptName={promptPath}
            promptsFilter={{
              page: 0,
              limit: 50,
              projectId: projectId as string,
              filter: filterState,
              orderBy: orderByState,
            }}
          />
        );
      },
      enableHiding: true,
    }),
    columnHelper.display({
      id: "actions",
      header: "Actions",
      size: 70,
      cell: (row) => {
        const rowData = row.row.original;
        if (rowData.type === "folder") {
          return <DeleteFolder folderPath={rowData.fullPath} />;
        }

        const promptPath = rowData.fullPath;
        return <DeletePrompt promptName={promptPath} />;
      },
    }),
  ] as LangfuseColumnDef<PromptTableRow>[];

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
        <DataTableToolbar
          columns={promptColumns}
          filterState={queryFilter.filterState}
          columnsWithCustomSelect={["labels", "tags"]}
          searchConfig={{
            metadataSearchFields: ["Name", "Tags", "Content"],
            updateQuery: useDebounce(setSearchQuery, 300),
            currentQuery: searchQuery ?? undefined,
            tableAllowsFullTextSearch: true,
            setSearchType,
            searchType,
            customDropdownLabels: {
              metadata: "Names, Tags",
              fullText: "Full Text",
            },
            hidePerformanceWarning: true,
          }}
        />

        {/* Content area with sidebar and table */}
        <ResizableFilterLayout>
          <DataTableControls queryFilter={queryFilter} />

          <div className="flex flex-1 flex-col overflow-hidden">
            <DataTable
              tableName={"prompts"}
              columns={promptColumns}
              data={
                prompts.isLoading
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
              orderBy={orderByState}
              setOrderBy={setOrderByState}
              pagination={{
                totalCount,
                onChange: setPaginationAndFolderState,
                state: paginationState,
              }}
            />
          </div>
        </ResizableFilterLayout>
      </div>
    </DataTableControlsProvider>
  );
}
