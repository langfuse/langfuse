/* eslint-disable react/no-unstable-nested-components */
import { useMemo } from "react";
import { ListTree, Pencil, RefreshCw, Trash2 } from "@langfuse/icons";

import { SettingsTable } from "@/src/components/SettingsTable/SettingsTable";
import { createStatusTableColumn } from "@/src/components/design-system/table/columns/createStatusTableColumn";
import { createTextTableColumn } from "@/src/components/design-system/table/columns/createTextTableColumn";
import type { LangfuseColumnDef } from "@/src/components/table/types";
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
        cell: ({ row }) => <ModelCount value={modelCounts[row.original.id]} />,
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
      onRowClick={onSelect}
      noResultsMessage="No provider credentials configured."
      emptyState={<GatewayProvidersEmptyState />}
    />
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
