import { DataTable } from "@/src/components/table/data-table";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { api } from "@/src/utils/api";
import { type JobConfiguration } from "@prisma/client";
import { useQueryParams, withDefault, NumberParam } from "use-query-params";

export type EvalConfigRow = {
  id: string;
  createdAt: string;
  evalTemplateId?: string;
  scoreName: string;
  targetObject: string;
  filter: string;
  variableMapping: string;
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

  const columns: LangfuseColumnDef<EvalConfigRow>[] = [
    {
      accessorKey: "id",
      id: "id",
      header: "ID",
      enableHiding: false,
    },
    {
      accessorKey: "createdAt",
      id: "createdAt",
      header: "Created At",
      enableHiding: true,
    },
    {
      accessorKey: "evalTemplateId",
      id: "evalTemplateId",
      header: "Eval Template",
      enableHiding: true,
    },
    {
      accessorKey: "scoreName",
      id: "scoreName",
      header: "Score Name",
      enableHiding: true,
    },
    {
      accessorKey: "targetObject",
      id: "targetObject",
      header: "Target",
      enableHiding: true,
    },
    {
      accessorKey: "filter",
      id: "filter",
      header: "Filter",
      enableHiding: true,
    },
    {
      accessorKey: "variableMapping",
      id: "variableMapping",
      header: "Mapping",
      enableHiding: true,
    },
  ];

  const [columnVisibility, setColumnVisibility] =
    useColumnVisibility<EvalConfigRow>("evalConfigColumnVisibility", columns);

  const convertToTableRow = (jobConfig: JobConfiguration): EvalConfigRow => {
    return {
      id: jobConfig.id,
      createdAt: jobConfig.createdAt.toLocaleString(),
      evalTemplateId: jobConfig.evalTemplateId?.toLocaleString(),
      scoreName: jobConfig.scoreName,
      targetObject: jobConfig.targetObject,
      filter: JSON.stringify(jobConfig.filter),
      variableMapping: JSON.stringify(jobConfig.variableMapping),
    };
  };

  return (
    <div>
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
    </div>
  );
}
