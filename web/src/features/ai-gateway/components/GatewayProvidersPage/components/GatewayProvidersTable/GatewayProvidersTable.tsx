/* eslint-disable no-nested-ternary */
import { useMemo } from "react";
import { Pencil, RefreshCw, Route, Trash2 } from "lucide-react";
import Link from "next/link";
import { SiAnthropic, SiOpenai } from "react-icons/si";

import { SettingsTable } from "@/src/components/SettingsTable/SettingsTable";
import { createStatusTableColumn } from "@/src/components/design-system/table/columns/createStatusTableColumn";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import type { LangfuseColumnDef } from "@/src/components/table/types";
import { providerLabels } from "@/src/features/ai-gateway/constants/providerLabels";
import type {
  GatewayConnection,
  GatewayProvider,
} from "@/src/features/ai-gateway/types/gatewayProvider";

export type GatewayProvidersTableProps = {
  connections: GatewayConnection[];
  modelCounts: Record<string, number | "loading">;
  getModelsUrl: (connection: GatewayConnection) => string;
  onRetry: (connection: GatewayConnection) => void;
  onEdit: (connection: GatewayConnection) => void;
  onDelete: (connection: GatewayConnection) => void;
  retryDisabled?: { reason: string };
  editDisabled?: { reason: string };
  deleteDisabled?: { reason: string };
};

const connectionStatus = {
  ENABLED: "active",
  ERROR: "error",
  DISABLED: "disabled",
} as const satisfies Record<GatewayConnection["status"], string>;

export function GatewayProvidersTable({
  connections,
  modelCounts,
  getModelsUrl,
  onRetry,
  onEdit,
  onDelete,
  retryDisabled,
  editDisabled,
  deleteDisabled,
}: GatewayProvidersTableProps) {
  const columns = useMemo<LangfuseColumnDef<GatewayConnection>[]>(
    () => [
      createTextTableColumn<GatewayConnection>({
        accessorKey: "name",
        header: "Name",
        size: 180,
      }),
      {
        accessorKey: "provider",
        header: "Provider",
        size: 170,
        cell: ({ row }) => <ProviderName provider={row.original.provider} />,
      },
      createTextTableColumn<GatewayConnection>({
        accessorKey: "displaySecret",
        header: "Credential",
        size: 180,
        sensitive: true,
      }),
      createStatusTableColumn<GatewayConnection, GatewayConnection["status"]>({
        accessorKey: "status",
        header: "Status",
        size: 110,
        getStatus: (status) => (status ? connectionStatus[status] : undefined),
        isLive: false,
      }),
      {
        accessorKey: "id",
        id: "models",
        header: "Models",
        size: 180,
        cell: ({ row }) => (
          <ModelCount
            value={modelCounts[row.original.id]}
            href={getModelsUrl(row.original)}
          />
        ),
      },
    ],
    [getModelsUrl, modelCounts],
  );

  return (
    <SettingsTable
      tableName="gateway-provider-credentials"
      columns={columns}
      actions={(connection) => [
        {
          id: "retry",
          type: "item",
          title: "Retry provider validation",
          icon: RefreshCw,
          disabled: retryDisabled,
          onClick: () => onRetry(connection),
        },
        {
          id: "edit",
          type: "item",
          title: "Edit credential",
          icon: Pencil,
          disabled: editDisabled,
          onClick: () => onEdit(connection),
        },
        {
          id: "delete",
          type: "item",
          title: "Delete credential",
          icon: Trash2,
          variant: "destructive",
          disabled: deleteDisabled,
          onClick: () => onDelete(connection),
        },
      ]}
      data={{ status: "success", data: connections }}
      noResultsMessage="No provider credentials configured."
    />
  );
}

function ModelCount({
  value,
  href,
}: {
  value: number | "loading" | undefined;
  href: string;
}) {
  if (value === "loading") return <>Loading…</>;
  if (value === undefined) return <>—</>;
  return (
    <Link className="text-primary hover:underline" href={href}>
      {value} {value === 1 ? "model" : "models"} available
    </Link>
  );
}

function ProviderName({ provider }: { provider: GatewayProvider }) {
  const icon =
    provider === "OPENAI" ? (
      <SiOpenai className="icon-base" aria-hidden="true" />
    ) : provider === "ANTHROPIC" ? (
      <SiAnthropic className="icon-base" aria-hidden="true" />
    ) : (
      <Route className="icon-base" aria-hidden="true" />
    );

  return (
    <div className="flex items-center gap-2">
      <span className="bg-muted flex size-7 items-center justify-center rounded-md border">
        {icon}
      </span>
      <span>{providerLabels[provider]}</span>
    </div>
  );
}
