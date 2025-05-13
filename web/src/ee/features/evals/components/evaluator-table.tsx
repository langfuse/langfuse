import { StatusBadge } from "@/src/components/layouts/status-badge";
import { LevelCountsDisplay } from "@/src/components/level-counts-display";
import { DataTable } from "@/src/components/table/data-table";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import TableLink from "@/src/components/table/table-link";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { InlineFilterState } from "@/src/features/filters/components/filter-builder";
import { useDetailPageLists } from "@/src/features/navigate-detail-pages/context";
import { useQueryFilterState } from "@/src/features/filters/hooks/useFilterState";
import { type RouterOutputs, api } from "@/src/utils/api";
import { type FilterState, singleFilter } from "@langfuse/shared";
import { createColumnHelper } from "@tanstack/react-table";
import { useEffect } from "react";
import {
  useQueryParams,
  withDefault,
  NumberParam,
  useQueryParam,
  StringParam,
} from "use-query-params";
import { z } from "zod";
import { generateJobExecutionCounts } from "@/src/ee/features/evals/utils/job-execution-utils";
import { evalConfigsTableColsWithOptions } from "@/src/server/api/definitions/evalConfigsTable";
import { useOrderByState } from "@/src/features/orderBy/hooks/useOrderByState";
import TableIdOrName from "@/src/components/table/table-id";
import { LangfuseIcon } from "@/src/components/LangfuseLogo";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { UserCircle2Icon } from "lucide-react";
import { usePeekState } from "@/src/components/table/peek/hooks/usePeekState";
import { useRunningEvaluatorsPeekNavigation } from "@/src/components/table/peek/hooks/useRunningEvaluatorsPeekNavigation";
import { PeekViewEvaluatorConfigDetail } from "@/src/components/table/peek/peek-evaluator-config-detail";

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
};

export default function EvaluatorTable({ projectId }: { projectId: string }) {
  const { setDetailPageList } = useDetailPageLists();
  const [paginationState, setPaginationState] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 50),
  });
  const [searchQuery, setSearchQuery] = useQueryParam(
    "search",
    withDefault(StringParam, null),
  );

  // Define default filter for target "trace"
  const defaultFilter: FilterState = [
    {
      column: "Target",
      type: "stringOptions",
      operator: "any of",
      value: ["trace"],
    },
  ];

  const [filterState, setFilterState] = useQueryFilterState(
    defaultFilter,
    "eval_configs",
    projectId,
  );

  const [orderByState, setOrderByState] = useOrderByState({
    column: "createdAt",
    order: "DESC",
  });

  const evaluatorConfigFilterOptions = api.evals.configFilterOptions.useQuery(
    {
      projectId,
    },
    {
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: Infinity,
    },
  );

  const evaluators = api.evals.allConfigs.useQuery({
    page: paginationState.pageIndex,
    limit: paginationState.pageSize,
    projectId,
    filter: filterState,
    orderBy: orderByState,
    searchQuery: searchQuery,
  });
  const totalCount = evaluators.data?.totalCount ?? null;

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
    columnHelper.accessor("template", {
      id: "template",
      header: "Referenced Evaluator",
      size: 200,
      cell: (row) => {
        const template = row.getValue();
        if (!template) return "template not found";
        return <TableIdOrName value={template.name} />;
      },
    }),
    columnHelper.accessor("maintainer", {
      id: "maintainer",
      header: "Maintainer",
      size: 150,
      cell: (row) => {
        const isLangfuse = row.getValue().includes("Langfuse");
        return (
          <div className="flex justify-center">
            <Tooltip>
              <TooltipTrigger>
                {isLangfuse ? (
                  <LangfuseIcon size={16} />
                ) : (
                  <UserCircle2Icon className="h-4 w-4" />
                )}
              </TooltipTrigger>
              <TooltipContent>{row.getValue()}</TooltipContent>
            </Tooltip>
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
        return id ? (
          <TableLink
            path={`/project/${projectId}/evals/${encodeURIComponent(id)}`}
            value={id}
          />
        ) : undefined;
      },
    }),
    // TODO: Add actions
  ] as LangfuseColumnDef<EvaluatorDataRow>[];

  const [columnVisibility, setColumnVisibility] =
    useColumnVisibility<EvaluatorDataRow>(
      "evalConfigColumnVisibility",
      columns,
    );

  const urlPathname = `/project/${projectId}/evals`;
  const { getNavigationPath, expandPeek } =
    useRunningEvaluatorsPeekNavigation(urlPathname);
  const { setPeekView } = usePeekState(urlPathname);

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
          : "Langfuse maintained"
        : "Not available",
    };
  };

  return (
    <>
      <DataTableToolbar
        columns={columns}
        filterColumnDefinition={evalConfigsTableColsWithOptions(
          evaluatorConfigFilterOptions.data,
        )}
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
          urlPathname,
          onOpenChange: setPeekView,
          onExpand: expandPeek,
          shouldUpdateRowOnDetailPageNavigation: true,
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
    </>
  );
}
