import { StatusBadge } from "@/src/components/layouts/status-badge";
import { DataTable } from "@/src/components/table/data-table";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import TableLink from "@/src/components/table/table-link";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { InlineFilterState } from "@/src/features/filters/components/filter-builder";
import { type RouterOutputs, api } from "@/src/utils/api";
import { type FilterState, singleFilter } from "@langfuse/shared";
import { createColumnHelper } from "@tanstack/react-table";
import { type ReactNode } from "react";
import { useQueryParams, withDefault, NumberParam } from "use-query-params";
import { z } from "zod";

export type EvalConfigRow = {
  id: string;
  status: string;
  createdAt: string;
  template?: {
    id: string;
    name: string;
    version: number;
  };
  scoreName: string;
  filter: FilterState;
};

export default function EvaluatorTable({
  projectId,
  menuItems,
}: {
  projectId: string;
  menuItems?: ReactNode;
}) {
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

  const columnHelper = createColumnHelper<EvalConfigRow>();
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
        return <StatusBadge type={status.toLowerCase()} />;
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
        const node = row.getValue();
        return (
          <div className="flex h-full overflow-x-auto">
            <InlineFilterState filterState={node} />
          </div>
        );
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
        ? {
            id: jobConfig.evalTemplate.id,
            name: jobConfig.evalTemplate.name,
            version: jobConfig.evalTemplate.version,
          }
        : undefined,
      scoreName: jobConfig.scoreName,
      filter: z.array(singleFilter).parse(jobConfig.filter),
    };
  };

  return (
    <>
      <DataTableToolbar columns={columns} actionButtons={menuItems} />
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
