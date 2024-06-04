import React from "react";
import { Card } from "@/src/components/ui/card";
import Header from "@/src/components/layouts/header";
import { useRowHeightLocalStorage } from "@/src/components/table/data-table-row-height-switch";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { api } from "@/src/utils/api";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import { DataTable } from "@/src/components/table/data-table";
import { type ScoreDataType, type Prisma } from "@langfuse/shared";
import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";
import { IOTableCell } from "@/src/components/ui/CodeJsonViewer";
import { CreateScoreConfigButton } from "@/src/features/manual-scoring/components/CreateScoreConfigButton";
import { isNumericDataType } from "@/src/features/manual-scoring/lib/helpers";

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
  const [rowHeight, setRowHeight] = useRowHeightLocalStorage(
    "scoreConfigs",
    "s",
  );

  const configs = api.scoreConfigs.all.useQuery({
    projectId,
  });

  const columns: LangfuseColumnDef<ScoreConfigTableRow>[] = [
    {
      accessorKey: "name",
      id: "name",
      header: "Name",
      enableHiding: true,
    },
    {
      accessorKey: "dataType",
      id: "dataType",
      header: "Data Type",
      enableHiding: true,
    },
    {
      accessorKey: "range",
      id: "range",
      header: "Range",
      enableHiding: true,
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
      cell: ({ row }) => {
        const value = row.original.description;

        return !!value ? (
          <IOTableCell data={value} singleLine={rowHeight === "s"} />
        ) : null;
      },
    },
    {
      accessorKey: "id",
      id: "id",
      header: "Config ID",
      enableHiding: true,
      defaultHidden: true,
    },
    {
      accessorKey: "createdAt",
      id: "createdAt",
      header: "Created At",
      enableHiding: true,
      defaultHidden: true,
    },
    {
      accessorKey: "updatedAt",
      id: "updatedAt",
      header: "Updated At",
      enableHiding: true,
      defaultHidden: true,
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
      <Card className="mb-4 flex max-h-[calc(100dvh-40rem)] flex-col overflow-hidden">
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
          columnVisibility={columnVisibility}
          onColumnVisibilityChange={setColumnVisibility}
          rowHeight={rowHeight}
          className="gap-0"
          isBorderless
        />
      </Card>
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
      <span className="mb-4 flex text-sm">
        Score configs define which scores are available for annotation in your
        project. Please note that all score configs are immutable.
      </span>

      <ScoreConfigsTable projectId={projectId} />
      <CreateScoreConfigButton projectId={projectId} />
    </div>
  );
}

function getConfigRange(
  originalRow: ScoreConfigTableRow,
): Prisma.JsonValue | undefined {
  const { range, dataType } = originalRow;
  if (isNumericDataType(dataType)) {
    return [
      { minValue: range.minValue ?? "-∞", maxValue: range.maxValue ?? "∞" },
    ];
  }
  return range.categories;
}
