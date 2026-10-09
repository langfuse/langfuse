import { Plus, Trash } from "lucide-react";

import { SettingsTable } from "@/src/components/SettingsTable/SettingsTable";
import type { PaginationBarProps } from "@/src/components/design-system/PaginationBar/PaginationBar";
import { createDateTableColumn } from "@/src/components/design-system/table/columns/createDateTableColumn";
import { createBadgeListTableColumn } from "@/src/components/design-system/table/columns/createBadgeListTableColumn";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import { createTableColumn } from "@/src/components/design-system/table/columns/utils/createTableColumn";
import type { AsyncTableData } from "@/src/components/design-system/table/Table";
import type { LangfuseColumnDef } from "@/src/components/table/types";
import { Skeleton } from "@/src/components/ui/skeleton";
import { isApiKeyExpired } from "@/src/features/apiKey/helpers/isApiKeyExpired";
import { buildLocalIsoDatePresentation } from "@/src/utils/dates";

type GatewayApiKey = {
  metadata: unknown;
  apiKey: {
    id: string;
    publicKey: string;
    displaySecretKey: string;
    note: string | null;
    createdAt: Date;
    expiresAt: Date | null;
  };
};

export function GatewayApiKeysTable({
  data,
  createAction,
  onRevoke,
  pagination,
}: {
  data: AsyncTableData<GatewayApiKey[]>;
  createAction: () => void;
  onRevoke: (apiKeyId: string) => void;
  pagination: PaginationBarProps;
}) {
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
    createTableColumn<GatewayApiKey, Date>({
      accessorFn: (row) => row.apiKey.expiresAt,
      id: "expiresAt",
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
      toolbarActions={[
        {
          id: "create-key",
          label: "Create key",
          icon: <Plus className="icon-base" aria-hidden="true" />,
          onClick: createAction,
        },
      ]}
      noResultsMessage="No gateway API keys created."
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
