import { type ReactNode } from "react";
import { type Prisma } from "@langfuse/shared/src/db";
import { Copy, Pencil, Trash } from "lucide-react";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { type PaginationBarProps } from "@/src/components/design-system/PaginationBar/PaginationBar";
import { type TableProps } from "@/src/components/design-system/table/Table";
import {
  SettingsTable,
  type SettingsTableProps,
} from "@/src/components/SettingsTable/SettingsTable";
import { type RowHeight } from "@/src/components/table/data-table-row-height-switch";
import { createIOTableColumn } from "@/src/components/design-system/table/columns/createIOTableColumn";
import { createBadgeTableColumn } from "@/src/components/design-system/table/columns/createBadgeTableColumn";
import { createDateTableColumn } from "@/src/components/design-system/table/columns/createDateTableColumn";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import {
  type GetModelResult,
  type PriceUnit,
} from "@/src/features/models/validation";
import { PriceBreakdownTooltip } from "@/src/features/models/components/PriceBreakdownTooltip";

export type ModelTableRow = {
  modelId: string;
  maintainer: "User" | "Langfuse";
  modelName: string;
  matchPattern: string;
  prices?: Record<string, number>;
  tokenizerId?: string;
  config?: Prisma.JsonValue;
  serverResponse: GetModelResult;
};

const modelConfigDescriptions = {
  modelName:
    "Standardized model name. Generations are assigned to this model name if they match the `matchPattern` upon ingestion.",
  matchPattern:
    "Regex pattern to match `model` parameter of generations to model pricing",
  startDate:
    "Date to start pricing model. If not set, model is active unless a more recent version exists.",
  prices: "Prices per usage type",
  tokenizerId:
    "Tokenizer used for this model to calculate token counts if none are ingested. Pick from list of supported tokenizers.",
  config:
    "Some tokenizers require additional configuration (e.g. openai tiktoken). See docs for details.",
  maintainer:
    "Maintainer of the model. Langfuse managed models can be cloned, user managed models can be edited and deleted. To supersede a Langfuse managed model, set the custom model name to the Langfuse model name.",
  lastUsed: "Start time of the latest generation using this model",
} as const;

export function ModelDefinitionsTable({
  data,
  pagination,
  search,
  rowHeight,
  onRowHeightChange,
  priceUnit,
  priceUnitMultiplier,
  priceUnitSelector,
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
  priceUnit: PriceUnit;
  priceUnitMultiplier: number;
  priceUnitSelector?: ReactNode;
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
      getBadge: (maintainer) => ({
        value: maintainer,
        variant: maintainer === "Langfuse" ? "teal" : "blue",
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
    {
      accessorKey: "prices",
      id: "prices",
      header: () => {
        return (
          <div className="flex items-center gap-2">
            <span>Prices {priceUnit}</span>
            {priceUnitSelector}
          </div>
        );
      },
      size: 120,
      cell: ({ row }) => {
        const prices: Record<string, number> | undefined =
          row.getValue("prices");

        if (!prices) return;

        return (
          <PriceBreakdownTooltip
            modelName={row.original.modelName}
            prices={prices}
            priceUnit={priceUnit}
            priceUnitMultiplier={priceUnitMultiplier}
            rowHeight={rowHeight}
          />
        );
      },
      enableHiding: true,
    },
    createTextTableColumn<ModelTableRow>({
      accessorKey: "tokenizerId",
      header: "Tokenizer",
      headerTooltip: {
        description: modelConfigDescriptions.tokenizerId,
      },
      enableHiding: true,
      size: 120,
    }),
    createIOTableColumn<ModelTableRow>({
      accessorKey: "config",
      header: "Tokenizer Configuration",
      headerTooltip: {
        description: modelConfigDescriptions.config,
      },
      enableHiding: true,
      size: 120,
      getCell: (value) => value || undefined,
      singleLine: rowHeight === "s",
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
        model.maintainer === "Langfuse"
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
