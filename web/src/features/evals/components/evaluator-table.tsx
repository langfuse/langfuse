import { StatusBadge } from "@/src/components/layouts/status-badge";
import { LevelCountsDisplay } from "@/src/components/level-counts-display";
import { DataTable } from "@/src/components/table/data-table";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import {
  DataTableControlsProvider,
  DataTableControls,
} from "@/src/components/table/data-table-controls";
import { ResizableFilterLayout } from "@/src/components/table/resizable-filter-layout";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { InlineFilterState } from "@/src/features/filters/components/filter-builder";
import { useSidebarFilterState } from "@/src/features/filters/hooks/useSidebarFilterState";
import { evaluatorFilterConfig } from "@/src/features/filters/config/evaluators-config";
import { api } from "@/src/utils/api";
import { createColumnHelper } from "@tanstack/react-table";
import { useQueryParam, StringParam, withDefault } from "use-query-params";
import { usePaginationState } from "@/src/hooks/usePaginationState";
import { isEventTarget } from "@/src/features/evals/utils/typeHelpers";
import { useEvalCapabilities } from "@/src/features/evals/hooks/useEvalCapabilities";
import { useOrderByState } from "@/src/features/orderBy/hooks/useOrderByState";
import TableIdOrName from "@/src/components/table/table-id";
import { ExternalLinkIcon, Pen } from "lucide-react";
import { evalConfigTargetValues } from "@/src/server/api/definitions/evalConfigsTable";
import { Button } from "@/src/components/ui/button";
import { IconOnlyButton } from "@/src/components/IconOnlyButton";
import { useRouter } from "next/router";
import { DeleteEvalConfigButton } from "@/src/components/deleteButton";
import { MaintainerTooltip } from "@/src/features/evals/components/maintainer-tooltip";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { Skeleton } from "@/src/components/ui/skeleton";
import { usdFormatter } from "@/src/utils/numbers";
import {
  type EvaluatorDataRow,
  useEvaluatorTableData,
} from "@/src/features/evals/hooks/useEvaluatorTableData";
import {
  TableBadgeLoadingCell,
  TableIconButtonLoadingCell,
  TableTextLoadingCell,
} from "@/src/components/table/loading-cells";

function DeprecatedChipCell() {
  return (
    <div className="flex items-center gap-1.5">
      <span className="bg-light-yellow text-dark-yellow inline-flex w-fit shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-bold whitespace-nowrap">
        Deprecated
      </span>
    </div>
  );
}

export default function EvaluatorTable({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [paginationState, setPaginationState] = usePaginationState(0, 50, {
    page: "pageIndex",
    limit: "pageSize",
  });
  const [searchQuery, setSearchQuery] = useQueryParam(
    "search",
    withDefault(StringParam, null),
  );

  const [orderByState, setOrderByState] = useOrderByState({
    column: "status",
    order: "ASC",
  });

  const newFilterOptions = {
    status: ["ACTIVE", "PAUSED", "INACTIVE"],
    target: evalConfigTargetValues,
  };

  const queryFilter = useSidebarFilterState(
    evaluatorFilterConfig,
    newFilterOptions,
    {
      loading: false,
      stateLocation: "urlAndSessionStorage",
      sessionFilterContextId: projectId,
    },
  );

  const { evaluators, rows, totalCount } = useEvaluatorTableData({
    projectId,
    page: paginationState.pageIndex,
    limit: paginationState.pageSize,
    filter: queryFilter.filterState,
    orderBy: orderByState,
    searchQuery,
  });

  const hasAccess = useHasProjectAccess({ projectId, scope: "evalJob:CUD" });
  // Deprecated evaluators are read-only where new legacy setups are not
  // allowed (cloud); self-hosted deployments keep editing them.
  const { allowLegacy } = useEvalCapabilities(projectId);

  const datasets = api.datasets.allDatasetMeta.useQuery({ projectId });

  const columnHelper = createColumnHelper<EvaluatorDataRow>();
  const columns = [
    columnHelper.accessor("scoreName", {
      id: "scoreName",
      header: "Generated Score Name",
      size: 200,
      cell: (row) => {
        const scoreName = row.getValue();
        return scoreName ? <TableIdOrName value={scoreName} /> : undefined;
      },
    }),
    columnHelper.accessor("status", {
      header: "Status",
      id: "status",
      size: 80,
      loadingCell: <TableBadgeLoadingCell />,
      cell: (row) => {
        const status = row.getValue();
        return (
          <StatusBadge
            type={status.toLowerCase()}
            className={row.getValue() === "FINISHED" ? "pl-3" : ""}
          />
        );
      },
    }),
    columnHelper.accessor("totalCost", {
      header: "Total Cost (7d)",
      id: "totalCost",
      size: 120,
      cell: (row) => {
        const totalCost = row.getValue();

        if (row.row.original.isCostLoading) {
          return <Skeleton className="h-4 w-16" />;
        }

        if (totalCost != null) return usdFormatter(totalCost, 2, 4);

        return "–";
      },
    }),
    columnHelper.accessor("result", {
      header: "Result",
      id: "result",
      size: 150,
      cell: (row) => {
        const result = row.getValue();
        return (
          <LevelCountsDisplay
            counts={result}
            isLoading={row.row.original.isResultLoading}
          />
        );
      },
    }),
    columnHelper.accessor("logs", {
      header: "Logs",
      id: "logs",
      size: 150,
      loadingCell: <Skeleton className="h-6 w-16 rounded-md" />,
      cell: ({ row }) => {
        const id = row.original.id;
        return (
          <Button
            variant="outline"
            aria-label="view-logs"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              router.push(
                `/project/${projectId}/evals/${encodeURIComponent(id)}`,
              );
            }}
          >
            <ExternalLinkIcon className="mr-1 h-3 w-3" />
            View
          </Button>
        );
      },
    }),
    columnHelper.accessor("template", {
      id: "template",
      header: "Referenced Evaluator",
      size: 200,
      loadingCell: (
        <div className="flex items-center gap-2">
          <TableTextLoadingCell className="w-32" />
          <TableBadgeLoadingCell className="w-6" />
        </div>
      ),
      cell: ({ row }) => {
        const template = row.original.template;
        if (!template) return "template not found";
        return (
          <div className="flex items-center gap-2">
            <TableIdOrName value={template.name} />
            <div className="flex justify-center">
              <MaintainerTooltip maintainer={row.original.maintainer} />
            </div>
          </div>
        );
      },
    }),
    columnHelper.accessor("createdAt", {
      id: "createdAt",
      header: "Created At",
      enableSorting: true,
      size: 150,
    }),
    columnHelper.accessor("updatedAt", {
      id: "updatedAt",
      header: "Updated At",
      enableSorting: true,
      size: 150,
    }),
    columnHelper.accessor("isLegacy", {
      id: "isLegacy",
      header: "Eval Version",
      size: 180,
      enableHiding: true,
      loadingCell: <TableBadgeLoadingCell />,
      cell: (row) => {
        // Set by useEvaluatorTableData only for active legacy evaluators with
        // a NEW time scope — the ones that actually require migration.
        if (!row.row.original.isLegacy) return null;

        return <DeprecatedChipCell />;
      },
    }),
    columnHelper.accessor("target", {
      id: "target",
      header: "Runs on",
      size: 150,
      enableHiding: true,
      cell: (row) => {
        const targetObject = row.getValue();
        const renderText = isEventTarget(targetObject)
          ? "observations"
          : targetObject;
        return <span className="text-muted-foreground">{renderText}</span>;
      },
    }),
    columnHelper.accessor("filter", {
      id: "filter",
      header: "Filter",
      size: 200,
      enableHiding: true,
      cell: (row) => {
        const filterState = row.getValue();

        // FIX: Temporary workaround: Used to display a different value than the actual value since multiSelect doesn't support key-value pairs
        const newFilterState = filterState.map((filter) => {
          if (filter.type === "stringOptions" && filter.column === "Dataset") {
            return {
              ...filter,
              value: filter.value.map(
                (datasetId) =>
                  datasets.data?.find((d) => d.id === datasetId)?.name ??
                  datasetId,
              ),
            };
          }
          return filter;
        });

        return (
          <div className="flex h-full overflow-x-auto">
            <InlineFilterState filterState={newFilterState} />
          </div>
        );
      },
    }),
    columnHelper.accessor("id", {
      header: "Id",
      id: "id",
      size: 100,
      enableHiding: true,
      cell: (row) => {
        const id = row.getValue();
        return id ? <TableIdOrName value={id} /> : undefined;
      },
    }),
    columnHelper.accessor("actions", {
      header: "Actions",
      id: "actions",
      size: 100,
      loadingCell: <TableIconButtonLoadingCell />,
      cell: ({ row }) => {
        const id = row.original.id;
        return (
          <div className="flex items-center gap-1">
            <IconOnlyButton
              key={id}
              icon={<Pen className="h-4 w-4" />}
              label="Edit"
              aria-label="edit"
              disabledReason={
                !hasAccess
                  ? "You don't have permission to edit this evaluator."
                  : row.original.isLegacy && !allowLegacy
                    ? "Deprecated evaluators are only available in read-only mode."
                    : undefined
              }
              onClick={(e) => {
                e.stopPropagation();
                if (id) {
                  router
                    .push(
                      `/project/${projectId}/evals/v2/${encodeURIComponent(id)}?edit=1`,
                    )
                    .catch(() => undefined);
                }
              }}
            />
            <DeleteEvalConfigButton
              aria-label="delete"
              itemId={id}
              projectId={projectId}
              isTableAction
              deleteConfirmation={row.original.scoreName}
              icon
              variant="ghost"
              size="icon-xs"
              title="Delete"
            />
          </div>
        );
      },
    }),
  ] as LangfuseColumnDef<EvaluatorDataRow>[];

  const [columnVisibility, setColumnVisibility] =
    useColumnVisibility<EvaluatorDataRow>(
      "evalConfigColumnVisibility",
      columns,
    );

  return (
    <DataTableControlsProvider
      tableName={evaluatorFilterConfig.tableName}
      defaultSidebarCollapsed={evaluatorFilterConfig.defaultSidebarCollapsed}
    >
      <div className="flex h-full w-full flex-col">
        {/* Toolbar spanning full width */}
        <DataTableToolbar
          columns={columns}
          filterState={queryFilter.filterState}
          columnVisibility={columnVisibility}
          setColumnVisibility={setColumnVisibility}
          searchConfig={{
            metadataSearchFields: ["Name"],
            updateQuery: setSearchQuery,
            currentQuery: searchQuery ?? undefined,
            tableAllowsFullTextSearch: false,
            setSearchType: undefined,
            searchType: undefined,
          }}
        />

        {/* Content area with sidebar and table */}
        <ResizableFilterLayout>
          <DataTableControls queryFilter={queryFilter} />

          <div className="flex flex-1 flex-col overflow-hidden">
            <DataTable
              tableName="evalConfigs"
              columns={columns}
              onRowClick={(row) => {
                router
                  .push(
                    `/project/${projectId}/evals/v2/${encodeURIComponent(row.id)}`,
                  )
                  .catch(() => undefined);
              }}
              data={
                evaluators.isLoading
                  ? { isLoading: true, isError: false }
                  : evaluators.isError
                    ? {
                        isLoading: false,
                        isError: true,
                        error: evaluators.error.message,
                      }
                    : {
                        isLoading: false,
                        isError: false,
                        data: rows,
                      }
              }
              pagination={{
                totalCount,
                onChange: setPaginationState,
                state: paginationState,
              }}
              orderBy={orderByState}
              setOrderBy={setOrderByState}
              columnVisibility={columnVisibility}
              onColumnVisibilityChange={setColumnVisibility}
            />
          </div>
        </ResizableFilterLayout>
      </div>
    </DataTableControlsProvider>
  );
}
