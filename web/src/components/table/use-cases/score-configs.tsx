import React from "react";
import { Card } from "@/src/components/ui/card";
import { useRowHeightLocalStorage } from "@/src/components/table/data-table-row-height-switch";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { api } from "@/src/utils/api";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import { DataTable } from "@/src/components/table/data-table";
import {
  type ScoreDataType,
  type Prisma,
  type ConfigCategory,
} from "@langfuse/shared";
import { IOTableCell } from "@/src/components/ui/CodeJsonViewer";
import { NumberParam, useQueryParams, withDefault } from "use-query-params";
import {
  isBooleanDataType,
  isCategoricalDataType,
  isNumericDataType,
} from "@/src/features/manual-scoring/lib/helpers";
import { Archive } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useHasAccess } from "@/src/features/rbac/utils/checkAccess";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import useLocalStorage from "@/src/components/useLocalStorage";

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
  isArchived: boolean;
};

function getConfigRange(
  originalRow: ScoreConfigTableRow,
): Prisma.JsonValue | undefined {
  const { range, dataType } = originalRow;

  if (isNumericDataType(dataType)) {
    return {
      Minimum: range.minValue ?? "-∞",
      Maximum: range.maxValue ?? "∞",
    };
  }

  if (isCategoricalDataType(dataType) || isBooleanDataType(dataType)) {
    const configCategories = (range.categories as ConfigCategory[]) ?? [];

    return configCategories.reduce(
      (acc, category) => {
        acc[category.value] = category.label;
        return acc;
      },
      {} as Record<number, string>,
    );
  }
}

export function ScoreConfigsTable({ projectId }: { projectId: string }) {
  const utils = api.useUtils();
  const capture = usePostHogClientCapture();
  const [emptySelectedConfigIds, setEmptySelectedConfigIds] = useLocalStorage<
    string[]
  >("emptySelectedConfigIds", []);

  const hasAccess = useHasAccess({
    projectId: projectId,
    scope: "scoreConfigs:CUD",
  });

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
      accessorKey: "isArchived",
      id: "isArchived",
      header: "Status",
      enableHiding: true,
      cell: ({ row }) => {
        const { isArchived } = row.original;
        return isArchived ? "Archived" : "Active";
      },
    },
    {
      accessorKey: "action",
      header: "Action",
      enableHiding: true,
      cell: ({ row }) => {
        const { id: configId, isArchived, name } = row.original;
        const configMutation = api.scoreConfigs.update.useMutation({
          onSuccess: () => void utils.scoreConfigs.invalidate(),
        });

        return (
          <Popover key={configId}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="xs"
                disabled={!hasAccess}
                onClick={() => capture("score_configs:archive_form_open")}
              >
                <Archive className="h-4 w-4"></Archive>
              </Button>
            </PopoverTrigger>
            <PopoverContent>
              <h2 className="text-md mb-3 font-semibold">
                {isArchived ? "Restore config" : "Archive config"}
              </h2>
              <p className="mb-3 text-sm">
                Your config is currently{" "}
                {isArchived
                  ? `archived. Restore if you want to use "${name}" in annotation again.`
                  : `active. Archive if you no longer want to use "${name}" in annotation. Historic "${name}" scores will still be shown and can be deleted. You can restore your config at any point.`}
              </p>
              <div className="flex justify-end space-x-4">
                <Button
                  type="button"
                  variant={isArchived ? "default" : "destructive"}
                  loading={configMutation.isLoading}
                  onClick={() => {
                    void configMutation.mutateAsync({
                      projectId,
                      id: configId,
                      isArchived: !isArchived,
                    });
                    setEmptySelectedConfigIds(
                      emptySelectedConfigIds.filter((id) => id !== configId),
                    );
                    capture("score_configs:archive_form_submit");
                  }}
                >
                  Confirm
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        );
      },
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
      <Card className="mb-4 flex max-h-[calc(100dvh-30rem)] flex-col overflow-hidden">
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
                      isArchived: config.isArchived,
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
          className="gap-2"
          paginationClassName="-mx-2 mb-2"
          isBorderless
        />
      </Card>
    </>
  );
}
