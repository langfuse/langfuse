/* eslint-disable react/no-unstable-nested-components */
import { useMemo } from "react";
import { ListTree, Pencil, RefreshCw, Trash2 } from "@langfuse/icons";

import { SettingsTable } from "@/src/components/SettingsTable/SettingsTable";
import { Tooltip } from "@/src/components/design-system/Tooltip/Tooltip";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import type { LangfuseColumnDef } from "@/src/components/table/types";
import { StatusBadge } from "@/src/components/ui/StatusBadge/StatusBadge";
import { GatewayProvidersEmptyState } from "@/src/features/ai-gateway/components/GatewaySetupPage/components/GatewayCredentialsOverview/components/GatewayProvidersTable/components/GatewayProvidersEmptyState/GatewayProvidersEmptyState";
import { GatewayProviderMark } from "@/src/features/ai-gateway/components/GatewayProviderMark";
import { providerLabels } from "@/src/features/ai-gateway/constants/providerLabels";
import type {
  GatewayConnection,
  GatewayProvider,
} from "@/src/features/ai-gateway/types/gatewayProvider";

export type GatewayProvidersTableProps = {
  connections: GatewayConnection[];
  modelCounts: Record<string, { enabled: number; total: number } | "loading">;
  onSelect: (connection: GatewayConnection) => void;
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

/** Model discovery marks a connection as errored only when the provider rejects its credential. */
const connectionErrorReason =
  "The provider rejected this credential. Update the credential or retry validation.";

export function GatewayProvidersTable({
  connections,
  modelCounts,
  onSelect,
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
      {
        accessorKey: "status",
        header: "Status",
        size: 110,
        cell: ({ row }) => <ConnectionStatus status={row.original.status} />,
      },
      {
        accessorKey: "id",
        id: "models",
        header: "Models",
        size: 180,
        cell: ({ row }) =>
          row.original.status === "ERROR" ? (
            <span className="text-destructive">Credential rejected</span>
          ) : (
            <ModelCount value={modelCounts[row.original.id]} />
          ),
      },
    ],
    [modelCounts],
  );

  return (
    <SettingsTable
      tableName="gateway-provider-credentials"
      columns={columns}
      actions={(connection) => [
        {
          id: "models",
          type: "item",
          title: "Show models",
          icon: ListTree,
          onClick: () => onSelect(connection),
        },
        {
          id: "retry",
          type: "item",
          title: "Retry validation",
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
      onRowClick={onSelect}
      noResultsMessage="No provider credentials configured."
      emptyState={<GatewayProvidersEmptyState />}
    />
  );
}

function ConnectionStatus({ status }: { status: GatewayConnection["status"] }) {
  const badge = <StatusBadge type={connectionStatus[status]} isLive={false} />;
  if (status !== "ERROR") return badge;
  return (
    <Tooltip label={connectionErrorReason}>
      {({ getTriggerProps }) => (
        <span
          {...getTriggerProps()}
          tabIndex={0}
          className="focus-visible:ring-ring inline-flex rounded-sm focus-visible:ring-2 focus-visible:outline-hidden"
        >
          {badge}
        </span>
      )}
    </Tooltip>
  );
}

function ModelCount({
  value,
}: {
  value: { enabled: number; total: number } | "loading" | undefined;
}) {
  if (value === "loading") return <>Loading…</>;
  if (value === undefined) return <>—</>;
  return (
    <>
      {value.enabled} of {value.total} enabled
    </>
  );
}

function ProviderName({ provider }: { provider: GatewayProvider }) {
  return (
    <div className="flex items-center gap-2">
      <GatewayProviderMark provider={provider} />
      <span>{providerLabels[provider]}</span>
    </div>
  );
}
