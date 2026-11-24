import { Copy, Pencil, Trash } from "@langfuse/icons";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { type PaginationBarProps } from "@/src/components/design-system/PaginationBar/PaginationBar";
import { type TableProps } from "@/src/components/design-system/table/Table";
import {
  TableCard,
  type TableCardProps,
} from "@/src/components/TableCard/TableCard";
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
  /** A higher-precedence maintainer defines the same name. */
  isOverridden: boolean;
  serverResponse: GetModelResult;
};

const modelConfigDescriptions = {
  modelName:
    "Name shown on the generations this model matches. The match pattern, not the name, decides which model applies.",
  matchPattern:
    "Regex matched against the model name of ingested generations. A matching project model is used first, then organization, then Langfuse.",
  startDate:
    "Date to start pricing model. If not set, model is active unless a more recent version exists.",
  maintainer:
    "Who maintains the model. When several models match a generation, project models win over organization models, which win over Langfuse defaults. Clone a model to override it.",
  overridden:
    "A higher-precedence model has the same name. It applies instead wherever its match pattern also matches.",
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
  cloneLabel,
  onRowClick,
}: {
  data: TableProps<ModelTableRow>["data"];
  pagination: PaginationBarProps;
  search: { value: string; onChange: (value: string) => void };
  rowHeight: RowHeight;
  onRowHeightChange: (height: RowHeight) => void;
  /** Omit to hide the column; pass "loading" while it is fetched. */
  lastUsed?: Record<string, Date> | "loading";
  toolbarActions?: TableCardProps<ModelTableRow>["toolbarActions"];
  modelActions: {
    canEdit: boolean;
    onClone: (model: ModelTableRow) => void;
    onEdit: (model: ModelTableRow) => void;
    onDelete: (model: ModelTableRow) => void;
  };
  /** Clone targets the page's owner, e.g. "Clone to project". */
  cloneLabel: string;
  onRowClick: (model: ModelTableRow) => void;
}) {
  const columns: LangfuseColumnDef<ModelTableRow>[] = [
    createTextTableColumn<ModelTableRow>({
      accessorKey: "modelName",
      header: "Model name",
      headerTooltip: {
        description: modelConfigDescriptions.modelName,
      },
      size: 120,
      status: ({ row }) =>
        row.original.isOverridden
          ? {
              label: "Overridden",
              description: modelConfigDescriptions.overridden,
            }
          : undefined,
    }),
    createBadgeTableColumn<ModelTableRow>({
      accessorKey: "maintainer",
      header: "Maintainer",
      headerTooltip: {
        description: modelConfigDescriptions.maintainer,
      },
      size: 90,
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
    ...(lastUsed === undefined
      ? []
      : [
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
              if (lastUsed === "loading") return { type: "loading" };
              return lastUsed[row.original.modelId];
            },
          }),
        ]),
  ];

  return (
    <TableCard
      tableName="models"
      columns={columns}
      actions={(model) =>
        !model.editable
          ? [
              {
                id: "clone",
                type: "item",
                title: cloneLabel,
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
