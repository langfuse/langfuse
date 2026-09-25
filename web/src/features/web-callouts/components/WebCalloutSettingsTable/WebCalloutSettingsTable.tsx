import { useCallback, useMemo } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";

import {
  SettingsTable,
  type SettingsTableProps,
} from "@/src/components/SettingsTable/SettingsTable";
import { type TableProps } from "@/src/components/design-system/table/Table";
import { createStatusTableColumn } from "@/src/components/design-system/table/columns/createStatusTableColumn";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { type RouterOutputs } from "@/src/utils/api";

export type WebCalloutEndpoint = RouterOutputs["webCallouts"]["all"][number];

export function WebCalloutSettingsTable({
  createAction,
  onEdit,
  onDelete,
  ...tableProps
}: Pick<TableProps<WebCalloutEndpoint>, "data" | "noResultsMessage"> & {
  createAction: { disabledReason?: string; onClick: () => void };
  onEdit: (endpoint: WebCalloutEndpoint) => void;
  onDelete: (endpoint: WebCalloutEndpoint) => void;
}) {
  const columns = useMemo<LangfuseColumnDef<WebCalloutEndpoint>[]>(
    () => [
      createTextTableColumn<WebCalloutEndpoint>({
        accessorKey: "name",
        header: "Name",
      }),
      createTextTableColumn<WebCalloutEndpoint>({
        accessorKey: "url",
        header: "Endpoint",
        size: 576,
      }),
      createTextTableColumn<WebCalloutEndpoint>({
        accessorKey: "toastMessage",
        header: "Toast Message",
      }),
      createTextTableColumn<WebCalloutEndpoint, string[]>({
        accessorKey: "requestHeaderKeys",
        header: "Headers",
        mapValue: (headers) => (headers?.length ? headers.join(", ") : "None"),
      }),
      createStatusTableColumn<WebCalloutEndpoint, boolean>({
        accessorKey: "enabled",
        header: "Status",
        getStatus: (enabled) => (enabled ? "active" : "disabled"),
      }),
    ],
    [],
  );

  const actions = useCallback<
    NonNullable<TableProps<WebCalloutEndpoint>["actions"]>
  >(
    (endpoint) => [
      {
        id: "edit",
        type: "item",
        title: "Edit endpoint",
        icon: Pencil,
        onClick: () => onEdit(endpoint),
      },
      {
        id: "delete",
        type: "item",
        title: "Delete endpoint",
        icon: Trash2,
        variant: "destructive",
        onClick: () => onDelete(endpoint),
      },
    ],
    [onEdit, onDelete],
  );

  const toolbarActions: SettingsTableProps<WebCalloutEndpoint>["toolbarActions"] =
    [
      {
        id: "add-endpoint",
        label: "Add endpoint",
        variant: "secondary",
        icon: <Plus className="size-4" aria-hidden="true" />,
        disabled: Boolean(createAction.disabledReason),
        title: createAction.disabledReason,
        onClick: createAction.onClick,
      },
    ];

  return (
    <SettingsTable
      tableName="Web callout endpoints"
      columns={columns}
      actions={actions}
      toolbarActions={toolbarActions}
      {...tableProps}
    />
  );
}
