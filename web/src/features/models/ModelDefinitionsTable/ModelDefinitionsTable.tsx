import { Copy, Pencil, Trash } from "@langfuse/icons";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { type PaginationBarProps } from "@/src/components/design-system/PaginationBar/PaginationBar";
import { type TableProps } from "@/src/components/design-system/table/Table";
import {
  SettingsTable,
  type SettingsTableProps,
} from "@/src/components/SettingsTable/SettingsTable";
import { type RowHeight } from "@/src/components/table/data-table-row-height-switch";
import { createBadgeTableColumn } from "@/src/components/design-system/table/columns/createBadgeTableColumn";
import { createDateTableColumn } from "@/src/components/design-system/table/columns/createDateTableColumn";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import { type GetModelResult } from "@/src/features/models/validation";
import {
  type ModelMaintainer,
  modelMaintainerBadgeVariant,
} from "@/src/features/models/modelMaintainer";

export type ModelTableRow = {
  modelId: string;
  maintainer: ModelMaintainer;
  modelName: string;
  matchPattern: string;
  /** Owned by the page's owner; other definitions can only be cloned. */
  editable: boolean;
  serverResponse: GetModelResult;
};

const modelConfigDescriptions = {
  modelName:
    "Standardized model name. Generations are assigned to this model name if they match the `matchPattern` upon ingestion.",
  matchPattern:
    "Regex pattern to match `model` parameter of generations to model pricing",
  startDate:
    "Date to start pricing model. If not set, model is active unless a more recent version exists.",
  maintainer:
    "Maintainer of the model. Langfuse and organization managed models can be cloned, user managed models can be edited and deleted. To supersede a Langfuse or organization managed model, set the custom model name to its model name.",
  lastUsed: "Start time of the latest generation using this model",
} as const;

export function ModelDefinitionsTable({
  data,
  pagination,
  search,
  rowHeight,
  onRowHeightChange,
  lastUsed,
  toolbarActions,
  modelActions,
  onRowClick,
}: {
  data: TableProps<ModelTableRow>["data"];
  pagination: PaginationBarProps;
  search: { value: string; onChange: (value: string) => void };
  rowHeight: RowHeight;
  onRowHeightChange: (height: RowHeight) => void;
  lastUsed?: Record<string, Date>;
  toolbarActions?: SettingsTableProps<ModelTableRow>["toolbarActions"];
  modelActions: {
    canEdit: boolean;
    onClone: (model: ModelTableRow) => void;
    onEdit: (model: ModelTableRow) => void;
    onDelete: (model: ModelTableRow) => void;
  };
  onRowClick: (model: ModelTableRow) => void;
}) {
  const columns: LangfuseColumnDef<ModelTableRow>[] = [
    createTextTableColumn<ModelTableRow>({
      accessorKey: "modelName",
      header: "Model Name",
      headerTooltip: {
        description: modelConfigDescriptions.modelName,
      },
      size: 120,
    }),
    createBadgeTableColumn<ModelTableRow>({
      accessorKey: "maintainer",
      header: "Maintainer",
      headerTooltip: {
        description: modelConfigDescriptions.maintainer,
      },
      size: 60,
      range: "decorative",
      getBadge: (maintainer, { row }) => ({
        value: maintainer,
        variant: modelMaintainerBadgeVariant[row.original.maintainer],
      }),
    }),
    createTextTableColumn<ModelTableRow>({
      accessorKey: "matchPattern",
      headerTooltip: {
        description: modelConfigDescriptions.matchPattern,
      },
      header: "Match Pattern",
      size: 200,
    }),
    createDateTableColumn<ModelTableRow>({
      accessorFn: () => undefined,
      id: "lastUsed",
      header: "Last used",
      emptyValue: "-",
      headerTooltip: {
        description: modelConfigDescriptions.lastUsed,
      },
      enableHiding: true,
      size: 120,
      getValue: (_, { row }) => {
        if (!lastUsed) return { type: "loading" };
        return lastUsed[row.original.modelId];
      },
    }),
  ];

  return (
    <SettingsTable
      tableName="models"
      columns={columns}
      actions={(model) =>
        !model.editable
          ? [
              {
                id: "clone",
                type: "item",
                title: "Clone model",
                icon: Copy,
                disabled: modelActions.canEdit
                  ? undefined
                  : {
                      reason: "You do not have permission to clone this model",
                    },
                onClick: () => modelActions.onClone(model),
              },
            ]
          : [
              {
                id: "edit",
                type: "item",
                title: "Edit model",
                icon: Pencil,
                disabled: modelActions.canEdit
                  ? undefined
                  : { reason: "You do not have permission to edit this model" },
                onClick: () => modelActions.onEdit(model),
              },
              {
                id: "delete",
                type: "item",
                title: "Delete model",
                icon: Trash,
                variant: "destructive",
                disabled: modelActions.canEdit
                  ? undefined
                  : {
                      reason: "You do not have permission to delete this model",
                    },
                onClick: () => modelActions.onDelete(model),
              },
            ]
      }
      columnVisibilityKey="modelsColumnVisibility"
      columnOrderKey="modelsColumnOrder"
      data={data}
      pagination={pagination}
      loadingRowCount={Math.min(pagination.state.pageSize, 8)}
      search={{ ...search, placeholder: "Search models" }}
      rowHeight={rowHeight}
      rowHeightControl={{ rowHeight, onRowHeightChange }}
      toolbarActions={toolbarActions}
      onRowClick={onRowClick}
    />
  );
}
