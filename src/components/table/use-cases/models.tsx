import { DataTable } from "@/src/components/table/data-table";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { useQueryFilterState } from "@/src/features/filters/hooks/useFilterState";
import { scoresTableColsWithOptions } from "@/src/server/api/definitions/scoresTable";
import { api } from "@/src/utils/api";
import { type RouterInput } from "@/src/utils/types";
import { type Model } from "@prisma/client";
import Decimal from "decimal.js";
import { useQueryParams, withDefault, NumberParam } from "use-query-params";

export type ModelTableRow = {
  projectId?: string;
  modelName: string;
  matchPattern: string;
  startDate?: Date;
  inputPrice?: Decimal;
  outputPrice?: Decimal;
  totalPrice?: Decimal;
  unit: string;
};

export type ModelFilterInput = Omit<RouterInput["models"]["all"], "projectId">;

export default function ModelTable({
  projectId,
}: {
  projectId: string;
  userId?: string;
}) {
  const [paginationState, setPaginationState] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 50),
  });

  const [userFilterState, setUserFilterState] = useQueryFilterState([]);

  const models = api.models.all.useQuery({
    page: paginationState.pageIndex,
    limit: paginationState.pageSize,
    projectId,
  });
  const totalCount = models.data?.totalCount ?? 0;

  const filterOptions = api.scores.filterOptions.useQuery({
    projectId,
  });

  const columns: LangfuseColumnDef<ModelTableRow>[] = [
    {
      accessorKey: "maintainer",
      id: "maintainer",
      enableColumnFilter: true,
      header: "Maintainer",
      cell: ({ row }) => {
        const value = row.getValue("projectId");

        return typeof value === "string" ? "User" : "Langfuse";
      },
    },
    {
      accessorKey: "modelName",
      id: "modelName",
      header: "Model Name",
    },
    {
      accessorKey: "matchPattern",
      id: "matchPattern",
      header: "Match Pattern",
    },
    {
      accessorKey: "startDate",
      id: "startDate",
      header: "Start Date",
    },
    {
      accessorKey: "inputPrice",
      id: "inputPrice",
      header: "Input Price",
    },
    {
      accessorKey: "outputPrice",
      id: "outputPrice",
      header: "Output Price",
    },
    {
      accessorKey: "totalPrice",
      id: "totalprice",
      header: "Total Price",
    },
    {
      accessorKey: "unit",
      id: "unit",
      header: "Unit",
      enableHiding: true,
    },
    {
      accessorKey: "tokenizerId",
      id: "tokenizerId",
      header: "Tokenizer",
      enableHiding: true,
    },
  ];

  const [columnVisibility, setColumnVisibility] =
    useColumnVisibility<ModelTableRow>("scoresColumnVisibility", columns);

  const convertToTableRow = (model: Model): ModelTableRow => {
    return {
      projectId: model.projectId ?? undefined,
      modelName: model.modelName,
      matchPattern: model.matchPattern,
      startDate: model.startDate ? new Date(model.startDate) : undefined,
      inputPrice: model.inputPrice ? new Decimal(model.inputPrice) : undefined,
      outputPrice: model.outputPrice
        ? new Decimal(model.outputPrice)
        : undefined,
      totalPrice: model.totalPrice ? new Decimal(model.totalPrice) : undefined,
      unit: model.unit,
    };
  };

  return (
    <div>
      <DataTableToolbar
        columns={columns}
        filterColumnDefinition={scoresTableColsWithOptions(filterOptions.data)}
        filterState={userFilterState}
        setFilterState={setUserFilterState}
        columnVisibility={columnVisibility}
        setColumnVisibility={setColumnVisibility}
      />
      <DataTable
        columns={columns}
        data={
          models.isLoading
            ? { isLoading: true, isError: false }
            : models.isError
              ? {
                  isLoading: false,
                  isError: true,
                  error: models.error.message,
                }
              : {
                  isLoading: false,
                  isError: false,
                  data: models.data.models.map((t) => convertToTableRow(t)),
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
