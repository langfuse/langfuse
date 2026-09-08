import type { ReactNode } from "react";

import Header from "@/src/components/layouts/header";
import { SettingsTableCard } from "@/src/components/layouts/settings-table-card";
import { DataTable } from "@/src/components/table/data-table";
import type { LangfuseColumnDef } from "@/src/components/table/types";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { SingleLineOverflowList } from "@/src/components/SingleLineOverflowList";
import { Button } from "@/src/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";

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
      accessorKey: "apiKey.displaySecretKey",
      id: "key",
      header: "Key",
      cell: ({ row }) => (
        <div className="ph-no-capture font-mono">
          {row.original.apiKey.displaySecretKey}
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
      cell: ({ row }) => <MetadataCell metadata={row.original.metadata} />,
    },
    {
      accessorKey: "apiKey.id",
      id: "actions",
      header: "Actions",
      cell: ({ row }) => renderRevokeAction(row.original.apiKey.id),
      size: 100,
      isFixedPosition: true,
      enableSorting: false,
      enableResizing: false,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Header title="Gateway API keys" actionButtons={createAction} />
      <p className="text-muted-foreground text-sm">
        These organization keys authenticate requests to the AI Gateway only.
      </p>
      <SettingsTableCard>
        <DataTable
          tableName="gatewayApiKeys"
          columns={columns}
          data={{ isLoading: false, isError: false, data: apiKeys }}
          noResultsMessage="No gateway API keys created."
          getRowClassName={() => "h-9"}
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

function MetadataCell({ metadata }: { metadata: unknown }) {
  const entries = getMetadataEntries(metadata);

  if (entries.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }

  // Rendered without a wrapper element: the list measures against its own
  // width, so it has to stretch inside the table cell's flex row rather than
  // shrink to the width of the badges it is measuring.
  return (
    <SingleLineOverflowList
      items={entries}
      additionalOverflowCount={0}
      getKey={([key]) => key}
      renderItem={([key, value]) => (
        <span className="ph-no-capture inline-flex min-w-0">
          <Badge size="sm" text={`${key}: ${value}`} />
        </span>
      )}
      renderOverflow={({ hiddenItems, overflowItemCount }) => (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex" tabIndex={0}>
              <Badge size="sm" text={`+${overflowItemCount}`} />
            </span>
          </TooltipTrigger>
          <TooltipContent className="ph-no-capture max-w-xs">
            {hiddenItems.map(([key, value]) => `${key}: ${value}`).join(", ")}
          </TooltipContent>
        </Tooltip>
      )}
    />
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
