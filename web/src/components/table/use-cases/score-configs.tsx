import React from "react";
import { useRowHeightLocalStorage } from "@/src/components/table/data-table-row-height-switch";
import useColumnVisibility from "@/src/features/column-visibility/hooks/useColumnVisibility";
import { api } from "@/src/utils/api";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { createIOTableColumn } from "@/src/components/design-system/table/columns/createIOTableColumn";
import { DataTableToolbar } from "@/src/components/table/data-table-toolbar";
import { DataTable } from "@/src/components/table/data-table";
import {
  type ScoreConfigDataType,
  type Prisma,
  type ScoreConfigCategoryDomain,
} from "@langfuse/shared";
import { usePaginationState } from "@/src/hooks/usePaginationState";
import {
  isBooleanDataType,
  isCategoricalDataType,
  isNumericDataType,
} from "@/src/features/scores/lib/helpers";
import { Archive, Edit, MoreVertical, PlusIcon } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import useColumnOrder from "@/src/features/column-visibility/hooks/useColumnOrder";
import { SettingsTableCard } from "@/src/components/layouts/settings-table-card";
import { createDateTableColumn } from "@/src/components/design-system/table/columns/createDateTableColumn";
import { createIdTableColumn } from "@/src/components/design-system/table/columns/createIdTableColumn";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/src/components/ui/dropdown-menu";
import { ArchiveScoreConfigPopoverController } from "@/src/features/score-configs/components/ArchiveScoreConfigButton";
import { UpsertScoreConfigDialogController } from "@/src/features/score-configs/components/UpsertScoreConfigDialogController";

type ScoreConfigTableRow = {
  id: string;
  name: string;
  dataType: ScoreConfigDataType;
  createdAt: Date;
  updatedAt: Date;
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

  const totalCount = configs.data?.totalCount ?? null;

  const columns: LangfuseColumnDef<ScoreConfigTableRow>[] = [
    createTextTableColumn<ScoreConfigTableRow>({
      accessorKey: "name",
      header: "Name",
      enableHiding: true,
    }),
    createTextTableColumn<ScoreConfigTableRow>({
      accessorKey: "dataType",
      header: "Data Type",
      size: 80,
      enableHiding: true,
    }),
    createIOTableColumn<ScoreConfigTableRow, Prisma.JsonValue>({
      id: "range",
      accessorFn: getConfigRange,
      header: "Range",
      enableHiding: true,
      size: 300,
      getCell: (value) => value || undefined,
      singleLine: rowHeight === "s",
    }),
    createIOTableColumn<ScoreConfigTableRow>({
      accessorKey: "description",
      header: "Description",
      enableHiding: true,
      getCell: (value) => value || undefined,
      singleLine: rowHeight === "s",
    }),
    createIdTableColumn<ScoreConfigTableRow>({
      accessorKey: "id",
      header: "Config ID",
      enableHiding: true,
      defaultHidden: true,
    }),
    createDateTableColumn<ScoreConfigTableRow>({
      accessorKey: "createdAt",
      header: "Created At",
      enableHiding: true,
      defaultHidden: true,
    }),
    createTextTableColumn<ScoreConfigTableRow, boolean>({
      accessorKey: "isArchived",
      header: "Status",
      size: 80,
      enableHiding: true,
      mapValue: (isArchived) => (isArchived ? "Archived" : "Active"),
    }),
    {
      accessorKey: "action",
      header: "Action",
      size: 70,
      isFixedPosition: true,
      enableHiding: true,
      cell: ({ row }) => {
        const { id: configId, isArchived, name } = row.original;

        return (
          <UpsertScoreConfigDialogController
            mode="edit"
            projectId={projectId}
            defaultValues={{
              id: configId,
              name,
              dataType: row.original.dataType,
              minValue: row.original.range.minValue ?? undefined,
              maxValue: row.original.range.maxValue ?? undefined,
              description: row.original.description ?? undefined,
              categories: row.original.range.categories?.length
                ? row.original.range.categories
                : undefined,
            }}
          >
            {({ disabled: editDisabled, Trigger }) => (
              <ArchiveScoreConfigPopoverController
                configId={configId}
                projectId={projectId}
                isArchived={isArchived}
                name={name}
              >
                {({ Anchor, disabled, openPopover }) => (
                  <DropdownMenu>
                    <Anchor asChild>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                    </Anchor>
                    <DropdownMenuContent>
                      <Trigger asChild>
                        <DropdownMenuItem
                          aria-label="edit"
                          disabled={editDisabled !== undefined}
                          title={editDisabled?.reason}
                        >
                          <Edit className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                      </Trigger>
                      <DropdownMenuItem
                        key="archive"
                        disabled={disabled !== undefined}
                        title={disabled?.reason}
                        onClick={(event) => event.stopPropagation()}
                        onSelect={openPopover}
                      >
                        <Archive className="mr-2 h-4 w-4" />
                        Archive
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </ArchiveScoreConfigPopoverController>
            )}
          </UpsertScoreConfigDialogController>
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
          <UpsertScoreConfigDialogController
            key="new-config-dialog"
            mode="create"
            projectId={projectId}
          >
            {({ disabled, isSubmitting, Trigger }) => (
              <Trigger asChild>
                <Button
                  variant="secondary"
                  disabled={disabled !== undefined}
                  loading={isSubmitting}
                  title={disabled?.reason}
                >
                  <PlusIcon
                    className="mr-1.5 -ml-0.5 h-4 w-4"
                    aria-hidden="true"
                  />
                  Add new score config
                </Button>
              </Trigger>
            )}
          </UpsertScoreConfigDialogController>
        }
        className="px-0"
      />
      <SettingsTableCard>
        <DataTable
          tableName="scoreConfigs"
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
                      createdAt: config.createdAt,
                      updatedAt: config.updatedAt,
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
          cellPadding="comfortable"
          className="gap-2"
        />
      </SettingsTableCard>
    </>
  );
}
