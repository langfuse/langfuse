import { Plus, Trash, UserPlus } from "@langfuse/icons";

import { SettingsTable } from "@/src/components/SettingsTable/SettingsTable";
import type { PaginationBarProps } from "@/src/components/design-system/PaginationBar/PaginationBar";
import { createDateTableColumn } from "@/src/components/design-system/table/columns/createDateTableColumn";
import { createBadgeListTableColumn } from "@/src/components/design-system/table/columns/createBadgeListTableColumn";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import { createUserTableColumn } from "@/src/components/design-system/table/columns/createUserTableColumn";
import type { AsyncTableData } from "@/src/components/design-system/table/Table";
import type { LangfuseColumnDef } from "@/src/components/table/types";
import { isApiKeyExpired } from "@/src/features/apiKey";
import { GatewayApiKeysEmptyState } from "@/src/features/ai-gateway/components/GatewayApiKeysPage/components/GatewayApiKeysTable/components/GatewayApiKeysEmptyState/GatewayApiKeysEmptyState";

type GatewayApiKey = {
  metadata: unknown;
  apiKey: {
    id: string;
    publicKey: string;
    displaySecretKey: string;
    note: string | null;
    createdAt: Date;
    expiresAt: Date | null;
    user: {
      name: string | null;
      email: string | null;
      image: string | null;
    } | null;
  };
};

export function GatewayApiKeysTable({
  data,
  createAction,
  inviteAction,
  onRevoke,
  pagination,
  search,
}: {
  data: AsyncTableData<GatewayApiKey[]>;
  createAction: () => void;
  /** Omit for callers who cannot invite people to the organization. */
  inviteAction?: () => void;
  onRevoke: (apiKeyId: string) => void;
  pagination: PaginationBarProps;
  search: { value: string; onChange: (value: string) => void };
}) {
  const hasSearch = search.value.trim().length > 0;
  /** An out-of-range page is also empty; it keeps the table so its pagination can page back. */
  const hasNoKeys = !hasSearch && pagination.totalCount === 0;
  const columns: LangfuseColumnDef<GatewayApiKey>[] = [
    createDateTableColumn<GatewayApiKey>({
      accessorFn: (row) => row.apiKey.createdAt,
      id: "createdAt",
      header: "Created",
      enableResizing: false,
    }),
    createTextTableColumn<GatewayApiKey>({
      accessorFn: (row) => row.apiKey.displaySecretKey,
      id: "key",
      header: "Key",
      sensitive: true,
      enableResizing: false,
    }),
    createTextTableColumn<GatewayApiKey>({
      accessorFn: (row) => row.apiKey.note,
      id: "description",
      header: "Description",
      nullValue: "-",
      enableResizing: false,
    }),
    createUserTableColumn<GatewayApiKey>({
      accessorFn: (row) => row.apiKey.user,
      id: "user",
      header: "User",
      variant: "avatar",
      nullValue: "Service account",
      hideBelowMd: true,
      enableResizing: false,
    }),
    createDateTableColumn<GatewayApiKey>({
      accessorFn: (row) => row.apiKey.expiresAt,
      id: "expiresAt",
      header: "Expiration",
      hideBelowMd: true,
      enableResizing: false,
      emptyValue: "No expiration",
      getPrefix: (expiresAt) =>
        isApiKeyExpired(expiresAt) ? "Expired on " : null,
    }),
    createBadgeListTableColumn<GatewayApiKey>({
      accessorFn: (row) => getMetadataEntries(row.metadata),
      id: "metadata",
      header: "Metadata",
      sensitive: true,
      enableResizing: false,
    }),
  ];

  return (
    <SettingsTable
      tableName="gatewayApiKeys"
      columns={columns}
      data={data}
      actions={(row) => [
        {
          id: "revoke",
          type: "item",
          title: "Revoke key",
          icon: Trash,
          variant: "destructive",
          onClick: () => onRevoke(row.apiKey.id),
        },
      ]}
      pagination={pagination}
      search={{ ...search, placeholder: "Search by name or user" }}
      toolbarActions={[
        ...(inviteAction
          ? [
              {
                id: "invite",
                label: "Notify team",
                variant: "outline" as const,
                icon: <UserPlus size="base" aria-hidden="true" />,
                onClick: inviteAction,
              },
            ]
          : []),
        {
          id: "create-key",
          label: "Create key",
          icon: <Plus size="base" aria-hidden="true" />,
          onClick: createAction,
        },
      ]}
      noResultsMessage={
        hasSearch
          ? "No gateway API keys match the current search."
          : "No gateway API keys created."
      }
      emptyState={hasNoKeys ? <GatewayApiKeysEmptyState /> : undefined}
    />
  );
}

function getMetadataEntries(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value).flatMap(([key, item]) =>
    item === null ||
    typeof item === "string" ||
    typeof item === "number" ||
    typeof item === "boolean"
      ? [`${key}: ${String(item)}`]
      : [],
  );
}
