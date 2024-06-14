import { LockIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

import { DataTable } from "@/src/components/table/data-table";
import TableLink from "@/src/components/table/table-link";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { Button } from "@/src/components/ui/button";
import { useDetailPageLists } from "@/src/features/navigate-detail-pages/context";
import { DeletePrompt } from "@/src/features/prompts/components/delete-prompt";
import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";
import useProjectIdFromURL from "@/src/hooks/useProjectIdFromURL";
import { api } from "@/src/utils/api";
import { type RouterOutput } from "@/src/utils/types";
import { TagPromptPopover } from "@/src/features/tag/components/TagPromptPopover";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import { useQueryFilterState } from "@/src/features/filters/hooks/useFilterState";
import { useOrderByState } from "@/src/features/orderBy/hooks/useOrderByState";
import { promptsTableColsWithOptions } from "@/src/server/api/definitions/promptsTable";
import { NumberParam, useQueryParams, withDefault } from "use-query-params";
import { createColumnHelper } from "@tanstack/react-table";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { joinTableCoreAndMetrics } from "@/src/components/table/utils/joinTableCoreAndMetrics";
import { Skeleton } from "@/src/components/ui/skeleton";

type PromptTableRow = {
  name: string;
  version: number;
  createdAt: Date;
  labels: string[];
  type: string;
  numberOfObservations: number;
  tags: string[];
};

export function PromptTable() {
  const projectId = useProjectIdFromURL();
  const { setDetailPageList } = useDetailPageLists();

  const hasCUDAccess = useHasAccess({
    projectId,
    scope: "prompts:CUD",
  });

  const [filterState, setFilterState] = useQueryFilterState([], "prompts");

  const [orderByState, setOrderByState] = useOrderByState({
    column: "createdAt",
    order: "DESC",
  });
  const [paginationState, setPaginationState] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 50),
  });

  const prompts = api.prompts.all.useQuery(
    {
      page: paginationState.pageIndex,
      limit: paginationState.pageSize,
      projectId: projectId as string, // Typecast as query is enabled only when projectId is present
      filter: filterState,
      orderBy: orderByState,
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
    },
  );
  const filterOptionTags = promptFilterOptions.data?.tags ?? [];
  const allTags = filterOptionTags.map((t) => t.value);
  const capture = usePostHogClientCapture();
  const totalCount = prompts.data?.totalCount ?? 0;

  useEffect(() => {
    if (prompts.isSuccess) {
      setDetailPageList(
        "prompts",
        prompts.data.prompts.map((t) => t.name),
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
      cell: (row) => {
        const name = row.getValue();
        return name ? (
          <TableLink
            path={`/project/${projectId}/prompts/${encodeURIComponent(name)}`}
            value={name}
            truncateAt={50}
          />
        ) : undefined;
      },
    }),
    columnHelper.accessor("version", {
      header: "Latest Version",
      id: "version",
      enableSorting: true,
      cell: (row) => {
        return row.getValue();
      },
    }),
    columnHelper.accessor("type", {
      header: "Type",
      id: "type",
      enableSorting: true,
      cell: (row) => {
        return row.getValue();
      },
    }),
    columnHelper.accessor("createdAt", {
      header: "Latest Version Created At",
      id: "createdAt",
      enableSorting: true,
      cell: (row) => {
        const createdAt = row.getValue();
        return createdAt.toLocaleString();
      },
    }),
    columnHelper.accessor("numberOfObservations", {
      header: "Number of Generations",
      cell: (row) => {
        const numberOfObservations = row.getValue();
        const name = row.row.original.name;
        const filter = encodeURIComponent(
          `promptName;stringOptions;;any of;${name}`,
        );
        if (!promptMetrics.isSuccess) {
          return <Skeleton className="h-3 w-1/2" />;
        }
        return (
          <TableLink
            path={`/project/${projectId}/generations?filter=${numberOfObservations ? filter : ""}`}
            value={numberOfObservations.toLocaleString()}
          />
        );
      },
    }),
    columnHelper.accessor("tags", {
      header: "Tags",
      id: "tags",
      enableSorting: true,
      cell: (row) => {
        const tags = row.getValue();
        const promptName: string = row.row.original.name;
        return (
          <TagPromptPopover
            tags={tags}
            availableTags={allTags}
            projectId={projectId as string}
            promptName={promptName}
            promptsFilter={{
              ...filterOptionTags,
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
      cell: (row) => {
        const name = row.row.original.name;
        return <DeletePrompt promptName={name} />;
      },
    }),
  ] as LangfuseColumnDef<PromptTableRow>[];

  return (
    <div>
      <DataTableToolbar
        columns={promptColumns}
        filterColumnDefinition={promptsTableColsWithOptions(
          promptFilterOptions.data,
        )}
        filterState={filterState}
        setFilterState={setFilterState}
        actionButtons={
          <Link href={`/project/${projectId}/prompts/new`}>
            <Button
              variant="secondary"
              disabled={!hasCUDAccess}
              aria-label="Create New Prompt"
              onClick={() => {
                capture("prompts:new_form_open");
              }}
            >
              {hasCUDAccess ? (
                <PlusIcon className="-ml-0.5 mr-1.5" aria-hidden="true" />
              ) : (
                <LockIcon
                  className="-ml-0.5 mr-1.5 h-3 w-3"
                  aria-hidden="true"
                />
              )}
              New prompt
            </Button>
          </Link>
        }
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
                  data: promptsRowData.rows?.map((item) => ({
                    id: item.id,
                    name: item.id, // was renamed to id to match the core and metrics
                    version: item.version,
                    createdAt: item.createdAt,
                    type: item.type,
                    labels: item.labels,
                    numberOfObservations: Number(item.observationCount ?? 0),
                    tags: item.tags,
                  })),
                }
        }
        orderBy={orderByState}
        setOrderBy={setOrderByState}
        pagination={{
          pageCount: Math.ceil(totalCount / paginationState.pageSize),
          onChange: setPaginationState,
          state: paginationState,
        }}
      />
    </div>
  );
}
