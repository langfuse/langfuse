import React from "react";
import { Card } from "@/src/components/ui/card";
import Header from "@/src/components/layouts/header";
import { useRowHeightLocalStorage } from "@/src/components/table/data-table-row-height-switch";
import { NumberParam, useQueryParams, withDefault } from "use-query-params";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { api } from "@/src/utils/api";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import { DataTable } from "@/src/components/table/data-table";
import { type ScoreDataType, type Prisma } from "@langfuse/shared";
import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";
import { IOTableCell } from "@/src/components/ui/CodeJsonViewer";
import { CreateScoreConfigButton } from "@/src/features/manual-scoring/components/CreateScoreConfigButton";
import { isNumeric } from "@/src/features/manual-scoring/lib/helpers";

type ScoreConfigTableRow = {
  id: string;
  name: string;
  dataType: ScoreDataType;
  createdAt: string;
  updatedAt: string;
  range: {
    maxValue?: number | null;
    minValue?: number | null;
    categories?: Prisma.JsonValue | null;
  };
  description?: string | null;
};

function ScoreConfigsTable({ projectId }: { projectId: string }) {
  const [paginationState, setPaginationState] = useQueryParams({
    pageIndex: withDefault(NumberParam, 0),
    pageSize: withDefault(NumberParam, 50),
  });

  const [rowHeight, setRowHeight] = useRowHeightLocalStorage(
    "scoreConfigs",
    "s",
  );

  const configs = api.scoreConfigs.all.useQuery({
    projectId,
    page: paginationState.pageIndex,
    limit: paginationState.pageSize,
  });

  const totalCount = configs.data?.totalCount ?? 0;

  const columns: LangfuseColumnDef<ScoreConfigTableRow>[] = [
    {
      accessorKey: "id",
      id: "id",
      header: "Config ID",
      enableSorting: true,
      enableHiding: true,
      cell: ({ row }) => {
        const value = row.original.id;
        return (
          <span
            className="inline-block rounded bg-muted-gray px-2
        py-1 text-xs font-semibold text-accent-dark-blue shadow-sm"
          >
            {value}
          </span>
        );
      },
    },
    {
      accessorKey: "name",
      id: "name",
      header: "Name",
      enableHiding: true,
      enableSorting: true,
    },
    {
      accessorKey: "dataType",
      id: "dataType",
      header: "Data Type",
      enableHiding: true,
      enableSorting: true,
    },
    {
      accessorKey: "range",
      id: "range",
      header: "Range",
      enableHiding: true,
      enableSorting: true,
      cell: ({ row }) => {
        const range = getConfigRange(row.original);

        return !!range ? (
          <IOTableCell data={range} singleLine={rowHeight === "s"} />
        ) : null;
      },
    },
    {
      accessorKey: "description",
      id: "description",
      header: "Description",
      enableHiding: true,
      enableSorting: true,
      cell: ({ row }) => {
        const value = row.original.description;

        return !!value ? (
          <IOTableCell data={value} singleLine={rowHeight === "s"} />
        ) : null;
      },
    },
    {
      accessorKey: "createdAt",
      id: "createdAt",
      header: "Created At",
      enableHiding: true,
      defaultHidden: true,
      enableSorting: true,
    },
    {
      accessorKey: "updatedAt",
      id: "updatedAt",
      header: "Updated At",
      enableHiding: true,
      defaultHidden: true,
      enableSorting: true,
    },
  ];

  const [columnVisibility, setColumnVisibility] =
    useColumnVisibility<ScoreConfigTableRow>(
      "scoreConfigsColumnVisibility",
      columns,
    );

  return (
    <>
      <DataTableToolbar
        columns={columns}
        columnVisibility={columnVisibility}
        setColumnVisibility={setColumnVisibility}
        rowHeight={rowHeight}
        setRowHeight={setRowHeight}
      />
      <DataTable
        columns={columns}
        data={
          configs.isLoading
            ? { isLoading: true, isError: false }
            : configs.isError
              ? {
                  isLoading: false,
                  isError: true,
                  error: configs.error.message,
                }
              : {
                  isLoading: false,
                  isError: false,
                  data: configs.data?.configs.map((config) => ({
                    id: config.id,
                    name: config.name,
                    dataType: config.dataType,
                    description: config.description,
                    createdAt: config.createdAt.toLocaleString(),
                    updatedAt: config.updatedAt.toLocaleString(),
                    range: {
                      maxValue: config.maxValue,
                      minValue: config.minValue,
                      categories: config.categories,
                    },
                  })),
                }
        }
        pagination={{
          pageCount: Math.ceil(totalCount / paginationState.pageSize),
          onChange: setPaginationState,
          state: paginationState,
        }}
        columnVisibility={columnVisibility}
        onColumnVisibilityChange={setColumnVisibility}
        rowHeight={rowHeight}
      />
    </>
  );
}

export function ScoreConfigs({ projectId }: { projectId: string }) {
  // const capture = usePostHogClientCapture();
  const hasReadAccess = useHasAccess({
    projectId: projectId,
    scope: "scoreConfigs:read",
  });

  if (!hasReadAccess) return null;

  return (
    <div>
      <Header title="Score Configs" level="h3" />
      <Card className="flex max-h-[calc(100dvh-40rem)] flex-col overflow-hidden p-4">
        <div className="grid grid-cols-2 items-center justify-between">
          <Header title="Configs" />
          <CreateScoreConfigButton projectId={projectId} />
        </div>
        <span className="text-sm">
          Score configs define which scores are available for annotation in your
          project. Please note that all score configs are immutable.
        </span>
        <ScoreConfigsTable projectId={projectId} />
      </Card>
    </div>
  );
}
function getConfigRange(
  originalRow: ScoreConfigTableRow,
): Prisma.JsonValue | undefined {
  const { range, dataType } = originalRow;
  if (isNumeric(dataType)) {
    return [{ minValue: range.minValue, maxValue: range.maxValue }];
  }
  return range.categories;
}
