import { useCallback, useMemo } from "react";
import { Pencil, PlusIcon, Trash } from "lucide-react";

import { type TableProps } from "@/src/components/design-system/table/Table";
import { createBadgeTableColumn } from "@/src/components/design-system/table/columns/createBadgeTableColumn";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import {
  SettingsTable,
  type SettingsTableProps,
} from "@/src/components/SettingsTable/SettingsTable";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { type RouterOutput } from "@/src/utils/types";

export type LLMApiKeySettingsTableRow =
  RouterOutput["llmApiKey"]["all"]["data"][number];

export function LLMApiKeySettingsTable({
  createAction,
  deleteAction,
  updateAction,
  ...tableProps
}: Pick<
  TableProps<LLMApiKeySettingsTableRow>,
  "data" | "loadingRowCount" | "noResultsMessage"
> & {
  createAction: { hasAccess: boolean; onClick: () => void };
  deleteAction: {
    hasAccess: boolean;
    onClick: (apiKey: LLMApiKeySettingsTableRow) => void;
  };
  updateAction: {
    hasAccess: boolean;
    onClick: (apiKey: LLMApiKeySettingsTableRow) => void;
  };
}) {
  const showExtraHeaderKeys =
    tableProps.data.status === "success" &&
    tableProps.data.data.some((apiKey) => apiKey.extraHeaderKeys.length > 0);

  const columns = useMemo<LangfuseColumnDef<LLMApiKeySettingsTableRow>[]>(
    () => [
      createTextTableColumn<LLMApiKeySettingsTableRow>({
        accessorKey: "provider",
        header: "Provider",
        enableResizing: false,
      }),
      createBadgeTableColumn<LLMApiKeySettingsTableRow>({
        accessorKey: "adapter",
        header: "Adapter",
        enableResizing: false,
      }),
      createTextTableColumn<LLMApiKeySettingsTableRow>({
        accessorKey: "baseURL",
        header: "Base URL",
        nullValue: "default",
        enableResizing: false,
      }),
      createTextTableColumn<LLMApiKeySettingsTableRow>({
        accessorKey: "displaySecretKey",
        header: "API Key",
        enableResizing: false,
      }),
      ...(showExtraHeaderKeys
        ? [
            createTextTableColumn<LLMApiKeySettingsTableRow, string[]>({
              accessorKey: "extraHeaderKeys",
              header: "Extra headers",
              mapValue: (value) => value?.join(", "),
              enableResizing: false,
            }),
          ]
        : []),
    ],
    [showExtraHeaderKeys],
  );

  const actions = useCallback<
    NonNullable<TableProps<LLMApiKeySettingsTableRow>["actions"]>
  >(
    (apiKey) => [
      {
        id: "edit",
        type: "item",
        title: "Edit connection",
        icon: Pencil,
        disabled: updateAction.hasAccess
          ? undefined
          : { reason: "You do not have permission to edit this connection" },
        onClick: () => updateAction.onClick(apiKey),
      },
      {
        id: "delete",
        type: "item",
        title: "Delete connection",
        icon: Trash,
        variant: "destructive",
        disabled: deleteAction.hasAccess
          ? undefined
          : { reason: "You do not have permission to delete this connection" },
        onClick: () => deleteAction.onClick(apiKey),
      },
    ],
    [deleteAction, updateAction],
  );

  const toolbarActions: SettingsTableProps<LLMApiKeySettingsTableRow>["toolbarActions"] =
    createAction.hasAccess
      ? [
          {
            id: "add-connection",
            label: "Add LLM Connection",
            variant: "secondary",
            icon: <PlusIcon className="size-4" aria-hidden="true" />,
            onClick: createAction.onClick,
          },
        ]
      : undefined;

  return (
    <SettingsTable
      tableName="LLM connections"
      columns={columns}
      actions={actions}
      toolbarActions={toolbarActions}
      onRowClick={updateAction.hasAccess ? updateAction.onClick : undefined}
      {...tableProps}
    />
  );
}
