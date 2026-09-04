import type { ReactNode } from "react";

import Header from "@/src/components/layouts/header";
import { SettingsTableCard } from "@/src/components/layouts/settings-table-card";
import { DataTable } from "@/src/components/table/data-table";
import type { LangfuseColumnDef } from "@/src/components/table/types";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";

type GatewayApiKey = {
  metadata: unknown;
  apiKey: {
    id: string;
    publicKey: string;
    displaySecretKey: string;
    note: string | null;
    createdAt: Date;
  };
};

export function GatewayApiKeysView({
  apiKeys,
  createAction,
  renderRevokeAction,
  hasMore,
  isLoadingMore,
  onLoadMore,
}: {
  apiKeys: GatewayApiKey[];
  createAction: ReactNode;
  renderRevokeAction: (apiKeyId: string) => ReactNode;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => unknown;
}) {
  const columns: LangfuseColumnDef<GatewayApiKey>[] = [
    {
      accessorKey: "apiKey.createdAt",
      id: "createdAt",
      header: "Created",
      cell: ({ row }) => row.original.apiKey.createdAt.toLocaleDateString(),
      size: 120,
    },
    {
      accessorKey: "apiKey.publicKey",
      id: "key",
      header: "Key",
      cell: ({ row }) => (
        <div className="ph-no-capture font-mono">
          <div>{row.original.apiKey.publicKey}</div>
          <div className="text-muted-foreground">
            {row.original.apiKey.displaySecretKey}
          </div>
        </div>
      ),
    },
    {
      accessorKey: "apiKey.note",
      id: "description",
      header: "Description",
      cell: ({ row }) => row.original.apiKey.note || "—",
    },
    {
      accessorKey: "metadata",
      header: "Metadata",
      cell: ({ row }) => {
        const metadata = getMetadataEntries(row.original.metadata);
        return metadata.length > 0 ? (
          <div className="ph-no-capture flex flex-wrap gap-1">
            {metadata.map(([key, value]) => (
              <Badge key={key} variant="outline-solid">
                {key}: {value}
              </Badge>
            ))}
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        );
      },
    },
    {
      accessorKey: "apiKey.id",
      id: "actions",
      header: "",
      cell: ({ row }) => renderRevokeAction(row.original.apiKey.id),
      size: 60,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Header title="Gateway API keys" actionButtons={createAction} />
      <p className="text-muted-foreground text-sm">
        These organization keys authenticate requests to the LLM Gateway only.
      </p>
      <SettingsTableCard>
        <DataTable
          tableName="gatewayApiKeys"
          columns={columns}
          data={{ isLoading: false, isError: false, data: apiKeys }}
          noResultsMessage="No gateway API keys created."
          cellPadding="comfortable"
        />
      </SettingsTableCard>
      {hasMore ? (
        <Button
          className="self-center"
          variant="secondary"
          loading={isLoadingMore}
          disabled={isLoadingMore}
          aria-label="Load more"
          onClick={() => {
            onLoadMore();
          }}
        >
          Load more
        </Button>
      ) : null}
    </div>
  );
}

function getMetadataEntries(value: unknown): Array<[string, string]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value).flatMap(([key, item]) =>
    item === null ||
    typeof item === "string" ||
    typeof item === "number" ||
    typeof item === "boolean"
      ? [[key, String(item)]]
      : [],
  );
}
