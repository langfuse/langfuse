import { useCallback, useMemo } from "react";
import { Pencil, Trash } from "lucide-react";

import { type TableProps } from "@/src/components/design-system/table/Table";
import { createDateTableColumn } from "@/src/components/design-system/table/columns/createDateTableColumn";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import { createUserTableColumn } from "@/src/components/design-system/table/columns/createUserTableColumn";
import { createTableColumn } from "@/src/components/design-system/table/columns/utils/createTableColumn";
import { SettingsTable } from "@/src/components/SettingsTable/SettingsTable";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { Skeleton } from "@/src/components/ui/skeleton";
import { isApiKeyExpired } from "@/src/features/apiKey/helpers/isApiKeyExpired";
import { buildLocalIsoDatePresentation } from "@/src/utils/dates";
import { type RouterOutput } from "@/src/utils/types";

export type ApiKeySettingsTableRow =
  | RouterOutput["projectApiKeys"]["byProjectId"][number]
  | RouterOutput["organizationApiKeys"]["byOrganizationId"][number];

export function ApiKeySettingsTable({
  editNameAction,
  hasWriteAccess,
  onDelete,
  ...tableProps
}: Pick<
  TableProps<ApiKeySettingsTableRow>,
  "data" | "loadingRowCount" | "noResultsMessage"
> & {
  editNameAction: {
    hasAccess: boolean;
    onClick: (apiKey: ApiKeySettingsTableRow) => void;
  };
  hasWriteAccess: boolean;
  onDelete: (apiKey: ApiKeySettingsTableRow) => void;
}) {
  const columns = useMemo<LangfuseColumnDef<ApiKeySettingsTableRow>[]>(
    () => [
      createTextTableColumn<ApiKeySettingsTableRow>({
        id: "note",
        accessorFn: (apiKey) => apiKey.note || null,
        header: "Name",
        enableResizing: false,
        nullValue: "—",
        trailingAction: editNameAction.hasAccess
          ? {
              type: "custom",
              icon: Pencil,
              label: "Edit name",
              onClick: ({ row }) => editNameAction.onClick(row.original),
            }
          : undefined,
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
      createTableColumn<ApiKeySettingsTableRow, Date>({
        accessorKey: "expiresAt",
        header: "Expiration",
        hideBelowMd: true,
        enableResizing: false,
        loadingCell: <Skeleton className="h-4 w-1/2" />,
        renderCell: (expiresAt) => {
          if (!expiresAt) {
            return <span className="text-muted-foreground">No expiration</span>;
          }
          const date = buildLocalIsoDatePresentation({ date: expiresAt });
          if (!date) return null;

          return (
            <span className="block w-full truncate" title={date.title}>
              {isApiKeyExpired(expiresAt) ? "Expired on " : ""}
              {date.display}
            </span>
          );
        },
      }),
      createDateTableColumn<ApiKeySettingsTableRow>({
        accessorKey: "createdAt",
        header: "Created",
        hideBelowMd: true,
        enableResizing: false,
      }),
    ],
    [editNameAction],
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
      columnOrderKey="apiKeysColumnOrder-v2"
      columns={columns}
      actions={actions}
      {...tableProps}
    />
  );
}
