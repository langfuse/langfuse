import { StatusBadge } from "@/src/components/layouts/status-badge";
import { LevelCountsDisplay } from "@/src/components/level-counts-display";
import { DataTable } from "@/src/components/table/data-table";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { InlineFilterState } from "@/src/features/filters/components/filter-builder";
import { useDetailPageLists } from "@/src/features/navigate-detail-pages/context";
import { useQueryFilterState } from "@/src/features/filters/hooks/useFilterState";
import { type RouterOutputs, api } from "@/src/utils/api";
import { type FilterState, singleFilter } from "@langfuse/shared";
import { createColumnHelper } from "@tanstack/react-table";
import { useEffect, useState } from "react";
import {
  useQueryParams,
  withDefault,
  NumberParam,
  useQueryParam,
  StringParam,
} from "use-query-params";
import { z } from "zod/v4";
import { generateJobExecutionCounts } from "@/src/features/evals/utils/job-execution-utils";
import { useOrderByState } from "@/src/features/orderBy/hooks/useOrderByState";
import TableIdOrName from "@/src/components/table/table-id";
import { MoreVertical, Loader2, ExternalLinkIcon, Edit } from "lucide-react";
import { usePeekState } from "@/src/components/table/peek/hooks/usePeekState";
import { useRunningEvaluatorsPeekNavigation } from "@/src/components/table/peek/hooks/useRunningEvaluatorsPeekNavigation";
import { PeekViewEvaluatorConfigDetail } from "@/src/components/table/peek/peek-evaluator-config-detail";
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { Button } from "@/src/components/ui/button";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { EvaluatorForm } from "@/src/features/evals/components/evaluator-form";
import { useRouter } from "next/router";
import { DeleteEvalConfigButton } from "@/src/components/deleteButton";
import { evalConfigFilterColumns } from "@/src/server/api/definitions/evalConfigsTable";
import { RAGAS_TEMPLATE_PREFIX } from "@/src/features/evals/types";
import { MaintainerTooltip } from "@/src/features/evals/components/maintainer-tooltip";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";

export type EvaluatorDataRow = {
  id: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  maintainer: string;
  template?: {
    id: string;
    name: string;
    version: number;
  };
  scoreName: string;
  target: string; // "trace" or "dataset"
  filter: FilterState;
  result: {
    level: string;
    count: number;
    symbol: string;
  }[];
  logs?: string;
  actions?: string;
};

export default function EvaluatorTable({ projectId }: { projectId: string }) {
  const router = useRouter();
  const { setDetailPageList } = useDetailPageLists();
  const [paginationState, setPaginationState] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 50),
  });
  const [searchQuery, setSearchQuery] = useQueryParam(
    "search",
    withDefault(StringParam, null),
  );
  const [editConfigId, setEditConfigId] = useState<string | null>(null);
  const utils = api.useUtils();

  const [filterState, setFilterState] = useQueryFilterState(
    [],
    "eval_configs",
    projectId,
  );

  const [orderByState, setOrderByState] = useOrderByState({
    column: "createdAt",
    order: "DESC",
  });

  const evaluators = api.evals.allConfigs.useQuery({
    page: paginationState.pageIndex,
    limit: paginationState.pageSize,
    projectId,
    filter: filterState,
    orderBy: orderByState,
    searchQuery: searchQuery,
  });
  const totalCount = evaluators.data?.totalCount ?? null;

  const existingEvaluator = api.evals.configById.useQuery(
    {
      id: editConfigId as string,
      projectId,
    },
    {
      enabled: !!editConfigId,
    },
  );

  const hasAccess = useHasProjectAccess({ projectId, scope: "evalJob:CUD" });

  const datasets = api.datasets.allDatasetMeta.useQuery({ projectId });

  useEffect(() => {
    if (evaluators.isSuccess) {
      setDetailPageList(
        "evals",
        evaluators.data.configs.map((evaluator) => ({ id: evaluator.id })),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [evaluators.isSuccess, evaluators.data]);

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
    columnHelper.accessor("result", {
      header: "Result",
      id: "result",
      size: 150,
      cell: (row) => {
        const result = row.getValue();
        return <LevelCountsDisplay counts={result} />;
      },
    }),
    columnHelper.accessor("logs", {
      header: "Logs",
      id: "logs",
      size: 150,
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
    columnHelper.accessor("target", {
      id: "target",
      header: "Target",
      size: 150,
      enableHiding: true,
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
      cell: ({ row }) => {
        const id = row.original.id;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="h-8 w-8 p-0"
                aria-label="actions"
              >
                <span className="sr-only [position:relative]">Open menu</span>
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuItem
                key={id}
                aria-label="edit"
                disabled={!hasAccess}
                onClick={(e) => {
                  e.stopPropagation();
                  if (id) setEditConfigId(id);
                }}
              >
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <DeleteEvalConfigButton
                  aria-label="delete"
                  itemId={id}
                  projectId={projectId}
                  redirectUrl={`/project/${projectId}/evals`}
                  deleteConfirmation={row.original.scoreName}
                />
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    }),
  ] as LangfuseColumnDef<EvaluatorDataRow>[];

  const [columnVisibility, setColumnVisibility] =
    useColumnVisibility<EvaluatorDataRow>(
      "evalConfigColumnVisibility",
      columns,
    );

  const { getNavigationPath } = useRunningEvaluatorsPeekNavigation();
  const { setPeekView } = usePeekState();

  const convertToTableRow = (
    jobConfig: RouterOutputs["evals"]["allConfigs"]["configs"][number],
  ): EvaluatorDataRow => {
    const result = generateJobExecutionCounts(jobConfig.jobExecutionsByState);

    return {
      id: jobConfig.id,
      status: jobConfig.finalStatus,
      createdAt: jobConfig.createdAt.toLocaleString(),
      updatedAt: jobConfig.updatedAt.toLocaleString(),
      template: jobConfig.evalTemplate
        ? {
            id: jobConfig.evalTemplate.id,
            name: jobConfig.evalTemplate.name,
            version: jobConfig.evalTemplate.version,
          }
        : undefined,
      scoreName: jobConfig.scoreName,
      target: jobConfig.targetObject,
      filter: z.array(singleFilter).parse(jobConfig.filter),
      result: result,
      maintainer: jobConfig.evalTemplate
        ? jobConfig.evalTemplate.projectId
          ? "User maintained"
          : jobConfig.evalTemplate.name.startsWith(RAGAS_TEMPLATE_PREFIX)
            ? "Langfuse and Ragas maintained"
            : "Langfuse maintained"
        : "Not available",
    };
  };

  return (
    <>
      <DataTableToolbar
        columns={columns}
        filterColumnDefinition={evalConfigFilterColumns}
        filterState={filterState}
        setFilterState={setFilterState}
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
      <DataTable
        columns={columns}
        peekView={{
          itemType: "RUNNING_EVALUATOR",
          listKey: "evals",
          onOpenChange: setPeekView,
          shouldUpdateRowOnDetailPageNavigation: true,
          peekEventOptions: {
            ignoredSelectors: [
              "[aria-label='edit'], [aria-label='actions'], [aria-label='view-logs'], [aria-label='delete']",
            ],
          },
          getNavigationPath,
          children: (row) => (
            <PeekViewEvaluatorConfigDetail projectId={projectId} row={row} />
          ),
          tableDataUpdatedAt: evaluators.dataUpdatedAt,
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
                  data: evaluators.data.configs.map((evaluator) =>
                    convertToTableRow(evaluator),
                  ),
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
      <Dialog
        open={!!editConfigId && existingEvaluator.isSuccess}
        onOpenChange={(open) => {
          if (!open) setEditConfigId(null);
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-screen-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit configuration</DialogTitle>
          </DialogHeader>
          {existingEvaluator.isLoading ? (
            <div className="flex items-center justify-center p-4">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <EvaluatorForm
              projectId={projectId}
              evalTemplates={[]}
              existingEvaluator={
                existingEvaluator.data && existingEvaluator.data.evalTemplate
                  ? {
                      ...existingEvaluator.data,
                      evalTemplate: {
                        ...existingEvaluator.data.evalTemplate,
                      },
                    }
                  : undefined
              }
              shouldWrapVariables={true}
              useDialog={true}
              mode="edit"
              onFormSuccess={() => {
                setEditConfigId(null);
                void utils.evals.allConfigs.invalidate();
                showSuccessToast({
                  title: "Evaluator updated successfully",
                  description:
                    "Changes will automatically be reflected future evaluator runs",
                });
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
