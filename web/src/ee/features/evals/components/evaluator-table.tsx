import { StatusBadge } from "@/src/components/layouts/status-badge";
import { LevelCountsDisplay } from "@/src/components/level-counts-display";
import { DataTable } from "@/src/components/table/data-table";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import TableLink from "@/src/components/table/table-link";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { InlineFilterState } from "@/src/features/filters/components/filter-builder";
import { useDetailPageLists } from "@/src/features/navigate-detail-pages/context";
import { type RouterOutputs, api } from "@/src/utils/api";
import { type FilterState, singleFilter } from "@langfuse/shared";
import { createColumnHelper } from "@tanstack/react-table";
import { useEffect } from "react";
import { useQueryParams, withDefault, NumberParam } from "use-query-params";
import { z } from "zod";
import { generateJobExecutionCounts } from "@/src/ee/features/evals/utils/job-execution-utils";

export type EvaluatorDataRow = {
  id: string;
  status: string;
  createdAt: string;
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

  const evaluators = api.evals.allConfigs.useQuery({
    page: paginationState.pageIndex,
    limit: paginationState.pageSize,
    projectId,
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
    columnHelper.accessor("id", {
      header: "Id",
      id: "id",
      size: 100,
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
    columnHelper.accessor("createdAt", {
      id: "createdAt",
      header: "Created At",
      size: 150,
    }),
    columnHelper.accessor("template", {
      id: "template",
      header: "Template",
      size: 200,
      cell: (row) => {
        const template = row.getValue();
        if (!template) return "template not found";
        return (
          <TableLink
            path={`/project/${projectId}/evals/templates/${template.id}`}
            value={`${template.name} (v${template.version})`}
          />
        );
      },
    }),
    columnHelper.accessor("target", {
      id: "target",
      header: "Target",
      size: 150,
    }),
    columnHelper.accessor("scoreName", {
      id: "scoreName",
      header: "Score Name",
      size: 150,
    }),
    columnHelper.accessor("filter", {
      id: "filter",
      header: "Filter",
      size: 200,
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
  ] as LangfuseColumnDef<EvaluatorDataRow>[];

  const [columnVisibility, setColumnVisibility] =
    useColumnVisibility<EvaluatorDataRow>(
      "evalConfigColumnVisibility",
      columns,
    );

  const convertToTableRow = (
    jobConfig: RouterOutputs["evals"]["allConfigs"]["configs"][number],
  ): EvaluatorDataRow => {
    const result = generateJobExecutionCounts(jobConfig.jobExecutionsByState);

    return {
      id: jobConfig.id,
      status: jobConfig.finalStatus,
      createdAt: jobConfig.createdAt.toLocaleString(),
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
    };
  };

  return (
    <>
      <DataTableToolbar columns={columns} />
      <DataTable
        columns={columns}
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
        columnVisibility={columnVisibility}
        onColumnVisibilityChange={setColumnVisibility}
      />
    </>
  );
}
