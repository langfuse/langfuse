import { useCallback, useMemo } from "react";
import { Pencil, Trash } from "@langfuse/icons";

import { type TableProps } from "@/src/components/design-system/table/Table";
import { createDateTableColumn } from "@/src/components/design-system/table/columns/createDateTableColumn";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import { createUserTableColumn } from "@/src/components/design-system/table/columns/createUserTableColumn";
import {
  SettingsTable,
  type SettingsTableProps,
} from "@/src/components/SettingsTable/SettingsTable";
import { type LangfuseColumnDef } from "@/src/components/table/types";
import { isApiKeyExpired } from "@/src/features/apiKey";
import { type RouterOutput } from "@/src/utils/types";

const EXCLUDE_GATEWAY_KEYS = "exclude-gateway";
const ALL_KEYS = "all";

const GATEWAY_KEY_FILTER_OPTIONS = [
  { value: EXCLUDE_GATEWAY_KEYS, label: "Exclude gateway keys" },
  { value: ALL_KEYS, label: "All API keys" },
];

export type ApiKeySettingsTableRow =
  | RouterOutput["projectApiKeys"]["byProjectId"][number]
  | RouterOutput["organizationApiKeys"]["byOrganizationId"][number];

export function ApiKeySettingsTable({
  editNameAction,
  hasWriteAccess,
  onDelete,
  search,
  gatewayKeyFilter,
  ...tableProps
}: ApiKeySettingsTableProps) {
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
      createDateTableColumn<ApiKeySettingsTableRow>({
        accessorKey: "expiresAt",
        header: "Expiration",
        hideBelowMd: true,
        enableResizing: false,
        emptyValue: "No expiration",
        getPrefix: (expiresAt) =>
          isApiKeyExpired(expiresAt) ? "Expired on " : null,
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
      search={{ ...search, placeholder: "Search by name" }}
      filters={
        gatewayKeyFilter
          ? [toGatewayKeySettingsFilter(gatewayKeyFilter)]
          : undefined
      }
      {...tableProps}
    />
  );
}

function toGatewayKeySettingsFilter({
  includeGatewayKeys,
  onIncludeGatewayKeysChange,
}: GatewayKeyFilter): SettingsTableFilter {
  return {
    type: "select",
    id: "gatewayKeys",
    label: "Gateway keys",
    placeholder: "Exclude gateway keys",
    options: GATEWAY_KEY_FILTER_OPTIONS,
    value: includeGatewayKeys ? ALL_KEYS : EXCLUDE_GATEWAY_KEYS,
    onChange: (value) => onIncludeGatewayKeysChange(value === ALL_KEYS),
    muted: !includeGatewayKeys,
  };
}

type ApiKeySettingsTableProps = Pick<
  TableProps<ApiKeySettingsTableRow>,
  "data" | "loadingRowCount" | "noResultsMessage"
> & {
  editNameAction: {
    hasAccess: boolean;
    onClick: (apiKey: ApiKeySettingsTableRow) => void;
  };
  hasWriteAccess: boolean;
  onDelete: (apiKey: ApiKeySettingsTableRow) => void;
  search: { value: string; onChange: (value: string) => void };
  gatewayKeyFilter?: GatewayKeyFilter;
};

type GatewayKeyFilter = {
  includeGatewayKeys: boolean;
  onIncludeGatewayKeysChange: (includeGatewayKeys: boolean) => void;
};

type SettingsTableFilter = NonNullable<
  SettingsTableProps<ApiKeySettingsTableRow>["filters"]
>[number];
