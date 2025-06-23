import { useEffect, useMemo } from "react";
import { DataTable } from "@/src/components/table/data-table";
import TableLink from "@/src/components/table/table-link";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { useDetailPageLists } from "@/src/features/navigate-detail-pages/context";
import { DeletePrompt } from "@/src/features/prompts/components/delete-prompt";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { api } from "@/src/utils/api";
import { type RouterOutput } from "@/src/utils/types";
import { TagPromptPopover } from "@/src/features/tag/components/TagPromptPopover";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import { useQueryFilterState } from "@/src/features/filters/hooks/useFilterState";
import { useOrderByState } from "@/src/features/orderBy/hooks/useOrderByState";
import { promptsTableColsWithOptions } from "@/src/server/api/definitions/promptsTable";
import { NumberParam, StringParam, useQueryParams, withDefault } from "use-query-params";
import { createColumnHelper } from "@tanstack/react-table";
import { joinTableCoreAndMetrics } from "@/src/components/table/utils/joinTableCoreAndMetrics";
import { Skeleton } from "@/src/components/ui/skeleton";
import { useDebounce } from "@/src/hooks/useDebounce";
import { LocalIsoDate } from "@/src/components/LocalIsoDate";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/src/components/ui/breadcrumb";
import { Slash, Folder, Home } from "lucide-react";

type PromptTableRow = {
  id: string;
  name: string;
  type: "folder" | "text" | "chat";
  version?: number;
  createdAt?: Date;
  labels?: string[];
  numberOfObservations?: number;
  tags?: string[];
};

function createRow(
  data: Partial<PromptTableRow> & { id: string; name: string; type: "folder" | "text" | "chat" }
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

function isFolder(row: PromptTableRow): row is PromptTableRow & { type: "folder" } {
  return row.type === "folder";
}

function getDisplayName(fullPath: string, currentFolderPath: string): string {
  return currentFolderPath === ''
    ? fullPath
    : fullPath.substring(currentFolderPath.length + 1);
}

function createBreadcrumbItems(currentFolderPath: string) {
  if (!currentFolderPath) return [];

  const segments = currentFolderPath.split('/');
  return segments.map((name, i) => {
    const folderPath = segments.slice(0, i + 1).join('/');
    return {
      name,
      folderPath,
    };
  });
}

export function PromptTable() {
  const projectId = useProjectIdFromURL();
  const { setDetailPageList } = useDetailPageLists();

  const [filterState, setFilterState] = useQueryFilterState(
    [],
    "prompts",
    projectId,
  );

  const [orderByState, setOrderByState] = useOrderByState({
    column: "createdAt",
    order: "DESC",
  });
  const [queryParams, setQueryParams] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 50),
    folder: StringParam,
  });

  const paginationState = {
    pageIndex: queryParams.pageIndex,
    pageSize: queryParams.pageSize,
  };

  const currentFolderPath = queryParams.folder || '';

  const prompts = api.prompts.all.useQuery(
    {
      page: paginationState.pageIndex,
      limit: paginationState.pageSize,
      projectId: projectId as string, // Typecast as query is enabled only when projectId is present
      filter: filterState,
      orderBy: orderByState,
      pathPrefix: currentFolderPath,
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
      promptNames: prompts.data?.prompts.map((p) => p.name) ?? [],
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
      id: p.name,
    })),
    promptMetrics.data?.map((pm) => ({
      ...pm,
      id: pm.promptName,
    })),
  );

  // Filter and group prompts based on current folder path
  const processedRowData = useMemo(() => {
    if (!promptsRowData.rows) return { ...promptsRowData, rows: [] };

    const uniqueFolders = new Set<string>();
    const matchingPrompts: typeof promptsRowData.rows = [];

    // Identify immediate subfolders from backend-filtered prompts
    for (const prompt of promptsRowData.rows) {
      const promptName = prompt.id;

      if (currentFolderPath) {
        const prefix = `${currentFolderPath}/`;
        if (promptName.startsWith(prefix)) {
          const remainingPath = promptName.substring(prefix.length);
          const slashIndex = remainingPath.indexOf('/');

          if (slashIndex > 0) {
            // Subfolder
            const subFolderName = remainingPath.substring(0, slashIndex);
            const fullSubFolderPath = `${currentFolderPath}/${subFolderName}`;
            uniqueFolders.add(fullSubFolderPath);
          } else {
            // Direct prompt in current folder
            matchingPrompts.push(prompt);
          }
        }
      } else {
        // Root level
        const slashIndex = promptName.indexOf('/');
        if (slashIndex > 0) {
          const folderName = promptName.substring(0, slashIndex);
          uniqueFolders.add(folderName);
        } else {
          matchingPrompts.push(prompt);
        }
      }
    }

    // Create combined rows: folders first, then prompts
    const combinedRows: PromptTableRow[] = [];

    // Add folder rows
    for (const folderPath of uniqueFolders) {
      const folderName = getDisplayName(folderPath, currentFolderPath);
      combinedRows.push(createRow({
        id: folderPath,
        name: folderName,
        type: "folder",
      }));
    }

    // Add matching prompts
    for (const prompt of matchingPrompts) {
      combinedRows.push(
        createRow({
          id: prompt.id,
          name: prompt.id,
          type: prompt.type as "text" | "chat",
          version: prompt.version,
          createdAt: prompt.createdAt,
          labels: prompt.labels,
          tags: prompt.tags,
          numberOfObservations: Number(prompt.observationCount ?? 0),
        })
      );
    }

    return {
      ...promptsRowData,
      rows: combinedRows,
    };
  }, [promptsRowData, currentFolderPath]);

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

        if (isFolder(rowData)) {
          const displayName = getDisplayName(rowData.id, currentFolderPath);
          return (
            <TableLink
              path={""}
              value={displayName} // To satisfy table-link, fallback
              className="flex items-center gap-2"
              icon={
                <>
                  <Folder className="h-4 w-4" />
                  {displayName}
                </>
              }
              onClick={() => {
                setQueryParams({
                  folder: rowData.id,
                  pageIndex: 0,
                  pageSize: queryParams.pageSize
                });
              }}
              title={displayName || ""}
            />
          );
        }

        return name ? (
          <TableLink
            path={`/project/${projectId}/prompts/${encodeURIComponent(rowData.id)}`}
            value={name}
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
        if (isFolder(row.row.original)) return null;
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
        if (isFolder(row.row.original)) return null;
        const createdAt = row.getValue();
        return createdAt ? <LocalIsoDate date={createdAt} /> : null;
      },
    }),
    columnHelper.accessor("numberOfObservations", {
      header: "Number of Observations",
      size: 170,
      cell: (row) => {
        if (isFolder(row.row.original)) return null;

        const numberOfObservations = row.getValue();
        const promptId = row.row.original.id;
        const filter = encodeURIComponent(
          `promptName;stringOptions;;any of;${promptId}`,
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
        if (isFolder(row.row.original)) return <div className="h-6" />;

        const tags = row.getValue();
        const promptId = row.row.original.id;
        return (
          <TagPromptPopover
            tags={tags ?? []}
            availableTags={allTags}
            projectId={projectId as string}
            promptName={promptId}
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
        if (isFolder(row.row.original)) return null;

        const promptId = row.row.original.id;
        return <DeletePrompt promptName={promptId} />;
      },
    }),
  ] as LangfuseColumnDef<PromptTableRow>[];

  return (
    <>
      {currentFolderPath && (
        <div className="pt-2 ml-2">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink
                  className="cursor-pointer hover:underline"
                  onClick={() => {
                    setQueryParams({
                      folder: undefined,
                      pageIndex: 0,
                      pageSize: queryParams.pageSize
                    });
                  }}
                >
                  <Home className="h-4 w-4" />
                </BreadcrumbLink>
              </BreadcrumbItem>
              {createBreadcrumbItems(currentFolderPath).flatMap((item, index, array) => [
                index > 0 && (
                  <BreadcrumbSeparator key={`sep-${item.folderPath}`}>
                    <Slash />
                  </BreadcrumbSeparator>
                ),
                <BreadcrumbItem key={item.folderPath}>
                  {index === array.length - 1 ? (
                    <BreadcrumbPage>{item.name}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink
                      className="cursor-pointer hover:underline"
                      onClick={() => {
                        setQueryParams({
                          folder: item.folderPath,
                          pageIndex: 0,
                          pageSize: queryParams.pageSize
                        });
                      }}
                    >
                      {item.name}
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
              ])}
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      )}
      <DataTableToolbar
        columns={promptColumns}
        filterColumnDefinition={promptsTableColsWithOptions(
          promptFilterOptions.data,
        )}
        filterState={filterState}
        setFilterState={useDebounce(setFilterState)}
        columnsWithCustomSelect={["labels", "tags"]}
      />
      <DataTable
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
                    name: item.type === 'folder'
                      ? item.name
                      : currentFolderPath
                        ? item.name.substring(currentFolderPath.length + 1)
                        : item.name,
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
          onChange: setQueryParams,
          state: paginationState,
        }}
      />
    </>
  );
}
