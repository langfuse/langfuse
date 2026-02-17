import React, { useState } from "react";
import { useRowHeightLocalStorage } from "@/src/components/table/data-table-row-height-switch";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { api } from "@/src/utils/api";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import { DataTable } from "@/src/components/table/data-table";
import {
  type ScoreConfigDataType,
  type Prisma,
  type ScoreConfigCategoryDomain,
} from "@langfuse/shared";
import { IOTableCell } from "../../ui/IOTableCell";
import { usePaginationState } from "@/src/hooks/usePaginationState";
import {
  isBooleanDataType,
  isCategoricalDataType,
  isNumericDataType,
} from "@/src/features/scores/lib/helpers";
import { Edit, MoreVertical } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import useColumnOrder from "@/src/features/column-visibility/hooks/useColumnOrder";
import { SettingsTableCard } from "@/src/components/layouts/settings-table-card";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/src/components/ui/dropdown-menu";
import { ArchiveScoreConfigButton } from "@/src/features/score-configs/components/ArchiveScoreConfigButton";
import { UpsertScoreConfigDialog } from "@/src/features/score-configs/components/UpsertScoreConfigDialog";

type ScoreConfigTableRow = {
  id: string;
  name: string;
  dataType: ScoreConfigDataType;
  createdAt: string;
  updatedAt: string;
  range: {
    maxValue?: number | null;
    minValue?: number | null;
    categories?: ScoreConfigCategoryDomain[] | null;
  };
  description?: string | null;
  isArchived: boolean;
};

function getConfigRange(
  originalRow: ScoreConfigTableRow,
): undefined | Prisma.JsonValue {
  const { range, dataType } = originalRow;

  if (isNumericDataType(dataType)) {
    return {
      Minimum: range.minValue ?? "-∞",
      Maximum: range.maxValue ?? "∞",
    };
  }

  if (isCategoricalDataType(dataType) || isBooleanDataType(dataType)) {
    const configCategories = range.categories ?? [];

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
  const [editConfigId, setEditConfigId] = useState<string | null>(null);
  const [createConfigOpen, setCreateConfigOpen] = useState(false);
  const [paginationState, setPaginationState] = usePaginationState(0, 50, {
    page: "pageIndex",
    limit: "pageSize",
  });

  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "scoreConfigs:CUD",
  });

  const [rowHeight, setRowHeight] = useRowHeightLocalStorage(
    "scoreConfigs",
    "s",
  );

  const configs = api.scoreConfigs.all.useQuery(
    {
      projectId,
      page: paginationState.pageIndex,
      limit: paginationState.pageSize,
    },
    { enabled: hasAccess },
  );

  const configQuery = api.scoreConfigs.byId.useQuery(
    { projectId, id: editConfigId as string },
    { enabled: !!editConfigId && hasAccess },
  );

  const totalCount = configs.data?.totalCount ?? null;

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
      size: 80,
      enableHiding: true,
    },
    {
      accessorKey: "range",
      id: "range",
      header: "Range",
      enableHiding: true,
      size: 300,
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
      size: 80,
      enableHiding: true,
      cell: ({ row }) => {
        const { isArchived } = row.original;
        return isArchived ? "Archived" : "Active";
      },
    },
    {
      accessorKey: "action",
      header: "Action",
      size: 70,
      isFixedPosition: true,
      enableHiding: true,
      cell: ({ row }) => {
        const { id: configId, isArchived, name } = row.original;

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem
                key={configId}
                aria-label="edit"
                onClick={() => setEditConfigId(configId)}
              >
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem asChild key="archive">
                <ArchiveScoreConfigButton
                  configId={configId}
                  projectId={projectId}
                  isArchived={isArchived}
                  name={name}
                />
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  const [columnVisibility, setColumnVisibility] =
    useColumnVisibility<ScoreConfigTableRow>(
      "scoreConfigsColumnVisibility",
      columns,
    );

  const [columnOrder, setColumnOrder] = useColumnOrder<ScoreConfigTableRow>(
    "scoreConfigsColumnOrder",
    columns,
  );

  return (
    <>
      <DataTableToolbar
        columns={columns}
        columnVisibility={columnVisibility}
        setColumnVisibility={setColumnVisibility}
        columnOrder={columnOrder}
        setColumnOrder={setColumnOrder}
        rowHeight={rowHeight}
        setRowHeight={setRowHeight}
        actionButtons={
          <UpsertScoreConfigDialog
            key="new-config-dialog"
            projectId={projectId}
            open={createConfigOpen}
            onOpenChange={setCreateConfigOpen}
          />
        }
        className="px-0"
      />
      <SettingsTableCard>
        <DataTable
          tableName={"scoreConfigs"}
          columns={columns}
          data={
            configs.isPending
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
            totalCount,
            onChange: setPaginationState,
            state: paginationState,
          }}
          columnVisibility={columnVisibility}
          onColumnVisibilityChange={setColumnVisibility}
          columnOrder={columnOrder}
          onColumnOrderChange={setColumnOrder}
          rowHeight={rowHeight}
          className="gap-2"
        />
      </SettingsTableCard>

      {!!editConfigId && configQuery.isSuccess && (
        <UpsertScoreConfigDialog
          key={editConfigId}
          id={editConfigId}
          projectId={projectId}
          open={!!editConfigId && configQuery.isSuccess}
          onOpenChange={(open) => {
            if (!open) setEditConfigId(null);
          }}
          defaultValues={
            configQuery.data
              ? {
                  id: editConfigId,
                  name: configQuery.data.name,
                  dataType: configQuery.data.dataType,
                  minValue: configQuery.data.minValue ?? undefined,
                  maxValue: configQuery.data.maxValue ?? undefined,
                  description: configQuery.data.description ?? undefined,
                  categories: configQuery.data.categories?.length
                    ? configQuery.data.categories
                    : undefined,
                }
              : undefined
          }
        />
      )}
    </>
  );
}
