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
import { useDetailPageLists } from "@/src/features/navigate-detail-pages/context";
import { useSidebarFilterState } from "@/src/features/filters/hooks/useSidebarFilterState";
import { evaluatorFilterConfig } from "@/src/features/filters/config/evaluators-config";
import { type RouterOutputs, api } from "@/src/utils/api";
import { safeExtract } from "@/src/utils/map-utils";
import { type FilterState, singleFilter } from "@langfuse/shared";
import { createColumnHelper } from "@tanstack/react-table";
import { useEffect, useState, useMemo } from "react";
import {
  useQueryParams,
  withDefault,
  NumberParam,
  useQueryParam,
  StringParam,
} from "use-query-params";
import { z } from "zod/v4";
import { generateJobExecutionCounts } from "@/src/features/evals/utils/job-execution-utils";
import {
  isLegacyEvalTarget,
  isEventTarget,
} from "@/src/features/evals/utils/typeHelpers";
import { useOrderByState } from "@/src/features/orderBy/hooks/useOrderByState";
import TableIdOrName from "@/src/components/table/table-id";
import {
  MoreVertical,
  Loader2,
  ExternalLinkIcon,
  Edit,
  Info,
} from "lucide-react";
import { usePeekNavigation } from "@/src/components/table/peek/hooks/usePeekNavigation";
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
import { RAGAS_TEMPLATE_PREFIX } from "@/src/features/evals/types";
import { MaintainerTooltip } from "@/src/features/evals/components/maintainer-tooltip";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { Skeleton } from "@/src/components/ui/skeleton";
import { usdFormatter } from "@/src/utils/numbers";
import { Callout } from "@/src/components/ui/callout";
import Link from "next/link";
import { Badge } from "@/src/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { useIsObservationEvalsFullyReleased } from "@/src/features/events/hooks/useObservationEvals";

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
  totalCost?: number | null;
  isLegacy?: boolean;
};

function LegacyBadgeCell({ status }: { status: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <Badge variant="warning">
        Legacy
        {status === "ACTIVE" && (
          <Tooltip>
            <TooltipTrigger>
              <Info className="ml-1 h-3.5 w-3.5 text-dark-yellow" />
            </TooltipTrigger>
            <TooltipContent className="max-w-[280px]">
              <div className="space-y-1 text-sm">
                <p className="font-medium">Action required</p>
                <p className="text-muted-foreground">
                  This evaluator requires changes to benefit from new features
                  and performance improvements. Please follow{" "}
                  <Link
                    href="https://langfuse.com/faq/all/llm-as-a-judge-migration"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-dark-blue hover:opacity-80"
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
                  >
                    this guide
                  </Link>{" "}
                  to upgrade to the new version.
                </p>
              </div>
            </TooltipContent>
          </Tooltip>
        )}
      </Badge>
    </div>
  );
}

export default function EvaluatorTable({ projectId }: { projectId: string }) {
  const isFullyReleased = useIsObservationEvalsFullyReleased();
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

  const [orderByState, setOrderByState] = useOrderByState({
    column: "createdAt",
    order: "DESC",
  });

  const newFilterOptions = {
    status: ["ACTIVE", "INACTIVE"],
    target: ["trace", "dataset"],
  };

  const queryFilter = useSidebarFilterState(
    evaluatorFilterConfig,
    newFilterOptions,
    projectId,
    false,
    false,
    [
      {
        column: "status",
        type: "stringOptions",
        operator: "any of",
        value: ["ACTIVE"],
      },
    ],
  );

  const evaluators = api.evals.allConfigs.useQuery({
    page: paginationState.pageIndex,
    limit: paginationState.pageSize,
    projectId,
    filter: queryFilter.filterState,
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

  // Fetch costs for all evaluators
  const evaluatorIds =
    evaluators.data?.configs.map((config) => config.id) ?? [];
  const costs = api.evals.costByEvaluatorIds.useQuery(
    {
      projectId,
      evaluatorIds,
    },
    {
      enabled: evaluators.isSuccess && evaluatorIds.length > 0,
      meta: {
        silentHttpCodes: [503],
      },
    },
  );

  const hasLegacyEvals = useMemo(() => {
    if (!evaluators.data?.configs) return false;
    return evaluators.data.configs.some(
      (config) =>
        config.finalStatus === "ACTIVE" &&
        isLegacyEvalTarget(config.targetObject),
    );
  }, [evaluators.data?.configs]);

  useEffect(() => {
    if (evaluators.isSuccess) {
      const { configs: configList = [] } = evaluators.data ?? {};
      setDetailPageList(
        "evals",
        configList.map((evaluator) => ({ id: evaluator.id })),
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
    columnHelper.accessor("totalCost", {
      header: "Total Cost (7d)",
      id: "totalCost",
      size: 120,
      cell: (row) => {
        const totalCost = row.getValue();

        if (!costs.data) return <Skeleton className="h-4 w-16" />;

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
    ...(isFullyReleased
      ? [
          columnHelper.accessor("isLegacy", {
            id: "isLegacy",
            header: "Eval Version",
            size: 180,
            enableHiding: true,
            cell: (row) => {
              const targetObject = row.row.original.target;
              const status = row.row.original.status;
              const isDeprecated = isLegacyEvalTarget(targetObject);

              if (!isDeprecated) return null;

              return <LegacyBadgeCell status={status} />;
            },
          }),
        ]
      : []),
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

  const peekNavigationProps = usePeekNavigation();

  const convertToTableRow = (
    jobConfig: RouterOutputs["evals"]["allConfigs"]["configs"][number],
  ): EvaluatorDataRow => {
    const result = generateJobExecutionCounts(jobConfig.jobExecutionsByState);
    const costData = costs.data?.[jobConfig.id];

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
      totalCost: costData,
      isLegacy: isLegacyEvalTarget(jobConfig.targetObject),
    };
  };

  return (
    <DataTableControlsProvider
      tableName={evaluatorFilterConfig.tableName}
      defaultSidebarCollapsed={evaluatorFilterConfig.defaultSidebarCollapsed}
    >
      <div className="flex h-full w-full flex-col">
        {isFullyReleased && hasLegacyEvals && (
          <div className="p-2 pb-0">
            <Callout
              id="eval-remapping-table"
              variant="info"
              key="dismissed-eval-remapping-callouts"
            >
              <span>New LLM-as-a-Judge functionality has landed. </span>
              <span className="font-semibold">
                Some of your evaluators (marked &quot;Legacy&quot;) require
                changes{" "}
              </span>
              <span>for new features and improvements. </span>
              <Link
                href="https://langfuse.com/faq/all/llm-as-a-judge-migration"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-dark-blue hover:opacity-80"
              >
                Learn what is changing and how to upgrade
              </Link>
              <span>.</span>
            </Callout>
          </div>
        )}

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
              tableName={"evalConfigs"}
              columns={columns}
              peekView={{
                itemType: "RUNNING_EVALUATOR",
                detailNavigationKey: "evals",
                peekEventOptions: {
                  ignoredSelectors: [
                    "[aria-label='edit'], [aria-label='actions'], [aria-label='view-logs'], [aria-label='delete']",
                  ],
                },
                tableDataUpdatedAt: Math.max(
                  evaluators.dataUpdatedAt,
                  costs.dataUpdatedAt,
                ),
                children: (
                  <PeekViewEvaluatorConfigDetail projectId={projectId} />
                ),
                ...peekNavigationProps,
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
                        data: safeExtract(evaluators.data, "configs", []).map(
                          (evaluator) => convertToTableRow(evaluator),
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
          </div>
        </ResizableFilterLayout>
      </div>
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
    </DataTableControlsProvider>
  );
}
