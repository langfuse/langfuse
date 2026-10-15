import { useCallback, useMemo } from "react";
import { Archive, PlusIcon } from "lucide-react";
import {
  type Prisma,
  type ScoreConfigCategoryDomain,
  type ScoreConfigDataType,
} from "@langfuse/shared";

import { type PaginationBarProps } from "@/src/components/design-system/PaginationBar/PaginationBar";
import {
  type AsyncTableData,
  type TableProps,
} from "@/src/components/design-system/table/Table";
import { createButtonTableColumn } from "@/src/components/design-system/table/columns/createButtonTableColumn";
import { createBadgeTableColumn } from "@/src/components/design-system/table/columns/createBadgeTableColumn";
import { createDateTableColumn } from "@/src/components/design-system/table/columns/createDateTableColumn";
import { createIdTableColumn } from "@/src/components/design-system/table/columns/createIdTableColumn";
import { createIOTableColumn } from "@/src/components/design-system/table/columns/createIOTableColumn";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import {
  SettingsTable,
  type SettingsTableProps,
} from "@/src/components/SettingsTable/SettingsTable";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import {
  isBooleanDataType,
  isCategoricalDataType,
  isNumericDataType,
} from "@/src/features/scores";

export type ScoreConfigTableRow = {
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

export function ScoreConfigsTable({
  data,
  pagination,
  createAction,
  editAction,
  archiveAction,
}: {
  data: AsyncTableData<ScoreConfigTableRow[]>;
  pagination: PaginationBarProps;
  createAction: {
    disabled: { reason: string } | undefined;
    loading: boolean;
    onClick: () => void;
  };
  editAction: {
    disabled: { reason: string } | undefined;
    openDialog: (config: ScoreConfigTableRow) => void;
  };
  archiveAction: {
    disabled: { reason: string } | undefined;
    openDialog: (config: ScoreConfigTableRow) => void;
  };
}) {
  const columns = useMemo<LangfuseColumnDef<ScoreConfigTableRow>[]>(
    () => [
      createTextTableColumn<ScoreConfigTableRow>({
        accessorKey: "name",
        header: "Name",
        enableHiding: true,
      }),
      createBadgeTableColumn<ScoreConfigTableRow>({
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
        singleLine: true,
      }),
      createIOTableColumn<ScoreConfigTableRow>({
        accessorKey: "description",
        header: "Description",
        enableHiding: true,
        getCell: (value) => value || undefined,
        singleLine: true,
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
      createButtonTableColumn<ScoreConfigTableRow, string>({
        id: "edit",
        accessorFn: (config) => config.id,
        header: "",
        size: 80,
        getButton: ({ row }) => ({
          text: "Edit",
          disabled: !!editAction.disabled,
          disabledReason: editAction.disabled?.reason,
          onClick: () => editAction.openDialog(row.original),
        }),
      }),
      createBadgeTableColumn<ScoreConfigTableRow>({
        id: "status",
        accessorFn: (config) => (config.isArchived ? "Archived" : "Active"),
        header: "Status",
        size: 80,
        enableHiding: true,
      }),
    ],
    [editAction],
  );

  const actions = useCallback<
    NonNullable<TableProps<ScoreConfigTableRow>["actions"]>
  >(
    (config) => [
      {
        id: "archive",
        type: "item",
        title: config.isArchived ? "Restore" : "Archive",
        icon: Archive,
        variant: config.isArchived ? undefined : "destructive",
        disabled: archiveAction.disabled,
        onClick: () => archiveAction.openDialog(config),
      },
    ],
    [archiveAction],
  );

  const toolbarActions: SettingsTableProps<ScoreConfigTableRow>["toolbarActions"] =
    [
      {
        id: "add-score-config",
        label: "Add new score config",
        variant: "secondary",
        icon: <PlusIcon className="icon-base" aria-hidden="true" />,
        disabled: createAction.disabled !== undefined,
        loading: createAction.loading,
        title: createAction.disabled?.reason,
        onClick: createAction.onClick,
      },
    ];

  return (
    <SettingsTable
      tableName="score configs"
      columns={columns}
      actions={actions}
      data={data}
      pagination={pagination}
      columnVisibilityKey="scoreConfigsColumnVisibility"
      columnOrderKey="scoreConfigsColumnOrder"
      toolbarActions={toolbarActions}
    />
  );
}
