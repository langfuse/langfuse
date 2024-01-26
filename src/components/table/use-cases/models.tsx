import { DataTable } from "@/src/components/table/data-table";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { api } from "@/src/utils/api";
import { usdFormatter } from "@/src/utils/numbers";
import { type Prisma, type Model } from "@prisma/client";
import Decimal from "decimal.js";
import { useQueryParams, withDefault, NumberParam } from "use-query-params";

export type ModelTableRow = {
  maintainer: string;
  modelName: string;
  matchPattern: string;
  startDate?: Date;
  inputPrice?: Decimal;
  outputPrice?: Decimal;
  totalPrice?: Decimal;
  unit: string;
  tokenizerId?: string;
  config?: Prisma.JsonValue;
};

export default function ModelTable({ projectId }: { projectId: string }) {
  const [paginationState, setPaginationState] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 50),
  });

  const models = api.models.all.useQuery({
    page: paginationState.pageIndex,
    limit: paginationState.pageSize,
    projectId,
  });
  const totalCount = models.data?.totalCount ?? 0;

  const columns: LangfuseColumnDef<ModelTableRow>[] = [
    {
      accessorKey: "maintainer",
      id: "maintainer",
      enableColumnFilter: true,
      header: "Maintainer",
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
      cell: ({ row }) => {
        const value: string = row.getValue("matchPattern");

        return (
          <code className="relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-xs ">
            {value}
          </code>
        );
      },
    },
    {
      accessorKey: "startDate",
      id: "startDate",
      header: "Start Date",
      cell: ({ row }) => {
        const value: Date | undefined = row.getValue("startDate");

        return value ? (
          <span className="text-xs">{value.toLocaleDateString()} </span>
        ) : (
          <span className="text-xs">-</span>
        );
      },
    },
    {
      accessorKey: "inputPrice",
      id: "inputPrice",
      header: "Input Price",
      cell: ({ row }) => {
        const value: Decimal | undefined = row.getValue("inputPrice");

        return value ? (
          <span className="text-xs">
            {usdFormatter(value.toNumber(), 2, 8)}
          </span>
        ) : (
          <span className="text-xs">-</span>
        );
      },
    },
    {
      accessorKey: "outputPrice",
      id: "outputPrice",
      header: "Output Price",
      cell: ({ row }) => {
        const value: Decimal | undefined = row.getValue("outputPrice");

        return value ? (
          <span className="text-xs">
            {usdFormatter(value.toNumber(), 2, 8)}
          </span>
        ) : (
          <span className="text-xs">-</span>
        );
      },
    },
    {
      accessorKey: "totalPrice",
      id: "totalPrice",
      header: "Total Price",
      cell: ({ row }) => {
        const value: Decimal | undefined = row.getValue("totalPrice");

        return value ? (
          <span className="text-xs">
            {usdFormatter(value.toNumber(), 2, 8)}
          </span>
        ) : (
          <span className="text-xs">-</span>
        );
      },
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
    {
      accessorKey: "config",
      id: "config",
      header: "Tokenizer",
      enableHiding: true,
      cell: ({ row }) => {
        const value: Prisma.JsonValue | undefined = row.getValue("config");

        return value ? (
          <span className="text-xs">{JSON.stringify(value)}</span>
        ) : (
          <span className="text-xs">-</span>
        );
      },
    },
  ];

  const [columnVisibility, setColumnVisibility] =
    useColumnVisibility<ModelTableRow>("scoresColumnVisibility", columns);

  const convertToTableRow = (model: Model): ModelTableRow => {
    return {
      maintainer: model.projectId ? "User" : "Langfuse",
      modelName: model.modelName,
      matchPattern: model.matchPattern,
      startDate: model.startDate ? new Date(model.startDate) : undefined,
      inputPrice: model.inputPrice ? new Decimal(model.inputPrice) : undefined,
      outputPrice: model.outputPrice
        ? new Decimal(model.outputPrice)
        : undefined,
      totalPrice: model.totalPrice ? new Decimal(model.totalPrice) : undefined,
      unit: model.unit,
      tokenizerId: model.tokenizerId ?? undefined,
      config: model.tokenizerConfig,
    };
  };

  return (
    <div>
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
