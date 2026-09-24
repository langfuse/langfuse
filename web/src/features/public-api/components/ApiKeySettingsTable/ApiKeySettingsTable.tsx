import { useCallback, useMemo } from "react";
import { Pencil, Trash } from "lucide-react";

import { type TableProps } from "@/src/components/design-system/table/Table";
import { createDateTableColumn } from "@/src/components/design-system/table/columns/createDateTableColumn";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import { createUserTableColumn } from "@/src/components/design-system/table/columns/createUserTableColumn";
import { SettingsTable } from "@/src/components/SettingsTable/SettingsTable";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { type RouterOutput } from "@/src/utils/types";

export type ApiKeySettingsTableRow =
  | RouterOutput["projectApiKeys"]["byProjectId"][number]
  | RouterOutput["organizationApiKeys"]["byOrganizationId"][number];

export function ApiKeySettingsTable({
  editNoteAction,
  hasWriteAccess,
  onDelete,
  ...tableProps
}: Pick<
  TableProps<ApiKeySettingsTableRow>,
  "data" | "loadingRowCount" | "noResultsMessage"
> & {
  editNoteAction: {
    hasAccess: boolean;
    onClick: (apiKey: ApiKeySettingsTableRow) => void;
  };
  hasWriteAccess: boolean;
  onDelete: (apiKey: ApiKeySettingsTableRow) => void;
}) {
  const columns = useMemo<LangfuseColumnDef<ApiKeySettingsTableRow>[]>(
    () => [
      createDateTableColumn<ApiKeySettingsTableRow>({
        accessorKey: "createdAt",
        header: "Created",
        hideBelowMd: true,
        enableResizing: false,
      }),
      createUserTableColumn<ApiKeySettingsTableRow>({
        accessorKey: "createdByUser",
        header: "Created By",
        variant: "avatar",
        nullValue: "—",
        hideBelowMd: true,
        enableResizing: false,
        getUser: (user, { row }) => {
          if (user?.name || user?.email) return { type: "user", user };
          if (user) {
            return {
              type: "user",
              user: { name: "Unknown user", image: user.image },
            };
          }
          if (row.original.createdByApiKey) {
            return {
              type: "user",
              user: { name: row.original.createdByApiKey.publicKey },
            };
          }
          return undefined;
        },
      }),
      createTextTableColumn<ApiKeySettingsTableRow>({
        id: "note",
        accessorFn: (apiKey) => apiKey.note || null,
        header: "Note",
        enableResizing: false,
        nullValue: "—",
        trailingAction: editNoteAction.hasAccess
          ? {
              type: "custom",
              icon: Pencil,
              label: "Edit note",
              onClick: ({ row }) => editNoteAction.onClick(row.original),
            }
          : undefined,
      }),
      createTextTableColumn<ApiKeySettingsTableRow>({
        accessorKey: "publicKey",
        header: "Public Key",
        trailingAction: { type: "copy-to-clipboard" },
        enableResizing: false,
      }),
      createTextTableColumn<ApiKeySettingsTableRow>({
        accessorKey: "displaySecretKey",
        header: "Secret Key",
        enableResizing: false,
      }),
    ],
    [editNoteAction],
  );

  const actions = useCallback<
    NonNullable<TableProps<ApiKeySettingsTableRow>["actions"]>
  >(
    (apiKey) => [
      {
        id: "delete",
        type: "item",
        title: "Delete API key",
        icon: Trash,
        variant: "destructive",
        disabled: hasWriteAccess
          ? undefined
          : { reason: "You do not have permission to delete this API key" },
        onClick: () => onDelete(apiKey),
      },
    ],
    [hasWriteAccess, onDelete],
  );

  return (
    <SettingsTable
      tableName="API keys"
      columns={columns}
      actions={actions}
      {...tableProps}
    />
  );
}
