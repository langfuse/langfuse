import { DataTable } from "@/src/components/table/data-table";
import TableLink from "@/src/components/table/table-link";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { InlineFilterState } from "@/src/features/filters/components/filter-builder";
import { type RouterOutputs, api } from "@/src/utils/api";
import { type FilterState, singleFilter } from "@langfuse/shared";
import { createColumnHelper } from "@tanstack/react-table";
import { useQueryParams, withDefault, NumberParam } from "use-query-params";
import { z } from "zod";

export type EvalConfigRow = {
  id: string;
  status: string;
  createdAt: string;
  template?: string;
  scoreName: string;
  filter: FilterState;
};

export default function EvalConfigTable({ projectId }: { projectId: string }) {
  const [paginationState, setPaginationState] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 50),
  });

  const templates = api.evals.allConfigs.useQuery({
    page: paginationState.pageIndex,
    limit: paginationState.pageSize,
    projectId,
  });
  const totalCount = templates.data?.totalCount ?? 0;

  const columnHelper = createColumnHelper<EvalConfigRow>();
  const columns = [
    columnHelper.accessor("id", {
      header: "Id",
      id: "id",
      cell: (row) => {
        const id = row.getValue();
        return id ? (
          <TableLink
            path={`/project/${projectId}/evals/configs/${encodeURIComponent(id)}`}
            value={id}
            truncateAt={50}
          />
        ) : undefined;
      },
    }),
    columnHelper.accessor("status", {
      id: "state",
      header: "State",
    }),
    columnHelper.accessor("createdAt", {
      id: "createdAt",
      header: "Created At",
    }),
    columnHelper.accessor("template", {
      id: "template",
      header: "Template",
    }),
    columnHelper.accessor("scoreName", {
      id: "scoreName",
      header: "Score Name",
    }),
    columnHelper.accessor("filter", {
      id: "filter",
      header: "Filter",
      cell: (row) => {
        const node = row.getValue();
        return <InlineFilterState filterState={node} />;
      },
    }),
  ] as LangfuseColumnDef<EvalConfigRow>[];

  const [columnVisibility, setColumnVisibility] =
    useColumnVisibility<EvalConfigRow>("evalConfigColumnVisibility", columns);

  const convertToTableRow = (
    jobConfig: RouterOutputs["evals"]["allConfigs"]["configs"][number],
  ): EvalConfigRow => {
    return {
      id: jobConfig.id,
      status: jobConfig.status,
      createdAt: jobConfig.createdAt.toLocaleString(),
      template: jobConfig.evalTemplate
        ? `${jobConfig.evalTemplate.name} (v${jobConfig.evalTemplate.version})`
        : undefined,
      scoreName: jobConfig.scoreName,
      filter: z.array(singleFilter).parse(jobConfig.filter),
    };
  };

  return (
    <DataTable
      columns={columns}
      data={
        templates.isLoading
          ? { isLoading: true, isError: false }
          : templates.isError
            ? {
                isLoading: false,
                isError: true,
                error: templates.error.message,
              }
            : {
                isLoading: false,
                isError: false,
                data: templates.data.configs.map((t) => convertToTableRow(t)),
              }
      }
      pagination={{
        pageCount: Math.ceil(totalCount / paginationState.pageSize),
        onChange: setPaginationState,
        state: paginationState,
      }}
      columnVisibility={columnVisibility}
      onColumnVisibilityChange={setColumnVisibility}
    />
  );
}
